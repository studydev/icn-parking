const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const shared = path.join(root, 'mobile/shared');
const readJson = file => JSON.parse(fs.readFileSync(path.join(shared, file), 'utf8'));

test('mobile/shared 생성 파일이 원본과 같다', () => {
  const result = spawnSync(process.execPath, [path.join(shared, 'scripts/generate.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('앱 계산 픽스처가 최신이고 참조 구현이 웹 forecastOf·nowAgg·shNext와 같다', () => {
  const result = spawnSync(process.execPath, [path.join(shared, 'scripts/fixtures.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('앱 혼잡 단계 경계와 이름은 웹 occupancy.js bands와 같다', () => {
  const web = require('../web/occupancy.js');
  assert.deepEqual(readJson('tokens.json').bands.map(b => [b.min, b.label]), web.bands.map(([min, label]) => [min, label]));
});

test('앱 셔틀 시간표는 웹 shuttle.json 그대로다', () => {
  assert.equal(fs.readFileSync(path.join(shared, 'shuttle.json'), 'utf8'), fs.readFileSync(path.join(root, 'web/shuttle.json'), 'utf8'));
});

test('zones.json은 터미널마다 모든 구역을 한 번씩 화면에 배치한다', () => {
  const { zones, terminals } = readJson('zones.json');
  assert.equal(zones.length, 19);
  for (const [term, layout] of Object.entries(terminals)) {
    const placed = [...layout.floors, ...layout.tiles.map(t => t.id)].sort();
    assert.deepEqual(placed, zones.filter(z => z.terminal === term).map(z => z.id).sort(), term);
  }
});
