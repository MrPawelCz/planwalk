// The strings of the share controls: every key exists in English and Polish, nothing is empty, no em or en dashes,
// the placeholders match, and the honest sentence about what a link contains is there word for word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, linkProblem, shareHelp, standaloneTip } from '../../viewer/src/share.js';
import { setLang } from '../../viewer/src/i18n.js';

test('share: English and Polish have the same keys, none empty, no em or en dashes, same placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS.pl).sort(), Object.keys(STRINGS.en).sort());
  for (const lang of ['en', 'pl']) {
    for (const [k, v] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof v, 'string', `${lang}.${k}`);
      assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
      assert.ok(!/[–—]/.test(v), `${lang}.${k} has a long dash`);
      assert.deepEqual((v.match(/\{\w+\}/g) || []).sort(), (STRINGS.en[k].match(/\{\w+\}/g) || []).sort(), `${lang}.${k} placeholders`);
    }
  }
});

test('share: the Polish text is not the English text', () => {
  for (const k of Object.keys(STRINGS.en)) assert.notEqual(STRINGS.pl[k], STRINGS.en[k], k);
});

test('share: the sentence about what a link holds, the Standalone HTML tip and the newer browser message', () => {
  assert.equal(STRINGS.en.note, 'The plan is stored inside the link. Whoever gets the link, and the app you send it through, can read the plan.');
  assert.equal(STRINGS.en.standaloneTip, 'A single HTML file with this plan inside, to open on a computer');
  assert.equal(STRINGS.pl.standaloneTip, 'Jeden plik HTML z tym planem w środku, do otwarcia na komputerze');
  assert.equal(STRINGS.en.needsNewer, 'This link needs a newer browser (Safari 16.4 or newer). Ask the sender for the long link.');
  assert.equal(STRINGS.en.copyLong, 'Copy long link (older browsers)');
  assert.equal(STRINGS.pl.shareImage, 'Udostępnij obraz');
  assert.ok(STRINGS.en.helpNote.includes(STRINGS.en.note) && STRINGS.pl.helpNote.includes(STRINGS.pl.note), 'the Help line carries the same sentence');
});

test('share: the helpers answer in the page language and a link problem is the plain damaged-link banner', () => {
  try {
    setLang('pl');
    assert.equal(shareHelp(), STRINGS.pl.helpNote);
    assert.equal(standaloneTip(), STRINGS.pl.standaloneTip);
    assert.equal(linkProblem('unsupported'), STRINGS.pl.needsNewer);
    assert.match(linkProblem('inflate'), /uszkodzony/);
    setLang('en');
    assert.equal(linkProblem('unsupported'), STRINGS.en.needsNewer);
    for (const reason of ['empty', 'base64', 'checksum', 'inflate', 'too-long', 'timeout']) assert.match(linkProblem(reason), /damaged/, reason);
  } finally {
    setLang('en');
  }
});
