// Draws a plan (truth JSON) as an architectural drawing in SVG, and optionally as PNG through headless Chrome.
// Usage: node eval/draw.mjs <plan.json> --out FILE.svg [--style cad|hatched|sketch|scan] [--png]
// Style cad: thick black walls with gaps, door leaf and arc, window triple line, room names with areas, one dimension line.
// Style hatched: hatched wall strips, furniture symbols from the plan, white halo behind labels; areas and dimension line as in cad.
// Style sketch: outlined walls, everything shaken by a displacement filter, handwriting font, names only (no areas, no dimension line, so no scale).
// Style scan: cad rotated by 1 to 3 degrees, blurred, paper tint and grain (no JPEG artefacts).
// The drawing never shows anything the truth would give away beyond what such a drawing normally prints.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validatePlan } from '../src/core/validate.js';
import { polygonCentroid } from '../src/core/geom2d.js';

export const STYLES = ['cad', 'hatched', 'sketch', 'scan'];
const PX = 80; // pixels per metre
const MARGIN = 1.4; // metres around the drawing
const GAP = 1.8; // metres between levels drawn side by side
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const n2 = (v) => Math.round(v * 100) / 100;
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Footprint (width, depth in metres) for furniture symbols that carry no size of their own.
const FURN = {
  'bed-double': [1.6, 2.0], 'bed-single': [0.9, 2.0], sofa: [2.0, 0.9], armchair: [0.9, 0.9], 'table-coffee': [1.0, 0.55], 'tv-unit': [1.4, 0.4],
  'table-dining': [1.6, 0.9], chair: [0.45, 0.45], plant: [0.4, 0.4], wardrobe: [1.0, 0.6], desk: [1.4, 0.7], 'kitchen-counter': [1.2, 0.6],
  sink: [0.6, 0.5], stove: [0.6, 0.6], fridge: [0.6, 0.65], toilet: [0.4, 0.65], basin: [0.5, 0.4], bathtub: [1.6, 0.7],
};

function drawFurniture(m, P) {
  const [w, d] = m.size ?? FURN[m.type] ?? [0.6, 0.6];
  const a = ((m.rotation ?? 0) * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const at = (u, v) => P(m.center[0] + co * u - si * v, m.center[1] + si * u + co * v);
  const pts = (list) => list.map(([u, v]) => at(u, v).join(',')).join(' ');
  const S = 'fill="none" stroke="#444" stroke-width="1"';
  const rect = (u0, v0, u1, v1) => `<polygon points="${pts([[u0, v0], [u1, v0], [u1, v1], [u0, v1]])}" ${S}/>`;
  const line = (u0, v0, u1, v1) => `<polyline points="${pts([[u0, v0], [u1, v1]])}" ${S}/>`;
  const ell = (u, v, rx, ry) => { const [x, y] = at(u, v); return `<ellipse cx="${x}" cy="${y}" rx="${n2(rx * PX)}" ry="${n2(ry * PX)}" transform="rotate(${m.rotation ?? 0} ${x} ${y})" ${S}/>`; };
  const hw = w / 2, hd = d / 2;
  if (m.type === 'plant') return [ell(0, 0, hw, hd), ell(0, 0, hw * 0.45, hd * 0.45)];
  const out = [rect(-hw, -hd, hw, hd)];
  switch (m.type) {
    case 'bed-double': case 'bed-single': {
      const n = m.type === 'bed-double' ? 2 : 1, pw = (w - 0.1 - 0.05 * n) / n;
      for (let i = 0; i < n; i++) { const u0 = -hw + 0.05 + i * (pw + 0.05); out.push(rect(u0, -hd + 0.06, u0 + pw, -hd + 0.4)); }
      out.push(line(-hw, -hd + 0.6, hw, -hd + 0.6));
      break;
    }
    case 'sofa': case 'armchair':
      out.push(rect(-hw, -hd, hw, -hd + 0.22), rect(-hw, -hd + 0.22, -hw + 0.18, hd), rect(hw - 0.18, -hd + 0.22, hw, hd));
      break;
    case 'tv-unit': out.push(line(-hw, -hd, hw, hd)); break;
    case 'wardrobe': out.push(line(-hw, -hd, hw, hd), line(-hw, hd, hw, -hd)); break;
    case 'desk': out.push(rect(-0.2, -hd + 0.05, 0.2, -hd + 0.2)); break;
    case 'kitchen-counter': case 'bathtub': out.push(rect(-hw + 0.07, -hd + 0.07, hw - 0.07, hd - 0.07)); break;
    case 'sink': out.push(ell(0, 0, hw * 0.6, hd * 0.55)); break;
    case 'stove': for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push(ell(u * hw * 0.5, v * hd * 0.5, 0.09, 0.09)); break;
    case 'fridge': out.push(line(-hw, -hd + 0.18, hw, -hd + 0.18)); break;
    case 'toilet': out.push(rect(-hw, -hd, hw, -hd + 0.2), ell(0, 0.08, hw * 0.8, hd * 0.55)); break;
    case 'basin': out.push(ell(0, 0, hw * 0.7, hd * 0.6)); break;
    default: break;
  }
  return out;
}

function levelBox(level) {
  const pts = [...level.walls.flatMap((w) => [w.from, w.to]), ...level.rooms.flatMap((r) => r.polygon)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function wallSegments(w, opens) {
  const cuts = opens.map((o) => [Math.max(0, o.offset), Math.min(w.length, o.offset + o.width)]).sort((a, b) => a[0] - b[0]);
  const segs = [];
  let cur = 0;
  for (const [a, b] of cuts) { if (a > cur + 1e-6) segs.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < w.length - 1e-6) segs.push([cur, w.length]);
  return segs;
}

function drawStair(st, dirLabel, P) {
  const out = [];
  const dx = st.to[0] - st.from[0], dy = st.to[1] - st.from[1], len = Math.hypot(dx, dy);
  if (len < 1e-6 || st.steps < 2) return out;
  const d = [dx / len, dy / len], nrm = [-d[1], d[0]], run = len / (st.steps - 1), hw = st.width / 2;
  const at = (u, v) => P(st.from[0] + d[0] * u + nrm[0] * v, st.from[1] + d[1] * u + nrm[1] * v).join(',');
  out.push(`<polygon points="${[at(-run / 2, -hw), at(len + run / 2, -hw), at(len + run / 2, hw), at(-run / 2, hw)].join(' ')}" fill="none" stroke="#111" stroke-width="1.3"/>`);
  for (let i = 1; i < st.steps; i++) { const u = (i - 0.5) * run; out.push(`<line x1="${at(u, -hw).split(',')[0]}" y1="${at(u, -hw).split(',')[1]}" x2="${at(u, hw).split(',')[0]}" y2="${at(u, hw).split(',')[1]}" stroke="#111" stroke-width="0.8"/>`); }
  const a = at(run / 2, 0).split(','), b = at(len - run, 0).split(','), h1 = at(len - run - 0.18, 0.12).split(','), h2 = at(len - run - 0.18, -0.12).split(',');
  out.push(`<polyline points="${a.join(',')} ${b.join(',')}" fill="none" stroke="#111" stroke-width="1.2"/><polyline points="${h1.join(',')} ${b.join(',')} ${h2.join(',')}" fill="none" stroke="#111" stroke-width="1.2"/>`);
  const t = at(run / 2 + 0.05, hw + 0.28).split(',');
  out.push(`<text x="${t[0]}" y="${t[1]}" font-size="12" font-weight="700" fill="#111">${dirLabel}</text>`);
  return out;
}

function drawLevel(level, ox, oy, caption, extraStairs = [], style = 'cad') {
  const out = [];
  const wallPaint = style === 'hatched' ? 'fill="url(#hatch)" stroke="#111" stroke-width="1.5"' : style === 'sketch' ? 'fill="none" stroke="#222" stroke-width="2.4" stroke-linejoin="round"' : 'fill="#111"';
  const P = (x, y) => [n2((x + ox) * PX), n2((y + oy) * PX)];
  const pt = (p) => P(p[0], p[1]).join(',');
  const wallById = new Map(level.walls.map((w) => [w.id, w]));
  const byWall = new Map();
  for (const o of level.openings) { if (!byWall.has(o.wall)) byWall.set(o.wall, []); byWall.get(o.wall).push(o); }

  for (const w of level.walls) {
    const nx = -w.dir[1], ny = w.dir[0], h = w.thickness / 2;
    const ext = w.kind === 'exterior' ? h : 0;
    const segs = wallSegments(w, byWall.get(w.id) ?? []);
    segs.forEach(([a, b], i) => {
      const a2 = i === 0 && a <= 1e-6 ? a - ext : a, b2 = i === segs.length - 1 && b >= w.length - 1e-6 ? b + ext : b;
      const q = (u, s) => [w.from[0] + w.dir[0] * u + nx * s, w.from[1] + w.dir[1] * u + ny * s];
      out.push(`<polygon points="${[q(a2, -h), q(b2, -h), q(b2, h), q(a2, h)].map(pt).join(' ')}" ${wallPaint}/>`);
    });
  }
  for (const o of level.openings) {
    const w = wallById.get(o.wall);
    if (!w) continue;
    const at = (u, s = 0) => [w.from[0] + w.dir[0] * u - w.dir[1] * s, w.from[1] + w.dir[1] * u + w.dir[0] * s];
    if (o.type === 'window') {
      for (const s of [-w.thickness / 2, 0, w.thickness / 2]) out.push(`<line x1="${P(...at(o.offset, s))[0]}" y1="${P(...at(o.offset, s))[1]}" x2="${P(...at(o.offset + o.width, s))[0]}" y2="${P(...at(o.offset + o.width, s))[1]}" stroke="#111" stroke-width="1.2"/>`);
      out.push(`<line x1="${P(...at(o.offset, -w.thickness / 2))[0]}" y1="${P(...at(o.offset, -w.thickness / 2))[1]}" x2="${P(...at(o.offset, w.thickness / 2))[0]}" y2="${P(...at(o.offset, w.thickness / 2))[1]}" stroke="#111" stroke-width="1.2"/>`);
      out.push(`<line x1="${P(...at(o.offset + o.width, -w.thickness / 2))[0]}" y1="${P(...at(o.offset + o.width, -w.thickness / 2))[1]}" x2="${P(...at(o.offset + o.width, w.thickness / 2))[0]}" y2="${P(...at(o.offset + o.width, w.thickness / 2))[1]}" stroke="#111" stroke-width="1.2"/>`);
    } else if (o.type === 'door') {
      const left = o.opens_to === 'left';
      const sw = left ? [w.dir[1], -w.dir[0]] : [-w.dir[1], w.dir[0]]; // swing side normal
      const hingeU = o.hinge === 'end' ? o.offset + o.width : o.offset, closeU = o.hinge === 'end' ? o.offset : o.offset + o.width;
      const hinge = at(hingeU), close = at(closeU);
      const tip = [hinge[0] + sw[0] * o.width, hinge[1] + sw[1] * o.width];
      const cross = (tip[0] - hinge[0]) * (close[1] - hinge[1]) - (tip[1] - hinge[1]) * (close[0] - hinge[0]);
      const [hx, hy] = P(...hinge), [tx, ty] = P(...tip), [cx, cy] = P(...close);
      out.push(`<line x1="${hx}" y1="${hy}" x2="${tx}" y2="${ty}" stroke="#111" stroke-width="1.6"/>`);
      out.push(`<path d="M ${tx} ${ty} A ${n2(o.width * PX)} ${n2(o.width * PX)} 0 0 ${cross > 0 ? 1 : 0} ${cx} ${cy}" fill="none" stroke="#111" stroke-width="0.9"/>`);
    }
  }
  if (style === 'hatched') for (const m of level.furniture) out.push(...drawFurniture(m, P));
  for (const r of level.rooms) {
    if (r.polygon.length < 3 || r.use === 'other') continue;
    const c = polygonCentroid(r.polygon);
    // keep the label off stair runs: move it sideways into the widest free stretch of the room
    for (const st of [...level.stairs, ...extraStairs]) {
      const sx0 = Math.min(st.from[0], st.to[0]) - st.width / 2 - 0.15, sx1 = Math.max(st.from[0], st.to[0]) + st.width / 2 + 0.15;
      const sy0 = Math.min(st.from[1], st.to[1]) - 0.3, sy1 = Math.max(st.from[1], st.to[1]) + 0.3;
      if (c[0] > sx0 - 0.9 && c[0] < sx1 + 0.9 && c[1] > sy0 && c[1] < sy1) {
        const xs = r.polygon.map((q) => q[0]), a = Math.min(...xs), b = Math.max(...xs);
        const left = sx0 - a, right = b - sx1;
        c[0] = left > right ? (a + sx0) / 2 : (sx1 + b) / 2;
      }
    }
    const [x, y] = P(c[0], c[1]);
    if (style === 'sketch') {
      out.push(`<text x="${x}" y="${n2(y + 4)}" text-anchor="middle" font-size="18" font-family="Marker Felt, Bradley Hand, Chalkboard SE, Comic Sans MS, cursive" fill="#222">${esc(r.name)}</text>`);
    } else {
      const halo = style === 'hatched' ? ' stroke="#fff" stroke-width="4" paint-order="stroke"' : '';
      out.push(`<text x="${x}" y="${n2(y - 2)}" text-anchor="middle" font-size="15" font-weight="600" fill="#111"${halo}>${esc(r.name)}</text>`);
      out.push(`<text x="${x}" y="${n2(y + 15)}" text-anchor="middle" font-size="12" fill="#333"${halo}>${r.area.toFixed(1)} m²</text>`);
    }
  }
  for (const st of level.stairs) out.push(...drawStair(st, 'UP', P));
  for (const st of extraStairs) out.push(...drawStair(st, 'DN', P));
  if (caption) {
    const b = levelBox(level);
    const [x, y] = P((b.x0 + b.x1) / 2, b.y0 - 0.7);
    out.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="16" font-weight="700" fill="#111">${esc(caption)}</text>`);
  }
  return out;
}

export function drawPlanSvg(plan, { style = 'cad', zoom = 1 } = {}) {
  if (!STYLES.includes(style)) throw new Error(`unknown style ${style}`);
  const norm = validatePlan(plan).normalized;
  if (!norm) throw new Error('the plan is not usable');
  const boxes = norm.levels.map(levelBox);
  const body = [];
  let x = MARGIN, maxH = 0, minY = Infinity;
  const placed = norm.levels.map((lv, i) => {
    const b = boxes[i], ox = x - b.x0, oy = MARGIN + 0.6 - b.y0;
    x += b.x1 - b.x0 + GAP;
    maxH = Math.max(maxH, b.y1 - b.y0);
    minY = Math.min(minY, b.y0);
    return { lv, ox, oy, b };
  });
  const multi = norm.levels.length > 1;
  for (const p of placed) body.push(...drawLevel(p.lv, p.ox, p.oy, multi ? p.lv.name : '', norm.levels.flatMap((l) => l.stairs.filter((st) => st.to_level === p.lv.id)), style));
  // one dimension line under the first level: overall width
  const f = placed[0], dimY = MARGIN + 0.6 + (f.b.y1 - f.b.y0) + 0.8;
  const xa = (f.b.x0 + f.ox) * PX, xb = (f.b.x1 + f.ox) * PX, yd = dimY * PX;
  const dim = [];
  dim.push(`<g stroke="#111" stroke-width="1" fill="none"><line x1="${n2(xa)}" y1="${n2(yd)}" x2="${n2(xb)}" y2="${n2(yd)}"/><line x1="${n2(xa)}" y1="${n2(yd - 7)}" x2="${n2(xa)}" y2="${n2(yd + 7)}"/><line x1="${n2(xb)}" y1="${n2(yd - 7)}" x2="${n2(xb)}" y2="${n2(yd + 7)}"/></g>`);
  dim.push(`<text x="${n2((xa + xb) / 2)}" y="${n2(yd - 8)}" text-anchor="middle" font-size="13" fill="#111">${(f.b.x1 - f.b.x0).toFixed(2)} m</text>`);
  if (style !== 'sketch') body.push(...dim); // a sketch carries no printed scale
  const W = Math.ceil((x - GAP + MARGIN) * PX), H = Math.ceil((MARGIN + 0.6 + maxH + 0.8 + MARGIN) * PX);
  const seed = hash32(JSON.stringify(plan));
  const defs = [];
  let paper = '#fff', content = body.join(''), grain = '';
  if (style === 'hatched') defs.push('<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/><line x1="0" y1="0" x2="0" y2="7" stroke="#111" stroke-width="1.6"/></pattern>');
  if (style === 'sketch') {
    paper = '#fffdf5';
    defs.push(`<filter id="wob" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${seed % 1000}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>`);
    content = `<g filter="url(#wob)">${content}</g>`;
  }
  if (style === 'scan') {
    paper = '#f1eee6';
    const deg = (1 + (seed % 21) / 10) * (seed & 1024 ? 1 : -1); // 1.0 to 3.0 degrees, either way
    defs.push('<filter id="soft"><feGaussianBlur stdDeviation="0.8"/></filter>');
    defs.push(`<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="${seed % 1000}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.8 0 0 0 -0.75"/></filter>`);
    content = `<g filter="url(#soft)"><g transform="rotate(${deg.toFixed(2)} ${W / 2} ${H / 2})">${content}</g></g>`;
    grain = '<rect width="100%" height="100%" filter="url(#grain)" opacity="0.35"/>';
  }
  // zoom changes the pixel size of the picture only (the viewBox stays), so the scale in pixels per metre differs from plan to plan
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * zoom)}" height="${Math.round(H * zoom)}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif"><defs>${defs.join('')}</defs><rect width="100%" height="100%" fill="${paper}"/>${content}${grain}</svg>\n`;
}

function findChrome() {
  for (const c of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'chromium', 'chromium-browser']) {
    if (c.includes('/') ? existsSync(c) : spawnSync('which', [c]).status === 0) return c;
  }
  return null;
}

export function svgToPng(svgFile, pngFile) {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome or Chromium not found');
  const svg = readFileSync(svgFile, 'utf8');
  const w = Number(/ width="(\d+)"/.exec(svg)[1]), h = Number(/ height="(\d+)"/.exec(svg)[1]);
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--screenshot=${resolve(pngFile)}`, pathToFileURL(resolve(svgFile)).href], { stdio: 'ignore', timeout: 60000 });
  if (r.status !== 0 || !existsSync(pngFile)) throw new Error('Chrome could not render the drawing');
}

function main(argv) {
  const files = argv.filter((a, i) => !a.startsWith('--') && !['--out', '--style'].includes(argv[i - 1]));
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const out = opt('--out');
  if (files.length !== 1 || !out) { process.stderr.write('usage: node eval/draw.mjs <plan.json> --out FILE.svg [--style cad] [--png]\n'); process.exit(2); }
  const svg = drawPlanSvg(JSON.parse(readFileSync(files[0], 'utf8')), { style: opt('--style') ?? 'cad' });
  writeFileSync(out, svg);
  if (argv.includes('--png')) svgToPng(out, out.replace(/\.svg$/, '.png'));
  process.stdout.write(`${out}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
