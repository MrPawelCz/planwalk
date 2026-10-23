// Bundles viewer/src/main.js with three.js into one self-contained dist/planwalk.html (examples embedded)
// and dist/planwalk-empty.html (no examples). esbuild is a dev dependency; nothing here runs in the product.
//   node tools/build.mjs [--out DIR]        (DIR defaults to dist; the tests build into a temporary one)
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outIdx = process.argv.indexOf('--out'), docsIdx = process.argv.indexOf('--docs');
if ((outIdx >= 0 && !process.argv[outIdx + 1]) || (docsIdx >= 0 && !process.argv[docsIdx + 1])) { console.error('usage: node tools/build.mjs [--out DIR] [--docs DIR]'); process.exit(2); }
const dist = outIdx >= 0 ? resolve(process.argv[outIdx + 1]) : join(root, 'dist');
const docsDir = docsIdx >= 0 ? resolve(process.argv[docsIdx + 1]) : join(root, 'docs'); // where PROMPT.md is read from (a test builds with its own)

// The live site. Link previews need absolute addresses, so the address is one constant here; .github/workflows/pages.yml
// publishes docs/social-preview.jpg next to index.html under the name used below.
const SITE = 'https://mrpawelcz.github.io/planwalk/';
const PREVIEW = `${SITE}social-preview.jpg`;
const TITLE = 'planwalk: floor plan to walkable 3D';
const DESCRIPTION = 'Turn a floor plan into a 3D flat you can walk through. Free, runs in your browser, your plan never leaves the page.';
const CARD_DESCRIPTION = 'Rzut mieszkania w 3D, po którym możesz spacerować. Turn a floor plan into a 3D flat you can walk through. Free, in your browser.';
const PREVIEW_ALT = 'A furnished living room in 3D with the words planwalk, turn a floor plan into a 3D flat you can walk through';
// A rounded square with the outer walls of a flat (a door gap in the bottom wall) and one partition.
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#37332d"/><path d="M25 51H13V13h38v38H39M32 13v20h19" fill="none" stroke="#fff" stroke-width="5"/></svg>';

const result = await build({
  entryPoints: [join(root, 'viewer/src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'inline', // keeps the three.js licence notice inside the single file
  logLevel: 'warning',
});
// Keep an inline script from ending the HTML script element early (the case is kept, so plain text survives a round trip).
const neutralise = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const code = neutralise(result.outputFiles[0].text);

const samples = {};
const exDir = join(root, 'examples');
for (const f of readdirSync(exDir).filter((n) => n.endsWith('.plan.json')).sort()) {
  const plan = JSON.parse(readFileSync(join(exDir, f), 'utf8'));
  samples[plan.name || f.replace(/\.plan\.json$/, '')] = plan;
}

// docs/PROMPT.md and, when it exists, docs/PROMPT.pl.md stay the only sources of the prompt: the page embeds the whole file (it holds
// nothing but the prompt) as inert text for the Copy prompt buttons; viewer/src/prompt.js reads it back.
const promptText = (md) => md.replace(/\r\n/g, '\n').trim();
const prompts = {};
for (const [lang, name] of [['en', 'PROMPT.md'], ['pl', 'PROMPT.pl.md']]) {
  const file = join(docsDir, name);
  if (!existsSync(file)) continue;
  prompts[lang] = promptText(readFileSync(file, 'utf8'));
  if (!prompts[lang]) throw new Error(`docs/${name} is empty`);
}
if (!prompts.en) throw new Error('docs/PROMPT.md is missing');
const promptBlocks = Object.entries(prompts).map(([lang, text]) => `<script type="text/plain" id="planwalk-prompt-${lang}">${neutralise(text)}</script>\n`).join('');

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const meta = (key, name, content) => `<meta ${key}="${name}" content="${attr(content)}">`;
// The preview tags describe the public demo page only: the empty viewer (copied into the agent skill) has none, so a
// copy of it never claims the demo's address.
const head = (withSamples) => [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  `<title>${TITLE}</title>`,
  meta('name', 'description', DESCRIPTION),
  `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON)}">`,
  ...(withSamples ? [
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'planwalk'),
    meta('property', 'og:title', TITLE),
    meta('property', 'og:description', CARD_DESCRIPTION),
    meta('property', 'og:url', SITE),
    meta('property', 'og:image', PREVIEW),
    meta('property', 'og:image:type', 'image/jpeg'),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', PREVIEW_ALT),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', TITLE),
    meta('name', 'twitter:description', CARD_DESCRIPTION),
    meta('name', 'twitter:image', PREVIEW),
    meta('name', 'twitter:image:alt', PREVIEW_ALT),
  ] : []),
].join('\n');

const page = (withSamples) => `<!doctype html>
<html lang="en">
<head>
${head(withSamples)}
</head>
<body>
${withSamples ? `<script type="application/json" id="planwalk-samples">${JSON.stringify(samples).replace(/</g, '\\u003c')}</script>\n` : ''}${promptBlocks}<script>${code}</script>
</body>
</html>
`;

// Licence text inside the shipped pages, so a copy of the single file stays a licensed work: the project's own LICENSE and
// the three.js permission notice (esbuild keeps only its copyright line). It goes into an HTML comment right after the
// charset declaration, which has to stay within the first 1024 bytes of the file.
const thirdParty = readFileSync(join(root, 'THIRD_PARTY_LICENSES.md'), 'utf8');
const threeFrom = thirdParty.indexOf('\n## three.js\n'), threeTo = thirdParty.indexOf('\n## esbuild\n');
if (threeFrom < 0 || threeTo < threeFrom) throw new Error('THIRD_PARTY_LICENSES.md needs a "## three.js" section followed by "## esbuild"');
const licenseText = `planwalk\n\n${readFileSync(join(root, 'LICENSE'), 'utf8').trim()}\n\nThis file also contains three.js:\n\n${thirdParty.slice(threeFrom + 13, threeTo).trim()}`;
if (licenseText.includes('--')) throw new Error('the licence text cannot go into an HTML comment (it contains two hyphens)');
const withLicense = (html) => {
  const charset = /<meta charset="[^"]*">\n/;
  if (!charset.test(html)) throw new Error('the page head needs <meta charset="..."> on its own line: the licence comment goes right after it');
  return html.replace(charset, (m) => `${m}<!--\n${licenseText}\n-->\n`);
};

mkdirSync(dist, { recursive: true });
const pages = { 'planwalk.html': withLicense(page(true)), 'planwalk-empty.html': withLicense(page(false)) };
for (const [name, html] of Object.entries(pages)) writeFileSync(join(dist, name), html);
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`${dist === join(root, 'dist') ? 'dist' : dist}/planwalk.html ${kb(Buffer.byteLength(pages['planwalk.html']))} (${Object.keys(samples).length} examples), planwalk-empty.html ${kb(Buffer.byteLength(pages['planwalk-empty.html']))}`);
