// 히스토리 탭(5p/5q) 집계 참조 구현. 웹에 같은 화면이 없어 README 규칙을 따른다.
//  - 점 k(0…N, N = 일수×24) = 지금 시(時)에서 (N−k)시간 전 한 시간 묶음. 실측 슬롯(e 제외, p·c 있음, c>0)의 평균
//    available = max(c−p,0), occupancy = min(p,c)/c, capacity = c. 지금 이후 슬롯은 쓰지 않는다
//  - 그 시간에 실측이 없고 c==0 슬롯이 있으면 운영 중단(closed) → 그룹 합계에서 뺀다
//  - 그룹 "전체" 선: 운영 중단이 아닌 구역 값이 모두 있을 때만(웹 묶음 규칙). occupancy = 1 − Σavailable/Σcapacity
//  - 요약·일별 표는 null이 아닌 점만
import { addDays } from './forecast.mjs';

export function historyModel({ days, zoneIds, today, slot, nDays, holidays = {} }) {
  const N = nDays * 24, H = Math.floor(slot / 12);
  const points = Array.from({ length: N + 1 }, (_, k) => {
    const g = H - (N - k);
    return { date: addDays(today, Math.floor(g / 24)), hour: ((g % 24) + 24) % 24 };
  });
  const bucket = (zoneId, { date, hour }) => {
    const z = days[date]?.zones[zoneId];
    if (!z) return null;
    const est = new Set(z.e || []);
    let a = 0, o = 0, c = 0, n = 0, closed = false;
    for (let i = hour * 12; i < hour * 12 + 12; i++) {
      if (date === today && i > slot) break;
      const p = z.p[i], ci = z.c[i];
      if (ci === 0) closed = true;
      if (p == null || ci == null || ci <= 0 || est.has(i)) continue;
      a += Math.max(ci - p, 0); o += Math.min(p, ci) / ci; c += ci; n++;
    }
    if (n) return { available: a / n, occupancy: o / n, capacity: c / n };
    return closed ? { closed: true } : null;
  };
  const zoneLines = zoneIds.map(id => ({ id, values: points.map(pt => bucket(id, pt)) }));
  const clean = v => v && !v.closed ? { available: v.available, occupancy: v.occupancy } : null;
  const lines = zoneLines.map(l => ({ id: l.id, values: l.values.map(clean) }));
  if (zoneIds.length > 1) {
    const all = points.map((_, k) => {
      const open = zoneLines.map(l => l.values[k]).filter(v => !v?.closed);
      if (!open.length || open.some(v => v == null)) return null;
      const a = open.reduce((s, v) => s + v.available, 0), c = open.reduce((s, v) => s + v.capacity, 0);
      return { available: a, occupancy: 1 - a / c };
    });
    lines.unshift({ id: 'all', values: all });
  }
  const dates = Array.from({ length: nDays }, (_, i) => addDays(today, i - nDays + 1));
  const red = date => { const w = new Date(date + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6 || !!holidays[date]; };
  for (const line of lines) {
    const vs = line.values.filter(Boolean);
    line.stats = vs.length ? {
      averageOccupancy: vs.reduce((s, v) => s + v.occupancy, 0) / vs.length,
      maxOccupancy: Math.max(...vs.map(v => v.occupancy)),
      averageAvailable: vs.reduce((s, v) => s + v.available, 0) / vs.length,
      minAvailable: Math.min(...vs.map(v => v.available)),
      fullHours: vs.filter(v => v.occupancy >= 0.98).length
    } : null;
    line.daily = dates.map(date => {
      const dv = line.values.filter((v, k) => v && points[k].date === date);
      return dv.length ? { maxOccupancy: Math.max(...dv.map(v => v.occupancy)), minAvailable: Math.min(...dv.map(v => v.available)) } : null;
    });
  }
  return { points, dates: dates.map(date => ({ date, red: red(date) })), lines };
}
