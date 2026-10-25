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
import { SITE } from '../../viewer/src/site.js';
import { openPage, promptOfFile, skipReason } from './first-visit-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skip = skipReason();
const out = mkdtempSync(join(tmpdir(), 'planwalk-visit-e2e-'));
const page = join(out, 'planwalk.html');
const prompt = (name) => (existsSync(join(root, 'docs', name)) ? promptOfFile(readFileSync(join(root, 'docs', name), 'utf8')) : null);
// The clipboard keeps the last text; every way a page could send or store something is counted in __net, and a click on a sample link is stopped
// before the browser navigates (the test must not fetch the picture from the public site) after it has been counted in __clicks.
const STUB = `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
window.__net = []; window.__clicks = [];
const wrap = (obj, name, tag) => { const o = obj && obj[name]; if (typeof o === 'function') obj[name] = function () { window.__net.push(tag); return o.apply(this, arguments); }; };
wrap(window, 'fetch', 'fetch'); wrap(XMLHttpRequest.prototype, 'open', 'xhr'); wrap(navigator, 'sendBeacon', 'beacon'); wrap(Storage.prototype, 'setItem', 'storage'); wrap(window, 'WebSocket', 'websocket');
document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('.pw-visit-samples a'); if (a) { window.__clicks.push(a.getAttribute('href')); e.preventDefault(); } }, true);`;
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
  assert.equal(info.note, 'planwalk uploads and stores nothing. The picture of your plan goes only to the AI chat you choose: crop out names and addresses first.');
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

test('Open file: the card offers the chooser of the paste dialog (window.planwalk.openFile), and a build that replaces the hook is followed', { skip, timeout: 120000 }, async () => {
  const labels = (p) => p.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].map((b) => b.textContent)`);
  const chooser = `HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__chooser = (window.__chooser || 0) + 1; };`;
  const own = await openPage(page, { beforeLoad: `${STUB}${chooser}` });
  try {
    assert.ok((await labels(own)).includes('Open file'), 'the viewer provides the hook');
    await own.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].find((b) => b.textContent === 'Open file').click()`);
    assert.equal(await own.evaluate('window.__chooser'), 1);
  } finally { await own.close(); }
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
  // the Polish page carries a default language; the file must not take it along, so the browser of whoever opens it decides
  await p.evaluate(`document.head.append(Object.assign(document.createElement('meta'), { name: 'planwalk-default-lang', content: 'pl' }));
    URL.createObjectURL = (b) => { window.__blob = b; return 'blob:none'; }; HTMLAnchorElement.prototype.click = function () { window.__download = this.download; };
    [...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === 'Standalone HTML').click(); ${settle}`);
  assert.match(await p.evaluate('window.__download'), /\.html$/);
  const html = await p.evaluate('window.__blob.text()');
  assert.ok(!/og:|twitter:|mrpawelcz\.github\.io/.test(html.slice(0, html.indexOf('</head>'))), 'no demo address or preview tags in the head');
  assert.ok(!/<meta[^>]*planwalk-default-lang/.test(html), 'the default language of the Polish page is not carried into the file'); // the name also appears in the page script, which reads the tag
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
  assert.deepEqual(info, { title: 'To jest przykład', copy: 'Kopiuj polecenie', tag: 'To jest przykład', lang: 'pl', note: 'planwalk niczego nie wysyła ani nie zapisuje. Zdjęcie rzutu trafia tylko do czatu z AI, który wybierzesz: zasłoń na nim imiona i adresy.' });
  await p.evaluate(`${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), prompt('PROMPT.pl.md') ?? prompt('PROMPT.md'));
  assert.equal(await p.evaluate(`${q('.pw-visit-note button')} !== null`), prompt('PROMPT.pl.md') !== null, 'the prompt language switch appears only when both prompts are embedded');
}));

test('with both prompts embedded the card offers a switch: the page language is the default, the other prompt is one tap away', { skip, timeout: 90000 }, withPage({ search: '?lang=pl' }, async (p) => {
  const pressed = () => p.evaluate(`[...document.querySelectorAll('.pw-visit-note button')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed'))`);
  assert.equal(await p.evaluate(`${q('.pw-visit-note')}.textContent.startsWith('Język polecenia:')`), true);
  assert.deepEqual(await pressed(), ['EN:false', 'PL:true']);
  await p.evaluate(`${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), TEST_PL);
  await p.evaluate(`[...document.querySelectorAll('.pw-visit-note button')].find((b) => b.textContent === 'EN').click(); ${q('.pw-visit .pw-primary')}.click(); ${settle}`);
  assert.equal(await p.evaluate('window.__copied'), prompt('PROMPT.md'));
  assert.deepEqual(await pressed(), ['EN:true', 'PL:false']);
}, both));

// The open sheet keeps its top at least 12 px below the 35 percent line of the screen (232 px of 664), in both languages: the Polish
// texts are the longest, and a phone with another font should not push the sheet over the model.
for (const [lang, search] of [['en', ''], ['pl', '?lang=pl']]) {
  test(`on a phone the card (${lang}) is one line above the bottom bar and opens to a sheet that leaves the middle of the screen free, 12 px to spare; the touch targets are 44 px`, { skip, timeout: 90000 }, withPage({ width: 390, height: 664, mobile: true, dpr: 2, search }, async (p) => {
    const box = () => p.evaluate(`(() => { const c = ${q('.pw-visit')}.getBoundingClientRect(), m = ${q('.pw-modebar')}.getBoundingClientRect(); return { l: c.left, r: c.right, t: c.top, b: c.bottom, modeTop: m.top, vw: innerWidth, vh: innerHeight, small: [...document.querySelectorAll('.pw-visit-btns button, .pw-visit-x, .pw-visit-open, .pw-visit-note button')].filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).length }; })()`);
    let r = await box();
    assert.equal(r.l, 0);
    assert.equal(r.r, r.vw);
    assert.equal(r.b, r.modeTop, 'the card stands on the bottom bar, not under it');
    assert.ok(r.t > r.vh * 0.6, `the line starts at ${r.t} of ${r.vh}`);
    assert.equal(r.b - r.t, 49, 'the collapsed card is one 48 px line and its border, as before the sample line');
    assert.equal(r.small, 0, 'every button is at least 44 px');
    await p.evaluate(`${q('.pw-visit-open')}.click(); ${settle}`);
    r = await box();
    assert.equal(r.l, 0);
    assert.equal(r.r, r.vw);
    assert.equal(r.b, r.modeTop);
    assert.ok(r.t >= r.vh * 0.35 + 12, `the open card starts at ${r.t} of ${r.vh}, ${(r.t - r.vh * 0.35).toFixed(1)} px below the 35 percent line (12 px are needed)`);
    assert.equal(r.small, 0, 'every button is at least 44 px');
    const rows = await p.evaluate(`(() => { const s = ${q('.pw-visit-samples')}, lh = parseFloat(getComputedStyle(s).lineHeight); return Math.round(s.querySelector('span').getBoundingClientRect().height / lh); })()`);
    assert.equal(rows, 1, 'the sample line is one row on a 390 px phone');
    if (process.env.PW_EVIDENCE && lang === 'pl') await p.shot(join(process.env.PW_EVIDENCE, 'phone-card-pl.jpg'), 55);
    // The three links are real links, in this language, and their tap areas are 44 x 44 px around the link: the four corners and the middle of that
    // square belong to the link (not to a neighbour link, not to the list text above, not to a button below), and no list text is taken over.
    const links = await p.evaluate(`[...document.querySelectorAll('.pw-visit-samples a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, download: a.getAttribute('download'), label: a.getAttribute('aria-label'), title: a.title, text: a.textContent }))`);
    assert.equal(links.length, 3, 'exactly three links');
    links.forEach((l, i) => {
      const n = i + 1;
      assert.equal(l.href, `${SITE}samples/sample-${n}.png`, `link ${n}: the picture on the public site`);
      assert.equal(l.target, '_blank');
      assert.deepEqual(l.rel.split(/\s+/).sort(), ['noopener', 'noreferrer'], `link ${n}: rel`);
      assert.equal(l.download, `planwalk-sample-${n}.png`);
      assert.equal(l.label, lang === 'pl' ? `Przykładowy rysunek ${n}` : `Sample drawing ${n}`, `link ${n}: the name in this language`);
      assert.equal(l.title, l.label);
      assert.equal(l.text, String(n));
    });
    const taps = await p.evaluate(`[...document.querySelectorAll('.pw-visit-samples a')].map((a) => { const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; return [[-21.5, -21.5], [21.5, -21.5], [-21.5, 21.5], [21.5, 21.5], [0, 0]].map(([dx, dy]) => { const el = document.elementFromPoint(cx + dx, cy + dy); return el === a || a.contains(el) ? 'link' : (el ? el.tagName + '.' + el.className : 'nothing'); }); })`);
    for (const row of taps) assert.deepEqual(row, ['link', 'link', 'link', 'link', 'link'], `a 44 x 44 px tap area for every link: ${JSON.stringify(taps)}`);
    const stolen = await p.evaluate(`(() => { let n = 0; for (const li of document.querySelectorAll('.pw-visit ol li')) { const range = document.createRange(); range.selectNodeContents(li); for (const r of range.getClientRects()) for (let i = 1; i <= 9; i++) { const el = document.elementFromPoint(r.left + (r.width * i) / 10, r.top + r.height / 2); if (el && el.closest('.pw-visit-samples')) n++; } } return n; })()`);
    assert.equal(stolen, 0, 'no tap on the text of the steps opens a picture');
    // A tap on each link is a navigation the browser makes: the page itself sends and stores nothing.
    await p.evaluate(`document.querySelectorAll('.pw-visit-samples a').forEach((a) => a.click())`);
    assert.deepEqual(await p.evaluate('window.__clicks'), [1, 2, 3].map((n) => `${SITE}samples/sample-${n}.png`));
    assert.deepEqual(await p.evaluate('window.__net'), [], 'the page sent nothing and stored nothing');
  }));
}

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
