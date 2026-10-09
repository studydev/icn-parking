const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const buildModule = import('../scripts/build-web.mjs');
const root = path.join(__dirname, '..');

async function build(t, options = {}) {
  const { buildWeb } = await buildModule;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'parking-build-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const out = path.join(temp, 'site');
  buildWeb({ ...options, outDir: out });
  return out;
}

test('default build has no deployment-specific settings or placeholder URLs', async t => {
  const out = await build(t);
  assert.equal(fs.existsSync(path.join(out, 'sitemap.xml')), false);
  assert.equal(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n');
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /naver-site-verification|msvalidate\.01|__SITE_URL__|rel="canonical"/);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(out, 'config.js'), 'utf8'), context);
  assert.equal(context.window.ICN_CONFIG.dataBase, './data/');
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'staticwebapp.config.json'), 'utf8'), /blob\.core\.windows\.net/);
});

test('configured build injects search metadata, crawler files, data settings, and precise CSP', async t => {
  const out = await build(t, {
    siteUrl: 'https://parking.example.org',
    dataBaseUrl: 'https://data.example.org/public',
    naver: 'example-naver-token',
    bing: 'example-bing-token'
  });
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /rel="canonical" href="https:\/\/parking\.example\.org\/"/);
  assert.match(html, /name="naver-site-verification" content="example-naver-token"/);
  assert.match(html, /name="msvalidate\.01" content="example-bing-token"/);
  assert.match(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/parking\.example\.org\/sitemap\.xml/);
  assert.match(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/parking\.example\.org\/<\/loc>/);
  const config = JSON.parse(fs.readFileSync(path.join(out, 'staticwebapp.config.json'), 'utf8'));
  assert.match(config.globalHeaders['content-security-policy'], /connect-src 'self' https:\/\/data\.example\.org;/);
  assert.doesNotMatch(config.globalHeaders['content-security-policy'], /connect-src[^;]*\*/);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(out, 'config.js'), 'utf8'), context);
  assert.equal(context.window.ICN_CONFIG.dataBase, 'https://data.example.org/public/');
});

test('build leaves repository templates unchanged and does not copy runtime data', async t => {
  const before = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const out = await build(t, { siteUrl: 'https://parking.example.org/' });
  assert.equal(fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(out, 'data')), false);
  assert.match(fs.readFileSync(path.join(root, 'web/sitemap.xml'), 'utf8'), /__SITE_URL__/);
});

test('build deploys an exact, static operating cost reference without private resource identifiers', async t => {
  const out = await build(t);
  const html = fs.readFileSync(path.join(out, 'operations.html'), 'utf8');
  assert.equal(html, fs.readFileSync(path.join(root, 'web/operations.html'), 'utf8'));
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /href="operations\.html">운영 비용 안내<\/a>/);
  assert.match(html, /id="operating-costs"/);
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.match(html, /실제 비용 · Actual cost<\/dt>\s*<dd>₩831\.80<\/dd>/);
  assert.match(html, /차트 예측 · Forecast: Chart view<\/dt>\s*<dd>₩961\.33<\/dd>/);
  assert.match(html, /이미지의 예산 표시 · Budget<\/dt>\s*<dd>없음 <small>None<\/small><\/dd>/);
  const rows = new Map([...html.matchAll(/<th scope="row">([^<]+)<\/th><td class="ops-amount">₩(\d+\.\d{2})<\/td>/g)]
    .map(([, name, value]) => [name, Math.round(Number(value) * 100)]));
  const services = [
    ['Functions', 29409], ['Log Analytics', 24665], ['Storage', 23996],
    ['Azure Monitor', 5086], ['Bandwidth', 14]
  ];
  for (const [service, cents] of services) assert.equal(rows.get(service), cents);
  assert.equal(services.reduce((sum, [, cents]) => sum + cents, 0), 83170);
  assert.equal(rows.get('판독 가능 항목 합계'), 83170);
  assert.equal(rows.get('미배분 차액'), 10);
  assert.equal(rows.get('이미지의 실제 총액'), 83180);
  assert.equal(rows.get('KR Central'), 78080);
  assert.equal(rows.get('Unknown'), 5086);
  assert.equal(rows.get('AU East'), 14);
  assert.equal(rows.get('KR Central') + rows.get('Unknown') + rows.get('AU East'), 83180);
  assert.match(html, /연도와 정확한 조회 시작·종료일은 확인되지 않습니다/);
  assert.match(html, /월 요금이나 서비스 단가로 해석하지 마세요/);
  assert.match(html, /Key Vault와 Azure App Service도 있지만 개별 금액은 이미지에서 판독할 수 없습니다/);
  assert.doesNotMatch(html, /<script\b|blob\.core\.windows\.net|azurestaticapps\.net|\/subscriptions\/|\brg-[a-z0-9-]+/i);
});

test('build refuses credentials, SAS/query strings, non-HTTPS URLs, and injected verification tokens', async t => {
  const { buildWeb } = await buildModule;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'parking-invalid-build-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const options of [
    { siteUrl: 'http://parking.example.org/' },
    { siteUrl: 'https://parking.example.org/subpath/' },
    { dataBaseUrl: 'https://user:password@data.example.org/' },
    { dataBaseUrl: 'https://data.example.org/?sig=not-a-real-signature' },
    { dataBaseUrl: 'file:///tmp/data/' },
    { naver: '"><script>' },
    { bing: 'contains spaces' }
  ]) {
    assert.throws(() => buildWeb({ ...options, outDir: path.join(temp, 'site') }));
    assert.equal(fs.existsSync(path.join(temp, 'site')), false, 'invalid settings must not produce deployable files');
  }
});

test('build refuses source overwrites and nonempty output directories', async t => {
  const { buildWeb } = await buildModule;
  assert.throws(() => buildWeb({ outDir: root }), /must not overwrite/);
  assert.throws(() => buildWeb({ outDir: path.join(root, 'web') }), /must not overwrite/);
  const out = await build(t);
  assert.throws(() => buildWeb({ outDir: out }), /must be empty/);
});
