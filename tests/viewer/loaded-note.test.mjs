// The sentence that confirms a load: "Wczytano: <name>, N pomieszczeń" with the Polish plural forms, "Loaded: <name>, N rooms" in
// English. No browser needed; the line on the page is checked in loaded-note-e2e.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOW_MS, loadedText, roomsText } from '../../viewer/src/loaded-note.js';

test('Polish: 1 pomieszczenie, 2 to 4 pomieszczenia, 5 and more pomieszczeń, and 12 to 14 and the teens take the last form', () => {
  const want = { 0: 'pomieszczeń', 1: 'pomieszczenie', 2: 'pomieszczenia', 3: 'pomieszczenia', 4: 'pomieszczenia', 5: 'pomieszczeń', 9: 'pomieszczeń',
    10: 'pomieszczeń', 11: 'pomieszczeń', 12: 'pomieszczeń', 13: 'pomieszczeń', 14: 'pomieszczeń', 15: 'pomieszczeń', 21: 'pomieszczeń',
    22: 'pomieszczenia', 23: 'pomieszczenia', 24: 'pomieszczenia', 25: 'pomieszczeń', 32: 'pomieszczenia', 100: 'pomieszczeń', 101: 'pomieszczeń',
    102: 'pomieszczenia', 111: 'pomieszczeń', 112: 'pomieszczeń', 113: 'pomieszczeń', 114: 'pomieszczeń', 122: 'pomieszczenia' };
  for (const [n, word] of Object.entries(want)) assert.equal(roomsText(Number(n), 'pl'), `${n} ${word}`, `n = ${n}`);
});

test('English: 1 room, every other number rooms', () => {
  assert.equal(roomsText(1, 'en'), '1 room');
  for (const n of [0, 2, 3, 5, 12, 21, 100]) assert.equal(roomsText(n, 'en'), `${n} rooms`);
});

test('the sentence names the plan and counts its rooms, in both languages', () => {
  assert.equal(loadedText({ name: 'Mieszkanie 3 pokoje', rooms: 5 }, 'pl'), 'Wczytano: Mieszkanie 3 pokoje, 5 pomieszczeń');
  assert.equal(loadedText({ name: 'Studio', rooms: 1 }, 'pl'), 'Wczytano: Studio, 1 pomieszczenie');
  assert.equal(loadedText({ name: 'Dom', rooms: 22 }, 'pl'), 'Wczytano: Dom, 22 pomieszczenia');
  assert.equal(loadedText({ name: 'Two-level house', rooms: 7 }, 'en'), 'Loaded: Two-level house, 7 rooms');
  assert.equal(loadedText({ name: 'Studio', rooms: 1 }, 'en'), 'Loaded: Studio, 1 room');
});

test('a plan without a name gets a plain stand-in; a long name is cut; the name is never read as a replacement pattern', () => {
  assert.equal(loadedText({ name: '', rooms: 3 }, 'pl'), 'Wczytano: plan bez nazwy, 3 pomieszczenia');
  assert.equal(loadedText({ name: '   ', rooms: 3 }, 'en'), 'Loaded: untitled plan, 3 rooms');
  assert.equal(loadedText({ rooms: 2 }, 'en'), 'Loaded: untitled plan, 2 rooms');
  assert.equal(loadedText({ name: 12345, rooms: 2 }, 'en'), 'Loaded: untitled plan, 2 rooms', 'a name that is not text is ignored');
  const long = loadedText({ name: 'x'.repeat(500), rooms: 4 }, 'en');
  assert.ok(long.length < 100 && long.includes('...'), long);
  assert.equal(loadedText({ name: 'A $& B $1 {rooms}', rooms: 4 }, 'en'), 'Loaded: A $& B $1 {rooms}, 4 rooms');
});

test('the line stays about five seconds', () => {
  assert.ok(SHOW_MS >= 4500 && SHOW_MS <= 6000);
});
