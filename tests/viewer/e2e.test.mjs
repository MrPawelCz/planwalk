// End to end: headless Chrome loads dist/planwalk-empty.html, renders a two level plan in every mode,
// checks the console, the public API and the GLB export. Skips with a clear message when Chrome or dist is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chrome, chromeSkip } from '../helpers/chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skip = chromeSkip || (!existsSync(join(root, 'dist/planwalk-empty.html')) ? 'dist/planwalk-empty.html missing, run npm run build' : false);

test('viewer renders every mode, exports a GLB with named nodes, console stays clean', { skip, timeout: 120000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'planwalk-e2e-'));
  try {
    const glb = join(out, 'model.glb');
    const r = spawnSync(process.execPath, [join(root, 'tools/capture.mjs'), join(root, 'tests/fixtures/duplex-min.plan.json'), '--out', out, '--glb', glb, '--chrome', chrome, '--size', '960x540'], { encoding: 'utf8', timeout: 110000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /load: ok=true, 0 errors, 0 warnings/);
    assert.match(r.stdout, /console: 0 errors, 0 warnings/);
    for (const v of ['dollhouse', 'explode', 'top', 'walk']) assert.ok(statSync(join(out, `${v}.png`)).size > 5000, `${v}.png is too small to be a render`);

    // state() per view
    const states = r.stdout.split('\n').filter((l) => l.startsWith('{"mode"')).map((l) => JSON.parse(l));
    assert.deepEqual(states.map((s) => s.mode), ['dollhouse', 'dollhouse', 'top', 'walk']);
    assert.equal(states[1].explode, 1);
    assert.deepEqual(states[0].counts, { levels: 2, walls: 10, openings: 6, rooms: 4, furniture: 3, stairs: 1 });
    // the exterior door gd1 sits at offset 1.0 from the (8, 5) end of wall g3, so the entrance room is the living room
    assert.equal(states[3].room, 'r-living');

    // GLB container and node names
    const buf = readFileSync(glb);
    assert.equal(buf.toString('latin1', 0, 4), 'glTF');
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const names = new Set(json.nodes.map((n) => n.name));
    for (const n of ['level:L0', 'level:L1', 'wall:g1', 'room:r-hall', 'opening:gd1']) assert.ok(names.has(n), `GLB lacks node ${n}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a one-floor plan with stairs that leave the plan loads cleanly', { skip, timeout: 120000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'planwalk-e2e-'));
  try {
    const run = (...extra) => spawnSync(process.execPath, [join(root, 'tools/capture.mjs'), join(root, 'tests/fixtures/flat-stairs-out.plan.json'), '--out', out, '--views', 'dollhouse,top', '--chrome', chrome, '--size', '960x540', ...extra], { encoding: 'utf8', timeout: 110000 });
    const r = run('--no-panel');
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /load: ok=true, 0 errors, 0 warnings/);
    assert.match(r.stdout, /console: 0 errors, 0 warnings/);
    const states = r.stdout.split('\n').filter((l) => l.startsWith('{"mode"')).map((l) => JSON.parse(l));
    assert.deepEqual(states.map((s) => s.mode), ['dollhouse', 'top']);
    assert.equal(states[0].counts.stairs, 2);
    for (const v of ['dollhouse', 'top']) assert.ok(statSync(join(out, `${v}.png`)).size > 5000);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('--no-panel removes the issues panel from the pictures', { skip, timeout: 120000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'planwalk-e2e-'));
  try {
    const plan = JSON.parse(readFileSync(join(root, 'tests/fixtures/flat-stairs-out.plan.json'), 'utf8'));
    plan.levels[0].rooms[0].area = 99; // a W102 warning makes the viewer show its issues panel
    const file = join(out, 'warn.plan.json');
    writeFileSync(file, JSON.stringify(plan));
    const picture = (dir, ...extra) => {
      const r = spawnSync(process.execPath, [join(root, 'tools/capture.mjs'), file, '--out', join(out, dir), '--views', 'top', '--chrome', chrome, '--size', '960x540', ...extra], { encoding: 'utf8', timeout: 110000 });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /load: ok=true, 0 errors, 1 warnings/);
      return createHash('sha1').update(readFileSync(join(out, dir, 'top.png'))).digest('hex');
    };
    assert.notEqual(picture('with-panel'), picture('no-panel', '--no-panel'), 'the flag must change the picture when the panel would show');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
