// Small helper for the first-visit tests: a headless Chrome page driven over the DevTools Protocol (no dependencies,
// Node 22 for the global WebSocket). Not a test file itself. Callers hold the chrome-lock when running it on a shared machine.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chrome as chromePath, chromeSkip } from '../helpers/chrome.mjs';

export { chromePath };
export const skipReason = (...files) => chromeSkip || (files.find((f) => !existsSync(f)) ? `${files.find((f) => !existsSync(f))} is missing, run npm run build` : false);

// The prompt of a docs/PROMPT*.md file: its longest fenced block (what tools/build.mjs embeds), found here with a second, line based reader.
// The prompt is the whole file (docs/PROMPT*.md hold nothing but the prompt), the same normalisation as tools/build.mjs.
export function promptOfFile(md) {
  return md.replace(/\r\n/g, '\n').trim();
}

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

// Opens a viewer file in a fresh Chrome. beforeLoad is a script that runs before the page's own scripts (used to stub the clipboard).
// Returns { evaluate, shot, issues, close }; issues collects console errors and warnings and uncaught exceptions.
export async function openPage(file, { width = 1280, height = 800, mobile = false, dpr = 1, search = '', beforeLoad = '' } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'planwalk-visit-'));
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
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
    const shot = async (out, quality = 62) => { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true }); (await import('node:fs')).writeFileSync(out, Buffer.from(r.data, 'base64')); };
    return { evaluate, shot, issues, close };
  } catch (err) {
    await close();
    throw err;
  }
}
