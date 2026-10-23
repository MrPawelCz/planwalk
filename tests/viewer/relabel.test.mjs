// Room labels of the 3D scene are canvas textures made when the scene is built. A change of language redraws them in place:
// same sprites, same places, same visibility, new text (decimal comma in Polish, the ~ of an estimate, the unit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { PlanScene } from '../../viewer/src/scene.js';
import { setLang } from '../../viewer/src/i18n.js';

const drawn = []; // every fillText of the stub canvas, in order
const ctx = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 100 }) : k === 'fillText' ? (s) => { drawn.push(s); } : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const model = () => buildModel(validatePlan(JSON.parse(readFileSync(new URL('../../tests/fixtures/duplex-min.plan.json', import.meta.url), 'utf8'))).normalized);

test('relabel() draws the area text again in the current language and keeps the sprites', () => {
  setLang('en');
  const scene = new PlanScene(model(), 'clay');
  const areas = (from) => drawn.slice(from).filter((s) => /m²$/.test(s));
  const first = areas(0);
  assert.ok(first.length >= 3, `${first.length} labels`);
  assert.ok(first.every((s) => /^~?\d+(\.\d)? m²$/.test(s)), first.join(' | '));
  const sprites = [...scene.labels], maps = sprites.map((l) => l.material.map);
  sprites[0].visible = false;
  sprites[1].position.y = 1.7;
  const mark = drawn.length;
  setLang('pl');
  scene.relabel();
  const second = areas(mark);
  assert.equal(second.length, first.length, 'one new picture per label');
  assert.ok(second.every((s) => /^~?\d+(,\d)? m²$/.test(s)), second.join(' | '));
  assert.deepEqual(second.map((s) => s.replace(',', '.')), first, 'the same numbers, the decimal comma aside');
  assert.ok(second.some((s) => s.includes(',')), 'at least one area has a decimal part');
  assert.deepEqual(scene.labels, sprites, 'the sprites are the same objects');
  sprites.forEach((l, i) => assert.notEqual(l.material.map, maps[i], `label ${i} got a new picture`));
  assert.equal(sprites[0].visible, false);
  assert.equal(sprites[1].position.y, 1.7);
  setLang('en');
});

test('the data a label is redrawn from stays out of the GLB (userData)', () => {
  const scene = new PlanScene(model(), 'clay');
  for (const l of scene.labels) {
    assert.deepEqual(Object.keys(l.userData), []);
    assert.equal(typeof l.pw.name, 'string');
    assert.equal(typeof l.pw.area.m2, 'number');
  }
});
