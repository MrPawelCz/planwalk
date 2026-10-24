// The Polish names of the two bundled examples (viewer/src/examples-pl.js): the table follows the example data id by id, the Polish copy
// differs from the English plan only in names and notes, and anything that is not a bundled example comes back as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { EXAMPLES_PL, exampleId, exampleTitle, localizeExample } from '../../viewer/src/examples-pl.js';
import { englishLeft, DASHES } from './pl-deny.mjs';

const dir = new URL('../../examples/', import.meta.url);
const files = readdirSync(dir).filter((n) => n.endsWith('.plan.json')).sort();
const examples = Object.fromEntries(files.map((f) => [f.replace(/\.plan\.json$/, ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]));
const fresh = (id) => JSON.parse(JSON.stringify(examples[id]));
const roomsOf = (plan) => plan.levels.flatMap((l) => l.rooms || []);

test('the table has an entry for every example, level and room, and none for an id that does not exist', () => {
  assert.deepEqual(Object.keys(EXAMPLES_PL).sort(), Object.keys(examples).sort(), 'one entry per examples/*.plan.json');
  for (const [id, plan] of Object.entries(examples)) {
    const row = EXAMPLES_PL[id];
    assert.equal(row.en, plan.name, `${id}: the English name the plan is recognised by`);
    assert.deepEqual(Object.keys(row.levels).sort(), plan.levels.map((l) => l.id).sort(), `${id}: levels`);
    assert.deepEqual(Object.keys(row.rooms).sort(), roomsOf(plan).map((r) => r.id).sort(), `${id}: rooms`);
    assert.equal(typeof plan.meta.notes, 'string', `${id}: the example has notes to translate`);
    assert.ok(row.notes && row.name, `${id}: Polish name and notes`);
  }
});

test('Polish text has no em or en dash, no English leftovers, and differs from the English name (WC is an abbreviation)', () => {
  for (const [id, row] of Object.entries(EXAMPLES_PL)) {
    const plan = examples[id];
    const pairs = [[row.name, plan.name], [row.notes, plan.meta.notes],
      ...plan.levels.map((l) => [row.levels[l.id], l.name]), ...roomsOf(plan).map((r) => [row.rooms[r.id], r.name])];
    for (const [pl, en] of pairs) {
      assert.ok(!DASHES.test(pl), `no long dash in "${pl}"`);
      assert.deepEqual(englishLeft(pl), [], `English word in "${pl}"`);
      if (pl !== 'WC') assert.notEqual(pl, en, `"${pl}" is still the English name`);
    }
  }
});

test('lang pl: Polish name, notes, level and room names; ids, geometry and everything else are the example as it was', () => {
  for (const id of Object.keys(examples)) {
    const plan = fresh(id), before = fresh(id);
    const pl = localizeExample(plan, id, 'pl');
    assert.notEqual(pl, plan, 'a copy');
    assert.deepEqual(plan, before, 'the input is not mutated');
    assert.equal(pl.name, EXAMPLES_PL[id].name);
    assert.equal(pl.meta.notes, EXAMPLES_PL[id].notes);
    assert.equal(pl.meta.source, plan.meta.source, 'other meta fields stay');
    for (const [i, level] of pl.levels.entries()) {
      assert.equal(level.name, EXAMPLES_PL[id].levels[level.id]);
      for (const room of level.rooms) assert.equal(room.name, EXAMPLES_PL[id].rooms[room.id]);
      // back to English names: nothing but the names differs from the original
      const back = JSON.parse(JSON.stringify(level));
      back.name = plan.levels[i].name;
      back.rooms.forEach((r, k) => { r.name = plan.levels[i].rooms[k].name; });
      assert.deepEqual(back, plan.levels[i]);
    }
    assert.deepEqual(roomsOf(pl).map((r) => r.id), roomsOf(plan).map((r) => r.id));
    const checked = validatePlan(pl), original = validatePlan(plan);
    assert.equal(checked.ok, true);
    assert.deepEqual([checked.errors.length, checked.warnings.length], [original.errors.length, original.warnings.length], 'validates like the English one');
  }
});

test('lang en, other languages and plans that are not the bundled example come back unchanged', () => {
  for (const id of Object.keys(examples)) {
    const plan = fresh(id);
    assert.equal(localizeExample(plan, id, 'en'), plan);
    assert.equal(localizeExample(plan, id, 'de'), plan);
    assert.equal(localizeExample(plan, id, undefined), plan);
  }
  const own = fresh('flat-1');
  own.name = 'My flat';
  const before = JSON.stringify(own);
  assert.equal(localizeExample(own, 'flat-1', 'pl'), own, 'a plan with another name is not the example');
  assert.equal(JSON.stringify(own), before);
  const flat = fresh('flat-1');
  assert.equal(localizeExample(flat, 'duplex-1', 'pl'), flat, 'the id has to match the plan');
  for (const odd of [null, undefined, 'text', 5, [], {}]) assert.equal(localizeExample(odd, 'flat-1', 'pl'), odd);
  assert.equal(localizeExample(fresh('flat-1'), 'nope', 'pl').name, examples['flat-1'].name);
  assert.equal(localizeExample(fresh('flat-1'), '__proto__', 'pl').name, examples['flat-1'].name);
});

test('exampleId and exampleTitle: the id of a bundled example by its English name, the list shows the page language', () => {
  for (const [id, plan] of Object.entries(examples)) {
    assert.equal(exampleId(plan), id);
    assert.equal(exampleTitle(plan, 'pl'), EXAMPLES_PL[id].name);
    assert.equal(exampleTitle(plan, 'en'), plan.name);
  }
  for (const odd of [null, undefined, 'flat-1', {}, { name: 'My flat' }, { name: 'constructor' }]) assert.equal(exampleId(odd), null);
  assert.equal(exampleTitle({ name: 'My flat' }, 'pl'), 'My flat');
});
