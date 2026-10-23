import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'tools/validate.mjs');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const dir = mkdtempSync(join(tmpdir(), 'planwalk-cli-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const put = (name, obj) => { const f = join(dir, name); writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
const flat = () => JSON.parse(readFileSync(join(root, 'examples/flat-1.plan.json'), 'utf8'));

test('a valid plan exits 0 and prints the summary line', () => {
  const r = run(join(root, 'examples/flat-1.plan.json'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 errors, 0 warnings/);
});

test('an invalid plan exits 1 and each line carries the code, path and a Fix sentence', () => {
  const p = flat();
  p.levels[0].openings[0].wall = 'ghost';
  const r = run(put('bad.json', p));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /E005 levels\[0\]\.openings\[0\]/);
  assert.match(r.stdout, /Fix: /);
  assert.match(r.stdout, /\d+ errors?, \d+ warnings?/);
});

test('--json prints { ok, errors, warnings }', () => {
  const p = flat();
  p.levels[0].openings[0].wall = 'ghost';
  const r = run(put('bad2.json', p), '--json');
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.ok(out.errors.length >= 1);
  assert.ok(Array.isArray(out.warnings));
});

test('--strict turns warnings into a failing exit code', () => {
  const p = flat();
  p.levels[0].rooms[0].area = 99;
  const f = put('warn.json', p);
  assert.equal(run(f).status, 0);
  assert.equal(run(f, '--strict').status, 1);
});

test('usage errors and a missing file exit 2', () => {
  assert.equal(run().status, 2);
  assert.equal(run(join(dir, 'missing.json')).status, 2);
});

test('text that is not JSON is reported as E001 with a fix, exit 1, so it can be pasted back to the AI', () => {
  const r = run(put('notjson.json', '{ nope'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^E001 /);
  assert.match(r.stdout, /Fix: /);
});
