// followBar() puts a floating note under the toolbar's real bottom edge and keeps it there. Runs in plain Node with stand-ins for
// the elements, the window and ResizeObserver; the real page is checked by under-bar-e2e.test.mjs.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { followBar } from '../../viewer/src/under-bar.js';

const box = (bottom, height = 40) => ({ hidden: false, bottom, height, getBoundingClientRect() { return { bottom: this.bottom, height: this.height }; } });
const note = () => ({ props: {}, style: { setProperty(k, v) { note.last.props[k] = v; } } });
let listeners, observers;

beforeEach(() => {
  listeners = [];
  observers = [];
  globalThis.window = { addEventListener(type, fn) { listeners.push([type, fn]); } };
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.seen = []; observers.push(this); } observe(e) { this.seen.push(e); } };
});
afterEach(() => { delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; });

const make = () => { const el = note(); note.last = el; return el; };

test('the note sits 8 px under the toolbar and follows it when the toolbar grows or shrinks', () => {
  const bar = box(100.4), el = make();
  const place = followBar(el, () => bar);
  place();
  assert.equal(el.props.top, '108px');
  bar.bottom = 140.6; // the toolbar wrapped onto another row
  observers[0].cb();
  assert.equal(el.props.top, '149px', 'the observer places it again');
  bar.bottom = 60;
  listeners.find(([type]) => type === 'resize')[1]();
  assert.equal(el.props.top, '68px', 'so does a window resize');
});

test('nothing is measured or listened to before the first placement (the toolbar may not exist yet)', () => {
  const el = make();
  let asked = 0;
  followBar(el, () => { asked++; return null; });
  assert.equal(asked, 0);
  assert.deepEqual(listeners, []);
  assert.deepEqual(observers, []);
});

test('a note under another note skips it while it is hidden, still watches it, and stacks under it when it is shown', () => {
  const bar = box(60), banner = box(0, 0), el = make();
  banner.hidden = true;
  const place = followBar(el, () => bar, () => banner);
  place();
  assert.equal(el.props.top, '68px', 'a hidden banner takes no room');
  assert.deepEqual(observers[0].seen, [bar, banner], 'but it is watched');
  banner.hidden = false; banner.height = 120;
  observers[0].cb();
  assert.equal(el.props.top, '196px', 'bar 60 + 8 + banner 120 + 8');
  place();
  assert.deepEqual(observers[0].seen, [bar, banner], 'each element is watched once');
});

test('several notes above are stacked in order, and the top edge can go to a custom property', () => {
  const bar = box(60), a = box(0, 100), b = box(0, 40), el = make();
  followBar(el, () => bar, () => [a, null, b], '--pw-mini-top')();
  assert.equal(el.props['--pw-mini-top'], `${60 + 8 + 100 + 8 + 40 + 8}px`);
  assert.equal(el.props.top, undefined);
});

test('without a toolbar the note goes to 10 px; without ResizeObserver the resize event still works', () => {
  let el = make();
  followBar(el, () => null)();
  assert.equal(el.props.top, '10px');
  delete globalThis.ResizeObserver;
  const bar = box(50);
  el = make();
  const place = followBar(el, () => bar);
  place();
  assert.equal(el.props.top, '58px');
  assert.equal(listeners.filter(([type]) => type === 'resize').length, 2, 'both notes listen for the window resize');
});


test('a toolbar that was measured at a height it does not keep is measured again after the frame', () => {
  const frames = [];
  globalThis.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
  const bar = box(134.4), el = make();
  const place = followBar(el, () => bar);
  place();
  assert.equal(el.props.top, '142px', 'measured in the middle of a change of language');
  assert.equal(frames.length, 1, 'one more measurement waits for the frame');
  bar.bottom = 104.56; // all the labels are set now; the observer says nothing, the toolbar is as high as at its last notification
  frames.shift()();
  assert.equal(el.props.top, '113px', 'the note moved up with the toolbar');
  assert.equal(frames.length, 0, 'the measurement after the frame does not ask for another frame');
  place(); place(); place();
  assert.equal(frames.length, 1, 'a burst of calls asks for one frame');
});
