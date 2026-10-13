import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const IGoTo = createRequire(import.meta.url)('../web/forecast.js');
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function snapshotForecast({ latest, calendar, days }) {
  const timestamp = Date.parse(latest.last_ok_at);
  if (!Number.isFinite(timestamp)) throw new Error('Forecast snapshot requires a valid last_ok_at');
  const kst = new Date(timestamp + 9 * 3600000);
  const now = { date: kst.toISOString().slice(0, 10), idx: kst.getUTCHours() * 12 + Math.floor(kst.getUTCMinutes() / 5) };
  const end = addDays(now.date, IGoTo.MAX_FUTURE_DAYS);
  if (!Array.isArray(latest.zones) || !latest.zones.length) throw new Error('Forecast snapshot requires zone metadata');
  const zones = latest.zones.map(zone => {
    const model = IGoTo.fit({ days, zoneId: zone.id, category: zone.category, now, holidays: calendar.holidays });
    const metadata = { id: zone.id, name: zone.name, terminal: zone.terminal, category: zone.category, ok: model.ok };
    if (!model.ok) return { ...metadata, why: model.why };
    const predictions = {};
    for (let date = now.date; date <= end; date = addDays(date, 1)) {
      const occupancy = [], parking = [], limited = [];
      for (let hour = 0; hour < 24; hour++) {
        if (date === now.date && hour * 12 <= now.idx) { occupancy.push(null); parking.push(null); limited.push(null); continue; }
        const prediction = IGoTo.predict(model, date, hour * 12);
        if (prediction.value == null) throw new Error(`${zone.id} ${date}: ${prediction.why}`);
        occupancy.push(prediction.value);
        parking.push(prediction.parking);
        limited.push(prediction.limited);
      }
      predictions[date] = { occupancy, parking, limited };
    }
    return {
      ...metadata, capacity: model.anchor.capacity, anchor: { date: model.anchor.date, idx: model.anchor.idx },
      trainingDays: model.days, trainingHours: model.hours, observedCapacities: model.capacities,
      capacityChanged: model.capacityChanged, predictions
    };
  });
  if (zones.every(zone => !zone.ok)) throw new Error('Forecast snapshot has no usable models');
  return {
    v: 1, model: IGoTo.VERSION, snapshotLastOkAt: latest.last_ok_at,
    cutoffKst: `${now.date}T${String(Math.floor(now.idx / 12)).padStart(2, '0')}:${String(now.idx % 12 * 5).padStart(2, '0')}+09:00`,
    futureDays: IGoTo.MAX_FUTURE_DAYS, firstFutureDate: addDays(now.date, 1), lastFutureDate: end,
    slotConvention: 'KST hourly; array index 0=00:00, 23=23:00; current/past hours are null; parking is predicted demand; occupancy uses the reference operating capacity without the UI 100% cap',
    capacityAssumption: 'reference-operating-capacity-unchanged',
    comparisonStatus: 'pending-actual-data', zones
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: node scripts/snapshot-igoto.mjs SNAPSHOT_DIRECTORY OUTPUT.json');
  const directory = resolve(args[0]), latest = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'));
  const calendar = JSON.parse(await readFile(join(directory, 'calendar.json'), 'utf8'));
  const cutoff = new Date(Date.parse(latest.last_ok_at) + 9 * 3600000).toISOString().slice(0, 10);
  const first = addDays(cutoff, 1 - IGoTo.HISTORY_DAYS), days = new Map(), snapshotDayHashes = {};
  for (const date of Object.keys(calendar.days).filter(date => date >= first && date <= cutoff).sort()) {
    const text = await readFile(join(directory, 'days', date + '.json'), 'utf8');
    days.set(date, JSON.parse(text));
    snapshotDayHashes[date] = sha256(text);
  }
  const result = snapshotForecast({ latest, calendar, days });
  result.modelSha256 = sha256(await readFile(new URL('../web/forecast.js', import.meta.url)));
  result.snapshotDayHashes = snapshotDayHashes;
  result.calendarSha256 = sha256(JSON.stringify(calendar.holidays));
  const text = JSON.stringify(result, null, 2).replace(/\[\n(?:\s*(?:null|true|false|\d+(?:\.\d+)?(?:e[+-]?\d+)?),?\n)+\s*\]/g, array => JSON.stringify(JSON.parse(array)));
  await writeFile(resolve(args[1]), text + '\n', { flag: 'wx' });
  console.log(`Frozen forecast saved at ${result.cutoffKst}: ${result.zones.filter(zone => zone.ok).length} zones through ${result.lastFutureDate}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); } catch (error) { console.error(`Forecast snapshot failed: ${error.message}`); process.exitCode = 1; }
}
