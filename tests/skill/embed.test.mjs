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

test('reads a plan from a chat answer like the validator and prints what it repaired', () => {
  const plan = { version: 1, name: 'From a chat', levels: [] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planwalk-embed-'));
  fs.writeFileSync(path.join(dir, 'v.html'), '<html><body></body></html>');
  fs.writeFileSync(path.join(dir, 'p.txt'), `Here is the plan:\n\`\`\`json\n{"version": 1, "name": "From a chat", "levels": [],}\n\`\`\`\nNotes: guessed the scale.`);
  const out = path.join(dir, 'o.html');
  const r = spawnSync(process.execPath, [script, path.join(dir, 'p.txt'), out, '--viewer', path.join(dir, 'v.html')], { encoding: 'utf8' });
  const html = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^note: took the code block$/m);
  assert.match(r.stdout, /^note: removed trailing commas$/m);
  assert.deepEqual(extract(html), plan);
});

test('a text without a plan is refused with the reason, exit code 2', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planwalk-embed-'));
  fs.writeFileSync(path.join(dir, 'v.html'), '<body></body>');
  fs.writeFileSync(path.join(dir, 'p.txt'), 'Sorry, I cannot read the image.');
  const r = spawnSync(process.execPath, [script, path.join(dir, 'p.txt'), path.join(dir, 'o.html'), '--viewer', path.join(dir, 'v.html')], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Cannot read plan JSON: there is no JSON object in the text/);
});

test('refuses JSON that is not a plan (null, a list, an object without levels) and writes no file', () => {
  for (const notPlan of [null, [1, 2, 3], { foo: 1 }, 'text']) {
    const { r, out } = run('<html><body></body></html>', notPlan);
    assert.equal(r.status, 2, `${JSON.stringify(notPlan)}: ${r.stderr}`);
    assert.match(r.stderr, /not a plan/);
    assert.equal(out, null);
  }
});
