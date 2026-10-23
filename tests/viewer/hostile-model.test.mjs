// One far away number must neither hang the model build nor pass the check without a word (docs/SPEC.md, Limits: E014).
// The model is built from whatever the validator normalizes, also when it reports errors, so the build has to be bounded itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { defaultSpawn } from '../../viewer/src/physics.js';
import { roomArea, totalArea } from '../../viewer/src/areas.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const FAR = [1e6, 1e9, 1e12, 1e300];

// Validate, build the model, work out every area: the whole path of a load, without the browser.
function flow(plan) {
  const t0 = performance.now();
  const r = validatePlan(plan);
  if (r.normalized) {
    const m = buildModel(r.normalized);
    for (const lv of m.levels) for (const room of lv.rooms) roomArea(room, lv.walls);
    totalArea(m);
  }
  return { r, ms: performance.now() - t0, codes: [...r.errors, ...r.warnings].map((i) => i.code) };
}

test('one room corner at 1e6, 1e9, 1e12 or 1e300 is reported as E014 and the model is still built in well under a second', () => {
  for (const far of FAR) {
    for (const axis of [0, 1]) {
      const plan = load('examples/flat-1.plan.json');
      plan.levels[0].rooms[0].polygon[2][axis] = far;
      const { r, ms, codes } = flow(plan);
      assert.ok(codes.includes('E014'), `${far} on axis ${axis}: ${codes.join()}`);
      const issue = r.errors.find((e) => e.code === 'E014');
      assert.equal(issue.path, 'levels[0].rooms[0]');
      assert.match(issue.fix, /extra digit/);
      assert.equal(r.ok, false);
      assert.ok(ms < 1000, `${far} on axis ${axis}: ${Math.round(ms)} ms`);
    }
  }
});

test('a far furniture centre, stair end or second level corner is reported too, and a far wall end is the scale error E011', () => {
  const flat = load('examples/flat-1.plan.json');
  flat.levels[0].furniture = [{ id: 'sofa1', type: 'sofa', center: [2, 3] }];
  for (const far of FAR) {
    const f = JSON.parse(JSON.stringify(flat));
    f.levels[0].furniture[0].center[1] = far;
    const a = flow(f);
    assert.ok(a.codes.includes('E014'), `furniture at ${far}: ${a.codes.join()}`);
    assert.equal(a.r.errors.find((e) => e.code === 'E014').path, 'levels[0].furniture[0]');
    assert.ok(a.ms < 1000, `furniture at ${far}: ${Math.round(a.ms)} ms`);

    const d = load('examples/duplex-1.plan.json');
    d.levels[1].rooms[0].polygon[3][1] = far;
    const b = flow(d);
    assert.ok(b.codes.includes('E014'), `duplex corner at ${far}: ${b.codes.join()}`);
    assert.equal(b.r.errors.find((e) => e.code === 'E014').path, 'levels[1].rooms[0]');
    assert.ok(b.ms < 1000, `duplex corner at ${far}: ${Math.round(b.ms)} ms`);

    const w = JSON.parse(JSON.stringify(flat));
    w.levels[0].walls[0].to[1] = far;
    const c = flow(w);
    assert.ok(c.codes.includes('E011') && !c.codes.includes('E014'), `wall end at ${far}: ${c.codes.join()}`);
    assert.ok(c.ms < 1000, `wall end at ${far}: ${Math.round(c.ms)} ms`);
  }
  const s = load('examples/duplex-1.plan.json');
  const stair = s.levels.flatMap((l, li) => l.stairs.map((st, si) => [li, si])).at(0);
  assert.ok(stair, 'the duplex has a stair');
  s.levels[stair[0]].stairs[stair[1]].to[1] = 1e6;
  assert.ok(flow(s).codes.includes('E014'));
});

test('the threshold: 1000 m from the origin passes, a metre more is E014', () => {
  const at = (v) => {
    const p = load('examples/flat-1.plan.json');
    p.levels[0].rooms[0].polygon[2][1] = v;
    return validatePlan(p).errors.some((e) => e.code === 'E014');
  };
  assert.equal(at(1000), false);
  assert.equal(at(1001), true);
  assert.equal(at(-1001), true);
});

test('a long thin room and a room with many points cost the label no more than a normal one', () => {
  const plan = load('examples/flat-1.plan.json');
  const L = plan.levels[0];
  L.rooms[0].polygon = [[0, 0], [190, 0], [190, 0.3], [0, 0.3]]; // a 190 m corridor, 30 cm wide
  const { ms, codes } = flow(plan);
  assert.ok(ms < 1000, `${Math.round(ms)} ms`);
  assert.ok(!codes.includes('E014'));
});

test('the spawn point search stays bounded in a huge room whose middle is blocked', () => {
  const plan = load('examples/flat-1.plan.json');
  const living = plan.levels[0].rooms.find((r) => r.id === 'living');
  living.polygon = [[0, 0], [900, 0], [900, 900], [0, 900]]; // 900 m is inside the E014 limit
  const first = buildModel(validatePlan(plan).normalized);
  const label = first.levels[0].rooms.find((r) => r.id === 'living').label;
  plan.levels[0].furniture = [{ id: 'block', type: 'wardrobe', center: label, size: [3, 3] }]; // the label point is no place to stand
  const model = buildModel(validatePlan(plan).normalized);
  const t0 = performance.now();
  const spawn = defaultSpawn(model);
  const ms = performance.now() - t0;
  assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.y));
  assert.ok(ms < 300, `${Math.round(ms)} ms`);
});
