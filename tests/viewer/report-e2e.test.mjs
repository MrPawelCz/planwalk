// End to end in headless Chrome: the "Report a bad reading" button. It is hidden for the bundled example and shown for a plan the person
// loaded (in the toolbar on a computer, in the Menu sheet on a phone, and in the issues panel next to "Copy fix request"); a tap puts the
// plan JSON on the clipboard and opens a new tab on a prefilled GitHub issue (window.open and the clipboard are replaced by recorders, so
// no tab opens and nothing is posted); where copying fails a window shows the JSON in a field; the page makes no request and stores
// nothing; English and Polish; a computer and a phone (390 x 844). Builds the page into a temporary folder first.
// Chrome runs through tools/chrome-lock.sh when other browsers may be running. PW_EVIDENCE=dir keeps screenshots.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzePlan } from '../../src/core/validate.js';
import { MAX_URL, reportUrl } from '../../viewer/src/report.js';
import { fixRequestText } from '../../viewer/src/strings.js';
import { openPage, skip as pageSkip } from './chrome-page.mjs';
import { openPhone, skipReason } from './phone-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-report-e2e-'));
const FILE = join(out, 'planwalk.html');
const PAGE = pathToFileURL(FILE).href;
const skip = pageSkip || skipReason();
const evidence = process.env.PW_EVIDENCE || '';
if (evidence) mkdirSync(evidence, { recursive: true });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const EN = 'Report a bad reading', PL = 'Zgłoś zły odczyt';
const NAME = 'Jane Doe 5 Quillfeather Road';

// The two level fixture with a person's name on the plan and on a room, a door that is too wide, a window that runs past the end of its
// wall: a few warnings and an error, so the issues panel is up.
const planObject = (() => {
  const p = JSON.parse(readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8'));
  p.name = NAME;
  p.levels[0].rooms[0].name = NAME;
  p.levels[0].openings.find((o) => o.id === 'gd1').width = 1.6;
  p.levels[0].openings.push({ id: 'gd3', wall: 'g1', type: 'door', offset: 3.0, width: 1.5 });
  p.levels[0].openings.push({ id: 'gw9', wall: 'g1', type: 'window', offset: 7.8, width: 1.4 });
  return p;
})();
const planText = JSON.stringify(planObject);
const analysis = analyzePlan(JSON.parse(planText));
const issues = { errors: analysis.errors, warnings: analysis.warnings };
const clean = JSON.stringify(JSON.parse(readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8')));
// An answer that cannot be built into a model (no levels), wrapped in a chat sentence that holds a person's name: the banner of such an
// answer carries its own "Report a bad reading". What was pasted goes to the clipboard as it was, the codes of THIS answer into the address.
const rejectedJson = '{"version": 1, "units": "m", "levels": []}';
const rejectedText = `Here is the plan for ${NAME}:\n${rejectedJson}\nTell me if it needs a change.`;
const rejected = analyzePlan(JSON.parse(rejectedJson));
const rejectedIssues = { errors: rejected.errors, warnings: rejected.warnings };
const SENT = { en: 'Plan copied to your clipboard. The report opens in a new tab; if nothing opened, allow pop-ups and tap again. Cover names and addresses before you paste.', pl: 'Plan jest skopiowany do schowka. Zgłoszenie otworzy się w nowej karcie. Jeśli nic się nie otworzyło, zezwól na wyskakujące okna i naciśnij przycisk jeszcze raz. Zasłoń imiona i adresy, zanim wkleisz plan.' };
const WORKING_CLIPBOARD = `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } }); window.__copied = null; window.__copy = "ok"`;
const REFUSING_CLIPBOARD = `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new DOMException("no", "NotAllowedError")) } }); document.execCommand = () => false; window.__copied = null`;
const noteText = 'document.querySelector(".pw-loaded.on") ? document.querySelector(".pw-loaded.on").textContent : null';

// The banner of a rejected answer, on a page that shows the bundled example: the button is in the banner (and only there), a tap copies
// what was pasted and opens the issue with the codes of that answer, the page says what happened, a refused copy shows the pasted text.
async function assertRejectedBanner(page, { lang, label }) {
  const L = lang === 'pl' ? PL : EN;
  assert.equal(await page.evaluate(visible(L)), 0, `${label}: the example is on screen, so no button yet`);
  await page.evaluate(`window.__copy = "ok"; ${WORKING_CLIPBOARD}`);
  const before = await page.evaluate('window.__opened.length');
  await page.evaluate(`window.planwalk.load(${JSON.stringify(rejectedText)}, 'paste')`);
  assert.ok(await page.waitFor(`${visible(L)} === 1`), `${label}: one button, in the banner`);
  assert.equal(await page.evaluate(`${buttons(L)}.filter((b) => b.getClientRects().length > 0)[0].closest(".pw-banner") !== null`), true, `${label}: it is in the banner`);
  assert.equal(await page.evaluate(`${buttons(L)}.filter((b) => b.getClientRects().length > 0 && (b.closest(".pw-bar") || b.closest(".pw-issues"))).length`), 0, `${label}: the toolbar and the issues panel still have none (the plan on screen is the example)`);
  assert.equal(await page.evaluate('document.querySelector(".pw-banner").hidden'), false);
  assert.ok(rejectedIssues.errors.length > 0, 'the answer has errors');
  await page.evaluate(`${buttons(L)}.find((b) => b.closest(".pw-banner")).click()`);
  assert.ok(await page.waitFor(`window.__opened.length === ${before + 1}`), `${label}: the tab opened`);
  const opened = await page.evaluate(`window.__opened[${before}]`);
  assert.deepEqual(opened.slice(1), ['_blank', 'noopener,noreferrer']);
  assert.equal(opened[0], reportUrl({ version: pkg.version, lang, promptLang: lang, issues: rejectedIssues }), `${label}: the codes of the rejected answer`);
  assert.match(decode(opened[0]).title, /^Bad reading: E\d{3}/);
  for (const secret of ['Doe', 'Quillfeather', 'Here is the plan', 'levels']) assert.ok(!decodeURIComponent(opened[0]).includes(secret), `${label}: "${secret}" is in the address`);
  assert.ok(await page.waitFor('window.__copied !== null'), `${label}: nothing was copied`);
  assert.equal(await page.evaluate('window.__copied'), rejectedText, `${label}: what was pasted, as it was`);
  assert.ok(await page.waitFor(`(${noteText}) === ${JSON.stringify(SENT[lang])}`), `${label}: the note says what happened: ${await page.evaluate(noteText)}`);
  assert.equal(await page.evaluate('document.querySelector(".pw-loaded").getClientRects().length > 0'), true, `${label}: the note is on screen`);
  // The clipboard refuses: the tab still opens and the window holds the pasted text.
  await page.evaluate(`${REFUSING_CLIPBOARD}`);
  await page.evaluate(`${buttons(L)}.find((b) => b.closest(".pw-banner")).click()`);
  assert.ok(await page.waitFor(`window.__opened.length === ${before + 2}`), `${label}: the tab opens even when copying fails`);
  assert.ok(await page.waitFor(dialogOpen), `${label}: the window`);
  assert.equal(await page.evaluate('document.querySelector("dialog.pw-report-dlg textarea").value'), rejectedText);
  await page.evaluate('document.querySelector("dialog.pw-report-dlg button[type=submit]").click()');
  assert.ok(await page.waitFor(`!${dialogOpen}`));
  // A text without a plan in it has nothing to report: the banner says so and has no such button.
  await page.evaluate(`${WORKING_CLIPBOARD}; window.planwalk.load("hello, there is no plan here", "paste")`);
  assert.equal(await page.evaluate('document.querySelector(".pw-banner").hidden'), false);
  assert.equal(await page.evaluate(visible(L)), 0, `${label}: no plan found, nothing to report`);
}

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

// Recorders: window.open collects its arguments, the clipboard keeps the last text (or refuses, see __copy), and every way a page could send
// or store something is counted in __net (a request, a beacon, local or session storage, a cookie, IndexedDB).
const STUBS = `
window.__opened = []; window.open = function () { window.__opened.push([...arguments]); return null; };
window.__copied = null; window.__copy = 'ok';
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => {
  if (window.__copy === 'ok') { window.__copied = t; return Promise.resolve(); }
  return Promise.reject(new DOMException('no', 'NotAllowedError'));
} } });
window.__net = [];
const wrap = (obj, name, tag) => { const o = obj && obj[name]; if (typeof o === 'function') obj[name] = function () { window.__net.push(tag); return o.apply(this, arguments); }; };
wrap(window, 'fetch', 'fetch'); wrap(XMLHttpRequest.prototype, 'open', 'xhr'); wrap(navigator, 'sendBeacon', 'beacon');
wrap(Storage.prototype, 'setItem', 'storage'); wrap(window.IDBFactory && IDBFactory.prototype, 'open', 'indexedDB'); wrap(window, 'WebSocket', 'websocket');
try { Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: () => { window.__net.push('cookie'); } }); } catch (e) { /* not allowed here */ }
`;
const PL_BROWSER = `Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['pl-PL', 'pl'] }); Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'pl-PL' });`;

const hasModel = 'window.planwalk && window.planwalk.state().counts.walls > 0';
const buttons = (label) => `[...document.querySelectorAll("button")].filter((b) => b.textContent === ${JSON.stringify(label)})`;
const visible = (label) => `${buttons(label)}.filter((b) => b.getClientRects().length > 0).length`;
const dialogOpen = 'document.querySelector("dialog.pw-report-dlg").open';
const prettyOf = (text) => JSON.stringify(JSON.parse(text), null, 2);
const decode = (url) => { const u = new URL(url); return { path: u.origin + u.pathname, title: u.searchParams.get('title'), body: u.searchParams.get('body'), keys: [...u.searchParams.keys()] }; };

// What a click must have done: one more tab opened on the issue, with the right address, and the plan on the clipboard.
async function assertReported(page, count, { lang, promptLang = lang, label }) {
  assert.ok(await page.waitFor(`window.__opened.length === ${count}`), `${label}: no tab was opened`);
  const opened = await page.evaluate(`window.__opened[${count - 1}]`);
  assert.equal(opened.length, 3, `${label}: window.open(url, target, features)`);
  assert.equal(opened[1], '_blank', `${label}: a new tab`);
  assert.equal(opened[2], 'noopener,noreferrer', `${label}: without a link back and without a referrer`);
  const url = opened[0];
  assert.equal(url, reportUrl({ version: pkg.version, lang, promptLang, issues }), `${label}: the address`);
  assert.ok(url.length <= MAX_URL, `${label}: ${url.length} characters`);
  const d = decode(url);
  assert.equal(d.path, 'https://github.com/MrPawelCz/planwalk/issues/new');
  assert.deepEqual(d.keys, ['title', 'body'], 'no template and no labels');
  assert.match(d.title, /^Bad reading: [EW]\d{3}( [EW]\d{3}){0,4}$/);
  for (const secret of ['Doe', 'Quillfeather', 'Hall', 'Living', 'Landing', 'Minimal', 'gd3', 'gw9', 'g1', 'r-hall', 'L0']) assert.ok(!decodeURIComponent(url).includes(secret), `${label}: "${secret}" is in the address`);
  assert.ok(d.body.includes(`${pkg.version}`), `${label}: the version`);
  assert.ok(await page.waitFor('window.__copied !== null'), `${label}: nothing was copied`);
  assert.equal(await page.evaluate('window.__copied'), prettyOf(planText), `${label}: the plan on the clipboard, as Copy fix request ends with it`);
  return url;
}

test('computer, English: hidden for the bundled example, shown for a loaded plan (toolbar and issues panel), one tap copies the plan and opens the issue, a refused copy shows the JSON', { skip, timeout: 300000 }, async () => {
  const page = await openPage({ query: '?lang=en', size: [1280, 720], beforeLoad: STUBS });
  try {
    await page.navigate(`${PAGE}?lang=en`);
    assert.ok(await page.waitFor(hasModel));
    assert.ok((await page.evaluate(`${buttons(EN)}.length`)) >= 1, 'the toolbar has the button');
    assert.equal(await page.evaluate(visible(EN)), 0, 'not for the bundled example');

    // A plan the person loaded: both buttons.
    await page.evaluate(`window.planwalk.load(${JSON.stringify(planText)}, 'paste')`);
    assert.ok(await page.waitFor(`${visible(EN)} === 2`), 'the toolbar button and the one in the issues panel');
    assert.equal(await page.evaluate(`${buttons(EN)}.filter((b) => b.closest(".pw-bar")).length`), 1);
    assert.equal(await page.evaluate(`${buttons(EN)}.filter((b) => b.closest(".pw-issues")).length`), 1);
    assert.equal(await page.evaluate(`${buttons(EN)}.find((b) => b.closest(".pw-issues")).previousElementSibling.textContent`), 'Copy fix request', 'next to Copy fix request');
    assert.match(await page.evaluate(`${buttons(EN)}[0].title`), /Nothing is posted until you submit it/);
    if (evidence) await page.screenshot(join(evidence, 'desktop-issues-panel.jpg'), 55);

    // One tap on the toolbar button.
    await page.evaluate(`${buttons(EN)}.find((b) => b.closest(".pw-bar")).click()`);
    const url = await assertReported(page, 1, { lang: 'en', label: 'toolbar' });
    assert.ok(await page.waitFor(`(${noteText}) === ${JSON.stringify(SENT.en)}`), 'toolbar: the note says the plan is on the clipboard and the report opens in a new tab');
    assert.ok(decode(url).body.includes('**Interface language:** en'));
    assert.equal(await page.evaluate(dialogOpen), false, 'copying worked, so no window');
    // The text "Copy fix request" puts on the clipboard ends with the very same JSON.
    await page.evaluate(`window.__copied = null; ${buttons('Copy fix request')}[0].click()`);
    assert.ok(await page.waitFor('window.__copied !== null'));
    assert.equal(await page.evaluate('window.__copied'), fixRequestText({ errors: issues.errors, warnings: issues.warnings, body: prettyOf(planText) }, 'en'));
    // The button in the issues panel does the same.
    await page.evaluate(`window.__copied = null; ${buttons(EN)}.find((b) => b.closest(".pw-issues")).click()`);
    assert.equal(await assertReported(page, 2, { lang: 'en', label: 'issues panel' }), url, 'the same address');

    // The clipboard refuses: the tab still opens, and a window shows the JSON in a field that is selected.
    await page.evaluate('window.__copy = "refuse"; window.__copied = null; document.execCommand = () => false');
    await page.evaluate(`${buttons(EN)}.find((b) => b.closest(".pw-bar")).click()`);
    assert.ok(await page.waitFor('window.__opened.length === 3'), 'the tab opens even when copying fails');
    assert.ok(await page.waitFor(dialogOpen), 'the window with the JSON');
    const win = await page.evaluate(`(() => { const d = document.querySelector("dialog.pw-report-dlg"), a = d.querySelector("textarea"); return { value: a.value, readOnly: a.readOnly, all: a.selectionStart === 0 && a.selectionEnd === a.value.length, text: d.textContent, label: a.getAttribute("aria-label") }; })()`);
    assert.equal(win.value, prettyOf(planText));
    assert.equal(win.readOnly, true);
    assert.equal(win.all, true, 'the whole text is selected, ready to copy');
    assert.match(win.text, /Copying did not work here\. Select the plan below, copy it, and paste it into the GitHub issue after covering names and addresses\./);
    assert.equal(win.label, 'Plan JSON to copy');
    if (evidence) await page.screenshot(join(evidence, 'desktop-fallback-window.jpg'), 55);
    await page.evaluate('document.querySelector("dialog.pw-report-dlg button[type=submit]").click()');
    assert.ok(await page.waitFor(`!${dialogOpen}`), 'Close closes it');

    // No clipboard API at all and no old copy command: the same window.
    await page.evaluate('Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })');
    await page.evaluate(`${buttons(EN)}.find((b) => b.closest(".pw-issues")).click()`);
    assert.ok(await page.waitFor('window.__opened.length === 4'));
    assert.ok(await page.waitFor(dialogOpen), 'no clipboard API: the window');
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-report-dlg textarea").value'), prettyOf(planText));
    await page.evaluate('document.querySelector("dialog.pw-report-dlg button[type=submit]").click()');

    // A plan without a single message from the validator: the title is plain and the list says none.
    await page.evaluate(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } }); window.__copied = null`);
    await page.evaluate(`window.planwalk.load(${JSON.stringify(clean)}, 'paste')`);
    assert.ok(await page.waitFor(`${visible(EN)} === 1`), 'no issues, so only the toolbar button');
    await page.evaluate(`${buttons(EN)}.find((b) => b.closest(".pw-bar")).click()`);
    assert.ok(await page.waitFor('window.__opened.length === 5'));
    const clearUrl = (await page.evaluate('window.__opened[4]'))[0];
    assert.equal(decode(clearUrl).title, 'Bad reading');
    assert.ok(decode(clearUrl).body.includes('**Validator codes (no messages):** none'));

    // Back to a bundled example: the button goes away again.
    await page.evaluate('(() => { const s = document.querySelector(".pw-bar select[title=Examples]"); s.value = s.options[1].value; s.dispatchEvent(new Event("change")); })()');
    assert.ok(await page.waitFor(`${visible(EN)} === 0`), 'hidden again for an example');
    await assertRejectedBanner(page, { lang: 'en', label: 'banner, English' });
    if (evidence) { await page.evaluate(`window.planwalk.load(${JSON.stringify(rejectedText)}, 'paste'); ${buttons(EN)}.find((b) => b.closest(".pw-banner")).click()`); await page.waitFor(`(${noteText}) !== null`); await page.screenshot(join(evidence, 'desktop-banner-en.jpg'), 55); }

    assert.deepEqual(await page.evaluate('window.__net'), [], 'the page sent nothing and stored nothing');
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('computer, Polish: the button says "Zgłoś zły odczyt", the issue text is Polish, the title English, and the window speaks Polish', { skip, timeout: 240000 }, async () => {
  const page = await openPage({ query: '?lang=pl', size: [1280, 720], beforeLoad: `${STUBS}${PL_BROWSER}` });
  try {
    await page.navigate(`${PAGE}?lang=pl`);
    assert.ok(await page.waitFor(hasModel));
    assert.equal(await page.evaluate(visible(PL)), 0, 'not for the bundled example');
    assert.equal(await page.evaluate(`${buttons(EN)}.length`), 0, 'no English caption in a Polish page');
    await page.evaluate(`window.planwalk.load(${JSON.stringify(planText)}, 'paste')`);
    assert.ok(await page.waitFor(`${visible(PL)} === 2`));
    assert.equal(await page.evaluate(`${buttons(PL)}.find((b) => b.closest(".pw-issues")).previousElementSibling.textContent`), 'Kopiuj prośbę o poprawkę');
    assert.match(await page.evaluate(`${buttons(PL)}[0].title`), /Nic nie zostanie opublikowane, dopóki go nie wyślesz\./);
    await page.evaluate(`${buttons(PL)}.find((b) => b.closest(".pw-bar")).click()`);
    const url = await assertReported(page, 1, { lang: 'pl', label: 'Polish' });
    assert.ok(await page.waitFor(`(${noteText}) === ${JSON.stringify(SENT.pl)}`), 'Polish: the note in Polish');
    const d = decode(url);
    assert.ok(d.body.startsWith(`**Wersja planwalk:** ${pkg.version}\n**Język interfejsu:** pl\n**Zaproponowany język polecenia:** pl\n**Kody walidatora (bez komunikatów):** `), d.body.slice(0, 200));
    assert.match(d.body, /\*\*Model AI i czat:\*\* \n/);
    assert.match(d.body, /\*\*Co wygląda źle:\*\* \n/);
    assert.match(d.body, /po zasłonięciu imion i adresów\./);
    assert.match(d.body, /\*\*To zgłoszenie będzie publiczne\.\*\*/);
    // A switch to English while the plan is on screen: the caption and the text follow.
    assert.equal(await page.evaluate('window.planwalk.setLang("en")'), 'en');
    assert.ok(await page.waitFor(`${visible(EN)} === 2`), 'the captions follow the language');
    await page.evaluate(`${buttons(EN)}.find((b) => b.closest(".pw-bar")).click()`);
    assert.ok(await page.waitFor('window.__opened.length === 2'));
    assert.ok(decode((await page.evaluate('window.__opened[1]'))[0]).body.startsWith(`**planwalk version:** ${pkg.version}\n**Interface language:** en\n`));
    assert.ok(await page.waitFor(`(${noteText}) === ${JSON.stringify(SENT.en)}`), 'the note follows a switch to English');
    assert.equal(await page.evaluate('window.planwalk.setLang("pl")'), 'pl');
    assert.ok(await page.waitFor(`(${noteText}) === ${JSON.stringify(SENT.pl)}`), 'and back to Polish');
    // Refused copy: the window in Polish.
    await page.evaluate('window.__copy = "refuse"; document.execCommand = () => false');
    await page.evaluate(`${buttons(PL)}.find((b) => b.closest(".pw-issues")).click()`);
    assert.ok(await page.waitFor(dialogOpen));
    const text = await page.evaluate('document.querySelector("dialog.pw-report-dlg").textContent');
    assert.match(text, /Tutaj kopiowanie nie zadziałało\. Zaznacz plan poniżej, skopiuj go i wklej do zgłoszenia na GitHubie, po zasłonięciu imion i adresów\./);
    assert.match(text, /Zamknij/);
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-report-dlg textarea").getAttribute("aria-label")'), 'JSON planu do skopiowania');
    await page.evaluate('document.querySelector("dialog.pw-report-dlg button[type=submit]").click()');
    await page.evaluate('(() => { const s = document.querySelector(".pw-bar select[title=Przykłady]"); s.value = s.options[1].value; s.dispatchEvent(new Event("change")); })()');
    assert.ok(await page.waitFor(`${visible(PL)} === 0`), 'an example on screen again');
    await assertRejectedBanner(page, { lang: 'pl', label: 'banner, Polish' });
    assert.deepEqual(await page.evaluate('window.__net'), []);
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('phone, Polish (390 x 844): the Menu sheet and the issues sheet hold the button with a 44 px tap target, a tap opens the issue and closes the Menu, the window fits the screen', { skip, timeout: 300000 }, async () => {
  const p = await openPhone(FILE, { width: 390, height: 844, dpr: 2, search: '?lang=pl', beforeLoad: `${STUBS}${PL_BROWSER}` });
  try {
    const shot = (name) => (evidence ? p.shot(join(evidence, name), 50) : null);
    const count = (label) => p.evaluate(`${visible(label)}`);
    const menuButton = '.pw-menu-btn';
    assert.match(await p.evaluate('document.getElementById("pw-app").className'), /pw-compact/);

    // The bundled example: the Menu has no such button.
    await p.tap(menuButton);
    assert.equal(await count(PL), 0, 'not for the bundled example');
    await p.tap('.pw-sheet-x');

    // A loaded plan: the badge for the issues, and the button in the Menu.
    await p.evaluate(`window.planwalk.load(${JSON.stringify(planText)}, 'paste'); window.planwalk.advanceTime(300)`);
    await p.settle();
    await p.tap(menuButton);
    assert.equal(await count(PL), 1, 'in the Menu sheet');
    const box = await p.evaluate(`(() => { const b = ${buttons(PL)}.find((x) => x.closest(".pw-menu")), r = b.getBoundingClientRect(), s = document.querySelector(".pw-menu").getBoundingClientRect(); return { w: r.width, h: r.height, inside: r.left >= s.left - 1 && r.right <= s.right + 1 && r.bottom <= innerHeight + 1 && r.top >= 0, overflow: b.scrollWidth > b.clientWidth + 1 }; })()`);
    assert.ok(box.h >= 43.5 && box.w >= 43.5, `tap target ${Math.round(box.w)} x ${Math.round(box.h)}`);
    assert.equal(box.inside, true, 'the button is inside the sheet and on the screen');
    assert.equal(box.overflow, false, 'the caption fits the button');
    await shot('phone-menu-pl.jpg');
    await p.tap(`.pw-menu .pw-report`);
    assert.ok(await p.evaluate('window.__opened.length === 1'), 'the tap opened the issue');
    assert.equal(await p.evaluate('document.querySelector(".pw-menu").hidden'), true, 'the Menu got out of the way');
    const opened = await p.evaluate('window.__opened[0]');
    assert.deepEqual(opened.slice(1), ['_blank', 'noopener,noreferrer']);
    assert.equal(opened[0], reportUrl({ version: pkg.version, lang: 'pl', promptLang: 'pl', issues }));
    assert.equal(await p.evaluate('window.__copied'), prettyOf(planText));
    assert.equal(await p.evaluate('document.querySelector("dialog.pw-report-dlg").open'), false);

    // The issues sheet: both buttons, the report button next to Copy fix request.
    await p.tap('.pw-issues-btn');
    const panel = await p.evaluate(`(() => { const b = ${buttons(PL)}.find((x) => x.closest(".pw-issues")), c = b.previousElementSibling, r = b.getBoundingClientRect(), s = document.querySelector(".pw-issues").getBoundingClientRect(); return { prev: c.textContent, w: r.width, h: r.height, inside: r.left >= s.left - 1 && r.right <= s.right + 1, shown: r.width > 0 }; })()`);
    assert.equal(panel.prev, 'Kopiuj prośbę o poprawkę');
    assert.ok(panel.shown && panel.h >= 43.5 && panel.w >= 43.5, JSON.stringify(panel));
    assert.equal(panel.inside, true);
    await shot('phone-issues-pl.jpg');
    await p.tap('.pw-issues .pw-report');
    assert.ok(await p.evaluate('window.__opened.length === 2'));

    // The clipboard refuses: the window on a phone fits the screen and its field is readable.
    await p.evaluate('window.__copy = "refuse"; document.execCommand = () => false');
    await p.tap('.pw-issues .pw-report');
    assert.ok(await p.evaluate('window.__opened.length === 3'));
    await p.settle(400);
    const win = await p.evaluate(`(() => { const d = document.querySelector("dialog.pw-report-dlg"), a = d.querySelector("textarea"), r = d.getBoundingClientRect(), t = a.getBoundingClientRect(); return { open: d.open, l: r.left, t: r.top, r: r.right, b: r.bottom, ta: t.height, vw: innerWidth, vh: innerHeight, font: parseFloat(getComputedStyle(a).fontSize), len: a.value.length, same: a.value === ${JSON.stringify(prettyOf(planText))} }; })()`);
    assert.equal(win.open, true);
    assert.ok(win.l >= 0 && win.r <= win.vw + 1 && win.t >= 0 && win.b <= win.vh + 1, JSON.stringify(win));
    assert.ok(win.ta >= 80, `the field is ${win.ta} px high`);
    assert.ok(win.font >= 16, 'a field of 16 px or more, so the phone does not zoom in');
    assert.equal(win.same, true);
    await shot('phone-fallback-window-pl.jpg');
    await p.tap('dialog.pw-report-dlg .pw-dlg-x');
    assert.equal(await p.evaluate('document.querySelector("dialog.pw-report-dlg").open'), false, 'the cross closes it');

    assert.deepEqual(await p.evaluate('window.__net'), [], 'the page sent nothing and stored nothing');
    assert.deepEqual(p.issues, [], 'the console stays clean');
  } finally {
    await p.close();
  }
});

test('phone, Polish (390 x 844): the banner of an answer that cannot be built has "Zgłoś zły odczyt" with a 44 px tap target, a tap opens the issue, and the page says what happened', { skip, timeout: 240000 }, async () => {
  const p = await openPhone(FILE, { width: 390, height: 844, dpr: 2, search: '?lang=pl', beforeLoad: `${STUBS}${PL_BROWSER}` });
  try {
    const shot = (name) => (evidence ? p.shot(join(evidence, name), 50) : null);
    assert.match(await p.evaluate('document.getElementById("pw-app").className'), /pw-compact/);
    await p.evaluate(`window.planwalk.load(${JSON.stringify(rejectedText)}, 'paste'); window.planwalk.advanceTime(300)`);
    await p.settle();
    const box = await p.evaluate(`(() => { const b = document.querySelector(".pw-banner .pw-banner-more"), r = b.getBoundingClientRect(); return { label: b.textContent, hidden: b.hidden, w: r.width, h: r.height, inside: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; })()`);
    assert.equal(box.label, PL);
    assert.equal(box.hidden, false);
    assert.ok(box.h >= 43.5 && box.w >= 43.5, `tap target ${Math.round(box.w)} x ${Math.round(box.h)}`);
    assert.equal(box.inside, true, 'the button is on the screen');
    assert.equal(await p.evaluate(`${visible(PL)}`), 1, 'only the banner has one: the plan on screen is the example');
    await shot('phone-banner-pl.jpg');
    await p.tap('.pw-banner .pw-banner-more');
    assert.ok(await p.evaluate('window.__opened.length === 1'), 'the tap opened the issue');
    assert.equal(await p.evaluate('window.__opened[0][0]'), reportUrl({ version: pkg.version, lang: 'pl', promptLang: 'pl', issues: rejectedIssues }));
    assert.deepEqual((await p.evaluate('window.__opened[0]')).slice(1), ['_blank', 'noopener,noreferrer']);
    assert.equal(await p.evaluate('window.__copied'), rejectedText);
    await p.settle(300);
    assert.equal(await p.evaluate(noteText), SENT.pl, 'the note says what happened');
    const note = await p.evaluate('(() => { const r = document.querySelector(".pw-loaded").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight }; })()');
    assert.ok(note.l >= 0 && note.r <= note.vw + 1 && note.t >= 0 && note.b <= note.vh + 1, JSON.stringify(note));
    await shot('phone-sent-pl.jpg');
    assert.deepEqual(await p.evaluate('window.__net'), [], 'the page sent nothing and stored nothing');
    assert.deepEqual(p.issues, [], 'the console stays clean');
  } finally {
    await p.close();
  }
});
