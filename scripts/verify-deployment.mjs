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

async function read(name, url, type, binary = false) {
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
  return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
}

async function verify() {
  const site = directory(siteValue), data = directory(dataValue);
  const index = await read('Website', site, /text\/html/i);
  if (!index.includes('id="view"')) throw new Error('Website: dashboard markup not found');
  if (!index.includes('class="repo-link" href="https://github.com/studydev/icn-parking"')) throw new Error('Website: open-source repository link missing');
  const githubIcon = await read('GitHub icon', new URL('github.svg', site), /image\/svg\+xml/i);
  if (githubIcon !== await readFile(new URL('../web/github.svg', import.meta.url), 'utf8')) throw new Error('GitHub icon: deployed icon does not match the source');
  if (!index.includes('src="forecast.js"') || index.indexOf('src="forecast.js"') > index.indexOf('src="app.js"')) {
    throw new Error('Website: parking forecast script is missing or loads after the dashboard');
  }
  if (!index.includes('id="occupancy-scale"') || index.indexOf('src="occupancy.js"') < 0 || index.indexOf('src="occupancy.js"') > index.indexOf('src="app.js"')) {
    throw new Error('Website: shared occupancy scale is missing');
  }
  for (const file of ['forecast.js', 'occupancy.js', 'app.js', 'parking-fees.js', 'fees.js', 'style.css']) {
    const deployed = await read(file, new URL(file, site), file.endsWith('.css') ? /text\/css/i : /javascript/i);
    const expected = await readFile(new URL('../web/' + file, import.meta.url), 'utf8');
    if (deployed !== expected) throw new Error(`${file}: deployed forecast code does not match the source`);
  }
  if (!index.includes('href="fees.html"')) throw new Error('Website: parking fee calculator link not found');
  const fees = await read('Parking fee calculator', new URL('fees.html', site), /text\/html/i);
  if (!fees.includes('id="fee-form"') || !fees.includes('id="fee-results"') || fees.indexOf('src="parking-fees.js"') < 0 || fees.indexOf('src="parking-fees.js"') > fees.indexOf('src="fees.js"')) {
    throw new Error('Parking fee calculator: page or calculation scripts are missing');
  }
  if (!fees.includes('id="fee-confirm-times"') || !fees.includes('id="occupancy-scale"') || !fees.includes('id="fee-quick-discount"') || fees.indexOf('src="occupancy.js"') < 0 || fees.indexOf('src="occupancy.js"') > fees.indexOf('src="fees.js"')) {
    throw new Error('Parking fee calculator: quick selection, time confirmation, or shared scale is missing');
  }
  if (!fees.includes(`rel="canonical" href="${new URL('fees.html', site).href}"`)) throw new Error('Parking fee calculator: canonical URL mismatch');
  if (!index.includes('href="operations.html"')) throw new Error('Website: operating costs link not found');
  const operations = await read('Operating costs', new URL('operations.html', site), /text\/html/i);
  const expectedOperations = await readFile(new URL('../web/operations.html', import.meta.url), 'utf8');
  if (operations !== expectedOperations) throw new Error('Operating costs: deployed reference does not match the source');
  const costImage = await read('Cost reference image', new URL('operating-cost-reference.png', site), /image\/png/i, true);
  const expectedImage = await readFile(new URL('../web/operating-cost-reference.png', import.meta.url));
  if (!costImage.equals(expectedImage)) throw new Error('Cost reference image: deployed image does not match the source');
  const robots = await read('robots.txt', new URL('robots.txt', site), /text\/plain/i);
  if (!robots.includes(`Sitemap: ${new URL('sitemap.xml', site)}`)) throw new Error('robots.txt: sitemap URL mismatch');
  const sitemap = await read('sitemap.xml', new URL('sitemap.xml', site), /(?:text|application)\/xml/i);
  if (!sitemap.includes(`<loc>${site.href}</loc>`)) throw new Error('sitemap.xml: canonical URL mismatch');
  if (!sitemap.includes(`<loc>${new URL('fees.html', site).href}</loc>`)) throw new Error('sitemap.xml: fee page missing');
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
  console.log('Deployment verified: website, parking forecast code, fee calculator, operating costs reference and image, crawler files, configuration, and public data are responding.');
} catch (error) {
  console.error(`Deployment verification failed: ${error.message}`);
  process.exitCode = 1;
}
