const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const web = path.join(__dirname, '../web');

function runtime() {
  const elements = new Map(['shuttle-net', 'shuttle-platform', 'shuttle-tt', 'shuttle-panel'].map(id => [id, { innerHTML: '', querySelector: () => null }]));
  const timers = [], listeners = new Map();
  const ctx = vm.createContext({
    console, Date, S: { term: 'T1', tab: 'access' }, ACCESS: { T1: { tip: '' }, T2: { tip: '' } },
    layoutMode: () => 'desktop',
    localStorage: { getItem: () => null, setItem: () => {} },
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    document: { addEventListener: (name, fn) => listeners.set(name, fn), getElementById: id => elements.get(id), querySelectorAll: () => [] },
    esc: x => String(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    pad: n => String(n).padStart(2, '0')
  });
  for (const f of ['shuttle-map.js', 'shuttle.js']) vm.runInContext(fs.readFileSync(path.join(web, f), 'utf8'), ctx);
  ctx.input = JSON.parse(fs.readFileSync(path.join(web, 'shuttle.json'), 'utf8'));
  vm.runInContext('shPrep(input); SH.data = input;', ctx);
  const run = code => vm.runInContext(code, ctx);
  return { ctx, elements, run, timers, listeners };
}

test('all 75 published stops have valid schedules and a map area, without invented times', () => {
  const { ctx, run } = runtime();
  assert.deepEqual(ctx.input.routes.map(r => r.stops.length), [9, 9, 24, 17, 16]);
  for (const r of ctx.input.routes) {
    assert(r.stops.some(s => s.id === r.default));
    for (const s of r.stops) {
      assert(s.t.length > 1);
      assert.equal(new Set(s.t).size, s.t.length, s.id);
      assert(s.t.every(t => /^(?:[01]\d|2[0-4]):[0-5]\d\*?$/.test(t)), s.id);
      assert(!s.t.some(t => t.endsWith('*')) || s.mark, s.id);
      assert(run(`Boolean(SH_AREAS[SH_POS['${s.id}']?.area])`), s.id);
    }
  }
});

test('countdowns exclude already-departed buses, floor seconds, and wrap midnight', () => {
  const { run } = runtime();
  assert.equal(run("shNext(SH.data.byId['01'].stops[0], 2, 4*3600+30*60)[0].wait"), 16);
  assert.equal(run("shNext(SH.data.byId['01'].stops[0], 2, 4*3600+29*60+30)[0].wait"), 0);
  assert.equal(run("shNext(SH.data.byId['01'].stops[0], 2, 23*3600+59*60)[0].tomorrow"), true);
  assert.equal(run("shNext(SH.data.byId['01'].stops[0], 2, 23*3600+59*60)[0].wait"), 271);
  assert.equal(run("shNext(SH.data.byId['02'].stops[0], 2, 23*3600+59*60)[0].mod"), 2);
  assert.equal(run("shNext(SH.data.byId['02'].stops[0], 2, 23*3600+59*60)[0].wait"), 3);
  assert.equal(run("shNext(SH.data.byId['02'].stops[0], 2, 2*60)[0].mod"), 8);
});

test('marked services retain both vehicle/destination notes and explicit symbols', () => {
  const { run, elements } = runtime();
  run("const r = SH.data.byId['02'], s = r.stops.find(s => s.id === 'D00365'); renderShuttleTable(r, s, 4*3600+34*60);");
  assert.match(elements.get('shuttle-tt').innerHTML, /공항03번 차량/);
  assert.match(elements.get('shuttle-tt').innerHTML, /class="nx mkd"/);
  assert.match(elements.get('shuttle-tt').innerHTML, /<sup>※<\/sup>/);
  assert.equal((elements.get('shuttle-tt').innerHTML.match(/class="nx/g) || []).length, 2);
  assert.match(run("shCardHtml(SH.data.byId['03'], SH.data.byId['03'].stops.find(s=>s.id==='D00344'), 23*3600+59*60)"), /국제업무단지까지만 운행/);
});

test('all route and stop selections render synchronized overview, details, and timetable', () => {
  const { ctx, run, elements } = runtime();
  for (const r of ctx.input.routes) for (const s of r.stops) {
    ctx.rid = r.id; ctx.sid = s.id;
    run("SH.sel.T1 = { route: rid, stops: { [rid]: sid } }; { const state = shState('T1'); renderShuttleNet(state.route, state.stop, 12*3600); renderShuttlePlatforms(state.route, state.stop, 12*3600); renderShuttleTable(state.route, state.stop, 12*3600); }");
    const map = elements.get('shuttle-platform').innerHTML;
    assert.match(map, new RegExp(`class="(?:map-pin|sequence-stop) selected" data-a="sstop" data-v="${s.id}"`));
    assert.match(map, new RegExp(`data-countdown="${s.id}"`));
    assert(elements.get('shuttle-tt').innerHTML.includes(s.label.replaceAll('&', '&amp;')), s.id);
    assert(!map.includes('undefined') && !map.includes('NaN'), s.id);
  }
});

test('terminal defaults and saved selections remain independent', () => {
  const { run } = runtime();
  assert.equal(run("shState('T1').route.id"), '01');
  assert.equal(run("shState('T2').route.id"), '02');
  run("SH.sel.T1 = { route:'03', stops:{ '03':'D00350' } };");
  assert.equal(run("shState('T1').stop.id"), 'D00350');
  assert.equal(run("shState('T2').route.id"), '02');
});

test('detail map route lines never route 공항04 through T2 parking loops', () => {
  const { run } = runtime();
  const four = run("SH_PLATFORM_PATHS.t2['04']");
  const three = run("SH_PLATFORM_PATHS.t2['03']");
  assert.deepEqual(pathSamples(four).map(p => p[1]).filter(y => y !== 664), []);
  assert(pathSamples(three).some(([x,y]) => x === 315 && y === 326));
  assert(!pathSamples(three).some(([x,y]) => x >= 730 && y <= 255));
  const svg = run("shPlatformBase('t2', SH.data.byId['04']).svg");
  assert.match(svg, /data-route="03" opacity="0.8"/);
  assert.match(svg, /data-route="04" opacity="1"/);
});

test('only two upcoming buses are highlighted when different vehicles share a minute', () => {
  const { run, elements } = runtime();
  run(`{
    const d = { routes: [{ id: 'test', stops: [{ t: ['10:00', '10:00*', '10:01'], label: 'Test', mark: 'Other vehicle' }] }] };
    shPrep(d);
    renderShuttleTable(d.routes[0], d.routes[0].stops[0], 9*3600);
  }`);
  assert.equal((elements.get('shuttle-tt').innerHTML.match(/class="nx/g) || []).length, 2);
});

test('compact pairs omit repeated prefixes and decrease by one minute after 60 seconds', () => {
  const { run } = runtime();
  run("const s = SH.data.byId['01'].stops[0];");
  const visible = html => html.replace(/<[^>]*>/g, '');
  assert.equal(visible(run('shMapTimes(s, 4*3600+26*60+30)')), '3분|19분');
  assert.equal(visible(run('shMapTimes(s, 4*3600+27*60+30)')), '2분|18분');
  assert.equal(visible(run('shMapTimes(s, 4*3600+29*60+30)')), '곧 출발|16분');
  assert.equal(visible(run('shMapTimes(s, 4*3600+30*60)')), '16분|32분');
  assert.match(run('shMapTimes(s, 4*3600+26*60+30)'), /첫 번째 예정편/);
  assert.match(run('shMapTimes(s, 4*3600+26*60+30)'), /두 번째 예정편/);
});

test('overnight pairs show unambiguous departure clocks without long duplicated day labels', () => {
  const { run } = runtime();
  const visible = html => html.replace(/<[^>]*>/g, '');
  assert.equal(visible(run("shMapTimes(SH.data.byId['01'].stops[0], 23*3600+59*60)")), '내일 04:30|04:46');
  assert.equal(visible(run("shMapTimes(SH.data.byId['02'].stops[0], 23*3600+59*60)")), '3분|9분');
});

test('travel legs use official cumulative minutes, including loop returns and untimed termini', () => {
  const { ctx, run } = runtime();
  for (const r of ctx.input.routes) {
    ctx.rid = r.id;
    assert.equal(run("SH.data.byId[rid].stops.reduce((n,s)=>n+shTravelLeg(SH.data.byId[rid],s).minutes,0)"), r.travel.total);
    assert.equal(Object.keys(r.travel.elapsed).length, r.stops.length);
    assert.equal(r.travel.source_url, `https://www.airport.kr/sites/ap_ko/images/sub/img-nosun${Number(r.id)}.jpg`);
    for (const s of r.stops) {
      ctx.sid = s.id;
      assert(run("shTravelLeg(SH.data.byId[rid], SH.data.byId[rid].stops.find(s=>s.id===sid)).minutes > 0"));
    }
  }
  assert.equal(run("shTravelLeg(SH.data.byId['02'], SH.data.byId['02'].stops[2]).minutes"), 2);
  assert.equal(run("shTravelLeg(SH.data.byId['02'], SH.data.byId['02'].stops.at(-1)).minutes"), 6);
  assert.equal(run("shTravelLeg(SH.data.byId['03'], SH.data.byId['03'].stops.find(s=>s.id==='D00344')).minutes"), 6);
  assert.equal(run("shTravelLeg(SH.data.byId['04'], SH.data.byId['04'].stops.find(s=>s.id==='D00102')).minutes"), 14);
  assert.equal(run("shTravelLeg(SH.data.byId['03'], SH.data.byId['03'].stops.at(-1)).to.id"), null);
  assert.deepEqual(JSON.parse(run("JSON.stringify(SH.data.byId['02'].stops.map(s=>shTravelLeg(SH.data.byId['02'],s).minutes))")),
    [4, 5, 2, 5, 2, 2, 1, 3, 6]);
});

test('travel metadata rejects missing or decreasing cumulative times', () => {
  const { run } = runtime();
  assert.throws(() => run("SH.data.byId['02'].travel.elapsed.D00116 = -1; shPrep(SH.data);"), /구간 소요시간/);
  assert.throws(() => run("delete SH.data.byId['02'].travel.elapsed.D00116; shPrep(SH.data);"), /구간 소요시간/);
});

test('direction arrows sit at edge midpoints, not corners or endpoints', () => {
  const { run } = runtime();
  const points = JSON.parse(run("JSON.stringify(shPathDirections('M0 0 L200 0 L200 200 H0 V0'))"));
  assert.deepEqual(points, [
    { x: 100, y: 0, angle: 0 }, { x: 200, y: 100, angle: 90 },
    { x: 100, y: 200, angle: 180 }, { x: 0, y: 100, angle: -90 }
  ]);
  assert.equal(run("shPathDirections('M0 0 L40 0 Q80 0 80 40').length"), 0);
  const curve = JSON.parse(run("JSON.stringify(shPathDirections('M0 0 C100 0 100 200 0 200')[0])"));
  assert.deepEqual(curve, { x: 75, y: 100, angle: 90 });
  for (const id of ['01', '02', '03', '04', '05']) {
    assert(run(`shPathDirections(SH_PATHS['${id}']).length >= 2`));
  }
  assert.throws(() => run("shPathDirections('M0 0 L20 nope')"), /Invalid shuttle map path/);
});

test('maps expose schedule uncertainty and segment durations, with no vertex markers', () => {
  const { run, elements } = runtime();
  run("const route = SH.data.byId['02'], stop = route.stops[4]; renderShuttleNet(route,stop,12*3600); renderShuttlePlatforms(route,stop,12*3600);");
  const network = elements.get('shuttle-net').innerHTML, detail = elements.get('shuttle-platform').innerHTML;
  assert.match(network, /시간표 기준 · 실시간 정보 아님/);
  assert.match(network, /15초마다 자동 계산/);
  assert.match(detail, /시간표 기반으로 오차가 있을 수 있습니다/);
  assert.match(detail, /map-leg/);
  assert.match(detail, /약 2분/);
  assert.match(detail, /sh-travel-summary/);
  assert.doesNotMatch(network + detail, /marker-(?:mid|end)|<marker/);
});

test('mobile mode collapses large maps while keeping route and departure controls visible', () => {
  const { ctx, run, elements } = runtime();
  ctx.layoutMode = () => 'mobile';
  run("const route=SH.data.byId['02'], stop=route.stops[0]; renderShuttleNet(route,stop,12*3600); renderShuttlePlatforms(route,stop,12*3600);");
  const overview = elements.get('shuttle-net').innerHTML, platform = elements.get('shuttle-platform').innerHTML;
  assert.match(overview, /<details class="sh-overview">/);
  assert.doesNotMatch(overview, /<details class="sh-overview" open>/);
  assert.match(platform, /<details class="mobile-map-details"><summary>승강장 지도 펼쳐보기<\/summary>/);
  assert.match(platform, /sh-travel-summary/);
});

test('automatic recalculation runs every 15 seconds and on visibility restoration', () => {
  const { run, timers, listeners } = runtime();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 15000);
  assert.equal(timers[0].fn, run('refreshShuttle'));
  assert.equal(listeners.get('visibilitychange'), run('refreshShuttle'));
});

function pathSamples(d) {
  let from;
  const points = [];
  for (const [, cmd, args] of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const v = args.trim().split(/\s+/).map(Number), to = v.slice(-2);
    if (cmd === 'M') points.push(to);
    else {
      const control = cmd === 'Q' ? v.slice(0, 2) : null;
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const n = Math.ceil(distance);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        points.push(to.map((x, axis) => control
          ? (1-t)**2 * from[axis] + 2*(1-t)*t * control[axis] + t*t*x
          : from[axis] + (x-from[axis])*t));
      }
    }
    from = to;
  }
  return points;
}

test('every route uses only axis-aligned straights and tangent rounded corners', () => {
  const { run } = runtime();
  const paths = JSON.parse(run('JSON.stringify([...Object.values(SH_PATHS), ...Object.values(SH_PLATFORM_PATHS).flatMap(Object.values)])'));
  for (const d of paths) {
    let from;
    assert(!/[CHV]/.test(d));
    for (const [, cmd, args] of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
      const v = args.trim().split(/\s+/).map(Number), to = v.slice(-2);
      if (cmd === 'L') assert(from[0] === to[0] || from[1] === to[1], d);
      if (cmd === 'Q') {
        const c = v.slice(0, 2);
        assert((from[0] === c[0] && to[1] === c[1]) || (from[1] === c[1] && to[0] === c[0]), d);
        assert.notDeepEqual(from, c);
        assert.notDeepEqual(c, to);
      }
      from = to;
    }
    for (const arrow of JSON.parse(run(`JSON.stringify(shPathDirections(${JSON.stringify(d)}))`))) {
      assert(arrow.angle % 90 === 0);
    }
  }
  assert.throws(() => run('shRoundedPath([[0,0],[10,10]])'), /orthogonal/);
  assert.throws(() => run('shRoundedPath([[0,0],[0,0]])'), /orthogonal/);
  assert.throws(() => run('shRoundedPath([[0,0],[0,20],[0,0]])'), /reverse/);
  assert.equal(run('shRoundedPath([[0,0],[10,0],[10,10]], 30)'), 'M0 0 L5 0 Q10 0 10 5 L10 10');
});

test('opposing 03/04 lanes retain clearance along their complete rounded paths', () => {
  const { run } = runtime();
  const paths = JSON.parse(run("JSON.stringify([SH_PATHS['03'], SH_PATHS['04']])"));
  const a = pathSamples(paths[0]), b = pathSamples(paths[1]);
  let minimum = Infinity;
  for (const [x,y] of a) for (const [bx,by] of b) {
    if (Math.abs(bx-x) < minimum && Math.abs(by-y) < minimum) minimum = Math.min(minimum, Math.hypot(bx-x,by-y));
  }
  assert(minimum >= 13, `opposing centerlines only ${minimum}px apart`);
  const [outbound, inbound] = JSON.parse(run('JSON.stringify([SH_OUTBOUND,SH_INBOUND.slice().reverse()])'));
  for (let i = 1; i < outbound.length; i++) {
    assert.equal(Math.sign(outbound[i][0] - outbound[i-1][0]), Math.sign(inbound[i][0] - inbound[i-1][0]));
    assert.equal(Math.sign(outbound[i][1] - outbound[i-1][1]), Math.sign(inbound[i][1] - inbound[i-1][1]));
    assert(Math.hypot(outbound[i][0]-inbound[i][0],outbound[i][1]-inbound[i][1]) >= 20);
  }
  assert.equal(run("shPathDirections(shRoundedPath(SH_OUTBOUND))[0].angle"), 0);
  assert.equal(run("shPathDirections(SH_PATHS['04']).at(-1).angle"), 180);
});

test('campus views retain concrete landmarks, thin routes, and visible opposite directions', () => {
  const { run, elements } = runtime();
  for (const view of ['all', 't1', 't2']) {
    run(`SH.netView.T1 = '${view}'; renderShuttleNet(SH.data.byId['03'], SH.data.byId['03'].stops[0], 12*3600);`);
    const html = elements.get('shuttle-net').innerHTML;
    for (const landmark of ['제1여객터미널','제2여객터미널','T2 차고지','예약주차장','T2 장기주차장','T1 장기주차장','서측 타워','동측 타워','터미널 진입도로','터미널 앞 순환도로']) assert(html.includes(landmark), landmark);
    const lots = [...html.matchAll(/class="map-parking">([\s\S]*?)<\/g>/g)];
    assert.equal(lots.length, 6);
    assert(lots.every(([,lot]) => (lot.match(/class="parking-bay"/g) || []).length >= 3));
    assert.match(html, /data-route="04" opacity="0.8"/);
    assert.match(html, /data-a="sview"/);
    const widths = [...html.matchAll(/class="route-line"[^>]*stroke-width="([\d.]+)"/g)].map(m => +m[1]);
    assert.equal(widths.length, 5);
    assert(widths.every(w => w <= 2.5));
    assert(!html.includes('NaN') && !html.includes('undefined'));
  }
  assert.match(elements.get('shuttle-net').innerHTML, /viewBox="270 0 700 740"/);
  for (const area of ['t1','t2','p5']) {
    const svg = run(`shPlatformBase('${area}', SH.data.byId['03']).svg`);
    assert.match(svg, /data-route="04" opacity="0.8"/);
    assert([...svg.matchAll(/class="route-line"[^>]*stroke-width="([\d.]+)"/g)].every(m => +m[1] <= 2.5));
  }
});

test('zoomed countdowns distinguish terminal, reservation, and long-term boarding stops', () => {
  const { run, elements } = runtime();
  run("SH.netView.T1 = 't2'; renderShuttleNet(SH.data.byId['02'], SH.data.byId['02'].stops.find(s=>s.id==='D00116'), 12*3600);");
  const html = elements.get('shuttle-net').innerHTML;
  for (const sid of ['D00113','D00116','D00117']) assert(html.includes(`data-countdown="${sid}"`));
  assert.match(html, /class="map-hub selected"[^>]*data-v="D00116"/);
  assert.doesNotMatch(html, /class="map-hub selected"[^>]*data-v="D00113"/);
  const groups = JSON.parse(run('JSON.stringify(SH_CAMPUS_HUBS)'));
  for (const [area,hubs] of Object.entries(groups)) for (const hub of hubs) for (const sid of hub.stopIds) {
    assert.equal(run(`SH_POS['${sid}'].area`), area);
    assert(run(`SH.data.routes.some(r=>r.stops.some(s=>s.id==='${sid}'))`));
  }
});

test('stop and duration rows share route color without flex-shrinking the connecting rail', () => {
  const { ctx, run, elements } = runtime();
  for (const route of ctx.input.routes) {
    run(`SH.sel.T1={route:'${route.id}',stops:{}}; renderShuttle();`);
    const html = elements.get('shuttle-panel').innerHTML;
    assert(html.includes(`class="sh-stops" style="--route:${run(`SH_COLOR['${route.id}']`)}"`));
    assert.equal((html.match(/class="sh-stop-leg"/g) || []).length, route.stops.length);
  }
  const css = fs.readFileSync(path.join(web, 'style.css'), 'utf8');
  assert.match(css, /\.sh-stops\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0/);
  assert.match(css, /\.sh-stop-leg\s*\{[^}]*border-left:\s*2px solid var\(--route\)/);
});

test('공항02 T2 loop never crosses itself, entering the terminal loop on the left and leaving on the right', () => {
  const { run } = runtime();
  const pts = pathSamples(run("SH_PATHS['02']")), n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 40; j < n; j++) {
    if (i < 40 && j > n - 40) continue; // closed loop start/end
    assert(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= 2, `02 crosses itself near ${pts[i]}`);
  }
  // Between the parking area and the terminal loop the bus goes down on the left and back up on the right.
  const at = pts.map((p, i) => [p, i]).filter(([p]) => Math.abs(p[1] - 430) < 0.5 && p[0] > 600);
  const down = at.find(([, i]) => pts[i + 1] && pts[i + 1][1] > pts[i][1]), up = at.find(([, i]) => pts[i + 1] && pts[i + 1][1] < pts[i][1]);
  assert(down && up && down[0][0] < up[0][0], 'enter on the left, exit on the right');
});

test('T2 long-term lot is entered bottom-left and crossed through the aisle between tower B (left) and A (right)', () => {
  const { run } = runtime();
  const svg = run('shCampusMap()');
  const towers = [...svg.matchAll(/class="map-block tower"><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[\s\S]*?<text[^>]*>([^<]+)<\/text>/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], name: m[5] })).sort((a, b) => a.x - b.x);
  assert.deepEqual(towers.map(t => t.name), ['B동', 'A동']);
  const [b, a] = towers, mid = b.y + b.h / 2;
  for (const id of ['02', '03']) {
    const pts = pathSamples(run(`SH_PATHS['${id}']`));
    assert(pts.some(([x, y]) => Math.abs(y - mid) < 0.5 && x > b.x + b.w && x < a.x), `${id} passes between the towers`);
  }
  const two = pathSamples(run("SH_PATHS['02']"));
  const aisle = two.filter(([x]) => x > b.x + b.w && x < a.x);
  assert(Math.max(...aisle.map(p => p[1])) > 364 && Math.min(...aisle.map(p => p[1])) < b.y, 'aisle runs from below the lot to above the towers');
});

test('공항03·04 keep to the right-hand side of the shared corridor in their own direction of travel', () => {
  const { run } = runtime();
  const [corridor, out, inbound] = JSON.parse(run('JSON.stringify([SH_CORRIDOR, SH_OUTBOUND, SH_INBOUND.slice().reverse()])'));
  for (let i = 0; i < corridor.length - 1; i++) {
    const [x0, y0] = corridor[i], [x1, y1] = corridor[i + 1], n = [-Math.sign(y1 - y0), Math.sign(x1 - x0)];
    const side = p => (p[0] - x0) * n[0] + (p[1] - y0) * n[1];
    assert(side(out[i]) > 0, `03 keeps right at ${corridor[i]}`);
    assert(side(inbound[i]) < 0, `04 keeps right (reverse direction) at ${corridor[i]}`);
  }
});
