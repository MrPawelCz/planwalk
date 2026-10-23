// Room areas on labels and in the model: what the drawing declares, else an estimate net of the walls with a leading "~".
// The label canvases need a document; a stub that records the printed texts is enough.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { pointInPolygon } from '../../src/core/geom2d.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { PlanScene } from '../../viewer/src/scene.js';
import { setLang } from '../../viewer/src/i18n.js';
import { roomArea, formatArea, areaText, totalArea } from '../../viewer/src/areas.js';

const printed = [];
const ctx = new Proxy({}, {
  get: (t, k) => (k === 'fillText' ? (s) => printed.push(s) : k === 'measureText' ? () => ({ width: 100 }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const load = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const modelOf = (obj) => { const r = validatePlan(obj); assert.ok(r.normalized, 'the plan normalizes'); return buildModel(r.normalized); };
const withoutAreas = (obj) => { for (const l of obj.levels) for (const r of l.rooms) delete r.area; return obj; };
const EXAMPLES = ['examples/flat-1.plan.json', 'examples/duplex-1.plan.json'];

// The floor you can actually see: the room polygon minus the wall boxes, counted on a grid. Independent of netArea.
function visibleFloor(room, walls, step = 0.02) {
  const xs = room.polygon.map((p) => p[0]), ys = room.polygon.map((p) => p[1]);
  const inWall = (x, y) => walls.some((w) => {
    const dx = x - w.from[0], dy = y - w.from[1];
    const u = dx * w.dir[0] + dy * w.dir[1], v = -dx * w.dir[1] + dy * w.dir[0];
    return u >= -w.thickness / 2 && u <= w.length + w.thickness / 2 && Math.abs(v) <= w.thickness / 2;
  });
  let n = 0;
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (pointInPolygon([x, y], room.polygon) && !inWall(x, y)) n++;
  }
  return n * step * step;
}

// A WC of 1.8 x 2.2 m between the outer wall and one partition: centreline polygon 3.96 m2, floor you see about 3.0.
const wcPlan = () => ({
  version: 1, name: 'WC case', units: 'm', meta: { source: 'synthetic' },
  levels: [{
    id: 'L0',
    walls: [
      { id: 'w1', from: [0, 0], to: [5, 0], kind: 'exterior' }, { id: 'w2', from: [5, 0], to: [5, 2.2], kind: 'exterior' },
      { id: 'w3', from: [5, 2.2], to: [0, 2.2], kind: 'exterior' }, { id: 'w4', from: [0, 2.2], to: [0, 0], kind: 'exterior' },
      { id: 'w5', from: [1.8, 0], to: [1.8, 2.2], kind: 'interior' },
    ],
    openings: [{ id: 'd1', wall: 'w3', type: 'door', offset: 3, width: 0.9 }, { id: 'd2', wall: 'w5', type: 'door', offset: 1, width: 0.7 }],
    rooms: [
      { id: 'wc', name: 'WC', polygon: [[0, 0], [1.8, 0], [1.8, 2.2], [0, 2.2]] },
      { id: 'living', name: 'Living room', polygon: [[1.8, 0], [5, 0], [5, 2.2], [1.8, 2.2]] },
    ],
  }],
});

test('a declared area wins, is shown as it is and is not marked as an estimate', () => {
  const plan = wcPlan();
  plan.levels[0].rooms[0].area = 3.1;
  const m = modelOf(plan);
  const a = roomArea(m.levels[0].rooms[0], m.levels[0].walls);
  assert.deepEqual(a, { m2: 3.1, estimated: false });
  assert.equal(areaText(m.levels[0].rooms[0], m.levels[0].walls, 'en'), '3.1 m²');
});

test('without a declared area the estimate is net of the walls and starts with ~', () => {
  const m = modelOf(wcPlan());
  const [wc, living] = m.levels[0].rooms, walls = m.levels[0].walls;
  const a = roomArea(wc, walls);
  assert.equal(a.estimated, true);
  assert.ok(a.m2 < wc.area * 0.8, `net ${a.m2} against centreline ${wc.area}`);
  assert.ok(areaText(wc, walls, 'en').startsWith('~'));
  assert.ok(areaText(living, walls, 'pl').startsWith('~'));
});

test('a WC or bathroom label is within 2% of the floor you see, not 30% above it', () => {
  const m = modelOf(wcPlan());
  const walls = m.levels[0].walls;
  for (const room of m.levels[0].rooms) {
    const seen = visibleFloor(room, walls), shown = roomArea(room, walls).m2;
    assert.ok(shown <= seen * 1.02, `${room.id}: label ${shown} against floor ${seen}`);
    assert.ok(shown >= seen * 0.98, `${room.id}: label ${shown} against floor ${seen}`);
  }
  const wc = m.levels[0].rooms[0];
  assert.ok(wc.area > visibleFloor(wc, walls) * 1.25, 'the centreline polygon would have been more than 25% too big');
});

test('a degenerate polygon falls back to the polygon area instead of NaN', () => {
  const a = roomArea({ polygon: [[0, 0], [1, 0], [2, 0]], area: 0 }, []);
  assert.deepEqual(a, { m2: 0, estimated: true });
  assert.equal(formatArea(a.m2, true, 'en'), '~0 m²');
});

test('formatting follows the language: decimal comma in Polish, point in English, one decimal at most', () => {
  assert.equal(formatArea(12.34, false, 'en'), '12.3 m²');
  assert.equal(formatArea(12.34, false, 'pl'), '12,3 m²');
  assert.equal(formatArea(12.34, true, 'pl'), '~12,3 m²');
  assert.equal(formatArea(12, false, 'pl'), '12 m²');
  assert.equal(formatArea(0.96, true, 'en'), '~1 m²');
});

test('bundled examples: every label is within 2% of the floor you see, or is the declared area', () => {
  for (const file of EXAMPLES) {
    for (const variant of [(p) => p, withoutAreas]) {
      const m = modelOf(variant(load(file)));
      for (const lv of m.levels) {
        for (const r of lv.rooms) {
          const a = roomArea(r, lv.walls);
          if (!a.estimated) { assert.equal(a.m2, r.declaredArea, `${file} ${r.id} shows the declared area`); continue; }
          const seen = visibleFloor(r, lv.walls);
          assert.ok(Math.abs(a.m2 - seen) / seen <= 0.02, `${file} ${r.id}: estimate ${a.m2.toFixed(2)} against floor ${seen.toFixed(2)}`);
        }
      }
    }
  }
});

test('the declared areas of the bundled examples are net, like printed areas, not the centreline numbers', () => {
  for (const file of EXAMPLES) {
    const m = modelOf(load(file));
    for (const lv of m.levels) {
      for (const r of lv.rooms) {
        const seen = visibleFloor(r, lv.walls);
        assert.ok(Math.abs(r.declaredArea - seen) / seen <= 0.03, `${file} ${r.id}: declared ${r.declaredArea} against floor ${seen.toFixed(2)}`);
      }
    }
  }
});

test('the scene prints the area text on every label and keeps it in the room node data', () => {
  setLang('en');
  const declared = modelOf(load('examples/flat-1.plan.json'));
  printed.length = 0;
  const scene = new PlanScene(declared, 'clay');
  const rooms = declared.levels[0].rooms;
  for (const r of rooms) assert.ok(printed.includes(formatArea(r.declaredArea, false, 'en')), `${r.id} prints its declared area`);
  assert.equal(scene.group.getObjectByName(`room:${rooms[0].id}`).userData.area, rooms[0].declaredArea);

  const estimated = modelOf(withoutAreas(load('examples/flat-1.plan.json')));
  printed.length = 0;
  const scene2 = new PlanScene(estimated, 'clay');
  const texts = printed.filter((s) => / m²$/.test(s));
  assert.equal(texts.length, estimated.levels[0].rooms.length);
  assert.ok(texts.every((s) => s.startsWith('~')), texts.join(' | '));
  const node = scene2.group.getObjectByName(`room:${estimated.levels[0].rooms[0].id}`);
  assert.equal(node.userData.areaEstimated, true);
  assert.ok(node.userData.area < estimated.levels[0].rooms[0].area);

  setLang('pl');
  printed.length = 0;
  new PlanScene(estimated, 'clay');
  assert.ok(printed.some((s) => /^~\d+,\d m²$/.test(s)), printed.join(' | '));
  setLang('en');
});

test('totalArea sums the shown areas and is an estimate as soon as one room is', () => {
  const all = totalArea(modelOf(load('examples/duplex-1.plan.json')));
  assert.equal(all.rooms, 8);
  assert.equal(all.estimated, false);
  assert.ok(Math.abs(all.m2 - (15.8 + 8.9 + 3.9 + 22.7 + 3.6 + 11.9 + 17.9 + 17.9)) < 1e-9, `declared total ${all.m2}`);
  const mixed = load('examples/duplex-1.plan.json');
  delete mixed.levels[0].rooms[0].area;
  assert.equal(totalArea(modelOf(mixed)).estimated, true);
});
