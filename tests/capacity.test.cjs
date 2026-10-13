const { test } = require('node:test');
const assert = require('node:assert/strict');
const Capacity = require('../web/capacity.js');

const zone = { id: 't1-short-b1', name: '단기 지하1층' };
const fill = value => new Array(288).fill(value);
function fixture() {
  const days = new Map([
    ['2026-10-12', { zones: { [zone.id]: { c: fill(520) } } }],
    ['2026-10-13', { zones: { [zone.id]: { c: fill(520) } } }]
  ]);
  days.get('2026-10-13').zones[zone.id].c.fill(378, 203);
  return { days, zones: [zone], from: '2026-10-13', to: '2026-10-13', now: { date: '2026-10-13', idx: 213 } };
}

test('known restoration merges a single observed event with explicitly user-reported telephone provenance', () => {
  const events = Capacity.events(fixture());
  assert.equal(events.length, 1);
  assert.equal(events[0].date, '2026-10-13');
  assert.equal(events[0].idx, 203);
  assert.equal(events[0].from, 520);
  assert.equal(events[0].to, 378);
  assert.match(events[0].source, /사용자 전화 확인/);
  assert.match(events[0].source, /상황실\(전화 끝자리 7700/);
  assert.match(events[0].note, /일반 담당자가 아닌 상황실/);
  assert.match(events[0].note, /공개 공지 확인과는 구분/);
  assert.equal(Capacity.references[zone.id].capacity, 378);
});

test('no observed or documented future event leaks before the cutoff', () => {
  const input = fixture();
  input.now.idx = 202;
  assert.deepEqual(Capacity.events(input), []);
  input.now = { date: '2026-10-12', idx: 287 };
  assert.deepEqual(Capacity.events(input), []);
});

test('unknown subsequent changes preserve numbers and times without inventing a holiday explanation', () => {
  const input = fixture();
  input.days.get('2026-10-13').zones[zone.id].c.fill(600, 210);
  const events = Capacity.events(input);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => [event.idx, event.from, event.to]), [[203, 520, 378], [210, 378, 600]]);
  assert.equal(events[1].source, 'API 관측');
  assert.match(events[1].note, /사유는 확인되지/);
  assert.doesNotMatch(events[1].note, /극성수기|원복/);
});

test('previous-day capacity detects an event at midnight rather than inventing a starting capacity', () => {
  const input = fixture();
  input.days.get('2026-10-13').zones[zone.id].c.fill(378);
  const observed = Capacity.events(input).find(event => event.idx === 0);
  assert.deepEqual([observed.from, observed.to], [520, 378]);
  assert.equal(observed.source, 'API 관측', 'midnight is not the telephone-confirmed 16:55 event');
  assert.equal(Capacity.events(input).length, 1, 'conflicting complete observations must not invent the documented 16:55 transition');
});

test('missing capacity is not a zero or a transition, while an actual closure and reopening are events', () => {
  const input = fixture(), c = input.days.get('2026-10-13').zones[zone.id].c;
  c.fill(520); c[200] = null; c[201] = -1; c[202] = 1.5;
  c[203] = 520; c[204] = 0; c[205] = null; c.fill(520, 206);
  const events = Capacity.events(input);
  assert.deepEqual(events.map(event => [event.idx, event.from, event.to]), [[204, 520, 0], [206, 0, 520]]);
});

test('a conflicting observation does not acquire the known restoration reason', () => {
  const input = fixture();
  input.days.get('2026-10-13').zones[zone.id].c.fill(400, 203);
  const events = Capacity.events(input);
  assert.equal(events.length, 1);
  assert.equal(events[0].to, 400);
  assert.equal(events[0].source, 'API 관측');
});

test('selected zones and dates exclude unrelated capacity events and base references never override the API', () => {
  const input = fixture();
  assert.deepEqual(Capacity.events({ ...input, zones: [{ id: 't2-short-m', name: '단기 지하M층' }] }), []);
  assert.deepEqual(Capacity.events({ ...input, from: '2026-10-12', to: '2026-10-12' }), []);
  const before = JSON.stringify([...input.days]);
  Capacity.events(input);
  assert.equal(JSON.stringify([...input.days]), before);
  assert.equal(Capacity.references['t2-short-m'], undefined);
});

test('documented restoration remains available when older day files are not loaded, without duplicates', () => {
  const input = fixture();
  input.days.clear();
  const events = Capacity.events(input);
  assert.equal(events.length, 1);
  assert.equal(events[0].idx, 203);
  assert.equal(events[0].source, '사용자 전화 확인 · 상황실(전화 끝자리 7700, 2026-10-13)');
});

test('invalid intervals and cutoff inputs are rejected explicitly', () => {
  const input = fixture();
  for (const changes of [
    { from: '2026-02-30' }, { to: 'invalid' }, { from: '2026-10-14' },
    { now: { date: '2026-10-13', idx: 288 } }, { now: { date: 'invalid', idx: 203 } },
    { days: {} }, { zones: null }
  ]) assert.throws(() => Capacity.events({ ...input, ...changes }), /Capacity events require/);
});
