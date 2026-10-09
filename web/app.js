'use strict';
/* 인천공항 주차 현황 — vanilla JS + SVG. Data: ./data/{latest,calendar}.json, ./data/days/YYYY-MM-DD.json */

const CONFIG = { dataBase: (window.ICN_CONFIG && window.ICN_CONFIG.dataBase) || './data/' };
const W = 1000, H = 200, INK = '#16181a', ACC = '#3f6f9e', RISK = '#d2523c', WEEK = 2016, DAY = 288;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CAT_ORDER = ['단기', '장기', '타워', '예약'];
const PAL = {
  단기: ['oklch(0.40 0.13 258)', 'oklch(0.56 0.15 245)', 'oklch(0.70 0.11 225)', 'oklch(0.48 0.11 285)', 'oklch(0.63 0.09 205)'],
  장기: ['oklch(0.42 0.09 160)', 'oklch(0.58 0.12 178)', 'oklch(0.60 0.13 135)', 'oklch(0.72 0.12 112)'],
  타워: ['oklch(0.62 0.17 48)', 'oklch(0.48 0.15 22)'],
  예약: ['oklch(0.50 0.13 330)', 'oklch(0.62 0.10 310)']
};
/* 선택 단위. 주차타워는 장기주차장을 거쳐 들어가므로 장기에 묶습니다. */
const GROUPS = [
  { id: '단기', label: '단기주차장', cats: ['단기'], color: 'oklch(0.50 0.15 258)' },
  { id: '장기', label: '장기주차장', note: '주차타워 포함', cats: ['장기', '타워'], color: 'oklch(0.56 0.13 158)' },
  { id: '예약', label: '예약주차장', note: '합계 제외', cats: ['예약'], color: 'oklch(0.56 0.16 330)' }
];
const ACT0 = { 단기: true, 장기: true, 예약: false };
const CMPS = ['없음', '1주 전', '2주 전', '3주 전', '4주 전'];
const TABS = [['week', '주차장 현황'], ['day', '날짜별 기록'], ['range', '기간별 기록'], ['access', '터미널 이동'], ['about', '데이터 안내']];
const MAXW = 4, MAXR = 92, CMP_OP = 0.38;
const wkLabel = w => w === 1 ? '지난주' : `${w}주 전`;

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = v => Math.round(v * 100) + '%';
const pctp = v => (v < 0 ? '−' : '+') + Math.abs(Math.round(v * 100)) + '%p';
const num = n => (Math.round(n) || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
const slotLabel = s => pad(Math.floor(s / 12)) + ':' + pad((s % 12) * 5);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY_MS = 864e5;
const OCC_COLORS = [[0, '#2e9d6a'], [0.70, '#2e9d6a'], [0.86, '#2d6c9b'], [0.90, '#2d6c9b'], [0.925, '#854b69'], [0.95, '#ac2834'], [0.975, '#a82230'], [1, '#a3222e']];
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(Date.parse(s + 'T00:00:00Z') + n * DAY_MS));
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
const dowOf = s => new Date(s + 'T00:00:00Z').getUTCDay();
const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const mdw = s => `${md(s)}(${DOW[dowOf(s)]})`;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z'));
const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
const ymLabel = ym => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;
function occColor(v) {
  v = clamp(v, 0, 1);
  let i = 1;
  while (i < OCC_COLORS.length && v > OCC_COLORS[i][0]) i++;
  const [lo, ca] = OCC_COLORS[i - 1], [hi, cb] = OCC_COLORS[i];
  const raw = hi === lo ? 1 : (v - lo) / (hi - lo);
  const t = raw * raw * (3 - 2 * raw);
  const linear = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const srgb = x => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  const a = ca.slice(1).match(/../g).map(x => linear(parseInt(x, 16))), b = cb.slice(1).match(/../g).map(x => linear(parseInt(x, 16)));
  return '#' + a.map((x, k) => srgb(x + (b[k] - x) * t).toString(16).padStart(2, '0')).join('');
}
const occTint = v => {
  const color = occColor(v).slice(1).match(/../g).map(x => parseInt(x, 16));
  return '#' + color.map(x => Math.round(x * 0.28 + 255 * 0.72).toString(16).padStart(2, '0')).join('');
};
const contrastText = hex => {
  const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return l > 0.179 ? INK : '#fff';
};
const occupancyLegendHtml = () => `<span class="occ-legend">${OCC_BANDS.slice().reverse().map(([mn, l]) => `<span><i style="background:${occColor(mn)}"></i>${l}${mn ? ' ' + Math.round(mn * 100) + '%+' : ''}</span>`).join('')}</span>`;
const slotRange = (date, i) => {
  const dayOffset = Math.floor(i / DAY), slot = ((i % DAY) + DAY) % DAY;
  return { date: addDays(date, dayOffset), slot };
};
const niceCeil = x => { if (!(x > 0)) return 10; const m = Math.pow(10, Math.floor(Math.log10(x))); for (const k of [1, 2, 2.5, 5, 10]) if (k * m >= x) return k * m; return 10 * m; };
/* 100% 초과 표시를 켰을 때 최고값 위로 여유를 둔 Y축 상한 */
const occTop = mx => S.over && mx > 1 ? Math.ceil((mx + 0.03) * 20) / 20 : 1;
const HATCH = 'repeating-linear-gradient(45deg,#c9ced4 0 2px,#fff 2px 4px)';
/* occupancy status bands: [min, label, color, tint] */
const OCC_BANDS = [[0.98, '만차'], [0.95, '매우 혼잡'], [0.90, '혼잡'], [0.70, '보통'], [0, '여유']];
const occBand = v => OCC_BANDS.find(b => v >= b[0]);
/* plot background per day: weekday pastel / weekend·holiday pastel red */
const isOffDay = (date, hol) => { const dw = dowOf(date); return dw === 0 || dw === 6 || !!hol[date]; };
const dayBg = (date, hol, k) => isOffDay(date, hol) ? (k % 2 ? '#fcecea' : '#fdf1ef') : (k % 2 ? '#f2f6fb' : '#f8fafd');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* storage unavailable */ } }
};

function kstNow() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return { date: ymd(d), idx: d.getUTCHours() * 12 + Math.floor(d.getUTCMinutes() / 5) };
}
function ticks(lo, hi, step, fmt) {
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push({ top: ((1 - (v - lo) / (hi - lo)) * 100).toFixed(2), label: fmt(v) });
  return out;
}
function smoothPath(segs) {
  let d = '';
  for (const p of segs) {
    if (!p.length) continue;
    d += 'M' + p[0][0].toFixed(1) + ',' + p[0][1].toFixed(1);
    if (p.length === 1) { d += 'h0.01'; continue; }
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, t = 0.5 / 3;
      d += 'C' + (p1[0] + (p2[0] - p0[0]) * t).toFixed(1) + ',' + (p1[1] + (p2[1] - p0[1]) * t).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) * t).toFixed(1) + ',' + (p2[1] - (p3[1] - p1[1]) * t).toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
  }
  return d;
}
function smoothVals(arr, a, b, r) {
  const out = new Array(b - a);
  for (let j = a; j < b; j++) {
    if (arr[j] == null) { out[j - a] = null; continue; }
    let s = 0, n = 0;
    for (let k = j - r; k <= j + r; k++) { const v = arr[k]; if (v != null) { s += v; n++; } }
    out[j - a] = s / n;
  }
  return out;
}

/* ---------- state ---------- */
/* win: 이번 주 월요일 00:00 기준 슬롯(과거 주는 음수), rwin: 기간 시작일 기준 슬롯 */
const savedAct = (() => { try { return JSON.parse(store.get('icn.categories') || 'null'); } catch (_) { return null; } })();
const savedLayout = store.get('icn.layout');
const S = { tab: 'week', term: 'T1', metric: 'occ', weeks: 1, win: [0, WEEK], rng: null, rwin: null, rclip: false, hf: null, sel: null, cmp: 1, linkedForecast: false, act: savedAct && typeof savedAct === 'object' ? { ...ACT0, ...savedAct } : { ...ACT0 }, focus: null, selDay: null, month: null, over: store.get('icn.over') === '1', layout: ['mobile', 'desktop'].includes(savedLayout) ? savedLayout : null };
const D = { latest: null, cal: null, days: new Map(), pending: new Map(), retry: new Map(), err: null, now: kstNow(), cache: new Map(), zones: {} };
const layoutMode = () => S.layout || (window.matchMedia?.('(max-width: 700px)').matches ? 'mobile' : 'desktop');
function applyLayout() {
  const mode = layoutMode(), body = document.body;
  body?.classList?.toggle('layout-mobile', mode === 'mobile');
  body?.classList?.toggle('layout-desktop', mode === 'desktop');
  const button = document.getElementById('layout-toggle');
  if (button) {
    button.textContent = mode === 'mobile' ? '데스크톱 보기' : '모바일 보기';
    button.setAttribute('aria-label', `${mode === 'mobile' ? '데스크톱' : '모바일'} 화면으로 전환`);
  }
  return mode;
}

async function fetchJson(path) {
  const r = await fetch(CONFIG.dataBase + path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}
function prepDay(doc) {
  let first = DAY;
  for (const z of Object.values(doc.zones)) {
    const f = z.c.findIndex(c => c != null);
    if (f >= 0 && f < first) first = f;
  }
  doc.first = first;
  return doc;
}
const startDate = () => (D.cal && D.cal.start) || (D.latest && D.latest.start) || D.now.date;
const knownDay = d => d <= D.now.date && d >= startDate() && (d === D.now.date || !!(D.cal && D.cal.days && D.cal.days[d]));

function loadDays(dates, force) {
  const jobs = [];
  for (const d of new Set(dates)) {
    /* 일시적인 실패는 30초 뒤 다음 요청 때 다시 받습니다 */
    if (D.retry.has(d) && Date.now() - D.retry.get(d) > 30e3) { D.retry.delete(d); D.days.delete(d); }
    if (!force && (D.days.has(d) || D.pending.has(d))) { if (D.pending.has(d)) jobs.push(D.pending.get(d)); continue; }
    if (!knownDay(d)) { D.days.set(d, null); continue; }
    const p = fetchJson(`days/${d}.json`).then(prepDay)
      .then(doc => { D.days.set(d, doc); D.retry.delete(d); }, () => { D.days.set(d, null); D.retry.set(d, Date.now()); })
      .finally(() => D.pending.delete(d));
    D.pending.set(d, p); jobs.push(p);
  }
  return Promise.all(jobs).then(() => D.cache.clear());
}

/* ---------- zones & groups ---------- */
function zonesOf(term) {
  if (D.zones[term]) return D.zones[term];
  const ci = c => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 9 : i; };
  const counts = {};
  return (D.zones[term] = ((D.latest && D.latest.zones) || []).filter(z => z.terminal === term)
    .sort((a, b) => ci(a.category) - ci(b.category) || a.order - b.order)
    .map(z => {
      const index = counts[z.category] = counts[z.category] || 0;
      counts[z.category]++;
      return { ...z, color: (PAL[z.category] || PAL.예약)[index % (PAL[z.category] || PAL.예약).length] };
    }));
}
function groupsOf(term) {
  const k = 'g|' + term;
  if (D.zones[k]) return D.zones[k];
  const zs = zonesOf(term);
  return (D.zones[k] = GROUPS.map(g => ({ ...g, zones: zs.filter(z => g.cats.includes(z.category)) })).filter(g => g.zones.length));
}
const categoryGroup = z => GROUPS.find(g => g.cats.includes(z.category))?.id;
const selectedZones = term => onGroups(term).flatMap(g => g.zones);
/* gid '합계' = 터미널 합계(예약 제외) */
const zonesFor = (term, gid) => gid === '합계' ? groupsOf(term).filter(g => g.id !== '예약').flatMap(g => g.zones) : ((groupsOf(term).find(g => g.id === gid) || {}).zones || []);
const getAct = () => S.act;
const onGroups = term => groupsOf(term).filter(g => getAct(term)[g.id]);
function setAct(term, act) { S.act = act; store.set('icn.categories', JSON.stringify(act)); S.focus = null; render(); }
const shortName = z => z.name.replace(/^(단기|장기|예약)\s+/, '').replace(/^주차타워\s*/, '타워 ');
/* 점유율은 기본적으로 구역별 min(주차, 면수)로 100%에 맞추고, 옵션을 켜면 실제 값(면수 초과 포함)을 씁니다. */
const occKey = () => S.over ? 'o' : 'oc';
const vkey = () => S.metric === 'avail' ? 'a' : occKey();

/* 구역 묶음의 슬롯별 합계: o = Σ주차/Σ면수, oc = Σmin(주차, 면수)/Σ면수, a = 가용 대수 */
function aggDay(zs) {
  const o = new Array(DAY).fill(null), oc = o.slice(), a = o.slice();
  for (let i = 0; i < DAY; i++) {
    let sp = 0, sq = 0, sc = 0, ok = true;
    for (const z of zs) {
      const p = z.p[i], c = z.c[i];
      if (c === 0) continue;
      if (p == null || c == null) { ok = false; break; }
      sp += p; sq += Math.min(p, c); sc += c;
    }
    if (ok && sc) { o[i] = sp / sc; oc[i] = sq / sc; a[i] = sc - sq; }
  }
  return { o, oc, a };
}
function grpDay(term, gid, date) {
  const ck = `g|${term}|${gid}|${date}`;
  if (D.cache.has(ck)) return D.cache.get(ck);
  const doc = D.days.get(date);
  const zs = doc ? zonesFor(term, gid).map(z => doc.zones[z.id]).filter(Boolean) : [];
  const out = zs.length ? aggDay(zs) : null;
  D.cache.set(ck, out);
  return out;
}
function zoneDay(zid, date) {
  const ck = `z|${zid}|${date}|${S.over}`;
  if (D.cache.has(ck)) return D.cache.get(ck);
  const doc = D.days.get(date), z = doc && doc.zones[zid];
  if (!z) { D.cache.set(ck, null); return null; }
  const o = new Array(DAY).fill(null), oc = o.slice(), a = o.slice();
  for (let i = 0; i < DAY; i++) {
    const p = z.p[i], c = z.c[i];
    if (p == null || c == null || c <= 0) continue;
    o[i] = p / c;
    oc[i] = Math.min(p, c) / c;
    a[i] = Math.max(c - p, 0);
  }
  const out = { o, oc, a };
  D.cache.set(ck, out);
  return out;
}
/* nd일 × 288 슬롯 연속 시계열, w주 전으로 이동 */
function zSeries(zid, d0, nd, w, key) {
  const ck = `zs|${zid}|${d0}|${nd}|${w}|${key}|${S.over}`;
  if (D.cache.has(ck)) return D.cache.get(ck);
  const out = new Array(nd * DAY).fill(null);
  for (let k = 0; k < nd; k++) {
    const d = zoneDay(zid, addDays(d0, k - 7 * w));
    if (d) for (let i = 0; i < DAY; i++) out[k * DAY + i] = d[key][i];
  }
  D.cache.set(ck, out);
  return out;
}
function nowAgg(term, gid) {
  const L = (D.latest && D.latest.zones) || [], zs = zonesFor(term, gid);
  let p = 0, q = 0, c = 0, n = 0;
  const parts = zs.map(z => {
    const x = L.find(y => y.id === z.id);
    if (!x || x.p == null || !x.c) return { z, p: null, c: null };
    p += x.p; q += Math.min(x.p, x.c); c += x.c; n++;
    return { z, p: x.p, c: x.c };
  });
  return n ? { occ: (S.over ? p : q) / c, avail: c - q, cap: c, extra: p - q, missing: zs.length - n, parts } : { occ: null, missing: zs.length, parts };
}

/* ---------- time geometry ---------- */
const weekStart = () => addDays(D.now.date, -((dowOf(D.now.date) + 6) % 7));
const todayK = () => (dowOf(D.now.date) + 6) % 7;
const NOWI = () => todayK() * DAY + D.now.idx;
const holidays = () => (D.cal && D.cal.holidays) || {};

function whyNull(date, i) {
  if (date > D.now.date || (date === D.now.date && i > D.now.idx)) return '아직 없음';
  const st = startDate();
  if (date < st) return '수집 전';
  if (date === st) { const doc = D.days.get(date); if (!doc || i < doc.first) return '수집 전'; }
  return '누락';
}
function kstLabel(iso) {
  const k = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일(${DOW[k.getUTCDay()]}) ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
function monthList() {
  const out = [], end = D.now.date.slice(0, 7);
  for (let y = +startDate().slice(0, 4), mo = +startDate().slice(5, 7); `${y}-${pad(mo)}` <= end; mo === 12 ? (y++, mo = 1) : mo++) out.push(`${y}-${pad(mo)}`);
  return out;
}
function rng() {
  const st = startDate(), today = D.now.date;
  let [f, t] = S.rng || [addDays(today, -13), today];
  f = f < st ? st : f > today ? today : f;
  t = t > today ? today : t < f ? f : t;
  if (daysBetween(f, t) >= MAXR) t = addDays(f, MAXR - 1);
  return [f, t];
}
function weekCfg() {
  const n = S.weeks, off = 7 * (n - 1) * DAY;
  return { kind: 'week', d0: addDays(weekStart(), -7 * (n - 1)), nd: 7 * n, off, win: [S.win[0] + off, S.win[1] + off], cmp: S.cmp };
}
function rangeCfg() {
  const [f, t] = rng(), nd = daysBetween(f, t) + 1, N = nd * DAY;
  const w = S.rwin && S.rwin[0] >= 0 && S.rwin[1] <= N && S.rwin[1] - S.rwin[0] >= 12 ? S.rwin : [0, N];
  return { kind: 'range', d0: f, nd, off: 0, win: w, cmp: 0 };
}
const chartCfg = () => S.tab === 'range' ? rangeCfg() : weekCfg();
function setWin(cfg, w) { if (cfg.kind === 'week') S.win = [w[0] - cfg.off, w[1] - cfg.off]; else S.rwin = w; }

/* ---------- header ---------- */
function renderHeader() {
  applyLayout();
  const st = document.getElementById('status');
  const L = D.latest;
  let color = '#c9ced4', text = '불러오는 중…';
  if (D.err && !L) { color = RISK; text = '데이터를 불러오지 못했습니다'; }
  else if (L) {
    const ok = L.last_ok_at ? new Date(L.last_ok_at) : null;
    if (!ok) { color = RISK; text = '아직 수집된 데이터가 없습니다'; }
    else {
      const mins = Math.max(0, Math.round((Date.now() - ok.getTime()) / 60000));
      color = L.stale || mins > 30 ? RISK : mins > 10 ? '#ee9b3b' : '#2e9d6a';
      text = `마지막 수집 ${mins < 1 ? '방금' : mins + '분 전'} · ${kstLabel(L.last_ok_at)}${L.stale ? ' · 원천 데이터 갱신 지연' : ''}`;
    }
  }
  st.innerHTML = `<span class="dot" style="background:${color}"></span><span>${esc(text)}</span>`;
  document.getElementById('terms').innerHTML = [['T1', 'T1 제1터미널'], ['T2', 'T2 제2터미널']]
    .map(([id, l]) => `<button data-a="term" data-v="${id}" class="${id === S.term ? 'on' : ''}" aria-pressed="${id === S.term}">${l}</button>`).join('');
  document.getElementById('tabs').innerHTML = TABS
    .map(([id, l]) => `<button data-a="tab" data-v="${id}" class="${id === S.tab ? 'on' : ''}" aria-current="${id === S.tab ? 'page' : 'false'}">${l}</button>`).join('');
  const s = startDate();
  document.getElementById('foot-start').textContent = `${s}부터 5분 간격 수집`;
}

/* ---------- shared controls ---------- */
const segHtml = (opts, cur, act) => opts.map(([id, l]) => `<button data-a="${act}" data-v="${id}" class="${String(id) === String(cur) ? 'on' : ''}" aria-pressed="${String(id) === String(cur)}">${l}</button>`).join('');
const overToggle = () => `<label class="chk" title="장기주차장 진입 대기처럼 주차 대수가 면수를 넘는 구간을 실제 값으로 표시합니다"><input type="checkbox" data-a="over"${S.over ? ' checked' : ''}><span>100% 초과 표시</span></label>`;
function groupChipsHtml(term) {
  const act = getAct(term);
  return `<div class="chips" role="group" aria-label="주차장 선택">${groupsOf(term).map(g => `<button class="chip${act[g.id] ? '' : ' off'}" data-a="grp" data-v="${g.id}" data-focus="${g.id}" aria-pressed="${!!act[g.id]}"><i style="border-color:${act[g.id] ? g.color : '#d9dce0'}"></i>${g.label}${g.note ? `<small>${g.note}</small>` : ''}</button>`).join('')}</div>`;
}
function keysHtml(cfg) {
  return `<span class="key"><i></i>실측</span>${cfg.cmp ? `<span class="key"><i class="dash"></i>${esc(cmpLabel(cfg.cmp))}</span>` : ''}
    ${S.linkedForecast && cfg.cmp ? '<span class="key"><i class="linked"></i>연결 예측(오프셋)</span>' : ''}
    ${S.metric === 'occ' ? '<span class="key"><i class="ref"></i>만차 기준 100%</span>' : ''}<span class="key"><i class="bg off"></i>토·일·공휴일</span>`;
}

/* ---------- chart (주차장 현황 · 기간별 기록 공용) ---------- */
function chartModel(cfg) {
  const term = S.term, on = onGroups(term), zones = on.flatMap(g => g.zones), key = vkey(), occ = S.metric === 'occ', { d0, nd, cmp } = cfg;
  const [a, b] = cfg.win, span = b - a, step = Math.max(1, Math.floor(span / 700)), hol = holidays();
  const ti = daysBetween(d0, D.now.date), nowG = ti >= 0 && ti < nd ? ti * DAY + D.now.idx : null;
  const cur = z => zSeries(z.id, d0, nd, 0, key), prev = z => zSeries(z.id, d0, nd, cmp, key);
  const fmt = v => v == null ? '—' : occ ? pct(v) : num(v) + '대';
  let mx = -Infinity;
  zones.forEach(z => (cmp ? [cur(z), prev(z)] : [cur(z)]).forEach(s => { for (let j = a; j < b; j++) { const v = s[j]; if (v != null && v > mx) mx = v; } }));
  const hasData = isFinite(mx);
  let hi, yTicks;
  if (occ) { hi = occTop(mx); yTicks = ticks(0, hi, 0.2, pct); }
  else { hi = niceCeil((hasData ? mx : 1000) * 1.08); yTicks = ticks(0, hi, hi / 4, v => num(v)); }
  const yv = v => H * (1 - v / hi), xv = j => (j - a) / span * W, px = j => ((j - a) / span * 100).toFixed(2);
  const sr = span <= 48 ? 0 : Math.max(2, step * 2);
  const mk = arr => { const sm = smoothVals(arr, a, b, sr), segs = []; let c = null; for (let j = a; j < b; j += step) { const v = sm[j - a]; if (v == null) { c = null; continue; } if (!c) segs.push(c = []); c.push([xv(j), yv(v)]); } return smoothPath(segs); };
  const mkFrom = (arr, from) => {
    const start = Math.max(a, from), sm = smoothVals(arr, start, b, sr), points = [];
    for (let j = start; j < b; j += step) {
      const v = j === from ? arr[j] : sm[j - start];
      if (v != null) points.push([xv(j), yv(v)]);
    }
    return smoothPath(points.length ? [points] : []);
  };
  const lines = [];
  if (cmp) zones.forEach(z => lines.push({ g: categoryGroup(z), z: z.id, name: z.name, d: mk(prev(z)), color: z.color, w: 1.4, dash: '4 3', op: CMP_OP, cmp: 1 }));
  zones.forEach(z => lines.push({ g: categoryGroup(z), z: z.id, name: z.name, d: mk(cur(z)), color: z.color, w: 2.2, dash: 'none', op: 1, cmp: 0 }));
  if (S.linkedForecast && cmp && nowG != null && nowG >= a && nowG < b) {
    for (const z of zones) {
      const actual = cur(z), baseline = prev(z);
      let anchor = nowG;
      while (anchor >= Math.max(a, nowG - 6) && actual[anchor] == null) anchor--;
      if (anchor < a || actual[anchor] == null || baseline[anchor] == null) continue;
      const actualSmooth = smoothVals(actual, a, b, sr)[anchor - a];
      const baselineSmooth = smoothVals(baseline, a, b, sr)[anchor - a];
      const anchorValue = actualSmooth ?? actual[anchor];
      const offset = anchorValue - (baselineSmooth ?? baseline[anchor]), projected = new Array(nd * DAY).fill(null);
      const capacity = D.latest.zones.find(x => x.id === z.id)?.c || Infinity;
      const ceiling = occ ? (S.over ? Infinity : 1) : capacity;
      for (let j = anchor; j < b; j++) {
        if (baseline[j] != null) projected[j] = clamp(baseline[j] + offset, 0, ceiling);
      }
      projected[anchor] = anchorValue;
      lines.push({
        g: categoryGroup(z), z: z.id, name: `${z.name} · 연결 예측`,
        d: mkFrom(projected, anchor), color: z.color, w: 2.2, dash: '5 3',
        op: 0.88, cmp: 0, forecast: true, offset, anchor, anchorValue
      });
    }
  }
  const dots = [];
  if (span <= 48) zones.forEach(z => { const s = cur(z); for (let j = a; j < b; j++) if (s[j] != null) dots.push({ left: (xv(j) / 10).toFixed(2), top: (yv(s[j]) / 2).toFixed(2), c: z.color }); });
  const plotEl = document.getElementById('plot');
  const plotPx = plotEl && plotEl.clientWidth ? plotEl.clientWidth : Math.max(240, Math.min(window.innerWidth, 1280) - 110), dayPx = DAY / span * plotPx;
  const vLines = [], dayLabels = [], bands = [];
  for (let k = Math.max(0, Math.floor(a / DAY)); k < Math.min(nd, Math.ceil(b / DAY)); k++) {
    const s0 = k * DAY, date = addDays(d0, k), dw = dowOf(date), isT = date === D.now.date, h = hol[date];
    if (s0 > a && s0 < b) vLines.push({ left: px(s0), c: dw === 1 && nd > 7 ? '#9aa3ad' : '#c9ced4' });
    const l = Math.max(a, s0), r = Math.min(b, s0 + DAY), w = (r - l) / span * plotPx;
    if (r <= l) continue;
    bands.push({ left: px(l), width: ((r - l) / span * 100).toFixed(2), bg: dayBg(date, hol, k), today: isT });
    const base = `${DOW[dw]} ${md(date)}${isT && w > 90 ? ' 오늘' : ''}`, withH = h ? `${base} · ${h}` : base;
    const label = w > 78 ? (withH.length * 12 < w - 8 ? withH : base) : w > 34 ? md(date) : w > 13 ? String(+date.slice(8)) : dw === 1 ? md(date) : '';
    if (label) dayLabels.push({ left: (((l + r) / 2 - a) / span * 100).toFixed(2), label, c: isT ? INK : isOffDay(date, hol) ? RISK : '#5b6168', w: isT ? 700 : 500 });
  }
  const tstep = span > 600 ? (dayPx >= 140 ? 144 : 0) : span > 200 ? 36 : span > 60 ? 12 : span > 24 ? 6 : 3;
  const xTicks = [];
  if (tstep) for (let j = Math.ceil(a / tstep) * tstep; j <= b; j += tstep) {
    if (span > 600 && j % DAY === 0) continue;
    xTicks.push({ left: px(j), label: slotLabel(j % DAY) });
    if (span <= 600 && j % DAY !== 0 && j > a && j < b) vLines.push({ left: px(j), c: '#f0f2f4' });
  }
  return { cfg, on, zones, a, b, span, hi, yv, yTicks, lines, dots, vLines, dayLabels, xTicks, bands, fmt, hasData, nowG, cur, prev, occ };
}

function chartHtml(m) {
  const nowL = m.nowG != null && m.nowG >= m.a && m.nowG <= m.b ? ((m.nowG - m.a) / m.span * 100).toFixed(2) : null;
  const ref = m.occ ? ((1 - 1 / m.hi) * 100).toFixed(2) : null;
  return `<div class="daylabels">${m.dayLabels.map(d => `<span style="left:${d.left}%;color:${d.c};font-weight:${d.w}">${esc(d.label)}</span>`).join('')}</div>
      <div class="plot" id="plot">
        ${m.bands.map(d => `<div class="abs band" style="left:${d.left}%;width:${d.width}%;background:${d.bg}"></div>${d.today ? `<div class="abs todaybar" style="left:${d.left}%;width:${d.width}%"></div>` : ''}`).join('')}
        ${m.yTicks.map(g => `<div class="abs grid" style="top:${g.top}%"></div><div class="abs ylab" style="top:${g.top}%">${g.label}</div>`).join('')}
        ${m.vLines.map(l => `<div class="abs vline" style="left:${l.left}%;border-color:${l.c}"></div>`).join('')}
        ${ref != null ? `<div class="abs refline" style="top:${ref}%"></div>${m.hi > 1 ? `<span class="abs reftag" style="top:${ref}%">만차 기준 100%</span>` : ''}` : ''}
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${m.lines.map(p => `<path data-g="${p.g}" data-z="${p.z}" data-op="${p.op}" data-cmp="${p.cmp}" data-forecast="${!!p.forecast}" d="${p.d}" style="stroke:${p.color};stroke-width:${p.w};stroke-dasharray:${p.dash};opacity:${p.op}"><title>${esc(p.name)}${p.forecast ? ` · 오프셋 ${pctp(p.offset)}` : p.cmp ? ` · ${CMPS[m.cfg.cmp]}` : ''}</title></path>`).join('')}</svg>
        ${m.dots.map(o => `<div class="abs dotm" style="left:${o.left}%;top:${o.top}%;border-color:${o.c}"></div>`).join('')}
        ${nowL != null ? `<div class="abs nowline" style="left:${nowL}%"></div><span class="abs nowtag${nowL > 80 ? ' flip' : ''}" style="left:${nowL}%">지금 ${slotLabel(D.now.idx)}</span>` : ''}
        ${!m.on.length ? '<div class="abs emptymsg">주차장을 하나 이상 켜세요.</div>' : !m.hasData ? '<div class="abs emptymsg">이 구간에는 수집된 기록이 없습니다.</div>' : ''}
        <div id="overlay"></div>
      </div>
      <div class="xticks">${m.xTicks.map(x => `<span style="left:${x.left}%">${x.label}</span>`).join('')}</div>
      <div class="overview" id="overview">${overviewHtml(S.term, m.cfg)}</div>`;
}

function overviewHtml(term, cfg) {
  const { d0, nd } = cfg, N = nd * DAY, key = occKey(), so = nd <= 7 ? 6 : nd <= 14 ? 12 : nd <= 31 ? 24 : 36, hol = holidays();
  const pts = w => { const out = []; for (let k = 0; k < nd; k++) { const t = grpDay(term, '합계', addDays(d0, k - 7 * w)); for (let i = 0; i < DAY; i += so) out.push([k * DAY + i, t ? t[key][i] : null]); } return out; };
  const series = cfg.kind === 'week' ? [[pts(1), '#a9bdd1', 1], [pts(0), INK, 1.25]] : [[pts(0), INK, 1.25]];
  const hi = Math.max(1, ...series.flatMap(([p]) => p.map(x => x[1] ?? 0)));
  const path = p => { let d = '', pen = false; for (const [n, v] of p) { if (v == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + (n / N * W).toFixed(1) + ',' + (H * (1 - (v - 0.2) / (hi - 0.2))).toFixed(1); pen = true; } return d; };
  const [a, b] = cfg.win;
  const labels = [];
  for (let k = 0; k < nd; k++) {
    const date = addDays(d0, k), dw = dowOf(date);
    const l = nd <= 7 ? DOW[dw] : nd <= 45 ? (dw === 1 || k === 0 ? md(date) : '') : (date.endsWith('-01') || k === 0 ? `${+date.slice(5, 7)}월` : '');
    if (l) labels.push(`<span class="od" style="left:${(k / nd * 100).toFixed(3)}%${isOffDay(date, hol) ? ';color:' + RISK : ''}">${l}</span>`);
  }
  return `${Array.from({ length: nd }, (_, k) => `<span class="ob" style="left:${(k / nd * 100).toFixed(3)}%;width:${(100 / nd).toFixed(3)}%;background:${dayBg(addDays(d0, k), hol, k)}"></span>`).join('')}<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${series.map(([p, c, w]) => `<path d="${path(p)}" style="stroke:${c};stroke-width:${w}"/>`).join('')}</svg>
    <div class="win" style="left:${(a / N * 100).toFixed(2)}%;width:${((b - a) / N * 100).toFixed(2)}%"></div>${labels.join('')}`;
}

function renderOverlay() {
  const el = document.getElementById('overlay');
  if (!el || !WM) return;
  const m = WM, { a, span } = m, cmp = m.cfg.cmp, sel = S.sel, hf = S.hf;
  let html = '';
  if (sel && Math.abs(sel[1] - sel[0]) > 0.005) html += `<div class="abs selbox" style="left:${(Math.min(...sel) * 100).toFixed(2)}%;width:${(Math.abs(sel[1] - sel[0]) * 100).toFixed(2)}%"></div>`;
  if (hf != null && !sel && m.on.length) {
    const hj = clamp(a + Math.round(hf * span), a, m.b - 1), date = addDays(m.cfg.d0, Math.floor(hj / DAY)), i = hj % DAY, hol = holidays()[date];
    const rows = m.zones.map(z => {
      const v = m.cur(z)[hj], c = cmp ? m.prev(z)[hj] : null;
      return { c: z.color, label: z.name, val: v == null ? whyNull(date, i) : m.fmt(v), cmp: cmp ? m.fmt(c) : '', sort: v ?? c ?? -1 };
    }).sort((x, y) => y.sort - x.sort);
    const left = ((hj - a) / span * 100).toFixed(2);
    html += `<div class="abs hline" style="left:${left}%"></div>
      <div class="tip" style="left:${left}%;transform:${hf > 0.6 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)'}">
        <div class="th"><b>${DOW[dowOf(date)]} ${md(date)} ${slotLabel(i)}${hol ? ' · ' + esc(hol) : ''}</b><span>실측${cmp ? ' · ' + CMPS[cmp] : ''}</span></div>
        ${rows.map(r => `<div class="tr"><i style="border-color:${r.c}"></i><span class="n">${esc(r.label)}</span><span class="v">${r.val}</span><span class="c">${r.cmp}</span></div>`).join('')}
      </div>`;
  }
  el.innerHTML = html;
}
/* hover 강조는 DOM을 다시 그리지 않고 선의 스타일만 바꿉니다(iOS에서 첫 탭이 hover로 소모되지 않도록). */
function applyFocus() {
  const f = S.focus;
  document.querySelectorAll('#plot svg path[data-g]').forEach(p => {
    const base = +p.dataset.op, mine = p.dataset.g === f, cmp = p.dataset.cmp === '1';
    p.style.opacity = f == null ? base : mine ? (cmp ? Math.min(1, base * 1.6) : 1) : cmp ? 0.08 : 0.14;
    if (!cmp) p.style.strokeWidth = f != null && mine ? 3 : 2.2;
  });
}

let WM = null, drag = null;
function bindPlot() {
  const plot = document.getElementById('plot');
  if (!plot || !WM) return;
  const cfg = WM.cfg, N = cfg.nd * DAY;
  const frac = e => { const r = plot.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  plot.addEventListener('pointerdown', e => {
    const f = frac(e);
    if (e.pointerType === 'touch') { S.hf = f; renderOverlay(); return; }
    drag = f; try { plot.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    S.sel = [f, f]; renderOverlay();
  });
  plot.addEventListener('pointermove', e => {
    const f = frac(e);
    S.hf = f;
    if (drag != null) S.sel = [drag, f];
    renderOverlay();
  });
  plot.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch' || drag == null) return;
    const f = frac(e), f0 = drag; drag = null;
    const [a, b] = cfg.win, span = b - a;
    if (Math.abs(f - f0) > 0.015) {
      let na = Math.round(a + Math.min(f, f0) * span), nb = Math.round(a + Math.max(f, f0) * span);
      if (nb - na < 12) { na = Math.round((na + nb) / 2 - 6); nb = na + 12; }
      na = clamp(na, 0, N - 12); nb = clamp(nb, na + 12, N);
      setWin(cfg, [na, nb]); S.sel = null; winTouched = true; updateHash(); render();
    } else {
      S.sel = null;
      const r = plot.getBoundingClientRect();
      hitLine(f, clamp((e.clientY - r.top) / r.height, 0, 1));
    }
  });
  plot.addEventListener('pointerleave', e => { if (drag == null && e.pointerType !== 'touch') { S.hf = null; renderOverlay(); } });
  const ov = document.getElementById('overview');
  ov && ov.addEventListener('click', e => {
    const r = ov.getBoundingClientRect(), f = clamp((e.clientX - r.left) / r.width, 0, 1), [a, b] = cfg.win, span = b - a;
    const na = clamp(Math.round(f * N - span / 2), 0, N - span); setWin(cfg, [na, na + span]); winTouched = true; render();
  });
}
function hitLine(fx, fy) {
  const m = WM; if (!m) { renderOverlay(); return; }
  const j = clamp(m.a + Math.round(fx * m.span), m.a, m.b - 1);
  let best = null, bd = 14;
  m.zones.forEach(z => (m.cfg.cmp ? [m.cur(z), m.prev(z)] : [m.cur(z)]).forEach(s => { const v = s[j]; if (v != null) { const d = Math.abs(m.yv(v) - fy * H); if (d < bd) { bd = d; best = categoryGroup(z); } } }));
  if (best != null) setAct(S.term, { ...getAct(S.term), [best]: false });
  else renderOverlay();
}
function panWin(dir) {
  const cfg = chartCfg(), [x, y] = cfg.win, span = y - x, half = Math.round(span / 2);
  if (cfg.kind === 'week') {
    const na = clamp(S.win[0] + dir * half, -7 * (MAXW - 1) * DAY, WEEK - span);
    while (na < -7 * (S.weeks - 1) * DAY) S.weeks++;
    S.win = [na, na + span];
  } else {
    const na = clamp(x + dir * half, 0, cfg.nd * DAY - span);
    S.rwin = [na, na + span];
  }
}

/* ---------- 주차장 현황 ---------- */
function groupCardsHtml(term, stale) {
  const act = getAct(term);
  return `<div class="gcards">${groupsOf(term).map(g => {
    const on = !!act[g.id], A = nowAgg(term, g.id);
    let box, title;
    if (A.occ != null) {
      const band = occBand(A.occ);
      title = `${g.label}${g.note ? ` (${g.note})` : ''} · ${band[1]} · ${S.metric === 'occ' ? `점유율 ${pct(A.occ)}` : `가용 ${num(A.avail)}대`} · 가용 ${num(A.avail)} / ${num(A.cap)}대 · 점유율 ${pct(A.occ)}${A.extra > 0 ? ` · 면수 초과 진입 ${num(A.extra)}대` : ''}${A.missing ? ` · ${A.missing}개 구역 값 없음` : ''}`;
      box = `<span class="zc-box${stale ? ' stale' : ''}"><span class="zc-fill" style="width:${(S.metric === 'occ' ? Math.min(A.occ, 1) : A.cap ? A.avail / A.cap : 0) * 100}%;background:${occTint(A.occ)};box-shadow:inset 0 -3px 0 ${occColor(A.occ)}"></span>
        <span class="zc-t"><small class="k">가용</small><b>${num(A.avail)}</b><small>/${num(A.cap)}</small></span><span class="zc-p" style="color:${occColor(A.occ)}">${S.metric === 'occ' ? `점유율 ${pct(A.occ)}` : `가용 ${num(A.avail)}대`}</span></span>`;
    } else {
      title = `${g.label} · 최신값 없음`;
      box = '<span class="zc-box na">값 없음</span>';
    }
    const parts = A.parts.map(({ z, p, c }) => `<span${p != null && p > c ? ' class="ov" title="면수 초과 진입 ' + num(p - c) + '대"' : ''}><i style="border-color:${z.color}"></i>${esc(shortName(z))} <b>${p == null ? '—' : pct(S.over ? p / c : Math.min(p / c, 1))}</b></span>`).join('');
    return `<button class="gc${on ? '' : ' off'}" data-a="grp" data-v="${g.id}" data-focus="${g.id}" aria-pressed="${on}" title="${esc(title)}">
      <span class="gc-h"><span class="sw" style="border-color:${on ? g.color : '#d9dce0'}"></span><span class="nm">${g.label}</span>${g.note ? `<small>${g.note}</small>` : ''}</span>${box}<span class="gc-zs">${parts}</span></button>`;
  }).join('')}</div>`;
}

function latestAge() {
  const ok = D.latest && D.latest.last_ok_at;
  return ok ? (Date.now() - new Date(ok).getTime()) / 60000 : Infinity;
}

function cmpLabel(cmp) {
  if (!cmp) return '';
  const c = weekCfg(), s = addDays(c.d0, -7 * cmp), e = addDays(s, c.nd - 1), hol = holidays();
  const hs = [...new Set(Object.keys(hol).filter(d => d >= s && d <= e).map(d => hol[d].replace(/\(.*\)/, '')))];
  const pre = e < startDate() ? ' · 수집 전' : '';
  return `${CMPS[cmp]} ${md(s)}–${md(e)}${hs.length ? ' · ' + hs.join('·') + ' 포함' : ''}${pre}`;
}

function renderWeek() {
  const term = S.term, cfg = weekCfg(), m = chartModel(cfg), tot = nowAgg(term, '합계'), age = latestAge(), stale = age > 15;
  const [a, b] = S.win, tk = todayK() * DAY, n0 = clamp(NOWI() - 36, -7 * (S.weeks - 1) * DAY, WEEK - 72);
  const spans = [1, 2, 3, 4].map(n => [n, n === 1 ? '이번 주' : `${n}주`, [-7 * (n - 1) * DAY, WEEK]]);
  const zooms = [['today', '오늘', [tk, tk + DAY]], ['now', '지금 ±3시간', [n0, n0 + 72]]];
  const btn = (act, v, l, on) => `<button data-a="${act}" data-v="${v}" class="${on ? 'on' : ''}" aria-pressed="${on}">${l}</button>`;
  const partial = tot.missing && tot.occ != null ? ` · ${tot.missing}개 구역 값 없음` : '';
  document.getElementById('view').innerHTML = `
  <section class="sec">
    <div class="sec-head">
      <div class="titles"><span class="t17">${term} 주차장 현황</span>
        <span class="sub">${mdw(cfg.d0)} → ${mdw(addDays(cfg.d0, cfg.nd - 1))} · 구역별 5분 실측 그래프 · 드래그로 구간 확대 · 카테고리 카드나 선을 눌러 켜기/끄기</span></div>
      <div class="total"><span class="lbl">${term} 합계 지금 (예약 제외${partial})</span><span class="val">가용 ${tot.occ == null ? '—' : num(tot.avail) + '대'} · 점유율 ${tot.occ == null ? '—' : pct(tot.occ)}</span></div>
    </div>
    <div class="controls">
      <div>
        <div class="seg" role="group" aria-label="기간">${spans.map(([n, l, r]) => btn('weeks', n, l, S.weeks === n && a === r[0] && b === r[1])).join('')}</div>
        <div class="seg" role="group" aria-label="확대">${zooms.map(([, l, r]) => btn('win', r.join(','), l, a === r[0] && b === r[1])).join('')}</div>
        <div class="pan"><button data-a="pan" data-v="-1" aria-label="이전 구간">◀</button><button data-a="pan" data-v="1" aria-label="다음 구간">▶</button></div>
      </div>
      <div class="control-metrics">
        <div class="seg cmp" role="group" aria-label="점선 비교">${segHtml(CMPS.map((l, w) => [w, l]), S.cmp, 'cmp')}</div>
        <label class="chk linked-toggle" title="비교 주차의 흐름을 현재 점유율/가용 대수에 맞춰 이어 그립니다"><input type="checkbox" data-a="linked" ${S.linkedForecast ? 'checked' : ''}${S.cmp ? '' : ' disabled'}><span>연결 예측</span></label>
        <div class="seg">${segHtml([['occ', '점유율'], ['avail', '가용 대수']], S.metric, 'metric')}</div>
        ${overToggle()}
      </div>
    </div>
    <div class="chart">
      <div class="legend">
        ${groupCardsHtml(term, stale)}
        <div class="ltools">
          <span class="occ-legend"><span>${D.latest && D.latest.last_ok_at ? (stale ? `⚠ ${Math.round(age)}분 전 값` : `${kstLabel(D.latest.last_ok_at)} 기준`) : '최신값 없음'} · 가용/전체 대수 · 막대 = 점유율</span>${occupancyLegendHtml()}</span>
          <span class="tools"><button data-a="all" data-v="1">전체</button><button data-a="all" data-v="0">해제</button>${keysHtml(cfg)}</span>
        </div>
      </div>
      ${chartHtml(m)}
    </div>
  </section>
  ${forecastHtml()}`;
  WM = m;
  bindPlot();
  applyFocus();
  renderOverlay();
}

/* 예상 점유율: 지난주 같은 요일의 흐름 + (지금 − 지난주 같은 시각) 오프셋 */
function forecastOf(term, gid) {
  const today = D.now.date, idx = D.now.idx, key = occKey(), td = zoneDay(gid, today);
  const sample = offset => {
    const { date, slot } = slotRange(today, idx + offset), day = zoneDay(gid, date);
    if (!day) return { v: null, date, slot };
    const values = [slot - 1, slot, slot + 1].map(i => {
      const at = slotRange(date, i), d = zoneDay(gid, at.date);
      return d ? d[key][at.slot] : null;
    }).filter(v => v != null);
    return { v: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, date, slot };
  };
  const history = [-36, -24, -12].map(sample);
  let i0 = -1;
  if (td) for (let i = idx; i >= Math.max(0, idx - 6); i--) if (td[key][i] != null) { i0 = i; break; }
  if (i0 < 0) return { ok: false, why: '지금 값이 없어 추정할 수 없습니다', now: null, history };
  const now = td[key][i0], h0 = Math.floor(idx / 12) + 1, cap = S.over ? Infinity : 1;
  for (let w = 1; w <= 4; w++) {
    const bd = addDays(today, -7 * w), docs = [zoneDay(gid, bd), zoneDay(gid, addDays(bd, 1))];
    const at = j => { const g = docs[Math.floor(j / DAY)]; return g ? g[key][j % DAY] : null; };
    const sm = j => { let s = 0, n = 0; for (let k = Math.max(0, j - 2); k <= j + 2; k++) { const v = at(k); if (v != null) { s += v; n++; } } return n ? s / n : null; };
    const base = sm(i0);
    if (base == null) continue;
    const off = now - base;
    const cells = Array.from({ length: 6 }, (_, k) => { const j = (h0 + k) * 12, bv = sm(j); return { j, base: bv, v: bv == null ? null : clamp(bv + off, 0, cap) }; });
    if (cells.every(c => c.v == null)) continue;
    return { ok: true, now, i0, base, off, w, date: bd, history, cells };
  }
  return { ok: false, why: '지난 4주 같은 요일 기록이 없어 추정할 수 없습니다', now, i0, history };
}
function forecastHtml() {
  const term = S.term, on = selectedZones(term), h0 = Math.floor(D.now.idx / 12) + 1;
  const rows = on.map(z => ({ z, g: GROUPS.find(g => g.cats.includes(z.category)), f: forecastOf(term, z.id) }));
  const first = rows.find(r => r.f.ok), bd = first ? first.f.date : addDays(D.now.date, -7);
  const actualHead = [-36, -24, -12].map(offset => {
    const p = slotRange(D.now.date, D.now.idx + offset);
    return `<span>${slotLabel(p.slot)}${p.date !== D.now.date ? `<small>${p.date < D.now.date ? '어제' : '내일'}</small>` : ''}</span>`;
  }).join('');
  const timelineHead = `${actualHead}<span class="current" title="${slotLabel(D.now.idx)}">지금</span>${Array.from({ length: 6 }, (_, k) => { const h = h0 + k; return `<span class="future">${pad(h % 24)}:00${h >= 24 && (k === 0 || h === 24) ? '<small>내일</small>' : ''}</span>`; }).join('')}`;
  const body = rows.map(({ z, g, f }) => {
    const name = `<span class="rname"><i style="border-color:${z.color}"></i>${esc(z.name)}<small class="fc-cat">${g.label}</small></span>`;
    const actual = f.history.map(p => {
      const label = `${slotLabel(p.slot)}${p.date !== D.now.date ? ` · ${p.date < D.now.date ? '어제' : '내일'}` : ''}`;
      return { v: p.v, label, kind: 'past' };
    }).concat({ v: f.now, label: `지금 ${slotLabel(D.now.idx)}`, kind: 'current' });
    const future = f.cells || Array.from({ length: 6 }, (_, k) => ({ v: null, j: (h0 + k) * 12 }));
    const points = actual.concat(future.map((c, i) => ({ v: c.v, base: c.base, label: slotLabel(c.j % DAY), kind: 'future', firstFuture: i === 0, j: c.j })));
    const cells = points.map(p => {
      if (p.v == null) return `<div class="fc-cell na ${p.kind}${p.firstFuture ? ' first-future' : ''}" title="실측 기록 없음">—</div>`;
      const color = occColor(p.v);
      const detail = p.kind === 'future' ? `${wkLabel(f.w)} ${pct(p.base)}` : p.kind === 'current' ? `현재 ${pct(p.v)}` : `실측 ${pct(p.v)}`;
      const title = p.kind === 'future' ? `${z.name} ${p.label} 예상 ${pct(p.v)} = ${wkLabel(f.w)} ${pct(p.base)} ${pctp(f.off)}` : `${z.name} ${p.label} ${detail}`;
      return `<div class="fc-cell ${p.kind}${p.firstFuture ? ' first-future' : ''}" style="--occ:${color};--fg:${contrastText(color)};background:${color};color:var(--fg)" title="${esc(title)}"><b>${pct(p.v)}</b><small>${p.kind === 'future' ? `${wkLabel(f.w)} ${pct(p.base)}` : p.kind === 'current' ? '현재' : '실측'}</small></div>`;
    }).join('');
    const note = f.ok
      ? `<small>현재 ${pct(f.now)} · ${wkLabel(f.w)} 같은 시각 ${pct(f.base)}</small><small>차이 <b>${pctp(f.off)}</b> 반영</small>`
      : `<small>${f.now == null ? '현재 실측 없음' : `현재 ${pct(f.now)}`} · ${esc(f.why)}</small>`;
    return `<div class="fc-row"><div class="fc-name">${name}${note}</div>${cells}</div>`;
  }).join('');
  return `<section class="sec lite">
    <div class="sec-head" style="align-items:flex-end">
      <div class="titles"><span class="t15">예상 점유율 · 지난 3시간 + 앞으로 6시간</span>
        <span class="sub">과거는 구역별 실측입니다. 예상은 지난주 같은 요일(${md(bd)} ${DOW[dowOf(bd)]})의 시간대별 흐름에 현재와 지난주 같은 시각의 차이를 더했습니다.</span></div>
      ${occupancyLegendHtml()}
    </div>
    ${!on.length ? '<span class="empty">위 카드에서 주차장을 하나 이상 켜세요.</span>' : `<div class="scroll-x"><div class="fc"><div class="fc-row hd"><span></span>${timelineHead}</div>${body}</div></div>`}
  </section>`;
}

/* ---------- 날짜별 기록 ---------- */
function staticChartHtml(list, n) {
  const all = list.flatMap(s => s.arr.filter(v => v != null)), hi = occTop(all.length ? Math.max(...all) : 0), ref = ((1 - 1 / hi) * 100).toFixed(2);
  const mk = arr => { const sm = smoothVals(arr, 0, n, 2), segs = []; let c = null; sm.forEach((v, j) => { if (v == null) { c = null; return; } if (!c) segs.push(c = []); c.push([j / (n - 1) * W, H * (1 - v / hi)]); }); return smoothPath(segs); };
  return `<div class="detail">
      ${ticks(0, hi, 0.2, pct).map(g => `<div class="grid" style="top:${g.top}%"></div><div class="ylab" style="top:${g.top}%">${g.label}</div>`).join('')}
      <div class="refline" style="top:${ref}%"></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${list.map(s => `<path d="${mk(s.arr)}" style="stroke:${s.color}"/>`).join('')}</svg>
    </div>`;
}
function statRows(on, arrOf, date) {
  return on.map(z => {
    const arr = arrOf(z); let iMax = -1, iMin = -1, sum = 0, n = 0, miss = 0;
    arr.forEach((v, j) => { if (v == null) { if (whyNull(date, j) === '누락') miss++; return; } if (iMax < 0 || v > arr[iMax]) iMax = j; if (iMin < 0 || v < arr[iMin]) iMin = j; sum += v; n++; });
    return `<div class="r"><span><i style="border-color:${z.color}"></i>${esc(z.name)}</span><span>${iMax >= 0 ? `${pct(arr[iMax])} · ${slotLabel(iMax)}` : '—'}</span><span>${iMin >= 0 ? `${pct(arr[iMin])} · ${slotLabel(iMin)}` : '—'}</span><span>${n ? pct(sum / n) : '—'}</span><span>${miss ? `${miss}슬롯 (${miss * 5}분)` : '없음'}</span></div>`;
  }).join('');
}
function renderDay() {
  const term = S.term, Z = zonesOf(term), act = getAct(term), sel = S.selDay || D.now.date, hol = holidays(), key = occKey();
  const st = startDate(), cal = (D.cal && D.cal.days) || {}, months = monthList();
  const ym = months.includes(S.month) ? S.month : months.includes(sel.slice(0, 7)) ? sel.slice(0, 7) : months[months.length - 1];
  const mi = months.indexOf(ym), y = +ym.slice(0, 4), mo = +ym.slice(5, 7);
  const first = `${ym}-01`, len = new Date(Date.UTC(y, mo, 0)).getUTCDate(), lead = (dowOf(first) + 6) % 7;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let n = 1; n <= len; n++) {
    const d = `${ym}-${pad(n)}`, info = cal[d] && cal[d][term], has = (!!cal[d] || d === D.now.date) && d >= st && d <= D.now.date;
    const v = info && info.max != null ? (S.over ? info.max : Math.min(info.max, 1)) : null;
    const dw = dowOf(d), h = hol[d];
    const bg = !has ? '#fff' : v == null ? '#f6f8fa' : occColor(v);
    const fg = !has ? '#c9ced4' : v != null ? contrastText(bg) : (h || dw === 0 ? RISK : INK);
    const t = has ? `${mo}/${n}(${DOW[dw]})${h ? ' ' + h : ''} · 최고 ${v == null ? '—' : pct(v) + (info.at ? ' (' + info.at + ')' : '')}` : (d < st ? '수집 전' : '');
    cells += `<button ${has ? `data-a="day" data-v="${d}"` : 'disabled'} title="${esc(t)}" style="background:${bg};color:${fg};outline:${d === sel ? '2px solid #16181a' : has ? 'none' : '1px dashed #e0e3e6'};font-weight:${d === sel || h ? 700 : 500};cursor:${has ? 'pointer' : 'default'}">${n}</button>`;
  }
  const monthHtml = `<div class="month">
      <div class="mnav"><button data-a="month" data-v="${months[mi - 1] || ''}" ${mi > 0 ? '' : 'disabled'} aria-label="이전 달">◀</button><span class="mn">${ymLabel(ym)}</span><button data-a="month" data-v="${months[mi + 1] || ''}" ${mi < months.length - 1 ? '' : 'disabled'} aria-label="다음 달">▶</button>
        <button class="linkbtn" data-a="gorange" data-v="${maxDate(first, st)}~${minDate(monthEnd(ym), D.now.date)}">이 달 기간별 기록 ›</button></div>
      <div class="dw"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span></div><div class="cells">${cells}</div></div>`;

  const doc = D.days.get(sel), loading = !D.days.has(sel);
  const arrOf = z => (zoneDay(z.id, sel) || {})[key] || new Array(DAY).fill(null);
  const avOf = z => (zoneDay(z.id, sel) || {}).a || [];
  const rows = Z.map(z => {
    const gid = categoryGroup(z), enabled = !!act[gid], o = arrOf(z), av = avOf(z);
    const cs = Array.from({ length: DAY }, (_, i) => {
      const v = o[i];
      if (v == null) { const w = whyNull(sel, i); return `<div title="${slotLabel(i)} · ${w}" style="background:${w === '누락' ? HATCH : '#fff'}"></div>`; }
      return `<div title="${esc(z.name)} ${slotLabel(i)} · ${pct(v)} · 가용 ${num(av[i])}대" style="background:${occColor(v)}"></div>`;
    }).join('');
    return `<div class="row${enabled ? '' : ' off'}" data-a="grp" data-v="${gid}" data-z="${z.id}" data-focus="${gid}" role="button" aria-pressed="${enabled}"><span class="rname"><i style="border-color:${enabled ? z.color : '#d9dce0'}"></i>${esc(z.name)}</span>${cs}</div>`;
  }).join('');
  const on = selectedZones(term);
  const dw = dowOf(sel), h = hol[sel];
  const title = `${+sel.slice(5, 7)}월 ${+sel.slice(8, 10)}일(${DOW[dw]})${h ? ' · ' + h : ''}${sel === D.now.date ? ' · 오늘 ' + slotLabel(D.now.idx) + '까지' : ''} · ${term}`;
  document.getElementById('view').innerHTML = `
  <div class="dayview">
    <section class="sec left">
      <div class="titles"><span class="t15">수집된 날짜</span><span class="sub">칸 색 = 그날 ${term} 최고 점유율(예약 제외) · ${md(st)} 수집 시작</span></div>
      ${monthHtml}
      <div class="grad"><span>0%</span><span class="bar occ-gradient" style="width:140px"></span><span>100%</span><span class="sq" style="background:${RISK};margin-left:6px"></span><span>만차 도달(98%+)</span></div>
    </section>
    <section class="sec right">
      <div class="sec-head" style="align-items:baseline">
        <div class="titles"><span class="t17">${esc(title)}</span><span class="sub">주차 구역별 5분 슬롯 288개 · 장기 카테고리에 주차타워 포함 · 행을 누르면 해당 카테고리의 모든 구역을 켜거나 끕니다</span></div>
        <div class="grad"><span>0%</span><span class="bar occ-gradient" style="width:140px"></span><span>100%</span><span class="sq hatch" style="margin-left:6px"></span><span>수집 누락</span></div>
      </div>
      ${loading ? '<div class="empty">불러오는 중…</div>' : !doc ? '<div class="empty">이 날짜의 기록이 없습니다.</div>' : `
      <div class="scroll-x"><div class="dgrid"><div class="hd"><span></span>${Array.from({ length: 24 }, (_, x) => `<span>${x % 3 === 0 ? pad(x) : ''}</span>`).join('')}</div>${rows}</div></div>
      <div class="col g10" style="border-top:1px solid #e6e8eb;padding-top:14px">
        <div class="sec-head" style="align-items:center"><span class="t15">선택한 주차장 · 하루 흐름</span>${overToggle()}</div>
        ${on.length ? `
        ${staticChartHtml(on.map(z => ({ arr: arrOf(z), color: z.color })), DAY)}
        <div class="detail-x">${[0, 6, 12, 18, 24].map(x => `<span style="left:${(x / 24 * 100).toFixed(2)}%">${pad(x)}:00</span>`).join('')}</div>
        <div class="scroll-x"><div class="stats"><div class="r h"><span>주차장</span><span>최고</span><span>최저</span><span>평균</span><span>수집 누락</span></div>${statRows(on, arrOf, sel)}</div></div>`
        : '<span class="empty">위 표에서 주차장 행을 눌러 켜세요.</span>'}
      </div>`}
    </section>
  </div>`;
}
const maxDate = (a, b) => a > b ? a : b;
const minDate = (a, b) => a < b ? a : b;

/* ---------- 기간별 기록 ---------- */
function rangeHeatmapHtml(term, cfg) {
  const on = selectedZones(term), dates = Array.from({ length: cfg.nd }, (_, k) => addDays(cfg.d0, k));
  if (!on.length) return '<span class="empty">위에서 주차 카테고리를 하나 이상 켜세요.</span>';
  const key = occKey();
  const rows = on.map(z => {
    const days = dates.map(d => zoneDay(z.id, d));
    const g = GROUPS.find(group => group.cats.includes(z.category));
    const cells = Array.from({ length: DAY }, (_, slot) => {
      let sum = 0, n = 0;
      for (const day of days) {
        const arr = day && day[key];
        if (!arr) continue;
        if (arr[slot] == null) continue;
        sum += arr[slot]; n++;
      }
      const avg = n ? sum / n : null, color = avg == null ? null : occColor(avg);
      return `<span class="th-cell${avg == null ? ' na' : ''}"${color ? ` style="--occ:${color};background:${color}"` : ''} aria-label="${esc(`${z.name} ${slotLabel(slot)} · ${avg == null ? '기록 없음' : `기간 평균 ${pct(avg)}`}`)}"></span>`;
    }).join('');
    return `<div class="th-row${getAct(term)[categoryGroup(z)] ? '' : ' off'}"><span class="th-name"><i style="border-color:${z.color}"></i><span>${esc(z.name)}</span><small>${g.label}</small></span>${cells}</div>`;
  }).join('');
  const head = Array.from({ length: DAY }, (_, slot) => `<span>${slot % 36 === 0 ? pad(slot / 12) : ''}</span>`).join('');
  return `<div class="titles"><span class="t15">기간별 시간대 점유율</span><span class="sub">${mdw(cfg.d0)}–${mdw(addDays(cfg.d0, cfg.nd - 1))} · 같은 시간대 5분 실측의 기간 평균 · 만차 초과 표시는 100%에서 색을 고정</span></div>
    ${occupancyLegendHtml()}
    <div class="scroll-x"><div class="timeheat">
      <div class="th-head"><span></span>${head}</div>${rows}
    </div></div>`;
}
/* 날짜 입력·월 선택(#rng-dates)은 포커스가 있는 동안 다시 그리지 않습니다(입력 중 값과 포커스 보존). */
function renderRange() {
  const term = S.term, cfg = rangeCfg(), m = chartModel(cfg), [f, t] = rng(), st = startDate(), today = D.now.date;
  const months = monthList();
  const pre = [[7, '최근 7일'], [14, '최근 14일'], [30, '최근 30일']].map(([n, l]) => [`${maxDate(st, addDays(today, 1 - n))}~${today}`, l]);
  const curMonth = months.find(ym => f === maxDate(`${ym}-01`, st) && t === minDate(monthEnd(ym), today)) || '';
  const loading = Array.from({ length: cfg.nd }, (_, k) => addDays(f, k)).some(d => !D.days.has(d));
  const set = (id, html) => { document.getElementById(id).innerHTML = html; };
  if (!document.getElementById('rng-dates')) {
    document.getElementById('view').innerHTML = `
  <section class="sec">
    <div class="sec-head" id="rng-head"></div>
    <div class="controls">
      <div><div class="seg" role="group" aria-label="빠른 기간" id="rng-pre"></div><span class="rdates" id="rng-dates"></span></div>
      <div id="rng-tools"></div>
    </div>
    <div class="chart" id="rng-chart"></div>
  </section>
  <section class="sec lite" id="rng-sum"></section>`;
  }
  set('rng-head', `<div class="titles"><span class="t17">${term} 기간별 기록</span>
      <span class="sub">${mdw(f)} → ${mdw(t)} · ${cfg.nd}일 · 5분 단위 실측 · 드래그로 구간 확대 · 최대 ${MAXR}일${S.rclip ? ` (요청한 기간을 ${MAXR}일로 줄였습니다)` : ''}${loading ? ' · 불러오는 중…' : ''}</span></div>`);
  set('rng-pre', segHtml(pre, `${f}~${t}`, 'rng'));
  const box = document.getElementById('rng-dates'), editing = rngEditing && box.contains(rngEditing) ? rngEditing : null;
  if (editing) {
    for (const el of box.querySelectorAll('[data-a]')) if (el !== editing) el.value = el.dataset.a === 'rfrom' ? f : el.dataset.a === 'rto' ? t : curMonth;
  } else {
    set('rng-dates', `<select class="sel" data-a="rmonth" aria-label="월 선택"><option value="">월 선택</option>${months.slice().reverse().map(ym => `<option value="${ym}"${ym === curMonth ? ' selected' : ''}>${ymLabel(ym)}</option>`).join('')}</select>
      <input type="date" data-a="rfrom" value="${f}" min="${st}" max="${today}" aria-label="시작일"><span>~</span><input type="date" data-a="rto" value="${t}" min="${st}" max="${today}" aria-label="종료일">`);
  }
  set('rng-tools', `<div class="pan"><button data-a="pan" data-v="-1" aria-label="이전 구간">◀</button><button data-a="pan" data-v="1" aria-label="다음 구간">▶</button></div>
      <button class="btn" data-a="rall"${m.a === 0 && m.b === cfg.nd * DAY ? ' disabled' : ''}>전체 보기</button>
      <div class="seg">${segHtml([['occ', '점유율'], ['avail', '가용 대수']], S.metric, 'metric')}</div>
      ${overToggle()}`);
  set('rng-chart', `<div class="legend">${groupChipsHtml(term)}<div class="ltools"><span class="tools">${keysHtml(cfg)}</span></div></div>
      ${chartHtml(m)}`);
  set('rng-sum', rangeHeatmapHtml(term, cfg));
  WM = m;
  bindPlot();
  applyFocus();
  renderOverlay();
}
/* 주소에서 읽을 때는 수집 기간을 아직 모르므로 그대로 두고, 화면에서 고를 때는 수집 기간·최대 길이에 맞춰 저장합니다. */
function setRange(f, t, normalize = true) {
  if (!isDate(f) || !isDate(t)) return;
  if (f > t) [f, t] = [t, f];
  S.rclip = daysBetween(f, t) >= MAXR;
  S.rng = [f, t]; S.rwin = null;
  if (normalize) S.rng = rng();
}
/* 키보드로 연도를 입력하는 중에는 0002-… 같은 값으로 change가 오므로 그럴듯한 날짜만 적용합니다. */
const plausibleDate = v => isDate(v) && v >= '2000-01-01' && v <= addDays(D.now.date, 366);

/* ---------- access & about ---------- */
function renderAccess() {
  const A = ACCESS[S.term], walk = '#2e7d57';
  const badge = r => r.route
    ? `<button class="how" data-a="sroute" data-v="${r.route}" style="color:${ACC};border-color:${ACC}" title="아래 셔틀 다음 출발에서 보기">${esc(r.how)} ›</button>`
    : `<span class="how" style="color:${r.walk ? walk : ACC};border-color:${r.walk ? walk : ACC}">${esc(r.how)}</span>`;
  document.getElementById('view').innerHTML = `
  <section class="sec" style="gap:6px"><span class="t17">${esc(A.title)}</span><span class="muted" style="font-size:13px;line-height:1.6">${esc(A.intro)}</span></section>
  <section class="sec lite" id="shuttle-net"></section>
  <div class="shuttle-layout">
    <section id="shuttle-platform" class="sh-platform"></section>
    <aside class="acc-side" id="shuttle-panel"></aside>
  </div>
  <section class="sec lite" id="shuttle-tt"></section>
  <details class="parking-guide"><summary>주차장별 출국장 이동 안내</summary>
    <section class="acc-main">
      ${A.rows.map(r => `<div class="acc-row">
        <div class="col"><span class="lot">${esc(r.lot)}</span><span class="zones">${esc(r.zones)}</span>${badge(r)}</div>
        <div class="col g10"><span class="detail-t">${esc(r.detail)}</span>
          <div class="facts">${r.facts.map(([k, v]) => `<div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div></div>
      </div>`).join('')}
      <p class="acc-src">${esc(A.source)}</p>
    </section>
  </details>`;
  if (typeof renderShuttle === 'function') renderShuttle();
}

function renderAbout() {
  const st = startDate(), cal = (D.cal && D.cal.days) || {}, days = Object.keys(cal).length, today = cal[D.now.date];
  const firstToday = D.now.date === st && D.days.get(st) ? D.days.get(st).first : 0;
  const expect = D.now.idx - firstToday + 1;
  const blocks = [
    ['무엇을 보여주나요', '인천국제공항공사가 공개하는 주차장별 주차 차량 수·총 주차면수를 5분마다 저장한 실측 기록입니다. 단기·장기(주차타워 포함)·예약주차장 단위로 묶어 보여주며, 지난 몇 주의 같은 요일·같은 시각 흐름과 비교하거나 원하는 기간의 변화를 직접 확인할 수 있습니다. ‘예상 점유율’은 지난주 같은 요일의 흐름에 지금과 지난주 같은 시각의 차이를 더한 단순 추정이며 공식 예측이 아닙니다.'],
    ['데이터 출처', '인천국제공항공사 주차 정보(공공데이터포털). 제1터미널 단기주차장(지하1~3층·지상층), 장기주차장(P1~P3), 장기 주차타워(P1·P2), P5 예약주차장과 제2터미널 단기주차장(지하M층·지상1~4층), 장기주차장, 장기주차타워(P1·P2), 예약주차장 등 19개 구역의 주차 차량 수와 총 주차면수를 사용합니다. 공휴일 표시는 한국천문연구원 특일 정보(공공데이터포털)를 사용합니다.'],
    ['왜 직접 쌓나요', `API는 조회하는 순간의 현재값만 제공합니다. 그래서 ${st}부터 5분마다 호출해 저장하고 있으며, 수집 시작 이전 기록은 없습니다. 5분 간격 호출은 하루 288회로 개발 계정 한도(일 1,000회) 안에 들어갑니다.`],
    ['100%를 넘는 값', '장기주차장은 주차타워로 들어가는 길목이라 진입 대기 차량까지 집계되어 주차 대수가 면수를 넘을 때가 있습니다. 기본 화면은 구역마다 면수를 상한으로 계산해 100%에 맞추고, ‘100% 초과 표시’를 켜면 실제 값과 100% 기준선을 함께 보여줍니다. 가용 대수는 항상 0대 이상으로 계산합니다.'],
    ['모바일·데스크톱 보기', '휴대폰에서는 필터와 그래프를 화면 폭에 맞춰 재배치하고 큰 셔틀 지도는 접어서 보여줍니다. 헤더의 보기 전환 버튼으로 모바일 또는 데스크톱 구성을 직접 선택할 수 있으며 선택은 이 브라우저에 저장됩니다.'],
    ['수집 품질', '응답이 없거나 값이 갱신되지 않은 슬롯은 “수집 누락”으로 비워 두고 보간하지 않습니다. 묶음(단기·장기·예약)과 터미널 합계는 같은 시각에 구성 구역 값이 모두 있을 때만 계산합니다. 가용 대수 = 총 주차면수 − 주차 차량 수. 터미널 합계와 날짜별 최고 점유율에서는 예약주차장을 제외합니다(카드에서 켜서 볼 수 있습니다). 비공식 서비스이므로 이용 전 공식 안내를 함께 확인하세요.'],
    ['수집 현황', `수집 일수 ${days}일 · 오늘 ${today ? today.n : 0}/${Math.max(expect, 0)}슬롯 수집${D.latest && D.latest.last_ok_at ? ' · 마지막 성공 ' + kstLabel(D.latest.last_ok_at) : ''}${D.latest && D.latest.ok === false && D.latest.error ? ' · 최근 호출 실패' : ''}`]
  ];
  document.getElementById('view').innerHTML = `<section class="about">${blocks.map(([t, b]) => `<div><b>${esc(t)}</b><p>${esc(b)}</p></div>`).join('')}</section>`;
}

/* ---------- render & events ---------- */
function render() {
  renderHeader();
  const v = document.getElementById('view');
  if (!D.latest) { v.innerHTML = D.err ? `<div class="notice">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. (${esc(D.err)})</div>` : '<div class="empty">불러오는 중…</div>'; return; }
  WM = null;
  if (S.tab === 'week') renderWeek();
  else if (S.tab === 'day') renderDay();
  else if (S.tab === 'range') renderRange();
  else if (S.tab === 'access') renderAccess();
  else renderAbout();
}

function neededDays() {
  const today = D.now.date, out = [];
  if (S.tab === 'week') {
    const c = weekCfg();
    for (let k = 0; k < c.nd; k++) { const d = addDays(c.d0, k); out.push(d, addDays(d, -7)); if (S.cmp) out.push(addDays(d, -7 * S.cmp)); }
    for (let w = 1; w <= 4; w++) out.push(addDays(today, -7 * w), addDays(today, 1 - 7 * w));
    out.push(addDays(today, -1));
  } else if (S.tab === 'day') out.push(S.selDay || today);
  else if (S.tab === 'range') { const c = rangeCfg(); for (let k = 0; k < c.nd; k++) out.push(addDays(c.d0, k)); }
  return out;
}
async function ensure() {
  await loadDays(neededDays(), false);
  render();
}

let winTouched = false;
const go = () => { updateHash(); render(); ensure(); };
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a, v = t.dataset.v;
  if (a === 'sroute' || a === 'sstop' || a === 'sview') { if (typeof onShuttleAction === 'function') onShuttleAction(a, v, t); return; }
  if (a === 'term') { S.term = v; S.focus = null; S.hf = null; }
  else if (a === 'tab') { S.tab = v; S.hf = null; S.focus = null; }
  else if (a === 'weeks') { const n = clamp(Number(v), 1, MAXW); S.weeks = n; S.win = [-7 * (n - 1) * DAY, WEEK]; winTouched = true; }
  else if (a === 'win') { S.win = v.split(',').map(Number); winTouched = true; }
  else if (a === 'pan') { panWin(Number(v)); winTouched = true; }
  else if (a === 'rall') { S.rwin = null; }
  else if (a === 'metric') { S.metric = v; }
  else if (a === 'cmp') { S.cmp = Number(v); }
  else if (a === 'over') { S.over = !!t.checked; store.set('icn.over', S.over ? '1' : '0'); }
  else if (a === 'linked') { S.linkedForecast = !!t.checked; }
  else if (a === 'layout') {
    S.layout = layoutMode() === 'mobile' ? 'desktop' : 'mobile';
    store.set('icn.layout', S.layout);
    render();
    return;
  }
  else if (a === 'all') { setAct(S.term, Object.fromEntries(groupsOf(S.term).map(g => [g.id, v === '1']))); return; }
  else if (a === 'grp') { const n = { ...getAct(S.term) }; n[v] = !n[v]; setAct(S.term, n); return; }
  else if (a === 'day') { S.selDay = v; }
  else if (a === 'month') { if (!v) return; S.month = v; }
  else if (a === 'rng') { const [f, x] = v.split('~'); setRange(f, x); }
  else if (a === 'gorange') { const [f, x] = v.split('~'); S.tab = 'range'; S.hf = null; setRange(f, x); }
  else return;
  go();
});
document.addEventListener('change', e => {
  const t = e.target, a = t && t.dataset && t.dataset.a;
  if (a === 'rmonth') { if (!t.value) return; setRange(maxDate(`${t.value}-01`, startDate()), minDate(monthEnd(t.value), D.now.date)); }
  else if ((a === 'rfrom' || a === 'rto') && plausibleDate(t.value)) setRange(a === 'rfrom' ? t.value : rng()[0], a === 'rto' ? t.value : rng()[1]);
  else return;
  go();
});
/* Chromium은 날짜 칸을 채우는 순간 activeElement를 잠시 body로 보고하므로 focusin/focusout으로 편집 중인 칸을 추적하고,
   포커스가 빠지면 정규화된 기간으로 입력칸을 다시 맞춥니다. */
let rngEditing = null;
document.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('#rng-dates')) rngEditing = e.target; });
document.addEventListener('focusout', e => {
  if (e.target !== rngEditing) return;
  setTimeout(() => {
    const box = document.getElementById('rng-dates');
    if (box && box.contains(document.activeElement) && document.activeElement !== document.body) { rngEditing = document.activeElement; return; }
    rngEditing = null;
    if (S.tab === 'range') render();
  }, 0);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('#rng-dates input')) e.target.blur();
});
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse' || !WM) return;
  const t = e.target.closest && e.target.closest('[data-focus]'), f = t ? t.dataset.focus : null;
  if (f && !getAct(S.term)[f]) return;
  if (f !== S.focus) { S.focus = f; applyFocus(); }
});

function updateHash() {
  let h = `#${S.tab}/${S.term}`;
  if (S.tab === 'day' && S.selDay) h += '/' + S.selDay;
  else if (S.tab === 'range' && S.rng) h += '/' + S.rng.join('~');
  history.replaceState(null, '', h);
}
function readHash() {
  const [tab, term, x] = location.hash.slice(1).split('/');
  if (TABS.some(t => t[0] === tab)) S.tab = tab;
  if (term === 'T1' || term === 'T2') S.term = term;
  if (isDate(x)) S.selDay = x;
  const r = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(x || '');
  if (r) setRange(r[1], r[2], false);
}

async function refresh(first) {
  const prevDate = D.now.date;
  D.now = kstNow();
  try {
    const [latest, cal] = await Promise.all([fetchJson('latest.json'), fetchJson('calendar.json').catch(() => null)]);
    D.latest = latest; D.cal = cal; D.err = null; D.zones = {};
  } catch (err) { D.err = err.message; }
  if (!first) { D.days.delete(D.now.date); D.days.delete(prevDate); }
  D.cache.clear();
  if (first && D.latest && !winTouched && S.weeks === 1) {
    const ws = weekStart(), st = startDate();
    if (st > ws && st <= D.now.date) {
      const k = Math.round((Date.parse(st) - Date.parse(ws)) / DAY_MS);
      S.win = [k * DAY, Math.max((todayK() + 1) * DAY, k * DAY + DAY)];
    }
  }
  if (first) render();
  await ensure();
}
function schedule() {
  const now = Date.now(), period = 300e3, next = Math.ceil((now - 45e3) / period) * period + 45e3;
  setTimeout(() => refresh(false).finally(schedule), Math.max(5e3, next - now));
}

/* ---------- static access guide ---------- */
const SRC = '출처: 인천국제공항 주차장 안내·셔틀버스 노선 안내(airport.kr, 공항01·02·03·04번). 단기주차장 도보 이동은 일반 안내이며, 노선·정류장·배차는 시간대별로 달라지거나 변경될 수 있으니 방문 전 공식 안내를 확인하세요.';
const ACCESS = {
  T1: {
    title: '제1여객터미널 · 주차 후 출국장(3층)까지',
    intro: '단기주차장은 터미널 건물과 붙어 있어 걸어서 이동합니다. 장기주차장·주차타워는 무료 셔틀 공항01번을 타고 터미널 1층에서 내려 3층 출국장으로 올라갑니다. P5 예약주차장은 공항01번이 아니라 공항03번을 이용합니다.',
    rows: [
      { lot: '단기주차장', zones: '지하1층 · 지하2층 · 지하3층 · 지상층', how: '도보', walk: true, detail: '주차 층에서 터미널 방향으로 이동한 뒤 엘리베이터·에스컬레이터로 3층 출국장.', facts: [['셔틀', '필요 없음'], ['이용', '상시']] },
      { lot: '장기주차장 · 주차타워', zones: '장기 P1 · P2 · P3 · 주차타워 P1 · P2', how: '무료 셔틀 공항01', route: '01', detail: '주차장 안 장기탑승장(1~7)에서 승차 → 제1여객터미널 1층 3C·13C 정류장 하차 → 3층 출국장. 주차타워도 공식 안내상 셔틀로 이동합니다.', facts: [['배차 간격', '8~16분'], ['운행 시간', '04:30~24:00'], ['소요', '왕복 16분']] },
      { lot: 'P5 예약주차장', zones: '예약 P5', how: '무료 셔틀 공항03', route: '03', detail: 'P5 예약주차장 정류장에서 공항03번 승차 → 제1여객터미널 3층 3번(동편)·12번(서편) 하차, 바로 출국장. 돌아올 때(T1 → P5)는 3층 8번에서 공항04번.', facts: [['공항03 배차', '7~20분'], ['공항03 운행', '04:30~23:35'], ['공항04 운행', '04:30~23:20']] }
    ],
    tip: '공항01번은 자정부터 새벽 4시 반까지 다니지 않습니다. 배차가 최대 16분이므로 대기 시간을 더해 여유 있게 출발하세요.',
    source: SRC
  },
  T2: {
    title: '제2여객터미널 · 주차 후 출국장(3층)까지',
    intro: '단기주차장은 터미널 건물과 붙어 있어 걸어서 이동합니다. 장기주차장·주차타워·예약주차장은 24시간 운행하는 무료 셔틀 공항02번을 타고 터미널 1층 5번에서 내립니다.',
    rows: [
      { lot: '단기주차장', zones: '지하M층 · 지상1층 · 지상2층 · 지상3층 · 지상4층', how: '도보', walk: true, detail: '주차 층에서 터미널 방향으로 이동한 뒤 엘리베이터·에스컬레이터로 3층 출국장.', facts: [['셔틀', '필요 없음'], ['이용', '상시']] },
      { lot: '장기주차장 · 주차타워', zones: '장기주차장 · 주차타워 P1 · P2', how: '무료 셔틀 공항02', route: '02', detail: '장기탑승장(1~5)에서 승차 → 제2여객터미널 1층 5번 하차 → 3층 출국장. 장기탑승장 3~5에는 공항03번도 서며, 3층 7번 출입구(출국장 앞)에 바로 내립니다.', facts: [['배차 간격', '6~30분'], ['운행 시간', '24시간'], ['소요', '왕복 30분']] },
      { lot: '예약주차장', zones: '예약주차장', how: '무료 셔틀 공항02', route: '02', detail: '예약주차장1(서편)·예약주차장2(동편) 정류장에서 공항02번 승차 → 제2여객터미널 1층 5번 하차 → 3층 출국장.', facts: [['배차 간격', '6~30분'], ['운행 시간', '24시간']] }
    ],
    tip: '심야에는 공항02번 배차가 30분 이상으로 길어집니다. 새벽 출국이라면 대기 시간을 넉넉히 잡으세요.',
    source: SRC
  }
};

readHash();
refresh(true).finally(schedule);
setInterval(renderHeader, 30e3);
let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    applyLayout();
    if ((S.tab === 'week' || S.tab === 'range') && D.latest && !document.activeElement?.matches('input,select')) render();
  }, 150);
});
