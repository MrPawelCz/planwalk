import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scorePlans } from '../../eval/score.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const load = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const FILES = ['examples/flat-1.plan.json', 'examples/duplex-1.plan.json'];
const clone = (o) => JSON.parse(JSON.stringify(o));

test('a plan scored against itself is perfect', () => {
  for (const f of FILES) {
    const p = load(f);
    const r = scorePlans(p, clone(p));
    assert.equal(r.composite, 100, `${f}: ${JSON.stringify(r)}`);
    assert.equal(r.rooms.f1, 1);
    assert.equal(r.openings.f1, 1);
    assert.equal(r.connectivityF1, 1);
    assert.equal(r.valid, true);
    assert.equal(r.scaleErrorPct, 0);
  }
});

test('a different origin and a different uniform scale do not matter after alignment, but the scale error is reported', () => {
  for (const f of FILES) {
    const truth = load(f);
    const pred = clone(truth);
    const k = 1.3;
    for (const l of pred.levels) {
      for (const w of l.walls) { w.from = [w.from[0] * k + 7, w.from[1] * k + 3]; w.to = [w.to[0] * k + 7, w.to[1] * k + 3]; }
      for (const o of l.openings) { o.offset *= k; o.width *= k; if (o.height) o.height *= 1; }
      for (const r of l.rooms) { r.polygon = r.polygon.map(([x, y]) => [x * k + 7, y * k + 3]); delete r.area; }
      for (const m of l.furniture) m.center = [m.center[0] * k + 7, m.center[1] * k + 3];
      for (const s of l.stairs ?? []) { s.from = [s.from[0] * k + 7, s.from[1] * k + 3]; s.to = [s.to[0] * k + 7, s.to[1] * k + 3]; s.width *= k; }
    }
    const r = scorePlans(truth, pred);
    assert.ok(r.composite >= 98, `${f}: composite ${r.composite} ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.scaleErrorPct - Math.abs(1 / k - 1) * 100) < 0.2, `scale error ${r.scaleErrorPct}`);
  }
});

test('the same plan written in centimetres scores the same', () => {
  const truth = load('examples/flat-1.plan.json');
  const cm = clone(truth);
  cm.units = 'cm';
  for (const l of cm.levels) {
    l.height *= 100;
    for (const w of l.walls) { w.from = w.from.map((v) => v * 100); w.to = w.to.map((v) => v * 100); }
    for (const o of l.openings) { o.offset *= 100; o.width *= 100; if (o.height) o.height *= 100; if (o.sill) o.sill *= 100; }
    for (const r of l.rooms) { r.polygon = r.polygon.map((p) => p.map((v) => v * 100)); if (r.area) r.area *= 10000; }
    for (const m of l.furniture) { m.center = m.center.map((v) => v * 100); if (m.size) m.size = m.size.map((v) => v * 100); }
  }
  assert.equal(scorePlans(truth, cm).composite, 100);
});

test('a missing room lowers room recall and the composite', () => {
  const truth = load('examples/flat-1.plan.json');
  const pred = clone(truth);
  pred.levels[0].rooms = pred.levels[0].rooms.filter((r) => r.id !== 'study');
  const r = scorePlans(truth, pred);
  assert.equal(r.rooms.matched, 4);
  assert.equal(r.rooms.recall, 0.8);
  assert.equal(r.rooms.precision, 1);
  assert.ok(r.composite < 100 && r.composite > 60, `composite ${r.composite}`);
});

test('a room that is too small does not match (IoU below 0.5)', () => {
  const truth = load('examples/flat-1.plan.json');
  const pred = clone(truth);
  const living = pred.levels[0].rooms.find((r) => r.id === 'living');
  living.polygon = [[0, 0], [2, 0], [2, 3], [0, 3]];
  const r = scorePlans(truth, pred);
  assert.equal(r.rooms.matched, 4);
  assert.equal(r.rooms.precision, 0.8);
});

test('openings: a door moved by 1.5 m is a miss, a window dropped lowers window recall', () => {
  const truth = load('examples/flat-1.plan.json');
  const moved = clone(truth);
  moved.levels[0].openings.find((o) => o.id === 'front').offset += 1.5;
  const a = scorePlans(truth, moved);
  assert.ok(a.openings.doorF1 < 1 && a.openings.windowF1 === 1, JSON.stringify(a.openings));
  const dropped = clone(truth);
  dropped.levels[0].openings = dropped.levels[0].openings.filter((o) => o.id !== 'win-liv-1');
  const b = scorePlans(truth, dropped);
  assert.ok(b.openings.windowF1 < 1 && b.openings.doorF1 === 1, JSON.stringify(b.openings));
});

test('connectivity: removing the only door into a room breaks an edge', () => {
  const truth = load('examples/flat-1.plan.json');
  const pred = clone(truth);
  pred.levels[0].openings = pred.levels[0].openings.filter((o) => o.id !== 'd-living-bed');
  const r = scorePlans(truth, pred);
  assert.ok(r.connectivityF1 < 1, `connectivity ${r.connectivityF1}`);
  assert.equal(r.rooms.f1, 1);
});

test('an invalid but readable prediction keeps its geometry score and loses the 10 validity points', () => {
  const truth = load('examples/flat-1.plan.json');
  const pred = clone(truth);
  pred.levels[0].openings.push({ id: 'ghost', wall: 'no-such-wall', type: 'door', offset: 1, width: 0.9 });
  const r = scorePlans(truth, pred);
  assert.equal(r.valid, false);
  assert.ok(r.errors >= 1);
  assert.ok(r.composite >= 85 && r.composite <= 90, `composite ${r.composite}`);
});

test('an unreadable prediction scores zero', () => {
  const truth = load('examples/flat-1.plan.json');
  for (const bad of [null, 'not a plan', 42, { levels: 'x' }]) {
    const r = scorePlans(truth, bad);
    assert.equal(r.composite, 0);
    assert.equal(r.valid, false);
  }
});

test('a wrong level count is reported and costs points', () => {
  const truth = load('examples/duplex-1.plan.json');
  const pred = clone(truth);
  pred.levels = [pred.levels[0]];
  pred.levels[0].stairs = [];
  const r = scorePlans(truth, pred);
  assert.equal(r.levelsMatch, false);
  assert.ok(r.composite < 90, `composite ${r.composite}`);
});

test('scoring is deterministic and the CLI prints a summary and JSON', () => {
  const truth = load('examples/flat-1.plan.json');
  assert.equal(JSON.stringify(scorePlans(truth, clone(truth))), JSON.stringify(scorePlans(truth, clone(truth))));
  const text = spawnSync(process.execPath, [`${root}eval/score.mjs`, `${root}examples/flat-1.plan.json`, `${root}examples/flat-1.plan.json`], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /composite 100 \/ 100/);
  const json = spawnSync(process.execPath, [`${root}eval/score.mjs`, `${root}examples/flat-1.plan.json`, `${root}examples/duplex-1.plan.json`, '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  assert.ok(JSON.parse(json.stdout).composite < 100);
  assert.equal(spawnSync(process.execPath, [`${root}eval/score.mjs`], { encoding: 'utf8' }).status, 2);
});
