// The prompt on the page comes from docs/PROMPT.md (and docs/PROMPT.pl.md when it exists) at build time: the embedded
// inert blocks equal the prompt file (the whole file) after the same escaping, and a dangerous prompt cannot end the script element.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.ok(expected && expected.length > 1500, 'the file holds a long prompt');
    assert.match(expected, /"version"/, 'it is the JSON format prompt');
    for (const file of ['planwalk.html', 'planwalk-empty.html']) {
      const html = readFileSync(join(out, file), 'utf8');
      assert.equal(blockOf(html, lang), escape(expected), `${file} embeds ${name}`);
    }
  });
}

// A build from a temporary docs folder with only PROMPT.md, whose prompt is made to break out of the script element.
const HOSTILE = 'Read the drawing.\n</script><script>window.pwned = 1</script>\n<!-- never closed\n</SCRIPT >\nText with <b>tags</b> & "quotes" and emoji \u{1F3E0} at the end.';
let alone;
const buildAlone = () => {
  if (!alone) {
    const docs = join(out, 'docs-alone'), dist = join(out, 'dist-alone');
    mkdirSync(docs);
    writeFileSync(join(docs, 'PROMPT.md'), `${HOSTILE}\n`);
    const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', dist, '--docs', docs], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    alone = dist;
  }
  return alone;
};

test('without docs/PROMPT.pl.md no Polish block is embedded', () => {
  for (const file of ['planwalk.html', 'planwalk-empty.html']) {
    const html = readFileSync(join(buildAlone(), file), 'utf8');
    assert.equal(blockOf(html, 'pl'), null, file);
    assert.ok(blockOf(html, 'en'), `${file}: the English block is there`);
  }
});

test('a prompt holding </script and <!-- cannot end the script element or open a comment, and reads back byte for byte', async () => {
  for (const file of ['planwalk.html', 'planwalk-empty.html']) {
    const html = readFileSync(join(buildAlone(), file), 'utf8');
    const block = blockOf(html, 'en');
    assert.ok(block !== null, `${file}: the block exists and ends at its own </script>`);
    assert.ok(!/<\/script/i.test(block) && !block.includes('<!--'), `${file}: the block holds neither a script end nor a comment start`);
    const rest = html.split(block).join('');
    assert.equal(rest.includes('window.pwned'), false, `${file}: the text of the prompt appears only inside its own block, never as code`);
    assert.equal((rest.match(/<script/g) || []).length, (rest.match(/<\/script>/g) || []).length, `${file}: every script element is closed once`);
    globalThis.document = { getElementById: (id) => (id === 'planwalk-prompt-en' ? { textContent: blockOf(html, 'en') } : null) };
    try {
      const { getPrompt } = await import('../../viewer/src/prompt.js');
      assert.equal(getPrompt('en'), promptOfFile(`${HOSTILE}\n`), `${file}: getPrompt returns the prompt as it was written`);
      assert.equal(getPrompt('pl'), null);
    } finally {
      delete globalThis.document;
    }
  }
});

test('the embedded blocks cannot end the script element or open an HTML comment', () => {
  for (const file of ['planwalk.html', 'planwalk-empty.html']) {
    const html = readFileSync(join(out, file), 'utf8');
    const block = blockOf(html, 'en');
    assert.ok(block && !/<\/script/i.test(block) && !block.includes('<!--'));
    assert.equal((html.match(/<script/g) || []).length, (html.match(/<\/script>/g) || []).length, `${file}: every script element is closed once`);
  }
});
