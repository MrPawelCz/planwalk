// README.pl.md and docs/FAQ.pl.md name the buttons and windows of the page: every name in Polish quotes must be a word of the Polish
// interface (the same string tables the page uses), no English interface name may be left in them, the control names a newcomer
// needs are all there, every relative link leads to a file, the facts the English README states are stated in Polish too, and the
// behaviour sentences are backed by the code. No browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS as MAIN } from '../../viewer/src/strings.js';
import { STRINGS as HELP } from '../../viewer/src/help.js';
import { STRINGS as VISIT } from '../../viewer/src/first-visit.js';
import { strings as ERRORS } from '../../viewer/src/load-errors.js';
import { STRINGS as ABOUT } from '../../viewer/src/about.js';
import { STRINGS as COMPACT } from '../../viewer/src/compact.js';
import { STRINGS as SHARE } from '../../viewer/src/share.js';
import { DASHES, englishLeft } from './pl-deny.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const FILES = ['README.pl.md', 'docs/FAQ.pl.md'];
const TABLES = [MAIN, HELP, VISIT, ERRORS, ABOUT, COMPACT, SHARE];
const PL_UI = new Set(TABLES.flatMap((t) => Object.values(t.pl)));
// What the English interface says where the Polish one says something else: such a name has no place in the Polish files.
const EN_ONLY = new Set(TABLES.flatMap((t) => Object.entries(t.en).filter(([k, v]) => t.pl[k] !== v).map(([, v]) => v)));
// Quotes that are not words of the interface, and where the quoted thing lives.
const NOT_UI = [
  { match: (q) => q === 'Runs by model', file: 'docs/BENCHMARK.md', has: '## Runs by model' },
  { match: (q) => q.startsWith('Prowadź ściany po osi'), why: 'a sentence to say to the chat' },
];
const quotes = (md) => [...md.matchAll(/„([^”]+)”/g)].map((m) => m[1]);

test('every name in Polish quotes is a word of the Polish interface (or a listed outside title that exists), and no English interface name is left', () => {
  for (const file of FILES) {
    const md = read(file);
    for (const q of quotes(md)) {
      const outside = NOT_UI.find((n) => n.match(q));
      if (outside) { if (outside.file) assert.ok(read(outside.file).includes(outside.has), `${file}: "${q}" must be a heading in ${outside.file}`); continue; }
      assert.ok(PL_UI.has(q), `${file}: „${q}” is not a string of the Polish interface`);
      assert.ok(!EN_ONLY.has(q), `${file}: „${q}” is English interface text`);
    }
  }
});

test('README.pl.md names the controls and windows a newcomer needs, exactly as the Polish interface spells them', () => {
  const named = new Set(quotes(read('README.pl.md')));
  for (const want of ['Makieta', 'Obrót', 'Z góry', 'Spacer', 'Rozsuń piętra', 'Niskie ściany', 'Nazwy pokoi', 'Tekstury', 'Przykłady', 'Menu', 'Wklej odpowiedź',
    'Pobierz model 3D (GLB)', 'Pobierz obraz (PNG)', 'Pobierz jako plik HTML', 'Kopiuj link', 'Udostępnij obraz', 'O modelu', 'Pomoc',
    'Jak działa planwalk', 'O tym modelu', 'To jest przykład', 'Kopiuj polecenie', 'Otwórz plik', 'Wczytaj', 'Problemy', 'Kopiuj prośbę o poprawkę']) {
    assert.ok(named.has(want), `README.pl.md does not name „${want}”`);
    assert.ok(PL_UI.has(want), `„${want}” is not in the Polish interface`);
  }
});

test('no long dashes and no English word in the Polish prose (code, addresses, tool names and quoted outside titles left out)', () => {
  for (const file of FILES) {
    const md = read(file);
    assert.ok(!DASHES.test(md), `${file} has a long dash`);
    const prose = md.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/„Runs by model”/g, ' ');
    assert.deepEqual(englishLeft(prose), [], `${file}`);
  }
});

test('every relative link in the Polish files leads to a file', () => {
  for (const file of FILES) {
    const md = read(file);
    const targets = [...md.matchAll(/\]\(([^)\s]+)\)/g), ...md.matchAll(/href="([^"]+)"/g), ...md.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((t) => !/^(https?:|mailto:|#)/.test(t));
    assert.ok(targets.length > 0);
    for (const t of targets) assert.ok(existsSync(resolve(dirname(join(root, file)), t.split('#')[0])), `${file}: ${t} does not exist`);
  }
});

test('the facts of the English README are in README.pl.md too, and the two point at each other', () => {
  const en = read('README.md'), pl = read('README.pl.md');
  for (const fact of ['Safari 16.4', 'Chrome 103', '113', '?materials=clay', 'docs/BENCHMARK.md', 'skill/planwalk', 'releases/latest', 'docs/demo.gif', 'CC0', 'MIT', 'THIRD_PARTY_LICENSES.md']) {
    if (en.includes(fact)) assert.ok(pl.includes(fact), `README.md says ${fact}, README.pl.md does not`);
  }
  assert.ok(en.includes('README.pl.md') && pl.includes('README.md'));
});

test('the behaviour sentences of README.pl.md are backed by the code', () => {
  const code = (file) => read(`viewer/src/${file}`);
  const backed = [
    ['a pasted text anywhere on the page loads', 'main.js', /addEventListener\('paste'/],
    ['a dropped .json file loads', 'main.js', /addEventListener\('drop'/],
    ['?plan=<address> downloads a plan', 'main.js', /q\.get\('plan'\)/],
    ['?materials=clay', 'main.js', /q\.get\('materials'\)/],
    ['?lang= forces the language', 'i18n.js', /get\('lang'\)/],
    ['the PL | EN switch is in Help', 'help.js', /createLangSwitch/],
    ['the paste dialog has the file picker', 'main.js', /notes\.openFileButton\(openPicked\)/],
    ['the touch halves of Walk', 'main.js', /clientWidth \/ 2/],
    ['the plan is stored inside the link', 'share-link.js', /encodeShort/],
    ['nothing is stored in the browser', 'main.js', /^(?![\s\S]*(localStorage|sessionStorage|indexedDB|document\.cookie))/],
  ];
  for (const [claim, file, re] of backed) assert.ok(re.test(code(file)), `${claim}: not found in viewer/src/${file}`);
});
