// Where a shared link starts (viewer/src/site.js): the page's own address on http and https, the public page everywhere else, so a
// page opened from a downloaded file never puts a file:// address with its local path on the clipboard. No browser needed. The page head that
// tools/build.mjs writes must name the same public address, or the two constants have drifted apart.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, SITE_PL, linkBase } from '../../viewer/src/site.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-base-'));
let head = '';

before(() => {
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const html = readFileSync(join(out, 'planwalk.html'), 'utf8');
  head = html.slice(0, html.indexOf('</head>'));
});
after(() => rmSync(out, { recursive: true, force: true }));

// A URL has the fields of a location (and a query and a fragment that linkBase has to leave out).
const at = (url) => new URL(url);

test('on http and https the page keeps its own address, without query and fragment, in either language', () => {
  const web = [
    ['https://mrpawelcz.github.io/planwalk/?lang=pl&materials=clay#z=abc', 'https://mrpawelcz.github.io/planwalk/'],
    ['https://mrpawelcz.github.io/planwalk/pl/', 'https://mrpawelcz.github.io/planwalk/pl/'],
    ['https://example.org/a-fork/planwalk.html?lang=en#plan=abc', 'https://example.org/a-fork/planwalk.html'],
    ['http://localhost:8080/x/y.html', 'http://localhost:8080/x/y.html'],
    ['http://127.0.0.1:8080/planwalk.html?lang=pl', 'http://127.0.0.1:8080/planwalk.html'],
    ['http://192.0.2.20:8000/planwalk.html#plan=abc', 'http://192.0.2.20:8000/planwalk.html'],
    ['http://[::1]:8080/', 'http://[::1]:8080/'],
  ];
  for (const [url, want] of web) {
    for (const lang of ['en', 'pl', undefined]) assert.equal(linkBase(at(url), lang), want, `${url} (${lang})`);
  }
});

test('a page that does not come from the web gets the public page: English by default, Polish for a Polish interface', () => {
  const offTheWeb = [
    'file:///srv/someone/Downloads/planwalk.html',
    'file:///srv/someone/Downloads/planwalk.html?lang=pl#plan=abc',
    'file:///C:/Docs/Someone%20Else/Pobrane/planwalk%20(1).html',
    'file://nas/share/Someone/planwalk.html',
    'file:///Volumes/USB%20STICK/plans/flat%232.html',
    'about:blank',
    'about:srcdoc',
    'blob:https://example.org/3b9d5f0e-1111-4222-8333-444455556666',
    'data:text/html,hello',
    'ftp://files.example.org/plans/planwalk.html',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/planwalk.html',
  ];
  for (const url of offTheWeb) {
    assert.equal(linkBase(at(url), 'en'), SITE, url);
    assert.equal(linkBase(at(url), 'pl'), SITE_PL, url);
    for (const lang of [undefined, '', 'de']) assert.equal(linkBase(at(url), lang), SITE, `${url} (${lang})`);
    for (const lang of ['en', 'pl']) assert.doesNotMatch(linkBase(at(url), lang), /file:|srv|Downloads|Pobrane|someone|else|Docs|Volumes|USB|nas|blank|hello|example|abcdefgh/i, `${url}: no local path or address in the link`);
  }
});

test('anything that is not a full http or https location is treated as off the web', () => {
  const odd = [undefined, null, {}, { protocol: '' }, { protocol: 'http:', host: '', pathname: '/srv/someone/x.html' }, { protocol: 'file:', host: '', pathname: '/srv/someone/x.html' }];
  for (const loc of odd) {
    assert.equal(linkBase(loc, 'en'), SITE, JSON.stringify(loc));
    assert.equal(linkBase(loc, 'pl'), SITE_PL, JSON.stringify(loc));
  }
});

test('the public address is an absolute https address and the Polish page lives under pl/', () => {
  assert.match(SITE, /^https:\/\/[a-z0-9.-]+\/[a-z0-9-]+\/$/);
  assert.equal(SITE_PL, `${SITE}pl/`);
});

test('tools/build.mjs publishes the same address: og:url, canonical and the hreflang links of the built page', () => {
  const tag = (re) => { const m = re.exec(head); assert.ok(m, `the built head has ${re}`); return m[1]; };
  assert.equal(tag(/<meta property="og:url" content="([^"]+)">/), SITE);
  assert.equal(tag(/<link rel="canonical" href="([^"]+)">/), SITE);
  assert.equal(tag(/<link rel="alternate" hreflang="en" href="([^"]+)">/), SITE);
  assert.equal(tag(/<link rel="alternate" hreflang="pl" href="([^"]+)">/), SITE_PL);
  assert.equal(tag(/<link rel="alternate" hreflang="x-default" href="([^"]+)">/), SITE);
});
