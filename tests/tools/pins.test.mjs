// Build inputs are pinned: dev dependencies carry exact versions (no ^ or ~), package-lock.json agrees with package.json,
// and every GitHub Actions step is pinned to a commit sha (preferred, with the version in a comment) or to a version tag, never to a branch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const pkg = json('package.json');
const lock = json('package-lock.json');

test('devDependencies are exact versions and the lockfile root entry says the same', () => {
  for (const [name, range] of Object.entries(pkg.devDependencies)) {
    assert.match(range, /^\d+\.\d+\.\d+$/, `${name} is "${range}": pin it to an exact version (npm install --save-exact)`);
    assert.equal(lock.packages[''].devDependencies[name], range, `package-lock.json disagrees with package.json for ${name}: run npm install --package-lock-only`);
    assert.equal(lock.packages[`node_modules/${name}`].version, range, `package-lock.json resolves ${name} to another version than the pin`);
  }
  assert.deepEqual(Object.keys(lock.packages[''].devDependencies).sort(), Object.keys(pkg.devDependencies).sort());
  assert.equal(pkg.dependencies, undefined, 'the product has no runtime dependencies');
});

test('workflow actions are pinned to a commit sha or a version tag, never to a branch', () => {
  const dir = join(root, '.github/workflows');
  const seen = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) seen.push([f, m[1]]);
  }
  assert.ok(seen.length > 0);
  for (const [f, ref] of seen) {
    const at = ref.split('@')[1] || '';
    assert.ok(/^[0-9a-f]{40}$/.test(at) || /^v\d+(\.\d+){0,2}$/.test(at), `${f}: "${ref}" must be pinned to a commit sha (with the version in a comment) or to a version tag`);
  }
});
