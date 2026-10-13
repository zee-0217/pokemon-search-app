import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodeLocation, selectLocation } from '../geocoding.js';

test('New York 전체를 전달하고 York 및 작은 동명 도시보다 미국 뉴욕을 선택한다', async () => {
  const results = [
    { name: 'York', country_code: 'US', feature_code: 'PPLA2', population: 10000000 },
    { name: 'New York', country_code: 'GB', feature_code: 'PPL', population: 90000000 },
    { name: 'New York', country_code: 'US', feature_code: 'PPL', population: 100 },
    { name: 'New York', country_code: 'US', feature_code: 'PPL', population: 8804190, latitude: 40.71427, longitude: -74.00597 },
  ];
  for (const name of ['New York', '  New   York ', '뉴욕']) {
    const location = await geocodeLocation(name, async url => {
      assert.equal(url.searchParams.get('name'), 'New York'); assert.equal(url.searchParams.get('language'), 'en'); assert.equal(url.searchParams.get('countryCode'), 'US');
      return { results };
    });
    assert.equal(location.latitude, 40.71427); assert.equal(location.country, '미국');
  }
  assert.equal(selectLocation([results[0]], 'New York'), null);
});
test('다른 다단어 이름도 전체 일치를 우선하고 쉼표 국가 한정자를 보존한다', async () => {
  const result = await geocodeLocation(' San   Francisco, 미국 ', async url => {
    assert.equal(url.searchParams.get('name'), 'San Francisco, United States'); assert.equal(url.searchParams.get('countryCode'), 'US');
    return { results: [{ name: 'Francisco', country_code: 'US' }, { name: 'San Francisco', country_code: 'US', population: 827526, latitude: 37.77493 }] };
  });
  assert.equal(result.latitude, 37.77493);
  const british = await geocodeLocation('New York, UK', async url => {
    assert.equal(url.searchParams.get('name'), 'New York, UK'); assert.equal(url.searchParams.has('countryCode'), false);
    return { results: [{ name: 'New York', country_code: 'GB', latitude: 53.07897 }] };
  });
  assert.equal(british.country, '영국');
});
test('한국어·영문 국가명을 같은 대표 도시로 연결하고 좌표와 환경을 명시한다', async () => {
  for (const name of ['몰디브', 'Maldives', ' maldives ']) {
    const result = await geocodeLocation(name, async url => {
      assert.equal(url.searchParams.get('name'), 'Male'); assert.equal(url.searchParams.get('countryCode'), 'MV');
      return { results: [{ name: 'Malé', country_code: 'MV', feature_code: 'PPLC', latitude: 4.17521, longitude: 73.50916 }] };
    });
    assert.equal(result.name, '몰디브 · 말레'); assert.equal(result.habitat, 'coast'); assert.match(result.note, /대표 도시 말레/);
  }
  await geocodeLocation('일본', async url => { assert.equal(url.searchParams.get('name'), 'Tokyo'); assert.equal(url.searchParams.get('countryCode'), 'JP'); return { results: [] }; });
  await geocodeLocation('로스앤젤레스', async url => { assert.equal(url.searchParams.get('name'), 'Los Angeles'); assert.equal(url.searchParams.get('countryCode'), 'US'); return { results: [] }; });
});
test('빈 결과와 국가가 맞지 않는 결과를 임의의 다른 장소로 대체하지 않는다', async () => {
  assert.equal(await geocodeLocation('Unknown City', async () => ({ results: [] })), null);
  assert.equal(await geocodeLocation('몰디브', async () => ({ results: [{ name: 'Male', country_code: 'IT' }] })), null);
});
