// Optional maintenance script. The app runs from the generated local snapshot.
import { mkdir, writeFile } from 'node:fs/promises';

const root = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
function parseCsv(source) {
  const records = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if (ch === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); records.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); records.push(row); }
  const headers = records.shift();
  return records.filter(r => r.length === headers.length).map(r => Object.fromEntries(headers.map((h,i) => [h,r[i]])));
}
async function table(name) {
  const url = root + name + '.csv';
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
const [species, names, typeNames, pokemonTypes] = await Promise.all(['pokemon_species', 'pokemon_species_names', 'type_names', 'pokemon_types'].map(table));
const koreanNames = new Map(names.filter(r => r.local_language_id === '3').map(r => [Number(r.pokemon_species_id), r]));
const koreanTypes = new Map(typeNames.filter(r => r.local_language_id === '3').map(r => [r.type_id, r.name]));
const homeMap = { 1: ['mountain'], 2: ['forest'], 3: ['grass','forest'], 4: ['mountain'], 5: ['mountain','forest'], 6: ['mountain','grass'], 7: ['coast'], 8: ['city'], 9: ['water','coast'] };
const habitatText = { 1: '동굴처럼 어둡고 바위가 많은 곳', 2: '나무와 풀이 많은 숲', 3: '풀밭과 탁 트인 녹지', 4: '바위가 많은 산악 지대', 5: '사람의 발길이 드문 자연환경', 6: '건조하고 바위가 많은 지대', 7: '바다와 해안', 8: '사람이 사는 도시 주변', 9: '강과 호수 등 물가' };
const overrides = { 144: ['mountain'], 145: ['mountain','forest'], 146: ['mountain'], 150: ['city','mountain'], 151: ['forest','mountain'] };
const entries = species.filter(s => Number(s.id) <= 151).map(s => {
  const id = Number(s.id), localized = koreanNames.get(id);
  const types = pokemonTypes.filter(t => Number(t.pokemon_id) === id).sort((a,b) => Number(a.slot) - Number(b.slot)).map(t => koreanTypes.get(t.type_id));
  if (!localized?.name || !types.length || types.some(t => !t)) throw new Error(`Missing Korean data for ${id}`);
  const homes = overrides[id] || homeMap[s.habitat_id];
  if (!homes) throw new Error(`Missing habitat for ${id}`);
  const traits = new Set();
  if (types.includes('풀')) traits.add('sun');
  if (types.includes('불꽃')) { traits.add('warm'); traits.add('sun'); }
  if (types.includes('물')) traits.add('rain');
  if (types.includes('얼음')) { traits.add('cold'); traits.add('snow'); }
  if (types.includes('전기')) traits.add('storm');
  if (types.includes('벌레')) traits.add('warm');
  if (types.includes('고스트') || [35,36,39,40,41,42,43,44,96,97].includes(id)) traits.add('night');
  if (types.includes('고스트')) traits.add('fog');
  if (types.includes('비행') && homes.includes('coast')) traits.add('wind');
  const environment = habitatText[s.habitat_id] || '사람의 발길이 드문 자연환경';
  return { id, name: localized.name, englishName: s.identifier, types, homes, traits: [...traits], ecology: `${localized.genus || '포켓몬'}으로, ${environment}에 어울려요. 도감의 서식지 분류를 바탕으로 이 앱에서 추천한 환경입니다.` };
});
if (entries.length !== 151 || new Set(entries.map(p => p.id)).size !== 151) throw new Error('Expected 151 unique Kanto Pokémon');
const directory = new URL('../backend/catalog/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('kanto.json', directory), JSON.stringify({ source: root, notes: 'Korean names and types: PokéAPI. Habitat mapping and weather traits: app interpretation.', pokemon: entries }, null, 2) + '\n', 'utf8');
console.log(`Saved ${entries.length} Pokémon to backend/catalog/kanto.json`);
