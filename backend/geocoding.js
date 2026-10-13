// Aliases bridge gaps in GeoNames' translated search index. Countries use a representative city.
const countries = [
  ['몰디브', 'Maldives', 'MV', 'Male', '말레', 'coast'],
  ['일본', 'Japan', 'JP', 'Tokyo', '도쿄'],
  ['베트남', 'Vietnam', 'VN', 'Hanoi', '하노이'],
  ['태국', 'Thailand', 'TH', 'Bangkok', '방콕'],
  ['미국', 'United States', 'US', 'Washington', '워싱턴'],
  ['대한민국', 'South Korea', 'KR', 'Seoul', '서울'],
  ['프랑스', 'France', 'FR', 'Paris', '파리'],
  ['영국', 'United Kingdom', 'GB', 'London', '런던'],
  ['이탈리아', 'Italy', 'IT', 'Rome', '로마'],
  ['스페인', 'Spain', 'ES', 'Madrid', '마드리드'],
  ['독일', 'Germany', 'DE', 'Berlin', '베를린'],
  ['인도네시아', 'Indonesia', 'ID', 'Jakarta', '자카르타'],
  ['필리핀', 'Philippines', 'PH', 'Manila', '마닐라'],
  ['싱가포르', 'Singapore', 'SG', 'Singapore', '싱가포르'],
  ['중국', 'China', 'CN', 'Beijing', '베이징'],
  ['호주', 'Australia', 'AU', 'Canberra', '캔버라'],
  ['뉴질랜드', 'New Zealand', 'NZ', 'Wellington', '웰링턴'],
  ['캐나다', 'Canada', 'CA', 'Ottawa', '오타와'],
  ['스위스', 'Switzerland', 'CH', 'Bern', '베른'],
  ['인도', 'India', 'IN', 'New Delhi', '뉴델리'],
  ['이집트', 'Egypt', 'EG', 'Cairo', '카이로'],
  ['아랍에미리트', 'United Arab Emirates', 'AE', 'Abu Dhabi', '아부다비'],
  ['튀르키예', 'Turkey', 'TR', 'Ankara', '앙카라'],
  ['그리스', 'Greece', 'GR', 'Athens', '아테네'],
  ['멕시코', 'Mexico', 'MX', 'Mexico City', '멕시코시티'],
  ['브라질', 'Brazil', 'BR', 'Brasilia', '브라질리아'],
  ['네팔', 'Nepal', 'NP', 'Kathmandu', '카트만두'],
  ['아이슬란드', 'Iceland', 'IS', 'Reykjavik', '레이캬비크'],
  ['모리셔스', 'Mauritius', 'MU', 'Port Louis', '포트루이스'],
  ['세이셸', 'Seychelles', 'SC', 'Victoria', '빅토리아'],
  ['피지', 'Fiji', 'FJ', 'Suva', '수바'],
];
const cities = [
  ['뉴욕', 'New York', 'US', ['new york', 'new york city', 'nyc']],
  ['로스앤젤레스', 'Los Angeles', 'US', ['로스엔젤레스', '엘에이']],
  ['샌프란시스코', 'San Francisco', 'US', []],
  ['라스베이거스', 'Las Vegas', 'US', ['라스베가스']],
  ['도쿄', 'Tokyo', 'JP', ['동경']], ['오사카', 'Osaka', 'JP', []],
  ['교토', 'Kyoto', 'JP', []], ['삿포로', 'Sapporo', 'JP', []],
  ['방콕', 'Bangkok', 'TH', []], ['하노이', 'Hanoi', 'VN', []],
  ['호치민', 'Ho Chi Minh City', 'VN', []], ['다낭', 'Da Nang', 'VN', []],
  ['파리', 'Paris', 'FR', []], ['런던', 'London', 'GB', []],
  ['로마', 'Rome', 'IT', []], ['베네치아', 'Venice', 'IT', ['베니스']],
  ['바르셀로나', 'Barcelona', 'ES', []], ['베를린', 'Berlin', 'DE', []],
  ['시드니', 'Sydney', 'AU', []], ['멜버른', 'Melbourne', 'AU', []],
  ['두바이', 'Dubai', 'AE', []], ['말레', 'Male', 'MV', []],
  ['홍콩', 'Hong Kong', 'HK', []], ['타이베이', 'Taipei', 'TW', []],
  ['베이징', 'Beijing', 'CN', ['북경']], ['상하이', 'Shanghai', 'CN', ['상해']],
  ['서울', 'Seoul', 'KR', []], ['부산', 'Busan', 'KR', []],
];
const clean = s => s.normalize('NFKC').trim().replace(/\s+/g, ' ');
const key = s => clean(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const aliases = new Map();
for (const [ko, en, countryCode, extra] of cities) {
  for (const alias of [ko, ...extra]) aliases.set(key(alias), { search: en, name: ko, countryCode });
}
for (const [ko, en, countryCode, capital, capitalKo, habitat] of countries) {
  for (const alias of [ko, en]) aliases.set(key(alias), { search: capital, name: `${ko} · ${capitalKo}`, countryCode, habitat, note: `국가명 검색: 대표 도시 ${capitalKo} 기준의 위치와 현재 날씨입니다.` });
}
aliases.set('한국', aliases.get('대한민국'));
aliases.set('터키', aliases.get('튀르키예'));
const regionNames = new Intl.DisplayNames(['ko'], { type: 'region' });

export function selectLocation(results, search) {
  const fullName = key(search);
  const exact = results.filter(p => key(p.name) === fullName);
  // Match the entire phrase. "York" must never be a fallback for "New York".
  const prefixed = results.filter(p => key(p.name).startsWith(fullName + ' ') || (/\p{Script=Hangul}/u.test(fullName) && key(p.name).startsWith(fullName)));
  return (exact.length ? exact : prefixed).sort((a,b) => Number(b.feature_code?.startsWith('PPL')) - Number(a.feature_code?.startsWith('PPL')) || (b.population || 0) - (a.population || 0))[0] || null;
}
export async function geocodeLocation(query, fetchJson) {
  const [place, ...qualifiers] = clean(query).split(',').map(s => s.trim());
  const alias = aliases.get(key(place));
  const search = alias?.search || place;
  let qualifier = qualifiers.join(', ');
  const country = countries.find(([ko,en]) => key(qualifier) === key(ko) || key(qualifier) === key(en));
  const countryCode = country?.[2] || (!qualifier ? alias?.countryCode : undefined);
  if (country) qualifier = country[1];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: qualifier ? `${search}, ${qualifier}` : search, count: '20', language: /\p{Script=Hangul}/u.test(search) ? 'ko' : 'en', format: 'json', ...(countryCode ? { countryCode } : {}) });
  const data = await fetchJson(url);
  const candidates = (data.results || []).filter(p => !countryCode || p.country_code === countryCode);
  const result = selectLocation(candidates, search);
  if (!result) return null;
  return { ...result, name: alias?.name || result.name, country: result.country_code ? regionNames.of(result.country_code) : result.country, habitat: alias?.habitat, note: alias?.note };
}
