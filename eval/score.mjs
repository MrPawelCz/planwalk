// Scores an AI reading of a floor plan (the prediction) against the known truth. Both are plan JSON files (docs/SPEC.md).
// Usage: node eval/score.mjs <truth.json> <pred.json> [--json]
// The prediction is first aligned to the truth by the best uniform scale and translation of the wall bounding boxes
// (the scale error before alignment is reported). Everything is deterministic.
// Composite 0..100 = 30 room F1 + 20 mean IoU + 15 openings F1 + 15 connectivity F1 + 10 area accuracy + 10 valid.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validatePlan, roomGraph } from '../src/core/validate.js';
import { pointInPolygon } from '../src/core/geom2d.js';

const CELL = 0.1; // metres per raster cell for room IoU
const IOU_MATCH = 0.5;
const OPENING_CENTER = 0.4;
const OPENING_WIDTH = 0.3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f1 = (tp, nPred, nTruth) => (nPred + nTruth === 0 ? 1 : (2 * tp) / (nPred + nTruth));

function align(truth, pred) {
  const T = truth.bounds, P = pred.bounds;
  const den = P.width * P.width + P.height * P.height;
  const s = den > 1e-12 ? (P.width * T.width + P.height * T.height) / den : 1;
  const tc = [(T.minX + T.maxX) / 2, (T.minY + T.maxY) / 2], pc = [(P.minX + P.maxX) / 2, (P.minY + P.maxY) / 2];
  const t = [tc[0] - s * pc[0], tc[1] - s * pc[1]];
  return { s, t, map: (p) => [s * p[0] + t[0], s * p[1] + t[1]] };
}

function alignedLevel(level, al) {
  return {
    rooms: level.rooms.map((r) => ({ id: r.id, polygon: r.polygon.map(al.map), area: r.area * al.s * al.s })),
    walls: level.walls.map((w) => ({ id: w.id, from: al.map(w.from), to: al.map(w.to), length: w.length * al.s, dir: w.dir })),
    openings: level.openings.map((o) => ({ ...o, offset: o.offset * al.s, width: o.width * al.s })),
  };
}

function openingPoints(level) {
  const wallById = new Map(level.walls.map((w) => [w.id, w]));
  const out = [];
  for (const o of level.openings) {
    const w = wallById.get(o.wall);
    if (!w || w.length < 1e-9) continue;
    const t = o.offset + o.width / 2;
    out.push({ kind: o.type === 'window' ? 'window' : 'door', c: [w.from[0] + w.dir[0] * t, w.from[1] + w.dir[1] * t], width: o.width });
  }
  return out;
}

function raster(polygon, grid) {
  const cells = new Uint8Array(grid.nx * grid.ny);
  if (polygon.length < 3) return cells;
  const xs = polygon.map((p) => p[0]), ys = polygon.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - grid.x0) / CELL)), i1 = Math.min(grid.nx - 1, Math.ceil((Math.max(...xs) - grid.x0) / CELL));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - grid.y0) / CELL)), j1 = Math.min(grid.ny - 1, Math.ceil((Math.max(...ys) - grid.y0) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (pointInPolygon([grid.x0 + (i + 0.5) * CELL, grid.y0 + (j + 0.5) * CELL], polygon)) cells[j * grid.nx + i] = 1;
  return cells;
}

function iou(a, b) {
  let inter = 0, union = 0;
  for (let k = 0; k < a.length; k++) { const x = a[k], y = b[k]; inter += x & y; union += x | y; }
  return union === 0 ? 0 : inter / union;
}

function matchRooms(truthRooms, predRooms) {
  const all = [...truthRooms, ...predRooms].flatMap((r) => r.polygon);
  if (!all.length) return { pairs: [] };
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const grid = { x0: Math.min(...xs) - CELL, y0: Math.min(...ys) - CELL };
  grid.nx = Math.ceil((Math.max(...xs) - grid.x0) / CELL) + 2;
  grid.ny = Math.ceil((Math.max(...ys) - grid.y0) / CELL) + 2;
  const tr = truthRooms.map((r) => raster(r.polygon, grid)), pr = predRooms.map((r) => raster(r.polygon, grid));
  const cand = [];
  tr.forEach((a, i) => pr.forEach((b, j) => { const v = iou(a, b); if (v >= IOU_MATCH) cand.push({ i, j, iou: v }); }));
  cand.sort((x, y) => y.iou - x.iou || x.i - y.i || x.j - y.j);
  const usedT = new Set(), usedP = new Set(), pairs = [];
  for (const c of cand) {
    if (usedT.has(c.i) || usedP.has(c.j)) continue;
    usedT.add(c.i); usedP.add(c.j); pairs.push(c);
  }
  return { pairs };
}

function matchOpenings(truthOps, predOps) {
  const cand = [];
  truthOps.forEach((a, i) => predOps.forEach((b, j) => {
    if (a.kind !== b.kind) return;
    const d = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);
    if (d <= OPENING_CENTER && Math.abs(a.width - b.width) <= OPENING_WIDTH) cand.push({ i, j, d });
  }));
  cand.sort((x, y) => x.d - y.d || x.i - y.i || x.j - y.j);
  const usedT = new Set(), usedP = new Set();
  let tp = 0;
  for (const c of cand) { if (usedT.has(c.i) || usedP.has(c.j)) continue; usedT.add(c.i); usedP.add(c.j); tp++; }
  return tp;
}

const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function scorePlans(truthPlan, predPlan) {
  const tv = validatePlan(truthPlan);
  if (!tv.normalized) throw new Error('The truth plan is not usable: ' + JSON.stringify(tv.errors[0]));
  const truth = tv.normalized;
  const pv = validatePlan(predPlan);
  const zero = { composite: 0, parsed: pv.normalized !== null, valid: false, levelsMatch: false, scaleErrorPct: null, rooms: { truth: truth.levels.reduce((n, l) => n + l.rooms.length, 0), pred: 0, matched: 0, precision: 0, recall: 0, f1: 0, meanIoU: 0, areaMapePct: null, areaScore: 0 }, wallLengthRatio: 0, openings: { f1: 0, doorF1: 0, windowF1: 0 }, connectivityF1: 0, errors: pv.errors.length, warnings: pv.warnings.length };
  if (!pv.normalized) return zero;
  const pred = pv.normalized;
  const al = align(truth, pred);

  const levelsMatch = truth.levels.length === pred.levels.length;
  let nTruthRooms = 0, nPredRooms = 0, matched = 0, iouSum = 0, apeSum = 0, apeN = 0;
  const truthRoomIndex = [], predToTruth = new Map();
  const ops = { door: { tp: 0, p: 0, t: 0 }, window: { tp: 0, p: 0, t: 0 } };
  const levelCount = Math.max(truth.levels.length, pred.levels.length);
  for (let li = 0; li < levelCount; li++) {
    const tl = truth.levels[li] ? alignedLevel(truth.levels[li], { s: 1, map: (p) => p }) : { rooms: [], walls: [], openings: [] };
    const pl = pred.levels[li] ? alignedLevel(pred.levels[li], al) : { rooms: [], walls: [], openings: [] };
    nTruthRooms += tl.rooms.length; nPredRooms += pl.rooms.length;
    const { pairs } = matchRooms(tl.rooms, pl.rooms);
    for (const p of pairs) {
      matched++; iouSum += p.iou;
      const ta = tl.rooms[p.i].area;
      if (ta > 1e-9) { apeSum += Math.abs(pl.rooms[p.j].area - ta) / ta; apeN++; }
      predToTruth.set(`${li}:${p.j}`, `${li}:${p.i}`);
    }
    truthRoomIndex.push(tl.rooms.length);
    const to = openingPoints(tl), po = openingPoints(pl);
    for (const kind of ['door', 'window']) {
      const a = to.filter((o) => o.kind === kind), b = po.filter((o) => o.kind === kind);
      ops[kind].tp += matchOpenings(a, b); ops[kind].p += b.length; ops[kind].t += a.length;
    }
  }
  const precision = nPredRooms ? matched / nPredRooms : 0, recall = nTruthRooms ? matched / nTruthRooms : 0;
  const roomF1 = f1(matched, nPredRooms, nTruthRooms);
  const meanIoU = nTruthRooms ? iouSum / nTruthRooms : 0;
  const mape = apeN ? apeSum / apeN : null;
  const areaScore = mape === null ? 0 : clamp(100 * (1 - mape / 0.3), 0, 100);
  const doorF1 = f1(ops.door.tp, ops.door.p, ops.door.t), windowF1 = f1(ops.window.tp, ops.window.p, ops.window.t);
  const openingsF1 = f1(ops.door.tp + ops.window.tp, ops.door.p + ops.window.p, ops.door.t + ops.window.t);

  // connectivity: undirected room graph through doors, passages and stairs, compared on matched rooms
  const tEdges = new Set(roomGraph(truth).edges.map((e) => edgeKey(`${e.a.l}:${e.a.r}`, `${e.b.l}:${e.b.r}`)));
  const pEdgesAll = new Set(roomGraph(pred).edges.map((e) => edgeKey(`${e.a.l}:${e.a.r}`, `${e.b.l}:${e.b.r}`)));
  let tpEdges = 0;
  for (const k of pEdgesAll) {
    const [a, b] = k.split('|').map((id) => predToTruth.get(id));
    if (a && b && tEdges.has(edgeKey(a, b))) tpEdges++;
  }
  const connectivityF1 = f1(tpEdges, pEdgesAll.size, tEdges.size);

  const tLen = truth.levels.reduce((n, l) => n + l.walls.reduce((m, w) => m + w.length, 0), 0);
  const pLen = pred.levels.reduce((n, l) => n + l.walls.reduce((m, w) => m + w.length, 0), 0) * al.s;
  const composite = 30 * roomF1 + 20 * meanIoU + 15 * openingsF1 + 15 * connectivityF1 + 10 * (areaScore / 100) + 10 * (pv.ok ? 1 : 0);
  const r = (v, d = 3) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    composite: r(composite, 1), parsed: true, valid: pv.ok, levelsMatch, scaleErrorPct: r(Math.abs(al.s - 1) * 100, 1),
    rooms: { truth: nTruthRooms, pred: nPredRooms, matched, precision: r(precision), recall: r(recall), f1: r(roomF1), meanIoU: r(meanIoU), areaMapePct: mape === null ? null : r(mape * 100, 1), areaScore: r(areaScore, 1) },
    wallLengthRatio: r(tLen > 0 ? pLen / tLen : 0),
    openings: { f1: r(openingsF1), doorF1: r(doorF1), windowF1: r(windowF1) },
    connectivityF1: r(connectivityF1),
    errors: pv.errors.length, warnings: pv.warnings.length,
  };
}

function main(argv) {
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    process.stderr.write('usage: node eval/score.mjs <truth.json> <pred.json> [--json]\n');
    process.exit(2);
  }
  const read = (f) => {
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { process.stderr.write(`cannot read ${f}: ${e.message}\n`); process.exit(2); }
  };
  const truth = read(files[0]);
  let pred;
  try { pred = JSON.parse(readFileSync(files[1], 'utf8')); } catch { pred = null; }
  const res = scorePlans(truth, pred);
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(res, null, 2)}\n`); return; }
  const o = res;
  process.stdout.write([
    `composite ${o.composite} / 100   (parsed ${o.parsed}, valid ${o.valid}, levels match ${o.levelsMatch}, scale error before alignment ${o.scaleErrorPct}%)`,
    `rooms: ${o.rooms.matched}/${o.rooms.truth} matched, ${o.rooms.pred} predicted, precision ${o.rooms.precision}, recall ${o.rooms.recall}, F1 ${o.rooms.f1}, mean IoU ${o.rooms.meanIoU}, area error ${o.rooms.areaMapePct}%`,
    `openings F1 ${o.openings.f1} (doors ${o.openings.doorF1}, windows ${o.openings.windowF1}), connectivity F1 ${o.connectivityF1}, wall length ratio ${o.wallLengthRatio}`,
    '',
  ].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
