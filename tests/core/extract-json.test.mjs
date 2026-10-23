import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../../src/core/extract-json.js';
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';
import { analyzePlan, validatePlan } from '../../src/core/validate.js';

import { plan, bare, variants } from './paste-variants.mjs';

test('seven chat styles (and more) load to the same plan', () => {
  for (const [name, text] of Object.entries(variants)) {
    const r = extractJson(text);
    assert.equal(r.ok, true, `${name}: ${r.error}`);
    assert.deepEqual(r.value, plan, name);
    assert.ok(Array.isArray(r.repairs), name);
  }
});

test('bare JSON needs no repairs, every other style records what was done', () => {
  assert.deepEqual(extractJson(bare).repairs, []);
  assert.deepEqual(extractJson(`\ufeff${bare}`).repairs, [], 'a leading byte order mark is not worth a notice');
  const has = (name, phrase) => assert.ok(extractJson(variants[name]).repairs.includes(phrase), `${name}: ${extractJson(variants[name]).repairs}`);
  has('fenced block', 'took the code block');
  has('leading json line', 'dropped a leading json line');
  has('typographic quotes as delimiters', 'replaced typographic quotes with plain quotes');
  has('Polish quotes as delimiters', 'replaced typographic quotes with plain quotes');
  has('// comments', 'removed comments');
  has('/* */ comments', 'removed comments');
  has('trailing commas', 'removed trailing commas');
  has('byte order mark and zero width characters', 'removed invisible characters');
  has('non-breaking spaces as indentation', 'replaced non-breaking spaces');
  assert.ok(extractJson(`Here you go: ${bare} Enjoy!`).repairs.includes('ignored the text around the JSON object'));
});

test('typographic quotes inside a value survive, whatever the delimiters are', () => {
  const polish = extractJson('Oto plan: {"name": "Mieszkanie „Słoneczne” 2", "levels": []} Gotowe.');
  assert.equal(polish.ok, true);
  assert.equal(polish.value.name, 'Mieszkanie „Słoneczne” 2');
  const both = extractJson('{“name”: “Pokój „Salon” duży”, “levels”: []}');
  assert.equal(both.ok, true);
  assert.equal(both.value.name, 'Pokój „Salon” duży');
  const english = extractJson('{“name”: “The “big” room”, “levels”: [],}');
  assert.equal(english.value.name, 'The “big” room');
  const ascii = extractJson('{“name”: “Say "hi"”, “levels”: []}');
  assert.equal(ascii.value.name, 'Say "hi"');
});

test('braces, comment markers and commas inside strings are not touched', () => {
  const r = extractJson('Look: {"name": "a } { b // not a comment, ] /* nor this */", "note": "x,]", "levels": [], } thanks {');
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'a } { b // not a comment, ] /* nor this */');
  assert.equal(r.value.note, 'x,]');
  assert.equal(extractJson('{"a": "\\"}\\\\", "levels": [],}').value.a, '"}\\');
});

test('the block that looks like a plan wins over an earlier snippet', () => {
  const text = `The format is like \`\`\`json\n{"note": "example"}\n\`\`\`\nand here is yours:\n\`\`\`json\n${bare}\n\`\`\``;
  assert.deepEqual(extractJson(text).value, plan);
  assert.deepEqual(extractJson(`Use {braces} for objects. Your plan: ${bare}`).value, plan);
});

test('failures say what is wrong and never throw', () => {
  const none = extractJson('Sorry, I cannot read the image you sent.');
  assert.deepEqual([none.ok, none.kind], [false, 'no-object']);
  assert.match(none.error, /no JSON object/i);

  assert.equal(extractJson('Sorry, a lone { in the middle of a sentence is not a plan.').kind, 'no-object');
  assert.equal(extractJson('{ nope').kind, 'no-object');
  const cut = extractJson(bare.slice(0, 300));
  assert.deepEqual([cut.ok, cut.kind], [false, 'truncated']);
  assert.match(cut.error, /cut off/);

  const broken = extractJson('{"version": 1, "levels": [}');
  assert.deepEqual([broken.ok, broken.kind], [false, 'invalid']);
  assert.ok(broken.error.length > 5);

  assert.equal(extractJson('').kind, 'empty');
  assert.equal(extractJson('   \n ').kind, 'empty');
  for (const odd of [undefined, null, 42, {}, [], '{', '}', '"', '\\', '```', '```json\n```', '{"a"', '{“', '/*', '{ // x', '[{', '\u0000', 'x'.repeat(1000)]) {
    const r = extractJson(odd);
    assert.equal(typeof r.ok, 'boolean', String(odd));
    if (!r.ok) assert.ok(r.kind && r.error && Array.isArray(r.repairs), String(odd));
  }
  assert.equal(extractJson('{'.repeat(50000)).ok, false);
});

test('text over the size limit is refused before any work', () => {
  const big = 'x'.repeat(3 * 1024 * 1024);
  const t0 = Date.now();
  const r = extractJson(big);
  assert.deepEqual([r.ok, r.kind], [false, 'too-long']);
  assert.match(r.error, new RegExp(String(MAX_PLAN_CHARS)));
  assert.ok(Date.now() - t0 < 500);
  assert.equal(extractJson(`{"a":"${'y'.repeat(MAX_PLAN_CHARS)}"}`).kind, 'too-long');
});

test('a last line that is one long run of fence marks is read in linear time', () => {
  for (const mark of ['`', '~']) {
    for (const text of [mark.repeat(MAX_PLAN_CHARS), `{"a":1}\n${mark.repeat(MAX_PLAN_CHARS - 20)}`, `${mark.repeat(MAX_PLAN_CHARS - 10)}x`, `x\n${mark.repeat(100000)} json`, `\n  ${mark.repeat(50000)}\n`]) {
      const t0 = Date.now();
      const r = extractJson(text);
      assert.equal(typeof r.ok, 'boolean');
      assert.ok(Date.now() - t0 < 300, `took ${Date.now() - t0} ms for ${text.slice(0, 12)}`);
    }
  }
  // the pattern still finds an ordinary block, also one fenced with a longer run of marks
  assert.deepEqual(extractJson(`Here you go:\n\`\`\`\`json\n${bare}\n\`\`\`\`\nDone.`).value, plan);
  assert.deepEqual(extractJson(`Here you go:\n~~~~~\n${bare}\n~~~~~\nDone.`).value, plan);
});

test('a large text of the allowed size is read in reasonable time', () => {
  const filler = 'Some chat text with { stray braces } and more. '.repeat(20000);
  const t0 = Date.now();
  const r = extractJson(`${filler}\n\`\`\`json\n${bare}\n\`\`\`\n${filler}`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, plan);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test('the validator reads chat answers through extractJson and reports the repairs', () => {
  const r = analyzePlan(variants['fenced block with notes before and after']);
  assert.equal(r.ok, true);
  assert.ok(r.normalized);
  assert.deepEqual(r.repairs, ['took the code block']);
  assert.deepEqual(analyzePlan(bare).repairs, []);
  assert.equal(validatePlan(plan).ok, true);
});

test('validator E001 messages tell the person what to do', () => {
  const none = analyzePlan('Please attach the drawing again.');
  assert.equal(none.errors[0].code, 'E001');
  assert.match(none.errors[0].message, /no JSON object/i);
  assert.match(none.errors[0].fix, /JSON object/);
  const cut = analyzePlan(bare.slice(0, 400));
  assert.equal(cut.errors[0].code, 'E001');
  assert.match(cut.errors[0].fix, /whole plan again/);
  const nan = analyzePlan('{"version": 1, "levels": [{"id": "L0", "elevation": NaN}]}');
  assert.equal(nan.errors[0].code, 'E001');
  assert.match(nan.errors[0].fix, /NaN or Infinity/);
  assert.equal(analyzePlan('x'.repeat(MAX_PLAN_CHARS + 1)).errors[0].code, 'E001');
});
