// Language tables of the whole viewer: every module that uses makeT exports a table, each table has the same keys in English
// and Polish, nothing is empty, the placeholders match, no long dashes. Plus the plural forms, the file name stems, the
// issues heading and the fix request, and a scan for captions that bypass the tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setLang } from '../../viewer/src/i18n.js';
import { T, STRINGS, countText, fixRequestText, issuesHeading, pluralIndex } from '../../viewer/src/strings.js';
import { fileSlug } from '../../viewer/src/slug.js';

const dir = join(fileURLToPath(new URL('../../', import.meta.url)), 'viewer/src');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const source = (f) => readFileSync(join(dir, f), 'utf8');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isTable = (v) => v && typeof v === 'object' && has(v, 'en') && has(v, 'pl') && typeof v.en === 'object' && typeof v.pl === 'object';
const slots = (s) => [...new Set(s.match(/\{\w+\}/g) || [])].sort();

// Runs first: nothing has picked a language by hand yet, which is what the browser list default depends on.
test('the prompt to copy is Polish for a Polish page, and for a browser that lists Polish anywhere until the language is picked by hand', async () => {
  const { prefersPolish } = await import('../../viewer/src/i18n.js');
  assert.equal(prefersPolish({ languages: ['en-GB', 'en', 'pl'] }), true);
  assert.equal(prefersPolish({ languages: ['pl-PL'] }), true);
  assert.equal(prefersPolish({ languages: ['en-GB', 'de'] }), false);
  assert.equal(prefersPolish({ language: 'pl' }), true);
  assert.equal(prefersPolish({}), false);
  // defaultPromptLang reads the page's prompt blocks and the browser's list; Node 21+ answers navigator.languages itself
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const set = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    set('document', { getElementById: (id) => (/^planwalk-prompt-(en|pl)$/.test(id) ? { textContent: id } : null) });
    const { defaultPromptLang } = await import('../../viewer/src/prompt.js');
    set('navigator', { languages: ['en-GB', 'en', 'pl'] });
    assert.equal(defaultPromptLang(), 'pl', 'English phone, Polish in the list: the Polish prompt');
    set('navigator', { languages: ['en-GB', 'en'] });
    assert.equal(defaultPromptLang(), 'en');
    setLang('pl');
    assert.equal(defaultPromptLang(), 'pl', 'a Polish page copies the Polish prompt');
    set('navigator', { languages: ['en-GB', 'pl'] });
    setLang('en');
    assert.equal(defaultPromptLang(), 'en', 'once English was picked by hand, the English prompt follows');
    set('document', { getElementById: (id) => (id === 'planwalk-prompt-en' ? { textContent: 'en' } : null) });
    setLang('pl');
    assert.equal(defaultPromptLang(), 'en', 'no Polish prompt in this page: English');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved); else delete globalThis.document;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
    setLang('en');
  }
});

// Every module that calls makeT, with the tables it exports (any exported object shaped { en: {...}, pl: {...} }).
async function tableModules() {
  const out = [];
  for (const f of files.filter((n) => n !== 'i18n.js' && /\bmakeT\(/.test(source(n)))) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    out.push({ file: f, tables: Object.entries(mod).filter(([, v]) => isTable(v)) });
  }
  return out;
}

test('every module with a string table exports it, and the known modules are all there', async () => {
  const mods = await tableModules();
  for (const m of mods) assert.ok(m.tables.length >= 1, `${m.file} calls makeT but exports no { en, pl } table`);
  const names = mods.map((m) => m.file).sort();
  for (const expected of ['about.js', 'first-visit.js', 'help.js', 'lang-switch.js', 'load-errors.js', 'strings.js']) assert.ok(names.includes(expected), `${expected} is not covered`);
});

test('every table: same keys in English and Polish, no empty text, same placeholders, no long dashes', async () => {
  let checked = 0;
  for (const m of await tableModules()) {
    for (const [name, table] of m.tables) {
      const label = `${m.file} ${name}`;
      assert.deepEqual(Object.keys(table.pl).sort(), Object.keys(table.en).sort(), `${label}: keys differ`);
      for (const lang of ['en', 'pl']) {
        for (const [k, v] of Object.entries(table[lang])) {
          assert.equal(typeof v, 'string', `${label} ${lang}.${k}`);
          assert.ok(v.trim().length > 0, `${label} ${lang}.${k} is empty`);
          assert.ok(!/[\u2013\u2014]/.test(v), `${label} ${lang}.${k} has a long dash`);
          assert.deepEqual(slots(v), slots(table.en[k]), `${label} ${lang}.${k}: placeholders differ from English`);
        }
      }
      checked++;
    }
  }
  assert.ok(checked >= 6, `only ${checked} tables found`);
});

test('the Polish text differs from the English text, except for names that are the same in both', async () => {
  const SAME = new Set(['name', 'src_pdf', 'menu']); // "Plan", "PDF" and "Menu" are the same word in both languages
  for (const m of await tableModules()) {
    for (const [, table] of m.tables) {
      for (const k of Object.keys(table.en)) if (!SAME.has(k)) assert.notEqual(table.pl[k], table.en[k], `${m.file} ${k} is not translated`);
    }
  }
});

test('plural forms: 1 one, 2 to 4 few, 5 to 21 many, and 22 to 24 few again (Polish); English one or other', () => {
  const pl = [1, 2, 3, 4, 5, 11, 12, 13, 14, 21, 22, 25, 112, 0].map((n) => pluralIndex(n, 'pl'));
  assert.deepEqual(pl, [0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2]);
  assert.deepEqual([0, 1, 2, 5].map((n) => pluralIndex(n, 'en')), [1, 0, 1, 1]);
  const errors = (n) => countText('errorsCount', n, 'pl');
  assert.equal(errors(1), '1 błąd');
  assert.equal(errors(2), '2 błędy');
  assert.equal(errors(5), '5 błędów');
  assert.equal(errors(12), '12 błędów');
  assert.equal(errors(22), '22 błędy');
  assert.equal(errors(25), '25 błędów');
  assert.equal(countText('warningsCount', 1, 'pl'), '1 ostrzeżenie');
  assert.equal(countText('warningsCount', 3, 'pl'), '3 ostrzeżenia');
  assert.equal(countText('warningsCount', 0, 'pl'), '0 ostrzeżeń');
  assert.equal(countText('errorsCount', 1, 'en'), '1 error');
  assert.equal(countText('errorsCount', 2, 'en'), '2 errors');
  assert.equal(countText('warningsCount', 0, 'en'), '0 warnings');
});

test('the issues heading and the fix request follow the language; the issue lines stay as the validator wrote them', () => {
  assert.equal(issuesHeading(0, 3, 'en'), 'Issues: 0 errors, 3 warnings');
  assert.equal(issuesHeading(1, 2, 'pl'), 'Problemy: 1 błąd, 2 ostrzeżenia');
  const issue = { code: 'W040', path: 'levels[0].rooms[1]', message: 'Room is tiny.', fix: 'Check the polygon.' };
  const en = fixRequestText({ errors: [], warnings: [issue], body: '{"a":1}' }, 'en');
  const pl = fixRequestText({ errors: [], warnings: [issue], body: '{"a":1}' }, 'pl');
  assert.match(en, /^The floor plan JSON below failed validation in planwalk\./);
  assert.match(pl, /^Poniższy JSON planu mieszkania nie przeszedł kontroli w planwalk\./);
  for (const text of [en, pl]) {
    assert.match(text, /- W040 levels\[0\]\.rooms\[1\]: Room is tiny\. Fix: Check the polygon\./);
    assert.ok(text.endsWith('\n{"a":1}'));
  }
  assert.match(pl, /\nProblemy:\n- W040/);
  assert.match(pl, /\nJSON planu:\n/);
});

test('T.key follows the current language and still reads as a string', () => {
  setLang('pl');
  assert.equal(String(T.exportGlb), 'Pobierz model 3D (GLB)');
  assert.equal(`${T.dollhouse} ${T.orbit} ${T.top} ${T.walk}`, 'Makieta Obrót Z góry Spacer');
  assert.equal(T.paste.key, 'paste');
  setLang('en');
  assert.equal(String(T.exportGlb), 'Export GLB');
  assert.deepEqual(Object.keys(T).sort(), Object.keys(STRINGS.en).sort());
});

test('file name stems: Polish letters are transliterated, digits stay, the rest becomes single hyphens', () => {
  const cases = [
    ['Żoliborz', 'zoliborz'],
    ['Mieszkanie 3 pokoje', 'mieszkanie-3-pokoje'],
    ['Zażółć gęślą jaźń', 'zazolc-gesla-jazn'],
    ['ŁÓDŹ, ul. Źródlana 5/7', 'lodz-ul-zrodlana-5-7'],
    ['  --Dom (parter) --  ', 'dom-parter'],
    ['Søren Straße Đakovo', 'soren-strasse-dakovo'],
    ['Café Ærø', 'cafe-aero'],
    ['A'.repeat(60), 'a'.repeat(48)],
    ['', 'planwalk'],
    ['   ', 'planwalk'],
    ['???', 'planwalk'],
    ['Квартира', 'planwalk'],
    [undefined, 'planwalk'],
    [null, 'planwalk'],
    [42, '42'],
  ];
  for (const [input, expected] of cases) assert.equal(fileSlug(input), expected, JSON.stringify(input));
  assert.equal(fileSlug('x'.repeat(47) + ' y'), 'x'.repeat(47), 'a stem never ends with a hyphen');
});

// A caption typed straight into the page would not follow the language. This reads the sources for the usual ways of doing that:
// a text literal as the child of h(...), a textContent assignment, title, placeholder and aria-label literals, and banner texts.
const ALLOWED = new Set(['planwalk', '×', 'PL', 'EN', '']);
const RULES = [
  [/\bh\(\s*'[a-z0-9]+'\s*,\s*(?:\{[^{}]*\}|[a-z]+)\s*,\s*'([^']*)'/g, 'h() child'],
  [/\.textContent\s*=\s*'([^']*)'/g, 'textContent'],
  [/\b(?:title|placeholder|alt)\s*:\s*'([^']*)'/g, 'attribute'],
  [/'aria-label'\s*:\s*'([^']*)'/g, 'aria-label'],
  [/setAttribute\(\s*'(?:title|placeholder|aria-label|alt)'\s*,\s*'([^']*)'/g, 'setAttribute'],
  [/\bnotes\.show\(\s*'([^']*)'/g, 'notes.show'],
];
function looseCaptions(text) {
  const found = [];
  const code = text.replace(/export const (?:STRINGS|strings) = \{[\s\S]*?\n\};/, ''); // the tables themselves hold the captions
  for (const [re, what] of RULES) {
    for (const m of code.matchAll(re)) if (!ALLOWED.has(m[1]) && /[A-Za-zÀ-ž]{2}/.test(m[1])) found.push(`${what} "${m[1]}"`);
  }
  return found;
}

test('the scan for loose captions sees the usual shapes and lets names and symbols pass', () => {
  const bad = `h('button', { type: 'button' }, 'Save'); el.textContent = 'Done'; h('i', { title: 'Tip' }); x.setAttribute('aria-label', 'Close'); notes.show('Oops');
    h('span', {}, 'planwalk'); h('b', {}, '×'); el.textContent = ''; h('button', { type: 'button' }, t('save'));`;
  assert.deepEqual(looseCaptions(bad), ['h() child "Save"', 'textContent "Done"', 'attribute "Tip"', 'setAttribute "Close"', 'notes.show "Oops"']);
});

test('every dialog and sheet opens through dialogs.js (works without showModal): no other module calls showModal', () => {
  assert.deepEqual(files.filter((f) => f !== 'dialogs.js' && /\.showModal\(/.test(source(f))), []);
});

test('no caption bypasses the tables: no text literals in h(), textContent, title, placeholder, aria-label or notes.show', () => {
  const found = files.flatMap((f) => looseCaptions(source(f)).map((s) => `${f}: ${s}`));
  assert.deepEqual(found, []);
});
