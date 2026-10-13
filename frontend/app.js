const $ = id => document.getElementById(id);
const form = $('search-form');
let map, layer;
const markers = new Map();
const encounters = new Map();
const dexCache = new Map();
const dexDialog = $('pokedex-dialog');
let dexRequest;
const artwork = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
async function apiData(response) {
  // A hosting 404 may be an HTML page, rather than our backend's JSON error.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('API에 연결하지 못했습니다. 배포 설정과 /api 경로를 확인해 주세요.');
  }
  return response.json();
}
if (window.L) {
  map = L.map('map', { scrollWheelZoom: false }).setView([36.2, 127.8], 7);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18 }).addTo(map);
  let tileWarningShown = false;
  tiles.on('tileerror', () => { if (!tileWarningShown) { tileWarningShown = true; $('map-title').textContent = '지도 타일 연결 지연 · 결과는 계속 확인할 수 있어요'; } });
  layer = L.layerGroup().addTo(map);
} else {
  $('map').className = 'fallback-map';
  $('map').textContent = '지도 라이브러리를 불러오지 못했습니다. 지역 검색과 포켓몬 추천은 사용할 수 있어요.';
}
function describeWeather(code) {
  if (code === 0) return ['☀', '맑음'];
  if (code <= 3) return ['☁', '구름'];
  if ([45,48].includes(code)) return ['🌫', '안개'];
  if ([71,73,75,77,85,86].includes(code)) return ['❄', '눈'];
  if (code >= 95) return ['⛈', '뇌우'];
  if (code >= 51) return ['🌧', '비'];
  return ['🌤', '기상 정보'];
}
function selectPokemon(id, showDetails = false) {
  document.querySelectorAll('.pokemon-card').forEach(c => { const selected = c.dataset.id === String(id); c.classList.toggle('selected', selected); c.setAttribute('aria-pressed', String(selected)); });
  const marker = markers.get(id);
  if (marker) { map.panTo(marker.getLatLng()); marker.openPopup(); }
  if (showDetails) openPokedex(id);
}
const statNames = { hp: 'HP', attack: '공격', defense: '방어', 'special-attack': '특수공격', 'special-defense': '특수방어', speed: '스피드' };
function statChart(stats) {
  const order = ['hp', 'attack', 'defense', 'speed', 'special-defense', 'special-attack'];
  const values = new Map(stats.map(s => [s.name, s.value]));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 330'); svg.classList.add('dex-radar'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `기본 능력치: ${order.map(s => `${statNames[s]} ${values.get(s) ?? 0}`).join(', ')}. 공통 척도 0~255.`);
  const point = (i, radius) => { const angle = -Math.PI / 2 + i * Math.PI / 3; return [180 + Math.cos(angle) * radius, 165 + Math.sin(angle) * radius]; };
  const element = (tag, attrs, content) => { const el = document.createElementNS(svg.namespaceURI, tag); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v); if (content !== undefined) el.textContent = content; svg.append(el); return el; };
  [1,.75,.5,.25].forEach(scale => element('polygon', { points: order.map((_,i) => point(i, 100 * scale).join(',')).join(' '), class: 'radar-grid' }));
  order.forEach((_, i) => { const [x,y] = point(i,100); element('line', { x1:180, y1:165, x2:x, y2:y, class:'radar-axis' }); });
  const dataPoints = order.map((s,i) => point(i,100 * Math.max(0,Math.min(255,values.get(s) ?? 0)) / 255));
  element('polygon', { points:dataPoints.map(p => p.join(',')).join(' '), class:'radar-values' });
  dataPoints.forEach(([cx,cy]) => element('circle', { cx, cy, r:3, class:'radar-dot' }));
  order.forEach((s,i) => {
    const [x,y] = point(i,126);
    const anchor = i === 0 || i === 3 ? 'middle' : i < 3 ? 'start' : 'end';
    element('text', { x, y:y-3, 'text-anchor':anchor, class:'radar-label' }, statNames[s]);
    element('text', { x, y:y+16, 'text-anchor':anchor, class:'radar-number' }, String(values.get(s) ?? 0));
  });
  const wrap = document.createElement('div'); wrap.className = 'dex-chart';
  wrap.append(svg, text('p', `종족값 합계 ${stats.reduce((sum,s) => sum + s.value,0)} · 각 축 0~255`, 'dex-chart-note'));
  return wrap;
}
function evolutionSection(data) {
  const section = document.createElement('section'); section.className = 'dex-evolution'; section.append(text('h3', '다음 진화', 'dex-section-title'));
  if (!data.evolution?.available) { section.append(text('p', '진화 정보를 불러오지 못했습니다. 도감을 다시 열면 재시도합니다.', 'dex-description')); return section; }
  if (!data.evolution.next.length) { section.append(text('p', '이 포켓몬은 더 이상 진화하지 않아요.', 'dex-description')); return section; }
  const list = document.createElement('div'); list.className = 'dex-evolution-list';
  data.evolution.next.forEach(p => {
    const card = document.createElement('div'); card.className = 'dex-evolution-card';
    const img = document.createElement('img'); img.src = artwork(p.id); img.alt = p.name; img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(text('span', `No. ${String(p.id).padStart(3,'0')}`)), { once:true });
    card.append(img, text('span', `No. ${String(p.id).padStart(3,'0')}`, 'dex-source-note'), text('strong', p.name)); list.append(card);
  });
  section.append(list);
  if (data.evolution.next.length > 1) section.append(text('p', '조건에 따라 서로 다른 포켓몬으로 진화할 수 있어요.', 'dex-source-note'));
  return section;
}
function renderPokedex(data) {
  const body = $('pokedex-body');
  body.replaceChildren();
  const hero = document.createElement('div'); hero.className = 'dex-hero';
  const image = document.createElement('img'); image.src = artwork(data.id); image.alt = data.name;
  image.addEventListener('error', () => image.replaceWith(text('span', data.name)), { once: true });
  const intro = document.createElement('div');
  intro.append(text('p', `No. ${String(data.id).padStart(3, '0')}`, 'eyebrow'), text('h3', data.genus));
  const types = document.createElement('div'); types.className = 'types';
  data.types.forEach(t => { const badge = text('span', t, 'type'); badge.dataset.type = t; types.append(badge); });
  intro.append(types); hero.append(image, intro);
  const measurements = document.createElement('dl'); measurements.className = 'dex-measurements';
  [['키', `${data.height} m`], ['몸무게', `${data.weight} kg`]].forEach(([label, value]) => { const group = document.createElement('div'); group.append(text('dt', label), text('dd', value)); measurements.append(group); });
  body.append(hero, measurements, text('h3', '도감 설명', 'dex-section-title'), text('p', data.description, 'dex-description'));
  if (data.version) body.append(text('p', `수록 버전: ${data.version}${data.descriptionLanguage === 'en' ? ' · 한국어 설명이 없어 영문으로 표시합니다.' : ''}`, 'dex-source-note'));
  body.append(text('h3', '특성 (영문 이름)', 'dex-section-title'), text('p', data.abilities.map(a => `${a.name}${a.hidden ? ' (숨겨진 특성)' : ''}`).join(' · ') || '정보 없음', 'dex-description'), text('h3', '기본 능력치', 'dex-section-title'));
  const source = text('a', '도감 데이터: PokéAPI ↗', 'dex-source-note'); source.href = data.source; source.target = '_blank'; source.rel = 'noreferrer';
  body.append(statChart(data.stats), evolutionSection(data), source);
}
async function openPokedex(id) {
  const local = encounters.get(id);
  if (!local) return;
  dexRequest?.abort();
  const controller = new AbortController(); dexRequest = controller;
  $('pokedex-title').textContent = local.name;
  $('pokedex-body').replaceChildren(text('p', '도감 정보를 불러오는 중…', 'dex-description'));
  $('pokedex-body').setAttribute('aria-busy', 'true');
  if (!dexDialog.open) dexDialog.showModal();
  try {
    let data = dexCache.get(id);
    if (!data) {
      const response = await fetch(`/api/pokemon/${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) });
      data = await apiData(response);
      if (response.status === 404 && data.error === '페이지를 찾지 못했습니다.') throw new Error('이전 버전의 서버가 실행 중입니다. 서버 터미널에서 Ctrl+C를 누른 뒤 npm start로 다시 실행해 주세요.');
      if (!response.ok) throw new Error(data.error || '도감 정보를 가져오지 못했습니다.');
      if (data.evolution?.available) dexCache.set(id, data);
    }
    if (controller.signal.aborted) return;
    $('pokedex-title').textContent = data.name; renderPokedex(data);
  } catch (error) {
    if (controller.signal.aborted) return;
    const retry = text('button', '다시 불러오기', 'dex-retry'); retry.type = 'button'; retry.addEventListener('click', () => openPokedex(id));
    $('pokedex-body').replaceChildren(text('p', error.name === 'TimeoutError' ? '도감 응답이 늦어지고 있어요. 다시 시도해 주세요.' : error.message, 'dex-description'), retry);
  } finally { if (dexRequest === controller) $('pokedex-body').setAttribute('aria-busy', 'false'); }
}
$('pokedex-close').addEventListener('click', () => dexDialog.close());
dexDialog.addEventListener('close', () => dexRequest?.abort());
dexDialog.addEventListener('click', event => {
  const rect = dexDialog.getBoundingClientRect();
  if (event.target === dexDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dexDialog.close();
});
function render(data) {
  const { location, weather: w, pokemon } = data;
  $('location-name').textContent = location.name;
  $('location-detail').textContent = [...new Set([location.admin1, location.country].filter(Boolean))].join(' · ') + ` / ${Math.abs(location.latitude).toFixed(3)}° ${location.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(location.longitude).toFixed(3)}° ${location.longitude >= 0 ? 'E' : 'W'}`;
  $('map-title').textContent = `${location.name} / FIELD MAP`;
  const [icon, description] = describeWeather(w.weather_code);
  $('weather').replaceChildren(text('span', icon, 'weather-icon'));
  const info = document.createElement('div');
  info.append(text('strong', `${w.temperature_2m.toFixed(1)}° ${description}`), text('p', `습도 ${w.relative_humidity_2m}% · 바람 ${w.wind_speed_10m} km/h · ${w.is_day ? '낮' : '밤'}`), text('p', `${w.time.replace('T', ' ')} (${data.timezone}) · 모델 기반 현재 날씨`));
  $('weather').append(info);
  $('habitat-info').replaceChildren(text('span', data.habitatName), text('small', data.habitatSource));
  $('count').textContent = `${pokemon.length} 발견`;
  $('cards').replaceChildren();
  markers.clear();
  encounters.clear(); pokemon.forEach(p => encounters.set(p.id, p));
  if (map) {
    layer.clearLayers();
    map.setView([location.latitude, location.longitude], 14);
    L.circleMarker([location.latitude, location.longitude], { radius: 7, color: '#234d3d', fillColor: '#d9ef82', fillOpacity: 1 }).bindPopup(text('strong', location.name)).addTo(layer);
  } else {
    const link = text('a', `${location.name} 위치를 OpenStreetMap에서 보기 ↗`);
    link.href = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=14/${location.latitude}/${location.longitude}`;
    link.target = '_blank'; link.rel = 'noreferrer';
    $('map').replaceChildren(text('p', '지도를 불러오지 못했지만 추천은 준비됐어요.'), link);
  }
  pokemon.forEach((p, index) => {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'pokemon-card'; card.dataset.id = p.id; card.setAttribute('aria-pressed', 'false'); card.setAttribute('aria-label', `${p.name} 도감 보기`); card.setAttribute('aria-haspopup', 'dialog');
    const top = document.createElement('div'); top.className = 'card-top'; top.append(text('span', `NO. ${String(p.id).padStart(3, '0')}`), text('span', `환경 적합도 ${p.score}/100`, 'match'));
    const portrait = document.createElement('div'); portrait.className = 'pokemon-portrait';
    const img = document.createElement('img'); img.src = artwork(p.id); img.alt = p.name; img.loading = 'lazy';
    img.addEventListener('error', () => portrait.replaceChildren(text('span', p.name)), { once: true }); portrait.append(img);
    const heading = document.createElement('div'); heading.className = 'pokemon-name'; heading.append(text('h3', p.name));
    const types = document.createElement('div'); types.className = 'types'; p.types.forEach(t => { const badge = text('span', t, 'type'); badge.dataset.type = t; types.append(badge); }); heading.append(types);
    card.append(top, portrait, heading, text('p', p.ecology), text('div', p.reasons.join(' · '), 'reason'));
    card.append(text('div', '도감 보기 ↗', 'dex-card-hint'));
    card.addEventListener('click', () => selectPokemon(p.id, true)); $('cards').append(card);
    if (map) {
      // Display-only ring, NOT real sightings or habitat coordinates.
      const angle = index * Math.PI * 2 / pokemon.length;
      const lat = Math.max(-85, Math.min(85, location.latitude + Math.sin(angle) * .005));
      const lng = ((location.longitude + Math.cos(angle) * .006 + 540) % 360) - 180;
      const pin = document.createElement('div'); pin.className = 'pokemon-pin-content'; const pinImage = document.createElement('img'); pinImage.src = artwork(p.id); pinImage.alt = p.name; pinImage.addEventListener('error', () => pin.replaceChildren(text('span', String(p.id))), { once: true }); pin.append(pinImage);
      const marker = L.marker([lat, lng], { icon: L.divIcon({ html: pin, className: 'pokemon-pin', iconSize: [52,52], iconAnchor: [26,26] }), title: `${p.name} 도감 보기`, alt: `${p.name} 가상 추천 위치 · 도감 보기` }).addTo(layer);
      const popup = document.createElement('div'); popup.append(text('strong', p.name), text('p', p.reasons.join(' · ')), text('small', '추천을 표현한 가상 위치'));
      marker.bindPopup(popup); marker.on('click', () => selectPokemon(p.id, true)); markers.set(p.id, marker);
    }
  });
}
let busy = false;
let nextFocusPokemon = null;
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const focusPokemon = nextFocusPokemon; nextFocusPokemon = null;
  busy = true; form.querySelector('button').disabled = true; $('button-label').textContent = '탐험 중…'; $('cards').setAttribute('aria-busy', 'true'); $('status').className = 'status'; $('status').textContent = '지역과 현재 날씨를 확인하고 있어요…';
  try {
    const params = new URLSearchParams({ region: $('region').value.trim(), habitat: $('habitat').value });
    if (focusPokemon) params.set('pokemon', String(focusPokemon));
    const response = await fetch(`/api/encounters?${params}`, { signal: AbortSignal.timeout(25000) });
    const data = await apiData(response);
    if (!response.ok) throw new Error(data.error || '검색에 실패했습니다.');
    render(data); $('status').textContent = `${data.location.name}에서 ${data.pokemon.length}종을 추천했어요. 적합도는 게임 규칙 점수이며 실제 출현 확률이 아닙니다.`;
    if (focusPokemon) selectPokemon(focusPokemon);
  } catch (error) {
    $('status').className = 'status error'; $('status').textContent = `${error.name === 'TimeoutError' ? '응답이 늦어지고 있어요. 다시 시도해 주세요.' : error.message} 기존 탐험 결과가 있다면 그대로 표시됩니다.`;
  } finally { busy = false; form.querySelector('button').disabled = false; $('button-label').textContent = 'Gotcha!'; $('cards').setAttribute('aria-busy', 'false'); }
});
document.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => { if (busy) return; $('region').value = button.dataset.region; $('habitat').value = 'auto'; form.requestSubmit(); }));

function randomizeHero() {
  const heroes = [{ id: 1, name: '이상해씨' }, { id: 7, name: '꼬부기' }, { id: 4, name: '파이리' }, { id: 133, name: '이브이' }, { id: 25, name: '피카츄' }];
  const image = document.querySelector('.hero-art img');
  const label = document.querySelector('.hero-art .art-label');
  const storageKey = 'field-map-last-hero';
  let previous = Number(image.dataset.pokemonId) || 0;
  if (!previous) {
    try { previous = Number(localStorage.getItem(storageKey)) || 0; } catch { /* Try session storage below. */ }
    if (!previous) try { previous = Number(sessionStorage.getItem(storageKey)) || 0; } catch { /* Storage may be disabled. */ }
  }
  const choices = heroes.filter(p => p.id !== previous);
  image.removeAttribute('data-ready');
  label.textContent = '오늘의 친구를 만나고 있어요…';
  function loadNext() {
    if (!choices.length) { label.textContent = '그림을 불러오지 못했어요. 새로고침해 주세요.'; return; }
    const [selected] = choices.splice(Math.floor(Math.random() * choices.length), 1);
    const preview = new Image();
    preview.onload = () => {
      image.src = preview.src;
      image.dataset.pokemonId = String(selected.id);
      image.dataset.ready = 'true';
      label.textContent = `#${String(selected.id).padStart(3, '0')} · ${selected.name}`;
      try { localStorage.setItem(storageKey, String(selected.id)); } catch { /* Session storage is a fallback. */ }
      try { sessionStorage.setItem(storageKey, String(selected.id)); } catch { /* Storage may be disabled. */ }
    };
    preview.onerror = loadNext;
    preview.src = artwork(selected.id);
  }
  loadNext();
}
async function loadPokemonNames() {
  try {
    const response = await fetch('/api/pokemon-catalog');
    if (!response.ok) return;
    const catalog = await apiData(response);
    catalog.forEach(p => { const option = document.createElement('option'); option.value = p.name; $('pokemon-names').append(option); });
    $('reverse-help').textContent = `현재 ${catalog.length}종의 생태 데이터로 국내 명소를 추천합니다. 이름 목록에서 선택할 수 있어요. 실제 출현 정보는 아닙니다.`;
  } catch { /* The form can still search without autocomplete. */ }
}
function renderDestinations(data) {
  const results = $('reverse-results'); results.replaceChildren();
  const summary = document.createElement('div'); summary.className = 'reverse-summary';
  const image = document.createElement('img'); image.src = artwork(data.pokemon.id); image.alt = data.pokemon.name;
  image.addEventListener('error', () => image.remove(), { once: true });
  const detail = document.createElement('div'); detail.append(text('h3', `${data.pokemon.name}에게 어울리는 탐험지`), text('p', data.pokemon.ecology));
  summary.append(image, detail); results.append(summary);
  const list = document.createElement('div'); list.className = 'destination-list';
  data.locations.forEach(place => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'destination-card';
    button.setAttribute('aria-label', `${place.name}에서 ${data.pokemon.name} 탐험하기`);
    button.append(text('span', `${place.admin1} · ${place.habitatName}`, 'destination-meta'), text('strong', place.name), text('span', place.reason, 'destination-reason'), text('span', '지도에서 탐험하기 ↗', 'destination-action'));
    button.addEventListener('click', () => {
      if (busy) { $('reverse-status').textContent = '진행 중인 지역 검색이 끝나면 장소를 다시 선택해 주세요.'; return; }
      $('region').value = place.name; $('habitat').value = place.habitat;
      nextFocusPokemon = data.pokemon.id; form.requestSubmit();
      form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    list.append(button);
  });
  results.append(list);
}
let reverseBusy = false;
$('pokemon-search-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (reverseBusy || !event.currentTarget.reportValidity()) return;
  reverseBusy = true; $('pokemon-search-button').disabled = true; $('pokemon-search-button').textContent = '찾는 중…';
  $('reverse-results').setAttribute('aria-busy', 'true'); $('reverse-status').className = 'reverse-status'; $('reverse-status').textContent = '어울리는 명소를 찾고 있어요…';
  try {
    const params = new URLSearchParams({ name: $('pokemon-name').value.trim() });
    const response = await fetch(`/api/destinations?${params}`, { signal: AbortSignal.timeout(10000) });
    const data = await apiData(response);
    if (!response.ok) throw new Error(data.error || '장소를 찾지 못했습니다.');
    renderDestinations(data);
    $('reverse-status').textContent = `${data.pokemon.name}에게 어울리는 명소 ${data.locations.length}곳을 찾았어요. 장소를 누르면 현재 날씨와 지도를 확인할 수 있습니다.`;
  } catch (error) {
    $('reverse-results').replaceChildren(); $('reverse-status').className = 'reverse-status error';
    $('reverse-status').textContent = error.name === 'TimeoutError' ? '응답이 늦어지고 있어요. 다시 시도해 주세요.' : error.message;
  } finally {
    reverseBusy = false; $('pokemon-search-button').disabled = false; $('pokemon-search-button').textContent = '너로 정했다!'; $('reverse-results').setAttribute('aria-busy', 'false');
  }
});
randomizeHero();
window.addEventListener('pageshow', event => { if (event.persisted) randomizeHero(); });
loadPokemonNames();
