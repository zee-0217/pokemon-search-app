import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { habitats, recommend, pokemon } from './pokemon.js';
import { findLandmark } from './locations.js';
import { createPokedex } from './pokedex.js';
import { findPokemon, destinationsFor } from './destinations.js';

const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function fetchJson(url, fetcher) {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error('Invalid upstream response');
    return data;
  } catch {
    throw new ApiError(502, url.hostname === 'pokeapi.co' ? '도감 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' : '외부 지역·날씨 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
export function createServer({ fetcher = fetch } = {}) {
  const weatherCache = new Map();
  const getPokedex = createPokedex(url => fetchJson(url, fetcher));
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'GET 요청만 지원합니다.' }); }
      if (url.pathname === '/api/pokemon-catalog') return json(res, 200, pokemon.map(p => ({ id: p.id, name: p.name })));
      if (url.pathname === '/api/destinations') {
        const name = (url.searchParams.get('name') || '').trim();
        if (name.length < 1 || name.length > 40) throw new ApiError(400, '포켓몬 이름을 1~40자로 입력해 주세요.');
        const p = findPokemon(name);
        if (!p) throw new ApiError(404, '등록된 포켓몬을 찾지 못했습니다. 검색창의 이름 목록에서 선택해 주세요.');
        return json(res, 200, destinationsFor(p));
      }
      if (url.pathname.startsWith('/api/pokemon/')) {
        const rawId = url.pathname.slice('/api/pokemon/'.length);
        if (!/^\d+$/.test(rawId)) throw new ApiError(400, '올바른 도감 번호를 입력해 주세요.');
        let data;
        try { data = await getPokedex(Number(rawId)); }
        catch (error) { throw new ApiError(502, error.status ? error.message : '도감 데이터가 불완전합니다. 잠시 후 다시 시도해 주세요.'); }
        if (!data) throw new ApiError(404, '지원하지 않는 포켓몬입니다.');
        return json(res, 200, data);
      }
      if (url.pathname === '/api/encounters') {
        const query = (url.searchParams.get('region') || '').trim();
        const requestedHabitat = url.searchParams.get('habitat') || 'auto';
        if (query.length < 2 || query.length > 100) throw new ApiError(400, '지역 이름을 2~100자로 입력해 주세요.');
        if (requestedHabitat !== 'auto' && !Object.hasOwn(habitats, requestedHabitat)) throw new ApiError(400, '올바른 서식 환경을 선택해 주세요.');
        let location = findLandmark(query);
        const known = Boolean(location);
        if (!location) {
          const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
          geoUrl.search = new URLSearchParams({ name: query, count: '5', language: 'ko', format: 'json' });
          const geo = await fetchJson(geoUrl, fetcher);
          if (!geo.results?.length) throw new ApiError(404, '지역을 찾지 못했습니다. 도시 이름(예: 서울, 부산, Tokyo) 또는 지원 명소를 입력해 주세요.');
          location = geo.results[0];
        }
        if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) throw new ApiError(502, '지역 좌표를 확인하지 못했습니다.');
        const habitat = requestedHabitat === 'auto' ? (location.habitat || 'city') : requestedHabitat;
        const key = `${location.latitude},${location.longitude}`;
        let weatherData = weatherCache.get(key);
        if (!weatherData || Date.now() - weatherData.fetchedAt > 300000) {
          const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
          weatherUrl.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), current: 'temperature_2m,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m', timezone: 'auto', forecast_days: '1' });
          const data = await fetchJson(weatherUrl, fetcher);
          const w = data.current;
          if (!w || !['temperature_2m', 'relative_humidity_2m', 'is_day', 'precipitation', 'weather_code', 'wind_speed_10m'].every(k => Number.isFinite(w[k])) || !w.time) throw new ApiError(502, '날씨 데이터가 불완전합니다. 잠시 후 다시 시도해 주세요.');
          weatherData = { current: w, timezone: data.timezone, fetchedAt: Date.now() };
          if (weatherCache.size >= 200) weatherCache.delete(weatherCache.keys().next().value);
          weatherCache.set(key, weatherData);
        }
        const recommendations = recommend(habitat, weatherData.current);
        const focusId = Number(url.searchParams.get('pokemon'));
        const focused = pokemon.find(p => p.id === focusId && p.homes.includes(habitat));
        if (focused && !recommendations.some(p => p.id === focusId)) {
          // Keep the chosen Pokémon visible even when six other candidates rank higher.
          const candidate = recommend(habitat, weatherData.current, { limit: pokemon.length }).find(p => p.id === focusId);
          recommendations.splice(5, 1, candidate);
        }
        return json(res, 200, { location: { name: location.name, latitude: location.latitude, longitude: location.longitude, admin1: location.admin1, country: location.country }, habitat, habitatName: habitats[habitat], habitatSource: requestedHabitat !== 'auto' ? '직접 선택한 환경' : known ? '명소에 미리 지정한 환경' : '일반 지역 기본값 · 도심 (환경을 직접 바꿀 수 있어요)', weather: weatherData.current, timezone: weatherData.timezone, fetchedAt: new Date(weatherData.fetchedAt).toISOString(), pokemon: recommendations });
      }
      const asset = files[url.pathname];
      if (!asset) return json(res, 404, { error: '페이지를 찾지 못했습니다.' });
      const body = await readFile(resolve(frontend, asset[0]));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : '서버 오류가 발생했습니다.' }); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, '127.0.0.1', () => console.log(`Pokémon Field Map: http://localhost:${port}`));
}
