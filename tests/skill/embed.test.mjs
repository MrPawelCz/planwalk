import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'skill', 'planwalk', 'scripts', 'embed.mjs');

function run(viewerHtml, plan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planwalk-embed-'));
  const viewer = path.join(dir, 'viewer.html');
  const planFile = path.join(dir, 'plan.json');
  const out = path.join(dir, 'out.html');
  fs.writeFileSync(viewer, viewerHtml);
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const r = spawnSync(process.execPath, [script, planFile, out, '--viewer', viewer], { encoding: 'utf8' });
  const html = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { r, out: html };
}

const extract = (html) => JSON.parse(/<script type="application\/json" id="planwalk-plan">([\s\S]*?)<\/script>/.exec(html)[1]);

test('embeds the plan before </body> and round-trips the JSON', () => {
  const plan = { version: 1, name: 'T </script><b>', levels: [] };
  const { r, out } = run('<html><body><canvas></canvas></body></html>', plan);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(extract(out), plan);
  assert.equal((out.match(/<\/script>/g) ?? []).length, 1, 'plan content must not close the script tag');
});

test('replaces an existing embedded plan instead of adding a second one', () => {
  const html = '<body><script type="application/json" id="planwalk-plan">{"old":true}</script></body>';
  const { r, out } = run(html, { version: 1, levels: [] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((out.match(/id="planwalk-plan"/g) ?? []).length, 1);
  assert.deepEqual(extract(out), { version: 1, levels: [] });
});

test('exits with code 2 when the plan is not JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planwalk-embed-'));
  fs.writeFileSync(path.join(dir, 'v.html'), '<body></body>');
  fs.writeFileSync(path.join(dir, 'p.json'), '{nope');
  const r = spawnSync(process.execPath, [script, path.join(dir, 'p.json'), path.join(dir, 'o.html'), '--viewer', path.join(dir, 'v.html')], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 2);
});
