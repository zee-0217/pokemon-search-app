import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPokedex } from '../pokedex.js';

const node = (id, children = []) => ({ species: { name: `species-${id}`, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` }, evolves_to: children });
const chain = node(1, [node(2, [node(3)])]);
const species = id => ({ id, evolution_chain: { url: `https://pokeapi.co/api/v2/evolution-chain/${id}/` }, names: [{ name: `한국어-${id}`, language: { name: 'ko' } }] });
const details = id => ({ id, height: 7, weight: 69, stats: [{ stat: { name: 'hp' }, base_stat: 45 }] });
test('다음 진화만 반환하고 도감에 없는 진화 종도 한국어 이름으로 조회한다', async () => {
  const calls = [];
  const get = createPokedex(async url => {
    calls.push(url.pathname);
    if (url.pathname.includes('evolution-chain')) return { chain };
    const id = Number(url.pathname.match(/(\d+)\/$/)[1]);
    return url.pathname.includes('pokemon-species') ? species(id) : details(id);
  });
  assert.deepEqual((await get(1)).evolution, { available: true, next: [{ id: 2, name: '한국어-2' }] });
  await get(1);
  assert.equal(calls.length, 4);
  assert(!calls.some(path => path.endsWith('/3/')));
});
test('분기 진화와 체인 중간의 현재 단계를 구분하고 최종 진화를 표시한다', async () => {
  const chains = { 133: node(133, [node(134), node(135), node(136)]), 25: node(172, [node(25, [node(26)])]), 131: node(131) };
  const get = createPokedex(async url => {
    const id = Number(url.pathname.match(/(\d+)\/$/)[1]);
    if (url.pathname.includes('evolution-chain')) return { chain: chains[id] };
    return url.pathname.includes('pokemon-species') ? species(id) : details(id);
  });
  assert.deepEqual((await get(133)).evolution.next.map(p => p.id), [134,135,136]);
  assert.deepEqual((await get(25)).evolution.next.map(p => p.id), [26]);
  assert.deepEqual((await get(131)).evolution, { available: true, next: [] });
});
test('진화 조회 실패 시 기본 도감은 유지하고 다음 요청에서 진화만 재시도한다', async () => {
  let fail = true; let baseCalls = 0;
  const get = createPokedex(async url => {
    if (url.pathname.includes('evolution-chain')) { if (fail) throw new Error('offline'); return { chain }; }
    const id = Number(url.pathname.match(/(\d+)\/$/)[1]);
    if (id === 1) baseCalls++;
    return url.pathname.includes('pokemon-species') ? species(id) : details(id);
  });
  const partial = await get(1);
  assert.equal(partial.height, .7); assert.equal(partial.evolution.available, false);
  fail = false;
  assert.equal((await get(1)).evolution.next[0].id, 2);
  assert.equal(baseCalls, 2);
});
