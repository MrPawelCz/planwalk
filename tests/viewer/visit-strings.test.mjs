// The strings of the first-visit card and of the Help dialog: every key exists in English and Polish, nothing is empty,
// no dashes in the text, and the placeholders of both languages match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS as VISIT } from '../../viewer/src/first-visit.js';
import { STRINGS as HELP } from '../../viewer/src/help.js';

for (const [name, strings] of [['first-visit', VISIT], ['help', HELP]]) {
  test(`${name}: English and Polish have the same keys, none empty, no em or en dashes`, () => {
    assert.deepEqual(Object.keys(strings.pl).sort(), Object.keys(strings.en).sort());
    for (const lang of ['en', 'pl']) {
      for (const [k, v] of Object.entries(strings[lang])) {
        assert.equal(typeof v, 'string', `${lang}.${k}`);
        assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
        assert.ok(!/[\u2013\u2014]/.test(v), `${lang}.${k} has a long dash`);
        assert.deepEqual((v.match(/\{\w+\}/g) || []).sort(), (strings.en[k].match(/\{\w+\}/g) || []).sort(), `${lang}.${k} placeholders`);
      }
    }
  });
}

test('the Polish card text is not the English text', () => {
  for (const k of ['title', 'step1', 'step2', 'step3', 'copy', 'paste', 'privacy']) assert.notEqual(VISIT.pl[k], VISIT.en[k], k);
});
