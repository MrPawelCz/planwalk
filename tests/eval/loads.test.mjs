import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPlan, loadsOfRun, loadsOfRuns, markdown, skippedText, RESULTS_DIR } from '../../eval/loads.mjs';
import { buildBenchmark } from '../../eval/make-benchmark.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flat = () => JSON.parse(readFileSync(join(root, 'examples/flat-1.plan.json'), 'utf8'));
const doc = readFileSync(join(root, 'docs/BENCHMARK.md'), 'utf8').split('\n');
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());

// The rows of the table in docs/BENCHMARK.md whose header line starts with `header`, as arrays of cells (and the header cells).
function table(header) {
  const i = doc.findIndex((l) => l.startsWith(header));
  assert.ok(i >= 0, `docs/BENCHMARK.md has a table that starts with ${header}`);
  const rows = [];
  for (let k = i + 2; k < doc.length && doc[k].startsWith('|'); k++) rows.push(cells(doc[k]));
  return { head: cells(doc[i]), rows };
}

test('the strict counts are the "Loads" column of docs/BENCHMARK.md in every row', () => {
  const main = table('| Model | Prompt | Route | Plans read |');
  const viewer = table('| Model, prompt | Run folder |');
  assert.equal(main.rows.length, viewer.rows.length, 'one viewer row per row of "Runs by model"');
  const loads = main.head.indexOf('Loads'), read = main.head.indexOf('Plans read');
  assert.ok(loads > 0 && read > 0);
  main.rows.forEach((row, i) => {
    const r = loadsOfRun(join(RESULTS_DIR, viewer.rows[i][1].replace(/`/g, '')));
    assert.equal(row[loads], `${r.strict}/${r.plans}`, `${r.run}: Loads`);
    assert.equal(row[read].split('/')[0], String(r.plans), `${r.run}: plans read`);
  });
});

test('the strict counts agree with the validator counts stored by the run (summary.json) where there are any', () => {
  let checked = 0;
  for (const r of loadsOfRuns()) {
    let summary;
    try { summary = JSON.parse(readFileSync(join(RESULTS_DIR, r.run, 'summary.json'), 'utf8')); } catch { continue; }
    assert.equal(r.strict, summary.plansLoadingWithoutErrors, r.run);
    assert.equal(r.plans, summary.plansExtracted, r.run);
    checked++;
  }
  assert.ok(checked >= 9, `${checked} runs have a summary.json`);
});

test('the viewer table of docs/BENCHMARK.md shows what eval/loads.mjs computes', () => {
  const { rows } = table('| Model, prompt | Run folder |');
  assert.ok(rows.length >= 10);
  for (const row of rows) {
    const r = loadsOfRun(join(RESULTS_DIR, row[1].replace(/`/g, '')));
    assert.deepEqual(row.slice(2), [String(r.plans), `${r.strict}/${r.plans}`, `${r.viewer}/${r.plans}`, String(r.clean), String(r.warningsOnly), String(r.errorsListed), String(r.partial), skippedText(r)], r.run);
    assert.equal(r.clean + r.warningsOnly + r.errorsListed + r.partial, r.viewer, `${r.run}: the four kinds add up to the plans that are shown`);
    assert.ok(r.strict <= r.viewer && r.viewer <= r.plans, r.run);
  }
});

test('a stray property: not loaded strictly, shown by the viewer with a warning', () => {
  const plan = flat();
  plan.levels[0].rooms[0].furniture = [{ id: 'x', type: 'bed' }]; // furniture belongs to the level, not to a room
  const r = inspectPlan(JSON.stringify(plan));
  assert.equal(r.strict, false);
  assert.deepEqual(r.strictErrorCodes, ['E002']);
  assert.equal(r.shown, 'warnings');
  assert.deepEqual(r.errorCodes, []);
  assert.ok(r.warningCodes.includes('W116'), r.warningCodes.join(' '));
  assert.deepEqual(inspectPlan(JSON.stringify(flat())).shown, 'clean');
});

test('counts per run folder: clean, warnings only, partial with the skipped elements, and not shown at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-loads-'));
  try {
    mkdirSync(join(dir, 'readings')); mkdirSync(join(dir, 'readings-sketch-zoom'));
    const stray = flat();
    stray.levels[0].rooms[0].furniture = [];
    const zero = flat();
    zero.levels[0].openings.find((o) => o.id === 'front').width = 0; // a schema error on one opening only
    writeFileSync(join(dir, 'readings', 'p0001.plan.json'), JSON.stringify(flat()));
    writeFileSync(join(dir, 'readings', 'p0002.plan.json'), JSON.stringify(stray));
    writeFileSync(join(dir, 'readings-sketch-zoom', 'p0003.plan.json'), JSON.stringify(zero));
    writeFileSync(join(dir, 'readings-sketch-zoom', 'p0004.plan.json'), 'this is not a plan');
    writeFileSync(join(dir, 'readings', 'notes.txt'), 'ignored: not a plan file');
    const r = loadsOfRun(dir);
    assert.equal(r.plans, 4);
    assert.equal(r.strict, 1, 'only the clean plan loads strictly');
    assert.equal(r.viewer, 3, 'the viewer shows all but the text that is not JSON');
    assert.deepEqual([r.clean, r.warningsOnly, r.errorsListed, r.partial], [1, 1, 0, 1]);
    assert.equal(r.skipped, 1);
    assert.deepEqual(r.skippedKinds, { opening: 1 });
    assert.equal(skippedText(r), '1 (opening 1)');
    assert.deepEqual(r.perPlan.map((p) => [p.code, p.strict, p.shown]), [['p0001', true, 'clean'], ['p0002', false, 'warnings'], ['p0003', false, 'partial'], ['p0004', false, 'none']]);
    const text = markdown([r]);
    assert.match(text, /\| 4 \| 1\/4 \| 3\/4 \| 1 \| 1 \| 0 \| 1 \| 1 \(opening 1\) \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the CLI prints the table and, with --json, the same counts', () => {
  const text = spawnSync(process.execPath, [`${root}eval/loads.mjs`], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /\| Run \| Plans read \| Loads \(strict\) \| Loads in the viewer \|/);
  const json = spawnSync(process.execPath, [`${root}eval/loads.mjs`, `${RESULTS_DIR}2026-10-23-claude-sonnet-5-5-v3`, '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  const [r] = JSON.parse(json.stdout);
  assert.equal(r.run, '2026-10-23-claude-sonnet-5-5-v3');
  assert.deepEqual(r, JSON.parse(JSON.stringify(loadsOfRun(`${RESULTS_DIR}2026-10-23-claude-sonnet-5-5-v3`))));
  assert.equal(spawnSync(process.execPath, [`${root}eval/loads.mjs`, `${root}no-such-folder`], { encoding: 'utf8' }).status, 2);
});

// The scorer validates in strict mode, so a change of the validator that is not strict must not move any stored score.
test('every stored run folder is scored again to the byte (scores.md and scores-sketch-zoom.md) by the current scorer', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'pw-rescore-'));
  try {
    buildBenchmark({ seed: 401, count: 8, out: join(tmp, 'bench-401'), png: false });
    buildBenchmark({ seed: 501, count: 4, out: join(tmp, 'bench-501'), png: false, styles: ['sketch'], zoom: [0.7, 1.4] });
    let n = 0;
    for (const run of readdirSync(RESULTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      for (const [bench, readings, scores] of [['bench-401', 'readings', 'scores.md'], ['bench-501', 'readings-sketch-zoom', 'scores-sketch-zoom.md']]) {
        const res = spawnSync(process.execPath, [`${root}eval/report.mjs`, join(tmp, bench), join(RESULTS_DIR, run, readings)], { encoding: 'utf8' });
        assert.equal(res.status, 0, res.stderr);
        assert.equal(res.stdout, readFileSync(join(RESULTS_DIR, run, scores), 'utf8'), `${run}/${scores}`);
        n++;
      }
    }
    assert.ok(n >= 20, `${n} score files compared`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
