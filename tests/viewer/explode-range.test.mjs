import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel, modelExtent, modelRangeExtent } from '../../viewer/src/geometry.js';

const modelOf = (p) => buildModel(validatePlan(JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'))).normalized);
const PLANS = ['examples/flat-1.plan.json', 'examples/duplex-1.plan.json', 'tests/fixtures/duplex-min.plan.json', 'tests/fixtures/flat-stairs-out.plan.json'];
const SIDES = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];

test('the range extent holds the model at every explode factor, whatever the plan', () => {
  for (const p of PLANS) {
    const m = modelOf(p), range = modelRangeExtent(m);
    for (let k = 0; k <= 20; k++) {
      const e = modelExtent(m, k / 20);
      for (const s of ['minX', 'minY', 'minZ']) assert.ok(range[s] <= e[s] + 1e-9, `${p} ${s} at ${k / 20}`);
      for (const s of ['maxX', 'maxY', 'maxZ']) assert.ok(range[s] >= e[s] - 1e-9, `${p} ${s} at ${k / 20}`);
    }
  }
});

test('the range extent touches the extent at rest and the extent at full explode, and nothing beyond them', () => {
  for (const p of PLANS) {
    const m = modelOf(p), range = modelRangeExtent(m), rest = modelExtent(m, 0), full = modelExtent(m, 1);
    for (const s of SIDES) {
      const lo = s.startsWith('min');
      assert.equal(range[s], lo ? Math.min(rest[s], full[s]) : Math.max(rest[s], full[s]), `${p} ${s}`);
    }
  }
});

test('a plan with one level is framed on the extent at rest, a plan with two levels on a taller one that starts at the same floor', () => {
  const flat = modelOf('examples/flat-1.plan.json');
  assert.deepEqual(modelRangeExtent(flat), modelExtent(flat, 0));
  const duplex = modelOf('examples/duplex-1.plan.json'), rest = modelExtent(duplex, 0), range = modelRangeExtent(duplex);
  assert.equal(range.minY, rest.minY, 'the ground floor stays where it is');
  assert.ok(range.maxY - rest.maxY > 2, `the top rises by ${range.maxY - rest.maxY} m`);
  for (const s of ['minX', 'maxX', 'minZ', 'maxZ']) assert.equal(range[s], rest[s], 'the footprint does not change');
});

// The two-level example with copies of its upper level on top (no plan in the repository has more than two levels).
function manyLevels(n) {
  const plan = JSON.parse(readFileSync(new URL('../../examples/duplex-1.plan.json', import.meta.url), 'utf8'));
  for (let i = 2; i < n; i++) plan.levels.push({ ...structuredClone(plan.levels[1]), id: `L${i}`, name: `Level ${i}` });
  const res = validatePlan(plan);
  assert.deepEqual(res.errors, [], 'the plan is valid');
  return buildModel(res.normalized);
}

test('three and four levels: the range starts at the ground floor and ends at the top of the last level at full explode', () => {
  for (const n of [3, 4]) {
    const m = manyLevels(n), rest = modelExtent(m, 0), full = modelExtent(m, 1), range = modelRangeExtent(m);
    assert.equal(m.levels.length, n);
    assert.equal(range.minY, rest.minY, `${n} levels: the ground floor stays where it is`);
    assert.equal(range.maxY, full.maxY, `${n} levels: the top is the top at full explode`);
    const below = m.levels.slice(0, -1).reduce((s, lv) => s + lv.height, 0);
    assert.ok(Math.abs(full.maxY - rest.maxY - 1.2 * below) < 1e-9, `${n} levels: the top rises by 1.2 times the heights below it (${full.maxY - rest.maxY} against ${1.2 * below})`);
    for (const s of ['minX', 'maxX', 'minZ', 'maxZ']) assert.equal(range[s], rest[s], `${n} levels: the footprint does not change`);
    for (let k = 0; k <= 20; k++) {
      const e = modelExtent(m, k / 20);
      assert.ok(range.minY <= e.minY + 1e-9 && range.maxY >= e.maxY - 1e-9, `${n} levels: holds the model at ${k / 20}`);
    }
  }
});
