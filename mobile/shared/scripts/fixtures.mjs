#!/usr/bin/env node
// 앱 계산 테스트 픽스처 생성. 시나리오 입력을 결정론적으로 만들고, 실제 web/app.js·web/shuttle.js를 vm에서 실행해
// reference/forecast.mjs가 웹과 같은 값을 내는지 확인한 다음 기대값을 mobile/shared/fixtures/에 쓴다.
//   node mobile/shared/scripts/fixtures.mjs          생성
//   node mobile/shared/scripts/fixtures.mjs --check  최신 여부만 확인(웹 계산이 바뀌어도 실패)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { DAY, addDays, appCells, forecastZone, freshness, groupForecast, slotRange, webCells } from '../reference/forecast.mjs';
import { historyModel } from '../reference/history.mjs';
import { cardText, tailText, waitText } from '../reference/shuttle-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = 'mobile/shared/fixtures';
const read = path => readFileSync(join(ROOT, path), 'utf8');
const ZONES = JSON.parse(read('mobile/shared/zones.json')).zones;
const GROUPS = { short: ['단기'], long: ['장기', '타워'], reserved: ['예약'], total: ['단기', '장기', '타워'] };
const WEB_GID = { short: '단기', long: '장기', reserved: '예약', total: '합계' };
const WEB_WHY = {
  '최근 관측이 운영 중단 상태입니다.': 'recentClosed',
  '지금 값이 없어 추정할 수 없습니다': 'noCurrent',
  '현재 운영 중단 구역입니다.': 'latestClosed',
  '현재 운영 면수를 확인할 수 없어 예상을 만들 수 없습니다.': 'capacityUnknown',
  '최신 면수와 예측 기준 면수가 달라 확인이 필요합니다.': 'capacityChanged',
  '지난 4주 같은 요일 기록이 없어 추정할 수 없습니다': 'noHistory'
};
const CAPS = { 't1-short-b1': 520, 't1-short-b2': 1050, 't1-short-b3': 1050, 't1-short-gf': 600, 't1-long-p1': 3200, 't1-long-p2': 3800, 't1-long-p3': 2000, 't1-tower-p1': 1200, 't1-tower-p2': 900, 't1-resv-p5': 600 };
const BASE = { 단기: 0.78, 장기: 0.86, 타워: 0.9, 예약: 0.62 };
const TODAY = '2026-10-17';
const fail = message => { throw new Error(message); };

// ---------- 입력 데이터 ----------
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rng = seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const kstMs = (date, hms) => Date.parse(`${date}T${hms}+09:00`);
/* 밀리초 없는 ISO(Swift ISO8601DateFormatter 기본 형식) */
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/* 구역·날짜마다 같은 값이 나오는 하루 288칸 주차 대수. 장기는 가끔 면수를 넘는다(웹 min(p,c) 처리 확인). */
function parkingDay(zoneId, date, capacity) {
  const zone = ZONES.find(z => z.id === zoneId), r = rng(hash(zoneId + date)), dow = new Date(date + 'T00:00:00Z').getUTCDay();
  let noise = 0;
  return Array.from({ length: DAY }, (_, i) => {
    noise = noise * 0.8 + (r() - 0.5) * 0.02;
    const occ = BASE[zone.category] + 0.12 * Math.sin((i / DAY - 0.3) * 2 * Math.PI) + (dow === 0 || dow === 6 ? 0.04 : 0) + noise;
    return Math.round(capacity * Math.max(0.05, Math.min(1.04, occ)));
  });
}

function build(s) {
  const today = s.today || TODAY, idx = s.lastSlot ?? s.slot, days = {};
  for (const date of s.dates) {
    const zones = {};
    for (const id of s.zones) {
      const capacity = s.capacity?.[id]?.(date) ?? CAPS[id];
      const p = parkingDay(id, date, capacity), c = new Array(DAY).fill(capacity);
      if (date === today) for (let i = idx + 1; i < DAY; i++) { p[i] = null; c[i] = null; }
      zones[id] = { p, c };
    }
    days[date] = { v: 1, date, zones };
  }
  s.mutate?.(days);
  const start = s.start || s.dates.slice().sort()[0];
  const latestZones = s.zones.map(id => {
    const z = ZONES.find(q => q.id === id), d = days[today].zones[id];
    return { id, terminal: z.terminal, category: z.category, name: z.name, order: z.order, p: d?.p[idx] ?? null, c: d?.c[idx] ?? null, slot: `${today}T${String(Math.floor(idx / 12)).padStart(2, '0')}:${String((idx % 12) * 5).padStart(2, '0')}`, flags: [] };
  });
  s.latestPatch?.(latestZones);
  const slotIso = latestZones[0].slot;
  const latest = { v: 1, slot: slotIso, start, ok: true, stale: !!s.stale, last_ok_at: new Date(Date.parse(slotIso + ':00+09:00')).toISOString(), zones: latestZones };
  const calendar = { start, days: Object.fromEntries(Object.keys(days).sort().map(d => [d, { T1: {} }])), holidays: {} };
  return { days, latest, calendar };
}

const bds = (date = TODAY, around = [0]) => [1, 2, 3, 4].flatMap(w => around.map(k => addDays(date, -7 * w + k)));
const SCENARIOS = [
  { name: 'normal', description: 'T1 전 구역, 14:32 · 1주 전 기준 · 그룹·터미널 합계',
    now: '14:32:10', slot: 174, zones: Object.keys(CAPS), dates: [TODAY, ...bds()] },
  { name: 'delayed', description: '수집 18분 지연(stale). 마지막 슬롯 14:15를 기준점으로 예측은 계속',
    now: '14:33:00', slot: 174, lastSlot: 171, stale: true, zones: ['t1-short-b1', 't1-long-p1', 't1-resv-p5'], dates: [TODAY, ...bds()] },
  { name: 'offline', description: '오프라인 저장본(14:30)을 14:40에 다시 계산 → 기준점 2슬롯 되짚기',
    now: '14:40:00', slot: 176, lastSlot: 174, zones: ['t1-short-b2', 't1-tower-p1'], dates: [TODAY, ...bds()] },
  { name: 'closed', description: 'b2 = 최신값만 면수 0(latestClosed), b3 = 최근 관측 면수 0(recentClosed). 둘 다 그룹 합계 제외',
    now: '14:32:10', slot: 174, zones: ['t1-short-gf', 't1-short-b1', 't1-short-b2', 't1-short-b3'], dates: [TODAY, ...bds()],
    mutate: days => { const z = days[TODAY].zones['t1-short-b3']; for (let i = 156; i <= 174; i++) { z.c[i] = 0; z.p[i] = 0; } },
    latestPatch: zs => { for (const z of zs) if (z.id === 't1-short-b2' || z.id === 't1-short-b3') { z.c = 0; z.p = 0; z.flags = ['CLOSED']; } } },
  { name: 'missing', description: 'gf = 최근 40분 값 없음(noCurrent), b1 = 최신값만 MISSING(c도 null → 웹처럼 capacityUnknown). 둘 다 그룹 합계 제외',
    now: '14:32:10', slot: 174, zones: ['t1-short-gf', 't1-short-b1', 't1-short-b2'], dates: [TODAY, ...bds()],
    mutate: days => {
      const gf = days[TODAY].zones['t1-short-gf'], b1 = days[TODAY].zones['t1-short-b1'];
      for (let i = 167; i <= 174; i++) { gf.p[i] = null; gf.c[i] = null; }
      for (let i = 173; i <= 174; i++) { b1.p[i] = null; b1.c[i] = null; }
    },
    latestPatch: zs => { for (const z of zs) if (z.id !== 't1-short-b2') { z.p = null; z.c = null; z.flags = ['MISSING']; } } },
  { name: 'capacity-changed', description: 'b1 = 5일 전 면수 520→378(1주 전 기록을 현재 면수로 환산), b2 = 최신 면수 980 ≠ 기준 1050(capacityChanged)',
    now: '14:32:10', slot: 174, zones: ['t1-short-b1', 't1-short-b2'], dates: [TODAY, ...bds()],
    capacity: { 't1-short-b1': date => date >= addDays(TODAY, -5) ? 378 : 520 },
    latestPatch: zs => { const b2 = zs.find(z => z.id === 't1-short-b2'); b2.c = 980; b2.p -= 70; b2.flags = ['CAPCHANGE']; } },
  { name: 'no-history', description: '수집 시작 3일 전 → 지난 4주 기록 없음(noHistory)',
    now: '14:32:10', slot: 174, zones: ['t1-short-b1', 't1-long-p2'], dates: [0, 1, 2, 3].map(k => addDays(TODAY, -k)) },
  { name: 'edge-fallback', description: 'b1 = 1주 전 기록 없음 → 2주 전, p1 = 지금 두 슬롯 보정값 → 기준점 되짚기, p3 = 1주 전 16:00 ±2슬롯 보정 → 그 칸만 빈 값',
    now: '14:32:10', slot: 174, zones: ['t1-short-b1', 't1-long-p1', 't1-long-p3'], dates: [TODAY, ...bds()],
    mutate: days => {
      delete days[addDays(TODAY, -7)].zones['t1-short-b1'];
      days[TODAY].zones['t1-long-p1'].e = [173, 174];
      days[addDays(TODAY, -7)].zones['t1-long-p3'].e = [190, 191, 192, 193, 194];
    } },
  { name: 'edge-midnight-early', description: '00:12. p2 = 오늘 세 슬롯이 보정값이라 어제 23:55를 기준점으로(날짜 넘김)',
    now: '00:12:00', slot: 2, zones: ['t1-short-b1', 't1-long-p2'], dates: [TODAY, addDays(TODAY, -1), ...bds(TODAY, [-1, 0])],
    mutate: days => { days[TODAY].zones['t1-long-p2'].e = [0, 1, 2]; } },
  { name: 'edge-midnight-late', description: '22:42. 예측 칸이 다음 날로 넘어감(비교일 다음 날 파일 사용)',
    now: '22:42:00', slot: 272, zones: ['t1-short-gf', 't1-tower-p1'], dates: [TODAY, ...bds(TODAY, [0, 1])] }
];

// ---------- 웹 실행 ----------
async function webRuntime({ days, latest, calendar }, nowMs) {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  }
  const files = { 'latest.json': latest, 'calendar.json': calendar };
  const elements = new Map(['status', 'terms', 'tabs', 'occupancy-scale', 'fee-link', 'foot-start', 'view', 'layout-toggle', 'overlay'].map(id => [id, { innerHTML: '', textContent: '', setAttribute(k, v) { this[k] = v; } }]));
  const ctx = vm.createContext({
    console, Date: ClockDate, Math, JSON, Promise, Map, Set, Array, Object, Number, String, isNaN, Infinity,
    window: { innerWidth: 1280, addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
    location: { hash: '#week/T1' },
    history: { replaceState: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    document: {
      body: { classList: { toggle: () => {}, contains: () => false } },
      getElementById: id => elements.get(id) || (id.startsWith('rng-') ? elements.set(id, { innerHTML: '', contains: () => false, querySelectorAll: () => [] }).get(id) : null),
      querySelectorAll: () => [], addEventListener: () => {}, activeElement: null
    },
    fetch: async url => {
      const name = url.replace('./data/', ''), m = /^days\/(\d{4}-\d{2}-\d{2})\.json$/.exec(name), body = m ? days[m[1]] : files[name];
      return { ok: !!body, status: body ? 200 : 404, json: async () => JSON.parse(JSON.stringify(body)) };
    }
  });
  for (const f of ['occupancy.js', 'forecast.js', 'capacity.js', 'app.js']) vm.runInContext(read(`web/${f}`), ctx);
  const run = code => vm.runInContext(code, ctx);
  for (let i = 0; i < 50 && run('D.pending.size || !D.latest'); i++) await new Promise(r => setImmediate(r));
  if (!run('!!D.latest')) fail('웹 runtime이 latest.json을 읽지 못했어요');
  await run(`loadDays(${JSON.stringify(Object.keys(days))}, true)`);
  return run;
}

function assertSame(actual, expected, where) {
  if (!Object.is(actual, expected) && !(actual == null && expected == null)) fail(`웹과 다름 ${where}: web=${JSON.stringify(actual)} reference=${JSON.stringify(expected)}`);
}

function compareWithWeb(web, ref, metric, today, where) {
  assertSame(web.ok, ref.ok, `${where} ok`);
  if (!web.ok) {
    assertSame(WEB_WHY[web.why] ?? `?${web.why}`, ref.reason, `${where} why`);
    if (ref.reason === 'noHistory') {
      assertSame(web.capacity, ref.capacity, `${where} capacity`);
      assertSame(web.now, metric === 'avail' ? ref.nowAvailable : ref.nowOccupancy, `${where} now`);
    }
    return;
  }
  const cap = ref.capacity, value = parking => metric === 'avail' ? Math.max(cap - parking, 0) : Math.min(parking / cap, 1);
  assertSame(web.w, ref.weeksBack, `${where} w`);
  assertSame(web.date, ref.compareDate, `${where} date`);
  assertSame(web.i0, ref.anchor.slot, `${where} i0`);
  assertSame(web.capacity, cap, `${where} capacity`);
  assertSame(web.now, metric === 'avail' ? ref.nowAvailable : ref.nowOccupancy, `${where} now`);
  assertSame(web.nowOccupancy, ref.nowOccupancy, `${where} nowOccupancy`);
  assertSame(web.base, value(ref.baseParking), `${where} base`);
  web.cells.forEach((cell, k) => {
    const r = ref.cells[k], at = slotRange(today, cell.j);
    assertSame(`${at.date} ${at.slot}`, `${r.date} ${r.slot}`, `${where} cells[${k}] 시각`);
    assertSame(cell.v, metric === 'avail' ? r.available : r.occupancy, `${where} cells[${k}].v`);
    assertSame(cell.base, r.baseParking == null ? null : value(r.baseParking), `${where} cells[${k}].base`);
    assertSame(cell.occupancy, r.parking == null ? null : metric === 'avail' ? 1 - r.available / cap : r.occupancy, `${where} cells[${k}].occupancy`);
  });
}

// ---------- 시나리오 실행 ----------
async function forecastFixture(s) {
  const input = build(s), today = s.today || TODAY, nowMs = kstMs(today, s.now);
  const zoneIds = ZONES.filter(z => s.zones.includes(z.id)).map(z => z.id);
  const args = { days: input.days, latestZones: input.latest.zones, today, idx: s.slot };
  const zones = {}, hourly = {};
  for (const zoneId of zoneIds) {
    zones[zoneId] = forecastZone({ ...args, zoneId, cellSlots: appCells });
    hourly[zoneId] = forecastZone({ ...args, zoneId, cellSlots: webCells });
  }
  const groups = Object.fromEntries(Object.entries(GROUPS).map(([gid, cats]) => [gid, groupForecast(input.latest.zones, zoneIds.filter(id => cats.includes(ZONES.find(z => z.id === id).category)), zones)]));

  const run = await webRuntime(input, nowMs);
  assertSame(run('D.now.idx'), s.slot, `${s.name} D.now.idx`);
  for (const metric of ['avail', 'occ']) {
    run(`S.metric = ${JSON.stringify(metric)}; D.cache.clear();`);
    for (const zoneId of zoneIds) compareWithWeb(JSON.parse(run(`JSON.stringify(forecastOf('T1', ${JSON.stringify(zoneId)}))`)), hourly[zoneId], metric, today, `${s.name} ${zoneId} ${metric}`);
  }
  for (const [gid, g] of Object.entries(groups)) {
    const web = JSON.parse(run(`JSON.stringify(nowAgg('T1', ${JSON.stringify(WEB_GID[gid])}))`));
    assertSame(web.occ, g.occupancy, `${s.name} nowAgg ${gid} occ`);
    assertSame(web.missing, g.missing, `${s.name} nowAgg ${gid} missing`);
    if (web.occ != null) { assertSame(web.avail, g.available, `${s.name} nowAgg ${gid} avail`); assertSame(web.cap, g.capacity, `${s.name} nowAgg ${gid} cap`); }
  }
  return {
    name: s.name, description: s.description, terminal: 'T1', now: iso(nowMs), kst: { date: today, slot: s.slot },
    latest: input.latest, calendar: input.calendar, days: input.days,
    expected: { zones, zonesHourly: hourly, groups }
  };
}

function shuttleFixture() {
  const ctx = vm.createContext({
    console, Date, S: { term: 'T1', tab: 'access' }, ACCESS: { T1: { tip: '' }, T2: { tip: '' } }, layoutMode: () => 'desktop',
    localStorage: { getItem: () => null, setItem: () => {} }, setInterval: () => 0,
    document: { addEventListener: () => {}, getElementById: () => ({ innerHTML: '', querySelector: () => null }), querySelectorAll: () => [] },
    esc: x => String(x), pad: n => String(n).padStart(2, '0')
  });
  for (const f of ['shuttle-map.js', 'shuttle.js']) vm.runInContext(read(`web/${f}`), ctx);
  const source = JSON.parse(read('mobile/shared/shuttle.json'));
  ctx.input = JSON.parse(JSON.stringify(source));
  vm.runInContext('shPrep(input)', ctx);
  const hms = s => s.split(':').reduce((a, x) => a * 60 + +x, 0);
  const times = ['00:00:00', '00:30:00', '04:29:59', '04:30:00', '04:30:01', '04:35:59', '14:32:00', '14:32:59', '23:20:00', '23:56:00', '23:59:59'].map(hms);
  const next = {}, text = {};
  for (const route of ctx.input.routes) {
    next[route.id] = {};
    text[route.id] = { tail: tailText(route), stops: {} };
    for (const stop of route.stops) {
      ctx.stop = stop;
      const runs = times.map(now => JSON.parse(vm.runInContext(`JSON.stringify(shNext(stop, 2, ${now}))`, ctx)));
      next[route.id][stop.id] = runs.map(r => r.map(d => [d.m, d.wait, d.tomorrow ? 1 : 0, d.mark ? 1 : 0, d.index]));
      text[route.id].stops[stop.id] = runs.map(r => ({ wait: waitText(r[0]), ...cardText(route, stop, r) }));
    }
  }
  shuttleTextOut = { source: 'reference/shuttle-text.mjs (디자인 wTxt 규칙)', times, routes: text };
  const r01 = source.routes.find(r => r.id === '01');
  const broken = [
    ['elapsed가 0으로 시작하지 않음', r => { r.travel.elapsed[r.stops[0].id] = 1; }],
    ['elapsed가 증가하지 않음', r => { r.travel.elapsed[r.stops[2].id] = r.travel.elapsed[r.stops[1].id]; }],
    ['total이 마지막 elapsed 이하', r => { r.travel.total = r.travel.elapsed[r.stops.at(-1).id]; }]
  ].map(([why, edit]) => {
    const route = JSON.parse(JSON.stringify(r01)); edit(route);
    ctx.bad = { routes: [route] };
    let threw = false;
    try { vm.runInContext('shPrep(bad)', ctx); } catch { threw = true; }
    if (!threw) fail(`web shPrep이 "${why}"를 거부하지 않았어요`);
    return { why, route };
  });
  return { source: 'mobile/shared/shuttle.json', asOf: source.as_of, n: 2, times, columns: ['m', 'wait', 'tomorrow', 'mark', 'index'], next, invalidRoutes: broken };
}

let shuttleTextOut = null;

function historyFixture() {
  const zoneIds = ['t1-short-b1', 't1-short-b2', 't1-short-b3'], slot = 174, holidays = { '2026-10-09': '한글날' };
  const dates = Array.from({ length: 15 }, (_, i) => addDays(TODAY, i - 14));
  const input = build({ zones: zoneIds, dates, slot,
    mutate: days => {
      days[addDays(TODAY, -2)].zones['t1-short-b1'].e = [120, 121, 122, 123, 124, 125, 126];
      const b3 = days[addDays(TODAY, -3)].zones['t1-short-b3'];
      for (let i = 96; i < 132; i++) { b3.c[i] = 0; b3.p[i] = 0; }
      const b2 = days[addDays(TODAY, -1)].zones['t1-short-b2'];
      for (let i = 156; i < 180; i++) { b2.p[i] = null; b2.c[i] = null; }
      delete days[addDays(TODAY, -12)].zones['t1-short-b1'];
    } });
  const expected = Object.fromEntries([7, 14].map(n => [n, historyModel({ days: input.days, zoneIds, today: TODAY, slot, nDays: n, holidays })]));
  return { description: 'b1: 이틀 전 10시 보정값·12일 전 파일 없음, b2: 어제 13~14시 값 없음, b3: 사흘 전 8~10시 운영 중단(그룹에서 제외), 10/9 공휴일', today: TODAY, slot, holidays, zoneIds, days: input.days, expected };
}

function freshnessFixture() {
  const slot = `${TODAY}T14:30`, cases = [
    ['정상 2분 전', { slot, stale: false }, '14:32:10', false],
    ['정상 방금', { slot, stale: false }, '14:30:40', false],
    ['정상 9분 59초', { slot, stale: false }, '14:39:59', false],
    ['지연 10분 경계', { slot, stale: false }, '14:40:00', false],
    ['지연 stale', { slot: `${TODAY}T14:15`, stale: true }, '14:33:00', false],
    ['지연 stale 방금', { slot, stale: true }, '14:31:00', false],
    ['오프라인 저장본', { slot: `${TODAY}T14:28`, stale: false }, '14:35:00', true],
    ['오프라인이 지연보다 먼저', { slot, stale: true }, '15:30:00', true],
    ['시계가 slot보다 이름', { slot, stale: false }, '14:29:00', false],
    ['자정 넘김', { slot: `${addDays(TODAY, -1)}T23:55`, stale: false }, '00:03:00', false]
  ];
  return { cases: cases.map(([name, latest, hms, offline]) => { const nowMs = kstMs(TODAY, hms); return { name, latest, now: iso(nowMs), offline, expected: freshness(latest, nowMs, offline) }; }) };
}

function timeFixture() {
  const instants = ['2026-10-17T05:32:10Z', '2026-10-17T14:59:59Z', '2026-10-17T15:00:00Z', '2028-02-28T15:00:00Z', '2026-12-31T15:04:59Z', '2026-12-31T15:05:00Z'];
  const kst = iso => { const d = new Date(Date.parse(iso) + 9 * 3600e3); return { date: d.toISOString().slice(0, 10), slot: d.getUTCHours() * 12 + Math.floor(d.getUTCMinutes() / 5), secondsOfDay: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() }; };
  const shifts = [['2026-10-17', -28], ['2026-03-01', -1], ['2028-03-01', -1], ['2026-12-31', 1], ['2026-10-17', 0]];
  const slots = [['2026-10-17', -1], ['2026-10-17', 288], ['2026-10-17', 308], ['2026-10-17', -289], ['2026-10-17', 174]];
  return {
    kst: instants.map(iso => ({ instant: iso, ...kst(iso) })),
    addDays: shifts.map(([date, n]) => ({ date, n, expected: addDays(date, n) })),
    slotRange: slots.map(([date, i]) => ({ date, i, expected: slotRange(date, i) }))
  };
}

// ---------- 쓰기 ----------
/* 숫자·문자 배열은 한 줄로 */
const stringify = value => JSON.stringify(value, null, 2).replace(/\[\s+((?:(?:-?\d+(?:\.\d+)?(?:e[-+]?\d+)?|null|true|false|"[^"\n]*"),?\s*)+)\]/g, (_, body) => `[${body.trim().split(/,\s*/).join(',')}]`) + '\n';

export async function fixtures() {
  const out = new Map();
  for (const s of SCENARIOS) out.set(`${OUT}/forecast/${s.name}.json`, stringify(await forecastFixture(s)));
  out.set(`${OUT}/shuttle/next.json`, stringify(shuttleFixture()));
  out.set(`${OUT}/shuttle/text.json`, stringify(shuttleTextOut));
  out.set(`${OUT}/history.json`, stringify(historyFixture()));
  out.set(`${OUT}/freshness.json`, stringify(freshnessFixture()));
  out.set(`${OUT}/time.json`, stringify(timeFixture()));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  try {
    const out = await fixtures(), stale = [];
    const existing = existsSync(join(ROOT, OUT, 'forecast')) ? readdirSync(join(ROOT, OUT, 'forecast')).map(f => `${OUT}/forecast/${f}`) : [];
    for (const path of existing) if (!out.has(path)) { if (check) stale.push(path); else rmSync(join(ROOT, path)); }
    for (const [path, content] of out) {
      const full = join(ROOT, path);
      if (existsSync(full) && readFileSync(full, 'utf8') === content) continue;
      if (check) { stale.push(path); continue; }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
      console.log(`wrote ${path}`);
    }
    if (stale.length) { console.error(`픽스처가 최신이 아니에요. node mobile/shared/scripts/fixtures.mjs 를 실행하세요:\n  ${stale.join('\n  ')}`); process.exit(1); }
    console.log(check ? 'mobile/shared 픽스처 최신 · 웹 계산과 일치' : '웹 계산과 일치 확인');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
