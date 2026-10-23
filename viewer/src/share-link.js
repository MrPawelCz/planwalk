// Share links: the plan travels inside the #fragment of the page address, in one of two forms.
//   #plan=<base64url of the JSON text>                the older form, any browser can read it
//   #z=<base64url of the JSON text, deflate-raw>.<sum>   shorter; needs CompressionStream to write and DecompressionStream to read
// A deflate-raw stream has no checksum of its own, so a damaged link could still inflate into a different plan. Links made here
// therefore end in '.' and a 4 byte sum of the compressed bytes; a #z= link without the sum (made by another tool) is read as it is.
// No DOM is used here, so Node can test it. Decoding never throws: it answers { ok: true, text } or { ok: false, reason }
// with reason 'empty', 'base64', 'checksum', 'unsupported', 'inflate', 'too-long' or 'timeout'.
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';

const INFLATE_TIMEOUT_MS = 5000;
const quiet = () => {};

export function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The bytes behind a base64url text, or null when it is not base64url.
export function fromBase64Url(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// FNV-1a over the bytes, as 4 bytes in base64url. Any change of a single byte changes the sum.
function sumOf(bytes) {
  let x = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) x = Math.imul(x ^ bytes[i], 0x01000193);
  return toBase64Url(new Uint8Array([x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]));
}

// Some engines have the stream classes but not the 'deflate-raw' format (Chrome before 103), so try to build one.
const supports = (Stream) => { try { return typeof Stream === 'function' && !!new Stream('deflate-raw'); } catch { return false; } };
export const canCompress = () => supports(typeof CompressionStream === 'undefined' ? undefined : CompressionStream);
export const canDecompress = () => supports(typeof DecompressionStream === 'undefined' ? undefined : DecompressionStream);

// The plan as it is written into a link: no whitespace.
export const planText = (plan) => JSON.stringify(plan ?? {});

// The older long form, '#plan=...'.
export function encodeLong(plan) {
  return `#plan=${toBase64Url(new TextEncoder().encode(planText(plan)))}`;
}

// The short form, '#z=...'; null where the browser cannot compress.
export async function encodeShort(plan) {
  if (!canCompress()) return null;
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(planText(plan))).catch(quiet);
  writer.close().catch(quiet);
  const reader = cs.readable.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return `#z=${toBase64Url(out)}.${sumOf(out)}`;
}

// Which kind of link a location.hash is: { form: 'plan' | 'z', value } or null. A '#plan=' link is read exactly as before.
export function parseHash(hash) {
  const old = /^#plan=([A-Za-z0-9_-]+)/.exec(hash);
  if (old) return { form: 'plan', value: old[1] };
  const short = /^#z=([A-Za-z0-9_.-]*)/.exec(hash);
  return short ? { form: 'z', value: short[1] } : null;
}

// Inflates with a hard cap on the text it may produce (checked while streaming, so a small hostile link cannot grow
// into gigabytes) and a time cap.
async function inflate(bytes, maxChars, timeoutMs) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(bytes).catch(quiet);
  writer.close().catch(quiet);
  const dec = new TextDecoder('utf-8', { fatal: true });
  let timer, text = '';
  const late = new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs); });
  try {
    for (;;) {
      const r = await Promise.race([reader.read(), late]);
      if (r === null) return { ok: false, reason: 'timeout' };
      if (r.done) break;
      text += dec.decode(r.value, { stream: true });
      if (text.length > maxChars) return { ok: false, reason: 'too-long' };
    }
    text += dec.decode();
    return text.length > maxChars ? { ok: false, reason: 'too-long' } : { ok: true, text };
  } catch {
    return { ok: false, reason: 'inflate' }; // not a deflate stream, cut off, or not UTF-8
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(quiet);
    writer.abort().catch(quiet);
  }
}

// value: the part after '#z='. Answers { ok: true, text } with the plan text, or { ok: false, reason }.
export async function decodeShort(value, { maxChars = MAX_PLAN_CHARS, timeoutMs = INFLATE_TIMEOUT_MS } = {}) {
  try {
    if (typeof value !== 'string' || !value) return { ok: false, reason: 'empty' };
    if (!canDecompress()) return { ok: false, reason: 'unsupported' };
    if (value.length > maxChars) return { ok: false, reason: 'too-long' };
    const dot = value.lastIndexOf('.');
    const data = dot < 0 ? value : value.slice(0, dot), sum = dot < 0 ? '' : value.slice(dot + 1); // a lone trailing '.' is punctuation
    const bytes = fromBase64Url(data);
    if (!bytes || !bytes.length) return { ok: false, reason: data ? 'base64' : 'empty' };
    if (sum && sum !== sumOf(bytes)) return { ok: false, reason: 'checksum' };
    return await inflate(bytes, maxChars, timeoutMs);
  } catch {
    return { ok: false, reason: 'inflate' };
  }
}
