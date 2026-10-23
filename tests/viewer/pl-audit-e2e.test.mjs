// The Polish audit in a real page: the viewer is loaded with ?lang=pl (in a browser that says English, so the parameter has to win),
// pushed through every state that shows words, and all the text of the page is read back (text nodes, title, placeholder and
// aria-label of everything in the app, closed dialogs included). Any English word of the deny list (tests/viewer/pl-deny.mjs) fails
// the test. What a plan brings along (its name, level and room names, the example names, the validator's own lines written for the
// AI) is data and is skipped. The string tables are audited one by one in pl-tables.test.mjs; this file catches what a table cannot:
// words glued together in main.js, a caption that never got its Polish twin, a state nobody looked at.
// Builds the page into a temporary folder first. Skips when Chrome is missing, fails instead when PLANWALK_REQUIRE_CHROME=1.
// Run it through tools/chrome-lock.sh when other browsers may be running.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, skipReason } from './first-visit-cdp.mjs';
import { DASHES, englishLeft } from './pl-deny.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-pl-audit-'));
const page = join(out, 'planwalk.html');
const skip = process.env.PLANWALK_REQUIRE_CHROME === '1' ? false : skipReason();
// An English browser: ?lang=pl has to beat it. The clipboard is a stub that also lets a test make copying fail.
const ENGLISH_BROWSER = "Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] }); Object.defineProperty(navigator, 'language', { get: () => 'en-GB' });";
const STUB = "Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => (window.__copyFails ? Promise.reject(new Error('refused')) : (window.__copied = t, Promise.resolve())) } });";
const settle = 'new Promise((r) => setTimeout(r, 250))';
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const readPlan = (edit) => { const p = JSON.parse(readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8')); edit?.(p); return JSON.stringify(p); };

// Every caption in the app as plain strings. Data is skipped: the plan name next to the logo, the example buttons, the options that
// name an example or a level, the rows of the About sheet, and the validator's lines (issue list items, the banner's detail lines).
const CAPTIONS = `(() => {
  const out = [];
  const data = (el) => el.closest('.pw-name, #pw-card-samples, .pw-issues li, .pw-banner-detail') || el.tagName === 'DD' || (el.tagName === 'OPTION' && el.value !== '');
  const walker = document.createTreeWalker(document.getElementById('pw-app'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const s = n.nodeValue.trim(); if (s && !data(n.parentElement) && n.parentElement.tagName !== 'STYLE') out.push(s); }
  for (const el of document.querySelectorAll('#pw-app *')) for (const a of ['title', 'placeholder', 'aria-label', 'alt']) { const v = el.getAttribute(a); if (v && !data(el)) out.push(v); }
  return out;
})()`;

// text -> the states it was seen in
function collector() {
  const seen = new Map();
  return {
    seen,
    async take(p, state) {
      for (const s of await p.evaluate(CAPTIONS)) seen.set(s, [...(seen.get(s) || []), state]);
    },
    // PLANWALK_PRINT_CAPTIONS=1 prints everything the audit read, state by state, for a human second look
    print(title) {
      if (!process.env.PLANWALK_PRINT_CAPTIONS) return;
      console.log(`--- ${title}: ${seen.size} captions`);
      for (const [text, states] of seen) console.log(`[${states[0]}] ${text}`);
    },
    problems() {
      const found = [];
      for (const [text, states] of seen) {
        const left = englishLeft(text);
        if (left.length) found.push(`English (${left.join(', ')}) in "${text}" [${[...new Set(states)].join(', ')}]`);
        if (DASHES.test(text)) found.push(`long dash in "${text}"`);
      }
      return found;
    },
  };
}

async function openDialogOf(p, label, selector) {
  await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === ${JSON.stringify(label)}).click(); ${settle}`);
  assert.equal(await p.evaluate(`${q(selector)}.hasAttribute('open')`), true, `${label} opens`);
}
const closeDialogs = (p) => p.evaluate(`[...document.querySelectorAll('dialog')].forEach((d) => d.close())`);

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

test('desktop, ?lang=pl in an English browser: no English left in the toolbar, the first-visit card, Help, About, the paste and link dialogs, the issues panel, the banners and the Walk hint', { skip, timeout: 240000 }, async () => {
  if (process.env.PLANWALK_REQUIRE_CHROME === '1') assert.equal(skipReason(), false, 'Chrome is required');
  const p = await openPage(page, { width: 1280, height: 800, search: '?lang=pl', beforeLoad: `${ENGLISH_BROWSER}${STUB}` });
  const c = collector();
  try {
    assert.equal(await p.evaluate('document.documentElement.lang'), 'pl', '?lang=pl wins over an English browser');
    await c.take(p, 'start');
    for (const [label, selector, state] of [['Pomoc', '.pw-help', 'Help'], ['O modelu', '.pw-about', 'About'], ['Wklej odpowiedź', 'dialog.pw-dlg:not(.pw-help):not(.pw-about):not(.pw-share-dlg)', 'paste dialog']]) {
      await openDialogOf(p, label, selector);
      await c.take(p, state);
      await closeDialogs(p);
    }
    // the Copy link dialog that appears when the clipboard refuses
    await p.evaluate(`window.__copyFails = true; document.execCommand = () => false; [...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === 'Kopiuj link').click(); ${settle}`);
    assert.equal(await p.evaluate(`${q('.pw-share-dlg')}.hasAttribute('open')`), true, 'the link dialog opens when copying fails');
    await c.take(p, 'link dialog');
    await closeDialogs(p);
    // a plan with a warning: the issues panel, its heading, notes and button
    const warned = await p.evaluate(`window.planwalk.load(${JSON.stringify(readPlan((x) => { x.levels[0].height = 7.5; }))})`);
    assert.equal(warned.warnings.length, 1);
    await p.evaluate(settle);
    await c.take(p, 'issues panel');
    // every kind of failure the banner can announce; a model is on screen, so none of them replaces it
    const noPlanAnswer = 'Przepraszam, nie widzę rysunku. {Proszę wysłać go jeszcze raz.}';
    const failures = {
      'no plan': noPlanAnswer,
      'cut off': '{"version": 1, "levels": [',
      'invalid': '{"a": nope}',
      'decimal comma': '{"thickness": 0,2}',
      'empty': '',
      'too long': `{${' '.repeat(2_300_000)}}`,
      'unusable': '{"version": 1, "units": "m", "levels": []}',
      'two plans': `${readPlan()}\n\nPoprawiona wersja:\n${readPlan((x) => { x.name = 'Druga'; })}`,
    };
    for (const [state, text] of Object.entries(failures)) {
      await p.evaluate(`window.planwalk.load(${JSON.stringify(text)}); ${settle}`);
      assert.equal(await p.evaluate(`!${q('.pw-banner')}.hidden`), true, `${state}: the banner is up`);
      await c.take(p, `banner: ${state}`);
    }
    await p.evaluate(`window.location.hash = '#plan=!!!'; ${settle}`);
    await c.take(p, 'banner: bad link');
    // Walk: the hint for mouse and keyboard
    await p.evaluate(`window.planwalk.setMode('walk'); window.planwalk.advanceTime(200); ${settle}`);
    assert.equal(await p.evaluate(`!${q('.pw-hint')}.hidden`), true);
    await c.take(p, 'Walk hint');
    const levelOptions = await p.evaluate(`[...document.querySelectorAll('.pw-bar select')].map((s) => [s.title, s.options[0].textContent])`);
    assert.deepEqual(levelOptions, [['Piętro', 'Wszystkie piętra'], ['Przykłady', 'Przykłady']], 'the selects are Polish');

    // coverage: the states above really produced the texts the audit is about
    for (const want of ['Makieta', 'Obrót', 'Z góry', 'Spacer', 'Jak działa planwalk', 'O tym modelu', 'Kopiuj prośbę o poprawkę', 'Kopiuj link', 'Udostępnij obraz', 'Otwórz plik', 'Wczytaj', 'Anuluj']) {
      assert.ok(c.seen.has(want), `the audit saw "${want}"`);
    }
    for (const kind of ['no plan', 'cut off', 'invalid', 'decimal comma', 'empty', 'too long', 'unusable', 'two plans', 'bad link']) {
      assert.ok([...c.seen.values()].some((states) => states.includes(`banner: ${kind}`)), `a banner was read for "${kind}"`);
    }
    assert.ok(c.seen.size > 60, `${c.seen.size} captions were read`);
    c.print('desktop');
    assert.deepEqual(c.problems(), []);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('phone (390 x 664, touch), ?lang=pl: no English left on the collapsed card, in the Menu, on the issues sheet and in the Walk hint for fingers', { skip, timeout: 240000 }, async () => {
  const p = await openPage(page, { width: 390, height: 664, mobile: true, dpr: 2, search: '?lang=pl', beforeLoad: `${ENGLISH_BROWSER}${STUB}` });
  const c = collector();
  try {
    assert.equal(await p.evaluate(`document.getElementById('pw-app').classList.contains('pw-compact')`), true, 'the phone layout is on');
    await c.take(p, 'phone start');
    await p.evaluate(`${q('.pw-menu-btn')}.click(); ${settle}`);
    assert.equal(await p.evaluate(`!${q('.pw-menu')}.hidden`), true, 'the Menu opens');
    await c.take(p, 'Menu');
    await p.evaluate(`${q('.pw-sheet-x')}.click(); ${settle}`);
    await p.evaluate(`${q('.pw-visit-open')}.click(); ${settle}`);
    await c.take(p, 'phone card, expanded');
    await p.evaluate(`window.planwalk.load(${JSON.stringify(readPlan((x) => { x.levels[0].height = 7.5; }))}); ${settle}`);
    await p.evaluate(`${q('.pw-issues-btn')}.click(); ${settle}`);
    await c.take(p, 'issues sheet');
    await p.evaluate(`window.planwalk.setMode('walk'); window.planwalk.advanceTime(200); ${settle}`);
    await c.take(p, 'Walk, touch hint');
    assert.ok(c.seen.has('Idź') && c.seen.has('Rozglądaj się'), 'the Walk zones are labelled in Polish');
    assert.ok([...c.seen.keys()].some((s) => /^Lewa połowa: idź/.test(s)), 'the touch hint is Polish');
    assert.ok(c.seen.has('Menu') && c.seen.has('Zamknij'), 'Menu and its close control are read');
    c.print('phone');
    assert.deepEqual(c.problems(), []);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('the audit has teeth: the same page in English is full of findings, so a Polish page with leftovers would fail', { skip, timeout: 120000 }, async () => {
  const p = await openPage(page, { width: 1280, height: 800, search: '?lang=en', beforeLoad: STUB });
  const c = collector();
  try {
    await c.take(p, 'start');
    await openDialogOf(p, 'Help', '.pw-help');
    await c.take(p, 'Help');
    assert.ok(c.problems().length > 20, `${c.problems().length} findings in English`);
  } finally { await p.close(); }
});
