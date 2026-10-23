import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boxCorners, fitView, ndcRect, projectedBox, marginsOf } from '../../viewer/src/framing.js';

const DIR = new THREE.Vector3(-0.45, 0.57, 0.68).normalize();
const BOXES = [
  { minX: 0, maxX: 8, minY: 0, maxY: 2.7, minZ: 0, maxZ: 5 }, // a flat
  { minX: -3, maxX: 12, minY: -0.2, maxY: 6, minZ: -2, maxZ: 4 }, // a duplex, offset from the origin
  { minX: 0, maxX: 2, minY: 0, maxY: 2.5, minZ: 0, maxZ: 20 }, // long and thin
];

function camera(pose, fov, aspect) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 2000);
  cam.position.copy(pose.position);
  cam.lookAt(pose.target);
  cam.updateMatrixWorld();
  return cam;
}

test('ndcRect shrinks the free rectangle by the margin on every side', () => {
  const r = ndcRect({ left: 0, top: 60, right: 400, bottom: 600 }, 400, 700, 0.05);
  assert.ok(Math.abs(r.x0 - (-0.9)) < 1e-9 && Math.abs(r.x1 - 0.9) < 1e-9);
  assert.ok(Math.abs(r.y1 - (350 - 87) / 350) < 1e-9, `top ${r.y1}`);
  assert.ok(Math.abs(r.y0 - (350 - 573) / 350) < 1e-9, `bottom ${r.y0}`);
});

test('fitView keeps every corner inside the free rectangle and touches its edge: portrait, landscape and a covered top and bottom', () => {
  for (const e of BOXES) {
    for (const [w, h, free] of [
      [390, 664, { left: 0, top: 60, right: 390, bottom: 600 }],
      [750, 340, { left: 0, top: 60, right: 750, bottom: 336 }],
      [1440, 900, { left: 0, top: 50, right: 1440, bottom: 896 }],
    ]) {
      const corners = boxCorners(e), margin = 0.05;
      const pose = fitView(corners, DIR, 50, w / h, ndcRect(free, w, h, margin));
      const m = marginsOf(projectedBox(corners, camera(pose, 50, w / h), w, h), free);
      for (const side of ['left', 'right', 'top', 'bottom']) assert.ok(m[side] >= margin - 1e-6, `${side} margin ${m[side]} for ${w}x${h}`);
      assert.ok(Math.min(m.left, m.right, m.top, m.bottom) < margin + 0.01, `the fit is tight: ${JSON.stringify(m)}`);
      // centred: opposite margins are equal on the side that is not the limiting one
      assert.ok(Math.abs(m.left - m.right) < 0.01 && Math.abs(m.top - m.bottom) < 0.01, `centred: ${JSON.stringify(m)}`);
    }
  }
});

test('the camera stays outside the box and a taller window moves it away less than a wider box does', () => {
  const e = BOXES[0], corners = boxCorners(e);
  const a = fitView(corners, DIR, 50, 390 / 664, ndcRect({ left: 0, top: 0, right: 390, bottom: 664 }, 390, 664, 0.05));
  const b = fitView(corners, DIR, 50, 1440 / 900, ndcRect({ left: 0, top: 0, right: 1440, bottom: 900 }, 1440, 900, 0.05));
  assert.ok(a.distance > b.distance, 'a narrow window needs more distance');
  for (const pose of [a, b]) {
    const p = pose.position;
    assert.ok(p.x < e.minX || p.x > e.maxX || p.y > e.maxY || p.z < e.minZ || p.z > e.maxZ, 'the camera is outside the box');
  }
});
