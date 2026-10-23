// The Polish landing page that tools/localize-page.mjs derives from the built demo page: a Polish head and link preview with
// absolute https addresses of its own, a tag that makes Polish the default interface language, nothing else different from the
// English page, and the same bytes on every run. Both pages name each other (canonical, hreflang). The browser part skips
// when Chrome is missing and fails instead when PLANWALK_REQUIRE_CHROME=1.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLang } from '../../viewer/src/i18n.js';
import { openPage, skipReason } from './first-visit-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-localize-'));
const SITE = 'https://mrpawelcz.github.io/planwalk/';
const skip = process.env.PLANWALK_REQUIRE_CHROME === '1' ? false : skipReason();
let en, pl, emptyHtml;

const headOf = (html) => html.slice(0, html.indexOf('</head>'));
const bodyOf = (html) => html.slice(html.indexOf('</head>'));
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const metas = (head) => Object.fromEntries([...head.matchAll(/<meta ([^>]*)>/g)].map((m) => attrs(m[1])).filter((a) => a.content !== undefined).map((a) => [a.property ?? a.name, a.content]));
const links = (head) => [...head.matchAll(/<link ([^>]*)>/g)].map((m) => attrs(m[1]));
const run = (args) => spawnSync(process.execPath, [join(root, 'tools/localize-page.mjs'), ...args], { encoding: 'utf8', timeout: 30000 });

before(() => {
  const b = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(b.status, 0, `${b.stdout}\n${b.stderr}`);
  for (const f of ['pl.html', 'pl-again.html']) {
    const r = run([join(out, 'planwalk.html'), join(out, f)]);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  }
  en = readFileSync(join(out, 'planwalk.html'), 'utf8');
  pl = readFileSync(join(out, 'pl.html'), 'utf8');
  emptyHtml = readFileSync(join(out, 'planwalk-empty.html'), 'utf8');
});
after(() => rmSync(out, { recursive: true, force: true }));

test('the Polish page has a Polish title, description and link preview with absolute https addresses of its own', () => {
  const head = headOf(pl), m = metas(head);
  assert.match(pl, /^<!doctype html>\n<html lang="pl">/);
  assert.match(head, /<title>[^<]{10,60}<\/title>/);
  assert.ok(m.description.length > 40 && m.description.length < 200, 'a plain description');
  assert.equal(m['og:locale'], 'pl_PL');
  assert.equal(m['og:locale:alternate'], 'en_US');
  assert.equal(m['og:url'], `${SITE}pl/`);
  assert.equal(m['og:image'], `${SITE}social-preview-pl.jpg`);
  assert.equal(m['og:image:width'], '1200');
  assert.equal(m['og:image:height'], '630');
  assert.ok(m['og:title'].length <= 60 && m['og:description'].length <= 110, 'short enough for a chat card');
  assert.equal(m['twitter:card'], 'summary_large_image');
  assert.equal(m['twitter:title'], m['og:title']);
  assert.equal(m['twitter:description'], m['og:description']);
  assert.equal(m['twitter:image'], m['og:image']);
  assert.equal(m['twitter:image:alt'], m['og:image:alt']);
  for (const k of ['og:url', 'og:image', 'twitter:image']) assert.match(m[k], /^https:\/\/[a-z0-9.-]+\//, `${k} is an absolute https address`);
  assert.deepEqual(links(head).filter((l) => l.rel === 'canonical'), [{ rel: 'canonical', href: `${SITE}pl/` }]);
  assert.equal(m['planwalk-default-lang'], 'pl');
  assert.doesNotMatch(head, /floor plan|walkable|Turn a|never leaves/, 'no English text is left in the Polish head');
  assert.doesNotMatch(head, /[–—]/, 'project style has no em or en dashes');
  assert.match(m.description + m['og:description'] + m['og:title'] + m['og:image:alt'], /[ąćęłńóśźż]/, 'real Polish, with its letters');
});

test('both pages name each other: canonical and hreflang alternates with absolute addresses, the empty viewer has none', () => {
  const alternates = (head) => links(head).filter((l) => l.rel === 'alternate').map((l) => [l.hreflang, l.href]);
  const want = [['en', SITE], ['pl', `${SITE}pl/`], ['x-default', SITE]];
  assert.deepEqual(alternates(headOf(en)), want);
  assert.deepEqual(alternates(headOf(pl)), want);
  assert.deepEqual(links(headOf(en)).filter((l) => l.rel === 'canonical'), [{ rel: 'canonical', href: SITE }]);
  const m = metas(headOf(en));
  assert.equal(m['og:locale'], 'en_US');
  assert.equal(m['og:locale:alternate'], 'pl_PL');
  assert.equal(m['planwalk-default-lang'], undefined, 'the English page follows the browser language');
  assert.deepEqual(links(headOf(emptyHtml)).filter((l) => l.rel !== 'icon'), []);
  assert.ok(!/planwalk-default-lang/.test(headOf(emptyHtml)), 'the empty viewer stays neutral');
});

test('the Polish page differs from the English one only in the head and the html lang attribute', () => {
  assert.equal(bodyOf(pl), bodyOf(en), 'everything from </head> on is byte for byte the same');
  const name = (line) => /^<html/.test(line) ? 'html' : /^<title/.test(line) ? 'title' : /^<link rel="canonical"/.test(line) ? 'canonical'
    : (/^<meta (?:name|property)="([^"]+)"/.exec(line) || [])[1] ?? `other: ${line}`;
  const enLines = headOf(en).split('\n'), plLines = headOf(pl).split('\n');
  const changed = plLines.filter((l) => !enLines.includes(l)).map(name).sort();
  assert.deepEqual(changed, ['canonical', 'description', 'html', 'og:description', 'og:image', 'og:image:alt', 'og:locale', 'og:locale:alternate',
    'og:title', 'og:url', 'planwalk-default-lang', 'title', 'twitter:description', 'twitter:image', 'twitter:image:alt', 'twitter:title']);
  assert.equal(plLines.length, enLines.length + 1, 'one added line: the default language tag');
});

test('running the tool twice gives identical bytes; it refuses wrong input instead of writing half a page', () => {
  assert.ok(readFileSync(join(out, 'pl.html')).equals(readFileSync(join(out, 'pl-again.html'))), 'same bytes');
  assert.equal(run([]).status, 2);
  assert.equal(run([join(out, 'planwalk.html')]).status, 2);
  assert.equal(run([join(out, 'planwalk.html'), join(out, 'planwalk.html')]).status, 2, 'never overwrites its input');
  const nested = run([join(out, 'planwalk.html'), join(out, 'deeper/still/index.html')]);
  assert.equal(nested.status, 0, 'creates the folder of the output (site/pl/)');
  const empty = run([join(out, 'planwalk-empty.html'), join(out, 'x.html')]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /no og:url/);
  const broken = join(out, 'broken.html');
  writeFileSync(broken, en.replace(/<link rel="canonical"[^\n]*\n/, ''));
  const r = run([broken, join(out, 'y.html')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /canonical/);
});

test('detectLang: ?lang= wins, then the page default tag, then the browser language', () => {
  const doc = (lang) => ({ querySelector: (sel) => (sel === 'meta[name="planwalk-default-lang"]' ? { getAttribute: () => lang } : null) });
  assert.equal(detectLang('', { language: 'en-GB' }, doc('pl')), 'pl');
  assert.equal(detectLang('?lang=en', { language: 'pl-PL' }, doc('pl')), 'en');
  assert.equal(detectLang('?lang=pl', { language: 'en-GB' }, doc('en')), 'pl');
  assert.equal(detectLang('', { language: 'pl-PL' }, doc('en')), 'en');
  assert.equal(detectLang('', { language: 'en-GB' }, doc('xx')), 'en', 'an unknown value is ignored');
  assert.equal(detectLang('', { language: 'pl-PL' }, doc('xx')), 'pl', 'an unknown value falls back to the browser');
  assert.equal(detectLang('', { language: 'pl-PL' }, { querySelector: () => null }), 'pl', 'no tag, the browser decides');
  assert.equal(detectLang('', { language: 'pl-PL' }, null), 'pl', 'no document at all');
});

test('in Chrome the Polish page opens in Polish for an English browser, ?lang=en still wins, the English page is unchanged', { skip }, async () => {
  if (process.env.PLANWALK_REQUIRE_CHROME === '1') assert.equal(skipReason(), false, 'Chrome is required');
  const EN = "Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] }); Object.defineProperty(navigator, 'language', { get: () => 'en-GB' });";
  const CARD = '(() => ({ lang: document.documentElement.lang, card: document.querySelector(".pw-visit h2").textContent }))()';
  const look = async (file, search) => {
    const p = await openPage(join(out, file), { search, beforeLoad: EN });
    try {
      const info = await p.evaluate(CARD);
      assert.deepEqual(p.issues, [], 'console stays clean');
      return info;
    } finally { await p.close(); }
  };
  const enPage = await look('planwalk.html', '');
  const enPagePl = await look('planwalk.html', '?lang=pl');
  assert.equal(enPage.lang, 'en');
  assert.equal(enPagePl.lang, 'pl');
  assert.notEqual(enPage.card, enPagePl.card, 'the two languages have different card titles');
  assert.deepEqual(await look('pl.html', ''), enPagePl, 'the Polish page speaks Polish for an English browser');
  assert.deepEqual(await look('pl.html', '?lang=en'), enPage, '?lang=en wins on the Polish page');
});
