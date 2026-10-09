import { readFile } from 'node:fs/promises';

const siteValue = process.env.PUBLIC_SITE_URL;
const dataValue = process.env.DATA_BASE_URL;
if (!siteValue || !dataValue) {
  console.error('Set PUBLIC_SITE_URL and DATA_BASE_URL to verify a deployment.');
  process.exit(1);
}

function directory(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Deployment verification URLs must be public HTTPS directory URLs.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function read(name, url, type) {
  url = new URL(url);
  url.searchParams.set('deployment-check', String(Date.now()));
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
  } catch {
    throw new Error(`${name}: request failed or timed out`);
  }
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  if (!(response.headers.get('content-type') || '').match(type)) throw new Error(`${name}: unexpected content type`);
  return response.text();
}

async function verify() {
  const site = directory(siteValue), data = directory(dataValue);
  const index = await read('Website', site, /text\/html/i);
  if (!index.includes('id="view"')) throw new Error('Website: dashboard markup not found');
  if (!index.includes('href="operations.html"')) throw new Error('Website: operating costs link not found');
  const operations = await read('Operating costs', new URL('operations.html', site), /text\/html/i);
  const expectedOperations = await readFile(new URL('../web/operations.html', import.meta.url), 'utf8');
  if (operations !== expectedOperations) throw new Error('Operating costs: deployed reference does not match the source');
  const robots = await read('robots.txt', new URL('robots.txt', site), /text\/plain/i);
  if (!robots.includes(`Sitemap: ${new URL('sitemap.xml', site)}`)) throw new Error('robots.txt: sitemap URL mismatch');
  const sitemap = await read('sitemap.xml', new URL('sitemap.xml', site), /(?:text|application)\/xml/i);
  if (!sitemap.includes(`<loc>${site.href}</loc>`)) throw new Error('sitemap.xml: canonical URL mismatch');
  const config = await read('config.js', new URL('config.js', site), /javascript/i);
  const match = /window\.ICN_CONFIG\s*=\s*(\{.*\});/.exec(config);
  if (!match || JSON.parse(match[1]).dataBase !== data.href) throw new Error('config.js: data URL mismatch');
  const latest = JSON.parse(await read('Public data', new URL('latest.json', data), /application\/json/i));
  if (!Array.isArray(latest.zones) || !latest.zones.length || !latest.last_ok_at) {
    throw new Error('Public data: no successfully collected parking records');
  }
}

try {
  let failure;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await verify();
      failure = null;
      break;
    } catch (error) {
      failure = error;
      if (attempt < 6) {
        console.warn(`Verification attempt ${attempt} failed: ${error.message}; retrying after propagation.`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }
  if (failure) throw failure;
  console.log('Deployment verified: website, operating costs reference, crawler files, configuration, and public data are responding.');
} catch (error) {
  console.error(`Deployment verification failed: ${error.message}`);
  process.exitCode = 1;
}
