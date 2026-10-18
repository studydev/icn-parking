// 앱 계산의 참조 구현. web/app.js forecastOf·nowAgg·capacityPredictionIssue를 그대로 옮기고 두 가지만 바꿨다.
//  1) 예측 칸 위치를 cellSlots로 받는다(웹 = 정시 1시간 6칸 webCells, 앱 = 지금 + 30분씩 12칸(6시간) appCells).
//  2) 지표(avail/occ)와 무관하게 주차 대수(parking)로 내고 available·occupancy를 함께 준다. 앱은 100% 초과 표시가 없어 over=false.
// scripts/fixtures.mjs가 webCells 결과를 실제 웹 출력과 대조한 뒤 appCells 결과를 앱 테스트 기대값으로 쓴다.
export const DAY = 288;
export const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const slotRange = (date, i) => ({ date: addDays(date, Math.floor(i / DAY)), slot: ((i % DAY) + DAY) % DAY });
export const webCells = idx => Array.from({ length: 6 }, (_, k) => (Math.floor(idx / 12) + 1 + k) * 12);
export const appCells = idx => Array.from({ length: 12 }, (_, k) => idx + 6 * (k + 1));
const available = (parking, capacity) => Math.max(capacity - parking, 0);
const occupancy = (parking, capacity) => Math.min(parking / capacity, 1);

/* web zoneDay: p = 화면용(보정 포함), pm = 실측만, est = 보정 슬롯. 면수 0·값 없음은 null */
export function zoneDay(days, zoneId, date) {
  const z = days[date]?.zones[zoneId];
  if (!z) return null;
  const est = new Array(DAY).fill(false), p = new Array(DAY).fill(null), pm = p.slice();
  for (const i of z.e || []) est[i] = true;
  for (let i = 0; i < DAY; i++) {
    const pi = z.p[i], ci = z.c[i];
    if (pi == null || ci == null || ci <= 0) continue;
    p[i] = pi;
    if (!est[i]) pm[i] = pi;
  }
  return { p, pm, est };
}

/* web capacityPredictionIssue */
function capacityIssue(latestZones, zoneId, capacity) {
  const current = latestZones.find(z => z.id === zoneId)?.c;
  if (current === 0) return { reason: 'latestClosed' };
  if (!(current > 0)) return { reason: 'capacityUnknown' };
  return current !== capacity ? { reason: 'capacityChanged', from: capacity, to: current } : null;
}

/* web forecastOf. today·idx = 지금 KST 날짜·슬롯 */
export function forecastZone({ days, latestZones, today, idx, zoneId, cellSlots }) {
  let anchor = null;
  for (let back = 0; back <= 6; back++) {
    const at = slotRange(today, idx - back), day = zoneDay(days, zoneId, at.date);
    if (days[at.date]?.zones[zoneId]?.c[at.slot] === 0) return { ok: false, reason: 'recentClosed' };
    if (day?.pm[at.slot] != null) { anchor = { ...at, day }; break; }
  }
  if (!anchor) return { ok: false, reason: 'noCurrent' };
  const capacity = days[anchor.date].zones[zoneId].c[anchor.slot];
  const issue = capacityIssue(latestZones, zoneId, capacity);
  if (issue) return { ok: false, ...issue };
  const nowParking = anchor.day.p[anchor.slot];
  const now = { anchor: { date: anchor.date, slot: anchor.slot }, capacity, nowParking, nowAvailable: available(nowParking, capacity), nowOccupancy: occupancy(nowParking, capacity) };
  const sm = (date, slot) => {
    let sum = 0, n = 0;
    for (let delta = -2; delta <= 2; delta++) {
      const at = slotRange(date, slot + delta), value = zoneDay(days, zoneId, at.date)?.pm[at.slot];
      if ((at.date < today || (at.date === today && at.slot <= idx)) && value != null) { sum += value; n++; }
    }
    return n ? sum / n : null;
  };
  for (let w = 1; w <= 4; w++) {
    const compareDate = addDays(today, -7 * w), baseParking = sm(addDays(anchor.date, -7 * w), anchor.slot);
    if (baseParking == null) continue;
    const offset = nowParking - baseParking;
    const cells = cellSlots(idx).map(j => {
      const at = slotRange(compareDate, j), bv = sm(at.date, at.slot), target = slotRange(today, j);
      const parking = bv == null ? null : Math.max(bv + offset, 0);
      return { ...target, parking, baseParking: bv, available: parking == null ? null : available(parking, capacity), occupancy: parking == null ? null : occupancy(parking, capacity) };
    });
    if (cells.every(c => c.parking == null)) continue;
    return { ok: true, ...now, weeksBack: w, compareDate, baseParking, offset, cells };
  }
  return { ok: false, reason: 'noHistory', ...now };
}

/* web nowAgg(over=false): p≠null·c>0 구역만. avail = Σc − Σmin(p,c) */
export function groupNow(latestZones, zoneIds) {
  let q = 0, c = 0;
  const included = [];
  for (const id of zoneIds) {
    const x = latestZones.find(z => z.id === id);
    if (!x || x.p == null || !x.c) continue;
    q += Math.min(x.p, x.c); c += x.c; included.push(id);
  }
  return included.length ? { capacity: c, available: c - q, occupancy: q / c, included, missing: zoneIds.length - included.length } : { capacity: 0, available: null, occupancy: null, included, missing: zoneIds.length };
}

/* 그룹 예측(웹에 없음, 디자인 groupSeries 규칙): 포함 구역 = groupNow와 같음. 예측 없는 구역·빈 칸은 현재값 유지 */
export function groupForecast(latestZones, zoneIds, results) {
  const now = groupNow(latestZones, zoneIds);
  const hasForecast = now.included.some(id => results[id].ok);
  const n = Math.max(0, ...now.included.map(id => results[id].ok ? results[id].cells.length : 0));
  const cells = hasForecast ? Array.from({ length: n }, (_, k) => {
    let sum = 0;
    for (const id of now.included) {
      const x = latestZones.find(z => z.id === id), r = results[id], cell = r.ok ? r.cells[k] : null;
      sum += cell?.available != null ? cell.available : x.c - Math.min(x.p, x.c);
    }
    return { available: sum, occupancy: (now.capacity - sum) / now.capacity };
  }) : [];
  return { ...now, hasForecast, cells };
}

/* 상단 줄 상태(README States): 오프라인 > 지연(stale 또는 10분 이상) > 정상 */
export function freshness({ slot, stale }, nowMs, offline) {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(slot + ':00+09:00')) / 60000)), time = slot.slice(11, 16);
  if (offline) return { kind: 'offline', time };
  if (stale || minutes >= 10) return { kind: 'delayed', minutes, time };
  return { kind: 'normal', minutes, time };
}
