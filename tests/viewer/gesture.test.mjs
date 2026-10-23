import test from 'node:test';
import assert from 'node:assert/strict';
import { TOP_HALF_MAX, TOP_HALF_MIN, panTop, pinchTop, planAt } from '../../viewer/src/gesture.js';

const W = 390, H = 664;
const view = { cx: 4, cz: 2.5, half: 5 };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('one finger: the plan follows the finger, 2 * half / height metres per pixel', () => {
  const v = panTop(view, { x: 200, y: 300 }, { x: 260, y: 270 }, H);
  const k = (2 * view.half) / H;
  near(v.cx, view.cx - 60 * k);
  near(v.cz, view.cz + 30 * k);
  assert.equal(v.half, view.half);
  // the plan point that was under the finger is under it now
  const before = planAt(view, { x: 200, y: 300 }, W, H), after = planAt(v, { x: 260, y: 270 }, W, H);
  near(before.x, after.x); near(before.z, after.z);
});

test('two fingers spreading to twice the distance zoom in to half the height, around the point between them', () => {
  const a0 = { x: 150, y: 330 }, b0 = { x: 250, y: 330 }, a1 = { x: 100, y: 330 }, b1 = { x: 300, y: 330 };
  const v = pinchTop(view, a0, b0, a1, b1, W, H);
  near(v.half, view.half / 2);
  const m = { x: 200, y: 330 };
  const before = planAt(view, m, W, H), after = planAt(v, m, W, H);
  near(before.x, after.x, 1e-9); near(before.z, after.z, 1e-9);
});

test('pinching in zooms out, and the same move shifted sideways pans as well', () => {
  const a0 = { x: 100, y: 300 }, b0 = { x: 300, y: 300 }, a1 = { x: 180, y: 320 }, b1 = { x: 260, y: 320 };
  const v = pinchTop(view, a0, b0, a1, b1, W, H);
  near(v.half, view.half * 2.5);
  // the plan point under the old midpoint (200, 300) is under the new midpoint (220, 320)
  const was = planAt(view, { x: 200, y: 300 }, W, H), now = planAt(v, { x: 220, y: 320 }, W, H);
  near(was.x, now.x, 1e-9); near(was.z, now.z, 1e-9);
  // fingers that only slide together keep the zoom and pan like one finger
  const s = pinchTop(view, a0, b0, { x: 160, y: 280 }, { x: 360, y: 280 }, W, H);
  near(s.half, view.half);
  const one = panTop(view, { x: 200, y: 300 }, { x: 260, y: 280 }, H);
  near(s.cx, one.cx); near(s.cz, one.cz);
});

test('the zoom stays between the limits of the mouse wheel', () => {
  const far = pinchTop(view, { x: 190, y: 300 }, { x: 210, y: 300 }, { x: 0, y: 300 }, { x: 390, y: 300 }, W, H);
  assert.equal(far.half, TOP_HALF_MIN);
  const wide = pinchTop({ ...view, half: 300 }, { x: 0, y: 300 }, { x: 390, y: 300 }, { x: 190, y: 300 }, { x: 200, y: 300 }, W, H);
  assert.equal(wide.half, TOP_HALF_MAX);
});

test('fingers that touch or bad numbers never give NaN or a jump', () => {
  const same = { x: 200, y: 300 };
  const v = pinchTop(view, same, { x: 203, y: 300 }, { x: 100, y: 300 }, { x: 300, y: 300 }, W, H);
  assert.equal(v.half, view.half, 'a start closer than 8 px gives no zoom ratio');
  for (const bad of [pinchTop(view, { x: NaN, y: 0 }, same, same, same, W, H), pinchTop(view, same, same, same, same, 0, H), panTop(view, same, { x: Infinity, y: 0 }, H), panTop(view, same, same, 0)]) {
    assert.deepEqual(bad, view);
  }
});
