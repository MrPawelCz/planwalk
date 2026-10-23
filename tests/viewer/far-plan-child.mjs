// Child process of hostile-model.test.mjs: moves a whole example plan far from the origin, then validates it, builds the model,
// works out the areas and picks the walk start, the whole path of a load. Prints one JSON line. A hang is the failure the parent
// guards against with a timeout, which is why this runs in a process of its own.
//   node tests/viewer/far-plan-child.mjs <offset> [example]
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { defaultSpawn } from '../../viewer/src/physics.js';
import { roomArea, totalArea } from '../../viewer/src/areas.js';

const offset = Number(process.argv[2]);
const example = process.argv[3] || 'flat-1';
const plan = JSON.parse(readFileSync(new URL(`../../examples/${example}.plan.json`, import.meta.url), 'utf8'));
const move = (p) => [p[0] + offset, p[1] + offset];
for (const lv of plan.levels) {
  for (const w of lv.walls || []) { w.from = move(w.from); w.to = move(w.to); }
  for (const r of lv.rooms || []) r.polygon = r.polygon.map(move);
  for (const s of lv.stairs || []) { s.from = move(s.from); s.to = move(s.to); }
  for (const f of lv.furniture || []) f.center = move(f.center);
}
const t0 = performance.now();
const r = validatePlan(plan);
let built = false, spawn = null;
if (r.normalized) {
  const m = buildModel(r.normalized);
  for (const lv of m.levels) for (const room of lv.rooms) roomArea(room, lv.walls);
  totalArea(m);
  spawn = defaultSpawn(m);
  built = true;
}
console.log(JSON.stringify({ ms: Math.round(performance.now() - t0), built, codes: [...r.errors, ...r.warnings].map((i) => i.code), spawnFinite: spawn ? [spawn.x, spawn.y, spawn.yawDeg].every(Number.isFinite) : null }));
