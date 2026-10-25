// End to end in headless Chrome: while the levels pull apart the camera stays where it is, so the ground floor stands still on the screen
// and the whole model stays inside the free area; ?framing=live brings back the earlier behaviour, where the frame follows the extent.
// The ground floor is found from outside: the corners of its slab are projected with the camera that state() reports.
// Builds the page into a temporary folder first. Skips with a clear message when Chrome is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { openPhone, skipReason } from './phone-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-explode-frame-'));
const page = join(out, 'planwalk.html');
const skip = skipReason();
const SIZE = { width: 1280, height: 720, dpr: 1, mobile: false };
const read = (p) => readFileSync(join(root, p), 'utf8');

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

// Where the corners of the ground floor slab land on the screen (CSS px), from the camera the page reports.
function groundOnScreen(model, st, w, h) {
  const rad = (d) => (d * Math.PI) / 180, { x, y, z, yaw, pitch } = st.camera, cp = Math.cos(rad(pitch));
  const cam = new THREE.PerspectiveCamera(50, w / h, 0.05, 2000);
  cam.position.set(x, y, z);
  cam.lookAt(x + cp * Math.cos(rad(yaw)), y + Math.sin(rad(pitch)), z + cp * Math.sin(rad(yaw)));
  cam.updateMatrixWorld();
  const b = model.bounds, y0 = model.levels[0].elevation;
  const px = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(([cx, cz]) => {
    const q = new THREE.Vector3(cx, y0, cz).project(cam);
    return { x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h };
  });
  const near = px.reduce((a, c) => (c.y > a.y ? c : a));
  return { near, width: Math.max(...px.map((c) => c.x)) - Math.min(...px.map((c) => c.x)) };
}

async function open(search, planText) {
  const p = await openPhone(page, { ...SIZE, search });
  const ok = await p.evaluate(`(() => { const r = window.planwalk.load(${JSON.stringify(JSON.parse(planText))}); window.planwalk.advanceTime(300); return r.ok; })()`);
  assert.equal(ok, true, 'the plan loads');
  return p;
}
const look = async (p, model) => {
  const [st, fr] = await p.evaluate('[window.planwalk.state(), window.planwalk.framing()]');
  return { ...groundOnScreen(model, st, SIZE.width, SIZE.height), st, margin: Math.min(...Object.values(fr.margins)) };
};
const modelOf = (planText) => buildModel(validatePlan(JSON.parse(planText)).normalized);
const away = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('the ground floor stands still while the levels pull apart, and the whole model stays inside the free area', { skip, timeout: 180000 }, async () => {
  const text = read('tests/fixtures/duplex-min.plan.json'), model = modelOf(text);
  const p = await open('', text);
  try {
    const rest = await look(p, model);
    for (const e of [0.25, 0.5, 0.75, 1]) {
      await p.evaluate(`window.planwalk.setExplode(${e}); window.planwalk.advanceTime(3000)`);
      const now = await look(p, model);
      assert.equal(now.st.explode, e);
      assert.ok(away(now.near, rest.near) <= 2, `explode ${e}: the corner of the ground floor moved ${away(now.near, rest.near).toFixed(2)} px`);
      assert.ok(Math.abs(now.width - rest.width) <= 2, `explode ${e}: the ground floor is ${now.width.toFixed(1)} px wide, it was ${rest.width.toFixed(1)}`);
      assert.ok(now.margin >= 0.04, `explode ${e}: the model comes within ${(now.margin * 100).toFixed(1)} percent of the edge of the free area`);
    }
    // frame by frame on the way back, as the animation runs
    await p.evaluate('window.planwalk.setExplode(0)');
    let worst = 0, steps = 0;
    for (let i = 0; i < 90; i++) {
      await p.evaluate('window.planwalk.advanceTime(1000 / 60)');
      const now = await look(p, model);
      worst = Math.max(worst, away(now.near, rest.near));
      assert.ok(now.margin >= 0.04, `frame ${i}: margin ${now.margin}`);
      steps++;
      if (now.st.explode === 0) break;
    }
    assert.ok(steps > 20, `the animation ran for ${steps} frames`);
    assert.ok(worst <= 2, `the corner of the ground floor moved ${worst.toFixed(2)} px during the animation`);
    const back = await look(p, model);
    assert.ok(away(back.near, rest.near) < 0.01, 'after the trip the view is the one it started from');
    assert.deepEqual(back.st.camera, rest.st.camera, 'the camera is where it was');
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('?framing=live keeps the earlier behaviour: the frame follows the extent and the ground floor moves', { skip, timeout: 180000 }, async () => {
  const text = read('tests/fixtures/duplex-min.plan.json'), model = modelOf(text);
  const p = await open('?framing=live', text);
  try {
    const rest = await look(p, model);
    await p.evaluate('window.planwalk.setExplode(1); window.planwalk.advanceTime(3000)');
    const now = await look(p, model);
    assert.ok(away(now.near, rest.near) > 15, `the corner of the ground floor moved ${away(now.near, rest.near).toFixed(2)} px`);
    assert.ok(now.width < rest.width * 0.95, `the ground floor went from ${rest.width.toFixed(1)} to ${now.width.toFixed(1)} px`);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('a plan with one level is framed the same with and without the fixed frame', { skip, timeout: 180000 }, async () => {
  const text = read('examples/flat-1.plan.json'), model = modelOf(text);
  const shots = [];
  for (const search of ['', '?framing=live']) {
    const p = await open(search, text);
    try {
      shots.push(await look(p, model));
      assert.deepEqual(p.issues, [], 'console stays clean');
    } finally { await p.close(); }
  }
  assert.ok(away(shots[0].near, shots[1].near) <= 1, `the corner differs by ${away(shots[0].near, shots[1].near).toFixed(2)} px`);
  assert.ok(Math.abs(shots[0].width - shots[1].width) <= 1, `the width differs by ${Math.abs(shots[0].width - shots[1].width).toFixed(2)} px`);
});
