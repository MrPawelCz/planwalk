#!/usr/bin/env node
// Writes ONE self-contained HTML file: the planwalk viewer with a plan embedded.
// Usage: node embed.mjs plan.json out.html [--viewer path/to/planwalk.html]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const viewerArg = flag('--viewer');
const [planPath, outPath] = args;
if (!planPath || !outPath) {
  console.error('Usage: node embed.mjs plan.json out.html [--viewer path/to/planwalk.html]');
  process.exit(2);
}

const candidates = [viewerArg, path.join(here, '..', 'assets', 'planwalk.html')].filter(Boolean);
const viewerPath = candidates.find((p) => fs.existsSync(p));
if (!viewerPath) {
  console.error('Viewer not found. Looked in: ' + candidates.join(', ') + '. Pass --viewer PATH.');
  process.exit(2);
}

let plan;
try {
  plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
} catch (e) {
  console.error('Cannot read plan JSON: ' + e.message);
  process.exit(2);
}

// Keep the JSON inert inside a script tag: no "</script", no HTML comment starts, no line separators.
const esc = (code) => '\\' + 'u' + code.toString(16).padStart(4, '0');
const json = JSON.stringify(plan)
  .split('<').join(esc(0x3c))
  .split(String.fromCharCode(0x2028)).join(esc(0x2028))
  .split(String.fromCharCode(0x2029)).join(esc(0x2029));
const tag = '<script type="application/json" id="planwalk-plan">' + json + '</script>';

let html = fs.readFileSync(viewerPath, 'utf8');
const existing = /<script type="application\/json" id="planwalk-plan">[\s\S]*?<\/script>/;
if (existing.test(html)) {
  html = html.replace(existing, () => tag);
} else if (html.includes('</body>')) {
  html = html.replace('</body>', () => tag + '\n</body>');
} else {
  html += '\n' + tag + '\n';
}
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB) from ${path.basename(viewerPath)} with plan "${plan.name ?? planPath}".`);
