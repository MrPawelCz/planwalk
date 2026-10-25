// End to end in headless Chrome: while the levels pull apart the camera stays where it is, so the ground floor stands still on the screen
// and the whole model stays inside the free area; ?framing=live brings back the earlier behaviour, where the frame follows the extent.
// The ground floor is found from outside: the corners of the plan's bounds at the elevation of the first level are projected with the camera that state() reports.
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
import { buildModel, modelExtent } from '../../viewer/src/geometry.js';
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

// Where the corners of the ground floor (the plan's bounds at the elevation of the first level) land on the screen (CSS px), from the camera the page reports.
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

const PHONE = { width: 390, height: 844, dpr: 3, mobile: true }; // a phone held upright
const loadPlan = (p, planText) => p.evaluate(`(() => { const r = window.planwalk.load(${JSON.stringify(JSON.parse(planText))}); window.planwalk.advanceTime(300); return r.ok; })()`);
async function open(search, planText, size = SIZE) {
  const p = await openPhone(page, { ...size, search });
  try { assert.equal(await loadPlan(p, planText), true, 'the plan loads'); } catch (err) { await p.close(); throw err; }
  return p;
}
const look = async (p, model, size = SIZE) => {
  const [st, fr] = await p.evaluate('[window.planwalk.state(), window.planwalk.framing()]');
  return { ...groundOnScreen(model, st, size.width, size.height), st, margin: Math.min(...Object.values(fr.margins)) };
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
      assert.deepEqual(now.st.camera, rest.st.camera, `explode ${e}: the camera moved`);
      assert.ok(away(now.near, rest.near) <= 2, `explode ${e}: the corner of the ground floor moved ${away(now.near, rest.near).toFixed(2)} px`);
      assert.ok(Math.abs(now.width - rest.width) <= 2, `explode ${e}: the ground floor is ${now.width.toFixed(1)} px wide, it was ${rest.width.toFixed(1)}`);
      assert.ok(now.margin >= 0.04, `explode ${e}: the model comes within ${(now.margin * 100).toFixed(1)} percent of the edge of the free area`);
    }
    assert.ok((await look(p, model)).margin <= 0.06, 'the frame is tight: at full explode the model keeps the margin and no more');
    // frame by frame on the way back, as the animation runs
    await p.evaluate('window.planwalk.setExplode(0)');
    let worst = 0, steps = 0;
    for (let i = 0; i < 90; i++) {
      await p.evaluate('window.planwalk.advanceTime(1000 / 60)');
      const now = await look(p, model);
      worst = Math.max(worst, away(now.near, rest.near));
      assert.deepEqual(now.st.camera, rest.st.camera, `frame ${i}: the camera moved`);
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

// The two-level fixture with a copy of its upper level on top: the stack is taller, so the frame has more to hold.
const threeLevels = () => {
  const plan = JSON.parse(read('tests/fixtures/duplex-min.plan.json'));
  plan.levels.push({ ...structuredClone(plan.levels[1]), id: 'L2', name: 'Top floor' });
  return JSON.stringify(plan);
};

for (const [name, size] of [['a desktop window', SIZE], ['a phone held upright', PHONE]]) {
  test(`three levels in ${name}: the ground floor stands still and the whole model stays inside the free area`, { skip, timeout: 180000 }, async () => {
    const text = threeLevels(), model = modelOf(text);
    assert.equal(model.levels.length, 3);
    const p = await open('', text, size);
    try {
      const rest = await look(p, model, size);
      for (const e of [0.5, 1, 0]) {
        await p.evaluate(`window.planwalk.setExplode(${e}); window.planwalk.advanceTime(3000)`);
        const now = await look(p, model, size);
        assert.equal(now.st.explode, e);
        assert.ok(away(now.near, rest.near) <= 2, `explode ${e}: the corner of the ground floor moved ${away(now.near, rest.near).toFixed(2)} px`);
        assert.ok(now.margin >= 0.04, `explode ${e}: the model comes within ${(now.margin * 100).toFixed(1)} percent of the edge of the free area`);
      }
      assert.deepEqual((await look(p, model, size)).st.camera, rest.st.camera, 'after the trip the camera is where it was');
      assert.deepEqual(p.issues, [], 'console stays clean');
    } finally { await p.close(); }
  });
}

test('leaving Walk: with no model nothing throws, with a model the view is framed for the whole range again', { skip, timeout: 180000 }, async () => {
  const empty = await openPhone(join(out, 'planwalk-empty.html'), { ...SIZE });
  try {
    await empty.evaluate('window.planwalk.setMode("walk"); window.planwalk.advanceTime(100); window.planwalk.setMode("dollhouse"); window.planwalk.advanceTime(100)');
    assert.equal(await empty.evaluate('window.planwalk.state().mode'), 'dollhouse');
    assert.deepEqual(empty.issues, [], 'console stays clean');
  } finally { await empty.close(); }
  const text = read('tests/fixtures/duplex-min.plan.json'), model = modelOf(text);
  const p = await open('', text);
  try {
    const first = await look(p, model);
    await p.evaluate('window.planwalk.setExplode(1); window.planwalk.advanceTime(3000); window.planwalk.setMode("walk"); window.planwalk.advanceTime(300); window.planwalk.setMode("dollhouse"); window.planwalk.advanceTime(300)');
    const back = await look(p, model);
    assert.equal(back.st.mode, 'dollhouse');
    assert.equal(back.st.explode, 0, 'Walk stands at rest');
    assert.deepEqual(back.st.camera, first.st.camera, 'the view is the first view again');
    await p.evaluate('window.planwalk.setExplode(1); window.planwalk.advanceTime(3000)');
    const up = await look(p, model);
    assert.ok(away(up.near, first.near) <= 2, `after Walk the corner of the ground floor moved ${away(up.near, first.near).toFixed(2)} px`);
    assert.ok(up.margin >= 0.04, `after Walk the model comes within ${(up.margin * 100).toFixed(1)} percent of the edge`);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('a change of window with the slider up frames again for the whole range, and the ground floor stands still in the new window too', { skip, timeout: 180000 }, async () => {
  const text = read('tests/fixtures/duplex-min.plan.json'), model = modelOf(text), size = { ...SIZE, width: 900, height: 640 };
  const p = await open('', text);
  try {
    await p.evaluate('window.planwalk.setExplode(1); window.planwalk.advanceTime(3000)');
    await p.resize(size.width, size.height);
    const up = await look(p, model, size);
    assert.ok(up.margin >= 0.04 && up.margin <= 0.06, `in the new window the model keeps ${(up.margin * 100).toFixed(1)} percent of margin at full explode`);
    await p.evaluate('window.planwalk.setExplode(0); window.planwalk.advanceTime(3000)');
    const rest = await look(p, model, size);
    assert.ok(away(up.near, rest.near) <= 2, `in the new window the corner of the ground floor moved ${away(up.near, rest.near).toFixed(2)} px`);
    assert.ok(rest.margin >= 0.04, `at rest the model keeps ${(rest.margin * 100).toFixed(1)} percent of margin`);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('a second plan loaded with the slider up is framed for its own range, and Orbit keeps the frame', { skip, timeout: 180000 }, async () => {
  const p = await open('', read('tests/fixtures/duplex-min.plan.json'));
  try {
    await p.evaluate('window.planwalk.setExplode(1); window.planwalk.advanceTime(3000)');
    const text = threeLevels(), model = modelOf(text);
    assert.equal(await loadPlan(p, text), true);
    const rest = await look(p, model);
    assert.equal(rest.st.explode, 0, 'a new plan starts at rest');
    await p.evaluate('window.planwalk.setMode("orbit"); window.planwalk.setExplode(1); window.planwalk.advanceTime(3000)');
    const up = await look(p, model);
    assert.equal(up.st.mode, 'orbit');
    assert.deepEqual(up.st.camera, rest.st.camera, 'the camera is where the first view put it');
    assert.ok(away(up.near, rest.near) <= 2, `the corner of the ground floor moved ${away(up.near, rest.near).toFixed(2)} px`);
    assert.ok(up.margin >= 0.04, `the model comes within ${(up.margin * 100).toFixed(1)} percent of the edge`);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

// A finger dragged up the screen turns the orbit down: the camera goes as low as the polar limit lets it. The frame for the whole range of the slider has a
// target high above the middle of the house at rest, so the limit has to be widened for the camera to reach the height it reached when the frame followed the extent.
test('Orbit still goes down to the middle of the house at rest on three levels, with a finger on a phone held upright', { skip, timeout: 180000 }, async () => {
  const text = threeLevels(), model = modelOf(text), rest = modelExtent(model, 0), low = (rest.minY + rest.maxY) / 2;
  const lowest = {};
  for (const [name, search] of [['fixed', ''], ['live', '?framing=live']]) {
    const p = await open(search, text, PHONE);
    try {
      await p.evaluate('window.planwalk.setMode("orbit"); window.planwalk.advanceTime(300)');
      const start = (await look(p, model, PHONE)).st.camera.y;
      await p.touch('touchStart', [{ x: 195, y: 440 }]);
      for (let i = 1; i <= 14; i++) await p.touch('touchMove', [{ x: 195, y: 440 - i * 28 }]);
      await p.touch('touchEnd', []);
      await p.evaluate('window.planwalk.advanceTime(300)');
      lowest[name] = (await look(p, model, PHONE)).st.camera.y;
      assert.ok(lowest[name] < start - 3, `${name}: the finger took the camera from ${start.toFixed(2)} m down to ${lowest[name].toFixed(2)} m`);
      assert.deepEqual(p.issues, [], 'console stays clean');
    } finally { await p.close(); }
  }
  assert.ok(lowest.fixed <= low + 1, `the camera of the fixed frame reaches ${lowest.fixed.toFixed(2)} m, the middle of the house at rest is at ${low.toFixed(2)} m`);
  assert.ok(Math.abs(lowest.fixed - lowest.live) <= 1, `the fixed frame goes down to ${lowest.fixed.toFixed(2)} m and the earlier behaviour to ${lowest.live.toFixed(2)} m`);
});
