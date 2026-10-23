// Soft solids of the textured look: rounded and puffed boxes, leaf blades, and the rule that they exist in one look only.
// The label canvases need a document; a tiny stub is enough because nothing is drawn here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { PlanScene } from '../../viewer/src/scene.js';
import { softBoxGeometry, leafGeometry } from '../../viewer/src/soft.js';

const ctx = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 100 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const near = (a, b, what, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b}`);
const duplex = () => buildModel(validatePlan(JSON.parse(readFileSync(new URL('../../examples/duplex-1.plan.json', import.meta.url), 'utf8'))).normalized);

test('a soft box keeps its size, rounds its corners and raises only the top when puffed', () => {
  const flat = softBoxGeometry(0.8, 0.2, 0.5, 0.05, 0, 0, 0, 0, 1);
  const puffed = softBoxGeometry(0.8, 0.2, 0.5, 0.05, 0.03, 0, 0, 0, 1);
  for (const [g, top] of [[flat, 0.1], [puffed, 0.13]]) {
    near(g.boundingBox.max.x, 0.4, 'max x'); near(g.boundingBox.min.x, -0.4, 'min x');
    near(g.boundingBox.max.z, 0.25, 'max z'); near(g.boundingBox.min.z, -0.25, 'min z');
    near(g.boundingBox.max.y, top, 'max y'); near(g.boundingBox.min.y, -0.1, 'min y');
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv');
    let cornerGap = 1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      assert.ok(Number.isFinite(x + y + z + uv.getX(i) + uv.getY(i)), `vertex ${i} is finite`);
      near(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)), 1, `normal ${i} length`, 1e-5);
      cornerGap = Math.min(cornerGap, Math.hypot(Math.abs(x) - 0.4, Math.abs(y) - 0.1, Math.abs(z) - 0.25));
    }
    assert.ok(cornerGap > 0.01, `the corners are rounded away (nearest vertex ${cornerGap.toFixed(4)} m from a corner)`);
  }
});

test('soft boxes are deterministic and never round more than half of the thinnest side', () => {
  const a = softBoxGeometry(0.6, 0.1, 0.4, 0.5, 0.02, 1, 2, 3, 2), b = softBoxGeometry(0.6, 0.1, 0.4, 0.5, 0.02, 1, 2, 3, 2);
  assert.deepEqual(Array.from(a.getAttribute('position').array), Array.from(b.getAttribute('position').array));
  assert.deepEqual(Array.from(a.getAttribute('uv').array), Array.from(b.getAttribute('uv').array));
  near(a.boundingBox.max.x, 0.3, 'width kept'); near(a.boundingBox.min.y, -0.05, 'height kept');
});

test('the uv of a soft box are metres in the furniture frame: the top face spans its width times the repeats per metre', () => {
  const k = 2.5, w = 0.8, r = 0.05, g = softBoxGeometry(w, 0.2, 0.5, r, 0, 0.4, 0.3, 0.2, k);
  const nor = g.getAttribute('normal'), uv = g.getAttribute('uv'), pos = g.getAttribute('position');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (nor.getY(i) < 0.999) continue;
    lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i));
  }
  near(hi - lo, (w - 2 * r) * k, 'top face u extent', 1e-5);
  near((hi + lo) / 2, 0.4 * k, 'top face is centred on the box centre in the furniture frame', 1e-5);
});

test('a leaf blade is one metre long, wide in the middle, and its uv run once across the texture', () => {
  const g = leafGeometry();
  assert.equal(leafGeometry(), g, 'one shared geometry');
  near(g.boundingBox.min.y, 0, 'base at the origin'); near(g.boundingBox.max.y, 1, 'tip at one metre');
  assert.ok(g.boundingBox.max.x > 0.15 && g.boundingBox.max.x <= 0.3, `half width ${g.boundingBox.max.x}`);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1, `uv ${i}`);
  assert.ok(g.getAttribute('normal').count === g.getAttribute('position').count, 'normals computed');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < nor.count; i++) near(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)), 1, `leaf normal ${i} has unit length (the GLB exporter warns about anything else)`, 1e-5);
});

test('soft furnishings, leaves and their clay stand-ins show in one look only', () => {
  const scene = new PlanScene(duplex(), 'textured');
  scene.setCut(1.2); // the dark wall caps show only on a cut wall
  const list = (look) => { const out = []; scene.group.traverse((o) => { if (o.isMesh && o.pw?.look === look) out.push(o); }); return out; };
  const plain = []; // furniture meshes that belong to both looks (the ceilings and cut walls manage their own visibility)
  scene.group.traverse((o) => { if (o.isMesh && !o.pw?.look && o.pw?.mat && o.parent?.name?.startsWith('furniture:')) plain.push(o); });
  assert.ok(plain.length > 100, `${plain.length} furniture meshes in both looks`);
  assert.ok(list('textured').length > 60, `${list('textured').length} textured only meshes`);
  assert.ok(list('clay').length > 10, `${list('clay').length} clay only meshes`);
  for (const look of ['textured', 'clay', 'textured']) {
    scene.setMaterials(look);
    for (const m of list('textured')) assert.equal(m.visible, look === 'textured', `${m.pw.mat} in ${look}`);
    for (const m of list('clay')) assert.equal(m.visible, look === 'clay', `${m.pw.mat} in ${look}`);
    for (const m of plain) assert.equal(m.visible, true, `${m.pw.mat} is shown in both looks`);
  }
});

test('every soft piece has a clay box of the same material, so the clay look keeps its shapes', () => {
  const scene = new PlanScene(duplex(), 'clay');
  const count = (look, name) => { let n = 0; scene.group.traverse((o) => { if (o.isMesh && o.pw?.look === look && o.pw.mat === name) n++; }); return n; };
  for (const name of ['f:fabric', 'f:cushion', 'f:bedding', 'f:pillow']) {
    assert.ok(count('clay', name) > 0, `${name} has clay boxes`);
    assert.equal(count('textured', name), count('clay', name), `${name}: one soft mesh per clay box`);
  }
  const leaves = (look) => ['f:leaf1', 'f:leaf2', 'f:leaf3'].reduce((s, n) => s + count(look, n), 0);
  assert.equal(leaves('clay'), 9, 'three clay spheres on each of the three plants');
  assert.equal(leaves('textured'), 58, 'seventeen leaf blades on each of three plants, three in the vase on the coffee table, four in the one on the dining table');
});

test('the dark wall caps show only in the textured look while the walls are cut, and sit on the cut height', () => {
  const scene = new PlanScene(duplex(), 'textured');
  const caps = [];
  scene.group.traverse((o) => { if (o.isMesh && o.pw?.mat === 'wallcap') caps.push(o); });
  assert.ok(caps.length > 20, `${caps.length} caps`);
  assert.ok(caps.every((c) => !c.visible), 'no caps without a cut: the ceiling closes a full height wall');
  scene.setCut(1.2);
  const shown = caps.filter((c) => c.visible);
  assert.ok(shown.length > 10, `${shown.length} caps on a cut wall`);
  for (const c of shown) near(c.position.y - c.scale.y / 2, 1.2, 'a cap sits on the cut height', 1e-6);
  scene.setMaterials('clay');
  assert.ok(caps.every((c) => !c.visible), 'no caps in the clay look');
  scene.setMaterials('textured');
  assert.equal(caps.filter((c) => c.visible).length, shown.length, 'the same caps are back in the textured look');
  scene.setCut(null);
  assert.ok(caps.every((c) => !c.visible), 'no caps on full height walls');
});
