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
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), ['__SITE_URL__']);
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

async function runtime(hash = '#week/T1') {
  const today = ymd(kst()), start = addDays(today, -35);
  const days = {};
  for (let k = 0; k <= 35; k++) days[addDays(start, k)] = { T1: { max: 0.9 } };
  const files = {
    'latest.json': { start, last_ok_at: new Date().toISOString(), zones: ZONES.map(z => ({ ...z, p: dayDoc(today, true).zones[z.id].p[0], c: 100 })) },
    'calendar.json': { start, days, holidays: {} }
  };
  const elements = new Map(['status', 'terms', 'tabs', 'foot-start', 'view', 'layout-toggle'].map(id => [id, { innerHTML: '', textContent: '', setAttribute(k, v) { this[k] = v; } }]));
  const listeners = {};
  const stored = new Map(), bodyClasses = new Set();
  const ctx = vm.createContext({
    console, Date, Math, JSON, Promise, Map, Set, Array, Object, Number, String, isNaN, Infinity,
    window: { innerWidth: 1280, addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
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
      const m = /^days\/(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      const body = m ? dayDoc(m[1], m[1] === today) : files[name];
      return { ok: !!body, status: body ? 200 : 404, json: async () => JSON.parse(JSON.stringify(body)) };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8'), ctx);
  const run = code => vm.runInContext(code, ctx);
  for (let i = 0; i < 20 && run('D.pending.size || !D.latest'); i++) await new Promise(r => setImmediate(r));
  await run('ensure()');
  return { run, elements, listeners, today, stored, bodyClasses };
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

test('mobile stylesheet refits dense menu content instead of clipping the page', () => {
  const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  assert.match(html, /id="layout-toggle" data-a="layout"/);
  assert.match(css, /body\.layout-mobile \.dgrid \.row\{grid-template-columns:92px repeat\(288,minmax\(0,1fr\)\)/);
  assert.match(css, /body\.layout-mobile \.th-head,body\.layout-mobile \.th-row\{grid-template-columns:92px repeat\(288,minmax\(0,1fr\)\)/);
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
  const { run } = await runtime();
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
  assert.equal(c.nd, 28);
  assert.deepEqual(c.win, [0, 28 * DAY]);
  assert.equal(c.d0, run("addDays(weekStart(), -21)"));
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
  assert.match(run("document.getElementById('rng-sum').innerHTML"), /기간별 시간대 점유율/);
});

test('range heatmap keeps one row per zone with 5-minute color-only intervals', async () => {
  const { run, today } = await runtime();
  const cfg = JSON.parse(run('JSON.stringify(rangeCfg())'));
  const html = run('rangeHeatmapHtml("T1", rangeCfg())');
  assert.equal((html.match(/class="th-row/g) || []).length, 3);
  assert.equal((html.match(/class="th-cell/g) || []).length, 3 * DAY);
  assert.match(html, /00<\/span>/);
  assert.match(html, /21<\/span>/);
  assert.doesNotMatch(html, />\s*\d+%/);
  assert.match(html, /aria-label="단기 지하1층 00:00 · 기간 평균 \d+%"/);
  assert.equal(cfg.d0, run(`addDays('${today}', -13)`));
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
