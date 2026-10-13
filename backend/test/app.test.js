import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { recommend } from '../pokemon.js';

const current = { temperature_2m: 26, relative_humidity_2m: 60, precipitation: 0, is_day: 1, weather_code: 0, wind_speed_10m: 8, time: '2026-10-13T12:00' };
async function withServer(fetcher, callback) {
  const server = createServer({ fetcher });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const response = data => ({ ok: true, json: async () => data });
test('포켓몬별 장소 추천이 서식 환경을 반영하며 목록·이름 정규화·오류를 처리한다', async () => {
  await withServer(async () => { assert.fail('장소 추천은 외부 API 요청이 필요하지 않음'); }, async base => {
    const catalog = await (await fetch(`${base}/api/pokemon-catalog`)).json();
    assert.equal(catalog.length, 155);
    assert.equal(new Set(catalog.map(p => p.id)).size, catalog.length);
    for (let id = 1; id <= 151; id++) assert(catalog.some(p => p.id === id), `Missing Kanto #${id}`);
    const query = name => `${base}/api/destinations?${new URLSearchParams({ name })}`;
    const pika = await (await fetch(query(' 피 카 츄 '))).json();
    assert.equal(pika.pokemon.id, 25); assert(pika.locations.length > 0);
    assert(pika.locations.every(p => p.habitat === 'forest'));
    const turtle = await (await fetch(query('꼬부기'))).json();
    assert(turtle.locations.some(p => p.habitat === 'water'));
    assert(turtle.locations.some(p => p.habitat === 'coast'));
    assert(!turtle.locations.some(p => p.habitat === 'mountain'));
    const charizard = await (await fetch(query('리자몽'))).json();
    assert.equal(charizard.pokemon.id, 6); assert(charizard.locations.some(p => p.habitat === 'mountain'));
    assert.equal((await (await fetch(query('CHARIZARD'))).json()).pokemon.id, 6);
    assert.equal((await (await fetch(query('니드런 암컷'))).json()).pokemon.id, 29);
    for (const p of catalog) {
      const result = await fetch(query(p.name)); const data = await result.json();
      assert.equal(result.status, 200); assert(data.locations.length > 0, p.name);
    }
    assert.equal((await fetch(query('없는포켓몬'))).status, 404);
    assert.equal((await fetch(query(''))).status, 400);
    assert.equal((await fetch(query('가'.repeat(41)))).status, 400);
  });
});
test('추천 명소로 이동하면 선택한 포켓몬이 상위 6종 밖이어도 결과에 포함된다', async () => {
  await withServer(async () => response({ current, timezone: 'Asia/Seoul' }), async base => {
    const query = `${base}/api/encounters?${new URLSearchParams({ region: '서울숲', habitat: 'forest' })}`;
    const ordinary = await (await fetch(query)).json();
    assert(!ordinary.pokemon.some(p => p.id === 163));
    const targeted = await (await fetch(`${query}&pokemon=163`)).json();
    assert.equal(targeted.pokemon.length, 6);
    assert(targeted.pokemon.some(p => p.id === 163 && p.score === 60));
    const incompatible = await (await fetch(`${query}&pokemon=131`)).json();
    assert(!incompatible.pokemon.some(p => p.id === 131));
  });
});
const dexDetails = { id: 1, height: 7, weight: 69, abilities: [{ ability: { name: 'overgrow' }, is_hidden: false }], stats: [{ stat: { name: 'hp' }, base_stat: 45 }] };
const dexSpecies = { id: 1, names: [{ name: '이상해씨', language: { name: 'ko' } }], genera: [{ genus: '씨앗포켓몬', language: { name: 'ko' } }], flavor_text_entries: [{ flavor_text: 'English fallback.', language: { name: 'en' }, version: { name: 'red' } }, { flavor_text: '씨앗이\n자란다.', language: { name: 'ko' }, version: { name: 'sword' } }] };
test('도감 API가 한국어 설명·단위·능력치를 제공하고 중복 요청을 캐시한다', async () => {
  let calls = 0;
  await withServer(async url => {
    calls++; assert.equal(url.hostname, 'pokeapi.co');
    return response(url.pathname.includes('pokemon-species') ? dexSpecies : dexDetails);
  }, async base => {
    const [a, b] = await Promise.all([fetch(`${base}/api/pokemon/1`), fetch(`${base}/api/pokemon/1`)]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const data = await a.json();
    assert.equal(data.name, '이상해씨'); assert.equal(data.genus, '씨앗포켓몬');
    assert.equal(data.height, .7); assert.equal(data.weight, 6.9);
    assert.equal(data.description, '씨앗이 자란다.'); assert.equal(data.version, 'sword'); assert.equal(data.descriptionLanguage, 'ko');
    assert.equal(data.stats[0].value, 45); assert.equal(data.abilities[0].name, 'overgrow');
    await fetch(`${base}/api/pokemon/1`); assert.equal(calls, 2);
    assert.equal((await fetch(`${base}/api/pokemon/99999`)).status, 404);
    assert.equal((await fetch(`${base}/api/pokemon/invalid`)).status, 400);
    assert.equal(calls, 2);
  });
});
test('도감 API 실패 뒤 재시도하며 한국어 설명이 없으면 영문을 사용한다', async () => {
  let offline = true;
  await withServer(async url => {
    if (offline) throw new Error('offline');
    return response(url.pathname.includes('pokemon-species') ? { ...dexSpecies, flavor_text_entries: dexSpecies.flavor_text_entries.slice(0, 1) } : dexDetails);
  }, async base => {
    const failed = await fetch(`${base}/api/pokemon/1`);
    assert.equal(failed.status, 502); assert.match((await failed.json()).error, /도감/);
    offline = false;
    const data = await (await fetch(`${base}/api/pokemon/1`)).json();
    assert.equal(data.descriptionLanguage, 'en'); assert.equal(data.description, 'English fallback.');
  });
  await withServer(async () => response({ id: 1 }), async base => assert.equal((await fetch(`${base}/api/pokemon/1`)).status, 502));
});
test('서식 환경이 우선되고 햇빛·비·밤·추위가 추천 순위를 바꾼다', () => {
  const all = (habitat, weather) => recommend(habitat, weather, { limit: 1000 });
  const sunny = all('forest', current);
  assert(sunny.every(p => p.homes.includes('forest')));
  assert(sunny.find(p => p.id === 1).score > all('forest', { ...current, weather_code: 61, precipitation: 1 }).find(p => p.id === 1).score);
  const wet = all('water', { ...current, weather_code: 61, precipitation: 1 });
  const dry = all('water', current);
  const rainLovers = wet.filter(p => p.traits.includes('rain'));
  assert(rainLovers.length > 0);
  assert(rainLovers.every(p => p.score > dry.find(d => d.id === p.id).score));
  assert.equal(all('forest', { ...current, is_day: 0 }).find(p => p.id === 163).score, 75);
  assert.equal(sunny.find(p => p.id === 163).score, 60);
  const cold = all('mountain', { ...current, temperature_2m: -5, weather_code: 75 });
  assert(cold.find(p => p.id === 220).score > all('mountain', current).find(p => p.id === 220).score);
  assert(all('mountain', { ...current, weather_code: 61, precipitation: 1 }).find(p => p.id === 37).score < all('mountain', current).find(p => p.id === 37).score);
});
test('명소 좌표를 날씨 API에 전달하고 5분 캐시와 환경 선택을 지원한다', async () => {
  let calls = 0;
  await withServer(async url => { calls++; assert.equal(url.hostname, 'api.open-meteo.com'); assert.equal(url.searchParams.get('latitude'), '37.5445'); return response({ current, timezone: 'Asia/Seoul' }); }, async base => {
    const data = await (await fetch(`${base}/api/encounters?region=${encodeURIComponent('서울숲')}`)).json();
    assert.equal(data.location.name, '서울숲'); assert.equal(data.habitat, 'forest'); assert(data.pokemon.length >= 4);
    const override = await (await fetch(`${base}/api/encounters?region=${encodeURIComponent('서울숲')}&habitat=water`)).json();
    assert.equal(override.habitat, 'water'); assert.equal(calls, 1);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/backend/server.js`)).status, 404);
  });
});
test('도시 지오코딩, 기본 환경, 누락·잘못된 입력·외부 장애를 처리한다', async () => {
  await withServer(async url => response(url.hostname.startsWith('geocoding') ? { results: [{ name: 'Tokyo', latitude: 35.7, longitude: 139.7, country: 'Japan' }] } : { current, timezone: 'Asia/Tokyo' }), async base => {
    const data = await (await fetch(`${base}/api/encounters?region=Tokyo`)).json();
    assert.equal(data.location.name, 'Tokyo'); assert.equal(data.habitat, 'city'); assert.equal(data.timezone, 'Asia/Tokyo');
    assert.equal((await fetch(`${base}/api/encounters`)).status, 400);
    assert.equal((await fetch(`${base}/api/encounters?region=Tokyo&habitat=unknown`)).status, 400);
    assert.equal((await fetch(`${base}/api/encounters?region=Tokyo`, { method: 'POST' })).status, 405);
  });
  await withServer(async () => response({ results: [] }), async base => assert.equal((await fetch(`${base}/api/encounters?region=unknown`)).status, 404));
  await withServer(async () => { throw new Error('offline'); }, async base => assert.equal((await fetch(`${base}/api/encounters?region=Tokyo`)).status, 502));
  await withServer(async () => response({ current: {} }), async base => assert.equal((await fetch(`${base}/api/encounters?region=${encodeURIComponent('서울숲')}`)).status, 502));
});
