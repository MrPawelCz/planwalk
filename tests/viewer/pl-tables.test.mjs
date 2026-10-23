// The Polish side of every string table of the viewer, without a browser: each English key has a Polish one (and the other way
// round), placeholders and plural forms match, no long dashes, and no leftover English word from the deny list
// (tests/viewer/pl-deny.mjs). The browser side of the audit is pl-audit-e2e.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS as MAIN } from '../../viewer/src/strings.js';
import { STRINGS as HELP } from '../../viewer/src/help.js';
import { STRINGS as VISIT } from '../../viewer/src/first-visit.js';
import { strings as ERRORS } from '../../viewer/src/load-errors.js';
import { STRINGS as LANG } from '../../viewer/src/lang-switch.js';
import { STRINGS as ABOUT } from '../../viewer/src/about.js';
import { STRINGS as COMPACT } from '../../viewer/src/compact.js';
import { STRINGS as SHARE } from '../../viewer/src/share.js';
import { STRINGS as LOADED } from '../../viewer/src/loaded-note.js';
import { DASHES, KEEP, englishLeft } from './pl-deny.mjs';

const TABLES = { 'strings.js': MAIN, 'help.js': HELP, 'first-visit.js': VISIT, 'load-errors.js': ERRORS, 'lang-switch.js': LANG, 'about.js': ABOUT, 'compact.js': COMPACT, 'share.js': SHARE, 'loaded-note.js': LOADED };
const slots = (s) => [...new Set(s.match(/\{\w+\}/g) || [])].sort(); // a plural list repeats {n} in every form
// Polish text that may equal the English text: a word that is the same in both languages, a tool name, a number or a symbol only.
const SAME_WORDS = ['Plan', 'Menu'];
const sameIsFine = (s) => SAME_WORDS.includes(s) || (englishLeft(s).length === 0 && !/[a-ząćęłńóśźż]{4,}/i.test(s.replace(new RegExp(KEEP.join('|'), 'g'), '')));

for (const [file, table] of Object.entries(TABLES)) {
  test(`${file}: Polish has every English key (and nothing extra), same placeholders and plural forms, no long dashes`, () => {
    assert.deepEqual(Object.keys(table.pl).sort(), Object.keys(table.en).sort());
    for (const [key, en] of Object.entries(table.en)) {
      const pl = table.pl[key];
      assert.equal(typeof pl, 'string', `${file} pl.${key}`);
      assert.ok(pl.trim().length > 0, `${file} pl.${key} is empty`);
      assert.deepEqual(slots(pl), slots(en), `${file} ${key}: placeholders`);
      assert.ok(!DASHES.test(en) && !DASHES.test(pl), `${file} ${key}: long dash`);
      if (en.includes('|')) {
        assert.equal(pl.split('|').length, 3, `${file} ${key}: Polish has three plural forms (1 | 2 to 4 | 5 and more)`);
        assert.equal(en.split('|').length, 2, `${file} ${key}: English has two plural forms`);
      }
    }
  });

  test(`${file}: no English word left in the Polish text, no Polish text copied from English`, () => {
    const found = [];
    for (const [key, pl] of Object.entries(table.pl)) {
      const left = englishLeft(pl);
      if (left.length) found.push(`${key}: ${left.join(', ')} in "${pl}"`);
      if (pl === table.en[key] && !sameIsFine(pl)) found.push(`${key}: same as English "${pl}"`);
    }
    assert.deepEqual(found, []);
  });
}

// "Poproś AI, żeby wysłało" leaves the reader unsure about the gender of "AI"; the text says "czat" and the verb follows it.
test('Polish strings ask the chat, not "AI", to do something (no neuter verb after "AI, żeby")', () => {
  const found = [];
  for (const [file, table] of Object.entries(TABLES)) for (const [key, pl] of Object.entries(table.pl)) if (/\bAI,? żeby \p{L}+(ło|ła)\b/u.test(pl)) found.push(`${file} ${key}: ${pl}`);
  assert.deepEqual(found, []);
});

test('the deny list works: it finds English in a half translated line and leaves tool names alone', () => {
  assert.deepEqual(englishLeft('Pobierz model 3D (GLB), PNG i HTML z JSON'), []);
  assert.deepEqual(englishLeft('Wklej JSON, Copy fix request'), ['copy', 'fix', 'request']);
  assert.deepEqual(englishLeft('Paste JSON'), ['paste']);
  assert.deepEqual(englishLeft('Menu'), []);
  assert.deepEqual(englishLeft('Piętro, Rozsuń piętra, Niskie ściany'), []);
});
