const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const IGoTo = require('../web/forecast.js');
const snapshotModule = import('../scripts/snapshot-igoto.mjs');
const root = path.join(__dirname, '..');
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function fixture() {
  const latest = {
    last_ok_at: '2026-10-11T03:00:00Z',
    zones: [{ id: 'long', name: '장기 P1', terminal: 'T1', category: '장기' }]
  };
  const calendar = {
    days: {}, holidays: { '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날' }
  };
  const days = new Map();
  for (let date = '2026-10-01'; date <= '2026-10-18'; date = addDays(date, 1)) {
    calendar.days[date] = {};
    days.set(date, { date, zones: { long: { p: new Array(288).fill(105), c: new Array(288).fill(100) } } });
  }
  return { latest, calendar, days };
}

test('snapshot freezes hourly raw predictions at the last successful KST slot, not the run time', async () => {
  const { snapshotForecast } = await snapshotModule, input = fixture();
  const result = snapshotForecast(input);
  const model = IGoTo.fit({ days: input.days, zoneId: 'long', category: '장기', now: { date: '2026-10-11', idx: 144 }, holidays: input.calendar.holidays });
  assert.equal(result.cutoffKst, '2026-10-11T12:00+09:00');
  assert.equal(result.firstFutureDate, '2026-10-12');
  assert.equal(result.lastFutureDate, '2026-10-18');
  assert.equal(result.comparisonStatus, 'pending-actual-data');
  assert.deepEqual(result.zones[0].anchor, { date: '2026-10-11', idx: 144 });
  for (const [date, day] of Object.entries(result.zones[0].predictions)) {
    assert.equal(day.occupancy.length, 24);
    assert.equal(day.limited.length, 24);
    for (let hour = 0; hour < 24; hour++) {
      if (date === '2026-10-11' && hour <= 12) {
        assert.equal(day.occupancy[hour], null);
        assert.equal(day.limited[hour], null);
      } else {
        const expected = IGoTo.predict(model, date, hour * 12);
        assert.equal(day.occupancy[hour], expected.value);
        assert.equal(day.limited[hour], expected.limited);
      }
    }
  }
  assert(result.zones[0].predictions['2026-10-12'].occupancy[0] > 1, 'raw forecasts must not use the UI cap');
});

test('snapshot ignores future observations and reports unusable zones rather than fabricating forecasts', async () => {
  const { snapshotForecast } = await snapshotModule, input = fixture();
  const before = snapshotForecast(input);
  for (const [date, doc] of input.days) {
    if (date < '2026-10-11') continue;
    doc.zones.long.p.fill(999, date === '2026-10-11' ? 145 : 0);
    doc.zones.long.c.fill(7, date === '2026-10-11' ? 145 : 0);
  }
  assert.deepEqual(snapshotForecast(input), before);
  input.latest.zones.push({ id: 'closed', name: '닫힌 구역', terminal: 'T1', category: '장기' });
  const unavailable = snapshotForecast(input).zones.find(zone => zone.id === 'closed');
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.why, /실측이 없어/);
  assert.equal(unavailable.predictions, undefined);
  assert.throws(() => snapshotForecast({ ...input, calendar: { holidays: {} } }), /no usable models/);
  assert.throws(() => snapshotForecast({ ...input, latest: { last_ok_at: 'invalid', zones: [] } }), /valid last_ok_at/);
});

test('snapshot command records source hashes and refuses to overwrite a frozen baseline', async t => {
  const input = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parking-forecast-snapshot-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'days'));
  fs.writeFileSync(path.join(directory, 'latest.json'), JSON.stringify(input.latest));
  fs.writeFileSync(path.join(directory, 'calendar.json'), JSON.stringify(input.calendar));
  for (const [date, doc] of input.days) fs.writeFileSync(path.join(directory, 'days', date + '.json'), JSON.stringify(doc));
  const output = path.join(directory, 'baseline.json');
  const command = () => spawnSync(process.execPath, [path.join(root, 'scripts/snapshot-igoto.mjs'), directory, output], { encoding: 'utf8', timeout: 30000 });
  const first = command();
  assert.equal(first.status, 0, first.stderr);
  const contents = fs.readFileSync(output, 'utf8'), result = JSON.parse(contents);
  assert.match(result.modelSha256, /^[a-f0-9]{64}$/);
  assert.match(result.calendarSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.keys(result.snapshotDayHashes).length, 11);
  const second = command();
  assert.equal(second.status, 1);
  assert.match(second.stderr, /Forecast snapshot failed:.*EEXIST/);
  assert.equal(fs.readFileSync(output, 'utf8'), contents);
});

test('published baseline preserves seven full future days for all zones and leaves actual comparison pending', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/forecast-baseline-2026-10-11.json'), 'utf8'));
  assert.equal(baseline.snapshotLastOkAt, '2026-10-11T03:00:00Z');
  assert.equal(baseline.cutoffKst, '2026-10-11T12:00+09:00');
  assert.equal(baseline.comparisonStatus, 'pending-actual-data');
  assert.equal(baseline.zones.length, 19);
  assert.equal(new Set(baseline.zones.map(zone => zone.id)).size, 19);
  let futureSamples = 0;
  for (const zone of baseline.zones) {
    assert.equal(zone.ok, true);
    assert(zone.capacity > 0);
    for (let date = baseline.firstFutureDate; date <= baseline.lastFutureDate; date = addDays(date, 1)) {
      const day = zone.predictions[date];
      assert.equal(day.occupancy.length, 24);
      assert.equal(day.limited.length, 24);
      assert(day.occupancy.every(value => Number.isFinite(value) && value >= 0));
      assert(day.limited.every(value => typeof value === 'boolean'));
      futureSamples += day.occupancy.length;
    }
  }
  assert.equal(futureSamples, 19 * 7 * 24);
  assert.doesNotMatch(JSON.stringify(baseline), /https?:\/\/|\/subscriptions\/|apiKey|serviceKey/);
});
