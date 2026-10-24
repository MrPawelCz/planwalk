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
// What the Copy prompt button puts on the clipboard: the embedded block as viewer/src/prompt.js reads it back.
async function readBack(html, lang) {
  globalThis.document = { getElementById: (id) => { const text = blockOf(html, id.replace('planwalk-prompt-', '')); return text === null ? null : { textContent: text }; } };
  try {
    return (await import('../../viewer/src/prompt.js')).getPrompt(lang);
  } finally {
    delete globalThis.document;
  }
}

before(() => {
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', out], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
after(() => rmSync(out, { recursive: true, force: true }));

for (const [lang, name] of [['en', 'PROMPT.md'], ['pl', 'PROMPT.pl.md']]) {
  test(`the embedded ${lang} prompt equals docs/${name} and reads back byte for byte`, async () => { // no skip: a missing prompt file has to fail
    const expected = promptOfFile(readFileSync(join(root, 'docs', name), 'utf8'));
    assert.ok(expected && expected.length > 1500, 'the file holds a long prompt');
    assert.match(expected, /"version"/, 'it is the JSON format prompt');
    for (const file of ['planwalk.html', 'planwalk-empty.html']) {
      const html = readFileSync(join(out, file), 'utf8');
      assert.equal(blockOf(html, lang), escape(expected), `${file} embeds ${name}`);
      assert.equal(await readBack(html, lang), expected, `${file}: the Copy prompt button gives ${name} unchanged`);
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

// The escape (neutralise in tools/build.mjs, undone by getPrompt) is one to one only for texts that do not already hold its output:
// "<\/script" and "<\!--" would come back as "</script" and "<!--". The build refuses those; every other text reads back unchanged.
const buildWith = (files) => {
  const base = mkdtempSync(join(out, 'case-')), docs = join(base, 'docs'), dist = join(base, 'dist');
  mkdirSync(docs);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(docs, name), text);
  const r = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--out', dist, '--docs', docs], { encoding: 'utf8', timeout: 60000 });
  return { r, dist };
};

test('the build refuses a prompt that already holds <\\/script or <\\!--, which the page would read back without the backslash', () => {
  for (const [name, files] of [
    ['PROMPT.md', { 'PROMPT.md': 'Read the drawing. Never write <\\/script> or <\\/SCRIPT here.\n' }],
    ['PROMPT.md', { 'PROMPT.md': 'Read the drawing. The text <\\!-- is not a comment.\n' }],
    ['PROMPT.pl.md', { 'PROMPT.md': 'Read the drawing.\n', 'PROMPT.pl.md': 'Przeczytaj rzut. Nie pisz <\\/Script tutaj.\n' }],
  ]) {
    const { r, dist } = buildWith(files);
    assert.notEqual(r.status, 0, `${name}: the build has to fail`);
    assert.ok(r.stderr.includes(`docs/${name} holds`), `${name}: the message names the file: ${r.stderr.slice(0, 300)}`);
    assert.equal(existsSync(join(dist, 'planwalk.html')), false, `${name}: no page is written`);
  }
});

test('texts that only look like the escape are accepted and read back byte for byte', async () => {
  const nasty = [
    'literal </script and <!-- and </SCRIPT >',
    'two backslashes <\\\\/script and <\\\\!-- are not the escape',
    'near misses <\\/b> <\\/scrip <\\!- <\\! \\</script \\<!-- <!<!-- <</script',
  ].join('\n');
  const { r, dist } = buildWith({ 'PROMPT.md': `${nasty}\n`, 'PROMPT.pl.md': `Pl: ${nasty}\n` });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const file of ['planwalk.html', 'planwalk-empty.html']) {
    const html = readFileSync(join(dist, file), 'utf8');
    assert.equal(await readBack(html, 'en'), nasty, `${file}: en`);
    assert.equal(await readBack(html, 'pl'), `Pl: ${nasty}`, `${file}: pl`);
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
