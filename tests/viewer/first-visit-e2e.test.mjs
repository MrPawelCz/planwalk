// End to end in headless Chrome: the first-visit card on the bundled example (steps, buttons, privacy line, caption), the
// Copy prompt button (clipboard text equals the prompt file), the card going away on load and on Walk, the phone layout, and the Help dialog.
// Builds the page into a temporary folder first. Skips with a clear message when Chrome is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, promptOfFile, skipReason } from './first-visit-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skip = skipReason();
const out = mkdtempSync(join(tmpdir(), 'planwalk-visit-e2e-'));
const page = join(out, 'planwalk.html');
const prompt = (name) => (existsSync(join(root, 'docs', name)) ? promptOfFile(readFileSync(join(root, 'docs', name), 'utf8')) : null);
const STUB = "Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });";
const settle = 'new Promise((r) => setTimeout(r, 150))';
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const withPage = (opts, fn, file = page) => async () => { const p = await openPage(file, { beforeLoad: STUB, ...opts }); try { await fn(p); assert.deepEqual(p.issues, [], 'console stays clean'); } finally { await p.close(); } };
// The same page with a Polish prompt block that is certainly there, so the language switch is tested whether or not docs/PROMPT.pl.md exists.
const both = join(out, 'both.html');
const TEST_PL = 'Testowy prompt po polsku';

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const html = readFileSync(page, 'utf8').replace(/<script type="text\/plain" id="planwalk-prompt-pl">[\s\S]*?<\/script>\n/, '');
  writeFileSync(both, html.replace('<script>', `<script type="text/plain" id="planwalk-prompt-pl">${TEST_PL}</script>\n<script>`));
});
after(() => rmSync(out, { recursive: true, force: true }));

test('the card shows on the example: three steps, the buttons, the privacy line, a caption in the toolbar, the page language', { skip, timeout: 90000 }, withPage({}, async (p) => {
  const info = await p.evaluate(`(() => { const c = ${q('.pw-visit')}, tag = ${q('.pw-tag')}; return {
    hidden: c.hidden, title: c.querySelector('h2').textContent, steps: [...c.querySelectorAll('ol li')].map((l) => l.textContent),
    buttons: [...c.querySelectorAll('.pw-visit-btns button')].map((b) => b.textContent), note: c.querySelector('.pw-visit-note:last-child').textContent,
    tagHidden: tag.hidden, tagText: tag.textContent, lang: document.documentElement.lang, name: ${q('.pw-name')}.textContent }; })()`);
  assert.equal(info.hidden, false);
  assert.equal(info.title, 'This is an example');
  assert.deepEqual(info.steps, ['Copy the prompt', 'Give it to an AI chat together with a picture of your floor plan', 'Paste the answer here']);
  assert.ok(info.buttons.includes('Copy prompt') && info.buttons.includes('Paste answer'), info.buttons.join(','));
  assert.equal(info.note, 'Your plan stays in this page. Nothing is uploaded or stored.');
  assert.equal(info.tagHidden, false);
  assert.equal(info.tagText, 'Example');
  assert.ok(info.name.length > 0, 'the plan name is still shown');
  assert.equal(info.lang, 'en');
}));

test('Copy prompt puts the text of docs/PROMPT.md on the clipboard and says Copied', { skip, timeout: 90000 }, withPage({}, async (p) => {
  const expected = prompt('PROMPT.md');
  assert.ok(expected && expected.length > 1500, 'the prompt file has a long fenced block');
  const embedded = await p.evaluate(`document.getElementById('planwalk-prompt-en').textContent.replace(/<\\\\\\/(script)/gi, '</$1').replace(/<\\\\!--/g, '<!--')`);
  assert.equal(embedded, expected, 'the embedded block equals the file');
  await p.evaluate(`${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), expected);
  assert.equal(await p.evaluate(`${q('.pw-visit .pw-primary')}.textContent`), 'Copied');
}));

test('Paste answer opens the paste dialog', { skip, timeout: 90000 }, withPage({}, async (p) => {
  const labelled = (label) => `[...document.querySelectorAll('.pw-visit-btns button')].find((b) => b.textContent === ${JSON.stringify(label)})`;
  await p.evaluate(`${labelled('Paste answer')}.click(); ${settle}`);
  assert.equal(await p.evaluate(`document.querySelector('dialog.pw-dlg[open] textarea') !== null`), true);
}));

test('Open file appears only when the build has an open-file control: a .pw-open-file button or the openFile hook', { skip, timeout: 120000 }, async () => {
  const labels = (p) => p.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].map((b) => b.textContent)`);
  const none = await openPage(page, { beforeLoad: STUB });
  try { assert.ok(!(await labels(none)).includes('Open file'), 'no control, no button'); } finally { await none.close(); }
  const viaButton = await openPage(page, { beforeLoad: `${STUB}
    document.addEventListener('DOMContentLoaded', () => { const b = document.createElement('button'); b.className = 'pw-open-file'; b.onclick = () => { window.__opened = 'button'; }; document.body.append(b); });` });
  try {
    assert.ok((await labels(viaButton)).includes('Open file'));
    await viaButton.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].find((b) => b.textContent === 'Open file').click()`);
    assert.equal(await viaButton.evaluate('window.__opened'), 'button');
  } finally { await viaButton.close(); }
  const viaHook = await openPage(page, { beforeLoad: `${STUB}
    let api; Object.defineProperty(window, 'planwalk', { configurable: true, get: () => api, set: (v) => { v.openFile = () => { window.__opened = 'hook'; }; api = v; } });` });
  try {
    assert.ok((await labels(viaHook)).includes('Open file'));
    await viaHook.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].find((b) => b.textContent === 'Open file').click()`);
    assert.equal(await viaHook.evaluate('window.__opened'), 'hook');
  } finally { await viaHook.close(); }
});

test('the standalone export keeps the prompt but not the demo link preview tags, and opens without the card', { skip, timeout: 90000 }, withPage({ }, async (p) => {
  // keep the file in the page instead of downloading it
  await p.evaluate(`URL.createObjectURL = (b) => { window.__blob = b; return 'blob:none'; }; HTMLAnchorElement.prototype.click = function () { window.__download = this.download; };
    [...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === 'Standalone HTML').click(); ${settle}`);
  assert.match(await p.evaluate('window.__download'), /\.html$/);
  const html = await p.evaluate('window.__blob.text()');
  assert.ok(!/og:|twitter:|mrpawelcz\.github\.io/.test(html.slice(0, html.indexOf('</head>'))), 'no demo address or preview tags in the head');
  assert.match(html, /<link rel="icon" type="image\/svg\+xml"/);
  assert.match(html, /id="planwalk-prompt-en"/);
  assert.match(html, /id="planwalk-plan"/);
  assert.ok(!html.includes('class="pw-visit"') && !html.includes('id="pw-app"'), 'no live UI in the file');
}));

test('the card hides with the cross, and the caption stays while the example is on screen', { skip, timeout: 90000 }, withPage({}, async (p) => {
  await p.evaluate(`${q('.pw-visit-x')}.click(); ${settle}`);
  assert.equal(await p.evaluate(`${q('.pw-visit')}.hidden`), true);
  assert.equal(await p.evaluate(`${q('.pw-tag')}.hidden`), false);
}));

test('loading another plan hides the card and the caption; so does entering Walk', { skip, timeout: 90000 }, async () => {
  const plan = readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8');
  const a = await openPage(page, { beforeLoad: STUB });
  try {
    assert.equal(await a.evaluate(`${q('.pw-visit')}.hidden`), false);
    assert.equal((await a.evaluate(`window.planwalk.load(${JSON.stringify(plan)})`)).ok, true);
    assert.equal(await a.evaluate(`${q('.pw-visit')}.hidden`), true);
    assert.equal(await a.evaluate(`${q('.pw-tag')}.hidden`), true);
    assert.deepEqual(a.issues, []);
  } finally { await a.close(); }
  const b = await openPage(page, { beforeLoad: STUB });
  try {
    assert.equal(await b.evaluate(`${q('.pw-visit')}.hidden`), false);
    await b.evaluate('window.planwalk.setMode("walk")');
    assert.equal(await b.evaluate(`${q('.pw-visit')}.hidden`), true);
    assert.deepEqual(b.issues, []);
  } finally { await b.close(); }
});

test('a Polish browser gets the Polish card, the Polish page language and the Polish prompt when the file exists', { skip, timeout: 90000 }, withPage({ search: '?lang=pl' }, async (p) => {
  const info = await p.evaluate(`(() => ({ title: ${q('.pw-visit h2')}.textContent, copy: ${q('.pw-visit .pw-primary')}.textContent, tag: ${q('.pw-tag')}.textContent, lang: document.documentElement.lang, note: ${q('.pw-visit-note:last-child')}.textContent }))()`);
  assert.deepEqual(info, { title: 'To jest przykład', copy: 'Kopiuj prompt', tag: 'To jest przykład', lang: 'pl', note: 'Twój plan zostaje na tej stronie. Nic nie jest wysyłane ani zapisywane.' });
  await p.evaluate(`${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), prompt('PROMPT.pl.md') ?? prompt('PROMPT.md'));
  assert.equal(await p.evaluate(`${q('.pw-visit-note button')} !== null`), prompt('PROMPT.pl.md') !== null, 'the prompt language switch appears only when both prompts are embedded');
}));

test('with both prompts embedded the card offers a switch: the page language is the default, the other prompt is one tap away', { skip, timeout: 90000 }, withPage({ search: '?lang=pl' }, async (p) => {
  const pressed = () => p.evaluate(`[...document.querySelectorAll('.pw-visit-note button')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed'))`);
  assert.equal(await p.evaluate(`${q('.pw-visit-note')}.textContent.startsWith('Język promptu:')`), true);
  assert.deepEqual(await pressed(), ['EN:false', 'PL:true']);
  await p.evaluate(`${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), TEST_PL);
  await p.evaluate(`[...document.querySelectorAll('.pw-visit-note button')].find((b) => b.textContent === 'EN').click(); ${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), prompt('PROMPT.md'));
  assert.deepEqual(await pressed(), ['EN:true', 'PL:false']);
}, both));

test('on a phone the card is a bottom sheet that leaves the middle of the screen free; the touch targets are 44 px', { skip, timeout: 90000 }, withPage({ width: 390, height: 664, mobile: true, dpr: 2 }, async (p) => {
  const r = await p.evaluate(`(() => { const c = ${q('.pw-visit')}.getBoundingClientRect(); return { l: c.left, r: c.right, t: c.top, b: c.bottom, vw: innerWidth, vh: innerHeight, small: [...document.querySelectorAll('.pw-visit-btns button, .pw-visit-x')].filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).length }; })()`);
  assert.equal(r.l, 0);
  assert.equal(r.r, r.vw);
  assert.equal(r.b, r.vh);
  assert.ok(r.t > r.vh * 0.6, `the sheet starts at ${r.t} of ${r.vh}`);
  assert.equal(r.small, 0, 'every button is at least 44 px');
}));

test('Help has real links that open in a new tab, a Copy prompt button, the privacy facts and the cropping tip', { skip, timeout: 90000 }, withPage({}, async (p) => {
  await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === 'Help').click(); ${settle}`);
  const info = await p.evaluate(`(() => { const d = ${q('.pw-help')}; return { open: d.open, links: [...d.querySelectorAll('a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel })), text: d.textContent }; })()`);
  assert.equal(info.open, true);
  assert.deepEqual(info.links.map((l) => l.href), ['https://github.com/MrPawelCz/planwalk', 'https://github.com/MrPawelCz/planwalk/blob/main/docs/PROMPT.md', 'https://github.com/MrPawelCz/planwalk/blob/main/docs/FAQ.md']);
  for (const l of info.links) { assert.equal(l.target, '_blank'); assert.match(l.rel, /noopener/); }
  assert.match(info.text, /Everything runs in this page\. Your plan never leaves your device and nothing is stored\./);
  assert.match(info.text, /crop out names and addresses before sending the picture to an AI/i);
  assert.match(info.text, /touch screen the left half moves and the right half looks/);
  await p.evaluate(`${q('.pw-help .pw-help-copy')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), prompt('PROMPT.md'));
}));
