'use strict';

// Positions describe the official guides' relative layout, not geographic coordinates.
const SH_AREAS = {
  t2: { name: 'T2 터미널 · 장기 · 예약주차장', x: 830, y: 610, anchor: [565, 580], image: 't2p-map1-s.jpg', main: ['D00113', 'D00343', 'D00440'],
    note: '공식 주차장 안내와 같은 방향: 왼쪽 동(E), 오른쪽 서(W). 1번 B113 부근 → 2번 D 구역 → 3·4번 주차타워 → 5번 A 구역 순환. 정비단지는 07~19시만 정차합니다.' },
  t1: { name: 'T1 터미널 · 장기주차장', x: 885, y: 835, anchor: [575, 910], image: 't1p-map1-s.jpg', main: ['D00345','D00346','D00350','D00351','D00050'],
    note: '왼쪽 서(W), 오른쪽 동(E). 공항01은 1층 3C·13C(길 건너), 공항03·04는 3층 출국장 앞에서 탑니다. 주차장 1~7번은 동편 P1에서 서편 P2 방향으로 순환합니다.' },
  p5: { name: 'P5 예약주차장', x: 355, y: 1195, anchor: [365, 1100], image: 'img-nosun3.jpg',
    note: 'T1 예약주차장은 공항01이 아닌 공항03·04를 이용합니다. 공항03은 T1 방향, 공항04는 T2 방향입니다. 같은 주차장의 방향별 정류장이므로 현장 행선지 표지를 확인하세요.' },
  biz: { name: '국제업무단지 · 호텔', x: 660, y: 1320, anchor: [610, 1240], image: 'img-nosun3.jpg', main: ['D00353', 'D00048'] },
  station: { name: '공항 화물청사역', x: 1130, y: 1190, anchor: [950, 1090], image: 'logistics-map2.jpg',
    note: '공항05는 공항철도 공항화물청사역 2번 출구 앞에서 탑니다. 공항03·04는 환승승차장 행선지 표지를 확인하세요. 아래 위치 표시는 출입구와 승강장의 관계를 나타냅니다.' },
  cargo: { name: '화물터미널', x: 1175, y: 485, anchor: [1040, 810], elbowX: 1070, image: 'img-nosun4.jpg', main: ['D00359', 'D00046'] },
  aicc: { name: 'AICC · 제2공항물류단지', x: 1175, y: 355, anchor: [1040, 355], image: 'img-nosun4.jpg', main: ['D00438', 'D00014'] },
  logistics: { name: '공항물류단지', x: 1230, y: 590, anchor: [1250, 690], image: 'img-nosun5.jpg' }
};
const SH_POS = {};
function shPlace(area, x, y, ids) { for (const id of ids.split(' ')) SH_POS[id] = { area, x, y }; }
shPlace('t1', 660, 132, 'D00345 D00350');
shPlace('t1', 210, 132, 'D00346 D00351');
shPlace('t1', 440, 156, 'D00050');
shPlace('t1', 665, 263, 'D00017');
shPlace('t1', 817, 380, 'D00387');
shPlace('t1', 655, 524, 'D00058');
shPlace('t1', 420, 524, 'D00060');
shPlace('t1', 185, 524, 'D00063');
shPlace('t1', 86, 380, 'D00061');
shPlace('t1', 245, 263, 'D00062');
shPlace('t2', 260, 664, 'D00113 D00440');
shPlace('t2', 260, 640, 'D00343');
shPlace('t2', 775, 635, 'D00118');
shPlace('t2', 815, 90, 'D00116');
shPlace('t2', 815, 202, 'D00115');
shPlace('t2', 315, 326, 'D00117 D00467');
shPlace('t2', 510, 436, 'D00114 D00466');
shPlace('t2', 705, 436, 'D00365 D00340');
shPlace('t2', 882, 436, 'D00434 D00341');
shPlace('t2', 190, 546, 'D00435 D00342');
shPlace('t2', 540, 96, 'D00339');
shPlace('p5', 455, 300, 'D00344 D00102');
shPlace('station', 600, 305, 'D00356 D00047 D00095');
shPlace('biz', 0, 0, 'D00352 D00353 D00355 D00048 D00049');
shPlace('cargo', 0, 0, 'D00357 D00358 D00359 D00360 D00361 D00362 D00436 D00040 D00041 D00042 D00043 D00044 D00045 D00046');
shPlace('aicc', 0, 0, 'D00437 D00438 D00439 D00015 D00013 D00014 D00364');
shPlace('logistics', 0, 0, 'D00096 D00097 D00098 D00099 D00100 D00101 D00103 D00104 D00105 D00106 D00107 D00108 D00109 D00110 D00111');

function shRoundedPath(points, radius = 20) {
  if (points.length < 2 || !Number.isFinite(radius) || radius <= 0) throw new Error('Invalid shuttle path geometry');
  const dirs = points.slice(1).map(([x, y], i) => {
    const [px, py] = points[i], dx = x - px, dy = y - py;
    if (![x, y, px, py].every(Number.isFinite) || (dx === 0) === (dy === 0)) throw new Error('Shuttle paths must be orthogonal');
    return [Math.sign(dx), Math.sign(dy), Math.abs(dx + dy)];
  });
  let d = `M${points[0].join(' ')}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], a = dirs[i - 1], b = dirs[i];
    if (a[0] === -b[0] && a[1] === -b[1]) throw new Error('Shuttle paths cannot reverse at a corner');
    if (a[0] === b[0] && a[1] === b[1]) { d += ` L${x} ${y}`; continue; }
    const r = Math.min(radius, a[2] / 2, b[2] / 2);
    d += ` L${x - a[0] * r} ${y - a[1] * r} Q${x} ${y} ${x + b[0] * r} ${y + b[1] * r}`;
  }
  return `${d} L${points.at(-1).join(' ')}`;
}

// Offset one shared corridor, then reverse route 04; never hand-draw overlapping return lanes.
// A positive offset is the right-hand side of travel, so both directions keep right as on Korean roads.
function shOffsetPath(points, offset) {
  shRoundedPath(points);
  const normals = points.slice(1).map(([x, y], i) => [-Math.sign(y - points[i][1]), Math.sign(x - points[i][0])]);
  return points.map(([x, y], i) => {
    const a = normals[Math.max(0, i - 1)], b = normals[Math.min(i, normals.length - 1)];
    return [x + (a[0] === b[0] ? a[0] : a[0] + b[0]) * offset,
      y + (a[1] === b[1] ? a[1] : a[1] + b[1]) * offset];
  });
}
const SH_CORRIDOR = [[565,580],[680,580],[680,24],[220,24],[220,1100],[365,1100],[425,1100],
  [425,910],[575,910],[765,910],[765,1170],[610,1170],[610,1240],[950,1240],[950,1090],[1040,1090],[1040,810],[1040,570],[1040,355]];
const SH_OUTBOUND = shOffsetPath(SH_CORRIDOR, 10);
const SH_INBOUND = shOffsetPath(SH_CORRIDOR, -10).reverse();
const SH_PATHS = {
  '01': shRoundedPath([[575,940],[460,940],[460,965],[500,965],[500,985],[450,985],[450,1060],
    [715,1060],[715,985],[675,985],[675,965],[700,965],[700,940],[575,940]]),
  '02': shRoundedPath([[540,550],[658,550],[658,128],[495,128],[495,65],[335,65],[335,140],[475,140],
    [475,382],[554,382],[554,144],[636,144],[636,480],[452,480],[452,550],[540,550]]),
  '03': shRoundedPath([[590,113],[590,118],[485,118],[485,150],[467,150],[467,390],[562,390],[562,152],
    [628,152],[628,472],[444,472],[444,590], ...SH_OUTBOUND]),
  '04': shRoundedPath(SH_INBOUND),
  '05': shRoundedPath([[950,1120],[1100,1120],[1100,690],[1335,690],[1335,990],[1130,990],[1130,1145],[950,1145]])
};
const SH_NET_VIEWS = {
  all: { x: 0, y: 0, w: 1400, h: 1400, label: '공항 전체' },
  t2: { x: 270, y: 0, w: 700, h: 740, label: 'T2 터미널·주차장 확대' },
  t1: { x: 240, y: 760, w: 740, h: 640, label: 'T1 터미널·주차장 확대' }
};
const SH_CAMPUS_HUBS = {
  t2: [
    { name: 'T2 예약주차장', x: 365, y: 185, anchor: [395,140], stopIds: ['D00116','D00115'] },
    { name: 'T2 장기주차장', x: 365, y: 345, anchor: [475,345],
      stopIds: ['D00117','D00114','D00365','D00434','D00435','D00467','D00466','D00340','D00341','D00342'] }
  ],
  t1: [{ name: 'T1 장기주차장', x: 885, y: 970, anchor: [580,1045],
    stopIds: ['D00017','D00387','D00058','D00060','D00063','D00061','D00062'] }]
};
const SH_PLATFORM_PATHS = {
  t1: {
    '01': shRoundedPath([[440,132],[80,132],[80,200],[665,200],[665,263],[817,263],[817,524],
      [185,524],[86,524],[86,300],[245,300],[245,263],[245,235],[735,235],[735,165],[660,165],[660,132],[440,132]]),
    '03': shRoundedPath([[860,132],[80,132]]),
    '04': shRoundedPath([[80,156],[860,156]])
  },
  t2: {
    '02': shRoundedPath([[510,664],[970,664],[970,90],[815,90],[815,202],[65,202],[65,265],[315,265],
      [315,436],[950,436],[950,546],[65,546],[65,625],[260,625],[260,664],[510,664]]),
    '03': shRoundedPath([[540,96],[540,240],[315,240],[315,436],[950,436],[950,546],[65,546],[65,640],[580,640]]),
    '04': shRoundedPath([[580,664],[80,664]])
  },
  p5: { '03': shRoundedPath([[100,378],[820,378]]), '04': shRoundedPath([[820,402],[100,402]]) }
};

const SH_LEG_POS = {};
function shLegPlace(x, y, ids) { for (const id of ids.split(' ')) SH_LEG_POS[id] = { x, y }; }
shLegPlace(435, 107, 'D00345 D00350');
shLegPlace(435, 182, 'D00346');
shLegPlace(757, 315, 'D00017');
shLegPlace(784, 475, 'D00387');
shLegPlace(540, 501, 'D00058');
shLegPlace(300, 501, 'D00060');
shLegPlace(130, 468, 'D00063');
shLegPlace(110, 305, 'D00061');
shLegPlace(450, 244, 'D00062');
shLegPlace(510, 645, 'D00113');
shLegPlace(935, 380, 'D00118');
shLegPlace(777, 147, 'D00116');
shLegPlace(440, 223, 'D00115');
shLegPlace(415, 380, 'D00117 D00467');
shLegPlace(607, 380, 'D00114 D00466');
shLegPlace(795, 380, 'D00365 D00340');
shLegPlace(570, 568, 'D00434 D00341');
shLegPlace(150, 602, 'D00435 D00342');
shLegPlace(440, 220, 'D00339');

// These routes use absolute SVG commands. Rounded corners (Q) intentionally get no arrow.
function shPathDirections(d) {
  let x = 0, y = 0;
  const out = [], sizes = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6 };
  for (const [, cmd, args] of d.matchAll(/([MLHVQC])([^MLHVQC]*)/g)) {
    const v = args.trim().split(/[\s,]+/).map(Number);
    if (v.length !== sizes[cmd] || !v.every(Number.isFinite)) throw new Error(`Invalid shuttle map path: ${d}`);
    const endX = cmd === 'H' ? v[0] : cmd === 'V' ? x : v.at(-2);
    const endY = cmd === 'V' ? v[0] : cmd === 'H' ? y : v.at(-1);
    if (cmd !== 'M' && cmd !== 'Q' && Math.hypot(endX - x, endY - y) >= 80) {
      const curved = cmd === 'C';
      out.push({
        x: curved ? (x + 3 * v[0] + 3 * v[2] + endX) / 8 : (x + endX) / 2,
        y: curved ? (y + 3 * v[1] + 3 * v[3] + endY) / 8 : (y + endY) / 2,
        angle: Math.atan2(curved ? endY + v[3] - v[1] - y : endY - y,
          curved ? endX + v[2] - v[0] - x : endX - x) * 180 / Math.PI
      });
    }
    x = endX; y = endY;
  }
  return out;
}
function shArrows(d, color) {
  return `<g class="route-arrows" fill="${color}" stroke="#fff" stroke-width="1">${shPathDirections(d).map(p =>
    `<path class="route-arrow" d="M-6 -5 L6 0 L-6 5 Z" transform="translate(${p.x} ${p.y}) rotate(${p.angle})"/>`).join('')}</g>`;
}
function shMapLegs(route, stops, area) {
  return stops.map(s => {
    const p = SH_LEG_POS[s.id], leg = shTravelLeg(route, s);
    if (!p || !leg.to.id || SH_POS[leg.to.id].area !== area) return '';
    return `<g class="map-leg" transform="translate(${p.x} ${p.y})"><title>${esc(s.label)} → ${esc(leg.to.label)} · 약 ${leg.minutes}분 (공식 안내 기준)</title>
      <rect x="-25" y="-10" width="50" height="20" rx="10"/><text text-anchor="middle" y="4">약 ${leg.minutes}분</text></g>`;
  }).join('');
}

function shSvg(w, h, content, label, x = 0, y = 0) {
  return `<svg viewBox="${x} ${y} ${w} ${h}" aria-hidden="true" class="sh-map-svg"><title>${esc(label)}</title>${content}</svg>`;
}
function shBlock(x, y, w, h, label, sub = '', cls = '') {
  return `<g class="map-block ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>
    <text x="${x + w / 2}" y="${y + h / 2 - (sub ? 5 : -5)}">${esc(label)}</text>
    ${sub ? `<text class="small" x="${x + w / 2}" y="${y + h / 2 + 17}">${esc(sub)}</text>` : ''}</g>`;
}
function shRoad(d, color = '#cbd4dc', arrow = false) {
  return `<path class="${arrow ? 'route-line' : 'map-road'}" d="${d}" fill="none" stroke="${color}" stroke-width="${arrow ? 2.2 : 18}" stroke-linejoin="round" stroke-linecap="round"/>${arrow ? shArrows(d, color) : ''}`;
}
function shRouteLines(paths, selected, clickable = false) {
  const paired = selected === '03' || selected === '04';
  return Object.entries(paths).sort(([a], [b]) => (a === selected) - (b === selected)).map(([id, d]) => {
    const opacity = id === selected ? 1 : paired && (id === '03' || id === '04') ? .8 : .38;
    return `<g class="map-route" data-route="${id}" opacity="${opacity}"${clickable ? ` data-a="sroute" data-v="${id}"` : ''}>
      ${shRoad(d, SH_COLOR[id], true)}
      ${clickable ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="14"><title>공항${id} 선택</title></path>` : ''}</g>`;
  }).join('');
}
function shParking(x, y, w, h, label, cols = 3, rows = 2, gap = 10) {
  const top = label ? 30 : 10, bw = (w - 20 - (cols - 1) * gap) / cols, bh = (h - top - 10 - (rows - 1) * 12) / rows;
  return `<g class="map-parking"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>
    ${label ? `<text x="${x + w / 2}" y="${y + 21}">${esc(label)}</text>` : ''}
    ${Array.from({ length: rows * cols }, (_, i) => {
      const bx = x + 10 + i % cols * (bw + gap), by = y + top + Math.floor(i / cols) * (bh + 12);
      return `<rect class="parking-bay" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3"/>
        <path d="${[1,2,3].map(n => `M${bx + bw * n / 4} ${by + 3} V${by + bh - 3}`).join(' ')}" stroke="#fff" stroke-width="1.5"/>`;
    }).join('')}</g>`;
}
function shTower(x, y, w, h, name) {
  return `<g class="map-block tower"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>
    <text x="${x + w / 2}" y="${y + h / 2 - 1}">${esc(name)}</text><text class="small" x="${x + w / 2}" y="${y + h / 2 + 14}">주차타워</text></g>`;
}
function shTerminal(kind, x, y, scale = 1) {
  const t1 = kind === 't1';
  const outline = t1
    ? 'M12 94 Q34 63 102 40 L94 15 Q95 5 105 7 L120 34 Q180 22 240 34 L255 7 Q265 5 266 15 L258 40 Q326 63 348 94 Q352 104 340 104 L316 96 Q180 76 44 96 L20 104 Q8 104 12 94Z'
    : 'M60 15 Q180 34 300 15 L300 63 Q318 86 337 131 Q340 145 327 142 L295 105 Q280 85 256 84 H104 Q80 85 65 105 L33 142 Q20 145 23 131 Q42 86 60 63Z';
  return `<g class="map-terminal-footprint" transform="translate(${x} ${y}) scale(${scale})">
    <path d="${outline}"/>
    <path class="terminal-glass" d="${t1 ? 'M50 84 Q180 34 310 84' : 'M75 56 Q180 68 285 56'}"/>
    <text x="180" y="${t1 ? 60 : 55}">제${t1 ? '1' : '2'}여객터미널</text>
    <text class="terminal-floor" x="180" y="${t1 ? 78 : 76}">1F 도착 · 3F 출국</text></g>`;
}
function shCampusMap() {
  const approach = [[632,150],[632,470],[440,470],[440,575],[665,575],[665,470],[632,470]];
  return `<rect width="1400" height="1400" rx="16" fill="#f2f6f3"/>
    <path d="M25 180H170V1260H60 M810 120H945V1010H870" fill="#e3ebea"/>
    <path d="M90 220V1180 M865 150V975" stroke="#d2dcdf" stroke-width="28"/>
    <path d="M90 220V1180 M865 150V975" stroke="#fff" stroke-width="2" stroke-dasharray="24 18"/>
    <text class="map-caption" x="110" y="710" transform="rotate(-90 110 710)">활주로 · 비행장 구역</text>
    <text class="map-caption" x="887" y="405" transform="rotate(-90 887 405)">비행장 구역</text>
    ${shRoad(shRoundedPath(SH_CORRIDOR, 30))}
    ${shRoad(shRoundedPath(approach, 24))}
    <rect x="460" y="502" width="170" height="30" rx="15" fill="#d5e6d6"/>
    ${shParking(350,80,120,48,'',4,1)}
    <text x="405" y="57" class="map-feature">예약주차장</text>
    ${shBlock(560,45,92,68,'T2 차고지')}
    ${shParking(495,224,126,140,'',2,4,22)}
    ${shTower(495,164,52,46,'B동')}
    ${shTower(569,164,52,46,'A동')}
    <path d="M398 259H493" class="map-leader"/>
    <text x="388" y="252" class="map-feature">T2 장기주차장</text>
    <text x="570" y="425" class="map-caption">터미널 진입도로</text>
    <text x="550" y="520" class="map-caption">터미널 앞 순환도로</text>
    ${shTerminal('t2', 405, 584, .9)}
    <text x="555" y="738" class="map-campus-label">T2 · 주차장은 터미널 위쪽</text>
    ${shTerminal('t1', 395, 792, 1)}
    ${shRoad(shRoundedPath([[460,940],[460,975],[445,975],[445,1070],[725,1070],[725,975],[700,975],[700,940],[460,940]], 22))}
    ${shParking(468,986,103,59,'',3,2)}
    ${shParking(591,986,103,59,'',3,2)}
    ${shBlock(495,956,62,25,'서측 타워')}
    ${shBlock(604,956,62,25,'동측 타워')}
    <text x="530" y="1087" class="map-feature">P2 서편</text><text x="670" y="1087" class="map-feature">P1 동편</text>
    <text x="580" y="1137" class="map-feature">T1 장기주차장</text>
    ${shParking(288,1015,108,67,'P5 예약',3,1)}
    <text x="580" y="775" class="map-campus-label">T1 · 주차장은 터미널 아래쪽</text>
    ${shBlock(658,1187,68,32,'호텔')}
    ${shBlock(740,1187,68,32,'업무동')}
    ${shBlock(827,1187,68,32,'업무동')}
    ${shBlock(899,1020,90,42,'화물청사역')}
    <path d="M880 1070H1010" stroke="#96a9b4" stroke-width="4" stroke-dasharray="5 4"/>
    ${shBlock(953,716,66,84,'화물 A')}
    ${shBlock(953,818,66,84,'화물 B')}
    ${shBlock(953,920,66,65,'화물 C')}
    ${shBlock(959,305,62,105,'AICC')}
    ${shParking(1130,720,175,220,'물류단지',2,4)}
    <text x="1170" y="1270" class="map-caption">주요 경유지를 연결한 위치 안내도</text>`;
}
function shPin(route, stop, selected, now, x, y, w, h, label = stop.label) {
  return `<button class="map-pin${selected.id === stop.id ? ' selected' : ''}" data-a="sstop" data-v="${stop.id}"
    style="left:${x / w * 100}%;top:${y / h * 100}%" aria-pressed="${selected.id === stop.id}">
    <b>${esc(label)}</b><span data-countdown="${stop.id}">${shMapTimes(stop, now)}</span></button>`;
}
function shMapTimes(stop, now) {
  const ds = shNext(stop, 2, now);
  return ds.map((d, i) => {
    const text = d.wait < 60 ? shWait(d.wait) : `${d.tomorrow && (!i || !ds[0].tomorrow || ds[0].wait < 60) ? '내일 ' : ''}${shHM(d.mod)}`;
    const label = `${i ? '두 번째' : '첫 번째'} 예정편, ${shWait(d.wait)}, ${d.tomorrow ? '내일 ' : ''}${shHM(d.mod)} 출발${d.mark ? ', ' + stop.mark : ''}`;
    return `${i ? '<span class="wait-divider" aria-hidden="true">|</span>' : ''}<span class="${i ? 'later' : 'soon'}" title="${esc(label)}" aria-label="${esc(label)}">${text}${d.mark ? ' ※' : ''}</span>`;
  }).join('');
}
function shRouteButtons(route) {
  return `<div class="sh-map-routes" role="group" aria-label="셔틀 노선 선택">${SH.data.routes.map(r =>
    `<button data-a="sroute" data-v="${r.id}" class="${r.id === route.id ? 'on' : ''}" style="--route:${SH_COLOR[r.id]}" aria-pressed="${r.id === route.id}"><b>${esc(r.name)}</b><span>${esc(r.id === '01' ? 'T1 장기주차장' : r.id === '02' ? 'T2 장기·예약' : r.id === '03' ? 'T2 → T1 → AICC' : r.id === '04' ? 'AICC → T1 → T2' : '화물청사역 ↔ 물류단지')}</span></button>`).join('')}</div>`;
}
function renderShuttleNet(route, stop, now) {
  const el = document.getElementById('shuttle-net');
  if (!el) return;
  const wasOpen = el.querySelector('details')?.open ?? layoutMode() !== 'mobile';
  const viewId = SH.netView[S.term] || 'all', view = SH_NET_VIEWS[viewId];
  const shown = [...Object.entries(SH_AREAS), ...(SH_CAMPUS_HUBS[viewId] || []).map(a => [viewId, a])]
    .filter(([, a]) => a.x > view.x && a.x < view.x + view.w && a.y > view.y && a.y < view.y + view.h);
  const hubs = shown.map(([id, a]) => {
    const stops = route.stops.filter(s => a.stopIds ? a.stopIds.includes(s.id) : SH_POS[s.id].area === id);
    const candidates = a.main ? stops.filter(s => a.main.includes(s.id)) : stops;
    const s = candidates.find(s => s.id === stop.id) || candidates[0];
    const selected = s?.id === stop.id;
    const pos = `left:${(a.x - view.x) / view.w * 100}%;top:${(a.y - view.y) / view.h * 100}%`;
    return s ? `<button class="map-hub${selected ? ' selected' : ''}" style="${pos}"
      data-a="sstop" data-v="${s.id}" aria-pressed="${selected}"><b>${esc(a.name)}</b><span>${esc(s.label)}</span>
      <span data-countdown="${s.id}">${shMapTimes(s, now)}</span><small>승강장 ${stops.length}곳 보기 ›</small></button>`
      : `<div class="map-hub inactive" style="${pos}"><b>${esc(a.name)}</b><span>이 노선은 경유하지 않음</span></div>`;
  }).join('');
  const leaders = shown.map(([, a]) => {
    const points = a.elbowX ? [a.anchor, [a.elbowX,a.anchor[1]], [a.elbowX,a.y], [a.x,a.y]]
      : a.anchor[1] === a.y ? [a.anchor, [a.x,a.y]] : [a.anchor, [a.x,a.anchor[1]], [a.x,a.y]];
    return `<path class="map-leader" d="${shRoundedPath(points, 10)}"/>
      <circle cx="${a.anchor[0]}" cy="${a.anchor[1]}" r="6" fill="#fff" stroke="#637f8e" stroke-width="2"/>`;
  }).join('');
  el.innerHTML = `<div class="sec-head"><div class="titles"><span class="t17">공항 셔틀버스 · 노선과 승강장</span>
    <span class="sub">노선 → 지도 속 승강장 선택 → 남은 시간·구간 소요시간·전체 시간표 확인</span></div></div>
    ${shRouteButtons(route)}
    <p class="sh-schedule-notice"><b>시간표 기준 · 실시간 정보 아님</b> 교통·운행 상황에 따라 실제 출발·도착 시각과 차이가 날 수 있습니다. 남은 시간은 15초마다 자동 계산합니다.</p>
    <details class="sh-overview"${wasOpen ? ' open' : ''}><summary>공항 배치와 운행 방향 · ${esc(route.name)} 선택 <span>건물·진입도로·주차 구획을 함께 보세요</span></summary>
      <div class="sh-area-tabs sh-map-views" role="group" aria-label="지도 확대 범위">${Object.entries(SH_NET_VIEWS).map(([id,v]) =>
        `<button data-a="sview" data-v="${id}" class="${id === viewId ? 'on' : ''}" aria-pressed="${id === viewId}">${v.label}</button>`).join('')}</div>
      <div class="sh-direction-key"><span style="--route:${SH_COLOR['03']}">공항03 · T2 → P5 → T1 → 화물단지</span><span style="--route:${SH_COLOR['04']}">공항04 · 화물단지 → T1 → P5 → T2</span></div>
      <div class="scroll-x map-scroll" tabindex="0" role="region" aria-label="전체 노선 위치도, 좁은 화면에서는 좌우 스크롤">
        <div class="sh-map sh-map-network${viewId === 'all' ? '' : ' zoomed'}" style="--route:${SH_COLOR[route.id]};aspect-ratio:${view.w}/${view.h}">${shSvg(view.w, view.h, shCampusMap() + shRouteLines(SH_PATHS, route.id, true) + leaders, view.label, view.x, view.y)}${hubs}</div>
      </div>
      <p class="acc-src">공식 지도의 건물·주차장 배치를 참고해 직접 그린 안내도입니다. 공항03·04는 주요 구간을 간격 있는 왕복선으로 표시하며 실제 차선·도로 축척과는 다릅니다. 개별 정류장 순서는 아래 목록을 확인하세요. 연한 선은 다른 노선입니다. <a href="https://www.airport.kr/sites/ap_ko/images/sub/img-sh0.jpg" target="_blank" rel="noopener">공식 전체 지도 ↗</a></p>
    </details>`;
}
function shPlatformBase(area, route) {
  const paths = SH_PLATFORM_PATHS[area];
  const routes = paths ? shRouteLines(Object.fromEntries(Object.entries(paths).filter(([id]) =>
    id === route.id || ['03','04'].includes(route.id) && ['03','04'].includes(id))), route.id) : '';
  if (area === 't1') {
    return { w: 920, h: 610, svg: `${shTerminal('t1', 230, 0, 1.2)}
      ${shRoad('M80 144 H860')}
      ${shRoad(shRoundedPath([[90,250],[820,250],[820,524],[86,524],[86,300]]))}
      ${shParking(180,315,230,150,'P2 서편 장기주차장',4,2)}
      ${shParking(470,315,230,150,'P1 동편 장기주차장',4,2)}
      ${shBlock(243,352,100,31,'서측 타워')}
      ${shBlock(535,352,100,31,'동측 타워')}
      <text x="295" y="485" class="map-caption">53~60 구역</text><text x="585" y="485" class="map-caption">3~10 구역</text>
      ${routes}
      <text x="65" y="590" class="map-caption">서 W</text><text x="855" y="590" class="map-caption">동 E</text>
      <text x="460" y="590" class="map-caption">P3 장기주차장 방향 ↓</text>` };
  }
  if (area === 't2') {
    return { w: 1000, h: 740, svg: `${shBlock(730, 20, 220, 235, '')}
      <text x="840" y="45" class="map-caption">예약주차장 · 1 서편 / 2 동편</text>
      ${shBlock(65, 290, 570, 285, '장기주차장', '')}
      ${['A', 'B', 'C', 'D', 'E'].map((b, i) => shBlock(78 + i * 111, 355, 95, 45, b + '110~113')).join('')}
      ${['A', 'B', 'C', 'D', 'E'].map((b, i) => shBlock(78 + i * 111, 474, 95, 45, b + '120~123')).join('')}
      ${shBlock(665, 292, 270, 86, 'P1 주차타워', '남측·북측 승강장 3·4')}
      ${shBlock(665, 495, 270, 80, 'P2 주차타워')}
      ${shBlock(90, 695, 420, 40, '제2여객터미널', '', 'terminal')}
      ${shBlock(680, 690, 230, 40, '정비단지')}
      ${shRoad(shRoundedPath([[260,664],[960,664],[960,260],[65,260],[65,590],[960,590]]))}
      ${shRoad('M700 260 V20')}
      ${routes}
      <text x="160" y="70" class="map-caption">동 E ← · → 서 W</text>
      <text x="340" y="190" class="map-caption">T2 장기·예약주차장 승강장</text>` };
  }
  if (area === 'p5') {
    return { w: 920, h: 460, svg: `${shParking(140,60,620,300,'P5 예약주차장 · T1 예약차량 주차 구역',6,4)}
      ${shRoad('M80 390 H840')}
      ${routes}
      <text x="460" y="435" class="map-caption">${route.id === '03' ? '공항03 → T1 3층 3번·12번 → 국제업무단지' : '공항04 → T2 3층 6번'}</text>` };
  }
  return { w: 920, h: 460, svg: `${shBlock(130, 55, 650, 120, '공항철도 · 공항 화물청사역', '1번 출구                         2번 출구', 'terminal')}
    <path d="M220 175V245 M600 175V265" stroke="#8398a6" stroke-width="3" stroke-dasharray="6 6"/>
    ${shRoad('M80 345 H840')}
    <text x="460" y="410" class="map-caption">${route.id === '05' ? '2번 출구 앞 · 공항05 물류단지 순환버스' : '공항03·04 환승승차장 · 현장 행선지 표지 확인'}</text>` };
}
function renderShuttlePlatforms(route, stop, now) {
  const el = document.getElementById('shuttle-platform');
  if (!el) return;
  const mapWasOpen = el.querySelector('.mobile-map-details')?.open ?? false;
  const area = SH_POS[stop.id].area, a = SH_AREAS[area], color = SH_COLOR[route.id];
  const stops = route.stops.filter(s => SH_POS[s.id].area === area);
  const areas = [...new Set(route.stops.map(s => SH_POS[s.id].area))];
  const isPlan = ['t1', 't2', 'p5'].includes(area) || area === 'station' && route.id === '05';
  const sources = [{ file: a.image, label: '공식 위치·노선도' }];
  if (area === 't1') {
    if (route.id === '01') sources.push({ file: 't1p-map2-s.jpg', label: 'T1 1층 3C·13C 위치' });
    else sources[0] = { file: route.id === '03' ? 'a1-map1-s.jpg' : 'a1-map3-s.jpg', label: 'T1 3층 출입구·승강장 위치' };
  } else if (area === 't2') {
    sources.push({ file: route.id === '02' ? 't2p-map2-s.jpg' : route.id === '03' ? 'a1-map2-s.jpg' : 'a1-map4-s.jpg', label: 'T2 출입구·승강장 위치' });
  } else if (route.id === '04' || area === 'station' && route.id === '03') {
    sources[0] = { file: `img-nosun${Number(route.id)}.jpg`, label: '공식 노선·승차 안내' };
  }
  const note = area === 'station' && route.id !== '05' ? '공항03·04는 공항 화물청사역 환승승차장입니다. 정확한 승강장 위치는 현장 행선지 표지와 공식 안내를 확인하세요.'
    : a.note || '시간은 각 정류장의 공식 출발 시간표로 계산합니다. 승강장 위치는 현장 표지와 공식 안내를 함께 확인하세요.';
  let map;
  if (isPlan) {
    const b = shPlatformBase(area, route);
    map = `<div class="scroll-x map-scroll" tabindex="0" role="region" aria-label="${esc(a.name)} 승강장 지도, 좌우 스크롤">
      <div class="sh-map platform" style="aspect-ratio:${b.w}/${b.h};--route:${color}">${shSvg(b.w, b.h, b.svg + shMapLegs(route, stops, area), a.name)}
        ${stops.map(s => { const p = SH_POS[s.id]; return shPin(route, s, stop, now, p.x, p.y, b.w, b.h); }).join('')}
      </div></div>`;
    if (layoutMode() === 'mobile') {
      map = `<details class="mobile-map-details"${mapWasOpen ? ' open' : ''}><summary>승강장 지도 펼쳐보기</summary>${map}</details>`;
    }
  } else {
    map = `<div class="map-sequence" style="--route:${color}">${stops.map((s, i) => {
      const leg = shTravelLeg(route, s);
      return `<button class="sequence-stop${s.id === stop.id ? ' selected' : ''}" data-a="sstop" data-v="${s.id}" aria-pressed="${s.id === stop.id}"><small>${i + 1}</small><b>${esc(s.label)}</b><span data-countdown="${s.id}">${shMapTimes(s, now)}</span><span class="sequence-leg">약 ${leg.minutes}분 → ${esc(leg.to.label)}</span></button>`;
    }).join('')}</div>`;
  }
  const leg = shTravelLeg(route, stop);
  el.innerHTML = `<div class="titles"><h2 class="t15">${esc(a.name)} · ${isPlan ? '승강장 위치' : '정차 순서'}</h2>
    <span class="sub">${isPlan ? '지도의 승강장을 누르면 오른쪽 안내와 아래 시간표가 바뀝니다. 좁은 화면에서는 좌우로 밀어 보세요.' : '이 구간은 정차 순서도입니다. 실제 도로상 위치·정류장 간 거리를 나타내지 않습니다.'}</span></div>
    <div class="sh-area-tabs" role="group" aria-label="승강장 구역 선택">${areas.map(id => {
      const s = route.stops.find(s => SH_POS[s.id].area === id);
      return `<button data-a="sstop" data-v="${s.id}" aria-pressed="${id === area}" class="${id === area ? 'on' : ''}">${esc(SH_AREAS[id].name)}</button>`;
    }).join('')}</div>
    <p class="sh-map-legend">출발까지 <strong>3분</strong> <span aria-hidden="true">|</span> 9분 · 빠른 편부터 표시 · 1시간 이상 남으면 출발 시각 표시<br>시간표 기반으로 오차가 있을 수 있습니다. <b>약 N분</b>은 남은 시간이 아닌 승차 후 구간 소요시간입니다.</p>
    ${map}
    <div class="sh-travel-summary"><b>${esc(stop.label)} → ${esc(leg.to.label)}</b><span>승차 후 약 <strong>${leg.minutes}분</strong></span>
      <small>일반 운행편의 <a href="${esc(route.travel.source_url)}" target="_blank" rel="noopener">공식 구간 소요시간 ↗</a> · 교통·대기·미경유·※ 예외편에 따라 달라질 수 있습니다.</small></div>
    <p class="tipbox">${esc(note)}
      ${area === 't2' && route.id === '03' ? '공항03의 장기탑승장 개별 시간표는 새벽편입니다. 그 이후 공항03 차량은 공항02 시간표의 ※ 표시 운행편도 확인하세요.' : ''}
      ${sources.map(s => `<a href="https://www.airport.kr/sites/ap_ko/images/sub/${s.file}" target="_blank" rel="noopener">${s.label} ↗</a>`).join(' · ')}</p>
    <p class="acc-src">선택 승강장은 굵은 테두리로 표시합니다. ※는 차량·행선지 예외 운행편으로, 선택하면 상세 안내를 볼 수 있습니다. 구간 소요시간으로 개별 운행편의 도착 시각을 확정하지 않습니다.</p>`;
}
