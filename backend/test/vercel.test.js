import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import handler from '../../api/index.js';

test('Vercel 함수가 재작성된 API 경로와 한국어 쿼리를 처리한다', async () => {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rewrite = (route, params = {}) => `${base}/api/index?${new URLSearchParams({ __route: route, ...params })}`;
  try {
    const response = await fetch(rewrite('pokemon-catalog'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).length, 155);
    const places = await (await fetch(rewrite('destinations', { name: '뮤' }))).json();
    assert.equal(places.pokemon.id, 151); assert(places.locations.length > 0);
    // An invalid id checks nested /pokemon/:id routing without any external API.
    const missing = await fetch(rewrite('pokemon/99999'));
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, '지원하지 않는 포켓몬입니다.');
    assert.equal((await fetch(rewrite('encounters', { habitat: 'forest' }))).status, 400);
    const method = await fetch(rewrite('pokemon-catalog'), { method: 'POST' });
    assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'GET');
    assert.equal((await fetch(rewrite('unknown'))).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('Vercel 출력은 프론트엔드만 포함하며 빌드·함수·목록 파일을 연결한다', async () => {
  await import('../../scripts/build.mjs');
  const dist = new URL('../../dist/', import.meta.url);
  assert.deepEqual((await readdir(dist)).sort(), ['app.js', 'index.html', 'styles.css']);
  for (const file of ['index.html', 'styles.css', 'app.js']) {
    assert.deepEqual(await readFile(new URL(file, dist)), await readFile(new URL(`../../frontend/${file}`, import.meta.url)));
  }
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, null); assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.functions['api/index.js'].includeFiles, 'backend/catalog/**');
  assert.deepEqual(config.rewrites[0], { source: '/api/:path*', destination: '/api/index?__route=:path*' });
});
