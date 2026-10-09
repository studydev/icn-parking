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
