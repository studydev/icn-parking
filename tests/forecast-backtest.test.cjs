const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const IGoTo = require('../web/forecast.js');

test('backtest separates unknown future capacity changes from parked-demand errors without using the later denominator', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parking-capacity-backtest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'days'));
  const calendar = { days: {}, holidays: { '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날' } };
  for (let day = 1; day <= 13; day++) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    const c = new Array(288).fill(520);
    if (day === 13) c.fill(378, 203);
    const doc = { date, zones: { short: { p: new Array(288).fill(430), c } } };
    calendar.days[date] = {};
    fs.writeFileSync(path.join(directory, 'days', date + '.json'), JSON.stringify(doc));
  }
  fs.writeFileSync(path.join(directory, 'calendar.json'), JSON.stringify(calendar));
  fs.writeFileSync(path.join(directory, 'latest.json'), JSON.stringify({
    last_ok_at: '2026-10-13T08:45:00Z', zones: [{ id: 'short', terminal: 'T1', category: '단기' }]
  }));
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '../scripts/backtest-igoto.mjs'),
    '--data-directory', directory, '--from', '2026-10-01', '--to', '2026-10-13'
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.model, IGoTo.VERSION);
  assert.match(report.modelSha256, /^[a-f0-9]{64}$/);
  assert.match(report.protocol, /never future observed capacity/);
  assert(report.byFutureCapacity.unchanged.igoto.samples > 100);
  const changed = report.byFutureCapacity.changed;
  assert(changed.igoto.samples > 0);
  assert(changed.igoto.maePp > 25, 'a denominator change is not knowable at earlier forecast origins');
  assert(changed.demand.igoto.maeCars < .1, 'constant parked demand must not appear to jump because capacity changes');
  assert.equal(changed.demand.igoto.samples, changed.igoto.samples);
  assert(changed.linked.samples > 0);
  assert(changed.demand.linked.maeCars < .1);
});
