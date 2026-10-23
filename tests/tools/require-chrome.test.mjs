// PLANWALK_REQUIRE_CHROME=1 turns "skip the Chrome tests" into a failure, so CI on Node 22 and newer cannot go green without them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeSkipReason } from '../helpers/chrome.mjs';

test('Chrome tests run when a browser and a global WebSocket exist', () => {
  assert.equal(chromeSkipReason({ chrome: '/usr/bin/chromium', webSocket: true, required: false }), false);
  assert.equal(chromeSkipReason({ chrome: '/usr/bin/chromium', webSocket: true, required: true }), false);
});

test('without them the tests skip with a reason, unless Chrome is required', () => {
  assert.match(chromeSkipReason({ chrome: undefined, webSocket: true, required: false }), /Chrome or Chromium not found/);
  assert.match(chromeSkipReason({ chrome: '/usr/bin/chromium', webSocket: false, required: false }), /Node 22 or newer/);
  assert.throws(() => chromeSkipReason({ chrome: undefined, webSocket: true, required: true }), /PLANWALK_REQUIRE_CHROME=1.*Chrome or Chromium not found/);
  assert.throws(() => chromeSkipReason({ chrome: '/usr/bin/chromium', webSocket: false, required: true }), /Node 22 or newer/);
});
