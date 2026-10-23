// tools/validate-glb.mjs turns a Khronos validator report into lines and counts; only errors fail the CI step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarize } from '../../tools/validate-glb.mjs';

test('summarize counts severities and prints one line per message', () => {
  const s = summarize({ issues: { numErrors: 1, numWarnings: 0, numInfos: 1, numHints: 0, messages: [
    { code: 'ACCESSOR_TOTAL_OFFSET_ALIGNMENT', message: 'Offset is not aligned.', pointer: '/accessors/3', severity: 0 },
    { code: 'UNUSED_OBJECT', message: 'This object may be unused.', pointer: '/meshes/0/primitives/0/attributes/TEXCOORD_0', severity: 2 },
  ] } });
  assert.deepEqual([s.errors, s.warnings, s.infos, s.hints], [1, 0, 1, 0]);
  assert.equal(s.lines[0], 'error ACCESSOR_TOTAL_OFFSET_ALIGNMENT at /accessors/3: Offset is not aligned.');
  assert.match(s.lines[1], /^info UNUSED_OBJECT at \/meshes\/0\//);
});

test('summarize survives a report without issues', () => {
  assert.deepEqual(summarize({}), { errors: 0, warnings: 0, infos: 0, hints: 0, lines: [] });
});

test('the command line explains its usage when the validator directory is not given', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../../tools/validate-glb.mjs', import.meta.url)), 'x.glb'], { encoding: 'utf8', env: { ...process.env, GLTF_VALIDATOR_DIR: '' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: GLTF_VALIDATOR_DIR=/);
});
