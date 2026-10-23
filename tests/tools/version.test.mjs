// One version everywhere: a release bumps package.json, package-lock.json and the version the viewer reports through its API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const { version } = json('package.json');

test('package.json, package-lock.json and the viewer API report the same version', () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const lock = json('package-lock.json');
  assert.equal(lock.version, version, 'package-lock.json "version" differs: run npm install --package-lock-only');
  assert.equal(lock.packages[''].version, version, 'package-lock.json root package version differs: run npm install --package-lock-only');
  const main = readFileSync(join(root, 'viewer/src/main.js'), 'utf8');
  assert.match(main, new RegExp(`^\\s*version: '${version.replace(/\./g, '\\.')}',$`, 'm'), `the api object in viewer/src/main.js has to say version: '${version}'`);
});
