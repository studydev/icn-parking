const { test } = require('node:test');
const assert = require('node:assert/strict');
const IGoTo = require('../web/forecast.js');

const holidays = { '2026-10-03': '개천절', '2026-10-05': '대체공휴일(개천절)', '2026-10-09': '한글날' };
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function fixture() {
  const days = new Map(), contexts = IGoTo.calendar('2026-10-01', '2026-10-18', holidays);
  for (let date = '2026-10-01'; date <= '2026-10-18'; date = addDays(date, 1)) {
    const context = contexts.get(date), p = Array.from({ length: 288 }, (_, idx) => {
      const cycle = 0.04 * Math.sin(idx / 288 * Math.PI * 2);
      const travel = context.block && context.off ? 0.25 : context.bridge ? 0.1 : 0;
      const departure = context.departure ? 0.1 * Math.max(0, Math.min(1, (idx / 12 - 12) / 6)) : 0;
      return Math.round((0.7 + cycle + travel + departure) * 1000);
    });
    days.set(date, { date, zones: { long: { p, c: new Array(288).fill(1000) } } });
  }
  return days;
}

test('golden break joins October 3–11 with exactly three optional leave days, not false public holidays', () => {
  const calendar = IGoTo.calendar('2026-10-01', '2026-10-18', holidays);
  for (const date of ['2026-10-06', '2026-10-07', '2026-10-08']) {
    const context = calendar.get(date);
    assert.equal(context.bridge, true);
    assert.equal(context.holiday, '');
    assert.equal(context.off, false);
    assert.equal(context.block.start, '2026-10-03');
    assert.equal(context.block.end, '2026-10-11');
    assert.equal(context.block.length, 9);
    assert.equal(context.block.leave, 3);
  }
  assert.equal(calendar.get('2026-10-02').departure, true);
  assert.equal(calendar.get('2026-10-08').departure, true);
  assert.equal(calendar.get('2026-10-12').kind, '연휴 직후');
  assert.equal(calendar.get('2026-10-14').block, null);
});

test('ordinary weekends are not golden breaks, and bridges cannot consume over three leave days', () => {
  const calendar = IGoTo.calendar('2026-10-01', '2026-10-25', holidays);
  assert.equal(calendar.get('2026-10-17').block, null);
  assert.equal(calendar.get('2026-10-18').kind, '주말');
  const separate = IGoTo.calendar('2026-10-01', '2026-10-18', { '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-12': '특별 휴일' });
  assert.notEqual(separate.get('2026-10-03').block.end, '2026-10-12');
  const childrenDay = IGoTo.calendar('2026-05-01', '2026-05-08', { '2026-05-05': '어린이날' });
  assert.equal(childrenDay.get('2026-05-04').block.leave, 1);
  assert.equal(childrenDay.get('2026-05-01').departure, true, 'departures can precede the opening weekend, not just the public holiday itself');
});

test('fit and predict cannot use future observations, even when supplied full future day files', () => {
  const days = fixture(), now = { date: '2026-10-08', idx: 144 };
  const fit = () => IGoTo.fit({ days, zoneId: 'long', category: '장기', now, holidays });
  const before = fit(), prediction = IGoTo.predict(before, '2026-10-09', 144);
  for (const [date, doc] of days) {
    if (date < now.date) continue;
    const start = date === now.date ? now.idx + 1 : 0;
    doc.zones.long.p.fill(5000, start);
    doc.zones.long.c.fill(7, start);
  }
  const after = fit();
  assert.deepEqual(after.coefficients, before.coefficients);
  assert.deepEqual(after.anchor, before.anchor);
  assert.equal(IGoTo.predict(after, '2026-10-09', 144).value, prediction.value);
});

test('learned holiday and departure demand differs from weekdays and does not perpetuate a holiday offset', () => {
  const model = IGoTo.fit({ days: fixture(), zoneId: 'long', category: '장기', now: { date: '2026-10-08', idx: 144 }, holidays });
  assert.equal(model.ok, true);
  const holiday = IGoTo.predict(model, '2026-10-09', 144), weekday = IGoTo.predict(model, '2026-10-14', 144);
  assert(holiday.value > weekday.value + 0.1);
  assert.equal(IGoTo.predict(model, '2026-10-12', 144).limited, true, 'unseen post-holiday conditions must not claim strong evidence');
  const current = IGoTo.predict(model, model.anchor.date, model.anchor.idx);
  assert(Math.abs(current.value - model.anchor.value) < 1e-12);
  assert.equal(IGoTo.predict(model, '2026-10-16', 0).value, null, 'maximum seven following dates');
  assert.equal(IGoTo.predict(model, '2026-10-07', 0).value, null, 'past values are not predictions');
});

test('missing, closed and changed-capacity records cannot become success-shaped forecasts', () => {
  const now = { date: '2026-10-08', idx: 144 }, days = fixture();
  const fit = changes => IGoTo.fit({ days, zoneId: 'long', category: '장기', now, holidays, ...changes });
  assert.equal(fit({ holidays: {} }).ok, false);
  for (const doc of days.values()) doc.zones.long.p.fill(null);
  assert.equal(fit().ok, false);
  const today = days.get(now.date).zones.long;
  today.p.fill(1050); today.c.fill(1000);
  assert.equal(fit().ok, false, 'one day is not enough for a trained model');
  for (const doc of days.values()) doc.zones.long.c.fill(0);
  assert.equal(fit().ok, false, 'closed lots have no valid occupancy');
});

test('capacity changes reset evidence instead of learning incomparable occupancy samples', () => {
  const days = fixture(), now = { date: '2026-10-08', idx: 144 };
  days.get(now.date).zones.long.c.fill(1500);
  const model = IGoTo.fit({ days, zoneId: 'long', category: '장기', now, holidays });
  assert.equal(model.ok, false, 'only the current half-day has the new capacity');
});

test('the first hour after midnight can anchor to a recent previous-day observation', () => {
  const days = fixture(), now = { date: '2026-10-09', idx: 1 };
  days.get(now.date).zones.long.p.fill(null);
  const model = IGoTo.fit({ days, zoneId: 'long', category: '장기', now, holidays });
  assert.equal(model.ok, true);
  assert.equal(model.anchor.date, '2026-10-08');
  assert.equal(model.anchor.idx, 287);
  assert(Number.isFinite(IGoTo.predict(model, now.date, 12).value));
});

test('an unknown future calendar year is rejected explicitly instead of treated as ordinary weekdays', () => {
  const days = new Map();
  for (let date = '2026-12-20'; date <= '2026-12-31'; date = addDays(date, 1)) {
    days.set(date, { date, zones: { long: { p: new Array(288).fill(900), c: new Array(288).fill(1000) } } });
  }
  const model = IGoTo.fit({ days, zoneId: 'long', category: '장기', now: { date: '2026-12-31', idx: 144 }, holidays });
  assert.equal(model.ok, true);
  assert.equal(IGoTo.predict(model, '2027-01-01', 144).value, null);
  assert.match(IGoTo.predict(model, '2027-01-01', 144).why, /공휴일 달력이 없습니다/);
});
