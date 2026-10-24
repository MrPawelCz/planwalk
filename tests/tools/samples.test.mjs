// The sample drawings in docs/samples: exactly three PNG files and a README, each picture at most 150 KB and free of metadata
// chunks (text, exif, time, colour profile, physical size), and the picture that was read is the picture that is shipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = join(root, 'docs/samples');
const NAMES = ['sample-1.png', 'sample-2.png', 'sample-3.png'];
const MAX_BYTES = 150 * 1000;
const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ALLOWED = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']); // the pixels and nothing else

// The chunk types of a PNG in order; throws when the lengths do not add up.
function chunkTypes(buf) {
  assert.ok(buf.subarray(0, 8).equals(MAGIC), 'PNG signature');
  const types = [];
  let pos = 8;
  while (pos < buf.length) {
    assert.ok(pos + 12 <= buf.length, 'a chunk header fits in the file');
    const len = buf.readUInt32BE(pos);
    types.push(buf.toString('latin1', pos + 4, pos + 8));
    pos += 12 + len;
  }
  assert.equal(pos, buf.length, 'the chunks end exactly at the end of the file');
  return types;
}

test('docs/samples holds sample-1.png to sample-3.png and a README, nothing else', () => {
  assert.deepEqual(readdirSync(dir).sort(), ['README.md', ...NAMES]);
});

for (const name of NAMES) {
  test(`${name} is a PNG of at most 150 KB without metadata chunks`, () => {
    const file = join(dir, name);
    assert.ok(existsSync(file), `${name} exists`);
    assert.ok(statSync(file).size <= MAX_BYTES, `${name} is ${statSync(file).size} bytes`);
    const types = chunkTypes(readFileSync(file));
    assert.equal(types[0], 'IHDR');
    assert.equal(types[types.length - 1], 'IEND');
    assert.ok(types.includes('IDAT'));
    for (const t of types) assert.ok(ALLOWED.has(t), `${name} has a ${t} chunk`);
    for (const banned of ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME', 'iCCP', 'pHYs']) assert.ok(!types.includes(banned), `${name} has a ${banned} chunk`);
  });
}

test('the README of the samples says what they are: synthetic, CC0, picked because they read well, not a measure of quality, with a link to the benchmark', () => {
  const md = readFileSync(join(dir, 'README.md'), 'utf8');
  assert.match(md, /synthetic/i);
  assert.match(md, /CC0/);
  assert.match(md, /not a measure of quality/i);
  assert.match(md, /\]\(\.\.\/BENCHMARK\.md\)/, 'links docs/BENCHMARK.md');
  assert.match(md, /\]\(\.\.\/\.\.\/README\.md#benchmark[^)]*\)/, 'links the benchmark section of the README');
  const heading = readFileSync(join(root, 'README.md'), 'utf8').split('\n').find((l) => /^## Benchmark/.test(l));
  assert.ok(heading, 'the README still has a Benchmark section');
  const slug = heading.slice(3).toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
  assert.ok(md.includes(`README.md#${slug}`), `the link points at the heading "${heading.slice(3)}" (#${slug})`);
  assert.doesNotMatch(md, /[\u2013\u2014]/, 'no long dashes');
  assert.ok(existsSync(join(root, 'docs/BENCHMARK.md')));
});

test('the readings of the samples are kept in eval/results/2026-10-24-samples: the results README names the sha256 of each shipped picture and its picture code, scores.md has a composite of at least 90 for that code, the reading is kept', () => {
  const folder = join(root, 'eval/results/2026-10-24-samples');
  const readme = readFileSync(join(folder, 'README.md'), 'utf8');
  const scores = readFileSync(join(folder, 'scores.md'), 'utf8');
  for (const name of NAMES) {
    const sha = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');
    const row = readme.split('\n').find((l) => l.startsWith(`| ${name} |`));
    assert.ok(row, `${name} has a row in the results README`);
    assert.ok(row.includes(sha), `${name} sha256 ${sha} is in its row: the picture that was read is the picture that is shipped`);
    const code = row.split('|')[2].trim();
    const scoreRow = scores.split('\n').find((l) => l.startsWith(`| ${code} |`));
    assert.ok(scoreRow, `${code} has a row in scores.md`);
    const composite = Number(scoreRow.split('|')[4]);
    assert.ok(composite >= 90 && composite <= 100, `${name} (${code}) composite ${composite}`);
    assert.match(scoreRow, /\| yes \|[^|]*\|$/, `${code} reads without validator errors`);
    assert.ok(existsSync(join(folder, 'readings-samples', `${code}.plan.json`)), `${code} reading is kept`);
  }
});
