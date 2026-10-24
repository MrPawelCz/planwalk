// End to end in headless Chrome: the notes that float under the toolbar (the banner for a plan that was only partly read, and the
// "Loaded" line under it) always sit right under the toolbar's real bottom edge: at several window widths, in English and Polish, on a
// phone, and after the toolbar wraps onto more or fewer rows while they are up (a window resize, a phone turned on its side).
// Builds the page into a temporary folder first. Skips with a clear message when Chrome is missing. PLANWALK_SHOTS=dir keeps screenshots.
// Run it through tools/chrome-lock.sh when other browsers may be running.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPhone, skipReason } from './phone-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-under-bar-e2e-'));
const page = join(out, 'planwalk.html');
const skip = skipReason();
const shots = process.env.PLANWALK_SHOTS || '';
if (shots) mkdirSync(shots, { recursive: true });

// A stored reading with one opening of width 0: it opens without that opening, with a banner that says so (see partial-e2e).
const PARTIAL = readFileSync(join(root, 'eval/results/2026-10-23-claude-sonnet-5-5-v3/readings/p6b7c.plan.json'), 'utf8');
const HELPERS = 'window.__paste = (text) => { const dt = new DataTransfer(); dt.setData("text", text); document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }';
// The "Loaded" line fades after 5 s; a slow machine may need longer to measure, so this page keeps it up for two minutes.
const KEEP = '(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...rest) => st(f, ms === 5000 ? 120000 : ms, ...rest); })()';
const WIDTHS = [700, 960, 1100, 1280];
const HEIGHT = 540;

before(() => {
  if (skip) return;
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

const MEASURE = `(() => {
  const rect = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null; };
  const line = document.querySelector('.pw-loaded');
  return { bar: rect('.pw-bar'), banner: rect('.pw-banner'), modebar: rect('.pw-modebar'), loaded: line.classList.contains('on') && line.textContent ? rect('.pw-loaded') : null, wide: window.innerWidth };
})()`;

// Pastes the partial reading: the banner comes up and the "Loaded" line under it.
const paste = async (p) => {
  await p.evaluate(`window.__paste(${JSON.stringify(PARTIAL)})`);
  await p.settle();
};

// Both notes sit where they should now: the banner 8 px under the toolbar, the "Loaded" line 8 px under the banner.
async function sitsUnderBar(p, label) {
  const m = await p.evaluate(MEASURE);
  assert.ok(m.bar && m.banner, `${label}: the toolbar and the banner are on screen`);
  assert.ok(m.banner.top >= m.bar.bottom - 1, `${label}: the banner (top ${m.banner.top}) does not cover the toolbar (bottom ${m.bar.bottom})`);
  assert.ok(Math.abs(m.banner.top - (m.bar.bottom + 8)) <= 1.5, `${label}: the banner (top ${m.banner.top}) follows the toolbar (bottom ${m.bar.bottom})`);
  assert.ok(m.loaded, `${label}: the "Loaded" line is up`);
  assert.ok(m.loaded.top >= m.banner.bottom - 1, `${label}: the "Loaded" line (top ${m.loaded.top}) does not cover the banner (bottom ${m.banner.bottom})`);
  assert.ok(Math.abs(m.loaded.top - (m.banner.bottom + 8)) <= 1.5, `${label}: the "Loaded" line (top ${m.loaded.top}) follows the banner (bottom ${m.banner.bottom})`);
  if (m.modebar) assert.ok(m.loaded.bottom <= m.modebar.top, `${label}: the notes stay above the bottom mode bar`);
  return m;
}

for (const lang of ['en', 'pl']) {
  test(`desktop windows (${lang}): the banner and the "Loaded" line follow the toolbar when it wraps differently`, { skip, timeout: 240000 }, async () => {
    const p = await openPhone(page, { width: 1280, height: HEIGHT, dpr: 1, mobile: false, search: `?lang=${lang}`, beforeLoad: KEEP });
    try {
      await p.evaluate(HELPERS);
      // shown at each width in turn
      for (const w of [...WIDTHS].reverse()) {
        await p.resize(w, HEIGHT);
        await paste(p);
        await sitsUnderBar(p, `${lang} ${w} px, shown at that width`);
      }
      // already up while the window changes: wider windows unwrap the toolbar, narrower ones wrap it (700 px or less is the phone layout)
      await p.resize(1280, HEIGHT);
      await paste(p);
      await sitsUnderBar(p, `${lang} 1280 px, shown`);
      for (const w of [1100, 960, 700, 960, 1100, 1280]) {
        await p.resize(w, HEIGHT);
        await sitsUnderBar(p, `${lang} resized to ${w} px while the notes are up`);
      }
      // a change of language wraps the toolbar differently too
      await p.resize(960, HEIGHT);
      await p.evaluate(`window.planwalk.setLang(${JSON.stringify(lang === 'en' ? 'pl' : 'en')})`);
      await p.settle();
      await sitsUnderBar(p, `${lang} 960 px, after a change of language`);
      if (shots && lang === 'pl') { await p.evaluate('window.planwalk.setLang("pl")'); await p.resize(1280, HEIGHT); await p.resize(960, HEIGHT); await p.shot(join(shots, 'desktop-960-pl-after-resize.jpg')); }
      assert.deepEqual(p.issues, [], 'console stays clean');
    } finally { await p.close(); }
  });

  test(`phone (${lang}): the notes sit under the one row top bar and above the mode bar, also after turning the phone`, { skip, timeout: 240000 }, async () => {
    const p = await openPhone(page, { width: 390, height: 664, dpr: 2, search: `?lang=${lang}`, beforeLoad: KEEP });
    try {
      await p.evaluate(HELPERS);
      await paste(p);
      const m = await sitsUnderBar(p, `${lang} phone, portrait`);
      assert.ok(m.bar.bottom <= 64, `a one row top bar (bottom ${m.bar.bottom})`);
      // the banner holds its controls: they stay inside it and on the screen, their text fits, and none covers another
      const inside = await p.evaluate(`(() => {
        const b = document.querySelector('.pw-banner'), br = b.getBoundingClientRect();
        const kids = [...b.querySelectorAll('button')].filter((k) => !k.hidden).map((k) => ({ k, r: k.getBoundingClientRect() }));
        const name = ({ k }) => k.textContent;
        return { n: kids.length, out: kids.filter(({ r }) => r.left < br.left - 0.5 || r.right > br.right + 0.5 || r.top < br.top - 0.5 || r.bottom > br.bottom + 0.5).map(name), clipped: kids.filter(({ k }) => k.scrollWidth > k.clientWidth + 1).map(name),
          overlap: kids.some(({ r: a }, i) => kids.some(({ r: c }, j) => i < j && a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top)), onScreen: br.left >= 0 && br.right <= window.innerWidth };
      })()`);
      assert.equal(inside.n, 2, `${lang}: the banner has its two buttons`);
      assert.deepEqual(inside.out, [], `${lang}: no banner button sticks out of the banner`);
      assert.deepEqual(inside.clipped, [], `${lang}: no banner button text runs past its button`);
      assert.equal(inside.overlap, false, `${lang}: the banner buttons do not cover each other`);
      assert.equal(inside.onScreen, true, `${lang}: the banner fits the screen`);
      if (shots && lang === 'pl') await p.shot(join(shots, 'phone-390-pl.jpg'));
      // Walk mode brings the minimap under the top bar: it must not sit under the banner or the "Loaded" line
      await p.evaluate('window.planwalk.setMode("walk")');
      await p.settle();
      const walk = await p.evaluate(`(() => {
        const rect = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null; };
        const line = document.querySelector('.pw-loaded');
        return { mini: rect('.pw-mini'), banner: rect('.pw-banner'), loaded: line.classList.contains('on') && line.textContent ? rect('.pw-loaded') : null, bar: rect('.pw-bar'), modebar: rect('.pw-modebar') };
      })()`);
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert.ok(walk.mini && walk.banner && walk.loaded, `${lang}: walk mode shows the minimap, the banner and the "Loaded" line`);
      assert.equal(hit(walk.mini, walk.banner), false, `${lang}: the minimap (${JSON.stringify(walk.mini)}) is not under the banner (${JSON.stringify(walk.banner)})`);
      assert.equal(hit(walk.mini, walk.loaded), false, `${lang}: the minimap is not under the "Loaded" line (${JSON.stringify(walk.loaded)})`);
      assert.equal(hit(walk.mini, walk.bar), false, `${lang}: the minimap does not touch the top bar`);
      assert.ok(walk.mini.bottom <= walk.modebar.top, `${lang}: the minimap stays above the bottom mode bar`);
      if (shots && lang === 'pl') await p.shot(join(shots, 'phone-390-pl-walk.jpg'));
      await p.evaluate('window.planwalk.setMode("dollhouse")');
      await p.settle();
      await p.resize(750, 340);
      await sitsUnderBar(p, `${lang} phone, on its side`);
      await p.resize(390, 664);
      await sitsUnderBar(p, `${lang} phone, upright again`);
      assert.deepEqual(p.issues, [], 'console stays clean');
    } finally { await p.close(); }
  });
}
