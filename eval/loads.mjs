// Counts how many stored readings load, in the two senses of "load" used in docs/BENCHMARK.md ("Runs by model").
// Usage: node eval/loads.mjs [<run dir> ...] [--json]       (no run dir: every folder under eval/results/)
// A run folder holds the extracted plans of one run: readings/*.plan.json (run A, eight plans) and readings-sketch-zoom/*.plan.json (run B,
// four sketches). A set that a run did not read is absent and not counted. Per run:
//   strict   no validator error with { strict: true }, where a property the schema does not know is an error. This is the old "Loads" column
//            and the rule eval/score.mjs applies: what a perfect answer achieves.
//   viewer   a model is shown: analyzePlan with the default options and modelOf(result) is not null. That is a clean model, a model with
//            warnings only, a model with the errors listed next to it, or a partial model built from the rest of the plan with the skipped
//            elements named in a banner.
// Everything is deterministic and local; no network.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePlan, modelOf } from '../src/core/validate.js';

const SETS = ['readings', 'readings-sketch-zoom'];
export const RESULTS_DIR = fileURLToPath(new URL('./results/', import.meta.url));

function stored(runDir) {
  const out = [];
  for (const set of SETS) {
    const dir = join(runDir, set);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.plan.json')).sort()) out.push({ set, code: f.replace(/\.plan\.json$/, ''), file: join(dir, f) });
  }
  return out;
}

const codesOf = (issues) => [...new Set(issues.map((i) => i.code))];

// One plan text: does it load strictly, and what does the viewer show for it.
export function inspectPlan(text) {
  const strict = analyzePlan(text, { strict: true });
  const res = analyzePlan(text);
  const model = modelOf(res) !== null;
  let shown = 'none';
  if (model) shown = res.partial === true ? 'partial' : res.errors.length ? 'errors' : res.warnings.length ? 'warnings' : 'clean';
  const skipped = model && Array.isArray(res.skipped) ? res.skipped.map((s) => ({ kind: s.kind, id: s.id })) : [];
  return { strict: strict.ok, strictErrorCodes: codesOf(strict.errors), shown, errorCodes: codesOf(res.errors), warningCodes: codesOf(res.warnings), skipped };
}

export function loadsOfRun(runDir) {
  const plans = stored(runDir).map(({ set, code, file }) => ({ set, code, ...inspectPlan(readFileSync(file, 'utf8')) }));
  const count = (k) => plans.filter((p) => p.shown === k).length;
  const skipped = plans.flatMap((p) => p.skipped);
  const skippedKinds = {};
  for (const s of skipped) skippedKinds[s.kind] = (skippedKinds[s.kind] || 0) + 1;
  return {
    run: basename(resolve(runDir)), plans: plans.length, strict: plans.filter((p) => p.strict).length, viewer: plans.filter((p) => p.shown !== 'none').length,
    clean: count('clean'), warningsOnly: count('warnings'), errorsListed: count('errors'), partial: count('partial'), skipped: skipped.length, skippedKinds, perPlan: plans,
  };
}

export function loadsOfRuns(resultsDir = RESULTS_DIR) {
  return readdirSync(resultsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().map((n) => loadsOfRun(join(resultsDir, n)));
}

export const skippedText = (r) => (r.skipped === 0 ? '0' : `${r.skipped} (${Object.entries(r.skippedKinds).map(([k, n]) => `${k} ${n}`).join(', ')})`);

export function markdown(runs) {
  const lines = ['| Run | Plans read | Loads (strict) | Loads in the viewer | Clean | Warnings only | Errors listed | Partial | Skipped elements |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const r of runs) lines.push(`| \`${r.run}\` | ${r.plans} | ${r.strict}/${r.plans} | ${r.viewer}/${r.plans} | ${r.clean} | ${r.warningsOnly} | ${r.errorsListed} | ${r.partial} | ${skippedText(r)} |`);
  const differ = runs.flatMap((r) => r.perPlan.filter((p) => p.strict !== (p.shown !== 'none') || p.shown === 'partial').map((p) => ({ run: r.run, ...p })));
  if (differ.length) {
    lines.push('', 'Plans that do not load strictly but are shown by the viewer, or are shown partially, or are not shown at all:');
    for (const p of differ) {
      const detail = [`strict errors ${p.strictErrorCodes.join(' ') || 'none'}`, `viewer: ${p.shown}`, p.errorCodes.length ? `errors ${p.errorCodes.join(' ')}` : '', p.warningCodes.length ? `warnings ${p.warningCodes.join(' ')}` : '',
        p.skipped.length ? `skipped ${p.skipped.map((s) => `${s.kind} ${s.id}`).join(', ')}` : ''].filter(Boolean);
      lines.push(`- ${p.run} ${p.code} (${p.set}): ${detail.join('; ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const dirs = argv.filter((a) => !a.startsWith('--')).map((d) => resolve(d));
  for (const d of dirs) if (!existsSync(d)) { process.stderr.write(`no such folder: ${d}\n`); process.exit(2); }
  const runs = dirs.length ? dirs.map(loadsOfRun) : loadsOfRuns();
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
  else process.stdout.write(markdown(runs));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
