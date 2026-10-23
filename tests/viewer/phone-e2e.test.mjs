// End to end in headless Chrome, emulating an iPhone (390 x 664 CSS px at 3x, touch, Safari user agent) and a phone on its side
// (750 x 340): the compact layout (one row top bar, bottom mode bar, Menu sheet, issues badge and sheet), the framing of the first
// view and of the PNG export, the one line first-visit card, the touch help in Walk, tap target sizes and contrast.
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
const out = mkdtempSync(join(tmpdir(), 'planwalk-phone-e2e-'));
const page = join(out, 'planwalk.html');
const skip = skipReason();
const shots = process.env.PLANWALK_SHOTS || '';
if (shots) mkdirSync(shots, { recursive: true });
const PORTRAIT = { width: 390, height: 664, dpr: 3 };
const LANDSCAPE = { width: 750, height: 340, dpr: 3 };

// The two level fixture with two doors outside the usual width, so the check reports two warnings.
const plan = (() => {
  const p = JSON.parse(readFileSync(join(root, 'tests/fixtures/duplex-min.plan.json'), 'utf8'));
  const l0 = p.levels[0];
  l0.openings.find((o) => o.id === 'gd1').width = 1.6;
  l0.openings.push({ id: 'gd3', wall: 'g1', type: 'door', offset: 3.0, width: 1.5 });
  return JSON.stringify(p);
})();

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

const rectOf = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, hidden: r.width === 0 || r.height === 0 }; })()`;
// Interactive elements (buttons, selects, inputs, switches) inside a scope that are shown and smaller than 44 px either way.
const smallIn = (scope) => `[...document.querySelectorAll(${JSON.stringify(`${scope} button, ${scope} select, ${scope} input, ${scope} label.pw-switch`)})].map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5)).map(({ e, r }) => e.tagName + ':' + (e.textContent || e.type || '').trim().slice(0, 20) + ':' + Math.round(r.width) + 'x' + Math.round(r.height))`;
const noScroll = `document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight && document.body.scrollWidth <= window.innerWidth`;
const withPhone = (opts, fn) => async () => {
  const p = await openPhone(page, opts);
  try { await fn(p); assert.deepEqual(p.issues, [], 'console stays clean'); } finally { await p.close(); }
};
const shot = (p, name) => (shots ? p.shot(join(shots, name)) : null);
const luminance = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const loadPlan = (p, text = plan) => p.evaluate(`(() => { const r = window.planwalk.load(${JSON.stringify(text)}); window.planwalk.advanceTime(300); return { ok: r.ok, warnings: r.warnings.length }; })()`);
const MARGIN = 0.04;
const say = (what, value) => console.log(`W9 measured ${what}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
const minTarget = (scope) => `Math.min(...[...document.querySelectorAll(${JSON.stringify(`${scope} button, ${scope} select, ${scope} input, ${scope} label.pw-switch`)})].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => Math.min(r.width, r.height)))`;
const margins = (m) => Math.min(m.left, m.right, m.top, m.bottom);

test('portrait phone: compact layout, a one row top bar of at most 56 px, a bottom mode bar with 44 px buttons, no scrolling', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  const info = await p.evaluate(`(() => {
    const app = document.getElementById('pw-app'), bar = document.querySelector('.pw-bar'), br = bar.getBoundingClientRect();
    const kids = [...bar.children].filter((c) => c.getBoundingClientRect().width > 0);
    const centres = kids.map((c) => { const r = c.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    const name = getComputedStyle(document.querySelector('.pw-name'));
    return { classes: app.className, barH: br.height, barBottom: br.bottom, rows: Math.max(...centres) - Math.min(...centres) < 6 ? 1 : 2, kids: kids.map((c) => c.className || c.tagName),
      selects: bar.querySelectorAll('select, input').length, ellipsis: name.textOverflow + ' ' + name.whiteSpace, vh: innerHeight, vw: innerWidth };
  })()`);
  assert.match(info.classes, /pw-compact/);
  assert.doesNotMatch(info.classes, /pw-landscape/);
  assert.ok(info.barH <= 56, `top bar is ${info.barH} px high`);
  say('portrait top bar height px', info.barH);
  assert.equal(info.rows, 1, `bar children: ${info.kids.join(', ')}`);
  assert.equal(info.selects, 0, 'the other controls live in the Menu');
  assert.equal(info.ellipsis, 'ellipsis nowrap');
  const menu = await p.evaluate(rectOf('.pw-menu-btn'));
  assert.ok(menu.w >= 44 && menu.h >= 44, `Menu button ${menu.w} x ${menu.h}`);
  const modes = await p.evaluate(`[...document.querySelectorAll('.pw-modebar button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, w: r.width, h: r.height, on: b.classList.contains('on') }; })`);
  assert.deepEqual(modes.map((m) => m.text), ['Dollhouse', 'Orbit', 'Top', 'Walk']);
  for (const m of modes) assert.ok(m.h >= 44 && m.w >= 44, `${m.text} is ${m.w} x ${m.h}`);
  assert.equal(modes.filter((m) => m.on).length, 1);
  const mb = await p.evaluate(rectOf('.pw-modebar'));
  assert.equal(mb.b, info.vh, 'the mode bar sits on the bottom edge');
  assert.deepEqual(await p.evaluate(smallIn('.pw-bar')), []);
  assert.deepEqual(await p.evaluate(smallIn('.pw-modebar')), []);
  say('portrait mode bar height px / min button height / Menu button', { bar: mb.h, minMode: Math.min(...modes.map((m) => m.h)), menu: [menu.w, menu.h] });
  say('portrait smallest tap target px (top bar, mode bar)', [await p.evaluate(minTarget('.pw-bar')), await p.evaluate(minTarget('.pw-modebar'))]);
  assert.equal(await p.evaluate(noScroll), true, 'no horizontal or vertical scroll');
  await shot(p, 'portrait-en-start.jpg');
  // a tap on a mode button changes the mode
  await p.tap('.pw-modebar button:nth-child(2)');
  assert.equal(await p.evaluate('window.planwalk.state().mode'), 'orbit');
}));

test('Menu sheet: every control in it, 44 px targets, 16 px fields, closes by Escape, by a tap outside and by its button', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.tap('.pw-menu-btn');
  const open = await p.evaluate(`(() => { const m = document.querySelector('.pw-menu'); const r = m.getBoundingClientRect();
    return { shown: r.height > 0, hPct: r.height / innerHeight * 100, bottom: r.bottom, vh: innerHeight, scrim: !document.querySelector('.pw-scrim').hidden,
      labels: [...m.querySelectorAll('.pw-menu-body > *')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => (e.textContent || e.tagName).trim().slice(0, 24)),
      fonts: [...m.querySelectorAll('select, input[type=text], textarea')].map((e) => parseFloat(getComputedStyle(e).fontSize)),
      slider: m.querySelector('input[type=range]').getBoundingClientRect().height, extras: m.querySelector('.pw-menu-body').lastElementChild.className, expanded: document.querySelector('.pw-menu-btn').getAttribute('aria-expanded') }; })()`);
  assert.equal(open.shown, true);
  assert.ok(open.hPct <= 86, `the sheet takes ${open.hPct.toFixed(1)} percent of the height`);
  say('portrait Menu sheet height percent / smallest tap target px / slider height px', [Math.round(open.hPct * 10) / 10, await p.evaluate(minTarget('.pw-menu')), open.slider]);
  assert.equal(open.bottom, open.vh);
  assert.equal(open.scrim, true);
  assert.equal(open.expanded, 'true');
  for (const word of ['All levels', 'Explode', 'Cutaway', 'Labels', 'Textures', 'Paste JSON', 'Export GLB', 'Export PNG', 'Standalone HTML', 'About', 'Help']) {
    assert.ok(open.labels.some((l) => l.includes(word)), `${word} is in the Menu: ${open.labels.join(' | ')}`);
  }
  assert.ok(open.fonts.length > 0 && open.fonts.every((f) => f >= 16), `field fonts ${open.fonts}`);
  assert.ok(open.slider >= 32, `the slider hit area is ${open.slider} px`);
  assert.match(open.extras, /pw-menu-extras/, 'the menuExtras slot is the last item');
  assert.deepEqual(await p.evaluate(smallIn('.pw-menu')), []);
  assert.equal(await p.evaluate(noScroll), true);
  await shot(p, 'portrait-en-menu.jpg');
  // a switch works through a touch on the whole row
  assert.equal(await p.evaluate('window.planwalk.state().cutaway'), true);
  await p.tap('.pw-menu-body label.pw-switch');
  assert.equal(await p.evaluate('window.planwalk.state().cutaway'), false);
  assert.equal(await p.evaluate(rectOf('.pw-menu')).then((r) => r.hidden), false, 'the Menu stays open while switches change');
  // closing: Escape, a tap on the dimmed page, the close button
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))`);
  assert.equal(await p.evaluate(rectOf('.pw-menu')).then((r) => r.hidden), true, 'Escape closes');
  await p.tap('.pw-menu-btn');
  await p.tap({ x: 195, y: 40 });
  assert.equal(await p.evaluate(rectOf('.pw-menu')).then((r) => r.hidden), true, 'a tap outside closes');
  await p.tap('.pw-menu-btn');
  const x = await p.evaluate(rectOf('.pw-sheet-x'));
  assert.ok(x.w >= 44 && x.h >= 44);
  await p.tap('.pw-sheet-x');
  assert.equal(await p.evaluate(rectOf('.pw-menu')).then((r) => r.hidden), true, 'the close button closes');
  // an action from the Menu closes it and does its job: Paste JSON opens the dialog with 16 px text and 44 px buttons
  await p.tap('.pw-menu-btn');
  await p.evaluate(`[...document.querySelectorAll('.pw-menu-body button')].find((b) => b.textContent === 'Paste JSON').getBoundingClientRect()`);
  const pasteAt = await p.evaluate(`(() => { const r = [...document.querySelectorAll('.pw-menu-body button')].find((b) => b.textContent === 'Paste JSON').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await p.tap(pasteAt);
  const dlg = await p.evaluate(`(() => ({ open: !!document.querySelector('dialog.pw-dlg[open] textarea'), menuGone: document.querySelector('.pw-menu').getBoundingClientRect().height === 0,
    font: parseFloat(getComputedStyle(document.querySelector('dialog.pw-dlg[open] textarea')).fontSize) }))()`);
  assert.equal(dlg.open, true);
  assert.equal(dlg.menuGone, true);
  assert.ok(dlg.font >= 16, `paste field font ${dlg.font}`);
  assert.deepEqual(await p.evaluate(smallIn('dialog.pw-dlg[open]')), []);
}));

test('issues: only a badge in the bar, a sheet of at most 25 percent with a close button when tapped, never in Walk', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  assert.equal(await p.evaluate(rectOf('.pw-issues-btn')).then((r) => r.hidden), true, 'no badge without issues');
  const res = await loadPlan(p);
  assert.equal(res.warnings, 2);
  const badge = await p.evaluate(`(() => { const b = document.querySelector('.pw-issues-btn'); const r = b.getBoundingClientRect(); return { text: b.textContent, w: r.width, h: r.height, label: b.getAttribute('aria-label') }; })()`);
  assert.equal(badge.text, '⚠ 2');
  assert.equal(badge.label, 'Issues: 2');
  assert.ok(badge.w >= 44 && badge.h >= 44, `badge ${badge.w} x ${badge.h}`);
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), true, 'the panel is not permanent');
  await p.tap('.pw-issues-btn');
  const sheet = await p.evaluate(`(() => { const r = document.querySelector('.pw-issues').getBoundingClientRect(); const m = document.querySelector('.pw-modebar').getBoundingClientRect();
    return { hPct: r.height / innerHeight * 100, bottom: r.bottom, modeTop: m.top, scroll: getComputedStyle(document.querySelector('.pw-issues')).overflowY }; })()`);
  assert.ok(sheet.hPct > 0 && sheet.hPct <= 25, `the issues sheet takes ${sheet.hPct.toFixed(1)} percent`);
  say('portrait issues sheet height percent / smallest tap target px', [Math.round(sheet.hPct * 10) / 10, await p.evaluate(minTarget('.pw-issues'))]);
  assert.equal(sheet.bottom, sheet.modeTop, 'it sits on the mode bar');
  assert.equal(sheet.scroll, 'auto');
  assert.deepEqual(await p.evaluate(smallIn('.pw-issues')), []);
  await shot(p, 'portrait-en-issues.jpg');
  await p.tap('.pw-issues-close');
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), true, 'the close button closes');
  await p.tap('.pw-issues-btn');
  await p.tap({ x: 195, y: 100 });
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), true, 'a tap outside closes');
  await p.tap('.pw-issues-btn');
  await p.evaluate('window.planwalk.setMode("walk")');
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), true, 'never a panel in Walk');
  assert.equal(await p.evaluate(rectOf('.pw-issues-btn')).then((r) => r.hidden), false, 'the badge stays');
}));

test('framing: the first dollhouse view, Orbit, Top and the PNG export keep the whole model 4 percent inside the free area, portrait and landscape', { skip, timeout: 120000 }, async () => {
  const cases = [['portrait', PORTRAIT], ['landscape', LANDSCAPE], ['desktop', { width: 1440, height: 900, dpr: 1, mobile: false }]];
  for (const [name, opts] of cases) {
    const p = await openPhone(page, opts);
    try {
      // the bundled example under the first-visit card, then a two level plan
      for (const label of ['example', 'duplex']) {
        if (label === 'duplex') { await loadPlan(p); await p.settle(); }
        for (const mode of ['dollhouse', 'orbit', 'top']) {
          await p.evaluate(`window.planwalk.setMode(${JSON.stringify(mode)}); window.planwalk.advanceTime(200)`);
          const f = await p.evaluate('window.planwalk.framing()');
          const bar = await p.evaluate(rectOf('.pw-bar'));
          assert.ok(f.free.top >= bar.b, `${name} ${label} ${mode}: the free area starts under the bar`);
          assert.ok(margins(f.margins) >= MARGIN, `${name} ${label} ${mode}: margins ${JSON.stringify(f.margins)}`);
          say(`framing ${name} ${label} ${mode} smallest margin of the free area (percent)`, Math.round(margins(f.margins) * 1000) / 10);
        }
        await p.evaluate('window.planwalk.setMode("dollhouse")');
        for (const [w, h] of [[1170, 1992], [1600, 900], [800, 800]]) {
          const f = await p.evaluate(`window.planwalk.framing({ fit: true, width: ${w}, height: ${h} })`);
          assert.ok(margins(f.margins) >= MARGIN, `${name} ${label} export ${w}x${h}: margins ${JSON.stringify(f.margins)}`);
          say(`PNG export ${name} ${label} ${w}x${h} smallest margin (percent)`, Math.round(margins(f.margins) * 1000) / 10);
        }
        await p.evaluate('window.planwalk.setMode("top")');
        const ft = await p.evaluate('window.planwalk.framing({ fit: true, width: 1170, height: 1992 })');
        assert.ok(margins(ft.margins) >= MARGIN, `${name} ${label} Top export: ${JSON.stringify(ft.margins)}`);
        await p.evaluate('window.planwalk.setMode("dollhouse")');
        const url = await p.evaluate('window.planwalk.screenshot({ fit: true, width: 600, height: 900 })');
        assert.match(url, /^data:image\/png;base64,.{2000,}/);
      }
      if (name === 'portrait') await shot(p, 'portrait-en-duplex.jpg');
      if (name === 'landscape') await shot(p, 'landscape-en-duplex.jpg');
      if (name === 'desktop') await shot(p, 'desktop-en-duplex.jpg');
    } finally { await p.close(); }
  }
});

test('framing follows the window: a turn of the phone frames again until the person moves the camera', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.resize(750, 340);
  assert.ok(margins((await p.evaluate('window.planwalk.framing()')).margins) >= MARGIN, 'landscape after the turn');
  await p.resize(390, 664);
  assert.ok(margins((await p.evaluate('window.planwalk.framing()')).margins) >= MARGIN, 'portrait again');
  await p.evaluate('window.planwalk.rotateView(40)');
  const before = JSON.stringify(await p.evaluate('window.planwalk.state().camera'));
  await p.resize(750, 340);
  assert.notEqual(JSON.stringify(await p.evaluate('window.planwalk.state().camera')), '', 'still has a camera');
  assert.equal(before.includes('NaN'), false);
}));

test('the first-visit card is one line on a phone, stacks above the bottom bar, and expands on a tap; Polish text with ?lang=pl', { skip, timeout: 90000 }, async () => {
  const a = await openPhone(page, PORTRAIT);
  try {
    const line = await a.evaluate(`(() => { const c = document.querySelector('.pw-visit'), r = c.getBoundingClientRect(), m = document.querySelector('.pw-modebar').getBoundingClientRect();
      return { cls: c.className, text: c.textContent, h: r.height, bottom: r.bottom, modeTop: m.top, hidden: c.hidden }; })()`);
    assert.equal(line.hidden, false);
    assert.match(line.cls, /pw-visit-line/);
    assert.equal(line.text, 'This is an example · How to add yours?×');
    assert.ok(line.h >= 44 && line.h <= 60, `one line is ${line.h} px high`);
    assert.equal(line.bottom, line.modeTop, 'it stacks above the bottom bar');
    assert.deepEqual(await a.evaluate(smallIn('.pw-visit')), []);
    await a.tap('.pw-visit-open');
    const full = await a.evaluate(`(() => { const c = document.querySelector('.pw-visit'), r = c.getBoundingClientRect(), m = document.querySelector('.pw-modebar').getBoundingClientRect(), b = document.querySelector('.pw-bar').getBoundingClientRect();
      return { cls: c.className, steps: c.querySelectorAll('ol li').length, bottom: r.bottom, modeTop: m.top, top: r.top, barBottom: b.bottom }; })()`);
    assert.equal(full.cls, 'pw-visit');
    assert.equal(full.steps, 3);
    assert.equal(full.bottom, full.modeTop);
    assert.ok(full.top > full.barBottom, 'it does not reach the top bar');
    assert.deepEqual(await a.evaluate(smallIn('.pw-visit')), []);
    await shot(a, 'portrait-en-card-open.jpg');
  } finally { await a.close(); }
  const b = await openPhone(page, { ...PORTRAIT, search: '?lang=pl' });
  try {
    assert.equal(await b.evaluate(`document.querySelector('.pw-visit').textContent`), 'To jest przykład · Jak dodać swój rzut?×');
    assert.equal(await b.evaluate(`document.querySelector('.pw-menu-btn').textContent`), 'Menu');
    await shot(b, 'portrait-pl-start.jpg');
    await b.tap('.pw-menu-btn');
    await shot(b, 'portrait-pl-menu.jpg');
    assert.deepEqual(await b.evaluate(smallIn('.pw-menu')), []);
    assert.equal(await b.evaluate(`document.querySelector('.pw-sheet-x').getAttribute('aria-label')`), 'Zamknij');
  } finally { await b.close(); }
});

test('Walk on a touch screen: translucent zones and a one line hint for 4 seconds, clear of the minimap, which no longer takes touches', { skip, timeout: 90000 }, withPhone(PORTRAIT, async (p) => {
  await loadPlan(p);
  await p.tap('.pw-modebar button:nth-child(4)');
  const w = await p.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s), b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, hidden: e.hidden }; };
    const hint = document.querySelector('.pw-touchhint'), mini = document.querySelector('.pw-mini');
    return { mode: window.planwalk.state().mode, zones: r('.pw-walkzones'), zoneText: [...document.querySelectorAll('.pw-walkzones div')].map((d) => d.textContent), hint: r('.pw-touchhint'), hintText: hint.textContent,
      hintH: hint.getBoundingClientRect().height, hintNowrap: getComputedStyle(hint).whiteSpace, hintCut: hint.scrollWidth > hint.clientWidth, mini: r('.pw-mini'), miniEvents: getComputedStyle(mini).pointerEvents, bar: r('.pw-bar'), oldHint: document.querySelector('.pw-hint').hidden,
      zoneEvents: getComputedStyle(document.querySelector('.pw-walkzones')).pointerEvents }; })()`);
  assert.equal(w.mode, 'walk');
  assert.equal(w.zones.hidden, false);
  assert.deepEqual(w.zoneText, ['Walk', 'Look around']);
  assert.equal(w.hintText, 'Drag the left half to walk, the right half to look');
  const overlap = !(w.hint.r <= w.mini.l || w.hint.l >= w.mini.r || w.hint.b <= w.mini.t || w.hint.t >= w.mini.b);
  assert.equal(overlap, false, `hint ${JSON.stringify(w.hint)} against minimap ${JSON.stringify(w.mini)}`);
  assert.ok(w.mini.t >= w.bar.b, 'the minimap sits under the top bar');
  assert.equal(w.miniEvents, 'none');
  assert.equal(w.zoneEvents, 'none');
  assert.equal(w.oldHint, true, 'the mouse hint is replaced by the touch hint');
  assert.equal(w.hintNowrap, 'nowrap');
  assert.equal(w.hintCut, false, 'the hint is not cut off');
  assert.ok(w.hintH < 40, `the hint is ${w.hintH} px high, one line`);
  await shot(p, 'portrait-en-walk.jpg');
  await p.settle(4300);
  const gone = await p.evaluate(`[document.querySelector('.pw-walkzones').hidden, document.querySelector('.pw-touchhint').hidden]`);
  assert.deepEqual(gone, [true, true], 'the help goes away after 4 seconds');
  // the modes bar still works in Walk
  await p.tap('.pw-modebar button:nth-child(1)');
  assert.equal(await p.evaluate('window.planwalk.state().mode'), 'dollhouse');
}));

test('phone on its side: one top bar with brand, modes and Menu, no bottom bar, 44 px targets, Polish Menu fits', { skip, timeout: 90000 }, async () => {
  const a = await openPhone(page, LANDSCAPE);
  try {
    await loadPlan(a);
    const info = await a.evaluate(`(() => { const app = document.getElementById('pw-app'), bar = document.querySelector('.pw-bar'), br = bar.getBoundingClientRect();
      const kids = [...bar.children].filter((c) => c.getBoundingClientRect().width > 0), centres = kids.map((c) => { const r = c.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
      return { classes: app.className, h: br.height, oneRow: Math.max(...centres) - Math.min(...centres) < 6, modesInBar: bar.querySelectorAll('.pw-seg button').length, menu: !!bar.querySelector('.pw-menu-btn'),
        modebar: getComputedStyle(document.querySelector('.pw-modebar')).display, brand: !!bar.querySelector('.pw-brand'), vh: innerHeight }; })()`);
    assert.match(info.classes, /pw-compact/);
    assert.match(info.classes, /pw-landscape/);
    assert.ok(info.h <= 56, `bar ${info.h} px`);
    say('landscape 750x340 top bar height px / smallest tap target px', [info.h, await a.evaluate(minTarget('.pw-bar'))]);
    assert.equal(info.oneRow, true);
    assert.equal(info.modesInBar, 4);
    assert.equal(info.menu, true);
    assert.equal(info.brand, true);
    assert.equal(info.modebar, 'none', 'no bottom bar');
    assert.deepEqual(await a.evaluate(smallIn('.pw-bar')), []);
    assert.equal(await a.evaluate(noScroll), true);
    await shot(a, 'landscape-en-start.jpg');
    await a.tap('.pw-menu-btn');
    const m = await a.evaluate(rectOf('.pw-menu'));
    assert.ok(m.h <= 340 * 0.95 && m.h > 0, `landscape Menu ${m.h} px of 340`);
    say('landscape Menu sheet height percent / smallest tap target px', [Math.round((m.h / 340) * 1000) / 10, await a.evaluate(minTarget('.pw-menu'))]);
    assert.deepEqual(await a.evaluate(smallIn('.pw-menu')), []);
    await shot(a, 'landscape-en-menu.jpg');
  } finally { await a.close(); }
  const b = await openPhone(page, { ...LANDSCAPE, search: '?lang=pl' });
  try {
    await loadPlan(b);
    await b.tap('.pw-menu-btn');
    assert.equal(await b.evaluate(noScroll), true);
    await shot(b, 'landscape-pl-menu.jpg');
  } finally { await b.close(); }
});

test('desktop keeps its toolbar; the issues panel gets a close button and a badge to bring it back', { skip, timeout: 90000 }, withPhone({ width: 1440, height: 900, dpr: 1, mobile: false }, async (p) => {
  const d = await p.evaluate(`(() => { const app = document.getElementById('pw-app'), bar = document.querySelector('.pw-bar');
    return { classes: app.className, selects: bar.querySelectorAll('select').length, help: [...bar.querySelectorAll('button')].some((b) => b.textContent === 'Help'), menu: !!document.querySelector('.pw-menu-btn') && bar.contains(document.querySelector('.pw-menu-btn')),
      modebar: getComputedStyle(document.querySelector('.pw-modebar')).display, h: bar.getBoundingClientRect().height }; })()`);
  assert.doesNotMatch(d.classes, /pw-compact/);
  assert.ok(d.selects >= 1 && d.help);
  assert.equal(d.menu, false);
  assert.equal(d.modebar, 'none');
  await loadPlan(p);
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), false, 'the panel is open on a desktop');
  await shot(p, 'desktop-en-issues.jpg');
  const x = await p.evaluate(rectOf('.pw-issues-close'));
  assert.ok(x.w > 0);
  await p.tap('.pw-issues-close');
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), true);
  assert.equal(await p.evaluate(rectOf('.pw-issues-btn')).then((r) => r.hidden), false);
  await p.tap('.pw-issues-btn');
  assert.equal(await p.evaluate(rectOf('.pw-issues')).then((r) => r.hidden), false, 'the badge brings the panel back');
  // narrowing the window to phone width moves the controls into the Menu, widening brings them back
  await p.resize(500, 800);
  assert.equal(await p.evaluate(`document.getElementById('pw-app').classList.contains('pw-compact')`), true);
  assert.equal(await p.evaluate(`document.querySelector('.pw-bar').querySelectorAll('select').length`), 0);
  assert.equal(await p.evaluate(`document.querySelector('.pw-menu-body').querySelectorAll('select').length > 0`), true);
  await p.resize(1440, 900);
  assert.equal(await p.evaluate(`document.getElementById('pw-app').classList.contains('pw-compact')`), false);
  assert.equal(await p.evaluate(`[...document.querySelector('.pw-bar').querySelectorAll('button')].some((b) => b.textContent === 'Help')`), true);
  assert.equal(await p.evaluate(`document.querySelector('.pw-menu-body').children.length`), 0);
}));

test('the plan name has at least 4.5:1 contrast on the bar, on a phone and on a desktop', { skip, timeout: 90000 }, async () => {
  for (const opts of [PORTRAIT, { width: 1440, height: 900, dpr: 1, mobile: false }]) {
    const p = await openPhone(page, opts);
    try {
      const c = await p.evaluate(`(() => { const n = document.querySelector('.pw-name'); const rgb = (s) => s.match(/[\\d.]+/g).map(Number); const bar = getComputedStyle(document.querySelector('.pw-bar')).backgroundColor;
        return { fg: rgb(getComputedStyle(n).color), bg: rgb(bar), text: n.textContent }; })()`);
      assert.ok(c.text.length > 0);
      // the bar is white at 86 percent over the pale sky: compose it over the darkest part of the page background
      const a = c.bg[3] ?? 1, under = [223, 230, 238];
      const bg = [0, 1, 2].map((i) => Math.round(c.bg[i] * a + under[i] * (1 - a)));
      assert.ok(contrast(c.fg.slice(0, 3), bg) >= 4.5, `plan name contrast ${contrast(c.fg.slice(0, 3), bg).toFixed(2)}`);
    } finally { await p.close(); }
  }
});

test('dialogs on a phone: a 44 px cross in the top right corner, a tap on the dimmed page closes, the box scrolls inside itself (375x553 and 844x390)', { skip, timeout: 120000 }, async () => {
  for (const [name, opts] of [['small portrait', { width: 375, height: 553, dpr: 3 }], ['landscape', { width: 844, height: 390, dpr: 3 }]]) {
    const p = await openPhone(page, opts);
    try {
      await loadPlan(p);
      const open = async (label) => {
        await p.tap('.pw-menu-btn');
        const at = await p.evaluate(`(() => { const b = [...document.querySelectorAll('.pw-menu-body button')].find((x) => x.textContent === ${JSON.stringify(label)}); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await p.tap(at);
      };
      for (const [label, sel] of [['Help', 'dialog.pw-help[open]'], ['About', 'dialog.pw-about[open]'], ['Paste JSON', 'dialog.pw-dlg[open]']]) {
        await open(label);
        const d = await p.evaluate(`(() => { const dlg = document.querySelector(${JSON.stringify(sel)}); if (!dlg) return null; const r = dlg.getBoundingClientRect(), x = dlg.querySelector('.pw-dlg-x').getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, xw: x.width, xh: x.height, xTop: x.top - r.top, xRight: r.right - x.right, overflow: getComputedStyle(dlg).overflowY, scroll: dlg.scrollHeight > dlg.clientHeight,
            active: document.activeElement && document.activeElement.tagName }; })()`);
        assert.ok(d, `${label} opens (${name})`);
        assert.ok(d.xw >= 44 && d.xh >= 44, `${label} cross ${d.xw} x ${d.xh} (${name})`);
        assert.ok(d.xTop >= 0 && d.xTop < 20 && d.xRight >= 0 && d.xRight < 20, `${label} cross sits in the top right corner: ${d.xTop}, ${d.xRight} (${name})`);
        assert.ok(d.top >= 0 && d.bottom <= d.vh, `${label} fits the ${name} screen: ${d.top} to ${d.bottom} of ${d.vh}`);
        assert.equal(d.overflow, 'auto');
        if (label === 'Paste JSON') assert.notEqual(d.active, 'TEXTAREA', 'no focus in the text box, so no keyboard on opening');
        assert.deepEqual(await p.evaluate(smallIn(sel)), [], `${label} targets (${name})`);
        if (label === 'Help') await shot(p, name === 'landscape' ? 'landscape-en-help.jpg' : 'small-en-help.jpg');
        if (label === 'Paste JSON') await shot(p, name === 'landscape' ? 'landscape-en-paste.jpg' : 'small-en-paste.jpg');
        // the dimmed page closes it
        await p.tap({ x: d.vw - 3, y: d.vh - 3 });
        assert.equal(await p.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`), false, `${label} closes on a tap outside (${name})`);
        await open(label);
        await p.tap(`${sel} .pw-dlg-x`);
        assert.equal(await p.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`), false, `${label} closes with its cross (${name})`);
      }
    } finally { await p.close(); }
  }
});

test('the paste dialog fits a 390 x 390 viewport and its buttons stay above the lower half where a keyboard goes', { skip, timeout: 90000 }, withPhone({ width: 390, height: 390, dpr: 3 }, async (p) => {
  await p.evaluate(`window.planwalk.setMode('dollhouse')`);
  await p.tap('.pw-menu-btn');
  const at = await p.evaluate(`(() => { const r = [...document.querySelectorAll('.pw-menu-body button')].find((b) => b.textContent === 'Paste JSON').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await p.tap(at);
  const d = await p.evaluate(`(() => { const dlg = document.querySelector('dialog.pw-dlg[open]'), r = dlg.getBoundingClientRect(), b = [...dlg.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().height > 0 && x.textContent === 'Load')[0].getBoundingClientRect(); return { top: r.top, bottom: r.bottom, loadBottom: b.bottom, vh: innerHeight, font: parseFloat(getComputedStyle(dlg.querySelector('textarea')).fontSize) }; })()`);
  assert.ok(d.top >= 0 && d.bottom <= d.vh - 12, `the dialog is ${d.top} to ${d.bottom} of ${d.vh}`);
  assert.ok(d.loadBottom <= d.vh * 0.62, `the Load button ends at ${d.loadBottom} of ${d.vh}`);
  assert.ok(d.font >= 16);
}));

test('Open file: window.planwalk.openFile opens the paste dialog chooser; the card and the phone Menu offer it', { skip, timeout: 90000 }, async () => {
  const chooser = `HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__chooser = (window.__chooser || 0) + 1; };`;
  const a = await openPhone(page, { width: 1280, height: 800, dpr: 1, mobile: false, beforeLoad: chooser });
  try {
    assert.equal(await a.evaluate('typeof window.planwalk.openFile'), 'function');
    assert.equal(await a.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].some((b) => b.textContent === 'Open file')`), true, 'the card offers it');
    await a.evaluate(`[...document.querySelectorAll('.pw-visit-btns button')].find((b) => b.textContent === 'Open file').click()`);
    assert.equal(await a.evaluate('window.__chooser'), 1, 'the card button opens the file chooser');
    await a.evaluate('window.planwalk.openFile()');
    assert.equal(await a.evaluate('window.__chooser'), 2, 'so does the API call');
  } finally { await a.close(); }
  const b = await openPhone(page, { ...PORTRAIT, beforeLoad: chooser });
  try {
    await b.tap('.pw-menu-btn');
    const at = await b.evaluate(`(() => { const r = [...document.querySelectorAll('.pw-menu-body button')].find((x) => x.textContent === 'Open file').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await b.tap(at);
    assert.equal(await b.evaluate('window.__chooser'), 1, 'the Menu button opens the file chooser');
    assert.equal(await b.evaluate(rectOf('.pw-menu')).then((r) => r.hidden), true, 'and the Menu gets out of the way');
  } finally { await b.close(); }
});
