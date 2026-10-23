import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';
import { setLang } from '../../viewer/src/i18n.js';
import { downloadMessage, fetchPlanText, loadMessage, strings } from '../../viewer/src/load-errors.js';

test('every message exists in English and Polish, with the same placeholders and no long dashes', () => {
  assert.deepEqual(Object.keys(strings.pl).sort(), Object.keys(strings.en).sort());
  for (const key of Object.keys(strings.en)) {
    assert.ok(strings.en[key].length > 1 && strings.pl[key].length > 1, key);
    assert.deepEqual(strings.pl[key].match(/\{\w+\}/g) ?? [], strings.en[key].match(/\{\w+\}/g) ?? [], key);
    for (const lang of ['en', 'pl']) assert.ok(!/[\u2013\u2014]/.test(strings[lang][key]), `${lang}.${key} has a long dash`);
  }
});

test('failure kinds map to plain messages in the current language', () => {
  setLang('en');
  assert.match(loadMessage('no-object'), /does not contain a plan\. Paste the whole answer from the AI chat/);
  assert.match(loadMessage('truncated'), /stops before the end/);
  assert.match(loadMessage('invalid'), /mistake in the JSON/);
  assert.match(loadMessage('too-long'), /2 MB/);
  assert.match(loadMessage('no-object', 'download'), /download worked, but the file is not a plan/);
  assert.match(loadMessage('invalid', 'link'), /damaged/);
  assert.match(downloadMessage({ kind: 'status', status: 404 }), /\(404\)/);
  assert.match(downloadMessage({ kind: 'network' }), /Could not download/);
  assert.match(downloadMessage({ kind: 'timeout' }), /10 seconds/);
  setLang('pl');
  assert.match(loadMessage('no-object'), /W tym tekście nie ma planu/);
  assert.match(downloadMessage({ kind: 'status', status: 500 }), /\(500\)/);
  setLang('en');
});

test('fetchPlanText: ok, error status, timeout, size cap and refused connection are told apart', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end('{"levels": []}'); }
    else if (req.url === '/missing') { res.writeHead(404); res.end('gone'); }
    else if (req.url === '/hang') { res.writeHead(200); res.write('{"a":'); /* never ends */ }
    else if (req.url === '/declared') { res.writeHead(200, { 'content-length': String(MAX_PLAN_CHARS * 5) }); res.end('x'); }
    else { res.writeHead(200); const chunk = 'x'.repeat(65536); let sent = 0; const pump = () => { while (sent < MAX_PLAN_CHARS * 2) { sent += chunk.length; if (!res.write(chunk)) { res.once('drain', pump); return; } } res.end(); }; pump(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await fetchPlanText(`${base}/ok`), { ok: true, text: '{"levels": []}' });
    assert.deepEqual(await fetchPlanText(`${base}/missing`), { ok: false, kind: 'status', status: 404 });
    const t0 = Date.now();
    assert.deepEqual(await fetchPlanText(`${base}/hang`, { timeoutMs: 300 }), { ok: false, kind: 'timeout' });
    assert.ok(Date.now() - t0 < 3000);
    assert.deepEqual(await fetchPlanText(`${base}/declared`), { ok: false, kind: 'too-long' });
    assert.deepEqual(await fetchPlanText(`${base}/stream`), { ok: false, kind: 'too-long' });
    let seen;
    await fetchPlanText(`${base}/ok`, { fetchFn: async (url, opts) => { seen = opts; return { ok: true, headers: new Headers(), body: null, text: async () => '{}' }; } });
    assert.equal(seen.credentials, 'omit');
    assert.equal(seen.referrerPolicy, 'no-referrer');
  } finally {
    server.closeAllConnections();
    server.close();
  }
  assert.deepEqual(await fetchPlanText('http://127.0.0.1:1/nothing-here'), { ok: false, kind: 'network' });
});
