// The licence text travels with the shipped files: the single-file viewer carries the full MIT text of planwalk and of
// three.js in an HTML comment, and the skill folder (copied alone) has its own LICENSE file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const license = read('LICENSE').trim();
const third = read('THIRD_PARTY_LICENSES.md');
const three = third.slice(third.indexOf('\n## three.js\n') + 13, third.indexOf('\n## esbuild\n')).trim();
const PAGES = ['dist/planwalk.html', 'dist/planwalk-empty.html', 'skill/planwalk/assets/planwalk.html'];

test('the LICENSE file is the MIT text and the three.js section of THIRD_PARTY_LICENSES.md is found', () => {
  assert.match(license, /^MIT License\n\nCopyright \(c\) 2026 /);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(three, /^The MIT License\n\nCopyright .* three\.js authors/);
  assert.match(three, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

for (const rel of PAGES) {
  test(`${rel} starts with the full licence text of planwalk and three.js inside an HTML comment`, () => {
    assert.ok(existsSync(join(root, rel)), `${rel} is missing: run npm run build:skill`);
    const html = read(rel);
    const head = html.slice(0, html.indexOf('<script'));
    const comment = head.match(/<!--\n([\s\S]*?)\n-->/);
    assert.ok(comment, 'no licence comment before the first script');
    assert.ok(comment[1].includes(license), 'the project LICENSE text is not in the comment');
    assert.ok(comment[1].includes(three), 'the three.js licence text is not in the comment');
    assert.ok(!comment[1].includes('--'), 'two hyphens would end an HTML comment early');
    const charset = html.indexOf('<meta charset=');
    assert.ok(charset >= 0 && charset < 1024, `the charset declaration is at byte ${charset}, it has to be within the first 1024`);
    assert.ok(charset < html.indexOf('<!--\n'), 'the licence comment has to come after the charset declaration');
  });
}

test('the skill folder carries its own LICENSE, identical to the repository one', () => {
  assert.ok(existsSync(join(root, 'skill/planwalk/LICENSE')), 'skill/planwalk/LICENSE is missing: run npm run build:skill');
  assert.equal(read('skill/planwalk/LICENSE'), read('LICENSE'));
});
