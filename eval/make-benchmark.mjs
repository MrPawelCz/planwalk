// Builds a benchmark directory: synthetic plans with known truth and anonymised drawings (docs/SPEC.md section 8, docs/BENCHMARK.md).
// Usage: node eval/make-benchmark.mjs --seed N --count K --out DIR [--styles cad,hatched,sketch,scan] [--zoom LO,HI] [--no-png]
// --zoom LO,HI draws every picture at its own size, a deterministic factor in [LO, HI] (default 1,1), so a reader cannot carry a pixel scale from one picture to the next.
// Plan i uses seed N+i and the drawing style styles[i % styles.length]. Files carry an opaque code (p and four hex digits), so neither a
// file name nor the drawing says which family or seed it is. Only the code and the style are printed.
//   DIR/images/<code>.<style>.svg and .png   what the reader sees (the only files a blind reading may use)
//   DIR/truth/<code>.plan.json               the truth: do not open before the readings are saved
//   DIR/key.json                             code -> seed, family, style: do not open before the readings are saved
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePlan } from './gen/gen-plans.mjs';
import { drawPlanSvg, svgToPng, STYLES } from './draw.mjs';

function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function buildBenchmark({ seed, count, out, styles = STYLES, png = true, zoom = [1, 1] }) {
  for (const s of styles) if (!STYLES.includes(s)) throw new Error(`unknown style ${s}`);
  mkdirSync(join(out, 'images'), { recursive: true });
  mkdirSync(join(out, 'truth'), { recursive: true });
  const used = new Set(), key = [];
  for (let i = 0; i < count; i++) {
    const s = seed + i, style = styles[i % styles.length];
    const { family, plan } = generatePlan(s);
    let code = `p${hash32(`planwalk-bench:${s}`).toString(16).padStart(8, '0').slice(-4)}`;
    for (let k = 1; used.has(code); k++) code = `p${hash32(`planwalk-bench:${s}:${k}`).toString(16).padStart(8, '0').slice(-4)}`;
    used.add(code);
    writeFileSync(join(out, 'truth', `${code}.plan.json`), `${JSON.stringify(plan, null, 2)}\n`);
    const svgFile = join(out, 'images', `${code}.${style}.svg`);
    const z = Math.round((zoom[0] + ((hash32(`planwalk-zoom:${s}`) % 1000) / 1000) * (zoom[1] - zoom[0])) * 100) / 100;
    writeFileSync(svgFile, drawPlanSvg(plan, { style, zoom: z }));
    if (png) svgToPng(svgFile, svgFile.replace(/\.svg$/, '.png'));
    key.push({ code, style, seed: s, family, zoom: z });
  }
  writeFileSync(join(out, 'key.json'), `${JSON.stringify(key, null, 2)}\n`);
  return key.map(({ code, style }) => ({ code, style }));
}

function main(argv) {
  const opt = { seed: null, count: null, out: null, styles: STYLES, png: true, zoom: [1, 1] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') opt.seed = Number(argv[++i]);
    else if (argv[i] === '--count') opt.count = Number(argv[++i]);
    else if (argv[i] === '--out') opt.out = argv[++i];
    else if (argv[i] === '--styles') opt.styles = argv[++i].split(',').filter(Boolean);
    else if (argv[i] === '--zoom') opt.zoom = argv[++i].split(',').map(Number);
    else if (argv[i] === '--no-png') opt.png = false;
  }
  if (!opt.out || !Number.isFinite(opt.seed) || !Number.isFinite(opt.count) || opt.count < 1) {
    process.stderr.write('usage: node eval/make-benchmark.mjs --seed N --count K --out DIR [--styles cad,hatched,sketch,scan] [--zoom LO,HI] [--no-png]\n');
    process.exit(2);
  }
  for (const r of buildBenchmark(opt)) process.stdout.write(`${r.code} ${r.style}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
