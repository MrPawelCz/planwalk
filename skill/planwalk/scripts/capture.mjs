// Headless Chrome driver for the built viewer (Chrome DevTools Protocol, no dependencies, needs Node 22+ for the global WebSocket).
// Usage: node capture.mjs <plan.json> --out DIR [--views dollhouse,explode,top,walk] [--size 1280x720]
//                          [--gif FILE] [--start "x,y,levelId,yawDeg"] [--tour "x,y;x,y;..."] [--walk-frames N]
//                          [--glb FILE] [--materials clay|textured] [--zoom F] [--tilt DEG] [--gif-width PX] [--gif-fps N] [--no-panel] [--viewer PATH] [--chrome PATH]
// One file, two homes: tools/ in the repository (viewer in dist/) and skill/planwalk/scripts/ (viewer in assets/).
// npm run build:skill copies it into the skill folder unchanged.
// Takes one PNG per view, prints viewer state() as JSON per view, reports console errors and warnings.
// --no-panel hides the issues panel in the pictures (it covers the lower left of the plan); the issues are still printed.
// --start "x,y,levelId,yawDeg[,pitchDeg]" puts the player there for the walk view (and the walk part of the gif); a positive pitch looks up, a negative one down.
// --zoom F moves the dollhouse camera closer (below 1) or further away (above 1) before the pictures and the gif; the default framing leaves a wide margin.
// --tilt DEG sets the elevation of the dollhouse camera (degrees above the horizon; the default is about 35; higher shows more floor).
// --materials picks the look: textured (the viewer's default) or clay (plain colours, handy when comparing with a drawing); it also decides what --glb exports.
// With --gif it renders a short dollhouse, explode and walk clip frame by frame (manual clock) and encodes it with ffmpeg.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The usage line shows the path as it was run. Computed on demand: process.cwd() throws when the directory is gone.
const self = () => { try { return relative(process.cwd(), process.argv[1]); } catch { return 'capture.mjs'; } };
const viewerCandidates = [join(root, 'dist/planwalk-empty.html'), join(root, 'assets/planwalk.html')];

function parseArgs(argv) {
  const opts = { views: ['dollhouse', 'explode', 'top', 'walk'], size: [1280, 720], viewer: viewerCandidates.find((p) => existsSync(p)) ?? viewerCandidates[0] };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--views') opts.views = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--size') opts.size = argv[++i].split('x').map(Number);
    else if (a === '--gif') opts.gif = argv[++i];
    else if (a === '--glb') opts.glb = argv[++i];
    else if (a === '--no-panel') opts.noPanel = true;
    else if (a === '--materials') opts.materials = argv[++i];
    else if (a === '--zoom') opts.zoom = Number(argv[++i]);
    else if (a === '--tilt') opts.tilt = Number(argv[++i]);
    else if (a === '--tour') opts.tour = argv[++i].split(';').map((s) => s.split(',').map(Number));
    else if (a === '--start') opts.start = argv[++i].split(',');
    else if (a === '--walk-frames') opts.walkFrames = Number(argv[++i]);
    else if (a === '--gif-width') opts.gifWidth = Number(argv[++i]);
    else if (a === '--gif-fps') opts.gifFps = Number(argv[++i]);
    else if (a === '--viewer') opts.viewer = argv[++i];
    else if (a === '--chrome') opts.chrome = argv[++i];
    else rest.push(a);
  }
  opts.plan = rest[0];
  return opts;
}

function findChrome(explicit) {
  const candidates = [explicit, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'chromium', 'chromium-browser'].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') ? existsSync(c) : spawnSync('which', [c]).status === 0) return c;
  }
  return null;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
    s.on('error', rej);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const handlers = [];
    ws.addEventListener('open', () => resolveConn({
      send(method, params = {}) {
        const id = nextId++;
        return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
      },
      on(fn) { handlers.push(fn); },
      close() { ws.close(); },
    }));
    ws.addEventListener('error', () => reject(new Error('DevTools WebSocket error')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      } else if (msg.method) for (const fn of handlers) fn(msg);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.plan || !opts.out) {
    console.error(`usage: node ${self()} <plan.json> --out DIR [--views dollhouse,explode,top,walk] [--size 1280x720] [--gif FILE] [--glb FILE] [--materials clay|textured] [--zoom F] [--tilt DEG] [--no-panel] [--viewer PATH] [--chrome PATH]`);
    process.exit(2);
  }
  if (opts.tilt !== undefined && !(opts.tilt >= 5 && opts.tilt <= 85)) { console.error(`--tilt must be a number from 5 to 85, not ${opts.tilt}`); process.exit(2); }
  if (opts.zoom !== undefined && !(opts.zoom >= 0.2 && opts.zoom <= 5)) { console.error(`--zoom must be a number from 0.2 to 5, not ${opts.zoom}`); process.exit(2); }
  if (opts.gifWidth !== undefined && !(opts.gifWidth >= 160 && opts.gifWidth <= 1920)) { console.error(`--gif-width must be a number from 160 to 1920, not ${opts.gifWidth}`); process.exit(2); }
  if (opts.gifFps !== undefined && !(opts.gifFps >= 4 && opts.gifFps <= 30)) { console.error(`--gif-fps must be a number from 4 to 30, not ${opts.gifFps}`); process.exit(2); }
  if ('materials' in opts && !['clay', 'textured'].includes(opts.materials)) { console.error(`--materials must be clay or textured, not ${opts.materials}`); process.exit(2); }
  if (typeof WebSocket === 'undefined') { console.error('capture needs Node 22 or newer (global WebSocket).'); process.exit(2); }
  const chromePath = findChrome(opts.chrome);
  if (!chromePath) { console.error('Chrome not found. Pass --chrome PATH or install Google Chrome or Chromium.'); process.exit(2); }
  const viewer = resolve(opts.viewer);
  if (!existsSync(viewer)) { console.error(`Viewer not found: ${viewer}. Pass --viewer PATH (the viewer is dist/planwalk-empty.html in the repository, where npm run build writes it, and assets/planwalk.html in the skill).`); process.exit(2); }
  let planText;
  try { planText = readFileSync(opts.plan, 'utf8'); } catch (err) { console.error(`Cannot read ${opts.plan}: ${err.message}`); process.exit(2); }
  mkdirSync(opts.out, { recursive: true });

  const [W, H] = opts.size;
  const profile = mkdtempSync(join(tmpdir(), 'planwalk-chrome-'));
  const port = await freePort();
  const chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
    `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { /* already gone */ } try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* best effort */ } }; // Chrome's helper processes may still be writing for a moment after the kill
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  const consoleIssues = [];
  let exitCode = 0;
  try {
    let target = null;
    for (let i = 0; i < 400 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch { /* chrome still starting */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('Chrome did not start a page in time');
    const cdp = await connect(target.webSocketDebuggerUrl);
    cdp.on((m) => {
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
        consoleIssues.push({ level: m.params.type, text: m.params.args.map((a) => a.value ?? a.description ?? '').join(' ') });
      } else if (m.method === 'Runtime.exceptionThrown') {
        consoleIssues.push({ level: 'error', text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text });
      } else if (m.method === 'Log.entryAdded' && (m.params.entry.level === 'error' || m.params.entry.level === 'warning')) {
        // SwiftShader reports its own ReadPixels cost for every screenshot; that is the driver, not the page.
        if (!/GPU stall due to ReadPixels/.test(m.params.entry.text)) consoleIssues.push({ level: m.params.entry.level, text: m.params.entry.text });
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: pathToFileURL(viewer).href });

    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    for (let i = 0; i < 100; i++) {
      if (await evaluate('typeof window.planwalk === "object" && typeof window.planwalk.load === "function"').catch(() => false)) break;
      await sleep(150);
      if (i === 99) throw new Error('window.planwalk did not appear (does this WebGL setup work? see consoleIssues)');
    }
    await evaluate('window.planwalk.manualClock = true');
    if (opts.materials) await evaluate(`window.planwalk.setMaterials(${JSON.stringify(opts.materials)})`);
    const loaded = await evaluate(`window.planwalk.load(${JSON.stringify(planText)})`);
    console.log(`load: ok=${loaded.ok}, ${loaded.errors.length} errors, ${loaded.warnings.length} warnings`);
    for (const i of [...loaded.errors, ...loaded.warnings]) console.log(`  ${i.code} ${i.path ?? ''} ${i.message}`);
    const camKey = (s) => [s.camera.x, s.camera.y, s.camera.z].map((v) => v.toFixed(2)).join(',');
    const defaultCam = camKey(await evaluate('window.planwalk.state()'));
    const applyCamera = async () => {
      if (opts.zoom && opts.zoom !== 1) await evaluate(`window.planwalk.zoomView(${opts.zoom})`);
      if (opts.tilt) await evaluate(`window.planwalk.tiltView(${opts.tilt})`);
    };
    await applyCamera();
    if (opts.noPanel) await evaluate('(() => { const s = document.createElement("style"); s.textContent = ".pw-issues{display:none!important}"; document.head.append(s); })()');

    const shot = async (file) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    };
    const stateOf = () => evaluate('window.planwalk.state()');
    const levels = (await stateOf()).counts.levels;
    const startAt = async () => {
      const [sx, sy, sl, sy2, sp] = opts.start;
      await evaluate(`window.planwalk.walkTo(${Number(sx)}, ${Number(sy)}, ${JSON.stringify(sl || null)}, ${Number(sy2 || 0)}, ${Number(sp || 0)}); window.planwalk.advanceTime(100)`);
    };

    for (const view of opts.views) {
      if (view === 'explode' && levels < 2) { console.log('view explode: skipped (single level)'); continue; }
      if (view === 'dollhouse') await evaluate('window.planwalk.setMode("dollhouse"); window.planwalk.setExplode(0); window.planwalk.advanceTime(1500)');
      else if (view === 'explode') await evaluate('window.planwalk.setMode("dollhouse"); window.planwalk.setExplode(1); window.planwalk.advanceTime(2500)');
      else if (view === 'top') await evaluate('window.planwalk.setExplode(0); window.planwalk.setMode("top"); window.planwalk.advanceTime(1500)');
      else if (view === 'walk') {
        await evaluate('window.planwalk.setMode("walk"); window.planwalk.advanceTime(300)');
        if (opts.start) await startAt();
      }
      else { console.log(`view ${view}: unknown, skipped`); continue; }
      const file = join(opts.out, `${view}.png`);
      await shot(file);
      console.log(`view ${view}: ${file}`);
      console.log(JSON.stringify(await stateOf()));
    }

    if (opts.glb) {
      const b64 = await evaluate('window.planwalk.exportGLB().then((buf) => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })');
      mkdirSync(dirname(resolve(opts.glb)), { recursive: true });
      writeFileSync(opts.glb, Buffer.from(b64, 'base64'));
      console.log(`glb: ${opts.glb} (${Buffer.byteLength(b64, 'base64')} bytes)`);
    }

    if (opts.gif) {
      const ff = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      if (ff.status !== 0) console.log('gif: ffmpeg not found, skipped');
      else {
        const frames = mkdtempSync(join(tmpdir(), 'planwalk-frames-'));
        let n = 0;
        const frame = async () => { await shot(join(frames, `${String(n++).padStart(4, '0')}.png`)); };
        const FPS = opts.gifFps ?? 15, STEP = 1000 / FPS;
        await evaluate('window.planwalk.setMode("dollhouse"); window.planwalk.setExplode(0); window.planwalk.advanceTime(300)');
        if (camKey(await stateOf()) === defaultCam) await applyCamera(); // leaving the walk view frames the model again, which drops --zoom and --tilt
        for (let i = 0; i < 20; i++) { await evaluate(`window.planwalk.rotateView(1.4); window.planwalk.advanceTime(${STEP})`); await frame(); }
        if (levels > 1) {
          await evaluate('window.planwalk.setExplode(1)');
          for (let i = 0; i < 18; i++) { await evaluate(`window.planwalk.advanceTime(${STEP})`); await frame(); }
          await evaluate('window.planwalk.setExplode(0)');
          for (let i = 0; i < 12; i++) { await evaluate(`window.planwalk.advanceTime(${STEP})`); await frame(); }
        }
        await evaluate('window.planwalk.setMode("walk"); window.planwalk.advanceTime(200)');
        if (opts.start) await startAt();
        if (opts.tour) {
          // Follow the waypoints (plan coordinates, metres), turning at most 14 degrees per frame so the camera glides.
          let wp = 0;
          for (let i = 0; i < (opts.walkFrames ?? 60) && wp < opts.tour.length; i++) {
            const st = await stateOf();
            const px = st.camera.x, py = st.camera.z;
            let [tx, ty] = opts.tour[wp];
            if (Math.hypot(tx - px, ty - py) < 0.45) { wp++; if (wp >= opts.tour.length) break; [tx, ty] = opts.tour[wp]; }
            const want = (Math.atan2(ty - py, tx - px) * 180) / Math.PI;
            const diff = ((want - st.camera.yaw + 540) % 360) - 180;
            const yaw = st.camera.yaw + Math.max(-14, Math.min(14, diff));
            const fwd = Math.max(0.25, Math.cos((diff * Math.PI) / 180)); // slow down in tight turns so a waypoint is never orbited
            await evaluate(`window.planwalk.walkTo(${px}, ${py}, null, ${yaw}); window.planwalk.walkInput({ forward: ${fwd}, run: true }); window.planwalk.advanceTime(${STEP})`);
            await frame();
          }
        } else {
          await evaluate('window.planwalk.walkInput({ forward: 1 })');
          for (let i = 0; i < 40; i++) { await evaluate(`window.planwalk.advanceTime(${STEP})`); await frame(); }
        }
        await evaluate('window.planwalk.walkInput({})');
        mkdirSync(dirname(resolve(opts.gif)), { recursive: true });
        const vf = `scale=${Math.round(opts.gifWidth ?? 760)}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`;
        const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%04d.png'), '-vf', vf, '-loop', '0', resolve(opts.gif)]);
        rmSync(frames, { recursive: true, force: true });
        console.log(enc.status === 0 ? `gif: ${opts.gif} (${n} frames)` : `gif: ffmpeg failed: ${enc.stderr?.toString()}`);
      }
    }
    cdp.close();
  } catch (err) {
    console.error(`capture failed: ${err.message}`);
    exitCode = 1;
  } finally {
    cleanup();
  }
  const errs = consoleIssues.filter((c) => c.level === 'error');
  const warns = consoleIssues.filter((c) => c.level === 'warning');
  console.log(`console: ${errs.length} errors, ${warns.length} warnings`);
  for (const c of consoleIssues) console.log(`  [${c.level}] ${String(c.text).slice(0, 300)}`);
  if (errs.length) exitCode = 1;
  process.exit(exitCode);
}

main();
