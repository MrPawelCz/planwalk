// Renders the link preview images of the demo page: the furnished living room of examples/duplex-1.plan.json seen by the viewer
// (dollhouse camera, textured look, no controls) under a dark band with the name and a one line promise, 1200x630 JPEG under 150 KB.
//   node tools/make-social-preview.mjs [--lang en,pl] [--out DIR] [--viewer FILE] [--chrome PATH]
// en writes social-preview.jpg, pl writes social-preview-pl.jpg (the file tools/localize-page.mjs puts in the Polish page's og:image).
// The picture is rendered at twice the size and cropped, which is the cheapest way to look at one corner of the flat from close by.
// It starts Chrome, so on a shared machine run it through tools/chrome-lock.sh. Needs Node 22 (global WebSocket) and a built dist/.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630, MAX_BYTES = 150000;
// Orbit camera over the flat: tilt in degrees above the horizon, turn around the model, zoom below 1 is closer; crop is the
// top left corner of the 1200x630 window inside the 2400x1260 render.
const SCENE = { plan: 'examples/duplex-1.plan.json', level: 'L0', tilt: 48, turn: 0, zoom: 0.72, crop: [760, 370] };
const CARDS = {
  en: { file: 'social-preview.jpg', line: 'Turn a floor plan into a 3D flat you can walk through' },
  pl: { file: 'social-preview-pl.jpg', line: 'Rzut mieszkania w 3D, po którym możesz spacerować' },
};

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
// Trying another view: --tilt, --turn and --zoom override the camera, --crop X,Y moves the window, --crop full writes the
// whole render at half size without the band (to pick a window).
for (const k of ['tilt', 'turn', 'zoom']) if (opt(`--${k}`)) SCENE[k] = Number(opt(`--${k}`));
const full = opt('--crop') === 'full';
if (opt('--crop') && !full) SCENE.crop = opt('--crop').split(',').map(Number);
const langs = opt('--lang', 'en,pl').split(',');
const outDir = resolve(opt('--out', join(root, 'docs')));
const viewer = resolve(opt('--viewer', join(root, 'dist/planwalk-empty.html')));
if (langs.some((l) => !CARDS[l]) || typeof WebSocket === 'undefined' || !existsSync(viewer)) {
  console.error('usage: node tools/make-social-preview.mjs [--lang en,pl] [--out DIR] [--viewer FILE] [--chrome PATH]\n(Node 22 or newer; the viewer is dist/planwalk-empty.html, npm run build writes it)');
  process.exit(2);
}
const chromePath = [opt('--chrome'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'chromium', 'chromium-browser']
  .filter(Boolean).find((c) => (c.includes('/') ? existsSync(c) : spawnSync('which', [c]).status === 0));
if (!chromePath) { console.error('Chrome not found. Pass --chrome PATH.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });

const profile = mkdtempSync(join(tmpdir(), 'planwalk-preview-'));
const port = await freePort();
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', `--window-size=${W * 2},${H * 2}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { /* already gone */ } try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* best effort */ } };
process.on('exit', cleanup);

// The overlay is built from elements and text nodes in the page, so the headline never goes through an HTML string.
const OVERLAY = (line, x, y) => `(() => {
  const el = (css, text) => { const e = document.createElement('div'); e.style.cssText = css; if (text) e.textContent = text; return e; };
  const band = el('position:absolute;left:${x}px;top:${y}px;width:${W}px;height:156px;z-index:9;color:#fff;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:linear-gradient(180deg,rgba(14,27,43,.92),rgba(44,56,70,.8))');
  band.id = 'preview-band';
  band.append(el('position:absolute;left:36px;top:12px;font-size:78px;font-weight:300;letter-spacing:-1px;line-height:88px', 'planwalk'), el('position:absolute;left:38px;top:102px;font-size:33px;line-height:40px;white-space:nowrap', ${JSON.stringify(line)}));
  document.body.append(band);
})()`;

let exitCode = 0;
try {
  let target = null;
  for (let i = 0; i < 400 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* chrome still starting */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error('Chrome did not start a page in time');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('DevTools WebSocket error'))); });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W * 2, height: H * 2, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(viewer).href });
  for (let i = 0; !(await evaluate('typeof window.planwalk === "object" && typeof window.planwalk.load === "function"').catch(() => false)); i++) {
    if (i > 100) throw new Error('window.planwalk did not appear');
    await sleep(150);
  }
  const loaded = await evaluate(`window.planwalk.manualClock = true; window.planwalk.setMaterials('textured'); window.planwalk.load(${JSON.stringify(readFileSync(join(root, SCENE.plan), 'utf8'))})`);
  if (!loaded.ok) throw new Error(`the example did not load: ${JSON.stringify(loaded.errors)}`);
  await evaluate(`(() => { const s = document.createElement('style'); s.textContent = '#pw-app > :not(canvas){display:none!important}'; document.head.append(s);
    const p = window.planwalk; p.setLabels(false); p.setLevel(${JSON.stringify(SCENE.level)}); p.setMode('dollhouse'); p.setExplode(0); p.advanceTime(1500);
    p.tiltView(${SCENE.tilt}); p.rotateView(${SCENE.turn}); p.zoomView(${SCENE.zoom}); p.advanceTime(800); })()`);
  mkdirSync(outDir, { recursive: true });
  const [cx, cy] = SCENE.crop;
  for (const lang of langs) {
    if (!full) await evaluate(OVERLAY(CARDS[lang].line, cx, cy));
    let bytes = null;
    for (const quality of [88, 84, 80, 76, 72, 68, 64, 60]) {
      const clip = full ? { x: 0, y: 0, width: W * 2, height: H * 2, scale: 0.5 } : { x: cx, y: cy, width: W, height: H, scale: 1 };
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true, clip });
      bytes = Buffer.from(r.data, 'base64');
      if (bytes.length < MAX_BYTES) break;
    }
    if (bytes.length >= MAX_BYTES) throw new Error(`${CARDS[lang].file} is ${bytes.length} bytes, over the limit of ${MAX_BYTES}`);
    writeFileSync(join(outDir, CARDS[lang].file), bytes);
    console.log(`${join(outDir, CARDS[lang].file)} ${bytes.length} bytes`);
    if (!full) await evaluate('document.getElementById("preview-band").remove()');
  }
  ws.close();
} catch (err) {
  console.error(`make-social-preview failed: ${err.message}`);
  exitCode = 1;
} finally {
  cleanup();
}
process.exit(exitCode);
