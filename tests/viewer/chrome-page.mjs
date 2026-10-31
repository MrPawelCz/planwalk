// Helper for the browser tests (not a test itself): starts headless Chrome on dist/planwalk-empty.html and gives a small
// DevTools Protocol handle. Tests that use it must run through tools/chrome-lock.sh when other browsers may be running.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chrome, chromeSkip } from '../helpers/chrome.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const viewerFile = join(root, 'dist/planwalk-empty.html');
export { chrome };
export const skip = chromeSkip || (!existsSync(viewerFile) ? 'dist/planwalk-empty.html missing, run npm run build' : false);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  s.on('error', rej);
});

const READY = '!!(window.planwalk && (window.planwalk.load || window.planwalk.error)) || !!document.getElementById("pw-crash")';

// beforeLoad: a script source that runs in every new document before the page's own scripts.
export async function openPage({ query = '', hash = '', size = [960, 540], beforeLoad, ready = READY } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'planwalk-page-'));
  const port = await freePort();
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
    `--window-size=${size[0]},${size[1]}`, 'about:blank',
  ], { stdio: 'ignore' });
  const close = () => {
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* best effort */ }
  };
  try {
    let target = null;
    for (let i = 0; i < 400 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* still starting */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('Chrome did not start a page in time');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('DevTools WebSocket error'))); });
    let nextId = 1;
    const pending = new Map();
    const pageErrors = [], consoleErrors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/GPU stall due to ReadPixels/.test(msg.params.entry.text)) {
        consoleErrors.push(msg.params.entry.text);
      }
    });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('DOM.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
    if (beforeLoad) await send('Page.addScriptToEvaluateOnNewDocument', { source: beforeLoad });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expression, ms = 15000) => {
      for (let t = 0; t < ms; t += 100) {
        if (await evaluate(expression).catch(() => false)) return true;
        await sleep(100);
      }
      return false;
    };
    const navigate = async (url) => {
      await send('Page.navigate', { url: 'about:blank' }); // a link that differs only in its #fragment would not reload the page
      await send('Page.navigate', { url });
      if (!(await waitFor(ready))) throw new Error('the viewer did not come up');
    };
    await navigate(`${pathToFileURL(viewerFile).href}${query}${hash}`);
    // One key event of the real keyboard path (Input.dispatchKeyEvent): type 'keyDown' or 'keyUp'. text makes a keyDown a typed character,
    // which is what lets a space on a focused button click it on the key up. modifiers holds the keys that are down: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift.
    const key = (type, { code, key: k, vk, text, autoRepeat = false, modifiers = 0 }) => send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: type === 'keyDown' ? text : undefined, autoRepeat, modifiers });
    // A real mouse click in the middle of the first element that matches selector (it takes the focus like a person's click does).
    const clickAt = async (selector) => {
      const [x, y] = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    };
    return {
      evaluate, waitFor, navigate, pageErrors, consoleErrors, close, key, clickAt,
      async screenshot(file, quality = 70) {
        const r = await send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true });
        writeFileSync(file, Buffer.from(r.data, 'base64'));
      },
      async setFile(selector, path) {
        const { root: doc } = await send('DOM.getDocument', { depth: 1 });
        const { nodeId } = await send('DOM.querySelector', { nodeId: doc.nodeId, selector });
        await send('DOM.setFileInputFiles', { nodeId, files: [path] });
      },
    };
  } catch (err) {
    close();
    throw err;
  }
}
