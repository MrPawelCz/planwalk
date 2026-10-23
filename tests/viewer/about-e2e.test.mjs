// End to end for the About sheet in headless Chrome: the button follows the model, the "Scale estimated" badge follows the scale
// note, plan strings stay text, the version is the one in package.json, Polish labels. Skips when Chrome or dist is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chrome, chromeSkip } from '../helpers/chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skip = chromeSkip || (!existsSync(join(root, 'dist/planwalk-empty.html')) ? 'dist/planwalk-empty.html missing, run npm run build' : false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });

// One headless Chrome with a page on dist/planwalk-empty.html?lang=<lang>; evaluate() runs an expression in the page.
async function openPage(lang) {
  const profile = mkdtempSync(join(tmpdir(), 'planwalk-about-'));
  const port = await freePort();
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--window-size=390,664', 'about:blank'], { stdio: 'ignore' });
  const close = () => { try { proc.kill('SIGKILL'); } catch { /* gone */ } try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* best effort */ } };
  try {
    let target = null;
    for (let i = 0; i < 400 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ }
      if (!target) await sleep(150);
    }
    assert.ok(target, 'Chrome started a page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('DevTools WebSocket error'))); });
    let nextId = 1;
    const pending = new Map(), issues = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') issues.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) issues.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 664, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `${pathToFileURL(join(root, 'dist/planwalk-empty.html')).href}?lang=${lang}` });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('typeof window.planwalk === "object" && typeof window.planwalk.load === "function"').catch(() => false)) break;
      await sleep(150);
    }
    return { evaluate, issues, close: () => { ws.close(); close(); } };
  } catch (err) { close(); throw err; }
}

const plan = (extra = {}) => ({ ...JSON.parse(readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8')), ...extra });
const state = (label) => `(() => { const b = [...document.querySelectorAll('.pw-bar button, .pw-menu-body button')].find((x) => x.textContent === ${JSON.stringify(label)}); return { exists: !!b, disabled: !!b && b.disabled, badge: !document.querySelector('.pw-badge').hidden, badgeText: document.querySelector('.pw-badge').textContent }; })()`;
const click = (selectorOrLabel) => `(() => { const b = ${selectorOrLabel.startsWith('.') ? `document.querySelector(${JSON.stringify(selectorOrLabel)})` : `[...document.querySelectorAll('.pw-bar button, .pw-menu-body button')].find((x) => x.textContent === ${JSON.stringify(selectorOrLabel)})`}; b.click(); return true; })()`;
const sheet = '(() => { const d = document.querySelector(".pw-about"); return { open: d.open, text: d.innerText, hostile: d.querySelectorAll("img,script,b").length, pwx: window.__pwx === undefined }; })()';

test('About sheet: follows the model, shows the version from package.json, keeps plan strings as text, badge only for a guessed scale', { skip, timeout: 120000 }, async () => {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const s = await openPage('en');
  try {
    assert.deepEqual(await s.evaluate(state('About')), { exists: true, disabled: true, badge: false, badgeText: 'Scale estimated' }, 'no model: the button is disabled, no badge');

    assert.equal((await s.evaluate(`window.planwalk.load(${JSON.stringify(JSON.stringify(plan()))}).ok`)), true);
    assert.deepEqual(await s.evaluate(state('About')), { exists: true, disabled: false, badge: false, badgeText: 'Scale estimated' }, 'a model without a scale note: button on, no badge');
    await s.evaluate(click('About'));
    let sh = await s.evaluate(sheet);
    assert.equal(sh.open, true);
    for (const want of ['About this model', 'Minimal duplex', 'Levels', 'Not stated in the file', 'planwalk version', version, 'not a survey']) assert.ok(sh.text.includes(want), `the sheet says "${want}"`);
    assert.equal(await s.evaluate('window.planwalk.version'), version, 'the API reports the same version');
    await s.evaluate('document.querySelector(".pw-about").close()');

    const hostile = plan({ name: '<img src=x onerror="window.__pwx=1">', meta: { source: 'sketch', scale_note: 'scale from a standard door 0.85 m (a guess, not a measurement)', notes: '<b>bold</b> & <script>window.__pwx=2</script>' } });
    assert.equal((await s.evaluate(`window.planwalk.load(${JSON.stringify(JSON.stringify(hostile))}).ok`)), true);
    assert.equal((await s.evaluate(state('About'))).badge, true, 'a scale note that names a guess raises the badge');
    await s.evaluate(click('.pw-badge'));
    sh = await s.evaluate(sheet);
    assert.equal(sh.open, true, 'the badge opens the sheet');
    assert.equal(sh.hostile, 0, 'no element came out of the plan strings');
    assert.equal(sh.pwx, true, 'no plan string ran');
    for (const want of ['<img src=x onerror="window.__pwx=1">', '<b>bold</b> & <script>window.__pwx=2</script>', 'The note says the scale is a guess']) assert.ok(sh.text.includes(want), `the sheet shows "${want}" as text`);
    assert.deepEqual(s.issues, [], 'console stays clean');
  } finally { s.close(); }
});

test('About sheet in Polish: toolbar button, badge and rows follow ?lang=pl', { skip, timeout: 120000 }, async () => {
  const s = await openPage('pl');
  try {
    const guessed = plan({ name: 'Szkic', meta: { source: 'sketch', scale_note: 'Skala z typowych drzwi 0,85 m (zgadnięta, nie zmierzona)' } });
    assert.equal((await s.evaluate(`window.planwalk.load(${JSON.stringify(JSON.stringify(guessed))}).ok`)), true);
    assert.deepEqual(await s.evaluate(state('O modelu')), { exists: true, disabled: false, badge: true, badgeText: 'Skala szacowana' });
    await s.evaluate(click('O modelu'));
    const sh = await s.evaluate(sheet);
    for (const want of ['O tym modelu', 'Łączna powierzchnia pomieszczeń', 'Szkic', 'Notatka mówi, że skala jest przybliżona', 'Wizualizacja przekazanego rysunku, nie pomiar']) assert.ok(sh.text.includes(want), `the sheet says "${want}"`);
    assert.match(sh.text, /\d+,\d m²|\d+ m²/, 'areas in square metres');
    assert.deepEqual(s.issues, [], 'console stays clean');
  } finally { s.close(); }
});
