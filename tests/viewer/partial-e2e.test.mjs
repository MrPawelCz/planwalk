// End to end: two stored AI readings that used to be refused or listed as failures are pasted into the page. One has unknown
// properties (furniture inside rooms), the other has an opening of width 0. Both show a model; the second one with a banner that
// says what was skipped (also a stair whose level was skipped). A plan whose units are not understood is refused. Chrome runs
// through tools/chrome-lock.sh. Skips with a message when Chrome or dist is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, skip, root } from './chrome-page.mjs';

const RUN = 'eval/results/2026-10-23-claude-sonnet-5-5-v3/readings';
const reading = (code) => readFileSync(join(root, RUN, `${code}.plan.json`), 'utf8');
const PASTE = 'window.__paste = (text) => { const dt = new DataTransfer(); dt.setData("text", text); document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }';
const counts = (page) => page.evaluate('window.planwalk.state().counts');
const banner = (page) => page.evaluate('(() => { const b = document.querySelector(".pw-banner"); return b && !b.hidden ? b.textContent : null; })()');
const lines = (page) => page.evaluate('[...document.querySelectorAll(".pw-banner-detail div")].map((d) => d.textContent)');
const issues = (page) => page.evaluate('(() => { const p = document.querySelector(".pw-issues"); return p.hidden ? "" : p.textContent; })()');
const loadWith = (page, text) => page.evaluate(`window.planwalk.load(${JSON.stringify(text)})`);
const evidence = process.env.PW_EVIDENCE;

function expectedCounts(text, { openings = 0 } = {}) {
  const p = JSON.parse(text);
  const sum = (key) => p.levels.reduce((n, l) => n + (l[key] || []).length, 0);
  return { levels: p.levels.length, walls: sum('walls'), openings: sum('openings') - openings, rooms: sum('rooms'), furniture: sum('furniture'), stairs: sum('stairs') };
}

test('a reading with unknown properties opens with warnings; a reading with one bad opening opens without it and says so', { skip, timeout: 120000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    await page.evaluate(PASTE);

    // p6530: "furniture" inside four rooms. Used to be four errors, now four warnings and the whole plan.
    const stray = reading('p6530');
    const a = await loadWith(page, stray);
    assert.equal(a.ok, true, JSON.stringify(a.errors));
    assert.equal(a.partial, false);
    assert.equal(a.warnings.filter((w) => w.code === 'W116').length, 4);
    assert.deepEqual(await counts(page), expectedCounts(stray));
    assert.match(await banner(page), /^4 properties ignored: furniture\. planwalk does not use them\. Press "Copy fix request"/, 'a whole plan, but the banner says what was ignored');
    assert.deepEqual(await lines(page), [], 'one line, no list');
    assert.ok(await page.evaluate('[...document.querySelectorAll(".pw-banner button")].some((b) => b.textContent === "Copy fix request")'), 'a fix request can be copied');
    await page.evaluate('window.planwalk.setLang("pl")');
    assert.match(await banner(page), /^Zignorowano 4 nieznane właściwości: furniture\. planwalk ich nie używa\./);
    if (evidence) await page.screenshot(join(evidence, 'ignored-p6530-pl.jpg'));
    await page.evaluate('window.planwalk.setLang("en")');
    assert.match(await issues(page), /W116/, 'the warnings are listed in the issues panel');

    // p6b7c: an opening of width 0 on the upper floor.
    const zero = reading('p6b7c');
    const full = expectedCounts(zero);
    const b = await loadWith(page, zero);
    assert.equal(b.ok, false);
    assert.equal(b.partial, true);
    assert.equal(b.skipped.length, 1);
    assert.deepEqual(await counts(page), expectedCounts(zero, { openings: 1 }), 'the model is the plan without that opening');
    assert.equal((await counts(page)).walls, full.walls, 'every wall is there');
    assert.match(await banner(page), /^1 element skipped\. The rest of the plan is shown\./);
    assert.deepEqual(await lines(page), ['opening "p9" (levels[1].openings[8]): width is 0 but must be greater than 0']);
    assert.match(await issues(page), /E002/, 'the issues panel still lists the error');
    assert.ok(await page.evaluate('[...document.querySelectorAll(".pw-banner button")].some((b) => b.textContent === "Copy fix request")'), 'a fix request can be copied');
    assert.equal(await page.evaluate('document.querySelector(".pw-card").hidden'), true, 'the empty card is gone');
    assert.equal(await page.evaluate('window.planwalk.state().mode'), 'dollhouse');
    if (evidence) await page.screenshot(join(evidence, 'partial-p6b7c-en.jpg'));

    // The banner follows the language.
    await page.evaluate('window.planwalk.setLang("pl")');
    assert.match(await banner(page), /^Pominięto 1 element, reszta planu jest widoczna\./);
    assert.deepEqual(await lines(page), ['otwór "p9" (levels[1].openings[8]): width is 0 but must be greater than 0']);
    assert.ok(await page.evaluate('document.querySelector(".pw-banner").getBoundingClientRect().top >= document.querySelector(".pw-bar").getBoundingClientRect().bottom - 1'), 'the banner stays below the toolbar when the toolbar wraps differently');
    if (evidence) await page.screenshot(join(evidence, 'partial-p6b7c-pl.jpg'));
    await page.evaluate('window.planwalk.setLang("en")');

    // A plan with several bad elements: a skipped wall takes its openings with it, the list is cut at ten with a count.
    const many = JSON.parse(zero);
    const upper = many.levels[1];
    upper.walls[0].to = 'north';
    for (let i = 0; i < 12; i++) upper.furniture.push({ id: `bad${i}`, type: 'sofa', center: 'here' });
    const c = await loadWith(page, JSON.stringify(many));
    assert.equal(c.partial, true);
    const attached = zero.includes('"wall": "') ? upper.openings.filter((o) => o.wall === upper.walls[0].id).length : 0;
    assert.equal(c.skipped.length, 1 + attached + 1 + 12, 'a wall, its openings, the zero width opening and twelve items');
    const shown = await lines(page);
    assert.equal(shown.length, 11, 'ten lines and the count of the rest');
    assert.match(shown[10], /^and \d+ more$/);
    assert.match(await banner(page), new RegExp(`^${c.skipped.length} elements skipped\\.`));
    assert.ok(shown.some((s) => /its wall was skipped/.test(s)) || attached === 0);

    // Nothing usable left: the model on screen stays, as before.
    const keep = await counts(page);
    const none = JSON.parse(zero);
    none.levels.forEach((l) => l.walls.forEach((w) => { w.from = 'x'; }));
    const d = await loadWith(page, JSON.stringify(none));
    assert.equal(d.ok, false);
    assert.equal(d.partial, false);
    assert.deepEqual(await counts(page), keep, 'the previous model is kept');
    assert.match(await banner(page), /cannot build a model/);

    // A stair that leads to a level that was skipped goes with it, and is counted and named in the banner.
    const upperGone = JSON.parse(zero);
    upperGone.levels[1].height = -3;
    const e = await loadWith(page, JSON.stringify(upperGone));
    assert.equal(e.partial, true);
    assert.deepEqual(e.skipped.map((k) => [k.kind, k.id, k.reason]), [['stair', 's0', 'level-skipped'], ['level', 'L1', 'invalid']]);
    assert.equal((await counts(page)).levels, 1);
    assert.equal((await counts(page)).stairs, 0);
    assert.match(await banner(page), /^2 elements skipped\. The rest of the plan is shown\./);
    assert.deepEqual((await lines(page)).map((l) => l.replace(/:.*/, '')), ['stair "s0" (levels[0].stairs[0])', 'level "L1" (levels[1])']);
    assert.match((await lines(page))[0], /: the level it leads to was skipped$/);
    await page.evaluate('window.planwalk.setLang("pl")');
    assert.match(await banner(page), /^Pominięto 2 elementy, reszta planu jest widoczna\./);
    assert.equal((await lines(page))[0], 'schody "s0" (levels[0].stairs[0]): piętro, do którego prowadzą, zostało pominięte');
    if (evidence) await page.screenshot(join(evidence, 'partial-stair-level-pl.jpg'));
    await page.evaluate('window.planwalk.setLang("en")');

    // A unit that is not understood would show the flat at the wrong scale with nothing to say so: refused like a plan without walls.
    const onScreen = await counts(page);
    const feet = JSON.parse(zero);
    feet.units = 'feet';
    const g = await loadWith(page, JSON.stringify(feet));
    assert.equal(g.ok, false);
    assert.equal(g.partial, false);
    assert.deepEqual(g.skipped, []);
    assert.deepEqual(await counts(page), onScreen, 'the previous model is kept');
    assert.match(await banner(page), /cannot build a model/);
    assert.match((await lines(page))[0], /^E002 units: .*"feet"/, 'the banner names units');

    // The first thing on an empty page: a partial plan fills the page (no previous model to fall back on).
    const fresh = await openPage({ query: '?lang=en' });
    try {
      await fresh.evaluate(`window.planwalk.load(${JSON.stringify(zero)})`);
      assert.equal((await fresh.evaluate('window.planwalk.state().counts')).walls, full.walls);
      assert.match(await fresh.evaluate('document.querySelector(".pw-banner").textContent'), /^1 element skipped/);
      assert.deepEqual(fresh.pageErrors, []);
    } finally {
      fresh.close();
    }

    // The first thing on an empty page is a plan with an unknown unit: no model, and the card and the issues say why.
    const blank = await openPage({ query: '?lang=en' });
    try {
      const h = await blank.evaluate(`window.planwalk.load(${JSON.stringify(JSON.stringify(feet))})`);
      assert.equal(h.partial, false);
      assert.equal((await blank.evaluate('window.planwalk.state().counts')).walls, 0);
      assert.equal(await blank.evaluate('document.querySelector(".pw-card").hidden'), false);
      assert.match(await blank.evaluate('document.querySelector(".pw-card").textContent'), /could not be turned into a model/);
      assert.match(await issues(blank), /E002.*units/s);
      assert.deepEqual(blank.pageErrors, []);
    } finally {
      blank.close();
    }

    assert.deepEqual(page.pageErrors, [], 'no script error');
    assert.deepEqual(page.consoleErrors, [], 'no console error');
  } finally {
    page.close();
  }
});
