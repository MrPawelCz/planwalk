// The page head built by tools/build.mjs: link preview tags with absolute https addresses, an SVG icon instead of data:,
// no demo address in the empty viewer, and a preview image that is published next to index.html.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-head-'));
let demo, empty;

const headOf = (html) => html.slice(0, html.indexOf('</head>'));
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const metas = (head) => Object.fromEntries([...head.matchAll(/<meta ([^>]*)>/g)].map((m) => attrs(m[1])).filter((a) => a.content !== undefined).map((a) => [a.property ?? a.name, a.content]));
const icon = (head) => attrs(/<link ([^>]*rel="icon"[^>]*)>/.exec(head)[1]);

before(() => {
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  demo = headOf(readFileSync(join(out, 'planwalk.html'), 'utf8'));
  empty = headOf(readFileSync(join(out, 'planwalk-empty.html'), 'utf8'));
});
after(() => rmSync(out, { recursive: true, force: true }));

test('the demo page carries the link preview tags with absolute https addresses', () => {
  const m = metas(demo);
  assert.match(readFileSync(join(out, 'planwalk.html'), 'utf8'), /^<!doctype html>\n<html lang="en">/);
  assert.match(demo, /<title>[^<]{10,}<\/title>/);
  assert.ok(m.description && m.description.length > 40 && m.description.length < 200, 'a plain description');
  assert.equal(m['og:type'], 'website');
  assert.equal(m['og:site_name'], 'planwalk');
  assert.ok(m['og:title'] && m['og:description']);
  assert.equal(m['og:url'], 'https://mrpawelcz.github.io/planwalk/');
  assert.equal(m['og:image'], 'https://mrpawelcz.github.io/planwalk/social-preview.jpg');
  assert.equal(m['og:image:width'], '1200');
  assert.equal(m['og:image:height'], '630');
  assert.ok(m['og:image:alt'].length > 10);
  assert.equal(m['twitter:card'], 'summary_large_image');
  assert.equal(m['twitter:title'], m['og:title']);
  assert.equal(m['twitter:description'], m['og:description']);
  assert.equal(m['twitter:image'], m['og:image']);
  for (const k of ['og:url', 'og:image', 'twitter:image']) assert.match(m[k], /^https:\/\/[a-z0-9.-]+\//, `${k} is an absolute https address`);
});

test('the icon is an inline SVG data address, not the empty data: placeholder', () => {
  for (const head of [demo, empty]) {
    const link = icon(head);
    assert.equal(link.type, 'image/svg+xml');
    assert.ok(link.href.startsWith('data:image/svg+xml,'), link.href.slice(0, 30));
    assert.notEqual(link.href, 'data:,');
    const svg = decodeURIComponent(link.href.slice('data:image/svg+xml,'.length));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">.*<\/svg>$/);
    assert.ok((svg.match(/</g) || []).length === (svg.match(/>/g) || []).length, 'balanced tags');
  }
});

test('the empty viewer (copied into the agent skill) has a title, a description and the icon but no demo address', () => {
  const m = metas(empty);
  assert.match(empty, /<title>[^<]{10,}<\/title>/);
  assert.ok(m.description);
  for (const k of Object.keys(m)) assert.ok(!/^(og:|twitter:)/.test(k), `unexpected ${k}`);
  assert.ok(!empty.includes('mrpawelcz.github.io'), 'no address of the demo');
});

test('docs/social-preview.jpg is a 1200x630 JPEG under 150 KB and the Pages workflow publishes it under the og:image name', () => {
  const file = join(root, 'docs/social-preview.jpg');
  const buf = readFileSync(file);
  assert.ok(statSync(file).size < 150000, `${statSync(file).size} bytes`);
  assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  let size = null;
  for (let i = 2; i + 9 < buf.length && !size;) {
    assert.equal(buf[i], 0xff, `marker at ${i}`);
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  assert.deepEqual(size, { w: 1200, h: 630 });
  const name = new URL(metas(demo)['og:image']).pathname.split('/').pop();
  assert.match(readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8'), new RegExp(`cp docs/social-preview\\.jpg site/${name.replace('.', '\\.')}\\b`));
});
