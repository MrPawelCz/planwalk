// "Report a bad reading", the part that needs no browser: the address of the new GitHub issue (size, encoding, order of the codes,
// the same address for the same input, nothing of the plan in it, even for a hostile plan), the texts in both languages, the
// issue template that carries the same labels, and a scan of the module for anything that could send or store data.
// The button, the clipboard and the window that shows the JSON are in report-e2e.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePlan } from '../../src/core/validate.js';
import { MAX_CODES, MAX_TITLE_CODES, MAX_URL, STRINGS, TITLE, buildReport, reportUrl, sendReport, tallyCodes } from '../../viewer/src/report.js';
import { REPO, SITE } from '../../viewer/src/site.js';
import { setLang } from '../../viewer/src/i18n.js';
import { STRINGS as MAIN } from '../../viewer/src/strings.js';
import { DASHES, englishLeft } from './pl-deny.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const issue = (code) => ({ code, path: 'levels[0]', message: 'a message', fix: 'a fix' });
const decode = (url) => { const u = new URL(url); return { origin: u.origin + u.pathname, params: [...u.searchParams.keys()], title: u.searchParams.get('title'), body: u.searchParams.get('body') }; };
const BASE = { version: pkg.version, lang: 'en', promptLang: 'en' };

test('the address starts at the repository, has a title and a body and nothing else (no template, no labels)', () => {
  assert.equal(REPO, 'https://github.com/MrPawelCz/planwalk');
  assert.equal(`${REPO}/issues`, pkg.bugs.url, 'the constant and package.json name the same repository');
  assert.equal(pkg.repository.url, `git+${REPO}.git`);
  const url = reportUrl({ ...BASE, issues: { errors: [issue('E006')], warnings: [issue('W102')] } });
  assert.ok(url.startsWith(`${REPO}/issues/new?title=`), url.slice(0, 80));
  const d = decode(url);
  assert.equal(d.origin, `${REPO}/issues/new`);
  assert.deepEqual(d.params, ['title', 'body']);
  assert.ok(!url.includes('template=') && !url.includes('labels=') && !url.includes('assignees='));
  assert.ok(!url.includes(SITE), 'no address of the page, and with it no local path');
  assert.match(url, /^[\x21-\x7e]+$/, 'only printable ASCII: spaces, new lines and letters with accents are encoded');
});

test('the title: "Bad reading" and up to five codes in the order E before W, then by number; plain "Bad reading" without codes', () => {
  assert.equal(TITLE, 'Bad reading');
  assert.equal(buildReport({ ...BASE, issues: { errors: [], warnings: [] } }).title, 'Bad reading');
  assert.equal(buildReport({ ...BASE, issues: [] }).title, 'Bad reading');
  assert.equal(buildReport({ ...BASE }).title, 'Bad reading', 'no issues at all');
  assert.equal(buildReport({ ...BASE, issues: { errors: [issue('E006')], warnings: [issue('W102')] } }).title, 'Bad reading: E006 W102');
  const many = { errors: [issue('E013'), issue('E002'), issue('E006'), issue('E006')], warnings: [issue('W116'), issue('W102'), issue('W109'), issue('W102')] };
  assert.equal(buildReport({ ...BASE, issues: many }).title, 'Bad reading: E002 E006 E013 W102 W109', 'five codes, the rest is left out of the title');
  assert.equal(MAX_TITLE_CODES, 5);
  // The title is English whatever the interface language is.
  assert.equal(buildReport({ ...BASE, lang: 'pl', issues: many }).title, 'Bad reading: E002 E006 E013 W102 W109');
});

test('the body lists every code with how often it came up, sorted by code, and says so when there are none', () => {
  const issues = { errors: [issue('E006'), issue('E006')], warnings: [issue('W102'), issue('W102'), issue('W102'), issue('W102')] };
  const { body } = buildReport({ ...BASE, issues });
  assert.ok(body.includes('**Validator codes (no messages):** E006 x2, W102 x4'), body);
  assert.ok(buildReport({ ...BASE, issues: [] }).body.includes('**Validator codes (no messages):** none'));
  assert.ok(buildReport({ ...BASE, lang: 'pl', issues: [] }).body.includes('**Kody walidatora (bez komunikatów):** brak'));
  assert.deepEqual(tallyCodes(issues), [['E006', 2], ['W102', 4]]);
  assert.deepEqual(tallyCodes([issue('W102'), issue('E006'), issue('W102')]), [['E006', 1], ['W102', 2]], 'a plain list works too');
  assert.deepEqual(tallyCodes(null), []);
  assert.deepEqual(tallyCodes({}), []);
});

test('the body in English: version, languages, the codes, the two empty fields, the JSON note and the warning that the issue is public', () => {
  const { body } = buildReport({ version: '0.3.0', lang: 'en', promptLang: 'pl', issues: { errors: [issue('E008')], warnings: [] } });
  const lines = body.split('\n');
  assert.equal(lines[0], '**planwalk version:** 0.3.0');
  assert.equal(lines[1], '**Interface language:** en');
  assert.equal(lines[2], '**Prompt language offered:** pl');
  assert.equal(lines[3], '**Validator codes (no messages):** E008 x1');
  assert.ok(lines.includes('**AI model and chat:** '), 'an empty field');
  assert.ok(lines.includes('**What looks wrong:** '), 'an empty field');
  assert.match(body, /\*\*The JSON:\*\* the plan is on my clipboard .*I will paste it below after covering names and addresses\./);
  assert.match(body, /\*\*This issue is public\.\*\* Anyone can read it once you submit it/);
});

test('the body in Polish: the same lines in Polish, with the Polish warning', () => {
  const { body } = buildReport({ version: '0.3.0', lang: 'pl', promptLang: 'pl', issues: { errors: [issue('E008')], warnings: [] } });
  const lines = body.split('\n');
  assert.equal(lines[0], '**Wersja planwalk:** 0.3.0');
  assert.equal(lines[1], '**Język interfejsu:** pl');
  assert.equal(lines[2], '**Zaproponowany język polecenia:** pl');
  assert.equal(lines[3], '**Kody walidatora (bez komunikatów):** E008 x1');
  assert.ok(lines.includes('**Model AI i czat:** '));
  assert.ok(lines.includes('**Co wygląda źle:** '));
  assert.match(body, /\*\*JSON planu:\*\* plan jest w moim schowku .*po zasłonięciu imion i adresów\./);
  assert.match(body, /\*\*To zgłoszenie będzie publiczne\.\*\* Po wysłaniu przeczyta je każdy/);
  assert.ok(!body.includes('planwalk version'), 'nothing of the English text is left');
});

test('the language of the text follows the interface language when none is given, and an unknown language is English', () => {
  try {
    setLang('pl');
    assert.ok(buildReport({ version: '1.0.0', issues: [] }).body.startsWith('**Wersja planwalk:** 1.0.0\n**Język interfejsu:** pl\n**Zaproponowany język polecenia:** pl'));
    assert.ok(reportUrl({ version: '1.0.0', issues: [] }).includes(encodeURIComponent('Wersja planwalk:')));
    setLang('en');
    assert.ok(buildReport({ version: '1.0.0', issues: [] }).body.startsWith('**planwalk version:** 1.0.0\n**Interface language:** en\n**Prompt language offered:** en'));
  } finally {
    setLang('en');
  }
  assert.ok(buildReport({ ...BASE, lang: 'de', promptLang: 'fr', issues: [] }).body.includes('**Interface language:** en\n**Prompt language offered:** en'));
});

test('the same input gives the same address, whatever the order of the issues, and nothing in it is random or timed', () => {
  const a = [issue('W102'), issue('E006'), issue('W109'), issue('E006'), issue('W102')];
  const b = [...a].reverse();
  assert.equal(reportUrl({ ...BASE, issues: a }), reportUrl({ ...BASE, issues: a }));
  assert.equal(reportUrl({ ...BASE, issues: a }), reportUrl({ ...BASE, issues: b }));
  assert.equal(reportUrl({ ...BASE, issues: { errors: a.filter((i) => i.code[0] === 'E'), warnings: a.filter((i) => i.code[0] === 'W') } }), reportUrl({ ...BASE, issues: a }), 'a list and { errors, warnings } agree');
  const src = read('viewer/src/report.js');
  assert.ok(!/Math\.random|Date\.now|new Date|performance\.now|crypto/.test(src));
});

test('the version, the languages and the codes are checked: a text that is not a version, a code or a language does not get into the address', () => {
  const issues = [issue('E006'), issue('E006 Jane Doe 5 Quillfeather Road'), issue('e006'), issue('E06'), issue('E0066'), issue('W1 02'), issue(''), issue(undefined), issue(42), issue('x'.repeat(5000)), null, undefined, 'W102', { message: 'no code' }];
  assert.deepEqual(tallyCodes(issues), [['E006', 1]]);
  for (const version of ['0.3.0 beta Jane Doe', 'x'.repeat(5000), '', undefined, null, 3, '../../etc/passwd', '1.0\n2.0', '<script>']) {
    const { body } = buildReport({ version, lang: 'en', issues: [] });
    assert.ok(body.startsWith('**planwalk version:** unknown\n'), JSON.stringify(version));
  }
  for (const version of ['0.3.0', '0.3.0-rc.1', '12.34.56+build.7']) assert.ok(buildReport({ version, issues: [] }).body.startsWith(`**planwalk version:** ${version}\n`), version);
});

test('at most 20 different codes are listed, the rest only as a count; a thousand different codes keep the address under 6000 characters', () => {
  assert.equal(MAX_CODES, 20);
  assert.equal(MAX_URL, 6000);
  const codes = [];
  for (let i = 0; i < 1000; i++) codes.push(`E${String(i).padStart(3, '0')}`, `W${String(i).padStart(3, '0')}`);
  const list = [];
  for (const c of codes) for (let k = 0; k < 7; k++) list.push(issue(c)); // 14000 issues
  for (const lang of ['en', 'pl']) {
    const { body } = buildReport({ ...BASE, lang, issues: list });
    const line = body.split('\n')[3];
    const listed = line.match(/[EW]\d{3} x\d+/g);
    assert.equal(listed.length, 20, `${lang}: ${line}`);
    assert.ok(listed.every((s) => s.endsWith(' x7')));
    assert.deepEqual(listed.map((s) => s.slice(0, 4)), codes.filter((c) => c[0] === 'E').sort().slice(0, 20), `${lang}: the first 20 in order`);
    assert.ok(line.endsWith(lang === 'en' ? '(more codes: 1980)' : '(kolejne kody: 1980)'), line);
    const url = reportUrl({ ...BASE, lang, issues: list });
    assert.ok(url.length <= MAX_URL, `${lang}: ${url.length} characters`);
    assert.ok(url.length > 800, 'a real text, not an empty one');
    assert.equal(decode(url).title, 'Bad reading: E000 E001 E002 E003 E004');
  }
});

test('the longest possible address stays well under the limit, in both languages', () => {
  const all = [];
  for (let i = 0; i < 1000; i++) all.push(issue(`W${String(i).padStart(3, '0')}`), issue(`E${String(i).padStart(3, '0')}`));
  const biggest = { version: 'x'.repeat(32), lang: 'pl', promptLang: 'pl', issues: all };
  const long = reportUrl(biggest);
  assert.ok(long.length < 4500, `${long.length} characters`);
  assert.ok(reportUrl({ ...biggest, lang: 'en', promptLang: 'en' }).length < 4500);
});

test('a hostile plan: ids and names of 5000 characters, names of people and streets, thousands of problems: none of it reaches the address', () => {
  const NAME = 'Jane Doe 5 Quillfeather Road';
  const BIG = `${NAME} ${'x'.repeat(5000)}`;
  const p = JSON.parse(read('tests/fixtures/duplex-min.plan.json'));
  p.name = NAME;
  p.levels[0].name = BIG;
  p.levels[0].walls[0].id = BIG;
  p.levels[0].rooms[0].name = BIG; p.levels[0].rooms[0].id = BIG;
  p.levels[0].rooms[1].id = BIG;
  p.levels[0].openings.push({ id: BIG, wall: `${BIG}zz`, type: 'door', offset: 1, width: 0.9 });
  p.levels[0].walls.push({ id: BIG, from: [0, 0], to: [0, 0] });
  p.levels[0].furniture.push({ id: BIG, type: 'sofa', center: [90, 90], rotation: 0 });
  p.meta = { notes: `${NAME} ${'y'.repeat(5000)}`, scale_note: BIG };
  const res = analyzePlan(p);
  const issues = { errors: res.errors, warnings: res.warnings };
  const everything = JSON.stringify(issues);
  assert.ok(res.errors.length + res.warnings.length >= 5, 'the validator found problems');
  assert.ok(everything.includes('Quillfeather'), 'the validator messages do quote the plan, which is why only the codes may travel');
  assert.ok(everything.length > 5000);
  for (const lang of ['en', 'pl']) {
    const url = reportUrl({ ...BASE, lang, issues });
    assert.ok(url.length <= MAX_URL, `${lang}: ${url.length}`);
    const d = decode(url);
    const text = `${d.title}\n${d.body}\n${decodeURIComponent(url)}`;
    for (const secret of ['Doe', 'Jane ', 'Quillfeather', 'xxxxx', 'yyyyy', 'r-hall', 'r-living', 'Hall', 'Living', 'Minimal duplex', 'L0', 'g1', 'gd1', 'Ground', 'sofa']) {
      assert.ok(!text.includes(secret), `${lang}: "${secret}" is in the address`);
      assert.ok(!url.includes(encodeURIComponent(secret)), `${lang}: "${secret}" is in the encoded address`);
    }
    // What remains: the codes of the validator, the counts, the version and the fixed texts.
    const variable = d.body.split('\n').slice(0, 4).join('\n');
    assert.match(variable, /(E\d{3}|W\d{3}) x\d+/);
    assert.ok(variable.length < 400, `${variable.length} characters of variable text`);
  }
  // The same plan with other names of the same length gives the same address: nothing of the names is used.
  const other = 'Sam Roe 9 Thistledown Avenue';
  assert.equal(other.length, NAME.length);
  const q = JSON.parse(JSON.stringify(p).split(NAME).join(other));
  const res2 = analyzePlan(q);
  assert.ok(JSON.stringify(res2).includes('Thistledown'), 'the other names are in the validator output');
  assert.equal(reportUrl({ ...BASE, issues: { errors: res2.errors, warnings: res2.warnings } }), reportUrl({ ...BASE, issues }));
  assert.ok(!reportUrl({ ...BASE, issues: { errors: res2.errors, warnings: res2.warnings } }).includes('Thistledown'));
});

test('the addresses of real plans with problems: codes and counts, and a short address', () => {
  const p = JSON.parse(read('tests/fixtures/duplex-min.plan.json'));
  p.levels[0].openings.find((o) => o.id === 'gd1').width = 1.6;
  p.levels[0].openings.push({ id: 'gd3', wall: 'g1', type: 'door', offset: 3.0, width: 1.5 });
  const res = analyzePlan(p);
  const url = reportUrl({ ...BASE, issues: { errors: res.errors, warnings: res.warnings } });
  const d = decode(url);
  assert.match(d.title, /^Bad reading: [EW]\d{3}/);
  assert.ok(url.length < 2500, `${url.length} characters`);
  const counted = d.body.split('\n')[3].match(/[EW]\d{3} x(\d+)/g).map((s) => Number(s.split(' x')[1])).reduce((a, b) => a + b, 0);
  assert.equal(counted, res.errors.length + res.warnings.length, 'every issue is counted once');
});

test('the texts: same keys in both languages, nothing empty, no long dashes, the same placeholders, Polish is Polish', () => {
  assert.deepEqual(Object.keys(STRINGS.pl).sort(), Object.keys(STRINGS.en).sort());
  const slots = (s) => [...new Set(s.match(/\{\w+\}/g) || [])].sort();
  for (const [key, en] of Object.entries(STRINGS.en)) {
    const pl = STRINGS.pl[key];
    assert.ok(en.trim() && pl.trim(), `${key} is empty`);
    assert.ok(!DASHES.test(en) && !DASHES.test(pl), `${key}: long dash`);
    assert.deepEqual(slots(pl), slots(en), `${key}: placeholders`);
    assert.notEqual(pl, en, `${key} is not translated`);
    assert.deepEqual(englishLeft(pl), [], `${key}: English left in "${pl}"`);
  }
  // The labels the person fills in end with a colon, like the ones in the issue template.
  for (const lang of ['en', 'pl']) for (const key of ['version', 'uiLang', 'promptLang', 'codes', 'model', 'wrong', 'json']) assert.ok(STRINGS[lang][key].endsWith(':'), `${lang}.${key}`);
});

test('the new captions of the main window exist in both languages and the Polish button is "Zgłoś zły odczyt"', () => {
  for (const key of ['reportBad', 'reportBadTip', 'reportCopyFailed', 'reportLabel', 'reportClose', 'reportSent']) {
    assert.ok(MAIN.en[key] && MAIN.pl[key], key);
    assert.notEqual(MAIN.pl[key], MAIN.en[key], key);
    assert.deepEqual(englishLeft(MAIN.pl[key]), [], `${key}: ${MAIN.pl[key]}`);
    assert.ok(!DASHES.test(MAIN.en[key]) && !DASHES.test(MAIN.pl[key]), `${key}: long dash`);
  }
  assert.equal(MAIN.en.reportBad, 'Report a bad reading');
  assert.equal(MAIN.pl.reportBad, 'Zgłoś zły odczyt');
  assert.match(MAIN.en.reportBadTip, /Nothing is posted until you submit it/);
  assert.match(MAIN.pl.reportBadTip, /Nic nie zostanie opublikowane, dopóki go nie wyślesz/);
});

test('the message after a tap says the plan is on the clipboard, where the report opens, what to do when nothing opened and to cover names and addresses, in both languages', () => {
  assert.equal(MAIN.en.reportSent, 'Plan copied to your clipboard. The report opens in a new tab; if nothing opened, allow pop-ups and tap again. Cover names and addresses before you paste.');
  assert.match(MAIN.pl.reportSent, /schowka/);
  assert.match(MAIN.pl.reportSent, /nowej karcie/);
  assert.match(MAIN.pl.reportSent, /zezwól na wyskakujące okna/);
  assert.match(MAIN.pl.reportSent, /Zasłoń imiona i adresy/);
  for (const lang of ['en', 'pl']) assert.ok(MAIN[lang].reportSent.length < 220, `${lang}: short enough to read in one glance`);
});

test('the issue template carries the same labels as the text of the button, in the same order', () => {
  const template = read('.github/ISSUE_TEMPLATE/bad-reading.md');
  assert.match(template, /^---\nname: .+\nabout: .+\nlabels: reading-quality\n---\n/);
  const bold = (text) => [...text.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
  const fromButton = bold(buildReport({ ...BASE, issues: [] }).body);
  const fromTemplate = bold(template.slice(template.indexOf('\n---\n', 3)));
  assert.deepEqual(fromTemplate, fromButton);
  assert.ok(fromButton.includes('AI model and chat:') && fromButton.includes('What looks wrong:'));
  assert.ok(!DASHES.test(template), 'no long dashes');
  assert.ok(template.includes('The "Report a bad reading" button'), 'the template names the button');
});

test('the module cannot send or store anything: no network call, no beacon, no image or script loader, no storage, no cookie', () => {
  const src = read('viewer/src/report.js');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'new Image', 'createElement(\'script\')', 'createElement(\'img\')', 'importScripts', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.', 'openDatabase']) {
    assert.ok(!src.includes(bad), `report.js uses ${bad}`);
  }
  assert.match(src, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/, 'a new tab, without a link back to the page and without the address of this page as the referrer');
  assert.ok(!/https?:\/\//.test(src.replace(/\/\/.*$/gm, '')), 'no address of its own: the repository comes from site.js');
});

// What one tap does, for a plan on screen and for a rejected answer alike (the banner of an answer that cannot be built calls the same
// function): the copy starts before the tab is opened, the address holds the codes of the issues it was given and nothing of the text,
// a copy that worked tells the person, a copy that did not (false or an error) gives the text to the window.
test('sendReport: the copy starts first, then the tab opens on an address of codes and counts only, and the answer of the copy picks the note or the window', async () => {
  const text = 'My plan for Jane Doe, 5 Quillfeather Road: {"version": 1}';
  const issues = { errors: [issue('E006'), issue('E006')], warnings: [issue('W102')] };
  const run = async (copy) => {
    const log = [];
    await sendReport({ json: text, issues, version: pkg.version, lang: 'pl', promptLang: 'en',
      copy: (t) => { log.push(['copy', t]); return copy(); }, open: (url) => log.push(['open', url]), onSent: () => log.push(['sent']), onFailed: (t) => log.push(['failed', t]) });
    return log;
  };
  const ok = await run(() => Promise.resolve(true));
  assert.deepEqual(ok.map((e) => e[0]), ['copy', 'open', 'sent'], 'copy, then open, then the note');
  assert.equal(ok[0][1], text, 'the whole text goes to the clipboard');
  assert.equal(ok[1][1], reportUrl({ version: pkg.version, lang: 'pl', promptLang: 'en', issues }), 'the same address as reportUrl()');
  const d = decode(ok[1][1]);
  assert.equal(d.title, 'Bad reading: E006 W102');
  assert.ok(d.body.includes('E006 x2, W102 x1'));
  assert.ok(!decodeURIComponent(ok[1][1]).includes('Quillfeather') && !decodeURIComponent(ok[1][1]).includes('Jane'), 'nothing of the text in the address');
  assert.ok(ok[1][1].length <= MAX_URL);
  assert.deepEqual((await run(() => Promise.resolve(false))).map((e) => e[0]), ['copy', 'open', 'failed'], 'a refused copy: the window gets the text');
  const rejected = await run(() => Promise.reject(new Error('no')));
  assert.deepEqual(rejected.map((e) => e[0]), ['copy', 'open', 'failed'], 'a copy that throws: the same');
  assert.equal(rejected[2][1], text);
  const thrown = await run(() => { throw new Error('sync'); });
  assert.deepEqual(thrown.map((e) => e[0]), ['copy', 'open', 'failed'], 'a copy that throws at once: the tab still opens and the window gets the text');
});

test('sendReport: no issues at all gives a plain title and an address that does not grow with the text', async () => {
  const opened = [];
  const go = (json) => sendReport({ json, issues: [], version: pkg.version, lang: 'en', copy: () => Promise.resolve(true), open: (u) => opened.push(u) });
  await go('');
  await go('x'.repeat(2000000));
  assert.equal(opened[0], opened[1], 'the text never reaches the address');
  assert.equal(decode(opened[0]).title, 'Bad reading');
});
