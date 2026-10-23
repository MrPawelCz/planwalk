// Prints the body of one version section of CHANGELOG.md (the text between its "## [x.y.z]" heading and the next
// heading), which the release workflow uses as the release notes. Exit code 1 when the section is missing or empty.
//   node tools/changelog-section.mjs 0.1.0 [CHANGELOG.md]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function changelogSection(text, version) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const head = (l) => /^## \[/.test(l);
  const start = lines.findIndex((l) => head(l) && l.startsWith(`## [${version}]`));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && (head(l) || /^\[[^\]]+\]: /.test(l))); // link definitions close the last section
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, file] = process.argv.slice(2);
  if (!version) { console.error('usage: node tools/changelog-section.mjs <version> [CHANGELOG.md]'); process.exit(2); }
  const path = file || join(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md');
  const body = changelogSection(readFileSync(path, 'utf8'), version.replace(/^v/, ''));
  if (!body) { console.error(`CHANGELOG.md has no filled section for ${version}: add "## [${version}] - YYYY-MM-DD" with the changes.`); process.exit(1); }
  console.log(body);
}
