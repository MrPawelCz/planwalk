// Plain language for everything that can go wrong while a plan gets into the viewer, and the small pieces of UI that say so:
// a dismissible banner, a card for a crash, and helpers that download or read a plan with a size cap and a timeout.
// Strings stay in this module (see i18n.js); plan text only ever reaches the page as text nodes.
import { makeT } from './i18n.js';
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';

export const strings = {
  en: {
    noPlan: 'That text does not contain a plan. Paste the whole answer from the AI chat, planwalk finds the JSON in it.',
    cutOff: 'The plan in that text stops before the end. Ask the AI to send the whole plan again.',
    invalid: 'planwalk found a plan in that text, but there is a mistake in the JSON, so it cannot be read. Ask the AI to send the plan again as one JSON block.',
    decimalComma: 'The numbers need a decimal point, not a comma (2.5, not 2,5): ask the AI to write them that way.',
    severalPlans: 'The answer held more than one plan. planwalk loaded the last one, which is usually the corrected version.',
    tooLong: 'That text is too long for a plan (the limit is about 2 MB of text). Paste only the JSON of the plan.',
    emptyText: 'There is nothing to load. Paste the answer from the AI chat.',
    unusable: 'That plan has errors, so planwalk cannot build a model from it. The model you had is still shown.',
    badLink: 'The plan inside this link is damaged. Ask the sender for a new link.',
    notPlanDownloaded: 'The download worked, but the file is not a plan. Check that the link points to the plan JSON.',
    download: 'Could not download the plan. Check the link; the server may also not allow other sites to read it.',
    downloadTimeout: 'The download took longer than 10 seconds, so planwalk stopped it. Try again, or save the file and use Open file.',
    downloadStatus: 'The server answered with an error ({status}), so no plan was downloaded.',
    fileError: 'Could not read that file.',
    openFile: 'Open file',
    copyFix: 'Copy fix request',
    copied: 'Copied',
    close: 'Close',
    crashTitle: 'Something went wrong, so planwalk stopped.',
    crashHelp: 'Reload the page. If it happens again, press Copy details and include them when you report it.',
    copyDetails: 'Copy details',
    reload: 'Reload',
    noWebgl: 'This browser cannot show 3D (WebGL is missing or switched off). Try an up to date Safari, Chrome or Firefox, and check that hardware acceleration is on.',
  },
  pl: {
    noPlan: 'W tym tekście nie ma planu. Wklej całą odpowiedź z czatu z AI, planwalk sam znajdzie w niej JSON.',
    cutOff: 'Plan w tym tekście urywa się w połowie. Poproś AI o wysłanie całego planu jeszcze raz.',
    invalid: 'planwalk znalazł w tym tekście plan, ale w JSON jest błąd, więc nie da się go odczytać. Poproś AI o ponowne wysłanie planu jako jednego bloku JSON.',
    decimalComma: 'Liczby muszą mieć kropkę, nie przecinek (2.5, a nie 2,5): poproś AI, żeby tak je zapisało.',
    severalPlans: 'W odpowiedzi było więcej niż jeden plan. planwalk wczytał ostatni, zwykle to wersja poprawiona.',
    tooLong: 'Ten tekst jest za długi jak na plan (limit to około 2 MB tekstu). Wklej sam JSON z planem.',
    emptyText: 'Nie ma czego wczytać. Wklej odpowiedź z czatu z AI.',
    unusable: 'Ten plan zawiera błędy, więc planwalk nie zbuduje z niego modelu. Poprzedni model nadal jest na ekranie.',
    badLink: 'Plan zapisany w tym linku jest uszkodzony. Poproś nadawcę o nowy link.',
    notPlanDownloaded: 'Pobieranie się udało, ale ten plik to nie plan. Sprawdź, czy link prowadzi do pliku JSON z planem.',
    download: 'Nie udało się pobrać planu. Sprawdź link; możliwe też, że serwer nie pozwala innym stronom go czytać.',
    downloadTimeout: 'Pobieranie trwało dłużej niż 10 sekund, więc planwalk je przerwał. Spróbuj jeszcze raz albo zapisz plik i użyj Otwórz plik.',
    downloadStatus: 'Serwer odpowiedział błędem ({status}), więc plan nie został pobrany.',
    fileError: 'Nie udało się odczytać tego pliku.',
    openFile: 'Otwórz plik',
    copyFix: 'Kopiuj prośbę o poprawkę',
    copied: 'Skopiowano',
    close: 'Zamknij',
    crashTitle: 'Coś poszło nie tak i planwalk się zatrzymał.',
    crashHelp: 'Odśwież stronę. Jeśli to się powtórzy, kliknij Kopiuj szczegóły i dołącz je do zgłoszenia.',
    copyDetails: 'Kopiuj szczegóły',
    reload: 'Odśwież',
    noWebgl: 'Ta przeglądarka nie pokaże 3D (brakuje WebGL albo jest wyłączony). Spróbuj aktualnej przeglądarki Safari, Chrome lub Firefox i sprawdź, czy przyspieszanie sprzętowe jest włączone.',
  },
};
export const t = makeT(strings);

const CSS = `
.pw-banner{position:absolute;left:50%;transform:translateX(-50%);z-index:5;box-sizing:border-box;width:max-content;max-width:min(560px,92vw);display:flex;gap:8px;align-items:center;padding:8px 8px 8px 12px;background:#fff6e5;color:#5b3a06;border:1px solid #e3b866;border-radius:10px;box-shadow:0 2px 10px rgba(60,50,40,.14)}
.pw-banner button{font:inherit;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.3);border-radius:7px;padding:3px 8px;cursor:pointer;white-space:nowrap}
.pw-banner .pw-banner-x{border:0;background:none;font-size:20px;line-height:1;padding:0 6px}
.pw-banner-detail div{margin-top:4px;font:12px/1.35 ui-monospace,Menlo,monospace;word-break:break-word;overflow-wrap:anywhere}
.pw-dlg:not([open]){display:none}
`;

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const kid of kids) if (kid != null) el.append(kid);
  return el;
};

const DECIMAL_COMMA = /:\s*-?\d+,\d+(?!\d)/; // "thickness": 0,2 : the commonest reason a chat answer is not JSON

// What to tell a person for a failed extractJson (kind) or a failed download. source: 'link' for #plan=, 'download' for ?plan=.
// text (optional) is what was pasted: a syntax error in a text with a decimal comma in it gets the hint about the decimal point.
export function loadMessage(kind, source, text) {
  if (source === 'link') return t('badLink');
  if (source === 'download' && (kind === 'no-object' || kind === 'empty')) return t('notPlanDownloaded');
  const message = t({ empty: 'emptyText', 'too-long': 'tooLong', 'no-object': 'noPlan', truncated: 'cutOff', invalid: 'invalid', unusable: 'unusable' }[kind] || 'noPlan');
  return kind === 'invalid' && typeof text === 'string' && DECIMAL_COMMA.test(text) ? `${message} ${t('decimalComma')}` : message;
}

// The first errors of a plan that cannot be built, as short lines for the banner. They stay English: the fix request goes to an AI.
export function issueLines(errors, max = 2, cut = 160) {
  return (Array.isArray(errors) ? errors : []).slice(0, max).map((e) => {
    const line = `${e.code}${e.path ? ` ${e.path}` : ''}: ${e.message}`;
    if (line.length <= cut) return line;
    const end = /[\ud800-\udbff]/.test(line[cut - 4]) ? cut - 4 : cut - 3; // do not cut a surrogate pair in half
    return `${line.slice(0, end)}...`;
  });
}

// extractJson says in its repairs when an answer held several plans and it took the last one; the person is told too.
export function severalPlansMessage(repairs) {
  return (repairs || []).some((r) => /^found \d+ plans/.test(r)) ? t('severalPlans') : null;
}

export function downloadMessage(r) {
  if (r.kind === 'too-long') return t('tooLong');
  if (r.kind === 'timeout') return t('downloadTimeout');
  if (r.kind === 'status') return t('downloadStatus', { status: r.status });
  if (r.kind === 'unreadable') return t('fileError');
  return t('download');
}

export const noWebglText = () => t('noWebgl');

export function copyToClipboard(text) {
  const fallback = () => {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* clipboard not permitted */ }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
  else fallback();
}

// A visible card instead of a white page. Works without the viewer's own CSS because the failure may come before it exists.
export function reportCrash(err) {
  const message = String(err && err.message ? err.message : err);
  const details = `${err && err.stack ? err.stack : message}\n${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`;
  try {
    window.planwalk = window.planwalk || {};
    window.planwalk.error = message;
  } catch { /* the page keeps working without it */ }
  try {
    if (document.getElementById('pw-crash')) return;
    const look = 'font:inherit;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.35);border-radius:7px;padding:4px 10px;cursor:pointer';
    const copy = h('button', { type: 'button', style: look }, t('copyDetails'));
    copy.addEventListener('click', () => { copyToClipboard(details); copy.textContent = t('copied'); setTimeout(() => { copy.textContent = t('copyDetails'); }, 1500); });
    const reload = h('button', { type: 'button', style: look }, t('reload'));
    reload.addEventListener('click', () => location.reload());
    const card = h('div', { id: 'pw-crash', role: 'alert', style: 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10;box-sizing:border-box;max-width:min(440px,86vw);padding:18px 20px;text-align:center;font:14px/1.4 system-ui,sans-serif;color:#37332d;background:#fff;border:1px solid #b3321f;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.2)' },
      h('p', { style: 'margin:0 0 8px;font-weight:600' }, t('crashTitle')),
      h('p', { style: 'margin:0 0 12px' }, t('crashHelp')),
      copy, ' ', reload);
    (document.body || document.documentElement).append(card);
  } catch { /* nothing left to show it with */ }
}

// The banner for a plan that did not load, the file picker behind "Open file", and a button that opens it.
// getBar() returns the toolbar element so the banner sits just under it.
export function createNotices(root, getBar) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);
  const msg = h('span');
  const detail = h('span', { class: 'pw-banner-detail' });
  const action = h('button', { type: 'button', hidden: '' });
  const x = h('button', { type: 'button', class: 'pw-banner-x', 'aria-label': t('close'), title: t('close') }, '×');
  const el = h('div', { class: 'pw-banner', role: 'alert', hidden: '' }, h('span', {}, msg, detail), action, x);
  const fileIn = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: '' });
  root.append(el, fileIn);
  const hide = () => { el.hidden = true; };
  x.addEventListener('click', hide);
  let onPick = () => {};
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    if (f) onPick(f);
  });
  return {
    hide,
    show(text, act, lines) {
      msg.textContent = text;
      detail.replaceChildren(...(lines || []).map((line) => h('div', {}, line)));
      action.hidden = !act;
      if (act) { action.textContent = act.label; action.onclick = act.run; }
      const bar = getBar && getBar();
      el.style.top = `${bar ? Math.round(bar.getBoundingClientRect().bottom) + 8 : 10}px`;
      el.hidden = false;
    },
    // A button that opens the file picker; onFile(file) gets the chosen file. Several buttons share one picker.
    openFileButton(onFile) {
      onPick = onFile;
      const b = h('button', { type: 'button' }, t('openFile'));
      b.addEventListener('click', () => fileIn.click());
      return b;
    },
    copyFixAction(build) {
      return { label: t('copyFix'), run: (e) => { copyToClipboard(build()); const b = e.target; b.textContent = t('copied'); setTimeout(() => { b.textContent = t('copyFix'); }, 1500); } };
    },
  };
}

// Reads a chosen or dropped file. { ok: true, text } or { ok: false, kind } with kind 'too-long' or 'unreadable'.
export async function readPlanFile(file) {
  if (file.size > MAX_PLAN_CHARS * 4) return { ok: false, kind: 'too-long' };
  try { return { ok: true, text: await file.text() }; } catch { return { ok: false, kind: 'unreadable' }; }
}

// Reads a response body up to the size cap; null when it is longer than the cap.
async function readCapped(res) {
  const len = Number(res.headers && res.headers.get ? res.headers.get('content-length') : 0);
  if (len > MAX_PLAN_CHARS * 4) return null;
  if (!res.body || !res.body.getReader) {
    const s = await res.text();
    return s.length > MAX_PLAN_CHARS ? null : s;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let s = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    s += dec.decode(value, { stream: true });
    if (s.length > MAX_PLAN_CHARS) { reader.cancel().catch(() => {}); return null; }
  }
  return s + dec.decode();
}

// Downloads the text of a plan for ?plan=. { ok: true, text } or { ok: false, kind } with kind 'network' (also when the server
// does not allow other sites to read it), 'timeout', 'status' (plus status) or 'too-long'. Sends no cookies and no referrer.
export async function fetchPlanText(url, { timeoutMs = 10000, fetchFn } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await (fetchFn || fetch)(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return { ok: false, kind: 'status', status: res.status };
    const text = await readCapped(res);
    return text === null ? { ok: false, kind: 'too-long' } : { ok: true, text };
  } catch {
    return { ok: false, kind: ctl.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
