// End to end in headless Chrome: after a paste, a dropped file or a ?plan= address the page says "Wczytano: <name>, N pomieszczeń"
// (or "Loaded: <name>, N rooms") in a polite status line for about five seconds. It stays quiet for the API, for a failed paste and
// for the first example, never takes a tap, and on a phone sits under the top bar without touching any control.
// Builds the page into a temporary folder first. Skips when Chrome is missing, fails instead when PLANWALK_REQUIRE_CHROME=1.
// Set PLANWALK_SHOT_DIR to also write a screenshot of the phone. Run it through tools/chrome-lock.sh when other browsers may be running.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, skipReason } from './first-visit-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-loaded-e2e-'));
const page = join(out, 'planwalk.html');
const skip = process.env.PLANWALK_REQUIRE_CHROME === '1' ? false : skipReason();
const shotDir = process.env.PLANWALK_SHOT_DIR || '';
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const settle = 'new Promise((r) => setTimeout(r, 300))';
const readPlan = (file, name) => { const p = JSON.parse(readFileSync(join(root, file), 'utf8')); if (name) p.name = name; return JSON.stringify(p); };
const DUPLEX = readPlan('tests/fixtures/duplex-min.plan.json', 'Mieszkanie Testowe');
const FLAT = readPlan('examples/flat-1.plan.json', 'Kawalerka');
const HELPERS = `
  window.__paste = (text) => { const dt = new DataTransfer(); dt.setData('text', text); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); };
  window.__drop = (text, name) => { const dt = new DataTransfer(); dt.items.add(new File([text], name, { type: 'application/json' })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); };`;
// The expected words, written out again here on purpose (the module under test must not mark its own homework).
const roomsPl = (n) => `${n} ${n === 1 ? 'pomieszczenie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'pomieszczenia' : 'pomieszczeń'}`;
const roomsEn = (n) => `${n} ${n === 1 ? 'room' : 'rooms'}`;

const line = (p) => p.evaluate(`(() => { const e = ${q('.pw-loaded')}; const s = getComputedStyle(e); return { text: e.textContent, opacity: s.opacity, pointer: s.pointerEvents, role: e.getAttribute('role'), live: e.getAttribute('aria-live') }; })()`);
const rooms = (p) => p.evaluate('window.planwalk.state().counts.rooms');
async function waitUntil(p, expression, ms = 15000) {
  for (let t = 0; t < ms; t += 100) {
    if (await p.evaluate(expression).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

test('paste, the Wczytaj button and a dropped file show "Wczytano: nazwa, N pomieszczeń" for about five seconds; the API and a failed paste stay quiet; a change of language rewrites it', { skip, timeout: 180000 }, async () => {
  const p = await openPage(page, { width: 1280, height: 800, search: '?lang=pl' });
  try {
    await p.evaluate(HELPERS);
    const idle = await line(p);
    assert.deepEqual(idle, { text: '', opacity: '0', pointer: 'none', role: 'status', live: 'polite' }, 'an empty, invisible, polite status line is in the page from the start');
    // the first example, the API and a failed paste say nothing
    await p.evaluate(`window.planwalk.load(${JSON.stringify(DUPLEX)}); ${settle}`);
    assert.equal((await line(p)).text, '', 'api.load is silent');
    await p.evaluate(`window.__paste('Nie widzę rysunku {proszę o nowy}'); ${settle}`);
    assert.equal((await line(p)).text, '', 'a paste without a plan is silent (the banner speaks)');
    // a paste of a plan
    await p.evaluate(`window.__paste(${JSON.stringify(`Oto plan:\n\`\`\`json\n${DUPLEX}\n\`\`\`\nGotowe.`)}); ${settle}`);
    const n = await rooms(p);
    assert.ok(n > 1);
    let now = await line(p);
    assert.equal(now.text, `Wczytano: Mieszkanie Testowe, ${roomsPl(n)}`);
    assert.equal(now.opacity, '1', 'visible');
    const rect = await p.evaluate(`(() => { const r = ${q('.pw-loaded')}.getBoundingClientRect(), b = ${q('.pw-bar')}.getBoundingClientRect(); return { top: r.top, barBottom: b.bottom, left: r.left, right: r.right }; })()`);
    assert.ok(rect.top >= rect.barBottom, `under the toolbar (${rect.top} vs ${rect.barBottom})`);
    // it goes away by itself after about five seconds, not at once (the margins are wide: a loaded machine delays every step)
    await new Promise((r) => setTimeout(r, 2000));
    assert.equal((await line(p)).opacity, '1', 'still there after two seconds');
    assert.equal(await waitUntil(p, `${q('.pw-loaded')}.textContent === ''`, 7000), true, 'gone after about five seconds');
    assert.equal(await waitUntil(p, `getComputedStyle(${q('.pw-loaded')}).opacity === '0'`, 2000), true, 'and invisible (it fades out)');
    // the dialog route: Wklej odpowiedź, text, Wczytaj
    await p.evaluate(`[...document.querySelectorAll('.pw-bar button')].find((b) => b.textContent === 'Wklej odpowiedź').click(); ${settle}`);
    await p.evaluate(`const ta = ${q('dialog.pw-dlg textarea')}; ta.value = ${JSON.stringify(FLAT)}; [...document.querySelectorAll('dialog.pw-dlg button')].find((b) => b.textContent === 'Wczytaj').click(); ${settle}`);
    const flat = await rooms(p);
    assert.equal((await line(p)).text, `Wczytano: Kawalerka, ${roomsPl(flat)}`);
    // a dropped file
    await p.evaluate(`window.__drop(${JSON.stringify(DUPLEX)}, 'plan.json')`);
    assert.equal(await waitUntil(p, `${q('.pw-loaded')}.textContent.startsWith('Wczytano: Mieszkanie Testowe')`), true, 'a dropped file is announced too');
    // English follows the language switch while the line is up
    await p.evaluate(`window.planwalk.setLang('en')`);
    assert.equal((await line(p)).text, `Loaded: Mieszkanie Testowe, ${roomsEn(await rooms(p))}`);
    await p.evaluate(`window.planwalk.setLang('pl')`);
    assert.equal((await line(p)).text, `Wczytano: Mieszkanie Testowe, ${roomsPl(await rooms(p))}`);
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});

test('?plan= with a download announces the plan; a plan without a name is called "plan bez nazwy"', { skip, timeout: 120000 }, async () => {
  const unnamed = JSON.parse(DUPLEX); delete unnamed.name;
  const body = { '/named.json': DUPLEX, '/unnamed.json': JSON.stringify(unnamed) };
  const server = createServer((req, res) => { res.writeHead(body[req.url] ? 200 : 404, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(body[req.url] || ''); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, expect] of [['/named.json', /^Wczytano: Mieszkanie Testowe, \d+ pomieszcz(enie|enia|eń)$/], ['/unnamed.json', /^Wczytano: plan bez nazwy, \d+ pomieszcz(enie|enia|eń)$/]]) {
      const p = await openPage(page, { width: 1280, height: 800, search: `?lang=pl&plan=${encodeURIComponent(base + path)}` });
      try {
        assert.equal(await waitUntil(p, `${q('.pw-loaded')}.textContent !== ''`, 20000), true, `${path}: announced`);
        assert.match((await line(p)).text, expect);
      } finally { await p.close(); }
    }
  } finally { server.close(); }
});

test('phone: the line sits under the top bar, covers no control, takes no tap, and fits the screen', { skip, timeout: 120000 }, async () => {
  const p = await openPage(page, { width: 390, height: 664, mobile: true, dpr: 2, search: '?lang=pl' });
  try {
    await p.evaluate(HELPERS);
    await p.evaluate(`window.__paste(${JSON.stringify(DUPLEX)}); ${settle}`);
    const info = await p.evaluate(`(() => {
      const n = ${q('.pw-loaded')}, r = n.getBoundingClientRect(), bar = ${q('.pw-bar')}.getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const controls = [...document.querySelectorAll('#pw-app button, #pw-app select, #pw-app input, #pw-app a')].filter((c) => !n.contains(c)).map((c) => ({ c, r: c.getBoundingClientRect() })).filter(({ r: x }) => x.width > 0 && x.height > 0);
      const covered = controls.filter(({ r: x }) => hit(r, x)).map(({ c }) => c.tagName + ':' + c.textContent.trim().slice(0, 20));
      const mid = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { text: n.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, barBottom: bar.bottom, covered, tapGoesThrough: mid !== n && !n.contains(mid), width: window.innerWidth };
    })()`);
    assert.match(info.text, /^Wczytano: Mieszkanie Testowe, \d+ pomieszcz(enie|enia|eń)$/);
    assert.ok(info.top >= info.barBottom, `under the bar: ${info.top} vs ${info.barBottom}`);
    assert.ok(info.left >= 0 && info.right <= info.width, `inside the screen: ${info.left} to ${info.right} of ${info.width}`);
    assert.deepEqual(info.covered, [], 'no control is covered');
    assert.equal(info.tapGoesThrough, true, 'a tap on the line reaches what is below it');
    if (shotDir) { mkdirSync(shotDir, { recursive: true }); await p.shot(join(shotDir, 'phone-wczytano.jpg'), 60); }
    assert.deepEqual(p.issues, [], 'console stays clean');
  } finally { await p.close(); }
});
