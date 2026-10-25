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
