// The "PL | EN" control: two buttons, the pressed one is the page language. It lives in the Help dialog and, in the compact
// layout, in the menu. h is main.js's element helper; onPick(lang) switches the page language (main.js applyLang).
import { getLang, makeT } from './i18n.js';

export const STRINGS = {
  en: { language: 'Language' },
  pl: { language: 'Język' },
};
const t = makeT(STRINGS);

const LANGS = [['pl', 'PL', 'Polski'], ['en', 'EN', 'English']];

const CSS = `
.pw-lang{display:inline-flex;border:1px solid rgba(80,72,62,.25);border-radius:7px;overflow:hidden;vertical-align:middle}
.pw-lang button{font:inherit;color:inherit;background:#fbfaf7;border:0;border-right:1px solid rgba(80,72,62,.2);border-radius:0;padding:3px 9px;cursor:pointer;min-width:34px}
.pw-lang button:last-child{border-right:0}
.pw-lang button[aria-pressed=true]{background:#37332d;color:#fff}
`;

const all = new Set();
let cssAdded = false;

// Every control made here is redrawn by refreshLangSwitches(), so a second one (the compact menu) needs no extra wiring.
export function createLangSwitch({ h, onPick }) {
  if (!cssAdded) {
    const style = h('style', { 'data-pw': '1' });
    style.textContent = CSS;
    document.head.append(style);
    cssAdded = true;
  }
  const buttons = LANGS.map(([code, caption, name]) => h('button', { type: 'button', lang: code, title: name, onclick: () => onPick(code) }, caption));
  const el = h('span', { class: 'pw-lang', role: 'group' }, buttons);
  const sw = {
    el,
    refresh() {
      el.setAttribute('aria-label', t('language'));
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(LANGS[i][0] === getLang())));
    },
    focus: () => buttons.find((b) => b.getAttribute('aria-pressed') === 'true').focus(),
  };
  sw.refresh();
  all.add(sw);
  return sw;
}

export const refreshLangSwitches = () => all.forEach((s) => s.refresh());
