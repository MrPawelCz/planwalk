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

// The address of the new issue. No `template` and no `labels`. It cannot pass MAX_URL by construction; if it ever did, the list of
// codes is cut in halves until it fits.
export function reportUrl(fields) {
  let limit = MAX_CODES, url;
  for (;;) {
    const { title, body } = buildReport(fields, limit);
    url = `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    if (url.length <= MAX_URL || limit === 0) return url;
    limit = Math.floor(limit / 2);
  }
}

const CSS = `
.pw-dlg.pw-report-dlg textarea{height:12em;width:min(520px,78vw)}
.pw-report-dlg p{margin:0 0 8px}
.pw-compact .pw-report-dlg form > p:first-child{padding-right:44px}
`;

// h is main.js's element helper. isUserPlan() is true for a plan the person loaded (not for the bundled example), getJson() the plan
// text for the clipboard, getIssues() the validator's { errors, warnings }, version the planwalk version. open(url) opens the tab
// (replaced in tests). Returns the toolbar button, panelButton() (a fresh button for the issues panel), the window that shows the JSON
// when copying fails (add it to the page before the phone layout is built) and update(), which shows or hides the buttons.
export function createReport({ h, isUserPlan, getJson, getIssues, version, open = (url) => window.open(url, '_blank', 'noopener') }) {
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

  // Both happen inside the tap: the copy starts before the new tab takes the focus, and the tab is opened by the tap itself, which
  // popup blockers allow. The tab cannot tell whether the copy worked, so the window follows the answer of the copy.
  function press() {
    if (!isUserPlan()) return;
    let json = '';
    try { json = getJson(); } catch { json = ''; } // a plan object that cannot be written as JSON: the issue still opens
    const url = reportUrl({ version, lang: getLang(), promptLang: defaultPromptLang(), issues: getIssues() });
    const copying = copyText(json);
    open(url);
    copying.then((ok) => { if (!ok) showJson(json); }, () => showJson(json));
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
