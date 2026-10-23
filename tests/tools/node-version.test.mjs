// The Node version the project promises is the oldest one CI runs: engines in package.json (and the root entry of the lock
// file) name it, and no document promises an older one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const matrix = read('.github/workflows/ci.yml').match(/matrix:\s*\n\s*node: \[([\d, ]+)\]/);
const oldest = Math.min(...matrix[1].split(',').map(Number));

test('engines in package.json and in the lock file name the oldest Node version of the CI matrix', () => {
  assert.equal(JSON.parse(read('package.json')).engines.node, `>=${oldest}`);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].engines.node, `>=${oldest}`);
});

test('the documents that name a Node version name none older than the oldest one CI runs', () => {
  for (const file of ['README.md', 'README.pl.md', 'CONTRIBUTING.md', 'docs/SPEC.md', 'docs/FAQ.md', 'skill/planwalk/SKILL.md']) {
    for (const [mention, version] of read(file).matchAll(/\bNode(?:\.js)? (?:>= ?)?(\d+)/g)) {
      assert.ok(Number(version) >= oldest, `${file}: "${mention}" is older than Node ${oldest}`);
    }
  }
  for (const file of ['README.md', 'CONTRIBUTING.md', 'docs/SPEC.md', 'skill/planwalk/SKILL.md']) {
    assert.match(read(file), new RegExp(`\\bNode (?:>= )?${oldest}\\b`), `${file} names the minimum, Node ${oldest}`);
  }
});
