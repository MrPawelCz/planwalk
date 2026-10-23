import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';
import { setLang } from '../../viewer/src/i18n.js';
import { downloadMessage, fetchPlanText, issueLines, loadMessage, severalPlansMessage, skippedLines, skippedMessage, strings } from '../../viewer/src/load-errors.js';

const slots = (s) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort(); // plural forms repeat a slot, so a set

test('every message exists in English and Polish, with the same placeholders and no long dashes', () => {
  assert.deepEqual(Object.keys(strings.pl).sort(), Object.keys(strings.en).sort());
  for (const key of Object.keys(strings.en)) {
    assert.ok(strings.en[key].length > 1 && strings.pl[key].length > 1, key);
    assert.deepEqual(slots(strings.pl[key]), slots(strings.en[key]), key);
    for (const lang of ['en', 'pl']) assert.ok(!/[\u2013\u2014]/.test(strings[lang][key]), `${lang}.${key} has a long dash`);
  }
});

test('failure kinds map to plain messages in the current language', () => {
  setLang('en');
  assert.match(loadMessage('no-object'), /does not contain a plan\. Paste the whole answer from the AI chat/);
  assert.match(loadMessage('truncated'), /stops before the end/);
  assert.match(loadMessage('invalid'), /mistake in the JSON/);
  assert.match(loadMessage('too-long'), /about 2 MB of text/);
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

test('issueLines: the first two errors, code and path included, each cut to 160 characters', () => {
  const errors = [
    { code: 'E005', path: 'levels[0].openings[3]', message: 'opening "d1" sits on wall "ghost", which does not exist', fix: 'x' },
    { code: 'E002', path: '', message: 'm'.repeat(400), fix: 'y' },
    { code: 'E009', path: 'z', message: 'third', fix: 'z' },
  ];
  const lines = issueLines(errors);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'E005 levels[0].openings[3]: opening "d1" sits on wall "ghost", which does not exist');
  assert.equal(lines[1].length, 160);
  assert.match(lines[1], /^E002: m+\.\.\.$/);
  assert.deepEqual(issueLines([]), []);
  assert.deepEqual(issueLines(undefined), []);
});

test('the invalid JSON message adds the decimal point hint only when the text has a decimal comma', () => {
  const comma = '{"version": 1, "levels": [{"id": "L0", "wall_thickness": 0,2, "height": 2,5}]}';
  const other = '{"version": 1, "levels": [}';
  setLang('en');
  assert.match(loadMessage('invalid', undefined, comma), /decimal point, not a comma \(2\.5, not 2,5\)/);
  assert.doesNotMatch(loadMessage('invalid', undefined, other), /decimal point/);
  assert.doesNotMatch(loadMessage('invalid'), /decimal point/);
  assert.doesNotMatch(loadMessage('invalid', undefined, '{"from": [1,2], "to": [3,4], "x": }'), /decimal point/, 'a list of two whole numbers is not a decimal comma');
  assert.doesNotMatch(loadMessage('truncated', undefined, comma), /decimal point/, 'only the syntax error kind gets the hint');
  assert.doesNotMatch(loadMessage('invalid', 'link', comma), /decimal point/);
  setLang('pl');
  assert.match(loadMessage('invalid', undefined, comma), /kropk[ąę], nie przecinek \(2\.5, a nie 2,5\)/);
  assert.match(loadMessage('too-long'), /około 2 MB tekstu/);
  assert.doesNotMatch(loadMessage('invalid', undefined, other), /kropk/);
  setLang('en');
});

const skip = (kind, id, path, why, reason = 'invalid') => ({ kind, id, path, why, reason });

test('skippedMessage: the count in the banner, with the plural forms of each language', () => {
  const list = (n) => Array.from({ length: n }, (_, i) => skip('wall', `w${i}`, `levels[0].walls[${i}]`, 'x'));
  setLang('en');
  assert.match(skippedMessage(list(1)), /^1 element skipped\. The rest of the plan is shown\. Press "Copy fix request" and paste it into the AI chat/);
  assert.match(skippedMessage(list(2)), /^2 elements skipped\. The rest of the plan is shown\./);
  assert.match(skippedMessage(list(12)), /^12 elements skipped\./);
  setLang('pl');
  const pl = (n) => skippedMessage(list(n)).split(',')[0];
  assert.equal(pl(1), 'Pominięto 1 element');
  assert.equal(pl(2), 'Pominięto 2 elementy');
  assert.equal(pl(4), 'Pominięto 4 elementy');
  assert.equal(pl(5), 'Pominięto 5 elementów');
  assert.equal(pl(12), 'Pominięto 12 elementów');
  assert.equal(pl(22), 'Pominięto 22 elementy');
  assert.equal(pl(25), 'Pominięto 25 elementów');
  assert.match(skippedMessage(list(3)), /reszta planu jest widoczna\. Kliknij „Kopiuj prośbę o poprawkę” i wklej ją do czatu z AI/);
  setLang('en');
});

test('skippedLines: what, which, where and why for the first ten, then how many more', () => {
  const items = [
    skip('opening', 'p9', 'levels[1].openings[8]', 'levels[1].openings[8].width is 0 but must be greater than 0'),
    skip('opening', 'front', 'levels[0].openings[2]', 'its wall was skipped', 'wall-skipped'),
    skip('wall', 'w3', 'levels[0].walls[2]', 'levels[0].walls[2].to must be a [x, y] pair of numbers but is the string "north"'),
    skip('level', 'L2', 'levels[2]', 'levels[2].height is -3 but must be greater than 0'),
    skip('furniture', undefined, 'levels[0].furniture[4]', 'it is not an object'),
  ];
  setLang('en');
  assert.deepEqual(skippedLines(items), [
    'opening "p9" (levels[1].openings[8]): width is 0 but must be greater than 0',
    'opening "front" (levels[0].openings[2]): its wall was skipped',
    'wall "w3" (levels[0].walls[2]): to must be a [x, y] pair of numbers but is the string "north"',
    'level "L2" (levels[2]): height is -3 but must be greater than 0',
    'furniture (levels[0].furniture[4]): it is not an object',
  ]);
  setLang('pl');
  const pl = skippedLines(items);
  assert.equal(pl[0], 'otwór "p9" (levels[1].openings[8]): width is 0 but must be greater than 0', 'the validator reason stays as written');
  assert.equal(pl[1], 'otwór "front" (levels[0].openings[2]): jego ściana została pominięta');
  assert.match(pl[2], /^ściana "w3"/);
  assert.match(pl[3], /^piętro "L2"/);
  assert.match(pl[4], /^mebel \(/);
  setLang('en');
  const many = Array.from({ length: 23 }, (_, i) => skip('room', `r${i}`, `levels[0].rooms[${i}]`, `levels[0].rooms[${i}] must be an object`));
  const lines = skippedLines(many);
  assert.equal(lines.length, 11);
  assert.equal(lines[9], 'room "r9" (levels[0].rooms[9]): must be an object');
  assert.equal(lines[10], 'and 13 more');
  setLang('pl');
  assert.equal(skippedLines(many)[10], 'i jeszcze 13');
  setLang('en');
  assert.equal(skippedLines(many, 3).length, 4);
  assert.deepEqual(skippedLines([]), []);
});

test('severalPlansMessage speaks only when extractJson took the last of several plans', () => {
  setLang('en');
  assert.match(severalPlansMessage(['took the code block', 'found 2 plans, loaded the last one']), /more than one plan.*loaded the last one/);
  assert.equal(severalPlansMessage(['took the code block']), null);
  assert.equal(severalPlansMessage([]), null);
  assert.equal(severalPlansMessage(undefined), null);
  setLang('pl');
  assert.match(severalPlansMessage(['found 3 plans, loaded the last one']), /więcej niż jeden plan.*ostatni/);
  setLang('en');
});

test('issueLines never cuts a surrogate pair in half', () => {
  const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  for (let k = 140; k <= 165; k++) {
    const [line] = issueLines([{ code: 'E002', path: '', message: `${'a'.repeat(k)}${'\u{1F600}'.repeat(6)}` }]);
    assert.doesNotMatch(line, lone, `message of ${k} letters then emoji: ${JSON.stringify(line.slice(-8))}`);
    assert.ok(line.length <= 160);
  }
});
