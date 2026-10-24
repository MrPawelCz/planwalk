// Share links (viewer/src/share-link.js): the compressed #z= form and the older #plan= form round trip every plan, the short form is
// much shorter, and damaged or hostile links are refused quickly with a reason code instead of throwing. No browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { generatePlan } from '../../eval/gen/gen-plans.mjs';
import { validatePlan } from '../../src/core/validate.js';
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';
import { canCompress, canDecompress, decodeShort, encodeLong, encodeShort, fromBase64Url, parseHash, planText, toBase64Url } from '../../viewer/src/share-link.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const example = (name) => JSON.parse(readFileSync(`${root}examples/${name}.plan.json`, 'utf8'));
const EXAMPLES = ['flat-1', 'duplex-1'].map((n) => [n, example(n)]);
const GENERATED = Array.from({ length: 24 }, (_, i) => [`seed ${i + 1}`, generatePlan(i + 1).plan]);
const jsonCopy = (v) => JSON.parse(JSON.stringify(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Encodes with the short form and reads it back through the same steps the viewer takes.
async function roundTrip(plan) {
  const link = await encodeShort(plan);
  const parsed = parseHash(link);
  assert.equal(parsed.form, 'z');
  const got = await decodeShort(parsed.value);
  assert.equal(got.ok, true, `reason ${got.reason}`);
  return { link, text: got.text };
}

test('this Node can compress and decompress deflate-raw', () => {
  assert.equal(canCompress(), true);
  assert.equal(canDecompress(), true);
});

for (const [name, plan] of [...EXAMPLES, ...GENERATED]) {
  test(`${name}: the #z= link reads back as the same plan, and so does the #plan= link`, async () => {
    const { link, text } = await roundTrip(plan);
    assert.ok(link.startsWith('#z='));
    assert.deepEqual(JSON.parse(text), jsonCopy(plan));
    assert.equal(text, planText(plan), 'the text is the minified JSON, byte for byte');
    assert.ok(!/\s(?=[{"[\d-])/.test(text.replace(/"(?:[^"\\]|\\.)*"/g, '""')), 'no whitespace outside strings');
    const long = parseHash(encodeLong(plan));
    assert.equal(long.form, 'plan');
    assert.deepEqual(JSON.parse(Buffer.from(long.value, 'base64url').toString('utf8')), jsonCopy(plan));
    assert.equal(validatePlan(JSON.parse(text)).ok, validatePlan(plan).ok);
  });
}

test('the short link is at least 40 percent shorter than the long one for both examples', async () => {
  for (const [name, plan] of EXAMPLES) {
    const long = encodeLong(plan).length, short = (await encodeShort(plan)).length;
    assert.ok(short <= long * 0.6, `${name}: ${short} against ${long} characters`);
  }
});

test('a plan with Polish letters, emoji and escapes survives the short link', async () => {
  const plan = { ...example('flat-1'), name: 'Mieszkanie "Zażółć" \u{1F3E0} \\ tab\t', notes: 'Łódź, ąęśćżźńó' };
  const { text } = await roundTrip(plan);
  assert.deepEqual(JSON.parse(text), jsonCopy(plan));
});

test('a #z= link made by another tool (plain deflate-raw, no sum) is read, with or without a trailing full stop', async () => {
  const body = deflateRawSync(Buffer.from(JSON.stringify(example('flat-1')))).toString('base64url');
  for (const value of [body, `${body}.`]) {
    const got = await decodeShort(value);
    assert.equal(got.ok, true, `${value.slice(-4)}: ${got.reason}`);
    assert.deepEqual(JSON.parse(got.text), example('flat-1'));
  }
});

test('parseHash: #plan= is read as before, #z= takes its characters, anything else is not a link', () => {
  assert.deepEqual(parseHash('#plan=eyJhIjoxfQ'), { form: 'plan', value: 'eyJhIjoxfQ' });
  assert.deepEqual(parseHash('#plan=eyJhIjoxfQ&x=1'), { form: 'plan', value: 'eyJhIjoxfQ' });
  assert.deepEqual(parseHash('#z=AbC-_9.Zm9v'), { form: 'z', value: 'AbC-_9.Zm9v' });
  assert.deepEqual(parseHash('#z='), { form: 'z', value: '' });
  assert.equal(parseHash('#plan='), null, 'an empty #plan= was never a link');
  for (const h of ['', '#', '#top', '#zz=abc', '#Z=abc', 'plan=abc']) assert.equal(parseHash(h), null, h);
});

test('base64url: round trips every byte value, rejects what is not base64url', () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(fromBase64Url(toBase64Url(all)), all);
  assert.equal(toBase64Url(all), Buffer.from(all).toString('base64url'));
  for (const bad of ['a', 'abcde', 'ab cd', 'ab+/', 'ab=', 'ab%41', 'ąbcd', '<script>']) assert.equal(fromBase64Url(bad), null, bad);
  assert.deepEqual(fromBase64Url(''), new Uint8Array(0));
});

// ---- damaged and hostile links: refused quickly, with a reason, never thrown ----
async function refused(value, why, opts) {
  const t0 = Date.now();
  const got = await decodeShort(value, opts);
  const ms = Date.now() - t0;
  assert.equal(got.ok, false, `${why}: should be refused`);
  assert.equal(typeof got.reason, 'string', why);
  assert.ok(ms < 1000, `${why}: took ${ms} ms`);
  return got.reason;
}

test('an empty fragment and invalid base64url are refused', async () => {
  assert.equal(await refused('', 'empty'), 'empty');
  assert.equal(await refused('.', 'only a dot'), 'empty');
  assert.equal(await refused(undefined, 'undefined'), 'empty');
  assert.equal(await refused(null, 'null'), 'empty');
  for (const bad of ['a', '!!!!', 'ab cd', 'ab+/cd', 'ab%41cd', 'abcde', 'ąć']) assert.equal(await refused(bad, bad), 'base64', bad);
});

test('a flipped byte anywhere in the link is refused (data or sum), never read as another plan', async () => {
  for (const [name, plan] of EXAMPLES) {
    const link = await encodeShort(plan);
    const [data, sum] = link.slice(3).split('.');
    const bytes = fromBase64Url(data);
    for (let i = 0; i < bytes.length; i++) {
      for (const mask of [0xff, 0x01, 0x80]) {
        const flipped = bytes.slice();
        flipped[i] ^= mask;
        const got = await decodeShort(`${toBase64Url(flipped)}.${sum}`);
        assert.equal(got.ok, false, `${name}: byte ${i} ^ ${mask} was accepted`);
      }
    }
    const t0 = Date.now();
    for (let i = 0; i < sum.length; i++) {
      const other = sum[i] === 'A' ? 'B' : 'A';
      assert.equal((await decodeShort(`${data}.${sum.slice(0, i)}${other}${sum.slice(i + 1)}`)).ok, false, `${name}: sum char ${i}`);
    }
    assert.ok(Date.now() - t0 < 1000);
  }
});

test('a truncated link is refused wherever it is cut', async () => {
  for (const [name, plan] of EXAMPLES) {
    const link = (await encodeShort(plan)).slice(3);
    const whole = link.indexOf('.'); // a cut at the dot or just before it leaves the whole stream, which is a valid link without a sum
    const cuts = new Set([1, 2, 3, 4, 5, 10, 50, 100, link.length >> 1, whole - 1, whole + 2, whole + 3, link.length - 2, link.length - 1]);
    for (let n = 60; n < whole; n += 97) cuts.add(n);
    for (const n of cuts) {
      if (n <= 0 || n >= link.length) continue;
      assert.equal((await decodeShort(link.slice(0, n))).ok, false, `${name}: cut at ${n} of ${link.length}`);
    }
    assert.equal((await decodeShort(link.slice(0, whole))).ok, true, `${name}: the whole stream without its sum is a valid link`);
  }
});

test('a truncated stream without a sum is refused by the inflater alone', async () => {
  const raw = deflateRawSync(Buffer.from(JSON.stringify(example('duplex-1'))));
  for (const n of [1, 5, 40, raw.length >> 1, raw.length - 1]) {
    const reason = await refused(raw.subarray(0, n).toString('base64url'), `cut at ${n}`);
    assert.ok(['inflate', 'base64'].includes(reason), `${n}: ${reason}`);
  }
});

test('a few kilobytes that inflate past the limit are refused while streaming', async () => {
  for (const [what, size] of [['3 MB of one letter', 3_000_000], ['200 MB of zeros', 200_000_000]]) {
    const raw = deflateRawSync(Buffer.alloc(size, what.includes('zeros') ? 0 : 0x61), { level: 9 });
    assert.ok(raw.length < 400_000, `${what} compresses to ${raw.length} bytes`);
    const body = raw.toString('base64url');
    assert.equal(await refused(body, what), 'too-long');
    assert.equal(await refused(`${body}.`, `${what} with a full stop`), 'too-long');
  }
  const small = deflateRawSync(Buffer.alloc(MAX_PLAN_CHARS + 1, 0x20));
  assert.ok(small.length < 4000, `a ${small.length} byte bomb`);
  assert.equal(await refused(small.toString('base64url'), 'just over the limit'), 'too-long');
  const under = deflateRawSync(Buffer.from(`{"x":"${'a'.repeat(1000)}"}`));
  assert.equal((await decodeShort(under.toString('base64url'))).ok, true, 'a long but allowed text is fine');
  assert.equal(await refused(under.toString('base64url'), 'a lowered limit', { maxChars: 500 }), 'too-long');
});

test('text that is not UTF-8, and a fragment longer than any plan, are refused', async () => {
  assert.equal(await refused(deflateRawSync(Buffer.from([0x7b, 0xff, 0xfe, 0x7d])).toString('base64url'), 'not UTF-8'), 'inflate');
  assert.equal(await refused('A'.repeat(MAX_PLAN_CHARS + 4), 'a huge fragment'), 'too-long');
});

test('without DecompressionStream the link is reported as unsupported; without CompressionStream the long form is the only one', async () => {
  const link = await encodeShort(example('flat-1'));
  const { DecompressionStream: ds, CompressionStream: cs } = globalThis;
  try {
    delete globalThis.DecompressionStream;
    assert.equal(canDecompress(), false);
    assert.equal(await refused(link.slice(3), 'no DecompressionStream'), 'unsupported');
    delete globalThis.CompressionStream;
    assert.equal(canCompress(), false);
    assert.equal(await encodeShort(example('flat-1')), null);
    assert.ok(encodeLong(example('flat-1')).startsWith('#plan='));
  } finally {
    globalThis.DecompressionStream = ds;
    globalThis.CompressionStream = cs;
  }
  assert.equal(canDecompress(), true);
});

test('a stream that never delivers is cut off by the time limit', async () => {
  const { DecompressionStream: real } = globalThis;
  globalThis.DecompressionStream = class {
    constructor() {
      this.writable = new WritableStream({ write() {} });
      this.readable = new ReadableStream({ pull: () => new Promise(() => {}) });
    }
  };
  try {
    const t0 = Date.now();
    const got = await decodeShort('AAAA', { timeoutMs: 150 });
    assert.deepEqual(got, { ok: false, reason: 'timeout' });
    assert.ok(Date.now() - t0 < 1000);
  } finally {
    globalThis.DecompressionStream = real;
  }
  await sleep(0);
});

test('a stream that keeps delivering is stopped by the cap while it is read, not after all of it was inflated', async () => {
  // 1 MB of text per read, 64 MB at most (a stream that really never ended would eat the memory of a run without the cap).
  // The answer alone cannot tell the two apart, since the check after the loop gives the same one: count what was read.
  const { DecompressionStream: real } = globalThis;
  const megabyte = new Uint8Array(1 << 20).fill(0x61);
  let pulled = 0;
  globalThis.DecompressionStream = class {
    constructor() {
      this.writable = new WritableStream({ write() {} });
      this.readable = new ReadableStream({ pull(controller) { if (++pulled <= 64) controller.enqueue(megabyte); else controller.close(); } });
    }
  };
  try {
    const t0 = Date.now();
    const got = await decodeShort('AAAA');
    assert.deepEqual(got, { ok: false, reason: 'too-long' });
    assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
    assert.ok(pulled * (1 << 20) <= MAX_PLAN_CHARS + 3 * (1 << 20), `${pulled} MB were read before the cap stopped it`);
  } finally {
    globalThis.DecompressionStream = real;
  }
});
