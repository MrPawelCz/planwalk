// The prompt on the page comes from docs/PROMPT.md (and docs/PROMPT.pl.md when it exists) at build time: the embedded
// inert blocks equal the fenced prompt of each file after the same escaping, and a dangerous prompt cannot end the script element.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptOfFile } from './first-visit-cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'planwalk-prompt-'));
const escape = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const blockOf = (html, lang) => { const m = new RegExp(`<script type="text/plain" id="planwalk-prompt-${lang}">([\\s\\S]*?)</script>`).exec(html); return m ? m[1] : null; };

before(() => {
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

for (const [lang, name] of [['en', 'PROMPT.md'], ['pl', 'PROMPT.pl.md']]) {
  test(`the embedded ${lang} prompt equals docs/${name}`, { skip: !existsSync(join(root, 'docs', name)) && lang !== 'en' ? `docs/${name} does not exist yet` : false }, () => {
    const expected = promptOfFile(readFileSync(join(root, 'docs', name), 'utf8'));
    assert.ok(expected && expected.length > 1500, 'the file has a long fenced prompt block');
    assert.match(expected, /"version"/, 'it is the JSON format prompt');
    for (const file of ['planwalk.html', 'planwalk-empty.html']) {
      const html = readFileSync(join(out, file), 'utf8');
      assert.equal(blockOf(html, lang), escape(expected), `${file} embeds ${name}`);
    }
  });
}

test('without docs/PROMPT.pl.md no Polish block is embedded', { skip: existsSync(join(root, 'docs/PROMPT.pl.md')) ? 'the Polish prompt exists' : false }, () => {
  assert.equal(blockOf(readFileSync(join(out, 'planwalk.html'), 'utf8'), 'pl'), null);
});

test('the embedded blocks cannot end the script element or open an HTML comment', () => {
  for (const file of ['planwalk.html', 'planwalk-empty.html']) {
    const html = readFileSync(join(out, file), 'utf8');
    const block = blockOf(html, 'en');
    assert.ok(block && !/<\/script/i.test(block) && !block.includes('<!--'));
    assert.equal((html.match(/<script/g) || []).length, (html.match(/<\/script>/g) || []).length, `${file}: every script element is closed once`);
  }
});
