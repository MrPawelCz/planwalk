// End to end in headless Chrome: the page speaks Polish for a Polish browser (and for ?lang=pl), English otherwise, switches
// language without a reload and without losing the model, the camera or the choices, labels in the 3D scene follow, dialogs open
// without showModal, and export file names lose the Polish letters. Set PLANWALK_SHOT_DIR to also write screenshots there.
// Builds the page into a temporary folder first. Skips when Chrome is missing, fails instead when PLANWALK_REQUIRE_CHROME=1.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, skipReason } from './first-visit-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-lang-e2e-'));
const page = join(out, 'planwalk.html');
const skip = process.env.PLANWALK_REQUIRE_CHROME === '1' ? false : skipReason();
const shotDir = process.env.PLANWALK_SHOT_DIR || '';
const PL = "Object.defineProperty(navigator, 'languages', { get: () => ['pl-PL', 'pl', 'en'] }); Object.defineProperty(navigator, 'language', { get: () => 'pl-PL' });";
const STUB = "Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });";
const settle = 'new Promise((r) => setTimeout(r, 200))';
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const click = (sel) => `${q(sel)}.click()`;
const plan = (edit) => { const p = JSON.parse(readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8')); edit?.(p); return JSON.stringify(p); };

const withPage = (opts, fn) => async () => {
  if (process.env.PLANWALK_REQUIRE_CHROME === '1') assert.equal(skipReason(), false, 'Chrome is required');
  const p = await openPage(page, opts);
  try { await fn(p); assert.deepEqual(p.issues, [], 'console stays clean'); } finally { await p.close(); }
};
async function waitUntil(p, expression, ms = 30000) {
  for (let t = 0; t < ms; t += 200) {
    if (await p.evaluate(expression).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
const shot = async (p, name) => { if (shotDir) { mkdirSync(shotDir, { recursive: true }); await p.shot(join(shotDir, name), 55); } };

// Every caption on the page as plain strings: text nodes and title, placeholder and aria-label attributes of the app, dialogs
// included, without the data a plan brings along (its name, the example names, level names).
const CAPTIONS = `(() => {
  const out = [];
  const data = (el) => el.closest('.pw-name, #pw-card-samples') || el.tagName === 'DD' || (el.tagName === 'OPTION' && el.value !== '');
  const walker = document.createTreeWalker(document.getElementById('pw-app'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const s = n.nodeValue.trim(); if (s && !data(n.parentElement) && n.parentElement.tagName !== 'STYLE') out.push(s); }
  for (const el of document.querySelectorAll('#pw-app *')) for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && !data(el)) out.push(v); }
  return out;
})()`;
const dialogs = `[...document.querySelectorAll('dialog')]`;
// Opens every dialog in turn so its texts exist, collects the captions, closes them again.
async function allCaptions(p) {
  const all = new Set(await p.evaluate(CAPTIONS));
  for (const labels of [['Help', 'Pomoc'], ['About', 'O modelu'], ['Paste JSON', 'Wklej odpowiedź']]) {
    await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => ${JSON.stringify(labels)}.includes(b.textContent)).click(); ${settle}`);
    for (const s of await p.evaluate(CAPTIONS)) all.add(s);
    await p.evaluate(`${dialogs}.forEach((d) => d.close())`);
  }
  return [...all];
}

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

const ENGLISH = /\b(the|and|your|this|that|with|from|paste|export|open|close|copy|help|level|levels|example|examples|file|notes|source|warnings?|errors?|issues|hide|load|cancel|labels|textures|explode|cutaway|walk|orbit|top|dollhouse|about|scale|rooms|drop|pick|here|stored|uploaded|answer|links|language)\b/i;
const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

test('a Polish browser gets a Polish page: html lang, toolbar, first-visit card, Help, About and the paste dialog, no English left over', { skip, timeout: 120000 }, withPage({ beforeLoad: `${PL}${STUB}`, width: 1280, height: 800 }, async (p) => {
  assert.equal(await p.evaluate('document.documentElement.lang'), 'pl');
  const bar = await p.evaluate(`[...document.querySelectorAll('.pw-bar button, .pw-bar label')].map((e) => e.textContent.trim()).filter(Boolean)`);
  for (const want of ['Makieta', 'Obrót', 'Z góry', 'Spacer', 'Rozsuń piętra', 'Niskie ściany', 'Nazwy pokoi', 'Tekstury', 'Wklej odpowiedź', 'Pobierz model 3D (GLB)', 'Pobierz obraz (PNG)', 'Pobierz jako plik HTML', 'O modelu', 'Pomoc']) assert.ok(bar.includes(want), `${want} is missing in ${bar.join(' | ')}`);
  assert.equal(await p.evaluate(`${q('.pw-visit h2')}.textContent`), 'To jest przykład');
  const captions = await allCaptions(p);
  assert.ok(captions.some((c) => c === 'Jak działa planwalk'), 'the Help dialog is Polish');
  assert.ok(captions.some((c) => c === 'O tym modelu'), 'the About sheet is Polish');
  assert.ok(captions.some((c) => /^Wklej tutaj całą odpowiedź z czatu/.test(c)), 'the paste dialog is Polish');
  assert.ok(captions.includes('Piętro') && captions.includes('Przykłady'), 'select titles are Polish');
  const english = captions.filter((c) => ENGLISH.test(c.replace(/\b(GLB|PNG|HTML|JSON|AI|WASD|Shift|Esc|PDF|WebGL|planwalk|prompt)\b/g, '')));
  assert.deepEqual(english, [], 'English words on a Polish page');
  await shot(p, 'pl-desktop-example.jpg');
}));

test('an English browser gets an English page, with no Polish letters in the captions', { skip, timeout: 120000 }, withPage({ beforeLoad: STUB }, async (p) => {
  assert.equal(await p.evaluate('document.documentElement.lang'), 'en');
  const captions = await allCaptions(p);
  assert.ok(captions.includes('How planwalk works') && captions.includes('About this model'));
  assert.deepEqual(captions.filter((c) => POLISH_LETTERS.test(c)), []);
}));

test('?lang= wins over the browser language, an unknown value does not', { skip, timeout: 120000 }, async () => {
  const check = async (opts, lang, title) => {
    const p = await openPage(page, opts);
    try {
      assert.equal(await p.evaluate('document.documentElement.lang'), lang);
      assert.equal(await p.evaluate(`${q('.pw-visit h2')}.textContent`), title);
      assert.deepEqual(p.issues, []);
    } finally { await p.close(); }
  };
  await check({ search: '?lang=en', beforeLoad: PL }, 'en', 'This is an example');
  await check({ search: '?lang=pl' }, 'pl', 'To jest przykład');
  await check({ search: '?lang=xx', beforeLoad: PL }, 'pl', 'To jest przykład');
});

test('the PL | EN buttons in Help switch the language at once and keep the model, the camera and the choices', { skip, timeout: 180000 }, withPage({ beforeLoad: `${PL}${STUB}`, width: 1280, height: 800 }, async (p) => {
  const loaded = await p.evaluate(`window.planwalk.load(${JSON.stringify(plan((x) => { x.levels[0].height = 7.5; }))})`);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.warnings.length, 1, 'one warning gives the issues panel something to say');
  await p.evaluate(`window.planwalk.setMode('orbit'); window.planwalk.setLevel(${q('.pw-bar select')}.options[1].value); window.planwalk.setExplode(0.5); window.planwalk.setLabels(true); window.planwalk.advanceTime(1500)`);
  const level = await p.evaluate(`${q('.pw-bar select')}.value`);
  assert.notEqual(level, '', 'a level is selected');
  const before = await p.evaluate('window.planwalk.renderGameToText()');
  assert.equal(JSON.parse(before).mode, 'orbit');
  assert.equal(await p.evaluate(`${q('.pw-issues h3')}.textContent.startsWith('Problemy: 0 błędów, 1 ostrzeżenie')`), true);
  const panel = await p.evaluate(`${q('.pw-issues')}.textContent`);
  assert.match(panel, /Ostrzeżenia: model się wczytał/);
  assert.ok(!/\bnull\b|undefined/.test(panel), 'the panel holds no stray null or undefined');
  await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === 'Pomoc').click(); ${settle}`);
  await shot(p, 'pl-desktop-help.jpg');
  // to English, with Help still open
  await p.evaluate(`${q('.pw-help .pw-lang button[lang="en"]')}.focus(); ${click('.pw-help .pw-lang button[lang="en"]')}; ${settle}`);
  assert.equal(await p.evaluate('document.documentElement.lang'), 'en');
  assert.equal(await p.evaluate(`${q('.pw-help h2')}.textContent`), 'How planwalk works');
  assert.equal(await p.evaluate(`${q('.pw-help')}.hasAttribute('open')`), true, 'the open dialog stays open');
  assert.equal(await p.evaluate(`${q('.pw-help .pw-lang button[lang="en"]')}.getAttribute('aria-pressed')`), 'true');
  assert.equal(await p.evaluate(`document.activeElement === ${q('.pw-help .pw-lang button[lang="en"]')}`), true, 'keyboard focus stays on the language button');
  const barEn = await p.evaluate(`[...document.querySelectorAll('.pw-bar button, .pw-bar label')].map((e) => e.textContent.trim())`);
  for (const want of ['Dollhouse', 'Orbit', 'Top', 'Walk', 'Explode', 'Cutaway', 'Labels', 'Textures', 'Paste JSON', 'Export GLB', 'Export PNG', 'Standalone HTML', 'Help']) assert.ok(barEn.includes(want), want);
  assert.equal(await p.evaluate(`${q('.pw-issues h3')}.textContent.startsWith('Issues: 0 errors, 1 warning')`), true);
  assert.equal(await p.evaluate(`${q('.pw-bar select')}.options[0].textContent`), 'All levels');
  assert.equal(await p.evaluate('window.planwalk.renderGameToText()'), before, 'the model, the camera and the choices are untouched');
  assert.equal(await p.evaluate(`${q('.pw-bar select')}.value`), level, 'the selected level stays');
  await shot(p, 'en-desktop-help.jpg');
  // and back to Polish
  await p.evaluate(`${click('.pw-help .pw-lang button[lang="pl"]')}; ${settle}`);
  assert.equal(await p.evaluate('document.documentElement.lang'), 'pl');
  assert.equal(await p.evaluate(`${q('.pw-help h2')}.textContent`), 'Jak działa planwalk');
  assert.equal(await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].some((b) => b.textContent === 'Pobierz model 3D (GLB)')`), true);
  assert.equal(await p.evaluate('window.planwalk.renderGameToText()'), before);
  // the Copy fix request text follows the page language, the issue lines stay English
  await p.evaluate(`${dialogs}.forEach((d) => d.close()); ${click('.pw-issues h3 button')}; ${settle}`);
  const fix = await p.evaluate('window.__copied');
  assert.match(fix, /^Poniższy JSON planu mieszkania nie przeszedł kontroli w planwalk\./);
  assert.match(fix, /\nProblemy:\n- W113 /);
  assert.match(fix, / Fix: /);
  await p.evaluate(`window.planwalk.setLang('en'); ${click('.pw-issues h3 button')}; ${settle}`);
  assert.match(await p.evaluate('window.__copied'), /^The floor plan JSON below failed validation in planwalk\./);
}));

test('Copy prompt: the next step stays on the card until the next tap; an English phone with Polish in its list copies the Polish prompt', { skip, timeout: 120000 }, withPage({
  beforeLoad: `${STUB}Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en', 'pl'] });`,
}, async (p) => {
  const promptPl = 'document.getElementById("planwalk-prompt-pl").textContent';
  assert.equal(await p.evaluate(`!!document.getElementById("planwalk-prompt-pl")`), true, 'the page carries the Polish prompt');
  assert.equal(await p.evaluate('document.documentElement.lang'), 'en', 'the page itself stays English');
  assert.equal(await p.evaluate(`${q('.pw-visit-next')}.hidden`), true);
  await p.evaluate(`${click('.pw-visit .pw-primary')}; ${settle}`);
  assert.equal(await p.evaluate(`window.__copied.slice(0, 60) === ${promptPl}.slice(0, 60)`), true, 'the Polish prompt was copied');
  assert.equal(await p.evaluate(`${q('.pw-visit-next')}.hidden`), false);
  assert.match(await p.evaluate(`${q('.pw-visit-next')}.textContent`), /^Copied\. Now open an AI chat/);
  await p.evaluate('new Promise((r) => setTimeout(r, 1900))');
  assert.equal(await p.evaluate(`${q('.pw-visit .pw-primary')}.textContent`), 'Copy prompt', 'the button caption comes back');
  assert.equal(await p.evaluate(`${q('.pw-visit-next')}.hidden`), false, 'the next step stays');
  await p.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].find((b) => b.textContent === 'Paste answer').click(); ${settle}`);
  assert.equal(await p.evaluate(`${q('.pw-visit-next')}.hidden`), true, 'the next tap clears it');
}));

test('the banner and the empty-state card follow a change of language too', { skip, timeout: 120000 }, withPage({ beforeLoad: `${PL}${STUB}` }, async (p) => {
  await p.evaluate(`window.planwalk.load('to nie jest plan'); ${settle}`);
  const banner = () => p.evaluate(`${q('.pw-banner')}.hidden ? null : ${q('.pw-banner span')}.textContent`);
  assert.match(await banner(), /W tym tekście nie ma planu/);
  await p.evaluate("window.planwalk.setLang('en')");
  assert.match(await banner(), /That text does not contain a plan/);
  await p.evaluate("window.planwalk.setLang('pl')");
  assert.match(await banner(), /W tym tekście nie ma planu/);
}));

test('room labels in the 3D scene are drawn again: decimal comma in Polish, point in English, the camera and visibility stay', { skip, timeout: 120000 }, withPage({ beforeLoad: `${PL}${STUB}`, width: 1280, height: 800 }, async (p) => {
  await p.evaluate(`window.planwalk.load(${plan()}); window.planwalk.setMode('top'); window.planwalk.advanceTime(500)`);
  const cam = await p.evaluate('JSON.stringify(window.planwalk.state().camera)');
  await shot(p, 'pl-top-labels.jpg');
  await p.evaluate("window.planwalk.setLang('en'); window.planwalk.advanceTime(100)");
  assert.equal(await p.evaluate('JSON.stringify(window.planwalk.state().camera)'), cam);
  assert.equal(await p.evaluate('window.planwalk.state().labels'), true);
  await shot(p, 'en-top-labels.jpg');
}));

test('Help, About and the paste dialog open and close without showModal (Safari before 15.4), and the page is not reloaded', { skip, timeout: 120000 }, withPage({
  beforeLoad: `${STUB}delete HTMLDialogElement.prototype.showModal; window.__marker = 'same page';`, width: 1280, height: 800,
}, async (p) => {
  assert.equal(await p.evaluate('typeof HTMLDialogElement.prototype.showModal'), 'undefined');
  const opened = async (label, selector) => {
    await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === ${JSON.stringify(label)}).click(); ${settle}`);
    assert.equal(await p.evaluate(`${q(selector)}.hasAttribute('open')`), true, `${label} opens`);
    assert.equal(await p.evaluate(`getComputedStyle(${q(selector)}).display !== 'none' && ${q(selector)}.getBoundingClientRect().width > 100`), true, `${label} is visible`);
  };
  await opened('Help', '.pw-help');
  await shot(p, 'en-help-without-showmodal.jpg');
  await p.evaluate(`${q('.pw-help form button')}.click(); ${settle}`);
  assert.equal(await p.evaluate(`${q('.pw-help')}.hasAttribute('open')`), false, 'Close closes Help');
  await opened('About', '.pw-about');
  await p.evaluate(`${q('.pw-about')}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ${settle}`);
  assert.equal(await p.evaluate(`${q('.pw-about')}.hasAttribute('open')`), false, 'Escape closes About');
  await opened('Paste JSON', 'dialog.pw-dlg:not(.pw-help):not(.pw-about)');
  await p.evaluate(`[...document.querySelectorAll('dialog.pw-dlg button')].find((b) => b.textContent === 'Cancel').click(); ${settle}`);
  assert.equal(await p.evaluate(`document.querySelectorAll('dialog[open]').length`), 0, 'Cancel closes the paste dialog');
  assert.equal(await p.evaluate('window.__marker + location.search'), 'same page', 'no reload, no query string');
}));

test('export file names lose the Polish letters: Żoliborz, Mieszkanie 3 pokoje gives zoliborz-mieszkanie-3-pokoje', { skip, timeout: 120000 }, withPage({ beforeLoad: `${PL}${STUB}` }, async (p) => {
  await p.evaluate(`window.planwalk.load(${plan((x) => { x.name = 'Żoliborz, Mieszkanie 3 pokoje'; })});
    URL.createObjectURL = (b) => { window.__blob = b; return 'blob:none'; }; HTMLAnchorElement.prototype.click = function () { window.__names = (window.__names || []).concat(this.download); };`);
  for (const label of ['Pobierz obraz (PNG)', 'Pobierz jako plik HTML', 'Pobierz model 3D (GLB)']) {
    await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);
  }
  assert.equal(await waitUntil(p, '(window.__names || []).length === 3'), true, 'three downloads');
  assert.deepEqual([...(await p.evaluate('window.__names'))].sort(), ['zoliborz-mieszkanie-3-pokoje.glb', 'zoliborz-mieszkanie-3-pokoje.html', 'zoliborz-mieszkanie-3-pokoje.png']);
}));
