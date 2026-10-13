const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const DAY = 288;
test('search discovery source contains only deployment-neutral templates', () => {
  const web = path.join(__dirname, '../web');
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const robots = fs.readFileSync(path.join(web, 'robots.txt'), 'utf8');
  const sitemap = fs.readFileSync(path.join(web, 'sitemap.xml'), 'utf8');
  assert.match(html, /Deployment metadata is injected/);
  assert.doesNotMatch(html, /name="(?:naver-site-verification|msvalidate\.01)"/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(robots, /^User-agent: \*\nAllow: \//);
  assert.match(robots, /^Sitemap: __SITE_URL__sitemap\.xml$/m);
  assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), ['__SITE_URL__', '__SITE_URL__fees.html']);
  const config = JSON.parse(fs.readFileSync(path.join(web, 'staticwebapp.config.json'), 'utf8'));
  for (const [route, type] of [['/robots.txt', 'text/plain; charset=utf-8'], ['/sitemap.xml', 'application/xml; charset=utf-8']]) {
    const rule = config.routes.find(r => r.route === route);
    assert(rule, `${route} should be served as a file rather than an HTML rewrite`);
    assert.equal(rule.headers['content-type'], type);
    assert.equal(rule.headers['cache-control'], 'no-cache, max-age=0, must-revalidate');
    assert.equal(rule.rewrite, undefined);
    assert.equal(rule.allowedRoles, undefined);
  }
});

const ZONES = [
  { id: 's1', terminal: 'T1', category: '단기', name: '단기 지하1층', order: 1 },
  { id: 'l1', terminal: 'T1', category: '장기', name: '장기 P1', order: 2 },
  { id: 't1', terminal: 'T1', category: '타워', name: '주차타워 P1', order: 3 },
  { id: 'r1', terminal: 'T1', category: '예약', name: '예약 P5', order: 4 }
];
const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));

/* today: 단기 80%, 장기 120/100 + 타워 96/100. Other days: 단기 60%, 장기·타워 90%. 예약 always 50%. */
function dayDoc(date, today) {
  const fill = v => new Array(DAY).fill(v), cap = fill(100);
  const p = today ? { s1: 80, l1: 120, t1: 96, r1: 50 } : { s1: 60, l1: 90, t1: 90, r1: 50 };
  return { v: 1, date, zones: Object.fromEntries(ZONES.map(z => [z.id, { p: fill(p[z.id]), c: cap }])) };
}

async function runtime(hash = '#week/T1', options = {}) {
  const clock = { value: options.now ? Date.parse(options.now) : Date.now() };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.value])); }
    static now() { return clock.value; }
  }
  const today = ymd(new Date(clock.value + 9 * 3600e3)), start = options.start || addDays(today, -35);
  const zones = options.zones || ZONES;
  const documentOfDay = date => options.dayDoc ? options.dayDoc(date, today) : dayDoc(date, date === today);
  const days = {};
  for (let date = start; date <= today; date = addDays(date, 1)) days[date] = { T1: { max: 0.9 } };
  const files = {
    'latest.json': { start, last_ok_at: new Date(clock.value).toISOString(), zones: zones.map(z => ({ ...z, p: documentOfDay(today).zones[z.id].p[0], c: documentOfDay(today).zones[z.id].c[0] })) },
    'calendar.json': { start, days, holidays: options.holidays || {} }
  };
  const elements = new Map(['status', 'terms', 'tabs', 'occupancy-scale', 'fee-link', 'foot-start', 'view', 'layout-toggle', 'overlay'].map(id => [id, { innerHTML: '', textContent: '', setAttribute(k, v) { this[k] = v; } }]));
  const listeners = {};
  const stored = new Map(options.stored || []), bodyClasses = new Set(), requested = [];
  const ctx = vm.createContext({
    console, Date: ClockDate, Math, JSON, Promise, Map, Set, Array, Object, Number, String, isNaN, Infinity,
    window: { innerWidth: options.mobile ? 375 : 1280, addEventListener: () => {}, matchMedia: () => ({ matches: !!options.mobile }) },
    location: { hash },
    history: { replaceState: (a, b, h) => { ctx.location.hash = h; } },
    localStorage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    document: {
      body: { classList: { toggle: (name, on) => on ? bodyClasses.add(name) : bodyClasses.delete(name), contains: name => bodyClasses.has(name) } },
      getElementById: id => elements.get(id) || (id.startsWith('rng-') ? elements.set(id, { innerHTML: '', contains: () => false, querySelectorAll: () => [] }).get(id) : null),
      querySelectorAll: () => [],
      addEventListener: (name, fn) => { listeners[name] = fn; },
      activeElement: null
    },
    fetch: async url => {
      const name = url.replace('./data/', '');
      requested.push(name);
      const m = /^days\/(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      const body = m ? documentOfDay(m[1]) : files[name];
      return { ok: !!body, status: body ? 200 : 404, json: async () => JSON.parse(JSON.stringify(body)) };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/occupancy.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/forecast.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8'), ctx);
  const run = code => vm.runInContext(code, ctx);
  for (let i = 0; i < 20 && run('D.pending.size || !D.latest'); i++) await new Promise(r => setImmediate(r));
  await run('ensure()');
  return { run, elements, listeners, today, stored, bodyClasses, clock, requested };
}

test('mobile/desktop layout toggle updates the shell and persists the choice', async () => {
  const { run, elements, listeners, stored, bodyClasses } = await runtime();
  assert.equal(run('layoutMode()'), 'desktop');
  listeners.click({ target: { closest: () => ({ dataset: { a: 'layout' } }) } });
  assert.equal(run('layoutMode()'), 'mobile');
  assert(bodyClasses.has('layout-mobile'));
  assert.equal(stored.get('icn.layout'), 'mobile');
  assert.equal(elements.get('layout-toggle').textContent, '데스크톱 보기');
  listeners.click({ target: { closest: () => ({ dataset: { a: 'layout' } }) } });
  assert.equal(run('layoutMode()'), 'desktop');
  assert(bodyClasses.has('layout-desktop'));
  assert.equal(elements.get('layout-toggle').textContent, '모바일 보기');
});

test('mobile navigation exposes all six menus with short labels and working tab selection', async () => {
  const { run, elements, listeners } = await runtime('#week/T1', { mobile: true });
  const labels = () => [...elements.get('tabs').innerHTML.matchAll(/<(?:button|a)[^>]*>([^<]+)<\/(?:button|a)>/g)].map(([, label]) => label);
  assert.deepEqual(labels(), ['주차 현황', '날짜별', '기간별', '터미널 이동', '안내', '주차요금']);
  assert.doesNotMatch(elements.get('tabs').innerHTML, /<details|<summary|더 보기|mobile-menu/);
  assert.match(elements.get('tabs').innerHTML, /<a href="fees.html\?terminal=T1">주차요금<\/a>/);
  for (const id of ['day', 'range', 'access', 'about', 'week']) {
    listeners.click({ target: { closest: () => ({ dataset: { a: 'tab', v: id } }) } });
    await run('ensure()');
    assert.equal(run('S.tab'), id);
    assert.match(elements.get('tabs').innerHTML, new RegExp(`data-v="${id}" class="on" aria-current="page"`));
    assert.equal((elements.get('tabs').innerHTML.match(/aria-current="page"/g) || []).length, 1);
  }
});

test('desktop keeps its original menu names while mobile menu styles prevent wrapping', async () => {
  const { elements } = await runtime();
  const labels = [...elements.get('tabs').innerHTML.matchAll(/<(?:button|a)[^>]*>([^<]+)<\/(?:button|a)>/g)].map(([, label]) => label);
  assert.deepEqual(labels, ['주차장 현황', '날짜별 기록', '기간별 기록', '터미널 이동', '데이터 안내', '주차요금']);
  const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
  assert.match(css, /body\.layout-mobile \.tabs\{[^}]*flex-wrap:nowrap/);
  assert.match(css, /body\.layout-mobile \.tabs button,body\.layout-mobile \.tabs>a\{[^}]*white-space:nowrap/);
  assert.doesNotMatch(css, /mobile-menu/);
});

test('mobile stylesheet refits dense menu content instead of clipping the page', () => {
  const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  assert.match(html, /id="layout-toggle" data-a="layout"/);
  assert.match(css, /body\.layout-mobile \.dgrid \.row\{grid-template-columns:92px repeat\(288,minmax\(0,1fr\)\)/);
  assert.match(css, /body\.layout-mobile \.timeheat\{--history-label:110px\}/);
  assert.match(css, /\.th-head,\.th-row\{display:grid;grid-template-columns:var\(--history-label\) repeat\(var\(--history-days\),288px\)/);
  assert.match(css, /body\.layout-mobile \.fc-row\{grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
  assert.match(css, /body\.layout-mobile \.shuttle-layout \.acc-side\{display:flex;order:-1\}/);
  assert.match(css, /body\.layout-desktop \.page\{min-width:1180px\}/);
});

test('long-term parking groups the tower with the lot and caps each zone at 100% unless overflow is enabled', async () => {
  const { run, today } = await runtime();
  assert.deepEqual(JSON.parse(run("JSON.stringify(groupsOf('T1').map(g => [g.id, g.zones.map(z => z.id)]))")),
    [['단기', ['s1']], ['장기', ['l1', 't1']], ['예약', ['r1']]]);
  const g = JSON.parse(run(`JSON.stringify(grpDay('T1', '장기', '${today}'))`));
  assert.equal(g.oc[0], (100 + 96) / 200);
  assert.equal(g.o[0], (120 + 96) / 200);
  assert.equal(g.a[0], 4);
  const total = JSON.parse(run(`JSON.stringify(grpDay('T1', '합계', '${today}'))`));
  assert.equal(total.oc[0], (80 + 100 + 96) / 300, 'terminal total excludes 예약');
});

test('occupancy colors darken from blue with red mixed near 90%, then deepen from dark red to blood red', async () => {
  const { run, today } = await runtime();
  const colors = JSON.parse(run('JSON.stringify([0, .7, .8, .86, .9, .91, .925, .94, .95, .975, 1].map(occColor))'));
  const samples = Array.from({ length: 101 }, (_, i) => i / 1000 + 0.9);
  const dense = JSON.parse(run(`JSON.stringify(${JSON.stringify(samples)}.map(occColor))`));
  assert.equal(colors[0], '#2e9d6a');
  assert.equal(colors[1], '#2e9d6a', 'occupancy through 70% stays green');
  assert.notEqual(colors[2], colors[1], 'occupancy over 70% transitions toward dark blue');
  assert.equal(colors[4], '#2d6c9b', '90% is a visible blue');
  assert.equal(colors[6], '#854b69', 'around 92.5% mixes red into blue');
  assert.equal(colors[8], '#ac2834', '95% is a recognizable red');
  assert.equal(colors[10], '#a3222e', '100% stays red rather than turning black');
  assert.equal(run('occColor(1.1)'), colors[10], 'over-capacity values keep the 100% color');
  const luminance = c => {
    const rgb = c.slice(1).match(/../g).map(v => parseInt(v, 16) / 255);
    const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  for (let i = 0; i < dense.length - 1; i++) assert(luminance(dense[i + 1]) <= luminance(dense[i]) + 0.001, `${dense[i]} should not visibly brighten toward 100%`);
  assert(luminance(colors[10]) > 0.08, '100% remains a visible red, not near black');
  run(`S.tab = 'day'; S.selDay = '${today}'; renderDay();`);
  assert(run("document.getElementById('view').innerHTML").includes(`background:${run('occColor(.8)')}`));
  run("S.metric = 'avail'; renderDay();");
  const dayHtml = run("document.getElementById('view').innerHTML");
  assert.match(dayHtml, /단기 지하1층 00:00 · 80%/);
  assert(dayHtml.includes(`background:${run('occColor(.8)')}`), 'day heatmap color remains occupancy based');
});

test('occupancy charts start at 0% and only extend above 100% (with headroom) when overflow is shown', async () => {
  const { run } = await runtime();
  const model = () => JSON.parse(run('(() => { const m = chartModel(weekCfg()); return JSON.stringify({ hi: m.hi, labels: m.yTicks.map(t => t.label) }); })()'));
  let m = model();
  assert.equal(m.hi, 1);
  assert.equal(m.labels[0], '0%');
  assert.equal(m.labels.at(-1), '100%');
  run('S.over = true; D.cache.clear();');
  m = model();
  assert(m.hi > 1.08, `headroom above the 108% peak, got ${m.hi}`);
  assert(m.labels.includes('100%') && m.labels[0] === '0%');
});

test('comparison lines are drawn at half the previous opacity, under the measured lines', async () => {
  const { run } = await runtime();
  const lines = JSON.parse(run('JSON.stringify(chartModel(weekCfg()).lines.map(l => [l.cmp, l.op]))'));
  assert(lines.some(([c]) => c === 1));
  for (const [c, op] of lines) assert.equal(op, c ? 0.38 : 1);
  assert.equal(lines.findIndex(([c]) => c === 0), lines.filter(([c]) => c === 1).length);
});

test('linked forecast follows the selected comparison line and begins at the current value', async () => {
  const { run } = await runtime('#week/T1', { now: '2026-10-13T11:00:00+09:00' });
  run('S.linkedForecast = true;');
  const lines = JSON.parse(run('JSON.stringify(chartModel(weekCfg()).lines.filter(l => l.forecast).map(l => ({z:l.z,offset:l.offset,anchorValue:l.anchorValue,d:l.d})))'));
  assert.equal(lines.length, 3);
  const short = lines.find(l => l.z === 's1');
  assert.equal(Math.round(short.offset * 100), 20, 'today 80% minus comparison week 60%');
  assert.equal(Math.round(short.anchorValue * 100), 80);
  assert.match(short.d, /^M/);
  assert(lines.every(l => l.d && l.d.includes('C')));
  const svg = run('chartHtml(chartModel(weekCfg()))');
  assert.match(svg, /data-forecast="true"/);
  assert.match(svg, /연결 예측 · 오프셋 \+20%p/);
  run("S.cmp = 0;");
  assert.equal(JSON.parse(run('JSON.stringify(chartModel(weekCfg()).lines.filter(l => l.forecast))')).length, 0);
  run("S.cmp = 1; S.metric = 'avail';");
  const available = JSON.parse(run("JSON.stringify(chartModel(weekCfg()).lines.find(l => l.forecast && l.z === 's1'))"));
  assert.equal(available.offset, -20, 'current 20 available spaces minus 40 at the comparison time');
  assert.equal(Math.round(available.anchorValue), 20);
});

test('week controls put comparison first and connected forecast is a toggle', async () => {
  const { run, elements } = await runtime();
  run('renderWeek()');
  const html = elements.get('view').innerHTML;
  assert(html.indexOf('aria-label="점선 비교"') < html.indexOf('data-v="occ"'));
  assert.match(html, /data-a="linked"/);
  run('S.metric = "avail"; renderWeek()');
  assert.match(elements.get('view').innerHTML, /<span class="zc-p"[^>]*>가용 20대<\/span>/);
});

const HOLIDAYS_2026 = { '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날' };
const SUNDAY = { now: '2026-10-11T11:00:00+09:00', holidays: HOLIDAYS_2026 };

const mobileFixture = () => ({
  ...SUNDAY, mobile: true,
  zones: [...ZONES, ...ZONES.map(zone => ({ ...zone, terminal: 'T2', id: 't2-' + zone.id }))],
  dayDoc: (date, today) => {
    const doc = dayDoc(date, date === today);
    return { ...doc, zones: { ...doc.zones, ...Object.fromEntries(Object.entries(doc.zones).map(([id, zone]) => ['t2-' + id, zone])) } };
  }
});

test('mobile lists individual T1/T2 short/long zones with nine predictions each, without advanced filters', async () => {
  const { run, elements } = await runtime('#week/T2', mobileFixture());
  const html = elements.get('view').innerHTML;
  assert.equal(run('compactMobile()'), true);
  assert.equal((html.match(/class="quick-card"/g) || []).length, 2);
  assert.equal((html.match(/class="quick-zone"/g) || []).length, 3);
  assert.equal((html.match(/class="quick-slot(?:\s|")/g) || []).length, 27);
  assert.doesNotMatch(html, /id="plot"|data-a="cmp"|data-a="weeks"|data-a="over"/);
  assert.doesNotMatch(html, /data-term="T1"/);
  assert.match(html, /T2 · 단기주차장/);
  assert.match(html, /T2 · 장기주차장/);
  const data = JSON.parse(run("JSON.stringify(compactParking('T1', '장기'))"));
  assert.deepEqual(data.zones.map(row => row.zone.id), ['l1', 't1']);
  for (const row of data.zones) {
    assert.deepEqual(row.cells.map(cell => cell.minutes), [20, 40, 60, 80, 100, 120, 140, 160, 180]);
    assert(row.cells.every(cell => Number.isFinite(cell.occupancy) && cell.occupancy <= 1 && Number.isInteger(cell.available) && cell.available >= 0));
  }
  assert.equal(data.zones[0].current.available, 0, 'the overfull lot has no spaces');
  assert.equal(data.zones[1].current.available, 4, 'the tower retains its own remaining spaces');
  assert.match(elements.get('tabs').innerHTML, /href="fees.html\?terminal=T2"/);
  assert.doesNotMatch(elements.get('tabs').innerHTML, /더 보기/);
  assert.match(elements.get('tabs').innerHTML, /data-v="day"[^>]*>날짜별<\/button>/);
});

test('mobile forecasts are nine left-to-right count-only heatmap cells in the existing occupancy palette', async () => {
  const { run, elements } = await runtime('#week/T1', mobileFixture());
  const html = elements.get('view').innerHTML;
  const cells = [...html.matchAll(/class="quick-slot"[^>]*data-minutes="(\d+)"[^>]*data-occupancy="([^"]+)"[^>]*style="background:([^;]+);color:([^"]+)"[^>]*><b>(\d+)<\/b><\/div>/g)];
  assert.equal(cells.length, 27);
  assert.deepEqual(cells.slice(0, 9).map(cell => Number(cell[1])), [20, 40, 60, 80, 100, 120, 140, 160, 180]);
  for (const cell of cells) {
    assert.equal(cell[3], run(`occColor(${Number(cell[2])})`));
    assert.equal(cell[4], run(`contrastText('${cell[3]}')`));
  }
  assert.equal((html.match(/<time /g) || []).length, 9);
  assert.doesNotMatch(html, /quick-slot-values/);
  assert.match(html, /title="T1 단기 지하1층 20분 후 .* 예상 가용 \d+대 점유율/);
  assert.match(html, /title="T1 주차타워 P1 20분 후 .* 예상 가용 \d+대 점유율/);
  const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
  assert.match(css, /\.quick-slots\{display:grid;grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
});

test('five-digit availability uses the compact count typography without changing the forecast values', async () => {
  const { run, elements } = await runtime('#week/T1', {
    ...SUNDAY, mobile: true, zones: [ZONES[0]],
    dayDoc: date => ({ date, zones: { s1: { p: new Array(DAY).fill(6000), c: new Array(DAY).fill(20000) } } })
  });
  const forecast = JSON.parse(run("JSON.stringify(compactParking('T1','단기').zones[0].cells)"));
  assert(forecast.every(cell => cell.available >= 10000 && cell.available <= 20000));
  assert.equal((elements.get('view').innerHTML.match(/<b class="wide-count">\d+<\/b>/g) || []).length, 9);
});

test('compact predictions ignore detailed filters and allow a reversible detailed mobile view', async () => {
  const { run, elements, listeners } = await runtime('#week/T1', mobileFixture());
  run("S.igoto = false; S.over = true; S.act = {단기:false,장기:false,예약:false}; render();");
  assert.equal((elements.get('view').innerHTML.match(/class="quick-card"/g) || []).length, 2);
  assert.equal((elements.get('view').innerHTML.match(/class="quick-zone"/g) || []).length, 3);
  assert(run("compactParking('T2','단기').zones.every(row => row.cells.every(cell => cell.available != null))"));
  listeners.click({ target: { closest: () => ({ dataset: { a: 'detail', v: '1' } }) } });
  assert.equal(run('compactMobile()'), false);
  assert.match(elements.get('view').innerHTML, /id="plot"/);
  assert.match(elements.get('view').innerHTML, /data-a="detail" data-v="0"/);
  listeners.click({ target: { closest: () => ({ dataset: { a: 'detail', v: '0' } }) } });
  assert.equal(run('compactMobile()'), true);
  assert.equal(run('S.igoto'), false, 'the simplified view must not overwrite detailed forecast preferences');
});

test('per-zone forecasts cross midnight and missing observations do not hide other zones', async () => {
  const { run, elements } = await runtime('#week/T1', { ...mobileFixture(), now: '2026-10-11T23:55:00+09:00' });
  const data = JSON.parse(run("JSON.stringify(compactParking('T1','단기'))"));
  assert.equal(data.zones[0].cells[0].date, '2026-10-12');
  assert.equal(data.zones[0].cells[0].slot, 3);
  assert.equal(data.zones[0].cells[8].slot, 35);
  run("for (const doc of D.days.values()) if (doc) delete doc.zones['t2-t1']; D.cache.clear(); S.term = 'T2'; render();");
  assert(run("compactParking('T2','장기').zones.find(row => row.zone.id === 't2-t1').cells.every(cell => cell.available == null)"));
  assert(run("compactParking('T2','장기').zones.find(row => row.zone.id === 't2-l1').cells.every(cell => cell.available != null)"));
  assert(run("compactParking('T1','장기').zones.every(row => row.cells.every(cell => cell.available != null))"));
  assert.match(elements.get('view').innerHTML, /실측이 없어/);
  run('D.latest.stale = true; render();');
  assert(run("compactParking('T1','단기').zones.every(row => row.cells.every(cell => cell.available == null))"));
  assert.match(elements.get('view').innerHTML, /수집이 지연되어/);
});

test('each zone labels its own current remaining spaces, including zero, missing, closed and changed-capacity states', async () => {
  const { run, elements } = await runtime('#week/T2', mobileFixture());
  const rows = () => new Map([...elements.get('view').innerHTML.matchAll(/<section class="quick-zone" data-zone="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)]
    .map(([, id, html]) => [id, html]));
  run(`
    D.latest.zones.find(zone => zone.id === 't2-s1').p = 30;
    D.latest.zones.find(zone => zone.id === 't2-l1').p = 140;
    D.latest.zones.find(zone => zone.id === 't2-t1').p = 55;
    D.zones = {}; render();
  `);
  run("S.term = 'T1'; render();");
  for (const [id, count] of [['s1', 20], ['l1', 0], ['t1', 4]]) {
    assert.match(rows().get(id), new RegExp(`<span>현재 주차 가능</span><b>${count}대</b><span>/ 전체 100대</span>`));
  }
  assert.match(rows().get('l1'), /<h3>P1<\/h3>/);
  assert.match(rows().get('t1'), /<h3>타워 P1<\/h3>/);
  run("S.term = 'T2'; render();");
  for (const [id, count] of [['t2-s1', 70], ['t2-l1', 0], ['t2-t1', 45]]) {
    assert.match(rows().get(id), new RegExp(`<span>현재 주차 가능</span><b>${count}대</b><span>/ 전체 100대</span>`));
  }
  run("D.latest.zones.find(zone => zone.id === 't2-t1').p = null; D.zones = {}; render();");
  assert.match(rows().get('t2-t1'), /주차 가능 대수 확인 필요/);
  assert.equal((rows().get('t2-t1').match(/class="quick-slot unavailable"/g) || []).length, 9);
  assert(run("compactParking('T2','장기').zones.find(row => row.zone.id === 't2-l1').cells.every(cell => cell.available != null)"));
  run("D.latest.zones.find(zone => zone.id === 't2-t1').c = 0; D.zones = {}; render();");
  assert.match(rows().get('t2-t1'), /현재 운영 중단 구역/);
  assert.equal(rows().size, 3, 'closed zones remain labelled rather than disappearing');
  run("D.latest.zones.find(zone => zone.id === 't2-t1').c = 200; D.latest.zones.find(zone => zone.id === 't2-t1').p = 55; D.zones = {}; render();");
  assert.match(rows().get('t2-t1'), /최신 면수와 예측 기준 면수가 달라/);
  assert.match(rows().get('t2-t1'), /<b>145대<\/b>/, 'current availability still uses the latest known capacity');
  run('D.latest.stale = true; render();');
  assert.match(rows().get('t2-t1'), /마지막 수집 · 갱신 지연/);
});

test('terminal selection exposes its own short/long/tower zones without reservation zones or the other terminal', async () => {
  const definitions = [
    ['T1', '단기', ['지하1층', '지하2층', '지하3층', '지상층']],
    ['T1', '장기', ['P1', 'P2', 'P3']], ['T1', '타워', ['P1', 'P2']], ['T1', '예약', ['P5']],
    ['T2', '단기', ['지하M층', '지상1층', '지상2층', '지상3층', '지상4층']],
    ['T2', '장기', ['주차장']], ['T2', '타워', ['P1', 'P2']], ['T2', '예약', ['주차장']]
  ];
  const zones = definitions.flatMap(([terminal, category, names], group) => names.map((name, order) => ({
    id: `zone-${group}-${order}`, terminal, category, name: `${category === '타워' ? '주차타워' : category} ${name}`, order
  })));
  const { run, elements, listeners } = await runtime('#week/T2', {
    ...SUNDAY, mobile: true, zones,
    dayDoc: date => ({ date, zones: Object.fromEntries(zones.map((zone, index) => [zone.id, {
      p: new Array(DAY).fill(40 + index), c: new Array(DAY).fill(100)
    }])) })
  });
  const groups = JSON.parse(run("JSON.stringify(['T1','T2'].flatMap(term => ['단기','장기'].map(gid => compactParking(term,gid))))"));
  assert.deepEqual(groups.map(group => group.zones.length), [4, 5, 5, 3]);
  const shown = () => [...elements.get('view').innerHTML.matchAll(/class="quick-zone" data-zone="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(shown(), zones.filter(zone => zone.category !== '예약' && zone.terminal === 'T2').map(zone => zone.id));
  assert.equal(shown().length, 8);
  assert.equal((elements.get('view').innerHTML.match(/class="quick-slot(?:\s|")/g) || []).length, 72);
  listeners.click({ target: { closest: () => ({ dataset: { a: 'term', v: 'T1' } }) } });
  await run('ensure()');
  assert.deepEqual(shown(), zones.filter(zone => zone.category !== '예약' && zone.terminal === 'T1').map(zone => zone.id));
  assert.equal(shown().length, 9);
  assert.equal((elements.get('view').innerHTML.match(/class="quick-slot(?:\s|")/g) || []).length, 81);
  assert.match(elements.get('terms').innerHTML, /data-v="T1" class="on" aria-pressed="true"/);
  assert.match(run('location.hash'), /#week\/T1/);
  assert.equal(elements.get('fee-link').href, 'fees.html?terminal=T1');
  assert.match(elements.get('tabs').innerHTML, /href="fees.html\?terminal=T1"/);
  for (const group of groups) for (const row of group.zones) {
    assert.equal(row.current.available, 60 - zones.findIndex(zone => zone.id === row.zone.id));
    assert.equal(row.cells.length, 9);
  }
});

test('compact clock labels appear once above the heatmaps and match every forecast slot across midnight', async () => {
  const { run, elements } = await runtime('#week/T1', mobileFixture());
  const labels = () => [...elements.get('view').innerHTML.matchAll(/<time datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/g)];
  assert.deepEqual(labels().map(([, , text]) => text), ['11:20', '11:40', '12:00', '12:20', '12:40', '13:00', '13:20', '13:40', '14:00']);
  assert(elements.get('view').innerHTML.indexOf('class="quick-times"') < elements.get('view').innerHTML.indexOf('class="quick-card"'));
  assert.doesNotMatch(elements.get('view').innerHTML.slice(elements.get('view').innerHTML.indexOf('class="quick-card"')), /<time /);
  run("D.now = {date: '2026-10-11', idx: 287}; D.cache.clear(); render();");
  const times = labels();
  assert.equal(times.length, 9);
  assert.equal(times[0][1], '2026-10-12T00:15+09:00');
  assert.match(times[0][2], /00:15<small>내일<\/small>/);
  assert.equal(times[8][1], '2026-10-12T02:55+09:00');
  const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
  assert.doesNotMatch(css, /parking-compact #terms\{display:none/);
});

test('the header provides one shared occupancy scale on all tabs without duplicated content legends', async () => {
  const { run, elements, listeners } = await runtime('#week/T1', mobileFixture());
  const scale = elements.get('occupancy-scale').innerHTML;
  assert.match(scale, /점유율 0%/);
  assert.match(scale, /만차 도달\(98%\+\)/);
  assert.match(scale, /#a3222e 100%/);
  for (const id of ['week', 'day', 'range', 'access', 'about']) {
    listeners.click({ target: { closest: () => ({ dataset: { a: 'tab', v: id } }) } });
    await run('ensure()');
    assert.equal(elements.get('occupancy-scale').innerHTML, scale);
    assert.doesNotMatch(elements.get('view').innerHTML, /occ-gradient|occ-legend|occupancy-bar|만차 도달\(98%\+\)/);
  }
  run("S.tab = 'week'; S.mobileDetail = true; render();");
  assert.doesNotMatch(elements.get('view').innerHTML, /occ-legend|occupancy-bar/);
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  assert.equal((html.match(/id="occupancy-scale"/g) || []).length, 1);
  assert(html.indexOf('id="occupancy-scale"') > html.indexOf('id="tabs"'));
});

test('forecast explanations and error notices remain at the very bottom, below both charts', async () => {
  const { run, elements } = await runtime('#week/T1', SUNDAY);
  const verifyPosition = () => {
    const html = elements.get('view').innerHTML;
    const notes = html.indexOf('class="sec lite forecast-notes"');
    assert(notes > html.indexOf('id="plot"'));
    assert(notes > html.indexOf('예상 점유율 · 지난 3시간 + 앞으로 6시간'));
    assert(notes > html.lastIndexOf('class="fc-row"'));
    assert(html.indexOf('class="muted forecast-window"') > notes);
    assert.doesNotMatch(html.slice(0, notes), /forecast-notice|forecast-window|실험적 참고 예상/);
    assert.match(html.slice(notes), /aria-label="예측 안내"/);
    assert.match(html, /<\/section>\s*$/);
    return html.slice(notes);
  };
  assert.match(verifyPosition(), /IGoTo 예측 · 실험적 참고 예상/);
  run("D.cal.holidays = {}; D.cache.clear(); renderWeek();");
  assert.match(verifyPosition(), /공휴일 달력이 없어/);
  run('S.igoto = false; renderWeek();');
  assert.doesNotMatch(verifyPosition(), /forecast-notice/);
});

test('the default shows exactly 72 hours of history and 96 hours of predictions, independent of weekdays', async () => {
  const { run, elements, requested } = await runtime('#week/T1', SUNDAY);
  assert.equal(run('S.futureDays'), 4);
  assert.equal(run('S.igoto'), true);
  assert.equal(run('weekCfg().nd'), 8);
  assert.equal(run('weekCfg().d0'), '2026-10-08');
  run('S.cmp = 0; renderWeek()');
  assert.equal(run('WM.nowG - WM.a'), 3 * DAY);
  assert.equal(run('WM.b - WM.nowG'), 4 * DAY);
  assert.equal(run('WM.span'), 7 * DAY);
  const forecast = JSON.parse(run("JSON.stringify(WM.forecasts.get('igoto|s1').values)"));
  const first = run('WM.nowG'), last = run('WM.b');
  assert(forecast.slice(first, last).every(value => Number.isFinite(value)));
  assert(forecast.slice(last).every(value => value == null));
  assert.equal(run("WM.lines.filter(line => line.model === 'igoto' && line.d).length"), 3);
  assert.match(elements.get('view').innerHTML, /data-a="igoto"/);
  assert.match(elements.get('view').innerHTML, /과거 3일과 향후 4일/);
  assert.match(elements.get('view').innerHTML, />최근 3일<\/button>/);
  assert(requested.filter(name => name.startsWith('days/')).every(name => name.slice(5, 15) <= '2026-10-11'), 'future day records must never be fetched');
  assert.equal(run("neededDays().filter(date => date <= D.now.date && date >= addDays(D.now.date, -27)).length") >= 28, true);
});

test('seven-day selection spans the next week, stays capped, and persists across a reload', async () => {
  const { run, listeners, stored } = await runtime('#week/T1', SUNDAY);
  listeners.click({ target: { closest: () => ({ dataset: { a: 'future', v: '7' } }) } });
  await run('ensure()');
  assert.equal(run('S.futureDays'), 7);
  assert.equal(run('weekCfg().nd'), 11);
  assert.equal(run("slotRange(D.now.date,S.win[1]).date"), '2026-10-18');
  const values = JSON.parse(run("JSON.stringify(WM.forecasts.get('igoto|l1').values)"));
  assert(values.slice(run('WM.nowG'), run('WM.b')).every(value => Number.isFinite(value) && value <= 1));
  assert.equal(run('WM.b - WM.nowG'), 7 * DAY);
  assert.equal(stored.get('icn.forecastDays.v2'), '7');
  assert.throws(() => listeners.click({ target: { closest: () => ({ dataset: { a: 'future', v: '8' } }) } }), /3·4·5·7/);
  const again = await runtime('#week/T1', { ...SUNDAY, stored: [...stored] });
  assert.equal(again.run('S.futureDays'), 7);
  assert.equal(again.run('weekCfg().nd'), 11);
  const old = await runtime('#week/T1', { ...SUNDAY, stored: [['icn.forecastDays', '3']] });
  assert.equal(old.run('S.futureDays'), 4, 'the old week-boundary default must not override the new rolling default');
});

test('IGoTo future-only zoom, tooltip, overview, category hit and overflow/availability retain useful predictions', async () => {
  const { run, elements } = await runtime('#week/T1', SUNDAY);
  run('S.cmp = 0; S.win = [DAY, 3 * DAY]; renderWeek(); S.hf = .2; renderOverlay();');
  assert.equal(run('WM.hasData'), true);
  assert.equal(run("WM.lines.filter(line => line.model === 'igoto' && line.d).length"), 3);
  assert.match(elements.get('view').innerHTML, /IGoTo 예측/);
  assert.match(elements.get('overlay').innerHTML, /참고 예측/);
  assert.match(elements.get('overlay').innerHTML, /IGoTo \d+%/);
  run("hitLine(.2, WM.yv(WM.forecasts.get('igoto|s1').values[WM.a + Math.round(.2 * WM.span)]) / H);");
  assert.equal(run("S.act['단기']"), false, 'clicking a future forecast line toggles its category');
  assert.match(run("overviewHtml('T1', weekCfg())"), /stroke-dasharray:9 3 2 3/);
  assert.doesNotThrow(() => run('S.win = [0, 144]; renderWeek()'), 'historical zoom must not allocate a negative-sized forecast segment');
  run('S.win = [0, weekEnd()]; S.over = true; D.cache.clear(); renderWeek();');
  assert(run("WM.forecasts.get('igoto|l1').values[WM.nowG]") > 1);
  assert(run('WM.hi') > 1, 'axis must include overflowing forecast values');
  run("S.metric = 'avail'; renderWeek();");
  const available = JSON.parse(run("JSON.stringify(WM.forecasts.get('igoto|l1').values.filter(value => value != null))"));
  assert(available.every(value => value >= 0 && value <= 100 && Number.isFinite(value)));
});

test('forecast drawing ends at the exact selected future duration even when the overview contains a longer day', async () => {
  const { run } = await runtime('#week/T1', { ...SUNDAY, now: '2026-10-12T11:00:00+09:00' });
  const values = JSON.parse(run("JSON.stringify(WM.forecasts.get('igoto|s1').values)"));
  assert.equal(run('weekCfg().nd'), 8);
  assert(values.slice(run('WM.nowG'), run('WM.b')).every(value => value != null));
  assert(values.slice(run('WM.b')).every(value => value == null));
});

test('calendar/observations errors are visible and disabling IGoTo leaves linked forecasts unchanged', async () => {
  const { run, elements, listeners, stored } = await runtime('#week/T1', SUNDAY);
  run("D.cal.holidays = {}; D.cache.clear(); S.linkedForecast = true; renderWeek();");
  assert.equal(run("WM.lines.filter(line => line.model === 'igoto').length"), 0);
  assert.equal(run("WM.lines.filter(line => line.model === 'linked' && line.d).length"), 3);
  assert.match(elements.get('view').innerHTML, /공휴일 달력이 없어/);
  listeners.click({ target: { closest: () => ({ dataset: { a: 'igoto' }, checked: false }) } });
  assert.equal(run('S.igoto'), false);
  assert.equal(stored.get('icn.igoto'), '0');
  assert.equal(run("chartModel(weekCfg()).lines.filter(line => line.model === 'igoto').length"), 0);
});

test('midnight into Monday retains the full rolling history and the selected future duration', async () => {
  const { run, listeners, clock } = await runtime('#week/T1', { ...SUNDAY, now: '2026-10-11T23:55:00+09:00' });
  listeners.click({ target: { closest: () => ({ dataset: { a: 'future', v: '7' } }) } });
  await run('ensure()');
  assert.equal(run('WM.nowG - WM.a'), 3 * DAY);
  assert.equal(run('WM.b - WM.nowG'), 7 * DAY);
  clock.value = Date.parse('2026-10-12T00:05:00+09:00');
  await run('refresh(false)');
  assert.equal(run('S.futureDays'), 7);
  assert.equal(run('weekCfg().nd'), 11);
  assert.equal(run('WM.nowG - WM.a'), 3 * DAY);
  assert.equal(run('WM.b - WM.nowG'), 7 * DAY);
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.win)')), [1 - 3 * DAY, 1 + 7 * DAY]);
  assert.equal(run('weekCfg().d0'), '2026-10-09');
});

test('initial collection does not trim the rolling viewport or hide history on Monday rollover', async () => {
  const { run, clock } = await runtime('#week/T1', { ...SUNDAY, start: '2026-10-08' });
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.win)')), [132 - 3 * DAY, 132 + 4 * DAY]);
  clock.value = Date.parse('2026-10-12T00:05:00+09:00');
  await run('refresh(false)');
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.win)')), [1 - 3 * DAY, 1 + 4 * DAY]);
});

test('recent rolling history survives Monday and ordinary midnight, while a manual zoom keeps its absolute dates', async () => {
  const { run, clock, listeners } = await runtime('#week/T1', { ...SUNDAY, now: '2026-10-11T23:55:00+09:00' });
  for (const timestamp of ['2026-10-12T00:05:00+09:00', '2026-10-13T00:05:00+09:00']) {
    clock.value = Date.parse(timestamp);
    await run('refresh(false)');
    assert.equal(run('WM.nowG - WM.a'), 3 * DAY);
    assert.equal(run('WM.b - WM.nowG'), 4 * DAY);
    const actual = JSON.parse(run("JSON.stringify(WM.cur(WM.zones.find(zone=>zone.id==='s1')).slice(WM.a,WM.nowG))"));
    assert(actual.some(value => value != null), 'previous-day history is still loaded after midnight');
  }
  listeners.click({ target: { closest: () => ({ dataset: { a: 'win', v: '-200,100' } }) } });
  await run('ensure()');
  const before = JSON.parse(run('JSON.stringify(S.win.map(slot => slotRange(D.now.date,slot)))'));
  clock.value = Date.parse('2026-10-14T00:05:00+09:00');
  await run('refresh(false)');
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.win.map(slot => slotRange(D.now.date,slot)))')), before);
});

test('T2 has its own complete forecast paths and failure notices identify missing history', async () => {
  const zones = ZONES.map(zone => ({ ...zone, terminal: 'T2', id: 't2-' + zone.id }));
  const t2Day = (date, today) => {
    const doc = dayDoc(date, date === today);
    return { ...doc, zones: Object.fromEntries(Object.entries(doc.zones).map(([id, zone]) => ['t2-' + id, zone])) };
  };
  const { run, elements } = await runtime('#week/T2', { ...SUNDAY, zones, dayDoc: t2Day });
  assert.equal(run("WM.lines.filter(line => line.model === 'igoto' && line.d).length"), 3);
  assert.equal(run("WM.forecasts.get('igoto|t2-l1').values.slice(WM.nowG,WM.b).filter(value => value != null).length"), 4 * DAY);
  run("D.retry.set(addDays(D.now.date, -1), Date.now()); renderWeek();");
  assert.match(elements.get('view').innerHTML, /예측용 기록 1일을 불러오지 못했습니다/);
});

test('data guide distinguishes the existing six-hour forecast from the holiday-aware model and its limits', async () => {
  const { run, elements } = await runtime();
  run('renderAbout()');
  assert.match(elements.get('view').innerHTML, /IGoTo 예측/);
  assert.match(elements.get('view').innerHTML, /과거 3일·향후 4일/);
  assert.match(elements.get('view').innerHTML, /미래는 3·4일\(기본\)·5·7일/);
  assert.match(elements.get('view').innerHTML, /하단 6시간 예상/);
  assert.match(elements.get('view').innerHTML, /연결 휴가 후보는 실제 공휴일/);
});

test('future tooltip is clamped to the viewport instead of overflowing a narrow mobile page', async () => {
  const { run, elements } = await runtime('#week/T1', SUNDAY);
  const tip = { style: { left: '54%' }, getBoundingClientRect: () => ({ left: 190, right: 430 }) };
  elements.get('overlay').querySelector = () => tip;
  run('window.innerWidth = 320; S.hf = .54; renderOverlay()');
  assert.equal(tip.style.left, 'calc(54% + -118px)');
});

test('category controls retain separate graph lines for every selected parking zone', async () => {
  const { run, today, elements } = await runtime();
  let model = JSON.parse(run('JSON.stringify(chartModel(weekCfg()).lines.map(l => [l.z, l.cmp]))'));
  assert.deepEqual([...new Set(model.filter(([, cmp]) => !cmp).map(([z]) => z))].sort(), ['l1', 's1', 't1']);
  assert.equal(model.length, 6, 'each of 3 selected lots has its own actual and comparison line');
  run("setAct('T1', { 단기: true, 장기: false, 예약: false });");
  model = JSON.parse(run('JSON.stringify(chartModel(weekCfg()).lines.map(l => [l.z, l.cmp]))'));
  assert.deepEqual([...new Set(model.filter(([, cmp]) => !cmp).map(([z]) => z))], ['s1']);
  assert.match(run(`groupCardsHtml('T1', false)`), /<i style="border-color:oklch\(0.42 0.09 160\)"><\/i>P1/);
  run(`S.tab = 'day'; S.selDay = '${today}'; renderDay();`);
  const html = elements.get('view').innerHTML;
  assert.match(html, /data-z="l1"/);
  assert.match(html, /data-z="t1"/);
  assert.match(html, /data-z="s1"/);
  assert.match(html, /선택한 주차장 · 하루 흐름/);
});

test('category selections persist across T1/T2 switches', async () => {
  const { run, listeners } = await runtime();
  listeners.click({ target: { closest: () => ({ dataset: { a: 'grp', v: '장기' } }) } });
  assert.equal(run("getAct('T1')['장기']"), false);
  run("S.term = 'T2';");
  assert.equal(run("getAct('T2')['장기']"), false);
  run("S.term = 'T1';");
  assert.equal(run("getAct('T1')['장기']"), false);
});

test('period buttons extend the continuous chart up to four weeks back', async () => {
  const { run, listeners } = await runtime();
  listeners.click({ target: { closest: () => ({ dataset: { a: 'weeks', v: '4' } }) } });
  const c = JSON.parse(run('JSON.stringify(weekCfg())'));
  assert.equal(c.nd, 24 + run('weekEnd()') / DAY);
  assert.equal(c.win[1] - c.win[0], 28 * DAY);
  assert.equal(c.d0, run("addDays(D.now.date, -24)"));
  run('S.weeks = 1; S.win = [0, 2016]; panWin(-1); panWin(-1);');
  assert(run('S.weeks') >= 2, 'panning back past this week extends the period');
});

test('forecast applies the offset between now and last week to last week\'s hourly profile', async () => {
  const { run } = await runtime();
  const f = JSON.parse(run("JSON.stringify(forecastOf('T1', 's1'))"));
  assert.equal(f.ok, true);
  assert.equal(f.w, 1);
  assert.equal(Math.round(f.off * 100), 20);
  assert.equal(f.cells.length, 6);
  for (const c of f.cells) { assert.equal(c.j % 12, 0); assert.equal(Math.round(c.v * 100), 80); }
  const capped = JSON.parse(run("JSON.stringify(forecastOf('T1', 'l1'))"));
  assert(capped.cells.every(c => c.v <= 1));
  run('S.over = true;');
  const over = JSON.parse(run("JSON.stringify(forecastOf('T1', 'l1'))"));
  assert.equal(Math.round(over.now * 100), 120);
  assert.equal(Math.round(over.cells[0].v * 100), 120, 'starts from the current overflowing value');
  const html = run('forecastHtml()');
  assert.match(html, /장기 P1/);
  assert.match(html, /주차타워 P1/);
  assert.equal((html.match(/class="fc-row"/g) || []).length, 3, 'forecast keeps one separate row per selected zone');
  assert.equal((html.match(/class="fc-cell/g) || []).length, 30, 'each zone has 3 actual/current and 6 forecast cells');
  assert.match(html, /지난 3시간 \+ 앞으로 6시간/);
  assert.match(html, /지금/);
  assert.doesNotMatch(html, /\+1시간/);
  assert.match(html, /예상 점유율/);
});

test('available-space mode switches individual card parts and every forecast cell to counts without changing occupancy colors', async () => {
  const { run, elements } = await runtime('#week/T1', SUNDAY);
  const occupied = JSON.parse(run("JSON.stringify(forecastOf('T1','s1'))"));
  run("S.metric = 'avail'; renderWeek();");
  const forecast = JSON.parse(run("JSON.stringify(forecastOf('T1','s1'))"));
  assert.equal(forecast.now, 20);
  assert.equal(forecast.off, -20);
  assert(forecast.cells.every(cell => Math.round(cell.v) === 20));
  assert(forecast.cells.every((cell, index) => Math.abs(cell.occupancy - occupied.cells[index].v) < 1e-12));
  const cards = run("groupCardsHtml('T1',false)");
  const parts = [...cards.matchAll(/<span class="gc-zs">([\s\S]*?)<\/span><\/button>/g)].map(([, text]) => text).join('');
  assert.match(parts, /P1 <b>0대<\/b>/);
  assert.match(parts, /타워 P1 <b>4대<\/b>/);
  assert.match(parts, /지하1층 <b>20대<\/b>/);
  assert.doesNotMatch(parts, /<b>[^<]*%/);
  const html = run('forecastHtml()');
  assert.match(html, /예상 가용 대수/);
  const cells = [...html.matchAll(/class="fc-cell[^"]*"[^>]*>([\s\S]*?)<\/div>/g)];
  assert.equal(cells.length, 30);
  assert(cells.every(([, cell]) => /^<b>\d+(?:,\d+)*대<\/b>$|^—$/.test(cell)));
  assert.doesNotMatch(html, /같은 시각|차이 <b>|<small>실측|<small>현재|<small>지난주/);
  assert.match(html, /주차 80대 \/ 전체 100대 · 점유율 80%/);
  assert.match(html, new RegExp(`background:${run('occColor(.8)')}`));
  run("S.metric='occ'; renderWeek();");
  assert.match(elements.get('view').innerHTML, /예상 점유율/);
  assert.match(run("groupCardsHtml('T1',false)"), /지하1층 <b>80%<\/b>/);
});

test('forecast table can anchor to a recent previous-day observation just after midnight', async () => {
  const { run, today } = await runtime('#week/T1', { ...SUNDAY, now: '2026-10-13T00:05:00+09:00' });
  run(`D.days.get('${today}').zones.s1.p.fill(null); D.cache.clear();`);
  const result = JSON.parse(run("JSON.stringify(forecastOf('T1','s1'))"));
  assert.equal(result.ok, true);
  assert.equal(result.i0, 287);
  assert(result.cells.every(cell => Number.isFinite(cell.v)));
});

test('the recent three-hour actual heatmap remains visible without enough history to forecast', async () => {
  const { run, today } = await runtime();
  run(`for (let w = 1; w <= 4; w++) D.days.delete(addDays('${today}', -7 * w)); D.cache.clear();`);
  const f = JSON.parse(run("JSON.stringify(forecastOf('T1', 's1'))"));
  assert.equal(f.ok, false);
  assert.equal(f.history.length, 3);
  assert(f.history.every(p => p.v != null));
  const html = run('forecastHtml()');
  assert.equal((html.match(/class="fc-cell/g) || []).length, 30, 'keeps the 3 actual, current and 6 future cells for each zone');
  assert.match(html, /실측/);
  assert.match(html, /지난 4주 같은 요일 기록이 없어 추정할 수 없습니다/);
});

test('the previous-three-hour heatmap crosses midnight into the prior day correctly', async () => {
  const { run, today } = await runtime();
  const yesterday = addDays(today, -1);
  run(`D.now = { date: '${today}', idx: 18 }; D.cache.clear();`);
  const f = JSON.parse(run("JSON.stringify(forecastOf('T1', 's1'))"));
  assert.deepEqual(f.history.map(p => [p.date, p.slot]), [
    [yesterday, 270], [yesterday, 282], [today, 6]
  ]);
});

test('hover highlighting never re-renders on touch, so one tap toggles a card on iOS', async () => {
  const { run, listeners, elements } = await runtime();
  const before = elements.get('view').innerHTML;
  const card = { dataset: { a: 'grp', v: '예약', focus: '예약' } };
  listeners.pointerover({ pointerType: 'touch', target: { closest: () => card } });
  assert.equal(run('S.focus'), null);
  listeners.pointerover({ pointerType: 'mouse', target: { closest: () => ({ dataset: { focus: '단기' } }) } });
  assert.equal(run('S.focus'), '단기');
  assert.equal(elements.get('view').innerHTML, before, 'hover only restyles lines');
  assert.equal(run("getAct('T1')['예약']"), false);
  listeners.click({ target: { closest: () => card } });
  assert.equal(run("getAct('T1')['예약']"), true);
});

test('range view loads every day in the range, clamps it to the collection period, and keeps it in the URL', async () => {
  const { run, listeners, today } = await runtime('#range/T1/2000-01-01~2999-01-01');
  const [f, t] = JSON.parse(run('JSON.stringify(rng())'));
  assert.equal(t, today);
  assert.equal(run(`daysBetween('${f}', '${t}')`), 35);
  listeners.click({ target: { closest: () => ({ dataset: { a: 'rng', v: `${addDays(today, -6)}~${today}` } }) } });
  await run('ensure()');
  assert.equal(run('rangeCfg().nd'), 7);
  assert.match(run('location.hash'), new RegExp(`#range/T1/${addDays(today, -6)}~${today}`));
  assert.match(run("document.getElementById('rng-sum').innerHTML"), /기간별 날짜·시간대 점유율/);
});

test('range heatmap keeps chronological daily strips per zone rather than a same-time average', async () => {
  const { run, today } = await runtime();
  const cfg = JSON.parse(run('JSON.stringify(rangeCfg())'));
  const html = run('rangeHeatmapHtml("T1", rangeCfg())');
  assert.equal((html.match(/class="th-row/g) || []).length, 3);
  assert.equal((html.match(/class="th-strip"/g) || []).length, 3 * cfg.nd);
  assert.match(html, /00:00<\/span>/);
  assert.match(html, /18:00<\/span>/);
  assert.doesNotMatch(html, />\s*\d+%/);
  assert.match(html, /aria-label="단기 지하1층 \d{4}-\d{2}-\d{2} · 00:00~23:55 KST 5분 실측/);
  assert.doesNotMatch(html, /기간 평균|같은 시간대/);
  const dates = [...html.matchAll(/data-zone="s1" data-date="([^"]+)"/g)].map(([, date]) => date);
  assert.equal(dates.length, cfg.nd);
  assert.equal(dates[0], cfg.d0);
  assert.equal(dates.at(-1), today);
  assert.equal(cfg.d0, run(`addDays('${today}', -13)`));
});

test('date-by-date range pixels retain each observation, capacity, missing and future state without averaging', async () => {
  const { run, today, elements } = await runtime('#range/T1', SUNDAY);
  const yesterday = addDays(today, -1);
  run(`
    D.days.get('${yesterday}').zones.s1.p[12] = 20;
    D.days.get('${today}').zones.s1.p[12] = 90;
    D.days.get('${yesterday}').zones.s1.p[13] = null;
    D.days.get('${yesterday}').zones.s1.c[14] = 0;
    D.cache.clear();
  `);
  assert.equal(run(`rangeSlot('s1','${yesterday}',12).value`), 0.2);
  assert.equal(run(`rangeSlot('s1','${today}',12).value`), 0.9);
  assert.equal(run(`rangeSlot('s1','${yesterday}',13).value`), null);
  assert.equal(run(`rangeSlot('s1','${yesterday}',14).why`), '미운영');
  assert.equal(run(`rangeSlot('s1','${today}',287).why`), '아직 없음');
  run("S.metric='avail';");
  assert.equal(run(`rangeSlot('s1','${yesterday}',12).value`), 80);
  assert.equal(run(`rangeSlot('s1','${today}',12).value`), 10);
  assert.equal(run(`rangeSlot('s1','${today}',12).occupancy`), 0.9);
  elements.set('range-point-detail', { textContent: '' });
  run(`
    const painted = [];
    const canvases = ['${yesterday}','${today}'].map(date => ({
      dataset:{zone:'s1',date}, title:'', listeners:{},
      getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(DAY*4)}),putImageData:image=>painted.push(image.data)}),
      getBoundingClientRect:()=>({left:0,width:288}),
      addEventListener(name,callback){this.listeners[name]=callback;},
      setAttribute(name,value){this[name]=value;}
    }));
    document.querySelectorAll = selector => selector === '#rng-sum .th-strip' ? canvases : [];
    paintRangeHeatmap();
  `);
  const expected = run('occColor(.2)').slice(1).match(/../g).map(hex => parseInt(hex, 16));
  assert.deepEqual(JSON.parse(run('JSON.stringify(Array.from(painted[0].slice(12*4,12*4+4)))')), [...expected, 255]);
  assert.deepEqual(JSON.parse(run('JSON.stringify(Array.from(painted[0].slice(13*4,13*4+4)))')), [0, 0, 0, 0]);
  assert.deepEqual(JSON.parse(run('JSON.stringify(Array.from(painted[1].slice(287*4,287*4+4)))')), [255, 255, 255, 255]);
  run("canvases[0].listeners.pointerdown({clientX:12.5});");
  assert.match(elements.get('range-point-detail').textContent, /01:00 KST · 가용 80대 · 실측/);
  run("canvases[0].listeners.keydown({key:'ArrowRight',preventDefault(){}});");
  assert.match(elements.get('range-point-detail').textContent, /01:05 KST · 누락/);
});

test('a 92-day range uses one exact 288-slot raster per day/zone rather than hundreds of thousands of DOM cells', async () => {
  const { run } = await runtime('#range/T1', { ...SUNDAY, start: '2026-07-01' });
  run("setRange('2026-07-01','2026-10-11');");
  const cfg = JSON.parse(run('JSON.stringify(rangeCfg())'));
  assert.equal(cfg.nd, 92);
  const html = run("rangeHeatmapHtml('T1',rangeCfg())");
  assert.equal((html.match(/class="th-strip" width="288" height="1"/g) || []).length, 3 * 92);
  assert.doesNotMatch(html, /class="th-cell/);
});

test('all public service pages link the open-source repository and README includes the supplied representative image', () => {
  const web = path.join(__dirname, '../web');
  for (const file of ['index.html', 'fees.html', 'operations.html']) {
    const html = fs.readFileSync(path.join(web, file), 'utf8');
    assert.match(html, /class="repo-link" href="https:\/\/github\.com\/studydev\/icn-parking" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /aria-label="GitHub 오픈 소스 저장소"/);
    assert.match(html, /src="github\.svg"/);
  }
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(readme, /\[icn\.igotobook\.com\]\(https:\/\/icn\.igotobook\.com\/\)/);
  assert.match(readme, /!\[[^\]]+\]\(docs\/images\/dashboard\.png\)/);
  const image = fs.readFileSync(path.join(__dirname, '../docs/images/dashboard.png'));
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(image.readUInt32BE(16), 1263);
  assert.equal(image.readUInt32BE(20), 1425);
});
test('site no longer registers GA4 or allows Google analytics origins in CSP', () => {
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/staticwebapp.config.json'), 'utf8'));
  assert.doesNotMatch(html, /googletagmanager|gtag\(/);
  assert.doesNotMatch(JSON.stringify(config), /googletagmanager|google-analytics\.com|analytics\.google\.com/);
  assert.doesNotMatch(config.globalHeaders['content-security-policy'], /script-src[^;]*'unsafe-inline'/);
});

test('typing a date keystroke by keystroke never applies partial years and keeps the range normalized', async () => {
  const { run, listeners, today } = await runtime('#range/T1');
  const before = run('JSON.stringify(rng())');
  for (const v of ['0002-09-26', '0020-09-26', '0202-09-26']) {
    listeners.change({ target: { value: v, dataset: { a: 'rfrom' } } });
    assert.equal(run('JSON.stringify(rng())'), before, v);
  }
  listeners.change({ target: { value: addDays(today, -3), dataset: { a: 'rfrom' } } });
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.rng)')), [addDays(today, -3), today]);
  listeners.change({ target: { value: '2000-01-01', dataset: { a: 'rfrom' } } });
  const [f, t] = JSON.parse(run('JSON.stringify(S.rng)'));
  assert.equal(f, run('startDate()'), 'stored range is clamped to the collection period');
  assert.equal(t, today);
  assert.doesNotMatch(run('location.hash'), /2000-01-01/);
});
