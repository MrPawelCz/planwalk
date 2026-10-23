// First-visit card: shown over the bundled example. It says what the example is, gives the three steps to a model of the
// user's own flat and offers the prompt. Strings live here as { en, pl }; main.js only creates the card and calls show/hide.
import { getLang, makeT } from './i18n.js';
import { copyText, promptFor, promptLangs } from './prompt.js';

export const STRINGS = {
  en: {
    example: 'Example',
    title: 'This is an example',
    step1: 'Copy the prompt',
    step2: 'Give it to an AI chat together with a picture of your floor plan',
    step3: 'Paste the answer here',
    copy: 'Copy prompt', copied: 'Copied', copyFailed: 'Could not copy',
    paste: 'Paste answer', open: 'Open file', hide: 'Hide',
    promptLang: 'Prompt language',
    privacy: 'Your plan stays in this page. Nothing is uploaded or stored.',
  },
  pl: {
    example: 'To jest przykład',
    title: 'To jest przykład',
    step1: 'Skopiuj prompt',
    step2: 'Wklej go do czatu z AI i dodaj zdjęcie rzutu swojego mieszkania',
    step3: 'Wklej odpowiedź tutaj',
    copy: 'Kopiuj prompt', copied: 'Skopiowano', copyFailed: 'Nie udało się skopiować',
    paste: 'Wklej odpowiedź', open: 'Otwórz plik', hide: 'Ukryj',
    promptLang: 'Język promptu',
    privacy: 'Twój plan zostaje na tej stronie. Nic nie jest wysyłane ani zapisywane.',
  },
};
const t = makeT(STRINGS);

const CSS = `
.pw-tag{padding:1px 7px;border-radius:999px;background:#e7ecf3;color:#3a4a60;font-size:11px;white-space:nowrap}
.pw-visit{position:absolute;right:10px;bottom:10px;width:min(350px,calc(100vw - 20px));box-sizing:border-box;padding:12px 14px 10px;background:rgba(255,255,255,.95);border:1px solid rgba(80,72,62,.2);border-radius:12px;box-shadow:0 2px 12px rgba(60,50,40,.15)}
.pw-visit h2{margin:0 26px 6px 0;font-size:15px}
.pw-visit ol{margin:0 0 9px;padding-left:19px}.pw-visit li{margin:2px 0}
.pw-visit button{font:inherit;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.25);border-radius:7px;padding:5px 11px;cursor:pointer}
.pw-visit button:hover{background:#f0ece3}
.pw-visit .pw-primary{background:#37332d;border-color:#37332d;color:#fff}.pw-visit .pw-primary:hover{background:#4a453d}
.pw-visit-btns{display:flex;flex-wrap:wrap;gap:6px}
.pw-visit .pw-visit-x{position:absolute;top:6px;right:6px;width:28px;height:28px;padding:0;border:0;background:none;font-size:18px;line-height:1}
.pw-visit-note{margin:7px 0 0;font-size:11px;color:#6a6358}
.pw-visit-note button{padding:0 5px;margin-left:3px;font-size:11px;border-radius:4px}
.pw-visit-note button[aria-pressed=true]{background:#37332d;border-color:#37332d;color:#fff}
@media (max-width:640px){.pw-visit{left:0;right:0;bottom:0;width:auto;border-radius:14px 14px 0 0;border-width:1px 0 0;padding:12px 14px calc(10px + env(safe-area-inset-bottom))}.pw-visit button{min-height:44px}.pw-visit .pw-visit-x{width:44px;height:44px;top:0;right:0}.pw-visit-note button{min-height:28px}}
`;

// The open-file control of this build, when it has one: the window.planwalk.openFile() hook or a .pw-open-file button.
function findOpenFile() {
  if (typeof window.planwalk?.openFile === 'function') return () => window.planwalk.openFile();
  const btn = document.querySelector('.pw-open-file');
  return btn ? () => btn.click() : null;
}

// h is main.js's element helper; onPaste opens its paste dialog. Returns the card (el), the toolbar caption (tag) and
// show/hide/setExample/refresh: the card is shown once at boot while the bundled example is on screen and hidden by any load or by Walk.
export function createFirstVisit({ h, onPaste }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);

  const el = h('div', { class: 'pw-visit', role: 'region', hidden: '' });
  const tag = h('span', { class: 'pw-tag', hidden: '' });
  let promptLang = 'en';

  function render() {
    tag.textContent = t('example');
    el.setAttribute('aria-label', t('title'));
    const langs = promptLangs();
    const open = findOpenFile();
    const copy = h('button', {
      type: 'button', class: 'pw-primary',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.textContent = (await copyText(promptFor(promptLang))) ? t('copied') : t('copyFailed');
        setTimeout(() => { btn.textContent = t('copy'); }, 1600);
      },
    }, t('copy'));
    const langPick = langs.length > 1
      ? h('p', { class: 'pw-visit-note' }, `${t('promptLang')}:`, langs.map((l) => h('button', { type: 'button', 'aria-pressed': String(l === promptLang), onclick: () => { promptLang = l; render(); } }, l.toUpperCase())))
      : null;
    el.replaceChildren(
      h('button', { type: 'button', class: 'pw-visit-x', title: t('hide'), 'aria-label': t('hide'), onclick: hide }, '×'),
      h('h2', {}, t('title')),
      h('ol', {}, [t('step1'), t('step2'), t('step3')].map((s) => h('li', {}, s))),
      h('div', { class: 'pw-visit-btns' }, copy, h('button', { type: 'button', onclick: onPaste }, t('paste')), open ? h('button', { type: 'button', onclick: open }, t('open')) : null),
      ...(langPick ? [langPick] : []),
      h('p', { class: 'pw-visit-note' }, t('privacy')));
  }

  function show() {
    promptLang = promptLangs().includes(getLang()) ? getLang() : 'en';
    render();
    el.hidden = false;
  }
  function hide() { el.hidden = true; }
  // The caption next to the plan name follows what is on screen, the card does not come back by itself.
  function setExample(on) { tag.hidden = !on; }

  return { el, tag, show, hide, setExample, refresh: () => { render(); } };
}
