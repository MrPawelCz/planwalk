// Bundles viewer/src/main.js with three.js into one self-contained dist/planwalk.html (examples embedded)
// and dist/planwalk-empty.html (no examples). esbuild is a dev dependency; nothing here runs in the product.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

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
// Keep the inline script from ending the HTML script element early.
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const samples = {};
const exDir = join(root, 'examples');
for (const f of readdirSync(exDir).filter((n) => n.endsWith('.plan.json')).sort()) {
  const plan = JSON.parse(readFileSync(join(exDir, f), 'utf8'));
  samples[plan.name || f.replace(/\.plan\.json$/, '')] = plan;
}

const page = (withSamples) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>planwalk: floor plan to walkable 3D</title>
<meta name="description" content="Turn a floor plan into a 3D flat you can walk through.">
<link rel="icon" href="data:,">
</head>
<body>
${withSamples ? `<script type="application/json" id="planwalk-samples">${JSON.stringify(samples).replace(/</g, '\\u003c')}</script>\n` : ''}<script>${code}</script>
</body>
</html>
`;

mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'planwalk.html'), page(true));
writeFileSync(join(dist, 'planwalk-empty.html'), page(false));
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`dist/planwalk.html ${kb(Buffer.byteLength(page(true)))} (${Object.keys(samples).length} examples), dist/planwalk-empty.html ${kb(Buffer.byteLength(page(false)))}`);
