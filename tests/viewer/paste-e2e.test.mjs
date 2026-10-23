// End to end: a chat answer pasted into the page in every common shape shows the model, a paste that holds no plan keeps the
// model on screen and says why, and the file, ?plan= and #plan= paths report failures in plain words.
// Chrome runs through tools/chrome-lock.sh when other browsers may be running. Skips with a message when Chrome or dist is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPage, skip, root } from './chrome-page.mjs';
import { bare, plan, variants } from '../core/paste-variants.mjs';

const duplex = readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8');
const PASTE = 'window.__paste = (text) => { const dt = new DataTransfer(); dt.setData("text", text); document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }';
const counts = (page) => page.evaluate('window.planwalk.state().counts');
const banner = (page) => page.evaluate('(() => { const b = document.querySelector(".pw-banner"); return b && !b.hidden ? b.textContent : null; })()');
const paste = (page, text) => page.evaluate(`window.__paste(${JSON.stringify(text)})`);
const evidence = process.env.PW_EVIDENCE;

test('every chat style pasted into the page shows the model; a paste without a plan keeps it', { skip, timeout: 120000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    await page.evaluate(PASTE);
    assert.deepEqual(await counts(page), { levels: 0, walls: 0, openings: 0, rooms: 0, furniture: 0, stairs: 0 });
    assert.equal(await page.evaluate('document.querySelectorAll(".pw-card button").length > 0 && [...document.querySelectorAll("button")].filter((b) => b.textContent === "Open file").length'), 2, 'Open file on the empty card and in the paste dialog');

    const loaded = await page.evaluate(`window.planwalk.load(${JSON.stringify(bare)})`);
    assert.equal(loaded.ok, true);
    const flat = await counts(page);
    assert.ok(flat.walls > 0 && flat.rooms > 0);
    for (const [name, text] of Object.entries(variants)) {
      await page.evaluate(`window.planwalk.load(${JSON.stringify(duplex)})`);
      assert.notDeepEqual(await counts(page), flat, `${name}: the stand-in model must differ`);
      await paste(page, text);
      assert.deepEqual(await counts(page), flat, name);
      assert.equal(await banner(page), null, `${name}: no complaint for a readable answer`);
    }

    // A paste that holds no plan: the model and its state stay, the banner explains.
    const before = await page.evaluate('JSON.stringify(window.planwalk.state())');
    await paste(page, 'Sorry, I could not read {the drawing}. Please send it again.');
    assert.match(await banner(page), /does not contain a plan/);
    assert.deepEqual(await counts(page), flat);
    assert.equal(await page.evaluate('JSON.stringify(window.planwalk.state())'), before, 'the state is untouched');
    assert.equal(await page.evaluate('document.querySelector(".pw-issues").hidden'), true, 'no issues panel for a paste that holds no plan');
    if (evidence) await page.screenshot(join(evidence, 'banner-after-failed-paste.jpg'));

    await page.evaluate('document.querySelector(".pw-banner-x").click()');
    assert.equal(await banner(page), null, 'the banner can be dismissed');

    await paste(page, bare.slice(0, 300));
    assert.match(await banner(page), /stops before the end/);
    await paste(page, '{"version": 1, "levels": []}');
    assert.match(await banner(page), /cannot build a model/);
    assert.match(await banner(page), /E002 levels: schema violation: levels has 0 items/, 'the banner names the first error');
    assert.equal(await page.evaluate('document.querySelectorAll(".pw-banner-detail div").length'), 1);
    assert.deepEqual(await counts(page), flat, 'a plan with errors does not replace the model either');
    await page.evaluate('document.querySelector(".pw-banner-x").click()');
    const broken = JSON.parse(JSON.stringify(plan));
    delete broken.levels[0].walls[0].to;
    delete broken.levels[0].walls[1].to;
    delete broken.levels[0].walls[2].to;
    await paste(page, JSON.stringify(broken));
    assert.equal(await page.evaluate('document.querySelectorAll(".pw-banner-detail div").length'), 2, 'only the first two errors are shown');
    assert.match(await banner(page), /E002 levels\[0\]\.walls\[0\]/);
    assert.ok(await page.evaluate('[...document.querySelectorAll(".pw-banner-detail div")].every((d) => d.textContent.length <= 160 && d.children.length === 0)'), 'lines are short text nodes');
    if (evidence) await page.screenshot(join(evidence, 'banner-two-errors.jpg'));
    await page.evaluate('document.querySelector(".pw-banner-x").click()');
    const second = JSON.parse(JSON.stringify(plan));
    second.name = 'Corrected version';
    await paste(page, `First try:\n\`\`\`json\n${bare}\n\`\`\`\nCorrected:\n\`\`\`json\n${JSON.stringify(second)}\n\`\`\``);
    assert.match(await banner(page), /more than one plan.*loaded the last one/, 'two plans: the person is told which one was loaded');
    assert.equal(await page.evaluate('document.querySelector(".pw-name").textContent'), 'Corrected version', 'the last plan is the one on screen');
    assert.deepEqual(await counts(page), flat);
    await page.evaluate('document.querySelector(".pw-banner-x").click()');
    await paste(page, '{"version": 1, "levels": [{"id": "L0", "wall_thickness": 0,2, "height": 2,5}]}');
    assert.match(await banner(page), /mistake in the JSON.*decimal point, not a comma \(2\.5, not 2,5\)/);
    assert.equal(await page.evaluate('document.querySelectorAll(".pw-banner-detail div").length'), 0, 'no stale lines under another message');
    await page.evaluate('document.querySelector(".pw-banner-x").click()');
    await page.evaluate('document.querySelector(".pw-banner-x").click()');
    await paste(page, 'just some words');
    assert.equal(await banner(page), null, 'text without a { is not for planwalk and is ignored');
    await paste(page, bare);
    assert.deepEqual(await counts(page), flat);
    assert.equal(await banner(page), null, 'a good plan clears the banner');
    assert.deepEqual(page.pageErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    page.close();
  }
});

test('the banner speaks Polish when the page does', { skip, timeout: 60000 }, async () => {
  const page = await openPage({ query: '?lang=pl' });
  try {
    await page.evaluate(PASTE);
    await paste(page, 'Przepraszam, nie umiem odczytać {tego rysunku}.');
    assert.match(await banner(page), /W tym tekście nie ma planu/);
    assert.equal(await page.evaluate('[...document.querySelectorAll("button")].filter((b) => b.textContent === "Otwórz plik").length'), 2);
  } finally {
    page.close();
  }
});

test('Open file reads a chat answer saved as a file, and refuses nothing readable', { skip, timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'planwalk-file-'));
  const page = await openPage({});
  try {
    const file = join(dir, 'answer.txt');
    writeFileSync(file, variants['fenced block with notes before and after']);
    assert.equal(await page.evaluate('document.querySelector("input[type=file]").accept'), '.json,.txt,application/json,text/plain');
    await page.setFile('input[type=file]', file);
    assert.ok(await page.waitFor('window.planwalk.state().counts.walls > 0'));
    const flat = await counts(page);
    writeFileSync(file, 'This file is not a plan, but has a { in it.');
    await page.setFile('input[type=file]', file);
    assert.ok(await page.waitFor('!!document.querySelector(".pw-banner:not([hidden])")'));
    assert.deepEqual(await counts(page), flat);
  } finally {
    page.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('?plan= and #plan= tell a failed download from a file that is not a plan, and never wipe the page', { skip, timeout: 120000 }, async () => {
  const cors = { 'access-control-allow-origin': '*' };
  const server = createServer((req, res) => {
    const route = {
      '/good.json': [200, cors, bare], '/chat.txt': [200, cors, variants['fenced block with notes before and after']],
      '/missing.json': [404, cors, 'no'], '/words.txt': [200, cors, 'hello world, nothing to see'],
      '/nocors.json': [200, {}, bare], '/big.txt': [200, cors, 'x'.repeat(3 * 1024 * 1024)],
    }[req.url];
    if (!route) { res.writeHead(404, cors); res.end('no'); return; }
    res.writeHead(route[0], { 'content-type': 'text/plain', ...route[1] });
    res.end(route[2]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await openPage({ query: `?lang=en&plan=${encodeURIComponent(`${base}/good.json`)}` });
  try {
    assert.ok(await page.waitFor('window.planwalk.state().counts.walls > 0'), 'a plan behind a link loads');
    const flat = await counts(page);
    const expectBanner = async (path, pattern) => {
      await page.navigate(`file://${root}dist/planwalk-empty.html?lang=en&plan=${encodeURIComponent(`${base}${path}`)}`);
      assert.ok(await page.waitFor('!!document.querySelector(".pw-banner:not([hidden])")', 15000), `${path}: no banner`);
      assert.match(await banner(page), pattern, path);
      assert.deepEqual(await counts(page), { levels: 0, walls: 0, openings: 0, rooms: 0, furniture: 0, stairs: 0 }, `${path}: nothing was invented`);
    };
    await expectBanner('/missing.json', /server answered with an error \(404\)/);
    await expectBanner('/words.txt', /download worked, but the file is not a plan/);
    await expectBanner('/nocors.json', /Could not download the plan/);
    await expectBanner('/big.txt', /too long/);
    await page.navigate(`file://${root}dist/planwalk-empty.html?lang=en&plan=${encodeURIComponent(`${base}/chat.txt`)}`);
    assert.ok(await page.waitFor('window.planwalk.state().counts.walls > 0'));
    assert.deepEqual(await counts(page), flat, 'a chat answer behind a link loads too');

    await page.navigate(`file://${root}dist/planwalk-empty.html?lang=en#plan=${Buffer.from('not a plan {').toString('base64url')}`);
    assert.match(await banner(page), /damaged/);
    await page.navigate(`file://${root}dist/planwalk-empty.html?lang=en#plan=${Buffer.from(JSON.stringify(plan)).toString('base64url')}`);
    assert.deepEqual(await counts(page), flat, 'a good #plan= still loads');
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
    server.close();
  }
});

test('the paste dialog takes a whole chat answer and says so when it is empty', { skip, timeout: 60000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    const button = (label) => `[...document.querySelectorAll("button")].find((b) => b.textContent === ${JSON.stringify(label)})`;
    const dialogText = (value) => page.evaluate(`document.querySelector("dialog.pw-dlg textarea").value = ${JSON.stringify(value)}`);
    await page.evaluate(`${button('Paste JSON')}.click()`);
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-dlg").open'), true);
    await dialogText('');
    await page.evaluate(`${button('Load')}.click()`);
    assert.match(await banner(page), /nothing to load/);
    assert.equal(await page.evaluate('document.querySelector("dialog.pw-dlg").open'), false);
    await page.evaluate(`${button('Paste JSON')}.click()`);
    await dialogText(variants['fenced block with notes before and after']);
    await page.evaluate(`${button('Load')}.click()`);
    assert.ok((await counts(page)).walls > 0);
    assert.equal(await banner(page), null);
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
});

test('a dropped file loads, and a dropped file that holds no plan keeps the model', { skip, timeout: 60000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    const drop = (text, name) => page.evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)})); window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
    await drop(variants['fenced block with notes before and after'], 'answer.txt');
    assert.ok(await page.waitFor('window.planwalk.state().counts.walls > 0'));
    const flat = await counts(page);
    await drop('This is not a plan, but it has a { in it.', 'notes.txt');
    assert.ok(await page.waitFor('!!document.querySelector(".pw-banner:not([hidden])")'));
    assert.match(await banner(page), /does not contain a plan/);
    assert.deepEqual(await counts(page), flat);
    await drop(`{"note": "${'x'.repeat(2500000)}"}`, 'huge.json');
    assert.ok(await page.waitFor('document.querySelector(".pw-banner").textContent.includes("too long")'));
    assert.deepEqual(await counts(page), flat);
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
});
