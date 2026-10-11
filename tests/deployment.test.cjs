const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function verify(broken = '') {
  const code = `
    import { readFile } from 'node:fs/promises';
    process.env.PUBLIC_SITE_URL = 'https://parking.example.org/';
    process.env.DATA_BASE_URL = 'https://data.example.org/data/';
    const fixtures = new Map([
      ['https://parking.example.org/', [await readFile('web/index.html'), 'text/html']],
      ['https://parking.example.org/forecast.js', [await readFile('web/forecast.js'), 'application/javascript']],
      ['https://parking.example.org/app.js', [await readFile('web/app.js'), 'application/javascript']],
      ['https://parking.example.org/operations.html', [await readFile('web/operations.html'), 'text/html']],
      ['https://parking.example.org/operating-cost-reference.png', [await readFile('web/operating-cost-reference.png'), 'image/png']],
      ['https://parking.example.org/robots.txt', ['Sitemap: https://parking.example.org/sitemap.xml', 'text/plain']],
      ['https://parking.example.org/sitemap.xml', ['<loc>https://parking.example.org/</loc>', 'application/xml']],
      ['https://parking.example.org/config.js', ['window.ICN_CONFIG = {"dataBase":"https://data.example.org/data/"};', 'application/javascript']],
      ['https://data.example.org/data/latest.json', ['{"zones":[{}],"last_ok_at":"2026-10-11T02:05:00Z"}', 'application/json']]
    ]);
    const broken = ${JSON.stringify(broken)};
    if (broken === 'script-order') fixtures.set('https://parking.example.org/', [(await readFile('web/index.html', 'utf8')).replace('src="forecast.js"', 'src="absent.js"'), 'text/html']);
    else if (broken) {
      const url = 'https://parking.example.org/' + broken;
      fixtures.set(url, ['not-the-current-source', fixtures.get(url)[1]]);
    }
    globalThis.setTimeout = callback => setImmediate(callback);
    globalThis.fetch = async value => {
      const url = new URL(value); url.search = '';
      const fixture = fixtures.get(url.href);
      if (!fixture) throw new Error('Unexpected deployment verification request');
      return new Response(fixture[0], { status: 200, headers: { 'Content-Type': fixture[1] } });
    };
    await import('./scripts/verify-deployment.mjs');
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000
  });
}

test('deployment verifies the forecast scripts, cost image, crawler files, and public data', () => {
  const result = verify();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /parking forecast code/);
});

test('deployment rejects stale forecast code, a wrong cost image, and a missing model script', () => {
  for (const broken of ['forecast.js', 'app.js', 'operating-cost-reference.png', 'script-order']) {
    const result = verify(broken);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, broken);
    assert.match(result.stderr, /Deployment verification failed/);
    assert.doesNotMatch(result.stdout, /Deployment verified/);
  }
});
