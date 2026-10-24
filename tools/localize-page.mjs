// Derives the Polish landing page (published at /pl/) from the built English demo page.
//   node tools/localize-page.mjs <in.html> <out.html>     (in is dist/planwalk.html; the empty viewer has no preview tags to localize)
// Only the head and the lang attribute of <html> change: Polish title, description and link preview tags, an address of its
// own, and one head tag that makes Polish the default interface language (viewer/src/i18n.js reads it; ?lang= still wins).
// The output is a pure function of the input, so the Pages workflow and the tests get the same bytes every time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEXT = {
  title: 'planwalk: z rzutu mieszkania do spaceru w 3D',
  description: 'Zamień rzut mieszkania w model 3D i przejdź się po nim. Za darmo, w przeglądarce, bez konta. Plan nie opuszcza tej strony.',
  card: 'Rzut mieszkania w 3D, po którym możesz spacerować. Bez wysyłania planu i bez konta.',
  alt: 'Umeblowany salon w 3D i napis planwalk: rzut mieszkania w 3D, po którym możesz spacerować',
};

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const meta = (key, name, content) => `<meta ${key}="${name}" content="${attr(content)}">`;
const metaRe = (key, name) => new RegExp(`^<meta ${key}="${escapeRe(name)}" content="[^"\\n]*">$`, 'gm');

// Replaces the one line that matches; a head that changed shape fails loudly instead of shipping a half Polish page.
function one(html, re, to) {
  const n = (html.match(re) || []).length;
  if (n !== 1) throw new Error(`localize-page: expected exactly one line matching ${re}, found ${n} (was the input built by the current tools/build.mjs? run npm run build)`);
  return html.replace(re, () => to);
}

export function localize(html) {
  const site = /^<meta property="og:url" content="([^"\n]+\/)">$/m.exec(html);
  if (!site) throw new Error('localize-page: no og:url in the input; use dist/planwalk.html (the empty viewer has no preview tags)');
  const url = `${site[1]}pl/`, image = `${site[1]}social-preview-pl.jpg`;
  let out = one(html, /^<html lang="en">$/m, '<html lang="pl">');
  out = one(out, /^<title>[^<\n]*<\/title>$/m, `<title>${attr(TEXT.title)}</title>`);
  out = one(out, metaRe('name', 'description'), `${meta('name', 'description', TEXT.description)}\n${meta('name', 'planwalk-default-lang', 'pl')}`);
  for (const [key, name, content] of [
    ['property', 'og:locale', 'pl_PL'], ['property', 'og:locale:alternate', 'en_US'],
    ['property', 'og:title', TEXT.title], ['property', 'og:description', TEXT.card], ['property', 'og:url', url],
    ['property', 'og:image', image], ['property', 'og:image:alt', TEXT.alt],
    ['name', 'twitter:title', TEXT.title], ['name', 'twitter:description', TEXT.card],
    ['name', 'twitter:image', image], ['name', 'twitter:image:alt', TEXT.alt],
  ]) out = one(out, metaRe(key, name), meta(key, name, content));
  return one(out, /^<link rel="canonical" href="[^"\n]*">$/m, `<link rel="canonical" href="${url}">`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to || process.argv.length > 4) { console.error('usage: node tools/localize-page.mjs <in.html> <out.html>'); process.exit(2); }
  if (resolve(from) === resolve(to)) { console.error('localize-page: the output has to be a different file than the input'); process.exit(2); }
  try {
    const html = localize(readFileSync(from, 'utf8'));
    mkdirSync(dirname(resolve(to)), { recursive: true });
    writeFileSync(to, html);
  } catch (err) { console.error(err.message); process.exit(1); }
  console.log(`${to} written`);
}
