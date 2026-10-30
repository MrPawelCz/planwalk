// The bundled examples have to be walkable. The one-bedroom flat had 15 cm between its coffee table and its sofa, and the end of the sofa left
// 34 cm at the door of the study, so the study could not be entered at all. Node only, no browser: the physics of Walk on the real examples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { pointInPolygon } from '../../src/core/geom2d.js';
import { buildModel, PLAYER, roomAt } from '../../viewer/src/geometry.js';
import { createWorld, createPlayer, stepPlayer, defaultSpawn, maxPenetration } from '../../viewer/src/physics.js';

const modelOf = (file) => buildModel(validatePlan(JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))).normalized);
const EXAMPLES = ['examples/flat-1.plan.json', 'examples/duplex-1.plan.json'];
const CELL = 0.05, R = PLAYER.radius;

// Where the centre of the player may stand on a level, grown from a seed over cells that share an edge.
function reachable(model, levelIndex, seed) {
  const lv = model.levels[levelIndex], b = model.bounds;
  const nx = Math.ceil((b.maxX - b.minX) / CELL) + 1, ny = Math.ceil((b.maxY - b.minY) / CELL) + 1;
  const cell = (x, y) => [Math.round((x - b.minX) / CELL), Math.round((y - b.minY) / CELL)];
  const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && maxPenetration(lv, b.minX + i * CELL, b.minY + j * CELL, R) <= 1e-3;
  const seen = new Uint8Array(nx * ny);
  // The player who has just climbed a stair stands a few millimetres from a wall, so the cell nearest to the seed can be a hair inside it: start from the nearest free one.
  const [ci, cj] = cell(seed[0], seed[1]);
  let start = null;
  for (let r = 0; r <= 6 && !start; r++) for (let di = -r; di <= r && !start; di++) for (let dj = -r; dj <= r && !start; dj++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(ci + di, cj + dj)) start = [ci + di, cj + dj];
  assert.ok(start, `no free floor within 30 cm of where the player arrives, around (${seed[0].toFixed(2)}, ${seed[1].toFixed(2)})`);
  const stack = [start];
  seen[start[1] * nx + start[0]] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [a, c] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (free(a, c) && !seen[c * nx + a]) { seen[c * nx + a] = 1; stack.push([a, c]); }
  }
  return {
    has: (x, y) => { const [i, j] = cell(x, y); return i >= 0 && j >= 0 && i < nx && j < ny && seen[j * nx + i] === 1; },
    free: (x, y) => { const [i, j] = cell(x, y); return free(i, j); },
  };
}

// One seed per level: where Walk starts, and where the stair from a level that is already reached arrives (found by walking it).
function seeds(model) {
  const sp = defaultSpawn(model), out = new Map([[sp.level, [sp.x, sp.y]]]), world = createWorld(model);
  for (let pass = 0; pass < model.levels.length; pass++) {
    for (const st of model.stairs) {
      if (!out.has(st.lower) || out.has(st.upper)) continue;
      const p = createPlayer(world, { level: st.lower, x: st.from[0] - st.dir[0] * 0.3, y: st.from[1] - st.dir[1] * 0.3 });
      p.yaw = Math.atan2(st.dir[1], st.dir[0]);
      for (let i = 0; i < 600 && p.level !== st.upper; i++) stepPlayer(world, p, { forward: 1 }, 1 / 60);
      if (p.level === st.upper) { for (let i = 0; i < 30; i++) stepPlayer(world, p, { forward: 1 }, 1 / 60); out.set(st.upper, [p.x, p.y]); }
    }
  }
  return out;
}

for (const file of EXAMPLES) {
  test(`${file}: every room can be reached from where Walk starts`, () => {
    const m = modelOf(file), seedAt = seeds(m);
    for (const lv of m.levels) {
      const seed = seedAt.get(lv.index);
      assert.ok(seed, `${lv.id}: no way to this level was found`);
      const reach = reachable(m, lv.index, seed);
      for (const room of lv.rooms) {
        const xs = room.polygon.map((q) => q[0]), ys = room.polygon.map((q) => q[1]);
        let free = 0, got = 0;
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += CELL) for (let y = Math.min(...ys); y <= Math.max(...ys); y += CELL) {
          if (!pointInPolygon([x, y], room.polygon) || !reach.free(x, y)) continue;
          free++;
          if (reach.has(x, y)) got++;
        }
        assert.ok(free > 0, `${lv.id}/${room.id}: no free floor at all`);
        assert.ok(got / free >= 0.95, `${lv.id}/${room.id}: only ${Math.round((100 * got) / free)} % of its free floor can be reached`);
      }
    }
  });

  test(`${file}: every door can be walked up to from both sides`, () => {
    const m = modelOf(file), seedAt = seeds(m);
    for (const lv of m.levels) {
      const reach = reachable(m, lv.index, seedAt.get(lv.index));
      for (const o of lv.openings.filter((q) => q.type !== 'window')) {
        const w = lv.wallById.get(o.wallId), um = (o.u0 + o.u1) / 2;
        const cx = w.from[0] + w.dir[0] * um, cy = w.from[1] + w.dir[1] * um;
        for (const side of [1, -1]) {
          if (!roomAt(lv, cx + w.normal[0] * side * 0.5, cy + w.normal[1] * side * 0.5)) continue; // the street side of the front door
          // a spot on that side that the player can stand on and walk to: 0.3 to 0.9 m from the door, within 0.3 m of its middle
          let open = false;
          for (let t = 0.3; t <= 0.9 && !open; t += 0.05) for (let d = -0.3; d <= 0.3 && !open; d += 0.1) open = reach.has(cx + w.normal[0] * side * t + w.dir[0] * d, cy + w.normal[1] * side * t + w.dir[1] * d);
          assert.ok(open, `${lv.id}/${o.id}: furniture leaves no way up to the door on its ${side > 0 ? 'front' : 'back'} side, around (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
        }
      }
    }
  });

  test(`${file}: there is room to walk between a coffee table and a sofa`, () => {
    const m = modelOf(file);
    for (const lv of m.levels) {
      const col = (id) => lv.colliders.find((c) => c.kind === 'furniture' && c.id === id);
      for (const t of lv.furniture.filter((f) => f.type === 'table-coffee')) for (const s of lv.furniture.filter((f) => f.type === 'sofa' || f.type === 'armchair')) {
        const g = gapBetween(col(t.id), col(s.id));
        assert.ok(g >= 0.5, `${lv.id}: ${t.id} is ${(g * 100).toFixed(0)} cm from ${s.id}; a body ${PLAYER.radius * 200} cm wide needs 50 cm to walk between them`);
      }
    }
  });
}

const corners = (c) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c.cx + a * c.hx * c.ux - b * c.hy * c.uy, c.cy + a * c.hx * c.uy + b * c.hy * c.ux]);
function gapBetween(A, B) {
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const a = corners(A), b = corners(B);
  let best = Infinity;
  for (const [P, Q] of [[a, b], [b, a]]) for (const p of P) for (let i = 0; i < 4; i++) best = Math.min(best, segDist(p, Q[i], Q[(i + 1) % 4]));
  return best;
}

// The walk that was reported: along the front of the sofa, between it and the coffee table, round the end of the sofa and through the study door.
test('flat-1: the player walks between the coffee table and the sofa and into the study', () => {
  const m = modelOf('examples/flat-1.plan.json'), world = createWorld(m);
  const p = createPlayer(world, { level: 0, x: 2.9, y: 1.6, yawDeg: 0 });
  const goTo = ([tx, ty]) => {
    for (let i = 0; i < 6 * 60; i++) {
      if (Math.hypot(tx - p.x, ty - p.y) < 0.1) return true;
      p.yaw = Math.atan2(ty - p.y, tx - p.x);
      stepPlayer(world, p, { forward: 1 }, 1 / 60);
    }
    return false;
  };
  for (const wp of [[3.5, 1.6], [4.55, 1.6], [4.62, 2.6], [4.6, 3.4], [6.0, 4.0]]) assert.ok(goTo(wp), `stuck at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) on the way to (${wp})`);
  assert.equal(roomAt(m.levels[0], p.x, p.y)?.id, 'study');
});
