// Plain language for everything that can go wrong while a plan gets into the viewer, and the small pieces of UI that say so:
// a dismissible banner, a card for a crash, and helpers that download or read a plan with a size cap and a timeout.
// Strings stay in this module (see i18n.js); plan text only ever reaches the page as text nodes.
import { makeT } from './i18n.js';
import { pluralIndex } from './strings.js';
import { MAX_PLAN_CHARS } from '../../src/core/limits.js';
import { followBar } from './under-bar.js';

export const strings = {
  en: {
    skipped: '{n} element skipped. The rest of the plan is shown.|{n} elements skipped. The rest of the plan is shown.',
    skippedHelp: 'Press "Copy fix request" and paste it into the AI chat to get the plan corrected.',
    ignoredHelp: 'The whole plan is shown. To tidy it up, press "Copy fix request" and paste it into the AI chat.',
    skippedWall: 'its wall was skipped',
    skippedLevel: 'the level it leads to was skipped',
    ignored: '{n} property ignored: {names}. planwalk does not use it.|{n} properties ignored: {names}. planwalk does not use them.',
    skippedMore: 'and {n} more',
    kindWall: 'wall',
    kindOpening: 'opening',
    kindRoom: 'room',
    kindStair: 'stair',
    kindFurniture: 'furniture',
    kindLevel: 'level',
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
    noPlanFile: 'That file does not contain a plan. Open the file with the AI answer that holds the plan.',
  },
  pl: {
    skipped: 'Pominięto {n} element, reszta planu jest widoczna.|Pominięto {n} elementy, reszta planu jest widoczna.|Pominięto {n} elementów, reszta planu jest widoczna.',
    skippedHelp: 'Kliknij „Kopiuj prośbę o poprawkę” i wklej ją do czatu z AI, żeby poprawił plan.',
    ignoredHelp: 'Plan jest widoczny w całości. Jeśli chcesz go uporządkować, kliknij „Kopiuj prośbę o poprawkę” i wklej ją do czatu z AI.',
    skippedWall: 'jego ściana została pominięta',
    skippedLevel: 'piętro, do którego prowadzą, zostało pominięte',
    ignored: 'Zignorowano {n} nieznaną właściwość: {names}. planwalk jej nie używa.|Zignorowano {n} nieznane właściwości: {names}. planwalk ich nie używa.|Zignorowano {n} nieznanych właściwości: {names}. planwalk ich nie używa.',
    skippedMore: 'i jeszcze {n}',
    kindWall: 'ściana',
    kindOpening: 'otwór (drzwi lub okno)',
    kindRoom: 'pomieszczenie',
    kindStair: 'schody',
    kindFurniture: 'mebel',
    kindLevel: 'piętro',
    noPlan: 'W tym tekście nie ma planu. Wklej całą odpowiedź z czatu z AI: planwalk sam znajdzie w niej plan. Jeśli czat napisał, że nie widzi zdjęcia, dodaj je jeszcze raz.',
    noPlanFile: 'W tym pliku nie ma planu. Otwórz plik z odpowiedzią AI, w której jest plan.',
    cutOff: 'Plan w tym tekście jest ucięty, brakuje końca. Poproś czat, żeby wysłał cały plan jeszcze raz.',
    invalid: 'planwalk znalazł w tym tekście plan, ale w zapisie jest błąd, więc nie da się go odczytać. Poproś czat, żeby wysłał plan jeszcze raz, w jednym bloku kodu (ramce z tekstem do skopiowania).',
    decimalComma: 'Liczby muszą mieć kropkę, nie przecinek (2.5, a nie 2,5): poproś czat, żeby tak je zapisał.',
    severalPlans: 'W odpowiedzi było więcej niż jeden plan. planwalk wczytał ostatni, zwykle to wersja poprawiona.',
    tooLong: 'Ten tekst jest za długi jak na plan (limit to około 2 MB tekstu). Wklej sam JSON z planem.',
    emptyText: 'Pole jest puste. Wklej odpowiedź z czatu z AI.',
    unusable: 'W tym planie są błędy, więc planwalk nie zbuduje z niego modelu. Nadal widzisz poprzedni model. Kliknij „Kopiuj prośbę o poprawkę” i wklej ją do czatu z AI.',
    badLink: 'Plan zapisany w tym linku jest uszkodzony. Poproś osobę, która go wysłała, o nowy link.',
    notPlanDownloaded: 'Pobieranie się udało, ale ten plik to nie plan. Sprawdź, czy link prowadzi do pliku JSON z planem.',
    download: 'Nie udało się pobrać planu. Sprawdź link; możliwe też, że serwer nie pozwala innym stronom go czytać.',
    downloadTimeout: 'Pobieranie trwało dłużej niż 10 sekund, więc planwalk je przerwał. Spróbuj jeszcze raz albo zapisz plik i użyj przycisku „Otwórz plik”.',
    downloadStatus: 'Serwer odpowiedział błędem ({status}), więc plan nie został pobrany.',
    fileError: 'Nie udało się odczytać tego pliku.',
    openFile: 'Otwórz plik',
    copyFix: 'Kopiuj prośbę o poprawkę',
    copied: 'Skopiowano',
    close: 'Zamknij',
    crashTitle: 'Coś poszło nie tak i planwalk się zatrzymał.',
    crashHelp: 'Odśwież stronę. Jeśli to się powtórzy, kliknij „Kopiuj szczegóły” i dołącz je do zgłoszenia.',
    copyDetails: 'Kopiuj szczegóły',
    reload: 'Odśwież',
    noWebgl: 'Ta przeglądarka nie pokaże grafiki 3D (WebGL jest niedostępny lub wyłączony). Otwórz stronę w aktualnym Safari, Chrome lub Firefoksie. Na komputerze sprawdź też, czy włączone jest przyspieszanie sprzętowe.',
  },
};
export const t = makeT(strings);

const CSS = `
.pw-banner{position:absolute;left:50%;transform:translateX(-50%);z-index:5;box-sizing:border-box;width:max-content;max-width:min(560px,92vw);display:flex;gap:8px;align-items:center;padding:8px 8px 8px 12px;background:#fff6e5;color:#5b3a06;border:1px solid #e3b866;border-radius:10px;box-shadow:0 2px 10px rgba(60,50,40,.14)}
.pw-banner button{font:inherit;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.3);border-radius:7px;padding:3px 8px;cursor:pointer;white-space:nowrap}
.pw-banner .pw-banner-x{border:0;background:none;font-size:20px;line-height:1;padding:0 6px}
.pw-banner-detail{display:block;max-height:min(30vh,220px);overflow:auto}
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
  if (source === 'file' && kind === 'no-object') return t('noPlanFile');
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

// The elements the validator left out of a model (result.skipped) as a banner: how many, and the first `max` as lines. The kind and the
// sentence about a skipped wall or level follow the language; the id, the path and the validator's own reason stay as written (the fix
// request goes to an AI).
const KIND_KEY = { wall: 'kindWall', opening: 'kindOpening', room: 'kindRoom', stair: 'kindStair', furniture: 'kindFurniture', level: 'kindLevel' };
const REASON_KEY = { 'wall-skipped': 'skippedWall', 'level-skipped': 'skippedLevel' };

export function skippedMessage(skipped) {
  const forms = t('skipped').split('|');
  const n = skipped.length;
  return `${forms[Math.min(pluralIndex(n), forms.length - 1)].replace(/\{n\}/g, String(n))} ${t('skippedHelp')}`;
}

function skippedLine(s) {
  const why = REASON_KEY[s.reason] ? t(REASON_KEY[s.reason]) : String(s.why || '');
  const reason = why.startsWith(s.path) ? why.slice(s.path.length).replace(/^[.\s]+/, '') : why; // the path is shown first, once
  return `${t(KIND_KEY[s.kind] || 'kindWall')}${s.id ? ` "${s.id}"` : ''} (${s.path}): ${reason}`;
}

export function skippedLines(skipped, max = 10) {
  const lines = skipped.slice(0, max).map(skippedLine);
  if (skipped.length > max) lines.push(t('skippedMore', { n: skipped.length - max }));
  return lines;
}

// The unknown properties the validator left out (result.ignored) as a banner line for a plan that is shown whole: how many, and the
// names of the first three (the names are plan text and stay as written).
export function ignoredMessage(ignored) {
  const names = [...new Set(ignored.map((i) => i.key))];
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` ${t('skippedMore', { n: names.length - 3 })}` : '');
  const forms = t('ignored').split('|');
  const n = ignored.length;
  return `${forms[Math.min(pluralIndex(n), forms.length - 1)].replace(/\{n\}/g, String(n)).replace('{names}', () => shown)} ${t('ignoredHelp')}`;
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
  const extra = h('button', { type: 'button', class: 'pw-banner-more', hidden: '' }); // a second action, for the banner about an answer that could not be built
  const x = h('button', { type: 'button', class: 'pw-banner-x' }, '×');
  const el = h('div', { class: 'pw-banner', role: 'alert', hidden: '' }, h('span', {}, msg, detail), action, extra, x);
  const openers = [];
  let shown = null; // { text, act, lines, more } of the banner on screen; text and lines may be functions, which are asked again after a change of language
  const captions = () => { x.setAttribute('aria-label', t('close')); x.title = t('close'); for (const b of openers) b.textContent = t('openFile'); };
  const draw = () => {
    msg.textContent = typeof shown.text === 'function' ? shown.text() : shown.text;
    detail.replaceChildren(...((typeof shown.lines === 'function' ? shown.lines() : shown.lines) || []).map((line) => h('div', {}, line)));
    action.hidden = !shown.act;
    if (shown.act) { action.textContent = shown.act.label; action.onclick = shown.act.run; }
    extra.hidden = !shown.more;
    extra.title = (shown.more && shown.more.title) || '';
    if (shown.more && shown.more.aria) extra.setAttribute('aria-label', shown.more.aria); else extra.removeAttribute('aria-label');
    if (shown.more) { extra.textContent = shown.more.label; extra.onclick = shown.more.run; }
  };
  const place = followBar(el, getBar); // stays under the toolbar when it wraps differently (window resize, late font, other language)
  captions();
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
    // True while a banner is on screen; restore() brings the last banner back after something else hid it (a bundled example that is
    // loaded again in the other language must not take a banner about a failed paste with it).
    get up() { return !el.hidden; },
    restore() { if (shown) { draw(); place(); el.hidden = false; } },
    // text: the message, or a function that makes it (so the banner can follow a change of language); act: { label, run } or nothing;
    // lines: extra detail lines (validator messages, English: they are written for the AI), or a function that makes them;
    // more: a second action { label, run, title?, aria? } next to the first (title: the tip, aria: the name for a screen reader).
    show(text, act, lines, more) {
      shown = { text, act, lines, more };
      draw();
      place();
      el.hidden = false;
    },
    // Redraws every caption in the current language, the banner on screen included (the toolbar may wrap differently now).
    refresh() {
      captions();
      if (shown && !el.hidden) { draw(); place(); }
    },
    // A button that opens the file picker; onFile(file) gets the chosen file. Several buttons share one picker.
    openFileButton(onFile) {
      onPick = onFile;
      const b = h('button', { type: 'button' }, t('openFile'));
      b.addEventListener('click', () => fileIn.click());
      openers.push(b);
      return b;
    },
    copyFixAction(build) {
      return { get label() { return t('copyFix'); }, run: (e) => { copyToClipboard(build()); const b = e.target; b.textContent = t('copied'); setTimeout(() => { b.textContent = t('copyFix'); }, 1500); } };
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
