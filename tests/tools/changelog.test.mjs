// The release workflow publishes the CHANGELOG section of the tagged version as the release notes,
// so the file must keep a section for the version in package.json and the extractor must read it right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection } from '../../tools/changelog-section.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('changelogSection returns the body of one version and stops at the next heading or the link list', () => {
  const text = '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-01\n\n### Fixed\n\n- b\n\n## [0.1.0] - 2026-10-23\n\n### Added\n\n- a\n\n[Unreleased]: https://example.invalid/compare\n[0.1.0]: https://example.invalid/tag\n';
  assert.equal(changelogSection(text, '0.1.0'), '### Added\n\n- a');
  assert.equal(changelogSection(text, '0.2.0'), '### Fixed\n\n- b');
  assert.equal(changelogSection(text, 'Unreleased'), '');
  assert.equal(changelogSection(text, '0.3.0'), null);
});

test('CHANGELOG.md has a filled section for the version in package.json', () => {
  const body = changelogSection(changelog, version);
  assert.ok(body, `CHANGELOG.md needs a "## [${version}] - YYYY-MM-DD" section with the changes before this version is tagged`);
  assert.match(changelog, new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'), 'the heading needs a release date');
});

test('the command line prints the section, accepts a leading v and fails for an unknown version', () => {
  const run = (...args) => spawnSync(process.execPath, [join(root, 'tools/changelog-section.mjs'), ...args], { encoding: 'utf8' });
  const ok = run(`v${version}`);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), changelogSection(changelog, version));
  const bad = run('99.0.0');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no filled section/);
});

test('CHANGELOG.md keeps the project style: no dashes used as punctuation', () => {
  assert.doesNotMatch(changelog, /[–—]/);
});
