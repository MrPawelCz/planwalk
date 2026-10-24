// First-visit card: shown over the bundled example. It says what the example is, gives the three steps to a model of the
// user's own flat and offers the prompt. Strings live here as { en, pl }; main.js only creates the card and calls show/hide.
import { makeT } from './i18n.js';
import { copyText, defaultPromptLang, promptFor, promptLangs } from './prompt.js';

export const STRINGS = {
  en: {
    example: 'Example',
    title: 'This is an example',
    lead: 'planwalk turns a floor plan into a 3D model you can walk through. This is how you make yours:',
    step1: 'Copy the prompt',
    step2: 'Give it to an AI chat together with a picture of your floor plan',
    step3: 'Paste the answer here',
    copy: 'Copy prompt', copied: 'Copied', copyFailed: 'Could not copy',
    copiedNext: 'Copied. Now open an AI chat, add the picture of your floor plan and paste the prompt.',
    paste: 'Paste answer', open: 'Open file', hide: 'Hide',
    promptLang: 'Prompt language',
    privacy: 'planwalk uploads and stores nothing. The picture of your plan goes only to the AI chat you choose: crop out names and addresses first.',
    collapsed: 'This is an example · How to add yours?',
  },
  pl: {
    example: 'To jest przykład',
    title: 'To jest przykład',
    lead: 'planwalk zamienia rzut mieszkania w model 3D, po którym możesz się przejść. Tak zrobisz swój:',
    step1: 'Skopiuj polecenie dla AI (prompt)',
    step2: 'Otwórz czat z AI, który przyjmuje zdjęcia, dodaj zdjęcie rzutu i wklej polecenie',
    step3: 'Wróć tutaj i wklej odpowiedź AI (wystarczy cały tekst)',
    copy: 'Kopiuj polecenie', copied: 'Skopiowano', copyFailed: 'Nie udało się skopiować',
    copiedNext: 'Skopiowano. Teraz otwórz czat z AI, dodaj zdjęcie rzutu i wklej polecenie.',
    paste: 'Wklej odpowiedź', open: 'Otwórz plik', hide: 'Ukryj',
    promptLang: 'Język polecenia',
    privacy: 'planwalk niczego nie wysyła ani nie zapisuje. Zdjęcie rzutu trafia tylko do czatu z AI, który wybierzesz: wytnij z niego imiona i adresy.',
    collapsed: 'To jest przykład · Jak dodać swój rzut?',
  },
};
const t = makeT(STRINGS);

const CSS = `
.pw-tag{padding:1px 7px;border-radius:999px;background:#e7ecf3;color:#3a4a60;font-size:11px;white-space:nowrap}
.pw-visit{position:absolute;right:10px;bottom:10px;width:min(350px,calc(100vw - 20px));box-sizing:border-box;padding:12px 14px 10px;background:rgba(255,255,255,.95);border:1px solid rgba(80,72,62,.2);border-radius:12px;box-shadow:0 2px 12px rgba(60,50,40,.15)}
.pw-visit h2{margin:0 26px 6px 0;font-size:15px}
.pw-visit-lead{margin:0 0 6px}
.pw-visit-next{margin:8px 0 0;padding:6px 9px;background:#eaf3e6;border-radius:8px;font-size:12px}
.pw-visit ol{margin:0 0 9px;padding-left:19px}.pw-visit li{margin:2px 0}
.pw-visit button{font:inherit;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.25);border-radius:7px;padding:5px 11px;cursor:pointer}
.pw-visit button:hover{background:#f0ece3}
.pw-visit .pw-primary{background:#37332d;border-color:#37332d;color:#fff}.pw-visit .pw-primary:hover{background:#4a453d}
.pw-visit-btns{display:flex;flex-wrap:wrap;gap:6px}
.pw-visit .pw-visit-x{position:absolute;top:6px;right:6px;width:28px;height:28px;padding:0;border:0;background:none;font-size:18px;line-height:1}
.pw-visit-note{margin:7px 0 0;font-size:11px;color:#6a6358}
.pw-visit-note button{padding:0 5px;margin-left:3px;font-size:11px;border-radius:4px}
.pw-visit-note button[aria-pressed=true]{background:#37332d;border-color:#37332d;color:#fff}
.pw-visit.pw-visit-line{display:flex;align-items:center;padding:0}
.pw-visit-line .pw-visit-open{flex:1;min-height:48px;padding:0 14px;text-align:left;font-size:14px;background:none;border:0;border-radius:12px 0 0 0}
.pw-visit.pw-visit-line .pw-visit-x{position:static;flex:none;width:48px;height:48px}
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
  const next = h('p', { class: 'pw-visit-next', role: 'status', hidden: '' }); // what to do after Copy, until the next tap on the card
  let promptLang = 'en';
  let compact = false, expanded = false; // on a phone the card is one line until it is tapped

  function render() {
    tag.textContent = t('example');
    el.setAttribute('aria-label', t('title'));
    next.textContent = t('copiedNext');
    el.className = compact && !expanded ? 'pw-visit pw-visit-line' : 'pw-visit';
    if (compact && !expanded) {
      el.replaceChildren(
        h('button', { type: 'button', class: 'pw-visit-open', 'aria-expanded': 'false', onclick: () => { expanded = true; render(); } }, t('collapsed')),
        h('button', { type: 'button', class: 'pw-visit-x', title: t('hide'), 'aria-label': t('hide'), onclick: hide }, '×'));
      return;
    }
    const langs = promptLangs();
    const open = findOpenFile();
    const copy = h('button', {
      type: 'button', class: 'pw-primary',
      onclick: async (e) => {
        const btn = e.currentTarget;
        const ok = await copyText(promptFor(promptLang));
        btn.textContent = ok ? t('copied') : t('copyFailed');
        next.hidden = !ok;
        setTimeout(() => { btn.textContent = t('copy'); }, 1600);
      },
    }, t('copy'));
    const langPick = langs.length > 1
      ? h('p', { class: 'pw-visit-note' }, `${t('promptLang')}:`, langs.map((l) => h('button', { type: 'button', 'aria-pressed': String(l === promptLang), onclick: () => { promptLang = l; next.hidden = true; render(); } }, l.toUpperCase())))
      : null;
    el.replaceChildren(
      h('button', { type: 'button', class: 'pw-visit-x', title: t('hide'), 'aria-label': t('hide'), onclick: hide }, '×'),
      h('h2', {}, t('title')),
      h('p', { class: 'pw-visit-lead' }, t('lead')),
      h('ol', {}, [t('step1'), t('step2'), t('step3')].map((s) => h('li', {}, s))),
      h('div', { class: 'pw-visit-btns' }, copy, h('button', { type: 'button', onclick: () => { next.hidden = true; onPaste(); } }, t('paste')), open ? h('button', { type: 'button', onclick: () => { next.hidden = true; open(); } }, t('open')) : null),
      next,
      ...(langPick ? [langPick] : []),
      h('p', { class: 'pw-visit-note' }, t('privacy')));
  }

  function show() {
    expanded = false;
    promptLang = defaultPromptLang();
    next.hidden = true;
    render();
    el.hidden = false;
  }
  function hide() { next.hidden = true; el.hidden = true; }
  // The caption next to the plan name follows what is on screen, the card does not come back by itself.
  function setExample(on) { tag.hidden = !on; }

  // The phone layout asks for the one line card; going back to a wide window gives the full card.
  function setCompact(on) {
    if (compact === on) return;
    compact = on; expanded = false;
    if (!el.hidden) render();
  }

  // A change of the page language brings the prompt language along (the language was picked by hand, so Polish in the browser list no longer counts).
  return { el, tag, show, hide, setExample, setCompact, refresh: () => { promptLang = defaultPromptLang(); next.hidden = true; render(); } };
}
