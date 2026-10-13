'use strict';

const ParkingCapacity = (() => {
  const DAY = 288, DAY_MS = 864e5;
  const addDays = (date, count) => new Date(Date.parse(date + 'T00:00:00Z') + count * DAY_MS).toISOString().slice(0, 10);
  const references = {
    't1-short-b1': { capacity: 378, source: '사용자 전화 확인 · 상황실(전화 끝자리 7700, 2026-10-13)', note: '기본 378대이며 성수기에 운영 면수가 유동적으로 조정될 수 있습니다.' }
  };
  const knownEvents = [{
    zoneId: 't1-short-b1', date: '2026-10-13', idx: 203, from: 520, to: 378,
    source: '사용자 전화 확인 · 상황실(전화 끝자리 7700, 2026-10-13)',
    note: '개천절·한글날 극성수기에 임시로 520대를 운영한 뒤 기본 378대로 원복했습니다. 사용자가 일반 담당자가 아닌 상황실(전화 끝자리 7700)에 문의해 확인한 내용이며 공개 공지 확인과는 구분합니다.'
  }];
  const validCapacity = value => Number.isSafeInteger(value) && value >= 0;
  function events({ days, zones, from, to, now }) {
    const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date)) && addDays(date,0) === date;
    if (!(days instanceof Map) || !Array.isArray(zones) || !validDate(from) || !validDate(to) || !validDate(now?.date) || from > to || !Number.isInteger(now.idx) || now.idx < 0 || now.idx >= DAY) {
      throw new Error('Capacity events require day records, zones, an ordered date range and a cutoff.');
    }
    const records = new Map();
    const cutoff = `${now.date}|${String(now.idx).padStart(3, '0')}`;
    const key = event => `${event.zoneId}|${event.date}|${event.idx}`;
    for (const zone of zones) {
      let previous = null;
      for (let date = addDays(from, -1); date <= to && date <= now.date; date = addDays(date, 1)) {
        const values = days.get(date)?.zones[zone.id]?.c;
        if (!values) continue;
        for (let idx = 0; idx < DAY && (date < now.date || idx <= now.idx); idx++) {
          const capacity = values[idx];
          if (!validCapacity(capacity)) continue;
          if (previous && capacity !== previous.capacity && date >= from) {
            const event = { zoneId: zone.id, name: zone.name, date, idx, from: previous.capacity, to: capacity, source: 'API 관측', note: '운영 면수 변경을 처음 관측한 시각입니다. 변경 사유는 확인되지 않았습니다.' };
            const known = knownEvents.find(item => key(item) === key(event) && item.from === event.from && item.to === event.to);
            records.set(key(event), known ? { ...event, ...known } : event);
          }
          previous = { capacity };
        }
      }
    }
    for (const event of knownEvents) {
      const zone = zones.find(zone => zone.id === event.zoneId);
      if (!zone || event.date < from || event.date > to || `${event.date}|${String(event.idx).padStart(3, '0')}` > cutoff || records.has(key(event))) continue;
      const capacity = days.get(event.date)?.zones[event.zoneId]?.c[event.idx];
      const before = days.get(event.date)?.zones[event.zoneId]?.c[event.idx - 1];
      if ((validCapacity(capacity) && capacity !== event.to) || (validCapacity(before) && before !== event.from)) continue;
      records.set(key(event), { ...event, name: zone.name });
    }
    return [...records.values()].sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx || a.zoneId.localeCompare(b.zoneId));
  }
  return Object.freeze({ references, events });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ParkingCapacity;
