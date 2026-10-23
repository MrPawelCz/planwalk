// End to end in headless Chrome as an iPhone (390 x 664 CSS px at 3x, touch): the language switch in the phone Menu, the Top view on
// touch (one finger pans, two fingers pinch, the dollhouse keeps its own touch behaviour) and where Walk starts looking.
// Builds the page into a temporary folder first. Skips with a clear message when Chrome is missing. PLANWALK_SHOTS=dir keeps screenshots.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPhone, skipReason } from './phone-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-phone-x-'));
const page = join(out, 'planwalk.html');
const skip = skipReason();
const shots = process.env.PLANWALK_SHOTS || '';
if (shots) mkdirSync(shots, { recursive: true });
const PORTRAIT = { width: 390, height: 664, dpr: 3 };
const plan = readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8');

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

const withPhone = (opts, fn) => async () => {
  const p = await openPhone(page, opts);
  try { await fn(p); assert.deepEqual(p.issues, [], 'console stays clean'); } finally { await p.close(); }
};
const shot = (p, name) => (shots ? p.shot(join(shots, name)) : null);
const loadPlan = (p) => p.evaluate(`(() => { const r = window.planwalk.load(${JSON.stringify(plan)}); window.planwalk.advanceTime(300); return r.ok; })()`);
const box = async (p) => (await p.evaluate('window.planwalk.framing()')).box;
const widthOf = (b) => b.right - b.left;
const fingers = (cx, cy, half) => [{ x: cx - half, y: cy, id: 1 }, { x: cx + half, y: cy, id: 2 }];

test('the phone Menu holds the language switch in its title row: 44 px buttons, one tap changes the page and the Menu stays open', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.tap('.pw-menu-btn');
  const read = () => p.evaluate(`(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const sw = document.querySelector('.pw-sheet-head .pw-lang');
    return { buttons: [...sw.querySelectorAll('button')].map((x) => ({ text: x.textContent, pressed: x.getAttribute('aria-pressed'), ...r(x) })), group: sw.getAttribute('aria-label'),
      title: r(document.querySelector('#pw-menu-title')), cross: r(document.querySelector('.pw-sheet-x')), head: r(document.querySelector('.pw-sheet-head')), sheet: r(document.querySelector('.pw-menu')),
      open: r(document.querySelector('.pw-menu')).h > 0, lang: document.documentElement.lang,
      labels: [...document.querySelectorAll('.pw-menu-body button')].map((b) => b.textContent), menuTitle: document.querySelector('#pw-menu-title').textContent,
      hScroll: document.documentElement.scrollWidth > innerWidth };
  })()`);
  const en = await read();
  assert.deepEqual(en.buttons.map((b) => [b.text, b.pressed]), [['PL', 'false'], ['EN', 'true']]);
  assert.equal(en.group, 'Language');
  for (const b of en.buttons) assert.ok(b.w >= 44 && b.h >= 44, `${b.text} is ${b.w} x ${b.h}`);
  const sw = { l: en.buttons[0].l, r: en.buttons[1].r };
  assert.ok(sw.l >= en.title.r, 'the switch starts after the title');
  assert.ok(sw.r <= en.cross.l, 'and ends before the close cross');
  assert.ok(en.head.b - en.head.t <= 54.5, `the title row stays ${en.head.b - en.head.t} px high (it was 54 with the cross alone)`);
  assert.equal(en.hScroll, false);
  for (const word of ['Copy link', 'Share image']) assert.ok(en.labels.includes(word), `${word} is in the Menu: ${en.labels.join(' | ')}`);
  await shot(p, 'menu-lang-en.jpg');
  await p.tap('.pw-sheet-head .pw-lang button[lang=pl]');
  const pl = await read();
  assert.equal(pl.open, true, 'the Menu stays open');
  assert.equal(pl.lang, 'pl');
  assert.equal(pl.group, 'Język');
  assert.deepEqual(pl.buttons.map((b) => [b.text, b.pressed]), [['PL', 'true'], ['EN', 'false']]);
  for (const word of ['Kopiuj link', 'Udostępnij obraz', 'Pomoc']) assert.ok(pl.labels.includes(word), `${word} is in the Menu: ${pl.labels.join(' | ')}`);
  assert.equal(pl.hScroll, false);
  await shot(p, 'menu-lang-pl.jpg');
  await p.tap('.pw-sheet-head .pw-lang button[lang=en]');
  const back = await read();
  assert.equal(back.lang, 'en');
  assert.ok(back.labels.includes('Copy link'));
  // one switch in the Menu's title row, none in the toolbar behind it (the Help dialog has its own)
  assert.equal(await p.evaluate(`document.querySelectorAll('.pw-bar .pw-lang').length`), 0);
  assert.equal(await p.evaluate(`document.querySelectorAll('.pw-sheet-head .pw-lang').length`), 1);
}));

test('the language switch is not in the desktop toolbar and the Polish start shows PL pressed in the Menu', { skip, timeout: 90000 }, async () => {
  const d = await openPhone(page, { width: 1440, height: 900, dpr: 1, mobile: false });
  try {
    assert.equal(await d.evaluate(`!!document.querySelector('.pw-bar .pw-lang')`), false);
    assert.equal(await d.evaluate(`getComputedStyle(document.querySelector('.pw-menu')).display`), 'none');
  } finally { await d.close(); }
  const p = await openPhone(page, { ...PORTRAIT, search: '?lang=pl' });
  try {
    await p.tap('.pw-menu-btn');
    assert.deepEqual(await p.evaluate(`[...document.querySelectorAll('.pw-sheet-head .pw-lang button')].map((b) => b.getAttribute('aria-pressed'))`), ['true', 'false']);
    // the Polish paste dialog on the phone: a cross, a 16 px box, three 44 px buttons
    await p.tap(await p.evaluate(menuButton('Wklej odpowiedź')));
    const d = await p.evaluate(`(() => { const dl = document.querySelector('dialog.pw-dlg[open]'), r = dl.getBoundingClientRect(); return { open: !!dl, top: r.top, bottom: r.bottom, vh: innerHeight, buttons: [...dl.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height > 0).map((b) => b.textContent + ':' + Math.round(b.getBoundingClientRect().height)) }; })()`);
    assert.ok(d.open && d.top >= 0 && d.bottom <= d.vh, JSON.stringify(d));
    assert.ok(d.buttons.every((b) => Number(b.split(':').pop()) >= 44), d.buttons.join(' '));
    await shot(p, 'paste-pl.jpg');
  } finally { await p.close(); }
});

const menuButton = (label) => `(() => { const b = [...document.querySelectorAll('.pw-menu-body button')].find((x) => x.textContent === ${JSON.stringify(label)}); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
const clipboard = (body) => `window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: ${body} });`;

test('Copy link in the phone Menu keeps the Menu open and confirms on the button; a refused copy shows the link in a dialog that fits and has a cross', { skip, timeout: 120000 },
  withPhone({ ...PORTRAIT, beforeLoad: clipboard('{ writeText: (t) => { window.__copied = t; return Promise.resolve(); } }') }, async (p) => {
    await loadPlan(p);
    await p.tap('.pw-menu-btn');
    await p.tap(await p.evaluate(menuButton('Copy link')));
    await p.settle(600);
    assert.match(await p.evaluate('window.__copied'), /^file:.*planwalk\.html#(z|plan)=/, 'the link reached the clipboard');
    const st = await p.evaluate(`({ open: document.querySelector('.pw-menu').getBoundingClientRect().height > 0, labels: [...document.querySelectorAll('.pw-menu-body button')].map((b) => b.textContent) })`);
    assert.equal(st.open, true, 'the Menu stays open, so the confirmation can be seen');
    assert.ok(st.labels.includes('Copied'), `the button says Copied: ${st.labels.join(' | ')}`);
    await shot(p, 'menu-copied.jpg');
    // another action still closes the Menu
    await p.settle(1800);
    await p.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('no', 'NotAllowedError')) } }); document.execCommand = () => false;`);
    await p.tap(await p.evaluate(menuButton('Copy link')));
    await p.settle(700);
    const d = await p.evaluate(`(() => { const dl = document.querySelector('dialog.pw-share-dlg'), r = dl.getBoundingClientRect(), x = dl.querySelector('.pw-dlg-x').getBoundingClientRect(), ta = dl.querySelector('textarea');
      return { open: dl.open, top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, cross: [x.width, x.height], link: ta.value.slice(0, 5), font: parseFloat(getComputedStyle(ta).fontSize) }; })()`);
    assert.equal(d.open, true, 'a refused copy opens the dialog with the link');
    assert.equal(d.link, 'file:');
    assert.ok(d.top >= 0 && d.bottom <= d.vh && d.left >= 0 && d.right <= d.vw, `the dialog fits: ${JSON.stringify(d)}`);
    assert.ok(d.cross[0] >= 44 && d.cross[1] >= 44 && d.font >= 16);
    await shot(p, 'share-fallback.jpg');
    await p.tap('dialog.pw-share-dlg .pw-dlg-x');
    assert.equal(await p.evaluate(`document.querySelector('dialog.pw-share-dlg').open`), false, 'the cross closes it');
    await p.tap('.pw-menu-btn');
    await p.tap(await p.evaluate(menuButton('Help')));
    assert.equal(await p.evaluate(`document.querySelector('.pw-menu').getBoundingClientRect().height`), 0, 'Help closes the Menu');
  }));

test('phone on its side: the Menu title row keeps the language switch and the cross apart and reachable', { skip, timeout: 90000 }, async () => {
  const p = await openPhone(page, { width: 844, height: 390, dpr: 3, search: '?lang=pl' });
  try {
    // the first-visit card opened on the short screen: inside the window, under the bar, its buttons reachable by scrolling the card
    await p.tap('.pw-visit-open');
    const c = await p.evaluate(`(() => { const r = document.querySelector('.pw-visit').getBoundingClientRect(), b = document.querySelector('.pw-bar').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, barBottom: b.bottom, vh: innerHeight, scroll: getComputedStyle(document.querySelector('.pw-visit')).overflowY }; })()`);
    assert.ok(c.top >= c.barBottom && c.bottom <= c.vh && c.scroll === 'auto', JSON.stringify(c));
    await shot(p, 'land-card-open.jpg');
    await loadPlan(p); // a loaded plan puts the card away
    // Walk on the short screen: the hint sits low in the middle, the minimap under the bar at the right, no overlap
    await p.evaluate(`window.planwalk.setMode('walk'); window.planwalk.advanceTime(100)`);
    const w = await p.evaluate(`(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }; return { hint: r('.pw-touchhint'), mini: r('.pw-mini'), bar: r('.pw-bar'), vw: innerWidth, vh: innerHeight }; })()`);
    assert.ok(w.hint.l >= 0 && w.hint.r <= w.vw && w.hint.b <= w.vh, `the hint is inside the window: ${JSON.stringify(w.hint)}`);
    assert.ok(w.hint.r <= w.mini.l || w.hint.l >= w.mini.r || w.hint.b <= w.mini.t || w.hint.t >= w.mini.b, `the hint ${JSON.stringify(w.hint)} clears the minimap ${JSON.stringify(w.mini)}`);
    assert.ok(w.mini.t >= w.bar.b, 'the minimap is under the bar');
    await shot(p, 'land-walk.jpg');
    await p.evaluate(`window.planwalk.setMode('dollhouse')`);
    await p.tap('.pw-menu-btn');
    const m = await p.evaluate(`(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, h: b.height }; };
      return { sw: r('.pw-sheet-head .pw-lang'), cross: r('.pw-sheet-x'), sheet: r('.pw-menu'), pressed: [...document.querySelectorAll('.pw-sheet-head .pw-lang button')].map((b) => b.getAttribute('aria-pressed')), vh: innerHeight }; })()`);
    assert.deepEqual(m.pressed, ['true', 'false']);
    assert.ok(m.sw.r <= m.cross.l && m.sw.t >= m.sheet.t && m.sw.h >= 44, JSON.stringify(m));
    assert.ok(m.sheet.b <= m.vh);
    await shot(p, 'land-menu-pl.jpg');
    await p.tap('.pw-sheet-head .pw-lang button[lang=en]');
    assert.equal(await p.evaluate(`document.documentElement.lang`), 'en');
    assert.equal(await p.evaluate(`document.querySelector('.pw-menu').getBoundingClientRect().height > 0`), true);
    assert.deepEqual(p.issues, []);
  } finally { await p.close(); }
});

test('Top view on touch: two fingers pinch (zoom around the point between them), one finger pans, lifting one finger does not jump', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.evaluate(`window.planwalk.setMode('top'); window.planwalk.advanceTime(200)`);
  const b0 = await box(p);
  // spread from 80 to 160 px apart around (195, 330): the model is twice as wide, and the point between the fingers stays put
  await p.touch('touchStart', fingers(195, 330, 40));
  for (let d = 45; d <= 80; d += 5) await p.touch('touchMove', fingers(195, 330, d));
  await p.touch('touchEnd', []);
  const b1 = await box(p);
  assert.ok(Math.abs(widthOf(b1) / widthOf(b0) - 2) < 0.1, `the model grew ${(widthOf(b1) / widthOf(b0)).toFixed(2)} times, not 2`);
  assert.ok(Math.abs(b1.left - (195 + 2 * (b0.left - 195))) < 4, `the point under the fingers stayed: left ${b1.left.toFixed(1)}`);
  await shot(p, 'top-pinched.jpg');
  // pinch in again to the first size
  await p.touch('touchStart', fingers(195, 330, 80));
  for (let d = 75; d >= 40; d -= 5) await p.touch('touchMove', fingers(195, 330, d));
  await p.touch('touchEnd', []);
  const b2 = await box(p);
  assert.ok(Math.abs(widthOf(b2) / widthOf(b0) - 1) < 0.08, `back to ${(widthOf(b2) / widthOf(b0)).toFixed(2)} times the first size`);
  // one finger drags the plan along with it
  await p.touch('touchStart', [{ x: 150, y: 300, id: 1 }]);
  for (let x = 160; x <= 210; x += 10) await p.touch('touchMove', [{ x, y: 300, id: 1 }]);
  await p.touch('touchEnd', []);
  const b3 = await box(p);
  assert.ok(Math.abs(b3.left - b2.left - 60) < 3 && Math.abs(b3.top - b2.top) < 3, `panned by ${(b3.left - b2.left).toFixed(1)}, ${(b3.top - b2.top).toFixed(1)} instead of 60, 0`);
  // two fingers down, one lifts, the other moves 30 px: the plan follows by 30 px, no jump from the lost finger
  await p.touch('touchStart', fingers(195, 330, 50));
  await p.touch('touchEnd', [{ x: 145, y: 330, id: 1 }]); // the list of a touchEnd names the fingers that lift
  const before = await box(p);
  await p.touch('touchMove', [{ x: 260, y: 330, id: 2 }]);
  await p.touch('touchMove', [{ x: 275, y: 330, id: 2 }]);
  await p.touch('touchEnd', []);
  const after = await box(p);
  assert.ok(Math.abs(after.left - before.left - 30) < 3 && Math.abs(widthOf(after) - widthOf(before)) < 0.5, `moved ${(after.left - before.left).toFixed(1)} px, width changed ${(widthOf(after) - widthOf(before)).toFixed(2)}`);
}));

test('the dollhouse keeps its touch behaviour: one finger turns the model, two fingers zoom', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.evaluate(`window.planwalk.setMode('dollhouse'); window.planwalk.advanceTime(200)`);
  const yaw0 = await p.evaluate('window.planwalk.state().camera.yaw');
  await p.touch('touchStart', [{ x: 120, y: 330, id: 1 }]);
  for (let x = 140; x <= 280; x += 20) await p.touch('touchMove', [{ x, y: 330, id: 1 }]);
  await p.touch('touchEnd', []);
  const yaw1 = await p.evaluate('window.planwalk.state().camera.yaw');
  assert.ok(Math.abs(yaw1 - yaw0) > 15, `the camera turned ${(yaw1 - yaw0).toFixed(1)} degrees`);
  const w0 = widthOf(await box(p));
  await p.touch('touchStart', fingers(195, 330, 40));
  for (let d = 50; d <= 90; d += 10) await p.touch('touchMove', fingers(195, 330, d));
  await p.touch('touchEnd', []);
  const w1 = widthOf(await box(p));
  assert.ok(w1 > w0 * 1.3, `the model is ${(w1 / w0).toFixed(2)} times wider after a spread`);
}));

test('Walk starts looking down the room, not at the wall in front of the door, in the page too', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.evaluate(`window.planwalk.setMode('walk'); window.planwalk.advanceTime(200)`);
  const s = await p.evaluate('window.planwalk.state()');
  assert.equal(s.mode, 'walk');
  assert.equal(s.room, 'r-living');
  assert.ok(Math.abs(s.camera.yaw - 155) < 1, `the start yaw is ${s.camera.yaw}, the longest view of the living room`);
  await shot(p, 'walk-start.jpg');
}));
