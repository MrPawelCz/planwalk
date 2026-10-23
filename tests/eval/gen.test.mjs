import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES, generatePlan } from '../../eval/gen/gen-plans.mjs';
import { validatePlan } from '../../src/core/validate.js';
import { scorePlans } from '../../eval/score.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SEEDS = Array.from({ length: 28 }, (_, i) => i + 1); // every family four times

test('the same seed always gives the same plan, different seeds give different plans', () => {
  assert.equal(JSON.stringify(generatePlan(5)), JSON.stringify(generatePlan(5)));
  assert.notEqual(JSON.stringify(generatePlan(1).plan), JSON.stringify(generatePlan(8).plan)); // both studios
  assert.deepEqual(SEEDS.slice(0, 7).map((s) => generatePlan(s).family), FAMILIES);
});

test('every generated plan validates with no errors and no warnings (connected, backed by walls, plausible)', () => {
  for (const seed of SEEDS) {
    const { family, plan } = generatePlan(seed);
    const r = validatePlan(plan);
    assert.deepEqual([...r.errors, ...r.warnings].map((i) => `${i.code} ${i.path}`), [], `seed ${seed} (${family})`);
  }
});

test('room sizes and openings are realistic (SPEC section 8)', () => {
  for (const seed of SEEDS) {
    const { family, plan } = generatePlan(seed);
    for (const l of plan.levels) {
      for (const q of l.rooms) assert.ok(q.area >= 3 && q.area <= 30, `seed ${seed} ${family}: ${q.name} is ${q.area} m2`);
      const kind = new Map(l.walls.map((w) => [w.id, w.kind ?? 'interior']));
      for (const o of l.openings) {
        if (o.type === 'door') assert.ok(o.width >= 0.8 && o.width <= 0.9, `seed ${seed} ${family}: door ${o.id} is ${o.width} m`);
        if (o.type === 'window') assert.equal(kind.get(o.wall), 'exterior', `seed ${seed} ${family}: window ${o.id} is on a ${kind.get(o.wall)} wall`);
      }
    }
  }
});

test('families have their defining features', () => {
  const by = (f) => generatePlan(FAMILIES.indexOf(f) + 1, f).plan;
  assert.equal(by('duplex').levels.length, 2);
  assert.equal(by('duplex').levels[0].stairs.length, 1);
  assert.ok(by('balcony').levels[0].rooms.some((q) => q.id === 'balcony'));
  assert.ok(by('l-shaped').levels[0].walls.some((w) => w.id.startsWith('x-step')), 'an L shape has a stepped exterior wall');
  assert.ok(by('two-bedroom').levels[0].rooms.some((q) => q.name === 'Corridor'));
  assert.equal(by('three-bedroom').levels[0].rooms.filter((q) => q.use === 'bedroom').length, 3);
  assert.equal(by('studio').levels[0].rooms.length, 3);
});

test('a generated truth scores 100 against itself', () => {
  for (const seed of SEEDS.slice(0, 14)) {
    const { plan } = generatePlan(seed);
    assert.equal(scorePlans(plan, JSON.parse(JSON.stringify(plan))).composite, 100, `seed ${seed}`);
  }
});

test('the CLI writes truth files, and fails with exit 2 on bad usage', () => {
  const out = mkdtempSync(join(tmpdir(), 'planwalk-gen-'));
  try {
    const r = spawnSync(process.execPath, [join(root, 'eval/gen/gen-plans.mjs'), '--seed', '3', '--count', '2', '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split('\n'), ['003-two-bedroom', '004-three-bedroom']);
    for (const id of ['003-two-bedroom', '004-three-bedroom']) {
      const f = join(out, 'truth', `${id}.plan.json`);
      assert.ok(existsSync(f));
      assert.equal(validatePlan(JSON.parse(readFileSync(f, 'utf8'))).ok, true);
    }
    assert.equal(spawnSync(process.execPath, [join(root, 'eval/gen/gen-plans.mjs')], { encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
