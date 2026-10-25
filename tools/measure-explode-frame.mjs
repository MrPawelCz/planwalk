// Measures what the dollhouse frame does while the levels pull apart, from outside the page: it reads the camera from state(),
// projects the corners of the plan (at the elevation of its first level, the ground floor) with three.js and reports where they land on the screen (CSS px).
// Usage: node tools/measure-explode-frame.mjs --viewer FILE [--plan FILE] [--query ?framing=live] [--size 1280x720] [--out FILE.json]
//                                              [--gl swiftshader|metal] [--chrome PATH]
// The viewer is dist/planwalk-empty.html or any build of it. Needs Node 22+ (global WebSocket) and Chrome; run it through
// tools/chrome-lock.sh when other browsers may be running. Prints a short summary and writes the whole record as JSON.
// What it records: five steady states (explode 0, 0.25, 0.5, 0.75, 1), then the animation frame by frame (60 steps a second) up to
// explode 1 and back to 0. For a steady state: the screen position of the four corners of the plan at the elevation of the first level (the
// ground floor), their width, the box of the whole model as the page itself reports it (framing()) and its smallest margin inside the free
// area. For an animation step: the near corner, the width and the smallest margin.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { validatePlan } from '../src/core/validate.js';
import { buildModel, modelExtent } from '../viewer/src/geometry.js';
import { boxCorners, projectedBox } from '../viewer/src/framing.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const FPS = 60, STEADY = [0, 0.25, 0.5, 0.75, 1];

function parseArgs(argv) {
  const o = { plan: join(root, 'examples/duplex-1.plan.json'), size: [1280, 720], query: '', gl: 'swiftshader' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--viewer') o.viewer = argv[++i];
    else if (a === '--plan') o.plan = argv[++i];
    else if (a === '--query') o.query = argv[++i];
    else if (a === '--size') o.size = argv[++i].split('x').map(Number);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--gl') o.gl = argv[++i];
    else if (a === '--chrome') o.chrome = argv[++i];
    else { console.error(`unknown argument ${a}`); process.exit(2); }
  }
  return o;
}

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  s.on('error', rej);
});

function connect(url) {
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener('open', () => resolveConn({
      send(method, params = {}) { const id = nextId++; return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); }); },
      close() { ws.close(); },
    }));
    ws.addEventListener('error', () => reject(new Error('DevTools WebSocket error')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result); }
    });
  });
}

const GL = {
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  metal: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
};

// The dollhouse camera as state() reports it (position, yaw and pitch of the view direction), as a three.js camera.
function cameraOf(st, w, h, fov = 50) {
  const rad = (d) => (d * Math.PI) / 180, { x, y, z, yaw, pitch } = st.camera, cp = Math.cos(rad(pitch));
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 2000);
  cam.position.set(x, y, z);
  cam.lookAt(x + cp * Math.cos(rad(yaw)), y + Math.sin(rad(pitch)), z + cp * Math.sin(rad(yaw)));
  cam.updateMatrixWorld();
  return cam;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.viewer || !existsSync(o.viewer)) { console.error('usage: node tools/measure-explode-frame.mjs --viewer FILE [--plan FILE] [--query ?framing=live] [--size 1280x720] [--out FILE.json] [--gl swiftshader|metal]'); process.exit(2); }
  if (typeof WebSocket === 'undefined') { console.error('needs Node 22 or newer (global WebSocket)'); process.exit(2); }
  const chromePath = [o.chrome, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find((c) => existsSync(c))
    ?? ['google-chrome', 'chromium', 'chromium-browser'].find((c) => spawnSync('which', [c]).status === 0);
  if (!chromePath) { console.error('Chrome not found. Pass --chrome PATH.'); process.exit(2); }
  if (!GL[o.gl]) { console.error(`--gl must be one of ${Object.keys(GL).join(', ')}`); process.exit(2); }
  const planText = readFileSync(o.plan, 'utf8');
  const model = buildModel(validatePlan(JSON.parse(planText)).normalized);
  const [W, H] = o.size;
  // The corners of the plan's bounds at the elevation of the first level (the ground floor) in world metres: x is the plan x, z is the plan y.
  const b = model.bounds, y0 = model.levels[0].elevation;
  const ground = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(([x, z]) => new THREE.Vector3(x, y0, z));

  const profile = mkdtempSync(join(tmpdir(), 'planwalk-measure-'));
  const port = await freePort();
  const chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, ...GL[o.gl],
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { /* already gone */ } try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* best effort */ } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  try {
    let target = null;
    for (let i = 0; i < 400 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* still starting */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('Chrome did not start a page in time');
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `${pathToFileURL(resolve(o.viewer)).href}${o.query}` });
    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    for (let i = 0; i < 200; i++) {
      if (await evaluate('typeof window.planwalk === "object" && typeof window.planwalk.load === "function"').catch(() => false)) break;
      await sleep(150);
      if (i === 199) throw new Error('window.planwalk did not appear');
    }
    await evaluate('window.planwalk.manualClock = true');
    const loaded = await evaluate(`(() => { const r = window.planwalk.load(${JSON.stringify(JSON.parse(planText))}); window.planwalk.advanceTime(300); return r.ok; })()`);
    if (!loaded) throw new Error('the plan did not load');
    await evaluate('window.planwalk.setMode("dollhouse"); window.planwalk.advanceTime(300)');

    let probeError = 0;
    const measure = async () => {
      const [st, fr] = await evaluate('[window.planwalk.state(), window.planwalk.framing()]');
      const cam = cameraOf(st, W, H);
      const px = ground.map((p) => { const q = p.clone().project(cam); return { x: ((q.x + 1) / 2) * W, y: ((1 - q.y) / 2) * H }; });
      const xs = px.map((p) => p.x), ys = px.map((p) => p.y);
      // The page's own box of the whole model against the same box projected here: a check of this probe, not of the page.
      const mine = projectedBox(boxCorners(modelExtent(model, st.explode)), cam, W, H);
      for (const k of ['left', 'right', 'top', 'bottom']) probeError = Math.max(probeError, Math.abs(mine[k] - fr.box[k]));
      const near = px.reduce((a, p) => (p.y > a.y ? p : a));
      return {
        explode: st.explode,
        near: { x: r2(near.x), y: r2(near.y) },
        corners: px.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
        groundWidthPx: r2(Math.max(...xs) - Math.min(...xs)),
        groundHeightPx: r2(Math.max(...ys) - Math.min(...ys)),
        model: { left: r2(fr.box.left), right: r2(fr.box.right), top: r2(fr.box.top), bottom: r2(fr.box.bottom), widthPx: r2(fr.box.right - fr.box.left), heightPx: r2(fr.box.bottom - fr.box.top) },
        minMargin: r2(Math.min(fr.margins.left, fr.margins.right, fr.margins.top, fr.margins.bottom) * 1000) / 1000,
        camera: st.camera,
      };
    };
    const settle = async (e) => { await evaluate(`window.planwalk.setExplode(${e}); window.planwalk.advanceTime(3000)`); return measure(); };
    const animate = async (e, frames = 90) => {
      const out = [];
      await evaluate(`window.planwalk.setExplode(${e})`);
      for (let i = 1; i <= frames; i++) {
        await evaluate(`window.planwalk.advanceTime(${1000 / FPS})`);
        const m = await measure();
        out.push({ frame: i, explode: m.explode, near: m.near, groundWidthPx: m.groundWidthPx, minMargin: m.minMargin });
        if (m.explode === e) break;
      }
      return out;
    };

    const steady = [];
    for (const e of STEADY) steady.push(await settle(e));
    const back = await settle(0); // the rest view again after the whole trip
    const up = await animate(1);
    await evaluate('window.planwalk.advanceTime(3000)');
    const down = await animate(0);

    const rest = steady[0], dist = (m) => Math.hypot(m.near.x - rest.near.x, m.near.y - rest.near.y);
    const all = [...steady, ...up, ...down];
    const widths = all.map((m) => m.groundWidthPx);
    const summary = {
      nearCornerRestPx: rest.near,
      nearCornerMaxShiftPx: r2(Math.max(...all.map(dist))),
      nearCornerShiftAtExplode1Px: r2(dist(steady[4])),
      groundWidthPx: { atRest: rest.groundWidthPx, atExplode1: steady[4].groundWidthPx, smallest: Math.min(...widths), largest: Math.max(...widths) },
      groundWidthChangeAtExplode1Pct: r2(((steady[4].groundWidthPx - rest.groundWidthPx) / rest.groundWidthPx) * 100),
      modelAtRestPx: { width: rest.model.widthPx, height: rest.model.heightPx },
      smallestMarginOfAll: Math.min(...all.map((m) => m.minMargin)),
      restAfterTripShiftPx: r2(Math.hypot(back.near.x - rest.near.x, back.near.y - rest.near.y)),
      animationFramesUp: up.length, animationFramesDown: down.length,
      probeErrorPx: r2(probeError),
    };
    const record = { tool: 'measure-explode-frame', viewer: basename(o.viewer), query: o.query, size: [W, H], plan: model.name, levels: model.levels.length, gl: o.gl, summary, steady, restAfterTrip: back, series: { up, down } };
    if (o.out) writeFileSync(o.out, `${JSON.stringify(record, null, 1)}\n`);
    console.log(JSON.stringify(summary, null, 1));
    cdp.close();
  } finally {
    cleanup();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
