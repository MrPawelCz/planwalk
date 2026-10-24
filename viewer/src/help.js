// Help dialog: how to get from a floor plan picture to a model, the controls, the privacy facts, and real links.
// Strings live here as { en, pl }; main.js creates the dialog once and calls open() from the Help button.
import { getLang, makeT } from './i18n.js';
import { copyText, defaultPromptLang, promptFor, promptLangs } from './prompt.js';
import { openDialog } from './dialogs.js';
import { createLangSwitch } from './lang-switch.js';
import { shareHelp } from './share.js';

const REPO = 'https://github.com/MrPawelCz/planwalk';

export const STRINGS = {
  en: {
    title: 'How planwalk works',
    step1: 'Copy the prompt and give it to an AI chat that can see images, together with a picture of your floor plan.',
    step2: 'Paste the answer here (Paste JSON), or drop the .json file on this page.',
    step3: 'If problems are listed, press Copy fix request, paste it back into the same chat, and load the corrected answer.',
    controlsTitle: 'Controls',
    controlsOrbit: 'Dollhouse and Orbit: drag to turn the model, scroll or pinch to zoom.',
    controlsTop: 'Top: drag to move, scroll or pinch to zoom.',
    controlsWalk: 'Walk: on a touch screen the left half moves and the right half looks. On a computer use WASD or arrows and the mouse (click first).',
    privacyTitle: 'Privacy',
    privacy: 'Everything runs in this page. Your plan never leaves your device and nothing is stored. The picture of your plan goes only to the AI chat you choose.',
    tip: 'Tip: crop out names and addresses before sending the picture to an AI.',
    copy: 'Copy prompt', copied: 'Copied', copyFailed: 'Could not copy',
    copiedNext: 'Copied. Now open an AI chat, add the picture of your floor plan and paste the prompt.',
    language: 'Language',
    links: 'Links',
    repo: 'Project and source code', prompt: 'The prompt (text file)', faq: 'Questions and answers',
    close: 'Close',
  },
  pl: {
    title: 'Jak działa planwalk',
    step1: 'Skopiuj polecenie (prompt) i wklej je do czatu z AI, który czyta obrazy. Dodaj do rozmowy zdjęcie rzutu mieszkania (zwykle przyciskiem ze spinaczem albo plusem przy polu do pisania).',
    step2: 'Wróć na tę stronę i wklej odpowiedź AI (przycisk „Wklej odpowiedź”) albo otwórz zapisany plik .json („Otwórz plik” w oknie wklejania).',
    step3: 'Jeśli planwalk zgłosi problemy, kliknij „Kopiuj prośbę o poprawkę”, wklej ją do tego samego czatu i wczytaj poprawioną odpowiedź.',
    controlsTitle: 'Sterowanie',
    controlsOrbit: 'Makieta i Obrót: przeciągnij, żeby obracać model; rozsuń dwa palce albo przewiń kółko myszy, żeby przybliżyć.',
    controlsTop: 'Z góry: przeciągnij, żeby przesuwać; przybliżasz tak samo.',
    controlsWalk: 'Spacer na telefonie: przeciągnij palcem po lewej połowie ekranu, żeby iść, a po prawej, żeby się rozglądać. Na komputerze: strzałki lub WASD, rozglądanie myszką (najpierw kliknij).',
    privacyTitle: 'Prywatność',
    privacy: 'planwalk działa w całości na tej stronie: Twój plan nie opuszcza urządzenia i nic nie jest zapisywane. Zdjęcie rzutu trafia tylko do czatu z AI, który wybierzesz.',
    tip: 'Wskazówka: zanim wyślesz zdjęcie do AI, zasłoń na nim imiona, nazwiska i adresy (albo przytnij zdjęcie).',
    copy: 'Kopiuj polecenie', copied: 'Skopiowano', copyFailed: 'Nie udało się skopiować',
    copiedNext: 'Skopiowano. Teraz otwórz czat z AI, dodaj zdjęcie rzutu i wklej polecenie.',
    language: 'Język',
    links: 'Linki',
    repo: 'Projekt i kod źródłowy', prompt: 'Polecenie (prompt, plik tekstowy)', faq: 'Pytania i odpowiedzi',
    close: 'Zamknij',
  },
};
const t = makeT(STRINGS);

const CSS = `
.pw-help p{margin:10px 0 0}
.pw-help h3{margin:14px 0 0;font-size:13px}.pw-help h3+p{margin-top:4px}
.pw-help .pw-help-copy{margin-top:6px}
.pw-help ul{margin:6px 0 0;padding-left:18px}
.pw-help a{color:#1d5fa8}
.pw-help .pw-help-links{margin-top:10px}.pw-help form{margin-top:10px}
.pw-help .pw-help-tip{padding:6px 9px;background:#f4efe2;border-radius:8px}
`;

// The prompt file on GitHub: the Polish one only when this page carries the Polish prompt, so the link never leads to a missing file.
const promptUrl = (lang) => `${REPO}/blob/main/docs/${lang === 'pl' && promptLangs().includes('pl') ? 'PROMPT.pl.md' : 'PROMPT.md'}`;
const faqUrl = (lang) => `${REPO}/blob/main/docs/${lang === 'pl' ? 'FAQ.pl.md' : 'FAQ.md'}`;

// h is main.js's element helper, onLang(lang) switches the page language. Returns the dialog (el), open(), which rebuilds the
// text in the current language and shows it, and refresh(), which does the rebuild when the dialog is already open.
export function createHelp({ h, onLang }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);

  const el = h('dialog', { class: 'pw-dlg pw-help' });
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  const langSwitch = createLangSwitch({ h, onPick: (l) => onLang && onLang(l) });
  let copiedNext = false; // after a copy the next step stays on screen until the dialog is closed or the language changes

  function render() {
    const lang = getLang();
    const next = h('p', { class: 'pw-help-next', role: 'status', hidden: '' }, t('copiedNext'));
    next.hidden = !copiedNext;
    const copy = h('button', {
      type: 'button', class: 'pw-help-copy',
      onclick: async (e) => {
        const btn = e.currentTarget;
        const ok = await copyText(promptFor(defaultPromptLang()));
        btn.textContent = ok ? t('copied') : t('copyFailed');
        copiedNext = ok;
        next.hidden = !ok;
        setTimeout(() => { btn.textContent = t('copy'); }, 1600);
      },
    }, t('copy'));
    el.replaceChildren(
      h('h2', {}, t('title')),
      h('p', { class: 'pw-help-lang' }, `${t('language')}: `, langSwitch.el),
      h('ol', {}, h('li', {}, t('step1')), h('li', {}, t('step2')), h('li', {}, t('step3'))),
      copy,
      next,
      h('p', { class: 'pw-help-tip' }, t('tip')),
      h('h3', {}, t('controlsTitle')),
      h('p', {}, t('controlsOrbit')), h('p', {}, t('controlsTop')), h('p', {}, t('controlsWalk')),
      h('h3', {}, t('privacyTitle')),
      h('p', {}, t('privacy')),
      h('p', {}, shareHelp()),
      h('div', { class: 'pw-help-links' }, `${t('links')}:`, h('ul', {},
        h('li', {}, link(REPO, t('repo'))),
        h('li', {}, link(promptUrl(lang), t('prompt'))),
        h('li', {}, link(faqUrl(lang), t('faq'))))),
      h('form', { method: 'dialog' }, h('button', { type: 'submit' }, t('close'))));
  }

  return {
    el,
    open() { copiedNext = false; render(); openDialog(el); },
    // The pressed language button keeps the keyboard focus through the rebuild.
    refresh() {
      if (!el.hasAttribute('open')) return;
      const focused = el.contains(document.activeElement);
      copiedNext = false;
      render();
      if (focused) langSwitch.focus();
    },
  };
}
