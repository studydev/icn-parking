'use strict';

const IGoTo = (() => {
  const DAY = 288, DAY_MS = 864e5, HISTORY_DAYS = 28, MAX_FUTURE_DAYS = 7;
  const VERSION = 'IGoTo parking-demand ridge v2';
  const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
  const distance = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS);
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date)) && addDays(date, 0) === date;
  const offDay = (date, holidays) => [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay()) || !!holidays[date];
  const shift = (date, idx) => ({ date: addDays(date, Math.floor(idx / DAY)), idx: ((idx % DAY) + DAY) % DAY });

  function calendar(from, to, holidays) {
    if (!validDate(from) || !validDate(to) || from > to || !holidays || typeof holidays !== 'object') {
      throw new Error('IGoTo calendar requires a valid date range and holiday map');
    }
    const start = addDays(from, -21), end = addDays(to, 21), runs = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      if (!offDay(date, holidays)) continue;
      const run = { start: date, end: date, holidays: [] };
      while (date <= end && offDay(date, holidays)) {
        run.end = date;
        if (holidays[date]) run.holidays.push(holidays[date]);
        date = addDays(date, 1);
      }
      runs.push(run);
    }
    const breaks = [];
    for (let i = 0; i < runs.length; i++) {
      const first = runs[i], block = { start: first.start, end: first.end, leave: 0, runs: [first] };
      let hasHoliday = first.holidays.length > 0;
      while (i + 1 < runs.length) {
        const next = runs[i + 1], gap = distance(block.end, next.start) - 1;
        if (block.leave + gap > 3 || distance(block.start, next.end) + 1 > 16 || !(hasHoliday || next.holidays.length)) break;
        block.leave += gap;
        block.end = next.end;
        block.runs.push(next);
        hasHoliday ||= next.holidays.length > 0;
        i++;
      }
      block.length = distance(block.start, block.end) + 1;
      if (hasHoliday && block.length >= 3) breaks.push(block);
    }
    const out = new Map();
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const off = offDay(date, holidays), holiday = holidays[date] || '';
      const block = breaks.find(b => date >= b.start && date <= b.end);
      const departure = breaks.some(b => b.runs.some(r => addDays(r.start, -1) === date));
      const after = breaks.find(b => date > b.end && distance(b.end, date) <= 2);
      const bridge = !!block && !off;
      const kind = bridge ? '연결 휴가 후보' : block ? '공휴일 연휴' : holiday ? '공휴일' : off ? '주말' : after ? '연휴 직후' : '평일';
      out.set(date, {
        off, holiday, bridge, departure, kind, block: block || null,
        tailDay: after ? distance(after.end, date) : 0
      });
    }
    return out;
  }

  function features(context, idx, longTerm) {
    const hour = idx / 12, phase = hour / 24 * Math.PI * 2;
    const departure = context.departure ? Math.max(0, Math.min(1, (hour - 12) / 6)) : 0;
    const tail = longTerm && context.tailDay ? Math.max(0, 1 - (context.tailDay - 1 + hour / 24) / 2) : 0;
    return [
      1, Math.sin(phase), Math.cos(phase), Math.sin(phase * 2), Math.cos(phase * 2),
      Number(context.off), Number(!!context.block && context.off), Number(context.bridge), departure, tail
    ];
  }

  function solve(matrix, values) {
    const rows = matrix.map((row, i) => [...row, values[i]]), n = values.length;
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
      [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
      if (Math.abs(rows[i][i]) < 1e-12) throw new Error('IGoTo forecast regression is singular');
      const divisor = rows[i][i];
      for (let k = i; k <= n; k++) rows[i][k] /= divisor;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const factor = rows[j][i];
        for (let k = i; k <= n; k++) rows[j][k] -= factor * rows[i][k];
      }
    }
    return rows.map(row => row[n]);
  }

  function observation(days, zoneId, date, idx) {
    const zone = days.get(date)?.zones[zoneId], p = zone?.p[idx], c = zone?.c[idx];
    if (zone?.e?.includes(idx)) return null; /* 서버가 추정으로 메운 슬롯은 학습에 쓰지 않습니다 */
    return Number.isSafeInteger(p) && p >= 0 && Number.isSafeInteger(c) && c > 0 ? { value: p / c, parking: p, capacity: c } : null;
  }

  function fit({ days, zoneId, category, now, holidays }) {
    if (!(days instanceof Map) || !validDate(now?.date) || !Number.isInteger(now.idx) || now.idx < 0 || now.idx >= DAY) {
      throw new Error('IGoTo forecast requires day records and a valid KST cutoff');
    }
    if (!holidays || !Object.keys(holidays).some(date => date.startsWith(now.date.slice(0, 4) + '-'))) {
      return { ok: false, why: '해당 연도의 공휴일 달력이 없어 IGoTo 예측을 만들 수 없습니다' };
    }
    let anchor = null;
    for (let k = 0; k <= 6; k++) {
      const at = shift(now.date, now.idx - k);
      if (days.get(at.date)?.zones[zoneId]?.c[at.idx] === 0) return { ok: false, why: '최근 관측이 운영 중단 상태여서 IGoTo 예측을 만들 수 없습니다' };
      const value = observation(days, zoneId, at.date, at.idx);
      if (value) { anchor = { ...at, ...value }; break; }
    }
    if (!anchor) return { ok: false, why: '최근 30분 내 구역 실측이 없어 IGoTo 예측을 만들 수 없습니다' };
    const from = addDays(now.date, -HISTORY_DAYS + 1), to = addDays(now.date, MAX_FUTURE_DAYS);
    const contexts = calendar(from, to, holidays), rows = [], dates = new Set(), kindDays = new Map(), departureDays = new Set();
    const capacities = new Set(), currentCapacityDates = new Set();
    let currentCapacityHours = 0;
    const longTerm = category === '장기' || category === '타워';
    for (let date = from; date <= now.date; date = addDays(date, 1)) {
      const context = contexts.get(date);
      for (let hour = 0; hour < 24; hour++) {
        let sum = 0, indices = 0, n = 0, currentCapacitySamples = 0;
        for (let idx = hour * 12; idx < (hour + 1) * 12 && (date < now.date || idx <= now.idx); idx++) {
          const value = observation(days, zoneId, date, idx);
          if (!value) continue;
          // One reference denominator learns parked demand, not jumps caused by changing capacity.
          sum += value.parking / anchor.capacity; indices += idx; n++;
          capacities.add(value.capacity);
          if (value.capacity === anchor.capacity) currentCapacitySamples++;
        }
        if (n < 6) continue;
        const idx = indices / n;
        rows.push({
          x: features(context, idx, longTerm), y: sum / n,
          weight: Math.exp(-(distance(date, now.date) + (now.idx - idx) / DAY) / 14)
        });
        dates.add(date);
        if (currentCapacitySamples >= 6) { currentCapacityHours++; currentCapacityDates.add(date); }
        if (!kindDays.has(context.kind)) kindDays.set(context.kind, new Set());
        kindDays.get(context.kind).add(date);
        if (context.departure && idx >= 144) departureDays.add(date);
      }
    }
    if (rows.length < 24 || dates.size < 2) {
      return { ok: false, why: '유효한 주차 대수 실측이 2일·24시간 이상 필요합니다' };
    }
    const size = rows[0].x.length, matrix = Array.from({ length: size }, () => new Array(size).fill(0)), values = new Array(size).fill(0);
    for (const { x, y, weight } of rows) {
      for (let i = 0; i < size; i++) {
        values[i] += weight * x[i] * y;
        for (let j = 0; j < size; j++) matrix[i][j] += weight * x[i] * x[j];
      }
    }
    for (let i = 0; i < size; i++) matrix[i][i] += i === 0 ? 0.001 : 6;
    const coefficients = solve(matrix, values);
    const evaluate = x => x.reduce((sum, v, i) => sum + v * coefficients[i], 0);
    const offset = anchor.value - evaluate(features(contexts.get(anchor.date), anchor.idx, longTerm));
    return {
      ok: true, now: { ...now }, anchor, coefficients, contexts, kindDays, departureDays, days: dates.size, hours: rows.length,
      longTerm, offset, capacityChanged: capacities.size > 1, capacities: [...capacities].sort((a, b) => a - b),
      currentCapacityDays: currentCapacityDates.size, currentCapacityHours,
      holidayYears: new Set(Object.keys(holidays).map(date => date.slice(0, 4))),
      trainingMae: rows.reduce((sum, r) => sum + Math.abs(evaluate(r.x) - r.y), 0) / rows.length
    };
  }

  function predict(model, date, idx) {
    if (!model.ok) return { value: null, why: model.why };
    if (!validDate(date) || !Number.isInteger(idx) || idx < 0 || idx >= DAY) throw new Error('IGoTo prediction requires a valid KST slot');
    const daysAhead = distance(model.now.date, date), hours = daysAhead * 24 + (idx - model.now.idx) / 12;
    if (hours < 0 || daysAhead > MAX_FUTURE_DAYS) return { value: null, why: '현재 이후 최대 7일까지 예측할 수 있습니다' };
    if (!model.holidayYears.has(date.slice(0, 4))) return { value: null, why: '예측 날짜의 공휴일 달력이 없습니다' };
    const context = model.contexts.get(date), x = features(context, idx, model.longTerm);
    const baseline = x.reduce((sum, v, i) => sum + v * model.coefficients[i], 0);
    const anchorAge = distance(model.anchor.date, date) * 24 + (idx - model.anchor.idx) / 12;
    const value = Math.max(0, baseline + model.offset * Math.exp(-anchorAge / (model.longTerm ? 24 : 8)));
    const adaptingCapacity = model.capacityChanged && (model.currentCapacityDays < 2 || model.currentCapacityHours < 24);
    const limited = adaptingCapacity || hours > 72 || model.days < 7 || (model.kindDays.get(context.kind)?.size || 0) < 2 || (context.departure && idx >= 144 && model.departureDays.size < 2);
    return {
      value, parking: value * model.anchor.capacity, capacity: model.anchor.capacity,
      context, limited, adaptingCapacity,
      why: adaptingCapacity ? '운영 면수 변경 직후입니다. 과거 주차 대수로 학습한 참고 예상이며 현재 면수 유지 가정입니다.'
        : limited ? '유사한 휴일 조건의 실측 표본이 부족한 참고 예상입니다' : ''
    };
  }

  return Object.freeze({ calendar, fit, predict, VERSION, HISTORY_DAYS, MAX_FUTURE_DAYS });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = IGoTo;
