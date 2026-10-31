// In Walk the player goes through furniture and is stopped by walls, windows, stairs with their rails and shut doors.
// Node only: the physics on the real examples and on a small plan of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { twoRooms } from './walk-room.mjs';
import { createWorld, createPlayer, stepPlayer, teleport, defaultSpawn, maxPenetration, freeDistance, longestView, useDoor } from '../../viewer/src/physics.js';

const modelOf = (file) => buildModel(validatePlan(JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))).normalized);
const walk = (world, p, input, seconds, dt = 1 / 60) => { for (let i = 0, n = Math.round(seconds / dt); i < n; i++) stepPlayer(world, p, input, dt); return p; };
const at = (world, x, y, yawDeg, level = 0) => createPlayer(world, { level, x, y, yawDeg });
// The centre of the player lies inside a piece of furniture (radius 0: only its own footprint counts).
const inside = (m, p, id) => { const c = m.levels[p.level].colliders.find((q) => q.kind === 'furniture' && q.id === id); return maxPenetration({ colliders: [c] }, p.x, p.y, 0) > 0; };

test('flat-1: the player walks straight through the coffee table and the sofa, then stops at the wall behind them', () => {
  const m = modelOf('examples/flat-1.plan.json'), w = createWorld(m);
  // f2 coffee table (3.5, 1.0) 1.0 x 0.6 and f1 sofa (3.5, 2.35) 1.6 x 0.9, walking south at x = 3.5; the wall w6 (y = 3, 0.12 thick) is behind the sofa
  const p = at(w, 3.5, 0.4, 90);
  walk(w, p, { forward: 1 }, 0.5);
  assert.ok(inside(m, p, 'f2'), `y = ${p.y.toFixed(2)}, in the table`);
  walk(w, p, { forward: 1 }, 1.0);
  assert.ok(inside(m, p, 'f1'), `y = ${p.y.toFixed(2)}, in the sofa`);
  assert.equal(p.collisions, 0, 'nothing pushed the player on the way through');
  walk(w, p, { forward: 1 }, 2);
  assert.ok(Math.abs(p.y - (3 - 0.06 - 0.2)) < 0.01, `the wall stops it at y = ${p.y.toFixed(3)}`);
  assert.ok(p.collisions > 0);
});

test('flat-1: a sofa is crossed from end to end and a wardrobe is walked into', () => {
  const m = modelOf('examples/flat-1.plan.json'), w = createWorld(m);
  // the sofa f1 spans x 2.7 to 4.3 at y 2.35; the wall w5 (x = 5) closes the room at x = 4.94
  const a = walk(w, at(w, 2.0, 2.35, 0), { forward: 1 }, 2.5);
  assert.ok(Math.abs(a.x - (5 - 0.06 - 0.2)) < 0.01, `x = ${a.x.toFixed(3)}, beyond the far end of the sofa (4.3)`);
  // the wardrobe f5 (5.56, 0.45) 1.0 x 0.6 stands against the wall w1 (y = 0, 0.3 thick): the player ends up inside it
  const b = walk(w, at(w, 5.56, 1.6, -90), { forward: 1 }, 2);
  assert.ok(Math.abs(b.y - (0.15 + 0.2)) < 0.01, `y = ${b.y.toFixed(3)}`);
  assert.ok(inside(m, b, 'f5'), 'inside the wardrobe');
});

test('duplex-1: furniture on both levels is walked through (counter, fridge, sofa, bed, wardrobe, bathtub)', () => {
  const m = modelOf('examples/duplex-1.plan.json'), w = createWorld(m);
  // [level, id, start x, start y, yaw, metres]: each walk starts in clear floor and ends in the middle of the piece
  for (const [level, id, x, y, yaw, metres] of [[0, 'l2', 6.4, 3.5, 90, 0.7], [0, 'l1', 6.4, 4.8, 90, 0.75], [0, 'k1', 3.6, 1.4, -90, 0.9], [0, 'k4', 6.55, 1.4, -90, 0.9], [1, 'b2', 3.5, 1.4, -90, 0.9], [1, 't1', 1.1, 1.3, -90, 0.75]]) {
    const p = walk(w, at(w, x, y, yaw, level), { forward: 1 }, metres / 1.4);
    assert.ok(inside(m, p, id), `${id}: ended at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    assert.equal(p.level, level);
  }
});

test('every piece of furniture can be stood in: placing or leaving the player there pushes nothing', () => {
  let stood = 0;
  for (const file of ['examples/flat-1.plan.json', 'examples/duplex-1.plan.json', 'tests/fixtures/duplex-min.plan.json']) {
    const m = modelOf(file), w = createWorld(m);
    for (const lv of m.levels) for (const f of lv.furniture.filter((q) => q.collides)) {
      if (maxPenetration(w.solid[lv.index], f.center[0], f.center[1], w.radius) > 1e-3) continue; // the middle lies in a wall (a shelf against one): the wall pushes
      const p = at(w, f.center[0], f.center[1], 0, lv.index);
      teleport(w, p, f.center[0], f.center[1], lv.index);
      walk(w, p, {}, 0.2);
      assert.deepEqual([p.x, p.y], f.center, `${file} ${f.id}: pushed to (${p.x}, ${p.y})`);
      stood++;
    }
  }
  assert.ok(stood >= 20, `${stood} pieces tried`);
});

test('walls, windows and stairs still stop the player', () => {
  const duplex = modelOf('examples/duplex-1.plan.json'), w = createWorld(duplex);
  // wall g5 (x = 2.8, 0.12 thick) between the hall and the rooms, walking east at y = 1.9 (the kitchen door is at y 0.6 to 1.5, the other at 3.4 to 4.35)
  const a = walk(w, at(w, 2.0, 2.0, 0), { forward: 1 }, 2);
  assert.ok(Math.abs(a.x - (2.8 - 0.06 - 0.2)) < 0.01, `wall: x = ${a.x.toFixed(3)}`);
  // window win-kitchen in g1 (y = 0): the sill is below eye height, the gap stays solid
  const b = walk(w, at(w, 4.2, 1.4, -90), { forward: 1 }, 2);
  assert.ok(Math.abs(b.y - (0.15 + 0.2)) < 0.01, `window: y = ${b.y.toFixed(3)}`);
  // the rails of stair-1 (x 0.6 to 1.6, from (1.1, 5.2) to (1.1, 2.4)): sideways from the middle of the flight the player stops 20 cm short of a rail
  const c = walk(w, at(w, 1.1, 4.0, 0), { forward: 1 }, 2);
  assert.ok(Math.abs(c.x - (1.6 - 0.2)) < 0.01, `rail: x = ${c.x.toFixed(3)}`);
  const d = walk(w, at(w, 1.1, 4.0, 180), { forward: 1 }, 2);
  assert.ok(Math.abs(d.x - (0.6 + 0.2)) < 0.01, `rail: x = ${d.x.toFixed(3)}`);
  assert.equal(c.level, 0);
  // a stair that leaves the plan is solid like a wall
  const flat = modelOf('tests/fixtures/flat-stairs-out.plan.json'), fw = createWorld(flat);
  const e = walk(fw, at(fw, 0.4, 1.2, 0), { forward: 1 }, 3);
  assert.ok(e.x < 0.915 - 0.2 + 1e-2, `loose stair: x = ${e.x.toFixed(3)}`);
});

test('two rooms: the sofa and the table are walked through, the shut door and the wall are not', () => {
  const m = twoRooms(), w = createWorld(m);
  const a = walk(w, at(w, 0.8, 2, 0), { forward: 1 }, 1.8);
  assert.ok(a.x > 3.0 && a.collisions === 0, `through the sofa (x 1 to 3): x = ${a.x.toFixed(2)}`);
  const b = walk(w, at(w, 5.0, 2, 0), { forward: 1 }, 1.5);
  assert.ok(b.x > 6.5 && b.collisions === 0, `through the table: x = ${b.x.toFixed(2)}`);
  // the door d1 (y 1.0 to 1.9 in the wall x = 4): open, the player passes; shut, it stops at the door like at a wall
  const open = walk(w, at(w, 3.0, 1.45, 0), { forward: 1 }, 1.5);
  assert.ok(open.x > 4.5, `open door: x = ${open.x.toFixed(2)}`);
  const p = at(w, 3.0, 1.45, 0);
  assert.equal(useDoor(w, p).action, 'close');
  walk(w, p, { forward: 1 }, 2);
  assert.ok(Math.abs(p.x - (4 - 0.06 - 0.2)) < 0.01, `shut door: x = ${p.x.toFixed(3)}`);
  assert.ok(p.collisions > 0);
});

test('the start of Walk and the longest view still count furniture', () => {
  for (const file of ['examples/flat-1.plan.json', 'examples/duplex-1.plan.json', 'tests/fixtures/duplex-min.plan.json']) {
    const m = modelOf(file), sp = defaultSpawn(m), lv = m.levels[sp.level];
    assert.equal(maxPenetration(lv, sp.x, sp.y, 0.45), 0, `${file}: the start is clear of furniture and walls with 25 cm to spare`);
    for (const f of lv.furniture.filter((q) => q.collides)) {
      const c = lv.colliders.find((q) => q.kind === 'furniture' && q.id === f.id);
      assert.equal(maxPenetration({ colliders: [c] }, sp.x, sp.y, 0.45), 0, `${file}: the start is not in ${f.id}`);
    }
  }
  // a sofa across a room shortens the view like a wall does; a player may walk through it all the same
  const m = twoRooms(), lv = m.levels[0];
  const sofa = lv.colliders.find((c) => c.id === 'sofa');
  assert.ok(Math.abs(freeDistance(lv, 0.4, 2, 1, 0) - 0.6) < 0.01, 'the ray stops at the sofa');
  assert.ok(freeDistance({ colliders: lv.colliders.filter((c) => c !== sofa) }, 0.4, 2, 1, 0) > 3, 'without the sofa it runs on to the wall');
  assert.notEqual(longestView(lv, 0.4, 2, m.bounds, 0), 0, 'the longest view from behind the sofa does not look into it');
  const w = createWorld(m);
  assert.equal(w.solid[0].colliders.some((c) => c.kind === 'furniture'), false, 'the world that the player moves in has no furniture');
  assert.equal(lv.colliders.some((c) => c.kind === 'furniture'), true, 'the model keeps it for the start and the view');
});
