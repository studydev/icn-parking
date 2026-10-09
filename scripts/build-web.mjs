import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'web');
const files = [
  'index.html', 'operations.html', 'operating-cost-reference.png', 'config.js', 'app.js', 'style.css', 'shuttle.js', 'shuttle-map.js',
  'shuttle.json', 'staticwebapp.config.json', 'robots.txt', 'sitemap.xml'
];

function publicUrl(value, name, { rootOnly = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTPS URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must use HTTPS without credentials, query parameters, or fragments`);
  }
  if (rootOnly && url.pathname !== '/') throw new Error(`${name} must be a root website URL`);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

function verificationToken(value, name) {
  if (value && !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${name} contains unsupported characters`);
  }
  return value;
}

const escapeAttribute = value => value.replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
const inside = (child, parent) => child === parent || child.startsWith(parent + sep);

export function buildWeb({
  outDir = join(root, 'dist'),
  dataBaseUrl = './data/',
  siteUrl = '',
  naver = '',
  bing = ''
} = {}) {
  const target = resolve(outDir);
  if (inside(target, source) || inside(source, target) || inside(root, target)) {
    throw new Error('Build output must not overwrite the repository or web source');
  }
  const dataBase = dataBaseUrl === './data/' || dataBaseUrl === '/data/'
    ? dataBaseUrl : publicUrl(dataBaseUrl, 'DATA_BASE_URL');
  const site = siteUrl ? publicUrl(siteUrl, 'PUBLIC_SITE_URL', { rootOnly: true }) : '';
  const naverToken = verificationToken(naver, 'NAVER_SITE_VERIFICATION');
  const bingToken = verificationToken(bing, 'BING_SITE_VERIFICATION');
  if (existsSync(target) && readdirSync(target).length) {
    throw new Error('Build output must be empty; remove the previous build before rebuilding');
  }
  mkdirSync(target, { recursive: true });
  for (const file of files) cpSync(join(source, file), join(target, file));

  writeFileSync(join(target, 'config.js'), `window.ICN_CONFIG = ${JSON.stringify({ dataBase })};\n`);
  const metadata = [
    site ? `  <link rel="canonical" href="${escapeAttribute(site)}">` : '',
    naverToken ? `  <meta name="naver-site-verification" content="${naverToken}">` : '',
    bingToken ? `  <meta name="msvalidate.01" content="${bingToken}">` : ''
  ].filter(Boolean).join('\n');
  const index = readFileSync(join(target, 'index.html'), 'utf8');
  const marker = '  <!-- Deployment metadata is injected by scripts/build-web.mjs. -->';
  if (!index.includes(marker)) throw new Error('Deployment metadata marker is missing from index.html');
  writeFileSync(join(target, 'index.html'), index.replace(marker, metadata));

  if (site) {
    for (const file of ['robots.txt', 'sitemap.xml']) {
      writeFileSync(join(target, file), readFileSync(join(target, file), 'utf8').replaceAll('__SITE_URL__', site));
    }
  } else {
    writeFileSync(join(target, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    unlinkSync(join(target, 'sitemap.xml'));
  }

  const hostConfigPath = join(target, 'staticwebapp.config.json');
  const hostConfig = JSON.parse(readFileSync(hostConfigPath, 'utf8'));
  const headers = hostConfig.globalHeaders;
  const dataOrigin = dataBase.startsWith('https:') ? new URL(dataBase).origin : '';
  headers['content-security-policy'] = headers['content-security-policy'].replace(
    /connect-src[^;]*/,
    `connect-src 'self'${dataOrigin ? ' ' + dataOrigin : ''}`
  );
  writeFileSync(hostConfigPath, JSON.stringify(hostConfig, null, 2) + '\n');
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1) throw new Error('Usage: node scripts/build-web.mjs [output-directory]');
    buildWeb({
      outDir: args[0],
      dataBaseUrl: process.env.DATA_BASE_URL || './data/',
      siteUrl: process.env.PUBLIC_SITE_URL || '',
      naver: process.env.NAVER_SITE_VERIFICATION || '',
      bing: process.env.BING_SITE_VERIFICATION || ''
    });
    console.log('Static web build completed.');
  } catch (error) {
    console.error(`Web build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
