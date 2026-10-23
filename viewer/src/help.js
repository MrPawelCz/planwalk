// Help dialog: how to get from a floor plan picture to a model, the controls, the privacy facts, and real links.
// Strings live here as { en, pl }; main.js creates the dialog once and calls open() from the Help button.
import { getLang, makeT } from './i18n.js';
import { copyText, promptFor, promptLangs } from './prompt.js';

const REPO = 'https://github.com/MrPawelCz/planwalk';

export const STRINGS = {
  en: {
    title: 'How planwalk works',
    step1: 'Copy the prompt and give it to an AI chat that can see images, together with a picture of your floor plan.',
    step2: 'Paste the answer here (Paste JSON), or drop the .json file on this page.',
    step3: 'If problems are listed, press Copy fix request, paste it back into the same chat, and load the corrected answer.',
    controls: 'Dollhouse and Orbit: drag to turn the model, scroll or pinch to zoom. Top: drag to move, scroll to zoom. Walk: WASD or arrows, mouse look (click first); on a touch screen the left half moves and the right half looks.',
    privacy: 'Everything runs in this page. Your plan never leaves your device and nothing is stored.',
    tip: 'Tip: crop out names and addresses before sending the picture to an AI.',
    copy: 'Copy prompt', copied: 'Copied', copyFailed: 'Could not copy',
    links: 'Links',
    repo: 'Project and source code', prompt: 'The prompt (text file)', faq: 'Questions and answers',
    close: 'Close',
  },
  pl: {
    title: 'Jak działa planwalk',
    step1: 'Skopiuj prompt i wklej go do czatu z AI, który widzi obrazy, razem ze zdjęciem rzutu mieszkania.',
    step2: 'Wklej odpowiedź na tej stronie albo upuść na nią plik .json.',
    step3: 'Jeśli pojawi się lista problemów, skopiuj z niej prośbę o poprawkę, wklej ją do tego samego czatu i wczytaj poprawioną odpowiedź.',
    controls: 'Widok 3D: przeciągnij, żeby obracać, przewiń kółkiem albo rozsuń dwa palce, żeby przybliżyć. Widok z góry: przeciągnij, żeby przesuwać, przewiń, żeby przybliżyć. Spacer: WASD lub strzałki, rozglądanie myszką (najpierw kliknij); na ekranie dotykowym lewa połowa porusza, a prawa służy do rozglądania się.',
    privacy: 'Wszystko dzieje się na tej stronie. Twój plan nie opuszcza urządzenia i nic nie jest zapisywane.',
    tip: 'Wskazówka: zanim wyślesz zdjęcie do AI, wytnij z niego imiona, nazwiska i adresy.',
    copy: 'Kopiuj prompt', copied: 'Skopiowano', copyFailed: 'Nie udało się skopiować',
    links: 'Linki',
    repo: 'Projekt i kod źródłowy', prompt: 'Prompt (plik tekstowy)', faq: 'Pytania i odpowiedzi',
    close: 'Zamknij',
  },
};
const t = makeT(STRINGS);

const CSS = `
.pw-help p{margin:10px 0 0}
.pw-help .pw-help-copy{margin-top:6px}
.pw-help ul{margin:6px 0 0;padding-left:18px}
.pw-help a{color:#1d5fa8}
.pw-help .pw-help-links{margin-top:10px}.pw-help form{margin-top:10px}
.pw-help .pw-help-tip{padding:6px 9px;background:#f4efe2;border-radius:8px}
`;

// The prompt file on GitHub: the Polish one only when this page carries the Polish prompt, so the link never leads to a missing file.
const promptUrl = (lang) => `${REPO}/blob/main/docs/${lang === 'pl' && promptLangs().includes('pl') ? 'PROMPT.pl.md' : 'PROMPT.md'}`;

// h is main.js's element helper. Returns the dialog (el) and open(), which rebuilds the text in the current language and shows it.
export function createHelp({ h }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);

  const el = h('dialog', { class: 'pw-dlg pw-help' });
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

  function render() {
    const lang = getLang();
    const copy = h('button', {
      type: 'button', class: 'pw-help-copy',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.textContent = (await copyText(promptFor(lang))) ? t('copied') : t('copyFailed');
        setTimeout(() => { btn.textContent = t('copy'); }, 1600);
      },
    }, t('copy'));
    el.replaceChildren(
      h('h2', {}, t('title')),
      h('ol', {}, h('li', {}, t('step1')), h('li', {}, t('step2')), h('li', {}, t('step3')), h('li', {}, t('controls')), h('li', {}, t('privacy'))),
      copy,
      h('p', { class: 'pw-help-tip' }, t('tip')),
      h('div', { class: 'pw-help-links' }, `${t('links')}:`, h('ul', {},
        h('li', {}, link(REPO, t('repo'))),
        h('li', {}, link(promptUrl(lang), t('prompt'))),
        h('li', {}, link(`${REPO}/blob/main/docs/${lang === 'pl' ? 'FAQ.pl.md' : 'FAQ.md'}`, t('faq'))))),
      h('form', { method: 'dialog' }, h('button', { type: 'submit' }, t('close'))));
  }

  return { el, open() { render(); el.showModal(); } };
}
