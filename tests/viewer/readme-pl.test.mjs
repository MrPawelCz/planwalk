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
  { match: (q) => q.startsWith('Poprowadź ściany środkiem'), why: 'a sentence to say to the chat' },
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

test('both Polish files say what was measured: the English prompt on the models of "Runs by model", the Polish prompt on 10 Polish real plans with the two Claude models and gpt-6-astra only, nothing else on real plans', () => {
  for (const file of FILES) {
    const md = read(file);
    assert.match(md, /(Polecenie po angielsku zmierzono|Angielską wersję polecenia sprawdzono) na modelach z tabeli „Runs by model”/, file);
    assert.match(md, /(Polskie polecenie zmierzono|wersję polską) na 10 polskich rzutach/, `${file}: the measured state of the Polish prompt`);
    assert.match(md, /tylko u Claude Sonnet 5\.5, Claude Haiku 4\.5 i gpt-6-astra/, `${file}: only the two Claude models and gpt-6-astra were measured on real plans`);
    assert.match(md, /Gemini (na prawdziwych rzutach nie mierzono|nie był na prawdziwych rzutach mierzony)/, `${file}: the model that was not measured on real plans`);
    assert.doesNotMatch(md, /gpt-6-astra i Gemini/, `${file}: gpt-6-astra is no longer in the not-measured sentence`);
    assert.doesNotMatch(md, /jeszcze nie mierzono|polskich rysunków nie mierzono/, `${file}: the old "not measured yet" sentence is gone`);
  }
});

test('README.pl.md points at the sample drawings as something to open or download for the three steps, never as a measure of reading quality, and licenses them CC0', () => {
  const md = read('README.pl.md');
  assert.ok(VISIT.pl.samples.startsWith('Nie masz rzutu pod ręką?'), 'the card line the README echoes');
  assert.match(md, /Nie masz rzutu pod ręką\? Karta pierwszej wizyty \(ta z napisem „To jest przykład”\) ma linijkę z trzema przykładowymi rysunkami[^.]*możesz otworzyć lub pobrać[^.]*\[`docs\/samples`\]\(docs\/samples\)/);
  assert.match(md, /Rysunki są syntetyczne i wybrane, bo dobrze się czytają, więc pokazują kroki, a nie to, jak model czyta inne rysunki\./);
  assert.doesNotMatch(md, /typow|reprezentatyw|przeciętn/i, 'no word that calls the drawings typical or representative');
  assert.match(md, /przykładowe rysunki \(`docs\/samples\/`\) są na licencji CC0/);
});

// The figures of the real plans: the Polish files give them, the English section of docs/BENCHMARK.md (generated from the results) is
// the source. Before that section is in the tree (a branch without it) the figure tests are skipped, not weakened.
function benchmarkSection() {
  const md = read('docs/BENCHMARK.md');
  const at = md.indexOf('\n## Real listing plans');
  if (at < 0) return null;
  const end = md.indexOf('\n## ', at + 5);
  return md.slice(at, end < 0 ? undefined : end);
}
// The numbers of a piece of text as a sorted set; model versions (5.5, 4.5) are not figures, and Polish says "żaden" for 0.
const figures = (s) => [...new Set((s.replace(/\b[45]\.5\b/g, ' ').match(/\d+%?/g) || []).filter((n) => n !== '0'))].sort();
const cells = (section, label, tableHas) => section.split('\n').filter((l) => l.startsWith(`| ${label} |`) && tableHas.test(l)).map((l) => l.split('|').slice(2, -1).map((c) => c.trim()));

test('the paragraph about real plans in README.pl.md is short, names the report button, links the English section, and its figures are those of that section', (t) => {
  const md = read('README.pl.md');
  const m = md.match(/^### Czego się spodziewać po prawdziwych rzutach\n\n([^\n]+)\n/m);
  assert.ok(m, 'heading and one paragraph');
  const sentences = m[1].split(/\.\s+(?=\p{Lu})/u);
  assert.ok(sentences.length >= 2 && sentences.length <= 4, `2 to 4 sentences, found ${sentences.length}`);
  for (const must of ['„Zgłoś zły odczyt”', '`Real listing plans`', '[`docs/BENCHMARK.md`](docs/BENCHMARK.md)', 'mieszany']) assert.ok(m[1].includes(must), `the paragraph lacks ${must}`);
  const section = benchmarkSection();
  if (!section) return t.skip('docs/BENCHMARK.md has no "Real listing plans" section in this tree');
  checkFigures(read('README.pl.md'), section);
});

test('the figures of the real plans in docs/FAQ.pl.md are those of the English section, and the Polish prompt numbers match its tables', (t) => {
  const faq = read('docs/FAQ.pl.md');
  const section = benchmarkSection();
  if (!section) return t.skip('docs/BENCHMARK.md has no "Real listing plans" section in this tree');
  checkFigures(faq, section);
  const loads = /^\d+ of 10 \(/, judged = /\| \d+ \| \d+ \| \d+ \| \d+ \| \d+ \|$/;
  const first = (rows) => { assert.equal(rows.length, 1, 'one table row expected'); return rows[0]; };
  const sonnetPl = first(cells(section, 'Claude Sonnet 5.5, Polish listings, Polish prompt', /of 10 \(/));
  const sonnetEn = first(cells(section, 'Claude Sonnet 5.5, Polish listings, English prompt', /of 10 \(/));
  const haikuPl = first(cells(section, 'Claude Haiku 4.5, Polish listings, Polish prompt', /of 10 \(/));
  const judgeSonnetPl = first(cells(section, 'Claude Sonnet 5.5, Polish listings, Polish prompt', judged));
  const judgeSonnetEn = first(cells(section, 'Claude Sonnet 5.5, Polish listings, English prompt', judged));
  const judgeHaikuPl = first(cells(section, 'Claude Haiku 4.5, Polish listings, Polish prompt', judged));
  const n = (cell) => cell.match(/^(\d+) of 10/)[1];
  assert.ok(loads.test(sonnetPl[1]) && loads.test(sonnetEn[1]) && loads.test(haikuPl[1]));
  assert.ok(faq.includes(`u Claude Sonnet 5.5 kontrolę walidatora przeszło ${n(sonnetPl[1])} z 10 odczytów, ${judgeSonnetPl[1]} były użyteczne bez zmian i ${judgeSonnetPl[2]} do drobnych poprawek (z poleceniem angielskim na tych samych rzutach: ${n(sonnetEn[1])} z 10 po kontroli walidatora, ${judgeSonnetEn[1]} i ${judgeSonnetEn[2]};`), 'Claude Sonnet 5.5, Polish listings, both prompts');
  assert.deepEqual([judgeHaikuPl[1], judgeHaikuPl[2]], ['0', '0'], 'the FAQ says no Haiku reading was usable or needed small fixes');
  assert.ok(faq.includes(`z poleceniem polskim kontrolę walidatora przeszło ${n(haikuPl[1])} z 10 odczytów i żaden nie był użyteczny ani do drobnych poprawek`), 'Claude Haiku 4.5, Polish listings, Polish prompt');
  const gptPl = first(cells(section, 'gpt-6-astra, Polish listings, Polish prompt', /of 10 \(/));
  const gptUk = first(cells(section, 'gpt-6-astra, UK listings, English prompt', /of 10 \(/));
  const judgeGptPl = first(cells(section, 'gpt-6-astra, Polish listings, Polish prompt', judged));
  const judgeGptUk = first(cells(section, 'gpt-6-astra, UK listings, English prompt', judged));
  assert.ok(loads.test(gptPl[1]) && loads.test(gptUk[1]));
  assert.ok(faq.includes(`u gpt-6-astra kontrolę walidatora przeszło ${n(gptPl[1])} z 10 odczytów, ${judgeGptPl[1]} były użyteczne bez zmian i ${judgeGptPl[2]} do drobnych poprawek (na brytyjskich rzutach z poleceniem angielskim kontrolę walidatora przeszło ${n(gptUk[1])} z 10, a użyteczny lub do drobnych poprawek był ${Number(judgeGptUk[1]) + Number(judgeGptUk[2])})`), 'gpt-6-astra, both countries');
});

// Each sentence with figures in the Polish text must carry the same numbers as its sentence of the English section.
function checkFigures(pl, section) {
  const pairs = [
    ['Claude Sonnet 5.5, by verdict', /Of the \d+ Claude Sonnet 5\.5 readings.*?\.(?=\s)/s, /Z \d+ odczytów Claude Sonnet 5\.5.*?nie przeszły kontroli walidatora i nie były oceniane wzrokowo/s],
    ['Polish against UK plans', /usable or small-fixes for \d+ of \d+ readings against \d+ of \d+/, /użyteczne lub do drobnych poprawek: \d+ z \d+ odczytów.*?wobec \d+ z \d+/s],
    ['Claude Haiku 4.5, by verdict', /Of the \d+ Claude Haiku 4\.5 readings.*?\.(?=\s)/s, /Z \d+ odczytów Claude Haiku 4\.5.*?nie przeszło kontroli walidatora i nie było oceniane wzrokowo/s],
    ['gpt-6-astra, by verdict', /Of the \d+ gpt-6-astra readings.*?\.(?=\s)/s, /[Zz] \d+ odczytów gpt-6-astra.*?nie przeszły kontroli walidatora i nie były oceniane wzrokowo/s],
    ['gpt-6-astra, Polish against UK plans', /usable or small-fixes for \d+ of \d+ readings of the Polish plans against \d+ of \d+/, /na polskich rzutach \d+ z \d+ odczytów było użytecznych lub do drobnych poprawek, na brytyjskich \d+ z \d+/],
  ];
  for (const [what, en, plRe] of pairs) {
    const e = section.match(en), p = pl.match(plRe);
    assert.ok(e, `${what}: the English section no longer has this sentence; update the Polish figures and this test together`);
    assert.ok(p, `${what}: the Polish text has no sentence of this shape`);
    assert.deepEqual(figures(p[0]), figures(e[0]), what);
  }
  const set = section.match(/\*\*The set:\*\* (\d+) floor plan images from public property listings, (\d+) in Poland and (\d+) in the UK/);
  assert.ok(set, 'the English section no longer describes the set this way');
  assert.match(pl, new RegExp(`${set[1]} prawdziwych rzut(ach|ów)`), 'the size of the set');
  assert.ok(pl.includes(`po ${set[2]} w Polsce i w Wielkiej Brytanii`) && set[2] === set[3], 'the split of the set between the two countries');
}

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
