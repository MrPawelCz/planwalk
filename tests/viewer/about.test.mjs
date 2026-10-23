// The About sheet in Node: rows come from a pure function, the scale badge from a word check on the scale note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';
import { setLang } from '../../viewer/src/i18n.js';
import { aboutRows, scaleGuessed, STRINGS } from '../../viewer/src/about.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const info = (plan, extra = {}) => { const r = validatePlan(plan); assert.ok(r.normalized); return { plan, model: buildModel(r.normalized), warnings: r.warnings.length, version: '9.9.9', ...extra }; };
const row = (rows, id) => rows.find((r) => r.id === id);

test('rows for a one level example: name, counts, declared total, no scale note, source, notes, version', () => {
  setLang('en');
  const rows = aboutRows(info(load('examples/flat-1.plan.json')));
  assert.deepEqual(rows.map((r) => r.id), ['name', 'levels', 'rooms', 'area', 'scale', 'notes', 'source', 'warnings', 'version']);
  assert.equal(row(rows, 'name').value, load('examples/flat-1.plan.json').name);
  assert.equal(row(rows, 'levels').value, '1');
  assert.equal(row(rows, 'rooms').value, '5');
  assert.equal(row(rows, 'area').value, '42 m²');
  assert.equal(row(rows, 'area').hint, '', 'every room declares its area, so nothing is estimated');
  assert.equal(row(rows, 'scale').value, 'Not stated in the file');
  assert.equal(row(rows, 'source').value, 'Synthetic example');
  assert.match(row(rows, 'notes').value, /reference example/);
  assert.equal(row(rows, 'warnings').value, '0');
  assert.equal(row(rows, 'version').value, '9.9.9');
});

test('a two level plan in Polish: decimal comma and Polish labels', () => {
  setLang('pl');
  const rows = aboutRows(info(load('examples/duplex-1.plan.json')));
  assert.equal(row(rows, 'levels').value, '2');
  assert.equal(row(rows, 'rooms').value, '8');
  assert.equal(row(rows, 'area').value, '102,6 m²');
  assert.equal(row(rows, 'area').label, 'Łączna powierzchnia pomieszczeń');
  assert.equal(row(rows, 'scale').value, 'Brak informacji w pliku');
  assert.equal(row(rows, 'source').value, 'Przykład syntetyczny');
  setLang('en');
});

test('the total is an estimate (with ~ and a hint) as soon as one room has no declared area', () => {
  setLang('en');
  const plan = load('examples/flat-1.plan.json');
  delete plan.levels[0].rooms[0].area;
  const area = row(aboutRows(info(plan)), 'area');
  assert.ok(area.value.startsWith('~'), area.value);
  assert.match(area.hint, /estimated net of the walls/);
});

test('the scale note and the reader notes are shown as written, plain text, nothing interpreted', () => {
  setLang('en');
  const plan = load('examples/flat-1.plan.json');
  plan.name = '<b>Flat</b> & "co"';
  plan.meta = { source: 'image', scale_note: 'printed overall width 9.25 m, so 80 px per metre', notes: '<img src=x onerror=alert(1)>\nsecond line' };
  const rows = aboutRows(info(plan));
  assert.equal(row(rows, 'name').value, '<b>Flat</b> & "co"');
  assert.equal(row(rows, 'scale').value, 'printed overall width 9.25 m, so 80 px per metre');
  assert.equal(row(rows, 'scale').hint, '');
  assert.equal(row(rows, 'notes').value, '<img src=x onerror=alert(1)>\nsecond line');
  assert.equal(row(rows, 'source').value, 'Image');
  assert.ok(!/innerHTML|document\.write|insertAdjacentHTML/.test(readFileSync(new URL('../../viewer/src/about.js', import.meta.url), 'utf8')), 'about.js never writes HTML');
});

test('a scale note that admits a guess gets a hint in the row', () => {
  setLang('en');
  const plan = load('examples/flat-1.plan.json');
  plan.meta = { source: 'sketch', scale_note: 'sketch with no printed scale: scale from standard door 0.85 m (a guess, not a measurement)' };
  const scale = row(aboutRows(info(plan)), 'scale');
  assert.match(scale.hint, /scale is a guess/);
  setLang('pl');
  assert.match(row(aboutRows(info(plan)), 'scale').hint, /przybliżona/);
  setLang('en');
});

test('an unknown source is shown as it is, empty optional fields add no rows, a missing version is left out', () => {
  setLang('en');
  const plan = load('examples/flat-1.plan.json');
  plan.meta = { source: 'napkin', notes: '   ' };
  const rows = aboutRows(info(plan, { version: '' }));
  assert.equal(row(rows, 'source').value, 'napkin');
  assert.equal(row(rows, 'notes'), undefined);
  assert.equal(row(rows, 'version'), undefined);
  assert.equal(row(aboutRows(info({ ...plan, name: undefined })), 'name').value, '(untitled)');
});

test('scaleGuessed: the words of the prompt examples in English and Polish, not notes about measured scales', () => {
  for (const guess of [
    'sketch with no printed scale or areas: scale from standard door 0.85 m = about 68 px (a guess, not a measurement)',
    'Scale estimated from the door widths',
    'scale assumed from 0.9 m doors',
    'the scale is approximate',
    'skala szacowana na podstawie drzwi 0,85 m',
    'Skala oszacowana z szerokości drzwi',
    'Skala jest przybliżona',
    'Skala zgadnięta, nie zmierzona',
    'skala z typowych drzwi, na oko',
    'przybliżona skala wg standardowych drzwi',
  ]) assert.equal(scaleGuessed(guess), true, guess);
  for (const measured of [
    'printed overall width 9.25 m; the dimension line is 740 px long on the scan, so 80 px per metre; room areas cross-checked',
    'Scale from the printed 5.00 m dimension line on the south wall.',
    'skala z wymiaru 9,25 m na rysunku; powierzchnie pomieszczeń zgadzają się z wielokątami',
    'Skala przyjęta z wymiaru 9,25 m na rysunku',
    'wall thickness estimated at 0.12 m; scale from the printed 9.25 m dimension',
    'Scale from the printed 5.00 m dimension line; the room areas agree with the polygons',
    '', undefined, null, 42,
  ]) assert.equal(scaleGuessed(measured), false, String(measured));
});

test('every English string has a Polish one and the other way round, with the same {slots}', () => {
  assert.deepEqual(Object.keys(STRINGS.pl).sort(), Object.keys(STRINGS.en).sort());
  const slots = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STRINGS.en)) assert.equal(slots(STRINGS.pl[k]), slots(STRINGS.en[k]), k);
  for (const lang of ['en', 'pl']) for (const v of Object.values(STRINGS[lang])) assert.ok(!/[–—]/.test(v), `no dashes: ${v}`);
});
