// The About sheet in Node: rows come from a pure function, the scale badge from a word check on the scale note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { PLAN_SCHEMA, validatePlan } from '../../src/core/validate.js';
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
  assert.equal(row(rows, 'source').value, 'Przykład wymyślony, nie z prawdziwego rzutu');
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

// The 14 notes of review MINOR-5, each with the outcome the badge has to give: it states an estimated scale only when the
// note says so about the scale itself (not about the wall thickness or the layout), and not when a printed basis is named.
const MINOR5 = [
  ['Wall thickness estimated, scale from the printed dimension 3.20 m', false],
  ['Scale from printed dimensions (assumed wall thickness 0.12 m)', false],
  ['Scale taken from printed room areas; wall thickness estimated from the drawing, scale is exact', false],
  ['Printed dimensions, scale 1:50, exact', false],
  ['No printed scale; derived from door widths', true],
  ['Scale: unknown', true],
  ['Sizes inferred from typical room proportions, no scale printed', true],
  ['Skala przyjęta z wymiaru 3,20 m, grubość ścian szacowana', false],
  ['Brak skali na rysunku, wymiary na oko', true],
  ['Skala wzięta z szerokości drzwi', true],
  ['Skala zgadnięta', true],
  ['Scale estimated from door widths', true],
  ['The scale is a guess, not a measurement', true],
  ['I guessed the layout of the bathroom but the scale is printed', false],
];
test('scaleGuessed: the 14 cases of review MINOR-5, true only when the note says the scale itself is a guess', () => {
  for (const [note, want] of MINOR5) assert.equal(scaleGuessed(note), want, `${want ? 'badge' : 'no badge'} expected for: ${note}`);
});

test('scaleGuessed: more notes in the same spirit, English and Polish', () => {
  for (const [note, want] of [
    ['Scale: 1:100 as printed; the room areas agree with the polygons', false],
    ['No scale bar, but the scale comes from the printed overall width 9.25 m', false],
    ['No scale bar; scale taken from the door widths', true],
    ['Scale from a standard door 0.85 m', true],
    ['Scale is exact (printed dimension line), wall thickness assumed', false],
    ['I estimated the scale from the doors', true],
    ['Approximate scale, door widths only', true],
    ['Scale not printed, door widths used', true],
    ['skala z wymiaru 9,25 m; grubość ścian na oko', false],
    ['skala zgadza się z wymiarami na rysunku', false],
    ['Brak skali, przyjęto szerokość drzwi 0,9 m', true],
    ['Skala jest podana na rysunku, układ łazienki zgadnięty', false],
    ['Skala: nieznana', true],
    ['skala została oszacowana z drzwi', true],
  ]) assert.equal(scaleGuessed(note), want, `${want ? 'badge' : 'no badge'} expected for: ${note}`);
});

// Real notes: the scale notes the models wrote in the benchmark readings (eval/results). A note that says the scale comes from
// a printed dimension line gets no badge, a note that says it used a standard door as a last resort gets one.
test('scaleGuessed on the scale notes of the benchmark readings: printed dimension lines no badge, door based scales a badge', () => {
  const dir = new URL('../../eval/results/', import.meta.url).pathname;
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
  const notes = new Set();
  if (existsSync(dir)) {
    for (const f of walk(dir).filter((p) => /readings[^/]*\/[^/]+\.plan\.json$/.test(p))) {
      const note = JSON.parse(readFileSync(f, 'utf8'))?.meta?.scale_note;
      if (typeof note === 'string') notes.add(note);
    }
  }
  let printed = 0, door = 0;
  for (const note of notes) {
    if (/^(Scale (comes )?from the printed|I used the printed)\b.{0,40}dimension line/i.test(note)) { printed++; assert.equal(scaleGuessed(note), false, note); }
    if (/\bstandard\b[^.]{0,20}\bdoor\b|last.resort/i.test(note)) { door++; assert.equal(scaleGuessed(note), true, note); }
  }
  if (existsSync(dir)) assert.ok(printed >= 3 && door >= 5, `the benchmark readings should hold both kinds of notes (printed ${printed}, door ${door})`);
});

test('scaleGuessed stays fast on hostile notes: cut to the schema cap, every pattern linear', () => {
  const cap = PLAN_SCHEMA.properties.meta.properties.scale_note.maxLength;
  for (const note of [
    'szacow'.repeat(20000), 'przybli'.repeat(20000), 'typow'.repeat(40000), 'standardow'.repeat(20000), 'estimat'.repeat(20000), 'assum'.repeat(40000),
    'szacow '.repeat(20000), 'a'.repeat(120000) + 'szacow', 'szacow' + 'a'.repeat(120000), 'skal '.repeat(40000), 'scale '.repeat(40000),
    'szacow'.repeat(160) + ' skal', 'x'.repeat(2000000),
    'no '.repeat(40000), 'brak '.repeat(40000), 'scale is '.repeat(40000), 'skala jest '.repeat(40000), 'from the '.repeat(40000), 'from the a typical '.repeat(20000),
    'no a b '.repeat(40000), 'brak aa bb '.repeat(40000), 'scale '.repeat(500) + 'is'.repeat(300), 'oszacowan '.repeat(40000), `${'a '.repeat(498)}no scale`,
  ]) {
    const t0 = performance.now();
    assert.equal(scaleGuessed(note), false, note.slice(0, 24));
    assert.ok(performance.now() - t0 < 50, `${Math.round(performance.now() - t0)} ms for ${note.slice(0, 24)}`);
  }
  assert.equal(scaleGuessed(`${'x'.repeat(cap - 40)} skala szacowana`), true, 'a guess inside the cap still counts');
  assert.equal(scaleGuessed(`${'x'.repeat(cap)} skala szacowana`), false, 'text beyond the cap is not read');
  assert.equal(scaleGuessed('oszacowana skala'), true, 'a short prefix before the stem still counts');
  assert.equal(scaleGuessed('typowe drzwi 0,85 m'), true);
  assert.equal(scaleGuessed('niestandardowe drzwi'), false, 'a stem inside a longer word does not count');
});

test('an over-long scale note (an E002 error, the model is still built) is shown whole and costs the sheet and the badge nothing', () => {
  setLang('en');
  const plan = load('examples/flat-1.plan.json');
  const note = 'szacow'.repeat(20000);
  plan.meta = { source: 'image', scale_note: note };
  const i = info(plan); // info() needs a normalized plan: the validator still returns one for a note over the cap
  const t0 = performance.now();
  const scale = row(aboutRows(i), 'scale');
  assert.ok(performance.now() - t0 < 50, `${Math.round(performance.now() - t0)} ms`);
  assert.equal(scale.value, note);
  assert.equal(scale.hint, '');
});

test('every English string has a Polish one and the other way round, with the same {slots}', () => {
  assert.deepEqual(Object.keys(STRINGS.pl).sort(), Object.keys(STRINGS.en).sort());
  const slots = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STRINGS.en)) assert.equal(slots(STRINGS.pl[k]), slots(STRINGS.en[k]), k);
  for (const lang of ['en', 'pl']) for (const v of Object.values(STRINGS[lang])) assert.ok(!/[\u2013\u2014]/.test(v), `no dashes: ${v}`);
});
