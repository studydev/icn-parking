import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const IGoTo = createRequire(import.meta.url)('../web/forecast.js');
const DAY_MS = 864e5, DAY = 288;
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const time = (date, idx) => Date.parse(date + 'T00:00:00Z') + idx * 300000;
const atTime = value => { const date = new Date(value).toISOString().slice(0, 10); return { date, idx: Math.round((value - Date.parse(date)) / 300000) }; };
const score = () => ({ n: 0, absolute: 0, squared: 0, tp: 0, fp: 0, fn: 0 });
function record(out, predicted, actual) {
  out.n++;
  out.absolute += Math.abs(predicted - actual);
  out.squared += (predicted - actual) ** 2;
  if (predicted >= 0.98 && actual >= 0.98) out.tp++;
  if (predicted >= 0.98 && actual < 0.98) out.fp++;
  if (predicted < 0.98 && actual >= 0.98) out.fn++;
}
function summary(out) {
  return {
    samples: out.n, maePp: out.n ? +(out.absolute / out.n * 100).toFixed(3) : null,
    rmsePp: out.n ? +(Math.sqrt(out.squared / out.n) * 100).toFixed(3) : null,
    nearFullPrecision: out.tp + out.fp ? +(out.tp / (out.tp + out.fp)).toFixed(3) : null,
    nearFullRecall: out.tp + out.fn ? +(out.tp / (out.tp + out.fn)).toFixed(3) : null
  };
}

async function main() {
  const args = process.argv.slice(2), options = {};
  if (args.length % 2) throw new Error('Usage: node scripts/backtest-igoto.mjs --data-directory DIR --from YYYY-MM-DD --to YYYY-MM-DD [--output FILE]');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--data-directory', '--from', '--to', '--output'].includes(args[i]) || options[args[i]]) throw new Error(`Unsupported or duplicate option: ${args[i]}`);
    options[args[i]] = args[i + 1];
  }
  if (!options['--data-directory'] || !options['--from'] || !options['--to']) throw new Error('Set --data-directory, --from, and --to');
  const from = options['--from'], to = options['--to'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || addDays(from, 0) !== from || addDays(to, 0) !== to || from > to) {
    throw new Error('Backtest requires a valid ordered date range');
  }
  const directory = resolve(options['--data-directory']), read = async file => JSON.parse(await readFile(join(directory, file), 'utf8'));
  const latest = await read('latest.json'), calendar = await read('calendar.json');
  const cutoffTime = Date.parse(latest.last_ok_at) + 9 * 3600000;
  if (!Number.isFinite(cutoffTime)) throw new Error('Snapshot latest.json must have a valid last_ok_at');
  const asOf = atTime(cutoffTime), days = new Map(), hashes = {};
  for (const date of Object.keys(calendar.days).filter(date => date >= addDays(from, -IGoTo.HISTORY_DAYS) && date <= to && date <= asOf.date).sort()) {
    const text = await readFile(join(directory, 'days', date + '.json'), 'utf8');
    days.set(date, JSON.parse(text));
    hashes[date] = createHash('sha256').update(text).digest('hex');
  }
  const value = (zoneId, date, idx, cutoff = cutoffTime) => {
    if (time(date, idx) > cutoff) return null;
    const z = days.get(date)?.zones[zoneId], p = z?.p[idx], c = z?.c[idx];
    return Number.isFinite(p) && p >= 0 && c > 0 ? p / c : null;
  };
  const all = { igoto: score(), persistence: score() }, common = { igoto: score(), linked: score(), previousWeek: score(), persistence: score() };
  const groups = {}, byTargetDate = {}, byLead = {}, byCondition = {};
  let origins = 0, skippedModels = 0, limitedSamples = 0;
  for (let date = from; date <= to && date <= asOf.date; date = addDays(date, 1)) {
    for (const idx of [0, 72, 144, 216]) {
      const cutoff = time(date, idx);
      if (cutoff > cutoffTime) continue;
      origins++;
      for (const zone of latest.zones) {
        const model = IGoTo.fit({ days, zoneId: zone.id, category: zone.category, now: { date, idx }, holidays: calendar.holidays });
        if (!model.ok) { skippedModels++; continue; }
        const anchorTime = time(model.anchor.date, model.anchor.idx);
        const previousAnchor = value(zone.id, addDays(model.anchor.date, -7), model.anchor.idx, cutoff);
        for (let hours = 1; hours <= 168; hours++) {
          const target = atTime(anchorTime + hours * 3600000);
          if (target.date > to || time(target.date, target.idx) > cutoffTime) break;
          const actual = value(zone.id, target.date, target.idx);
          if (actual == null) continue;
          const prediction = IGoTo.predict(model, target.date, target.idx);
          if (prediction.value == null) continue;
          record(all.igoto, prediction.value, actual);
          record(all.persistence, model.anchor.value, actual);
          if (prediction.limited) limitedSamples++;
          const group = zone.terminal + '/' + (['장기', '타워'].includes(zone.category) ? '장기·타워' : zone.category);
          const lead = hours <= 24 ? '1–24h' : hours <= 72 ? '25–72h' : '73–168h';
          const context = prediction.context;
          const condition = context.departure && target.idx >= 144 ? '연휴 전날 오후' : context.kind;
          for (const [table, key] of [[groups, group], [byTargetDate, target.date], [byLead, lead], [byCondition, condition]]) {
            const scores = table[key] ||= { igoto: score(), persistence: score(), commonIgoto: score(), linked: score() };
            record(scores.igoto, prediction.value, actual);
            record(scores.persistence, model.anchor.value, actual);
          }
          const previous = value(zone.id, addDays(target.date, -7), target.idx, cutoff);
          if (previous == null || previousAnchor == null) continue;
          const linked = Math.max(0, previous + model.anchor.value - previousAnchor);
          record(common.igoto, prediction.value, actual);
          record(common.linked, linked, actual);
          record(common.previousWeek, previous, actual);
          record(common.persistence, model.anchor.value, actual);
          for (const [table, key] of [[groups, group], [byTargetDate, target.date], [byLead, lead], [byCondition, condition]]) {
            record(table[key].commonIgoto, prediction.value, actual);
            record(table[key].linked, linked, actual);
          }
        }
      }
    }
  }
  if (!all.igoto.n) throw new Error('No evaluable IGoTo forecasts; inspect snapshot coverage and holiday data');
  const summarizeTable = table => Object.fromEntries(Object.entries(table).map(([key, scores]) => [key, Object.fromEntries(Object.entries(scores).map(([name, result]) => [name, summary(result)]))]));
  const result = {
    model: 'IGoTo calendar ridge v1', from, to, snapshotLastOkAt: latest.last_ok_at, origins, skippedModels, limitedSamples,
    protocol: 'KST origins every 6h; fit only at/before origin; evaluate hourly targets 1–168h ahead available at snapshot cutoff; raw p/c; identical samples for each paired comparison; overlapping origins are not independent',
    snapshotDayHashes: hashes,
    overall: summarizeTable({ all, common }),
    byGroup: summarizeTable(groups), byTargetDate: summarizeTable(byTargetDate), byLead: summarizeTable(byLead), byCondition: summarizeTable(byCondition)
  };
  const text = JSON.stringify(result, null, 2) + '\n';
  if (options['--output']) await writeFile(resolve(options['--output']), text);
  console.log(text);
}

try { await main(); } catch (error) { console.error(`IGoTo backtest failed: ${error.message}`); process.exitCode = 1; }
