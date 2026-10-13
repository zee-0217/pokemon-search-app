import { readFileSync } from 'node:fs';
// PokéAPI snapshot with curated ecology overrides. Scores are game rules, not probabilities.
const kanto = JSON.parse(readFileSync(new URL('./catalog/kanto.json', import.meta.url), 'utf8'));
export const habitats = { forest: '숲·공원', water: '강·호수', coast: '해변', mountain: '산', city: '도심', grass: '초원' };
const rows = [
  [1, '이상해씨', ['풀', '독'], ['forest', 'grass'], '등의 씨앗이 햇빛을 받아 자라며 풀과 나무가 많은 곳에 어울려요.', ['sun']],
  [4, '파이리', ['불꽃'], ['mountain'], '꼬리의 불꽃을 지키기 좋은 따뜻하고 건조한 환경을 좋아해요.', ['warm', 'sun']],
  [7, '꼬부기', ['물'], ['water', 'coast'], '물속에서 헤엄치고 물가에서 쉬는 포켓몬이에요.', ['rain']],
  [10, '캐터피', ['벌레'], ['forest', 'grass'], '잎을 먹으며 자라기 때문에 나무와 풀이 많은 곳에 어울려요.', ['warm']],
  [16, '구구', ['노말', '비행'], ['forest', 'grass', 'city'], '숲과 풀밭에서 작은 먹이를 찾는 새 포켓몬이에요.', ['sun']],
  [25, '피카츄', ['전기'], ['forest'], '숲에 살며 볼의 전기 주머니에 전기를 모아요.', ['storm']],
  [37, '식스테일', ['불꽃'], ['forest', 'mountain'], '불꽃을 다루는 여우 포켓몬으로 따뜻한 곳에 어울려요.', ['warm', 'sun']],
  [41, '주뱃', ['독', '비행'], ['mountain'], '어두운 동굴에서 지내고 밤에 활동하기 좋은 포켓몬이에요.', ['night']],
  [43, '뚜벅쵸', ['풀', '독'], ['forest', 'grass'], '낮에는 땅에 뿌리를 내리고 밤에는 걸어 다니는 식물 포켓몬이에요.', ['night', 'rain']],
  [54, '고라파덕', ['물'], ['water'], '강과 호수처럼 담수가 있는 곳에서 만나기 좋아요.', ['rain']],
  [60, '발챙이', ['물'], ['water'], '다리보다 꼬리로 헤엄치는 것이 익숙한 물가의 포켓몬이에요.', ['rain', 'warm']],
  [74, '꼬마돌', ['바위', '땅'], ['mountain'], '산길과 바위 지대에 섞여 쉬는 포켓몬이에요.', ['sun']],
  [81, '코일', ['전기', '강철'], ['city'], '전기를 에너지원으로 삼아 전기 시설이 있는 도심에 어울려요.', ['storm']],
  [92, '고오스', ['고스트', '독'], ['city', 'mountain'], '가스 같은 몸으로 어두운 곳에 숨어 지내요.', ['night', 'fog']],
  [98, '크랩', ['물'], ['coast'], '모래사장에 굴을 파고 바닷가에서 살아가는 포켓몬이에요.', ['rain']],
  [109, '또가스', ['독'], ['city'], '가스를 품은 몸으로 도시의 산업 환경과 어울려요.', ['fog']],
  [129, '잉어킹', ['물'], ['water', 'coast'], '다양한 물 환경에서 살아가는 튼튼한 물고기 포켓몬이에요.', ['rain']],
  [131, '라프라스', ['물', '얼음'], ['coast'], '넓은 바다를 헤엄치며 이동하는 포켓몬이에요.', ['cold']],
  [133, '이브이', ['노말'], ['city', 'forest', 'grass'], '주변 환경에 적응하는 능력이 뛰어난 포켓몬이에요.', []],
  [143, '잠만보', ['노말'], ['forest', 'grass'], '먹이를 구하기 쉬운 숲과 풀밭에서 쉬기 좋아요.', []],
  [163, '부우부', ['노말', '비행'], ['forest'], '밤에 활동하는 새 포켓몬으로 어두운 숲에 어울려요.', ['night']],
  [220, '꾸꾸리', ['얼음', '땅'], ['mountain'], '코로 땅을 뒤지며 먹이를 찾고 추운 산악 환경에 어울려요.', ['cold', 'snow']],
  [278, '갈모매', ['물', '비행'], ['coast'], '바닷바람을 타고 날며 해안에서 먹이를 찾아요.', ['wind']],
  [361, '눈꼬마', ['얼음'], ['mountain'], '눈과 얼음이 있는 추운 곳에서 살기 좋아요.', ['cold', 'snow']],
];
const curated = rows.map(([id, name, types, homes, ecology, traits]) => ({ id, name, types, homes, ecology, traits }));
const catalog = new Map(kanto.pokemon.map(p => [p.id, p]));
curated.forEach(p => catalog.set(p.id, { ...catalog.get(p.id), ...p }));
export const pokemon = [...catalog.values()].sort((a,b) => a.id - b.id);

export function weatherTags(w) {
  const tags = [];
  if (w.temperature_2m <= 5) tags.push('cold');
  if (w.temperature_2m >= 24) tags.push('warm');
  if (w.weather_code <= 1 && w.is_day === 1) tags.push('sun');
  if ((w.weather_code >= 51 && w.weather_code <= 67) || (w.weather_code >= 80 && w.weather_code <= 82) || w.precipitation > 0) tags.push('rain');
  if ([71, 73, 75, 77, 85, 86].includes(w.weather_code)) tags.push('snow');
  if (w.weather_code >= 95) tags.push('storm');
  if ([45, 48].includes(w.weather_code)) tags.push('fog');
  if (w.wind_speed_10m >= 20) tags.push('wind');
  if (w.is_day === 0) tags.push('night');
  return tags;
}
const tagReasons = { cold: '낮은 기온', warm: '따뜻한 기온', sun: '맑은 낮의 햇빛', rain: '비·습한 날씨', snow: '눈 내리는 날씨', storm: '뇌우', fog: '안개', wind: '강한 바람', night: '밤 시간' };
export function recommend(habitat, weather, { limit = 6 } = {}) {
  const tags = weatherTags(weather);
  return pokemon.filter(p => p.homes.includes(habitat)).map(p => {
    const matches = p.traits.filter(t => tags.includes(t));
    let score = 60 + matches.length * 15;
    if (p.types.includes('불꽃') && (tags.includes('rain') || tags.includes('snow'))) score -= 20;
    if (p.types.includes('얼음') && tags.includes('warm')) score -= 20;
    return { ...p, score: Math.min(100, score), reasons: [`${habitats[habitat]} 서식 환경`, ...matches.map(t => `${tagReasons[t]}에 활동하기 좋은 설정`)] };
  }).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, limit);
}
