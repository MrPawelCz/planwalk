// Helper for the phone layout tests (not a test itself): headless Chrome on a built page with phone emulation (device metrics,
// touch, a Safari like user agent) and a few helpers to resize, tap and look at the page. Callers hold the chrome-lock when other
// browsers may be running.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const chromePath = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ...['google-chrome', 'chromium', 'chromium-browser'].map((c) => (spawnSync('which', [c]).status === 0 ? c : null))]
  .filter(Boolean).find((c) => !c.includes('/') || existsSync(c));
export const skipReason = (...files) => !chromePath ? 'Chrome or Chromium not found' : typeof WebSocket === 'undefined' ? 'Node 22 or newer is needed for the global WebSocket' : files.find((f) => !existsSync(f)) ? `${files.find((f) => !existsSync(f))} is missing, run npm run build` : false;
export const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });

function connect(url) {
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const handlers = [];
    ws.addEventListener('open', () => resolveConn({
      send(method, params = {}) { const id = nextId++; return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); }); },
      on(fn) { handlers.push(fn); },
      close() { ws.close(); },
    }));
    ws.addEventListener('error', () => reject(new Error('DevTools WebSocket error')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result); }
      else if (msg.method) for (const fn of handlers) fn(msg);
    });
  });
}

// Opens file in a fresh Chrome as a phone: width x height CSS px at the given device pixel ratio, touch on, Safari user agent.
// Returns { evaluate, resize, tap, shot, issues, close }; issues collects console errors and warnings and uncaught exceptions.
export async function openPhone(file, { width = 390, height = 664, dpr = 3, mobile = true, search = '', beforeLoad = '' } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'planwalk-phone-'));
  const port = await freePort();
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let cdp = null;
  const close = async () => {
    try { cdp?.close(); } catch { /* already closed */ }
    try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* best effort */ }
  };
  try {
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* still starting */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('Chrome did not start a page in time');
    cdp = await connect(target.webSocketDebuggerUrl);
    const issues = [];
    cdp.on((m) => {
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) issues.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      else if (m.method === 'Runtime.exceptionThrown') issues.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      else if (m.method === 'Log.entryAdded' && (m.params.entry.level === 'error' || m.params.entry.level === 'warning') && !/GPU stall due to ReadPixels/.test(m.params.entry.text)) issues.push(m.params.entry.text);
    });
    await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Page.enable');
    const metrics = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await metrics(width, height);
    if (mobile) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setUserAgentOverride', { userAgent: SAFARI });
    }
    if (beforeLoad) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: beforeLoad });
    await cdp.send('Page.navigate', { url: pathToFileURL(file).href + search });
    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    for (let i = 0; ; i++) {
      if (await evaluate('typeof window.planwalk === "object" && typeof window.planwalk.load === "function"').catch(() => false)) break;
      if (i > 100) throw new Error('window.planwalk did not appear');
      await sleep(150);
    }
    await evaluate('window.planwalk.manualClock = true; window.planwalk.advanceTime(500)');
    const settle = async (ms = 250) => { await sleep(ms); await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); };
    return {
      evaluate, settle, issues, close,
      async resize(w, h) { await metrics(w, h); await settle(); },
      // A real touch: touchStart and touchEnd in the middle of the first element matching the selector, or at x, y.
      async tap(selectorOrPoint) {
        const pt = typeof selectorOrPoint === 'string'
          ? await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selectorOrPoint)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)
          : selectorOrPoint;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await settle(150);
      },
      // Raw touch input for gestures: type is touchStart, touchMove or touchEnd; points are the fingers on the screen ([{ x, y, id }]).
      // A touchEnd takes an empty list and lifts every finger.
      async touch(type, points) {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) });
        await sleep(40);
      },
      async shot(out, quality = 55) {
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true });
        writeFileSync(out, Buffer.from(r.data, 'base64'));
      },
    };
  } catch (err) {
    await close();
    throw err;
  }
}
