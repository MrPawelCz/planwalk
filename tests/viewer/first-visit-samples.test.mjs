// The sample drawings offered by the first-visit card: the line and its link names exist in English and Polish, there are exactly
// three addresses on the public site, and the wording does not promise that the drawings are typical. No browser needed;
// tests/viewer/first-visit-e2e.test.mjs and phone-e2e.test.mjs look at the card in Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_COUNT, STRINGS, sampleUrl } from '../../viewer/src/first-visit.js';
import { SITE } from '../../viewer/src/site.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const src = readFileSync(join(root, 'viewer/src/first-visit.js'), 'utf8');

test('the sample line and the link name exist in English and Polish, differ between the languages, and the link name takes the number', () => {
  for (const key of ['samples', 'sampleLink']) {
    for (const lang of ['en', 'pl']) assert.ok(typeof STRINGS[lang][key] === 'string' && STRINGS[lang][key].trim().length > 0, `${lang}.${key}`);
    assert.notEqual(STRINGS.pl[key], STRINGS.en[key], key);
  }
  assert.equal(STRINGS.en.samples, 'No floor plan at hand? Try a sample drawing:');
  assert.equal(STRINGS.pl.samples, 'Nie masz rzutu pod ręką? Wypróbuj przykładowy rysunek:');
  for (const lang of ['en', 'pl']) assert.match(STRINGS[lang].sampleLink, /\{n\}/, `${lang}.sampleLink has the number`);
});

test('there are exactly three links, absolute on the public site, ending in sample-1.png to sample-3.png', () => {
  assert.equal(SAMPLE_COUNT, 3);
  const urls = Array.from({ length: SAMPLE_COUNT }, (_, i) => sampleUrl(i + 1));
  assert.deepEqual(urls, [1, 2, 3].map((n) => `${SITE}samples/sample-${n}.png`));
  for (const u of urls) {
    assert.ok(u.startsWith(SITE), `${u} starts with the site address`);
    assert.match(u, /^https:\/\/[^/]+\/planwalk\/samples\/sample-[1-3]\.png$/);
  }
});

test('the card builds each link as a download that opens a new tab safely, and no address is spelled out a second time', () => {
  assert.match(src, /target: '_blank'/);
  assert.match(src, /rel: 'noopener'/);
  assert.match(src, /download: /);
  assert.ok(!/https?:\/\//.test(src.replace(/\/\/[^\n]*/g, '')), 'the only address comes from site.js');
});

test('the wording does not call the drawings typical or representative, in either language', () => {
  const words = /typical|representative|average|typow|reprezentatyw|przeciętn/i;
  for (const lang of ['en', 'pl']) for (const key of ['samples', 'sampleLink']) assert.doesNotMatch(STRINGS[lang][key], words, `${lang}.${key}`);
  const readme = readFileSync(join(root, 'docs/samples/README.md'), 'utf8');
  assert.match(readme, /not a measure of quality/i, 'the samples README says they are not a measure of quality');
  assert.doesNotMatch(readme.replace(/not how a model reads a typical drawing/g, ''), words, 'the samples README calls them nothing typical');
});
