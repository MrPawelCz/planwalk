// Scores a set of readings against a benchmark directory made by eval/make-benchmark.mjs.
// Usage: node eval/report.mjs <benchmark-dir> <readings-dir> [--md] [--json]
// <readings-dir> holds <code>.plan.json for each code in <benchmark-dir>/key.json. A missing or unparsable reading scores 0.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scorePlans } from './score.mjs';

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const r1 = (v) => Math.round(v * 10) / 10;

export function reportBenchmark(benchDir, readingsDir) {
  const key = JSON.parse(readFileSync(join(benchDir, 'key.json'), 'utf8'));
  const rows = key.map((k) => {
    const truth = JSON.parse(readFileSync(join(benchDir, 'truth', `${k.code}.plan.json`), 'utf8'));
    const file = join(readingsDir, `${k.code}.plan.json`);
    let pred = null;
    if (existsSync(file)) { try { pred = JSON.parse(readFileSync(file, 'utf8')); } catch { pred = null; } }
    return { ...k, present: pred !== null, score: scorePlans(truth, pred) };
  });
  const styles = [...new Set(rows.map((r) => r.style))];
  const perStyle = styles.map((s) => {
    const rs = rows.filter((r) => r.style === s);
    return { style: s, n: rs.length, composite: r1(mean(rs.map((r) => r.score.composite))) };
  });
  const comps = rows.map((r) => r.score.composite);
  const summary = {
    n: rows.length, styles: styles.length, composite: r1(mean(comps)), min: Math.min(...comps), max: Math.max(...comps),
    roomF1: r1(100 * mean(rows.map((r) => r.score.rooms.f1))), meanIoU: r1(100 * mean(rows.map((r) => r.score.rooms.meanIoU))),
    openingsF1: r1(100 * mean(rows.map((r) => r.score.openings.f1))), connectivityF1: r1(100 * mean(rows.map((r) => r.score.connectivityF1))),
    perStyle,
  };
  return { rows, summary };
}

function markdown({ rows, summary }) {
  const pct = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}`);
  const lines = ['| code | style | family | composite | rooms matched | room F1 | mean IoU | area error % | openings F1 | connectivity F1 | valid | scale error % |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |'];
  for (const r of rows) {
    const s = r.score;
    lines.push(`| ${r.code} | ${r.style} | ${r.family} | ${s.composite} | ${s.rooms.matched}/${s.rooms.truth} | ${pct(s.rooms.f1)} | ${pct(s.rooms.meanIoU)} | ${s.rooms.areaMapePct ?? 'n/a'} | ${pct(s.openings.f1)} | ${pct(s.connectivityF1)} | ${s.valid ? 'yes' : 'no'} | ${s.scaleErrorPct ?? 'n/a'} |`);
  }
  lines.push('', `Mean composite ${summary.composite} / 100 over ${summary.n} plans in ${summary.styles} styles (min ${summary.min}, max ${summary.max}). Per style: ${summary.perStyle.map((p) => `${p.style} ${p.composite} (n=${p.n})`).join(', ')}.`,
    `Means over plans: room F1 ${summary.roomF1}, mean IoU ${summary.meanIoU}, openings F1 ${summary.openingsF1}, connectivity F1 ${summary.connectivityF1} (all in percent).`);
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) { process.stderr.write('usage: node eval/report.mjs <benchmark-dir> <readings-dir> [--md] [--json]\n'); process.exit(2); }
  const res = reportBenchmark(files[0], files[1]);
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  else process.stdout.write(markdown(res));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
