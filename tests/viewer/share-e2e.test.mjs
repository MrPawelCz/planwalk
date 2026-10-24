// End to end: a shared link of either form opens the same model, a damaged or hostile #z= link gives the plain banner without wiping
// the page, a browser without DecompressionStream is told so, Copy link puts a working link on the clipboard (and shows it when copying
// is refused; a page opened from a file links to the public page, a page served over http to its own address), Share image hands a
// PNG to the share sheet or downloads it, and the honest sentence is in the tooltip and in Help.
// Chrome runs through tools/chrome-lock.sh when other browsers may be running. Skips with a message when Chrome or dist is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createServer } from 'node:http';
import { openPage, skip, root } from './chrome-page.mjs';
import { decodeShort, encodeLong, encodeShort, parseHash, planText } from '../../viewer/src/share-link.js';
import { SITE, SITE_PL } from '../../viewer/src/site.js';

const EMPTY = pathToFileURL(join(root, 'dist/planwalk-empty.html')).href;
const FULL = pathToFileURL(join(root, 'dist/planwalk.html')).href;
const evidence = process.env.PW_EVIDENCE;
const raw = (name) => readFileSync(join(root, `examples/${name}.plan.json`), 'utf8');
const NOTE_EN = 'The plan is stored inside the link. Whoever gets the link, and the app you send it through, can read the plan.';

const counts = (page) => page.evaluate('window.planwalk.state().counts');
const banner = (page) => page.evaluate('(() => { const b = document.querySelector(".pw-banner"); return b && !b.hidden ? b.textContent : null; })()');
const hasModel = 'window.planwalk && window.planwalk.state().counts.walls > 0';
const helpButton = '[...document.querySelectorAll("button")].find((b) => ["Help", "Pomoc"].includes(b.textContent))';
const htmlButton = '[...document.querySelectorAll("button")].find((b) => /HTML/.test(b.textContent))';
const hasBanner = '!!document.querySelector(".pw-banner:not([hidden])")';
const button = (label) => `[...document.querySelectorAll("button")].find((b) => b.textContent === ${JSON.stringify(label)})`;
const snapshot = (page) => page.evaluate('JSON.stringify({ counts: window.planwalk.state().counts, name: document.querySelector(".pw-name").textContent, levels: [...document.querySelectorAll(".pw-bar select option")].map((o) => o.textContent) })');
// Marks when the viewer came up and when the banner first showed, in the page's own clock.
const TIMER = `window.__t = { ready: null, banner: null };
const iv = setInterval(() => {
  const now = performance.now(), b = document.querySelector('.pw-banner');
  if (window.__t.ready === null && window.planwalk && window.planwalk.load) window.__t.ready = now;
  if (window.__t.banner === null && b && !b.hidden) { window.__t.banner = now; clearInterval(iv); }
}, 5);`;

async function openLink(page, base, hash, lang = 'en') {
  await page.navigate(`${base}?lang=${lang}${hash}`);
}

test('a #z= link, a #plan= link and a plain load give the same model, for both examples and for an old link made from the file', { skip, timeout: 240000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    for (const name of ['flat-1', 'duplex-1']) {
      const plan = JSON.parse(raw(name));
      await page.navigate(`${EMPTY}?lang=en`);
      await page.evaluate(`window.planwalk.load(${JSON.stringify(raw(name))})`);
      const direct = await snapshot(page);
      assert.ok(JSON.parse(direct).counts.walls > 0, name);
      const forms = {
        '#plan= (minified)': encodeLong(plan),
        '#plan= (the file as it is)': `#plan=${Buffer.from(raw(name)).toString('base64url')}`,
        '#z=': await encodeShort(plan),
      };
      for (const [form, hash] of Object.entries(forms)) {
        await openLink(page, EMPTY, hash);
        assert.ok(await page.waitFor(hasModel), `${name} ${form}: no model`);
        assert.equal(await snapshot(page), direct, `${name} ${form}: another model`);
        assert.equal(await banner(page), null, `${name} ${form}: no complaint for a good link`);
      }
    }
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('a damaged or hostile #z= link gives the plain banner, quickly, with the example or the old model still on screen', { skip, timeout: 240000 }, async () => {
  const page = await openPage({ query: '?lang=en', beforeLoad: TIMER });
  try {
    const good = await encodeShort(JSON.parse(raw('duplex-1')));
    const zData = good.slice(3).split('.')[0];
    const bomb = deflateRawSync(Buffer.alloc(5_000_000, 0x61)).toString('base64url');
    const flipped = `${zData.slice(0, 40)}${zData[40] === 'A' ? 'B' : 'A'}${zData.slice(41)}.${good.split('.')[1]}`;
    const hostile = {
      'a deflate bomb': `#z=${bomb}`,
      'a flipped character': `#z=${flipped}`,
      'a cut off link': `#z=${good.slice(3, 300)}`,
      'not base64url': '#z=!!!!not-base64!!!!',
      'an empty #z=': '#z=',
      'text that is not JSON': `#z=${deflateRawSync(Buffer.from('hello world')).toString('base64url')}`,
      'JSON that is not a plan': `#z=${deflateRawSync(Buffer.from('{"foo":1}')).toString('base64url')}`,
    };
    for (const [what, hash] of Object.entries(hostile)) {
      await openLink(page, FULL, hash);
      assert.ok(await page.waitFor(hasBanner, 8000), `${what}: no banner`);
      assert.match(await banner(page), /The plan inside this link is damaged/, what);
      const t = await page.evaluate('window.__t');
      assert.ok(t.banner - t.ready < 2000, `${what}: the banner took ${Math.round(t.banner - t.ready)} ms`);
      assert.ok((await counts(page)).walls > 0, `${what}: the example is not on screen`);
      assert.equal(await page.evaluate('document.querySelector(".pw-tag").hidden'), false, `${what}: it is the bundled example`);
    }
    // The same link typed into the address bar of a tab that already shows a model: the model stays, untouched.
    await openLink(page, FULL, await encodeShort(JSON.parse(raw('duplex-1'))));
    assert.ok(await page.waitFor(hasModel));
    const before = await page.evaluate('JSON.stringify(window.planwalk.state())');
    await page.evaluate('document.querySelector(".pw-banner").hidden = true');
    await page.evaluate(`location.hash = ${JSON.stringify(hostile['a deflate bomb'])}`);
    assert.ok(await page.waitFor(hasBanner, 8000));
    assert.match(await banner(page), /damaged/);
    assert.equal(await page.evaluate('JSON.stringify(window.planwalk.state())'), before, 'the model and the camera are untouched');
    // A good link typed in afterwards replaces the model and clears the banner.
    await page.evaluate(`location.hash = ${JSON.stringify(await encodeShort(JSON.parse(raw('flat-1'))))}`);
    assert.ok(await page.waitFor(`${hasBanner} === false && window.planwalk.state().counts.levels === 1`, 8000));
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('the banner of a bad link follows a language switch, and of two links opened one after the other the newer one stays even when the older finishes later', { skip, timeout: 240000 }, async () => {
  // While window.__gate is a pending promise the inflater gets no input, so a #z= link can be made to finish after the next one.
  const hold = `(() => {
    const Real = window.DecompressionStream;
    window.DecompressionStream = function (format) {
      const real = new Real(format), gate = window.__gate;
      if (!gate) return real;
      const out = real.writable.getWriter();
      return { readable: real.readable, writable: new WritableStream({ write: async (c) => { await gate; await out.write(c); }, close: async () => { await gate; await out.close(); } }) };
    };
  })();`;
  const page = await openPage({ query: '?lang=en', beforeLoad: hold });
  try {
    await openLink(page, EMPTY, '#z=!!!!not-base64!!!!');
    assert.ok(await page.waitFor(hasBanner, 8000));
    assert.match(await banner(page), /The plan inside this link is damaged/);
    assert.equal(await page.evaluate('window.planwalk.setLang("pl")'), 'pl');
    assert.match(await banner(page), /Plan zapisany w tym linku jest uszkodzony/, 'the banner on screen is redrawn in Polish');
    assert.doesNotMatch(await banner(page), /damaged/);

    // A compressed link that is held back, then a plain one: the plain one is on screen at once and stays.
    const older = JSON.parse(raw('flat-1')), newer = JSON.parse(raw('duplex-1'));
    await page.navigate(`${EMPTY}?lang=en`);
    await page.evaluate(`window.__gate = new Promise((r) => { window.__open = r; }); location.hash = ${JSON.stringify(await encodeShort(older))}`);
    await new Promise((r) => setTimeout(r, 200)); // the first link is being inflated now
    assert.equal((await counts(page)).walls, 0, 'the first link is held back');
    await page.evaluate(`location.hash = ${JSON.stringify(encodeLong(newer))}`);
    assert.ok(await page.waitFor(hasModel));
    const shown = await snapshot(page);
    await page.evaluate('window.__open()');
    await new Promise((r) => setTimeout(r, 800)); // long enough for the held link to finish
    assert.equal(await snapshot(page), shown, 'the older link did not replace the newer one');
    assert.equal(await banner(page), null);
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('a browser without DecompressionStream is told to ask for the long link, and the long form still opens; Copy link falls back to it', { skip, timeout: 240000 }, async () => {
  const stubs = 'delete window.DecompressionStream; delete window.CompressionStream; window.__copied = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });';
  const page = await openPage({ query: '?lang=en', beforeLoad: stubs });
  try {
    const plan = JSON.parse(raw('duplex-1'));
    await openLink(page, EMPTY, await encodeShort(plan));
    assert.ok(await page.waitFor(hasBanner, 8000));
    assert.equal((await banner(page)).replace(/\u00d7$/, ''), 'This link needs a newer browser (Safari 16.4 or newer). Ask the sender for the long link.'); // the banner text ends with its close button
    assert.equal((await counts(page)).walls, 0, 'nothing was invented');
    await openLink(page, EMPTY, '#z=');
    assert.ok(await page.waitFor(hasBanner, 8000));
    await openLink(page, EMPTY, encodeLong(plan));
    assert.ok(await page.waitFor(hasModel), 'the long form opens');
    assert.equal(await banner(page), null);
    await page.evaluate(`${button('Copy link')}.click()`);
    assert.ok(await page.waitFor('window.__copied !== null'));
    const link = await page.evaluate('window.__copied');
    assert.ok(link.startsWith(`${SITE}#plan=`), link.slice(0, 80)); // this page is a file, so the link starts with the public page
    assert.equal(link, `${SITE}${encodeLong(plan)}`);
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
});

test('Copy link and Copy long link put working links on the clipboard, with a short confirmation; refused copying shows the link', { skip, timeout: 240000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    await page.navigate(`${FULL}?lang=en&materials=clay`);
    assert.ok(await page.waitFor(hasModel));
    const bundled = await snapshot(page);
    let name = 'flat-1';
    await page.evaluate(`window.planwalk.load(${JSON.stringify(raw(name))})`);
    if ((await snapshot(page)) === bundled) { name = 'duplex-1'; await page.evaluate(`window.planwalk.load(${JSON.stringify(raw(name))})`); } // the other one
    const plan = JSON.parse(raw(name));
    const mine = await snapshot(page);
    assert.notEqual(mine, bundled, 'the plan on screen is not the bundled example');
    const reload = () => page.evaluate(`window.planwalk.load(${JSON.stringify(raw(name))})`);
    const stubWrite = (body) => page.evaluate(`(() => { window.__copied = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: ${body} }); })()`);
    const click = (label) => page.evaluate(`${button(label)}.click()`);

    // Short link.
    await stubWrite('{ writeText: (t) => { window.__copied = t; return Promise.resolve(); } }');
    assert.equal(await page.evaluate(`${button('Copy link')}.title`), NOTE_EN, 'the honest sentence is the tooltip');
    await click('Copy link');
    assert.ok(await page.waitFor('window.__copied !== null'));
    const link = await page.evaluate('window.__copied');
    const at = link.indexOf('#');
    assert.equal(link.slice(0, at), SITE, 'the public page (this one is opened from a file), no query');
    assert.ok(!link.includes('?') && !link.includes('lang') && !link.includes('materials'));
    const parsed = parseHash(link.slice(at));
    assert.equal(parsed.form, 'z');
    assert.equal((await decodeShort(parsed.value)).text, planText(plan), 'the link holds the plan, without whitespace');
    assert.ok(link.length - at < encodeLong(plan).length * 0.6, 'and it is the short form');
    assert.equal(await page.evaluate(`!!${button('Copied')}`), true, 'the button confirms');
    assert.ok(await page.waitFor(`!!${button('Copy link')}`, 4000), 'and goes back by itself');
    // Round trip: the fragment of the copied link, opened fresh on this page (a test does not fetch the public address), shows the same plan.
    await page.navigate(`${FULL}${link.slice(at)}`);
    assert.ok(await page.waitFor(hasModel));
    assert.equal(await snapshot(page), mine, 'the short link opens the same model');

    // Long link.
    await reload();
    await stubWrite('{ writeText: (t) => { window.__copied = t; return Promise.resolve(); } }');
    await click('Copy long link (older browsers)');
    assert.ok(await page.waitFor('window.__copied !== null'));
    const long = await page.evaluate('window.__copied');
    assert.equal(long, `${SITE}${encodeLong(plan)}`);
    await page.navigate(`${FULL}${long.slice(long.indexOf('#'))}`);
    assert.ok(await page.waitFor(hasModel));
    assert.equal(await snapshot(page), mine, 'the long link opens the same model');

    // No clipboard API: the old copy command gets the link (a readonly field is selected for it).
    await reload();
    await stubWrite('undefined');
    await page.evaluate('window.__exec = null; document.execCommand = (cmd) => { const a = document.querySelector("body > textarea"); window.__exec = { cmd, text: a && a.value, readOnly: a && a.readOnly, all: !!a && a.selectionStart === 0 && a.selectionEnd === a.value.length }; return true; }');
    await click('Copy link');
    assert.ok(await page.waitFor('window.__exec !== null'));
    assert.deepEqual(await page.evaluate('window.__exec'), { cmd: 'copy', text: link, readOnly: true, all: true });
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-share-dlg").open'), false, 'copying worked, so no dialog');
    assert.ok(await page.waitFor(`!!${button('Copy link')}`, 4000));

    // Everything refused: the link is shown in a field a person can long press.
    await stubWrite('{ writeText: () => Promise.reject(new DOMException("no", "NotAllowedError")) }');
    await page.evaluate('document.execCommand = () => false');
    await click('Copy link');
    assert.ok(await page.waitFor('document.querySelector("dialog.pw-share-dlg").open'));
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-share-dlg textarea").value'), link);
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-share-dlg textarea").readOnly'), true);
    assert.match(await page.evaluate('document.querySelector("dialog.pw-share-dlg").textContent'), /Press and hold the link below/);
    assert.ok((await page.evaluate('document.querySelector("dialog.pw-share-dlg").textContent')).includes(NOTE_EN));
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('Copy link on a page opened from a file links to the public page (the Polish one for a Polish interface) and holds no local path; over http the page keeps its own address', { skip, timeout: 240000 }, async () => {
  const html = readFileSync(join(root, 'dist/planwalk.html'));
  const server = createServer((req, res) => {
    const found = req.url.split(/[?#]/)[0] === '/x/y.html';
    res.writeHead(found ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(found ? html : '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const stub = 'window.__copied = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });';
  const page = await openPage({ query: '?lang=en', beforeLoad: stub });
  try {
    const copyFrom = async (url, caption) => {
      await page.navigate(url);
      assert.ok(await page.waitFor(hasModel), url);
      await page.evaluate(`${button(caption)}.click()`);
      assert.ok(await page.waitFor('window.__copied !== null'), `${url}: nothing was copied`);
      return page.evaluate('window.__copied');
    };
    const split = (link) => [link.slice(0, link.indexOf('#')), link.slice(link.indexOf('#'))];

    // From a file: the public page, in the language of the interface. No query, no file address, no local path.
    await page.navigate(`${FULL}?lang=en`);
    assert.ok(await page.waitFor(hasModel));
    const mine = await snapshot(page);
    const english = split(await copyFrom(`${FULL}?lang=en`, 'Copy link'));
    const polish = split(await copyFrom(`${FULL}?lang=pl`, 'Kopiuj link'));
    assert.equal(english[0], SITE);
    assert.equal(polish[0], SITE_PL, 'a Polish interface links to the Polish page, so the person who opens it lands in Polish');
    assert.equal(english[1], polish[1], 'the same plan in both');
    for (const base of [english[0], polish[0]]) {
      assert.ok(!base.includes(root) && !base.includes('file:') && !base.includes('dist/') && !base.includes('?'), base);
    }
    // The fragment is what carries the plan: opened on this page it gives the plan that was on screen.
    await openLink(page, FULL, polish[1]);
    assert.ok(await page.waitFor(hasModel));
    assert.equal(await snapshot(page), mine, 'the fragment of the copied link opens the same model');

    // Over http (a local server, a fork): the real address of the page, without its query.
    const served = `http://127.0.0.1:${server.address().port}/x/y.html`;
    for (const [query, caption] of [['?lang=en&materials=clay', 'Copy link'], ['?lang=pl', 'Kopiuj link']]) {
      const [base, fragment] = split(await copyFrom(`${served}${query}`, caption));
      assert.equal(base, served, `${query}: the page keeps its own address`);
      assert.equal(fragment, english[1], `${query}: the same plan`);
    }
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
    server.close();
  }
});

test('Share image hands a PNG to the share sheet, ignores a closed sheet, and downloads where sharing files is not possible', { skip, timeout: 240000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    await page.navigate(`${FULL}?lang=en`);
    assert.ok(await page.waitFor(hasModel));
    const click = (label) => page.evaluate(`${button(label)}.click()`);
    await page.evaluate(`window.__shared = []; window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); };
      navigator.canShare = (d) => !!(d && d.files && d.files.length); navigator.share = async (d) => { window.__shared.push({ n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, title: d.title }); };`);
    await click('Share image');
    assert.ok(await page.waitFor('window.__shared.length === 1'));
    const shared = await page.evaluate('window.__shared[0]');
    assert.equal(shared.n, 1);
    assert.equal(shared.type, 'image/png');
    assert.match(shared.name, /^[a-z0-9-]+\.png$/);
    assert.ok(shared.size > 2000, `a ${shared.size} byte picture`);
    assert.ok(shared.title.length > 0);
    assert.deepEqual(await page.evaluate('window.__dl'), [], 'nothing is downloaded when the sheet takes it');

    await page.evaluate('navigator.share = async () => { throw new DOMException("closed", "AbortError"); }');
    await click('Share image');
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(await page.evaluate('window.__dl'), [], 'a closed sheet is not an error and does not download');

    await page.evaluate('navigator.canShare = () => false');
    await click('Share image');
    assert.ok(await page.waitFor('window.__dl.length === 1'));
    assert.match((await page.evaluate('window.__dl'))[0], /^[a-z0-9-]+\.png$/, 'the same file name Export PNG would use');

    await page.evaluate('delete navigator.share; delete navigator.canShare; Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true })');
    await click('Share image');
    assert.ok(await page.waitFor('window.__dl.length === 2'), 'no Web Share at all: download');
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('Help carries the honest sentence and the Standalone HTML control says it is a file for a computer', { skip, timeout: 120000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    await page.navigate(`${FULL}?lang=en`);
    assert.ok(await page.waitFor(hasModel));
    await page.evaluate(`${helpButton}.click()`);
    assert.ok((await page.evaluate('document.querySelector("dialog.pw-help").textContent')).includes(NOTE_EN));
    assert.equal(await page.evaluate(`${htmlButton}.title`), 'A single HTML file with this plan inside, to open on a computer');
    await page.navigate(`${FULL}?lang=pl`);
    assert.ok(await page.waitFor(hasModel));
    assert.equal(await page.evaluate(`${htmlButton}.title`), 'Jeden plik HTML z tym planem w środku, do otwarcia na komputerze');
    assert.equal(await page.evaluate(`${button('Kopiuj link')}.title`), 'Plan jest zapisany wewnątrz linku. Odczyta go każdy, kto dostanie link, także aplikacja, przez którą go wyślesz.');
    await page.evaluate(`${helpButton}.click()`);
    assert.match(await page.evaluate('document.querySelector("dialog.pw-help").textContent'), /Plan jest zapisany wewnątrz linku/);
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
});

test('Polish: the share controls speak Polish, confirm with Skopiowano, and look right on a desktop bar and on a phone', { skip, timeout: 240000 }, async () => {
  for (const [label, size] of [['desktop', [1100, 640]], ['phone', [390, 664]]]) {
    const page = await openPage({ query: '?lang=pl', size });
    try {
      await page.navigate(`${FULL}?lang=pl`);
      assert.ok(await page.waitFor(hasModel));
      await page.evaluate('window.__copied = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } })');
      for (const caption of ['Kopiuj link', 'Kopiuj długi link', 'Udostępnij obraz']) assert.equal(await page.evaluate(`!!${button(caption)}`), true, caption);
      await page.evaluate(`${button('Kopiuj link')}.click()`);
      assert.ok(await page.waitFor(`!!${button('Skopiowano')}`));
      assert.ok(await page.waitFor(`!!${button('Kopiuj link')}`, 4000));
      if (evidence) await page.screenshot(join(evidence, `share-bar-pl-${label}.jpg`), 60);
      assert.deepEqual(page.pageErrors, []);
    } finally {
      page.close();
    }
  }
});
