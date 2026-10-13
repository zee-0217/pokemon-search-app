export const landmarks = [
  { name: '서울숲', aliases: ['서울 숲', 'seoul forest'], latitude: 37.5445, longitude: 127.0374, habitat: 'forest', admin1: '서울', country: '대한민국' },
  { name: '여의도 한강공원', aliases: ['한강', '한강공원', '여의도', '여의도한강공원'], latitude: 37.5284, longitude: 126.934, habitat: 'water', admin1: '서울', country: '대한민국' },
  { name: '해운대', aliases: ['해운대 해수욕장', '해운대해수욕장', 'haeundae'], latitude: 35.1587, longitude: 129.1604, habitat: 'coast', admin1: '부산', country: '대한민국' },
  { name: '한라산', aliases: ['hallasan'], latitude: 33.3617, longitude: 126.5292, habitat: 'mountain', admin1: '제주', country: '대한민국' },
  { name: '북한산', aliases: [], latitude: 37.6587, longitude: 126.977, habitat: 'mountain', admin1: '서울', country: '대한민국' },
  { name: '남산', aliases: ['남산타워', 'namsan'], latitude: 37.5512, longitude: 126.9882, habitat: 'mountain', admin1: '서울', country: '대한민국' },
  { name: '경복궁', aliases: ['gyeongbokgung'], latitude: 37.5796, longitude: 126.977, habitat: 'city', admin1: '서울', country: '대한민국' },
  { name: '속초해수욕장', aliases: ['속초 해수욕장'], latitude: 38.1909, longitude: 128.6013, habitat: 'coast', admin1: '강원', country: '대한민국' },
];
const normalize = s => s.toLowerCase().replace(/\s/g, '');
export function findLandmark(query) {
  return landmarks.find(p => [p.name, ...p.aliases].some(a => normalize(a) === normalize(query)));
}
