// End to end for the two looks: headless Chrome renders the duplex in clay and in textured, the console stays clean,
// the pictures differ, and the exported GLB carries colour maps (textured) or none (clay). Skips when Chrome or dist is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chrome, chromeSkip } from '../helpers/chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skip = chromeSkip || (!existsSync(join(root, 'dist/planwalk-empty.html')) ? 'dist/planwalk-empty.html missing, run npm run build' : false);

function readGlb(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('latin1', 0, 4), 'glTF');
  const jsonLen = buf.readUInt32LE(12);
  return { json: JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)), bin: buf.subarray(20 + jsonLen + 8), size: buf.length };
}

function capture(out, look) {
  const glb = join(out, `${look}.glb`);
  const r = spawnSync(process.execPath, [join(root, 'tools/capture.mjs'), join(root, 'tests/fixtures/duplex-min.plan.json'), '--out', join(out, look), '--views', 'dollhouse,walk', '--glb', glb, '--materials', look, '--chrome', chrome, '--size', '640x360'], { encoding: 'utf8', timeout: 110000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /load: ok=true, 0 errors, 0 warnings/);
  assert.match(r.stdout, /console: 0 errors, 0 warnings/);
  const states = r.stdout.split('\n').filter((l) => l.startsWith('{"mode"')).map((l) => JSON.parse(l));
  const sha = (v) => createHash('sha1').update(readFileSync(join(out, look, `${v}.png`))).digest('hex');
  return { states, glb: readGlb(glb), shots: { dollhouse: sha('dollhouse'), walk: sha('walk') } };
}

test('textured and clay both render cleanly, differ, and export GLBs with and without colour maps', { skip, timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'planwalk-looks-'));
  try {
    const tex = capture(out, 'textured');
    const clay = capture(out, 'clay');
    assert.deepEqual(tex.states.map((s) => s.materials), ['textured', 'textured']);
    assert.deepEqual(clay.states.map((s) => s.materials), ['clay', 'clay']);
    assert.notEqual(tex.shots.dollhouse, clay.shots.dollhouse, 'the dollhouse looks different');
    assert.notEqual(tex.shots.walk, clay.shots.walk, 'the walk view looks different');

    // textured GLB: JPEG colour maps, repeating samplers, uv on every textured primitive, no normal maps by default, a sane size
    const { json, bin, size } = tex.glb;
    assert.ok(json.images?.length >= 4, `${json.images?.length} images`);
    for (const im of json.images) {
      assert.equal(im.mimeType, 'image/jpeg');
      const v = json.bufferViews[im.bufferView];
      assert.deepEqual([...bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + 3)], [0xff, 0xd8, 0xff], 'JPEG signature');
    }
    assert.ok(json.samplers.length >= 1 && json.samplers.every((s) => s.wrapS === 10497 && s.wrapT === 10497), 'samplers repeat on both axes');
    assert.ok(json.textures.every((t) => t.source !== undefined && t.sampler !== undefined));
    const withMap = new Set(json.materials.map((m, i) => (m.pbrMetallicRoughness?.baseColorTexture ? i : -1)).filter((i) => i >= 0));
    assert.ok(withMap.size >= 4, `${withMap.size} materials with a colour map`);
    assert.ok(json.materials.every((m) => !m.normalTexture), 'normal maps stay out of the default export');
    for (const mesh of json.meshes) for (const p of mesh.primitives) if (withMap.has(p.material)) assert.ok(p.attributes.TEXCOORD_0 !== undefined, `${mesh.name} has uv`);
    assert.ok(size < 6e6, `textured GLB is ${size} bytes`);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const n of ['level:L0', 'level:L1', 'wall:g1', 'room:r-hall', 'opening:gd1']) assert.ok(names.has(n), `textured GLB lacks node ${n}`);

    // clay GLB: no images, no textures, still compact and still named
    assert.equal(clay.glb.json.images, undefined);
    assert.equal(clay.glb.json.textures, undefined);
    assert.ok(clay.glb.size < 150000, `clay GLB is ${clay.glb.size} bytes`);
    // boxes without a texture share one unit box in the export (the exporter shares its accessors); textured boxes each own their uv
    assert.ok(clay.glb.json.accessors.length < json.accessors.length * 0.7, `clay GLB has ${clay.glb.json.accessors.length} accessors, textured ${json.accessors.length}`);
    const clayNames = new Set(clay.glb.json.nodes.map((n) => n.name));
    for (const n of names) assert.ok(clayNames.has(n), `clay GLB lacks node ${n}`);
    assert.deepEqual([...clayNames].sort(), [...names].sort(), 'the same named nodes in both looks');
    // soft furnishings and leaves exist in the textured look only (their clay boxes are left out of that export), so the counts differ a little
    assert.ok(Math.abs(clay.glb.json.nodes.length - json.nodes.length) < json.nodes.length * 0.6, `${clay.glb.json.nodes.length} clay nodes, ${json.nodes.length} textured`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('capture --zoom and --tilt move the dollhouse camera, --start takes a pitch, bad values are refused', { skip, timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'planwalk-camera-'));
  try {
    const plan = join(root, 'tests/fixtures/duplex-min.plan.json');
    const run = (name, ...extra) => {
      const r = spawnSync(process.execPath, [join(root, 'tools/capture.mjs'), plan, '--out', join(out, name), '--views', 'dollhouse,walk', '--materials', 'clay', '--chrome', chrome, '--size', '480x270', ...extra], { encoding: 'utf8', timeout: 110000 });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /console: 0 errors, 0 warnings/);
      return r.stdout.split('\n').filter((l) => l.startsWith('{"mode"')).map((l) => JSON.parse(l));
    };
    const walls = JSON.parse(readFileSync(plan, 'utf8')).levels.flatMap((l) => l.walls).flatMap((w) => [w.from, w.to]);
    const cx = (Math.min(...walls.map((p) => p[0])) + Math.max(...walls.map((p) => p[0]))) / 2, cz = (Math.min(...walls.map((p) => p[1])) + Math.max(...walls.map((p) => p[1]))) / 2;
    const away = (s) => Math.hypot(s.camera.x - cx, s.camera.z - cz); // horizontal distance to the model centre
    const base = run('base', '--tilt', '50');
    const near = run('near', '--tilt', '50', '--zoom', '0.6', '--start', '3,2.5,L0,30,-20');
    assert.ok(Math.abs(base[0].camera.pitch + 50) < 1.5, `tilt 50 looks down at ${base[0].camera.pitch}`);
    assert.ok(Math.abs(near[0].camera.pitch + 50) < 1.5, 'zoom keeps the elevation');
    assert.ok(Math.abs(away(near[0]) / away(base[0]) - 0.6) < 0.05, `zoom 0.6 gives ${away(near[0]) / away(base[0])} of the distance`);
    assert.ok(Math.abs(near[1].camera.pitch + 20) < 1.5, `walk pitch ${near[1].camera.pitch}`);
    for (const bad of [['--zoom', '9'], ['--tilt', '3'], ['--materials', 'glossy'], ['--gif-width', '50'], ['--gif-fps', '60']]) {
      const r = spawnSync(process.execPath, [join(root, 'tools/capture.mjs'), plan, '--out', join(out, 'bad'), ...bad, '--chrome', chrome], { encoding: 'utf8', timeout: 30000 });
      assert.equal(r.status, 2, `${bad.join(' ')} must be refused`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
