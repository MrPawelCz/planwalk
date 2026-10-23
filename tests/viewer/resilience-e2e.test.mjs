// End to end: an old browser (no Object.hasOwn, no canvas roundRect) still renders, a failure shows a card instead of a white
// page, and a browser without WebGL says what to do. Chrome runs through tools/chrome-lock.sh when other browsers may be running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { openPage, skip } from './chrome-page.mjs';
import { bare } from '../core/paste-variants.mjs';

const evidence = process.env.PW_EVIDENCE;
const crashText = (page) => page.evaluate('(() => { const c = document.getElementById("pw-crash"); return c ? c.textContent : null; })()');

test('a browser without Object.hasOwn and canvas roundRect still renders the plan with its labels', { skip, timeout: 90000 }, async () => {
  const page = await openPage({ beforeLoad: 'delete Object.hasOwn; delete CanvasRenderingContext2D.prototype.roundRect;' });
  try {
    assert.equal(await page.evaluate('typeof Object.hasOwn + " " + typeof CanvasRenderingContext2D.prototype.roundRect'), 'undefined undefined');
    const r = await page.evaluate(`window.planwalk.load(${JSON.stringify(bare)})`);
    assert.equal(r.ok, true);
    assert.ok((await page.evaluate('window.planwalk.state().counts.walls')) > 0);
    assert.equal(await page.evaluate('window.planwalk.state().labels'), true);
    await page.evaluate('window.planwalk.setMode("top"); window.planwalk.advanceTime(500)');
    assert.equal(await crashText(page), null, 'no failure card');
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
});

test('an exception while loading shows a card with Copy details instead of a white page', { skip, timeout: 90000 }, async () => {
  const page = await openPage({ query: '?lang=en' });
  try {
    await page.evaluate(`window.planwalk.load(${JSON.stringify(bare)})`);
    await page.evaluate('(() => { const o = { version: 1 }; Object.defineProperty(o, "levels", { enumerable: true, get() { throw new Error("boom from the test"); } }); window.planwalk.load(o); })()');
    assert.match(await crashText(page), /Something went wrong, so planwalk stopped/);
    assert.equal(await page.evaluate('window.planwalk.error'), 'boom from the test');
    assert.equal(await page.evaluate('[...document.querySelectorAll("#pw-crash button")].map((b) => b.textContent).join("|")'), 'Copy details|Reload');
    await page.evaluate('document.querySelector("#pw-crash button").click()');
    assert.equal(await page.evaluate('document.querySelector("#pw-crash button").textContent'), 'Copied');
    assert.deepEqual(page.pageErrors, [], 'the exception is handled, not uncaught');
    if (evidence) await page.screenshot(join(evidence, 'failure-card.jpg'));
  } finally {
    page.close();
  }
});

test('an exception while booting shows the card too', { skip, timeout: 90000 }, async () => {
  const page = await openPage({ query: '?lang=pl', beforeLoad: 'Object.defineProperty(window, "requestAnimationFrame", { configurable: true, get() { throw new Error("boot failure from the test"); } });' });
  try {
    assert.match(await crashText(page), /Coś poszło nie tak i planwalk się zatrzymał/);
    assert.equal(await page.evaluate('window.planwalk.error'), 'boot failure from the test');
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
});

test('without WebGL the card says what to do', { skip, timeout: 90000 }, async () => {
  const noGl = 'const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : get.call(this, type, ...rest); };';
  const page = await openPage({ query: '?lang=en', beforeLoad: noGl });
  try {
    const text = await page.evaluate('document.querySelector(".pw-card") ? document.querySelector(".pw-card").textContent : null');
    assert.match(text, /This browser cannot show 3D/);
    assert.match(text, /Safari, Chrome or Firefox/);
    assert.ok(await page.evaluate('typeof window.planwalk.error === "string"'));
    assert.deepEqual(page.pageErrors, []);
  } finally {
    page.close();
  }
  const pl = await openPage({ query: '?lang=pl', beforeLoad: noGl });
  try {
    assert.match(await pl.evaluate('document.querySelector(".pw-card").textContent'), /Ta przeglądarka nie pokaże grafiki 3D .*Safari, Chrome lub Firefoksie/);
  } finally {
    pl.close();
  }
});
