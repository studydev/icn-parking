'use strict';
/* 공항 셔틀버스 — 시간표(shuttle.json) 기준 다음 출발 · 정차 순서 · 시간표 · 노선도.
   Uses globals from app.js (S, esc, pad, INK, ACC). */

const SH = { data: null, loading: null, err: null, sel: shLoadSel(), netView: {} };
const SH_COLOR = { '01': '#3f6f9e', '02': '#2e7d57', '03': '#d98a1f', '04': 'oklch(0.52 0.15 305)', '05': '#8a9097' };
const SH_TERM = { T1: ['01', '02', '03', '04', '05'], T2: ['02', '01', '03', '04', '05'] };

function shLoadSel() { try { return JSON.parse(localStorage.getItem('icn.shuttle')) || {}; } catch (_) { return {}; } }
function shSaveSel() { try { localStorage.setItem('icn.shuttle', JSON.stringify(SH.sel)); } catch (_) { /* private mode */ } }

function loadShuttle() {
  if (SH.data || SH.loading) return SH.loading;
  SH.loading = fetch('shuttle.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`${r.status} shuttle.json`); return r.json(); })
    .then(d => { shPrep(d); SH.data = d; SH.err = null; })
    .catch(e => { SH.err = String(e.message || e); })
    .finally(() => { SH.loading = null; if (S.tab === 'access') renderShuttle(); });
  return SH.loading;
}

/* "HH:MM" (HH may be 24 = after midnight of the service day), trailing * = marked trip */
function shPrep(d) {
  for (const r of d.routes) {
    if (r.travel) {
      const elapsed = r.stops.map(s => r.travel.elapsed[s.id]);
      if (elapsed[0] !== 0 || !elapsed.every((v, i) => Number.isInteger(v) && (!i || v > elapsed[i - 1]))
          || !Number.isInteger(r.travel.total) || r.travel.total <= elapsed.at(-1)) {
        throw new Error(`${r.name} 구간 소요시간 데이터가 올바르지 않습니다.`);
      }
    }
    for (const s of r.stops) {
      s.deps = s.t.map((x, index) => { const m = +x.slice(0, 2) * 60 + +x.slice(3, 5); return { m, mod: m % 1440, mark: x.endsWith('*'), index }; });
      s.sorted = s.deps.slice().sort((a, b) => a.mod - b.mod);
    }
  }
  d.byId = Object.fromEntries(d.routes.map(r => [r.id, r]));
}

/* KST seconds of day. Matches airport.kr: only departures strictly after now, remaining minutes floored. */
const shNow = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); };
const shHM = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const shWait = w => w <= 0 ? '곧 출발' : w < 60 ? `${w}분` : `${Math.floor(w / 60)}시간 ${w % 60}분`;
const shWaitShort = w => w <= 0 ? '곧' : w < 60 ? `${w}분` : `${Math.floor(w / 60)}시간+`;

/* next n departures after now (KST seconds), wrapping to tomorrow */
function shNext(stop, n, now = shNow()) {
  const out = [];
  for (let day = 0; day < 2 && out.length < n; day++) {
    for (const dep of stop.sorted) {
      const at = (dep.mod + day * 1440) * 60;
      if (at > now) { out.push({ ...dep, wait: Math.floor((at - now) / 60), tomorrow: day > 0 }); if (out.length >= n) break; }
    }
  }
  return out;
}

// The official route diagram gives cumulative journey minutes, independently of departure schedules.
function shTravelLeg(route, stop) {
  const index = route.stops.findIndex(s => s.id === stop.id), last = index === route.stops.length - 1;
  const to = last ? route.loop ? route.stops[0] : { id: null, label: route.after } : route.stops[index + 1];
  return { to, minutes: (last ? route.travel.total : route.travel.elapsed[to.id]) - route.travel.elapsed[stop.id] };
}

function shState(term) {
  const routes = (SH_TERM[term] || []).map(id => SH.data.byId[id]).filter(Boolean);
  const sel = SH.sel[term] || {};
  const route = routes.find(r => r.id === sel.route) || routes[0];
  const sid = (sel.stops || {})[route.id] || route.default;
  const stop = route.stops.find(s => s.id === sid) || route.stops[0];
  return { routes, route, stop };
}

function onShuttleAction(a, v, source) {
  if (!SH.data) return;
  const cur = SH.sel[S.term] = SH.sel[S.term] || { stops: {} };
  cur.stops = cur.stops || {};
  if (a === 'sroute' && (SH_TERM[S.term] || []).includes(v)) cur.route = v;
  else if (a === 'sstop' && shState(S.term).route.stops.some(s => s.id === v)) cur.stops[shState(S.term).route.id] = v;
  else if (a === 'sview' && Object.hasOwn(SH_NET_VIEWS, v)) SH.netView[S.term] = v;
  else { console.warn('Unknown shuttle selection', a, v); return; }
  shSaveSel();
  const active = document.activeElement;
  const section = active?.closest('section, aside');
  const focus = section?.id && active.dataset.a ? { section: section.id, a: active.dataset.a, v: active.dataset.v } : null;
  const scrolls = ['#shuttle-net .map-scroll', '#shuttle-platform .map-scroll', '#shuttle-panel .sh-stops'].map(selector => {
    const el = document.querySelector(selector);
    return [selector, el?.scrollLeft || 0, el?.scrollTop || 0];
  });
  renderShuttle();
  scrolls.forEach(([selector, left, top]) => {
    const el = document.querySelector(selector);
    if (el) { el.scrollLeft = left; el.scrollTop = top; }
  });
  if (focus) document.getElementById(focus.section)?.querySelector(`[data-a="${focus.a}"][data-v="${focus.v}"]`)?.focus({ preventScroll: true });
  shRevealSelection();
  if (source?.matches('.map-hub, .how')) {
    document.getElementById('shuttle-platform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function shRevealSelection() {
  document.querySelectorAll('.map-pin.selected, .map-hub.selected').forEach(pin => {
    const scroller = pin.closest('.map-scroll'), p = pin.getBoundingClientRect(), box = scroller.getBoundingClientRect();
    if (p.left < box.left || p.right > box.right) scroller.scrollLeft += (p.left + p.right - box.left - box.right) / 2;
  });
}

function shCardHtml(route, stop, now) {
  const deps = shNext(stop, 2, now);
  const tail = route.hours === '24시간' ? '24시간 운행 · 심야에는 배차가 길어집니다'
    : `첫차 ${shHM(stop.deps[0].m)} · 막차 ${shHM(stop.deps[stop.deps.length - 1].m)}`;
  return `<div class="sh-stop"><b>${esc(stop.label)}</b> 출발${stop.note ? ` <span>${esc(stop.note)}</span>` : ''}</div>
    <span class="sub">출발까지 남은 시간</span>
    <div class="sh-departures">${deps.map((d, i) => `<div class="sh-dep${i ? ' sub' : ''}" aria-label="${i ? '두 번째' : '첫 번째'} 예정편"><span class="w">${shWait(d.wait)}</span>
      <span class="at">${shHM(d.mod)} 출발${d.tomorrow ? ' (내일)' : ''}${d.mark && stop.mark ? ` <em class="mk">※ ${esc(stop.mark)}</em>` : ''}</span></div>`).join('')}</div>
    <div class="sh-foot">${tail}</div>`;
}

function renderShuttle() {
  const panel = document.getElementById('shuttle-panel');
  if (!panel) return;
  if (!SH.data) {
    panel.innerHTML = SH.err ? `<div class="notice">셔틀 시간표를 불러오지 못했습니다. (${esc(SH.err)})</div>` : '<div class="empty">셔틀 시간표 불러오는 중…</div>';
    if (!SH.err) loadShuttle();
    return;
  }
  const { route, stop } = shState(S.term), color = SH_COLOR[route.id], now = shNow();
  const n = route.stops.length;
  panel.innerHTML = `
    <div class="titles"><span class="t15">${esc(route.name)} · 선택 승강장</span><span class="muted">15초 자동 계산 · KST <span data-sh-clock>${shHM(Math.floor(now / 60))}</span></span></div>
    <div class="sh-desc">${esc(route.desc)}<br>배차 ${esc(route.headway)} · ${esc(route.hours)} · ${esc(route.duration)} · <a href="${esc(route.url)}" target="_blank" rel="noopener">공식 안내 ↗</a></div>
    <div class="sh-card" style="border-color:${color}">${shCardHtml(route, stop, now)}</div>
    <div class="titles"><b>정차 순서 · ${n}개 승강장</b><span class="sub">아래 목록에서도 선택할 수 있습니다</span></div>
    <div class="sh-stops" style="--route:${color}" role="group" aria-label="${esc(route.name)} 승강장 목록">
      ${route.before ? `<div class="stop dim"><div class="rail"><div class="ln dash" style="top:0;bottom:0"></div></div><span class="nt">… ${esc(route.before)}</span><span></span></div>` : ''}
      ${route.stops.map((s, i) => {
        const nx = shNext(s, 1, now)[0], on = s.id === stop.id, first = i === 0 && !route.before, last = i === n - 1 && !route.loop && !route.after;
        const leg = shTravelLeg(route, s);
        return `<button class="stop${on ? ' sel' : ''}" data-a="sstop" data-v="${s.id}" aria-pressed="${on}">
          <div class="rail"><div class="ln" style="border-color:${color};top:${first ? '11px' : '0'};bottom:${last ? 'calc(100% - 11px)' : '0'}"></div><div class="pt" style="background:${on ? color : '#fff'};border-color:${color}"></div></div>
          <div class="col" style="gap:1px;padding-bottom:10px"><span class="nm">${esc(s.label)}</span>${s.note ? `<span class="nt">${esc(s.note)}</span>` : ''}</div>
          <span class="nx" data-stop-wait="${s.id}">${nx ? shWaitShort(nx.wait) : ''}</span></button>
          <div class="sh-stop-leg" title="${esc(s.label)} → ${esc(leg.to.label)}">↓ 약 ${leg.minutes}분</div>`;
      }).join('')}
      ${route.loop ? `<div class="stop dim"><div class="rail"></div><span class="nt">↻ ${esc(route.stops[0].label)}(으)로 돌아와 순환 · ${esc(route.duration)}</span><span></span></div>`
        : route.after ? `<div class="stop dim"><div class="rail"><div class="ln dash" style="top:0;bottom:50%"></div></div><span class="nt">… ${esc(route.after)}</span><span></span></div>` : ''}
    </div>
    <p class="tipbox">시간표 기준으로 실제 출발·도착 시각과 차이가 날 수 있습니다. 구간 소요시간은 일반 운행편의 공식 안내 기준이며, 교통·대기·정비단지 미경유·※ 예외편에 따라 달라집니다. ${esc(ACCESS[S.term].tip)}</p>`;
  renderShuttleTable(route, stop, now);
  renderShuttleNet(route, stop, now);
  renderShuttlePlatforms(route, stop, now);
  shRevealSelection();
}

function renderShuttleTable(route, stop, now) {
  const el = document.getElementById('shuttle-tt');
  if (!el) return;
  // service-day clock (seconds): before the first departure we are still in yesterday's after-midnight tail
  const svc = now < stop.deps[0].m * 60 ? now + 86400 : now;
  const next = new Set(shNext(stop, 2, now).map(d => d.index));
  const rows = new Map();
  for (const d of stop.deps) { const h = Math.floor(d.m / 60); if (!rows.has(h)) rows.set(h, []); rows.get(h).push(d); }
  el.innerHTML = `
    <div class="sec-head"><div class="titles"><span class="t15">${esc(route.name)} · ${esc(stop.label)} 출발 시간표</span>
      <span class="sub">${esc(SH.data.as_of)} 기준 · 지난 시각은 흐리게, 다음 두 대는 빨간 배경·굵은 글씨${stop.mark ? ` · <em class="mk">※ ${esc(stop.mark)}</em>` : ''}</span></div></div>
    <div class="tt">${[...rows].map(([h, ds]) => `<div class="tt-r"><span class="tt-h">${pad(h % 24)}시${h >= 24 ? '<small>(자정 후)</small>' : ''}</span><span class="tt-m">${ds.map(d =>
      `<span class="${next.has(d.index) ? 'nx' : d.m * 60 <= svc ? 'past' : ''}${d.mark ? ' mkd' : ''}" title="${shHM(d.m)}${next.has(d.index) ? ' · 다가오는 출발' : ''}${d.mark && stop.mark ? ' · ' + esc(stop.mark) : ''}">${pad(d.m % 60)}${d.mark ? '<sup>※</sup>' : ''}</span>`).join('')}</span></div>`).join('')}</div>`;
}
function refreshShuttle() {
  if (S.tab !== 'access' || !SH.data || document.visibilityState !== 'visible') return;
  const { route, stop } = shState(S.term), now = shNow();
  const byId = new Map(route.stops.map(s => [s.id, s]));
  document.querySelectorAll('[data-countdown]').forEach(el => { el.innerHTML = shMapTimes(byId.get(el.dataset.countdown), now); });
  document.querySelectorAll('[data-stop-wait]').forEach(el => { el.textContent = shWaitShort(shNext(byId.get(el.dataset.stopWait), 1, now)[0].wait); });
  const card = document.querySelector('#shuttle-panel .sh-card'), clock = document.querySelector('[data-sh-clock]');
  if (card) card.innerHTML = shCardHtml(route, stop, now);
  if (clock) clock.textContent = shHM(Math.floor(now / 60));
  renderShuttleTable(route, stop, now);
}
setInterval(refreshShuttle, 15e3);
document.addEventListener('visibilitychange', refreshShuttle);
document.addEventListener('DOMContentLoaded', () => { if (S.tab === 'access') renderShuttle(); });
