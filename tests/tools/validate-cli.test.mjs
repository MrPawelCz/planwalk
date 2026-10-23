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

test('a chat answer is read, every repair is printed as a note line and --strict refuses it', () => {
  const answer = `Here is your plan:\n\`\`\`json\n${JSON.stringify(flat(), null, 2).replace(/\n(\s*[}\]])/g, ',\n$1')}\n\`\`\`\nNotes: scale from the door.`;
  const f = put('answer.txt', answer);
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^note: took the code block$/m);
  assert.match(r.stdout, /^note: removed trailing commas$/m);
  assert.match(r.stdout, /0 errors, 0 warnings/);
  const j = JSON.parse(run(f, '--json').stdout);
  assert.equal(j.ok, true);
  assert.deepEqual(j.repairs, ['took the code block', 'removed trailing commas']);
  assert.equal(run(f, '--strict').status, 1, 'a repaired text is not strictly valid');
  const clean = run(join(root, 'examples/flat-1.plan.json'), '--json', '--strict');
  assert.equal(clean.status, 0);
  assert.deepEqual(JSON.parse(clean.stdout).repairs, []);
  assert.doesNotMatch(run(join(root, 'examples/flat-1.plan.json')).stdout, /note:/);
});

test('an unknown property is a warning (exit 0); --strict makes it an error (exit 1)', () => {
  const p = flat();
  p.levels[0].rooms[0].furniture = [];
  const f = put('unknown.json', p);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^W116 levels\[0\]\.rooms\[0\] "living": .*unknown property "furniture".* Fix: /m);
  assert.match(r.stdout, /0 errors, 1 warnings/);
  const s = run(f, '--strict');
  assert.equal(s.status, 1);
  assert.match(s.stdout, /^E002 levels\[0\]\.rooms\[0\] "living": .*unknown property "furniture"/m);
  assert.match(s.stdout, /1 errors, 0 warnings/);
  p['x-tool'] = 1;
  p.$schema = 'https://example.com/s.json';
  assert.match(run(put('ext.json', p), '--strict').stdout, /1 errors, 0 warnings/, '$schema and x- keys add nothing');
});

test('a plan in which some elements have errors exits 1 and says how many the viewer would skip', () => {
  const p = flat();
  p.levels[0].openings[1].width = 0;
  const one = run(put('partial1.json', p));
  assert.equal(one.status, 1);
  assert.match(one.stdout, /^E002 levels\[0\]\.openings\[1\]\.width/m);
  assert.match(one.stdout, /^1 element would be skipped when opened in the viewer$/m);
  p.levels[0].furniture[0].center = 'x';
  const two = run(put('partial2.json', p));
  assert.equal(two.status, 1);
  assert.match(two.stdout, /^2 elements would be skipped when opened in the viewer$/m);
  const j = JSON.parse(run(put('partial2.json', p), '--json').stdout);
  assert.equal(j.ok, false);
  assert.equal(j.partial, true);
  assert.deepEqual(j.skipped.map((s) => s.kind).sort(), ['furniture', 'opening']);
  assert.doesNotMatch(run(join(root, 'examples/flat-1.plan.json')).stdout, /skipped/, 'nothing is said about a good plan');
  const none = flat();
  none.levels[0].walls.forEach((w) => { w.from = 'a'; });
  const gone = run(put('none.json', none));
  assert.equal(gone.status, 1);
  assert.doesNotMatch(gone.stdout, /would be skipped/);
  assert.match(gone.stdout, /nothing usable would be left/);
  assert.equal(JSON.parse(run(put('none.json', none), '--json').stdout).partial, false);
});

test('two plans in one answer: the CLI says which one it read', () => {
  const second = { ...flat(), name: 'Corrected' };
  const r = run(put('two.txt', `First:\n${JSON.stringify(flat())}\nCorrected:\n${JSON.stringify(second)}`), '--json');
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.ok(out.repairs.includes('found 2 plans, loaded the last one'), out.repairs.join('|'));
});
