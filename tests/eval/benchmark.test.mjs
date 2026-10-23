import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drawPlanSvg, STYLES } from '../../eval/draw.mjs';
import { generatePlan, FAMILIES } from '../../eval/gen/gen-plans.mjs';
import { buildBenchmark } from '../../eval/make-benchmark.mjs';
import { reportBenchmark } from '../../eval/report.mjs';
import { validatePlan } from '../../src/core/validate.js';

const count = (s, re) => (s.match(re) ?? []).length;

test('the four styles exist and each draws every family without invalid numbers', () => {
  assert.deepEqual(STYLES, ['cad', 'hatched', 'sketch', 'scan']);
  for (const style of STYLES) {
    for (const f of FAMILIES) {
      const { plan } = generatePlan(FAMILIES.indexOf(f) + 1, f);
      const svg = drawPlanSvg(plan, { style });
      assert.ok(svg.trim().endsWith('</svg>') && svg.length > 3000, `${style} ${f}`);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${style} ${f} has an invalid number`);
      assert.equal(svg, drawPlanSvg(plan, { style }), `${style} ${f} is deterministic`);
    }
  }
});

test('each style carries what the SPEC says it carries', () => {
  const { plan } = generatePlan(7, 'duplex');
  const rooms = plan.levels.flatMap((l) => l.rooms.filter((r) => r.use !== 'other'));
  const cad = drawPlanSvg(plan, { style: 'cad' }), hatched = drawPlanSvg(plan, { style: 'hatched' });
  const sketch = drawPlanSvg(plan, { style: 'sketch' }), scan = drawPlanSvg(plan, { style: 'scan' });
  for (const svg of [cad, hatched, scan]) {
    assert.ok(svg.includes(`>${rooms[0].area.toFixed(1)} m²</text>`), 'printed areas');
    assert.equal(count(svg, /\d m<\/text>/g), 1, 'one dimension text');
  }
  assert.ok(hatched.includes('url(#hatch)') && count(hatched, /<ellipse /g) > count(cad, /<ellipse /g), 'hatch fill and furniture symbols');
  assert.ok(!sketch.includes('m²') && count(sketch, /\d m<\/text>/g) === 0, 'a sketch has no areas and no printed scale');
  assert.ok(sketch.includes('filter="url(#wob)"') && sketch.includes(`>${rooms[0].name}</text>`), 'shaken lines, names kept');
  const deg = Number(/rotate\((-?\d+\.\d+) /.exec(scan)[1]);
  assert.ok(Math.abs(deg) >= 1 && Math.abs(deg) <= 3, `scan rotation ${deg}`);
  assert.ok(!cad.includes('url(#hatch)') && !cad.includes('<filter'), 'cad stays clean');
});

test('the benchmark has opaque file names, a key, valid truth, and is deterministic', () => {
  const a = mkdtempSync(join(tmpdir(), 'pw-bench-a-')), b = mkdtempSync(join(tmpdir(), 'pw-bench-b-'));
  try {
    const ra = buildBenchmark({ seed: 401, count: 8, out: a, png: false });
    const rb = buildBenchmark({ seed: 401, count: 8, out: b, png: false });
    assert.deepEqual(ra, rb);
    assert.equal(new Set(ra.map((r) => r.code)).size, 8, 'codes are unique');
    assert.deepEqual([...new Set(ra.map((r) => r.style))].sort(), [...STYLES].sort(), 'styles rotate');
    const names = [...readdirSync(join(a, 'images')), ...readdirSync(join(a, 'truth'))];
    for (const n of names) {
      assert.match(n, /^p[0-9a-f]{4}\.(cad|hatched|sketch|scan)\.svg$|^p[0-9a-f]{4}\.plan\.json$/, n);
      for (const f of FAMILIES) assert.ok(!n.includes(f), `${n} gives away the family`);
    }
    const key = JSON.parse(readFileSync(join(a, 'key.json'), 'utf8'));
    assert.equal(key.length, 8);
    for (const k of key) {
      const truth = JSON.parse(readFileSync(join(a, 'truth', `${k.code}.plan.json`), 'utf8'));
      assert.deepEqual(validatePlan(truth).errors, [], k.code);
      const svg = readFileSync(join(a, 'images', `${k.code}.${k.style}.svg`), 'utf8');
      assert.ok(!svg.includes(String(truth.name)) && !svg.includes('synthetic') && !svg.includes(String(truth.meta.generator)), `${k.code} drawing leaks metadata`);
    }
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

test('the report scores readings against the truth: a copy of the truth gets 100, a missing reading 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-bench-r-'));
  try {
    buildBenchmark({ seed: 401, count: 3, out: dir, png: false });
    const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
    const reads = join(dir, 'reads');
    mkdirSync(reads);
    for (const k of key.slice(0, 2)) copyFileSync(join(dir, 'truth', `${k.code}.plan.json`), join(reads, `${k.code}.plan.json`));
    const { rows, summary } = reportBenchmark(dir, reads);
    assert.deepEqual(rows.map((r) => r.score.composite), [100, 100, 0]);
    assert.equal(rows[2].present, false);
    assert.equal(summary.n, 3);
    assert.equal(summary.composite, 66.7);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('zoom changes the picture size but not the drawing, and the key records it', () => {
  const { plan } = generatePlan(3, 'two-bedroom');
  const dims = (s) => [Number(/ width="(\d+)"/.exec(s)[1]), Number(/ height="(\d+)"/.exec(s)[1]), /viewBox="([^"]+)"/.exec(s)[1]];
  const [wa, ha, va] = dims(drawPlanSvg(plan, { style: 'sketch', zoom: 1 }));
  const [wb, hb, vb] = dims(drawPlanSvg(plan, { style: 'sketch', zoom: 1.5 }));
  assert.equal(va, vb, 'same viewBox');
  assert.equal(wb, Math.round(wa * 1.5));
  assert.equal(hb, Math.round(ha * 1.5));
  const dir = mkdtempSync(join(tmpdir(), 'pw-bench-z-'));
  try {
    buildBenchmark({ seed: 501, count: 6, out: dir, png: false, styles: ['sketch'], zoom: [0.7, 1.4] });
    const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
    assert.ok(key.every((k) => k.zoom >= 0.7 && k.zoom <= 1.4), 'zoom within range');
    assert.ok(new Set(key.map((k) => k.zoom)).size > 1, 'zoom differs between plans');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
