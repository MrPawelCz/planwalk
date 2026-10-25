// The workflow files carry guarantees that are easy to lose in an edit (matrix, required Chrome tests, release steps).
// This is a text check, not a YAML run: GitHub's own result for a pushed branch is the final word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ci = read('.github/workflows/ci.yml');
const release = read('.github/workflows/release.yml');
const dependabot = read('.github/dependabot.yml');

test('no workflow or Dependabot file contains a tab or a dash used as punctuation', () => {
  for (const [name, text] of Object.entries({ ci, release, dependabot, pages: read('.github/workflows/pages.yml') })) {
    assert.doesNotMatch(text, /\t/, `${name}: YAML does not allow tabs`);
    assert.doesNotMatch(text, /[\u2013\u2014]/, `${name}: project style has no em or en dashes`);
  }
});

test('ci runs Node 20, 22 and 24 on Ubuntu, requires the Chrome tests from Node 22 on, and keeps the AppArmor line and minimal permissions', () => {
  assert.match(ci, /matrix:\s*\n\s*node: \[20, 22, 24\]/);
  assert.match(ci, /PLANWALK_REQUIRE_CHROME: \$\{\{ matrix\.node >= 22 && '1' \|\| '0' \}\}/);
  assert.match(ci, /kernel\.apparmor_restrict_unprivileged_userns=0/);
  assert.match(ci, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(ci, /^ {4}permissions:/m, 'the test job needs no more than read access');
});

test('ci has a Windows job on Node 22 without the Chrome requirement', () => {
  const win = ci.slice(ci.indexOf('\n  windows:'));
  assert.match(win, /runs-on: windows-latest/);
  assert.match(win, /node-version: 22/);
  assert.match(win, /run: npm test/);
  assert.doesNotMatch(win, /PLANWALK_REQUIRE_CHROME/);
});

test('ci validates exported GLB files with a pinned Khronos validator and fails on errors', () => {
  assert.match(ci, /gltf-validator@\d+\.\d+\.\d+-dev\.\d+\.\d+/);
  assert.match(ci, /node tools\/validate-glb\.mjs/);
  assert.match(ci, /--glb /);
  assert.doesNotMatch(ci, /validate-glb[^\n]*\|\| true/);
});

test('release runs on v* tags, tests, attaches planwalk.html with its sha256 and an attestation, and uses the CHANGELOG section', () => {
  assert.match(release, /tags: \['v\*'\]/);
  assert.match(release, /run: npm test/);
  assert.match(release, /PLANWALK_REQUIRE_CHROME: '1'/);
  assert.match(release, /sha256sum planwalk\.html > planwalk\.html\.sha256/);
  assert.match(release, /actions\/attest-build-provenance@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.match(release, /subject-path: release\/planwalk\.html/);
  assert.match(release, /node tools\/changelog-section\.mjs "\$GITHUB_REF_NAME"/);
  assert.match(release, /gh release create "\$GITHUB_REF_NAME" release\/planwalk\.html release\/planwalk\.html\.sha256 --verify-tag/);
  assert.match(release, /test "\$GITHUB_REF_NAME" = "v\$\(node -p/);
  assert.match(release, /id-token: write/);
  assert.match(release, /attestations: write/);
});

test('every action in ci, release and pages is pinned to a full commit sha with its version in a comment', () => {
  for (const [name, text] of Object.entries({ ci, release, pages: read('.github/workflows/pages.yml') })) {
    const uses = [...text.matchAll(/^\s*-?\s*uses: (\S+)(.*)$/gm)];
    assert.ok(uses.length >= 2, `${name}: no actions found`);
    for (const [, ref, rest] of uses) {
      assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref} is not pinned to a commit sha`);
      assert.match(rest, /# v\d+\.\d+\.\d+/, `${name}: ${ref} has no version comment`);
    }
  }
});

test('pages publishes the Polish page and both preview images next to the English ones; the release ships the English page only', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /cp dist\/planwalk\.html site\/index\.html/);
  assert.match(pages, /node tools\/localize-page\.mjs dist\/planwalk\.html site\/pl\/index\.html/);
  assert.match(pages, /cp docs\/social-preview\.jpg site\/social-preview\.jpg/);
  assert.match(pages, /cp docs\/social-preview-pl\.jpg site\/social-preview-pl\.jpg/);
  assert.ok(pages.indexOf('localize-page.mjs') < pages.indexOf('upload-pages-artifact'), 'the Polish page is assembled before the site folder is uploaded');
  assert.doesNotMatch(release, /localize-page|social-preview|site\/pl/);
});

test('pages publishes the sample drawings next to the examples, before the site folder is uploaded, and the release does not carry them', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /^ {10}mkdir site\/examples$/m);
  assert.match(pages, /^ {10}cp examples\/\*\.plan\.json site\/examples\/$/m);
  assert.doesNotMatch(pages, /cp -r examples/, 'only the plan files of examples/ are published, not whatever else lands there');
  assert.ok(pages.indexOf('cp examples/*.plan.json site/examples/') < pages.indexOf('upload-pages-artifact'), 'the examples are copied before the site folder is uploaded');
  assert.match(pages, /^ {10}mkdir site\/samples$/m);
  assert.match(pages, /^ {10}cp docs\/samples\/sample-\*\.png site\/samples\/$/m);
  assert.doesNotMatch(pages, /cp -r docs\/samples/, 'only the drawings are published, not the README next to them');
  assert.ok(pages.indexOf('cp docs/samples/sample-*.png site/samples/') < pages.indexOf('upload-pages-artifact'), 'the samples are copied before the site folder is uploaded');
  assert.doesNotMatch(release, /docs\/samples|site\/samples/);
});

test('examples/ holds only plan files (*.plan.json), which is all that pages publishes from it', () => {
  const entries = readdirSync(join(root, 'examples'), { withFileTypes: true });
  assert.ok(entries.length >= 2, 'the bundled example plans are there');
  for (const e of entries) assert.ok(e.isFile() && /^[a-z0-9-]+\.plan\.json$/.test(e.name), `examples/${e.name} is not a *.plan.json file: pages would leave it out, move it elsewhere`);
});

test('dependabot updates npm and github-actions weekly, grouped', () => {
  for (const eco of ['npm', 'github-actions']) {
    const block = dependabot.slice(dependabot.indexOf(`package-ecosystem: ${eco}`));
    assert.ok(block.length < dependabot.length + 1 && dependabot.includes(`package-ecosystem: ${eco}`), `${eco} missing`);
    assert.match(block, /interval: weekly/);
    assert.match(block, /groups:/);
  }
});
