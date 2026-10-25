// "Report a bad reading": the button that turns a plan the AI read wrongly into a GitHub issue. One tap copies the plan JSON (the
// text "Copy fix request" ends with) to the clipboard and opens a new tab on <repo>/issues/new, filled in with the planwalk
// version, the interface language, the prompt language the page offered and the validator's CODES with how often each came up.
// Nothing else of the plan reaches the address: no room names, no ids, no paths, and none of the validator's messages (they quote
// the plan). The plan itself goes to the clipboard, never into the address; when the clipboard refuses, a window shows the JSON in
// a field to copy by hand. The page sends nothing: the new tab is a navigation the tap asks for.
// reportUrl() and buildReport() are pure (no DOM, no clock, no randomness), so Node tests them; createReport() holds the DOM part.
import { getLang } from './i18n.js';
import { REPO } from './site.js';
import { copyText, defaultPromptLang } from './prompt.js';
import { openDialog } from './dialogs.js';
import { T } from './strings.js';

export const MAX_URL = 6000; // characters of the finished address, after encoding
export const MAX_CODES = 20; // different codes listed in the text
export const MAX_TITLE_CODES = 5; // and in the title
export const TITLE = 'Bad reading'; // always English, like the repository; the text below follows the interface language

// The text of the issue in both languages. The labels end in a colon
// inside the bold marks, and .github/ISSUE_TEMPLATE/bad-reading.md carries the same ones (a test keeps both equal).
export const STRINGS = {
  en: {
    version: 'planwalk version:', uiLang: 'Interface language:', promptLang: 'Prompt language offered:',
    codes: 'Validator codes (no messages):', none: 'none', more: '(more codes: {n})',
    model: 'AI model and chat:', wrong: 'What looks wrong:',
    json: 'The JSON:',
    jsonNote: 'the plan is on my clipboard (copied by the "Report a bad reading" button). I will paste it below after covering names and addresses.',
    publicLead: 'This issue is public.',
    publicNote: 'Anyone can read it once you submit it, so keep names, addresses and anything private out of it.',
  },
  pl: {
    version: 'Wersja planwalk:', uiLang: 'Język interfejsu:', promptLang: 'Zaproponowany język polecenia:',
    codes: 'Kody walidatora (bez komunikatów):', none: 'brak', more: '(kolejne kody: {n})',
    model: 'Model AI i czat:', wrong: 'Co wygląda źle:',
    json: 'JSON planu:',
    jsonNote: 'plan jest w moim schowku (skopiował go przycisk „Zgłoś zły odczyt”). Wkleję go poniżej po zasłonięciu imion i adresów.',
    publicLead: 'To zgłoszenie będzie publiczne.',
    publicNote: 'Po wysłaniu przeczyta je każdy, więc nie wpisuj w nim imion, adresów ani niczego prywatnego.',
  },
};

const CODE = /^[EW][0-9]{3}$/; // the shape of a validator code; anything else in an issue's code field is dropped
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const langOf = (l) => (l === 'pl' ? 'pl' : 'en');

// [[code, count], ...] sorted by code (E before W, then by number). issues is { errors, warnings } as the validator answers, or a
// list. Only the code of an issue is read, and only when it has the validator's shape, so nothing else of the plan can travel.
export function tallyCodes(issues) {
  const list = Array.isArray(issues) ? issues : [...((issues && issues.errors) || []), ...((issues && issues.warnings) || [])];
  const counts = new Map();
  for (const issue of list) {
    const code = issue && typeof issue.code === 'string' ? issue.code : '';
    if (CODE.test(code)) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// { title, body } for the issue: up to `limit` codes in the text (MAX_CODES) and up to MAX_TITLE_CODES in the title.
// fields: { version, lang, promptLang, issues }. The version, languages and codes are checked here, so the address has a size
// that no plan can change.
export function buildReport({ version, lang = getLang(), promptLang = lang, issues } = {}, limit = MAX_CODES) {
  const s = STRINGS[langOf(lang)];
  const tally = tallyCodes(issues);
  const shown = tally.slice(0, Math.max(0, limit));
  const rest = tally.length - shown.length;
  const list = shown.length
    ? shown.map(([code, n]) => `${code} x${n}`).join(', ') + (rest > 0 ? ` ${s.more.replace('{n}', String(rest))}` : '')
    : s.none;
  const body = [
    `**${s.version}** ${typeof version === 'string' && VERSION.test(version) ? version : 'unknown'}`,
    `**${s.uiLang}** ${langOf(lang)}`,
    `**${s.promptLang}** ${langOf(promptLang)}`,
    `**${s.codes}** ${list}`,
    '',
    `**${s.model}** `,
    '',
    `**${s.wrong}** `,
    '',
    `**${s.json}** ${s.jsonNote}`,
    '',
    `**${s.publicLead}** ${s.publicNote}`,
  ].join('\n');
  const codes = tally.slice(0, MAX_TITLE_CODES).map(([code]) => code);
  return { title: codes.length ? `${TITLE}: ${codes.join(' ')}` : TITLE, body };
}

// The address of the new issue. No `template` and no `labels`. Its size cannot pass MAX_URL by construction (the text is fixed, the
// list of codes is cut at MAX_CODES and every code has the same shape), and tests/viewer/report.test.mjs measures the longest one.
export function reportUrl(fields) {
  const { title, body } = buildReport(fields);
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// What one tap does, for a plan on screen and for an answer that could not be built into a model alike: the copy starts before the new
// tab takes the focus, and the tab is opened by the tap itself, which popup blockers allow. The tab cannot tell whether the copy worked
// (window.open with noopener always answers null), so the page follows the answer of the copy: onSent() when the JSON is on the
// clipboard (the person is told so), onFailed(json) when it is not (a window shows the JSON). copy, open, onSent and onFailed are given
// by the caller, so Node tests the order and the address without a browser. Resolves when the copy has answered (at once for an empty
// json, which is not copied); it never rejects, and an open() that throws is ignored (the copy still tells the person).
export function sendReport({ json, issues, version, lang = getLang(), promptLang = lang, copy, open, onSent = () => {}, onFailed = () => {} }) {
  const url = reportUrl({ version, lang, promptLang, issues });
  const text = typeof json === 'string' ? json : '';
  const openTab = () => { try { open(url); } catch { /* a tab that cannot be opened (a sandboxed frame, a replaced window.open) must not take the note or the window with it */ } };
  // No text at all (the plan could not be written as JSON): the issue opens, and the page claims no copy, shows no note and no empty window,
  // and leaves what is on the clipboard alone.
  if (text === '') { openTab(); return Promise.resolve(); }
  let copying;
  try { copying = Promise.resolve(copy(text)); } catch (err) { copying = Promise.reject(err); } // a copy that throws is a copy that failed: the tab still opens
  openTab();
  return copying.then((ok) => { if (ok) onSent(); else onFailed(text); }, () => onFailed(text)).catch(() => {}); // nothing the callbacks throw leaves a rejection behind
}

const CSS = `
.pw-dlg.pw-report-dlg textarea{height:12em;width:min(520px,78vw)}
.pw-report-dlg p{margin:0 0 8px}
.pw-compact .pw-report-dlg form > p:first-child{padding-right:44px}
`;

// h is main.js's element helper. isUserPlan() is true for a plan the person loaded (not for the bundled example), getJson() the plan
// text for the clipboard, getIssues() the validator's { errors, warnings }, version the planwalk version. onSent() tells the person that
// the plan is on the clipboard and the report is opening. open(url) opens the tab (replaced in tests). Returns the toolbar button,
// panelButton() (a fresh button for the issues panel), action(getData) ({ label, title, aria, run } for a banner about an answer that could not be
// built into a model; getData() answers { json, issues } of that answer), the window that shows the JSON when copying fails (add it to
// the page before the phone layout is built) and update(), which shows or hides the buttons.
export function createReport({ h, isUserPlan, getJson, getIssues, version, onSent = () => {}, open = (url) => window.open(url, '_blank', 'noopener,noreferrer') }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);

  const area = h('textarea', { readonly: '', rows: '8', spellcheck: 'false', 'aria-label': T.reportLabel });
  area.addEventListener('focus', () => area.select());
  const dialog = h('dialog', { class: 'pw-dlg pw-report-dlg' },
    h('form', { method: 'dialog' }, h('p', {}, T.reportCopyFailed), area,
      h('div', { style: 'margin-top:8px;text-align:right' }, h('button', { type: 'submit' }, T.reportClose))));

  function showJson(json) {
    area.value = json;
    openDialog(dialog);
    area.focus();
    area.select();
    area.scrollTop = 0; // selecting everything scrolls to the end of the text; show it from the top
  }

  // Every tap, from the buttons and from the banner, goes through sendReport().
  const send = ({ json, issues }) => sendReport({ json, issues, version, lang: getLang(), promptLang: defaultPromptLang(), copy: copyText, open, onSent, onFailed: showJson });
  function press() {
    if (!isUserPlan()) return;
    let json = '';
    try { json = getJson(); } catch { json = ''; } // a plan object that cannot be written as JSON: the issue still opens
    send({ json, issues: getIssues() });
  }
  function action(getData) {
    return {
      get label() { return String(T.reportBad); },
      get title() { return String(T.reportBadTip); }, // the same tip as the toolbar button
      get aria() { return String(T.reportBadAnswer); }, // says which plan it is about: the answer that was pasted, not the one on screen
      run: () => {
        let data;
        try { data = getData(); } catch { data = { json: '', issues: [] }; }
        send(data);
      },
    };
  }

  const buttons = new Set();
  const make = (cls) => {
    const b = h('button', { type: 'button', class: cls, title: T.reportBadTip, hidden: '', onclick: press }, T.reportBad);
    buttons.add(b);
    return b;
  };
  const toolbarButton = make('pw-report');

  return {
    toolbarButton,
    dialog,
    action,
    panelButton() {
      for (const b of buttons) if (b !== toolbarButton && !b.isConnected) buttons.delete(b); // the buttons of earlier panels
      const b = make('pw-report pw-report-panel');
      b.hidden = !isUserPlan();
      return b;
    },
    update() {
      const on = !!isUserPlan();
      for (const b of buttons) b.hidden = !on;
    },
  };
}
