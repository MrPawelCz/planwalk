// Sharing a model: copy a link that holds the plan (short form, or the long form for older browsers) and share the current view
// as a picture. Strings live here as { en, pl }; main.js creates the controls once, puts them in the toolbar and calls update().
import { getLang, makeT } from './i18n.js';
import { openDialog } from './dialogs.js';
import { loadMessage } from './load-errors.js';
import { copyText } from './prompt.js';
import { canCompress, encodeLong, encodeShort } from './share-link.js';
import { linkBase } from './site.js';

export const STRINGS = {
  en: {
    copyLink: 'Copy link',
    copyLong: 'Copy long link (older browsers)',
    shareImage: 'Share image',
    copied: 'Copied',
    note: 'The plan is stored inside the link. Whoever gets the link, and the app you send it through, can read the plan.',
    longNote: 'A longer link for older browsers: it opens in every browser. ',
    helpNote: 'Copy link makes a link that holds the whole plan. The plan is stored inside the link. Whoever gets the link, and the app you send it through, can read the plan. Older browsers cannot open the short link; then use "Copy long link (older browsers)".',
    manual: 'Copying did not work here. Press and hold the link below to copy it.',
    linkLabel: 'Link to this plan',
    close: 'Close',
    needsNewer: 'This link needs a newer browser (Safari 16.4, Chrome 103, Firefox 113 or newer). Ask the sender for the long link.',
    standaloneTip: 'A single HTML file with this plan inside, to open on a computer',
  },
  pl: {
    copyLink: 'Kopiuj link',
    copyLong: 'Kopiuj długi link',
    shareImage: 'Udostępnij obraz',
    copied: 'Skopiowano',
    note: 'Plan jest zapisany wewnątrz linku. Odczyta go każdy, kto dostanie link, także aplikacja, przez którą go wyślesz.',
    longNote: 'Dłuższy link dla starszych przeglądarek: otworzy się w każdej przeglądarce. ',
    helpNote: 'Kopiuj link tworzy link z całym planem. Plan jest zapisany wewnątrz linku. Odczyta go każdy, kto dostanie link, także aplikacja, przez którą go wyślesz. Starsze przeglądarki nie otworzą krótkiego linku: wtedy użyj „Kopiuj długi link”.',
    manual: 'Tutaj kopiowanie nie zadziałało. Przytrzymaj link poniżej i wybierz „Kopiuj”.',
    linkLabel: 'Link do tego planu',
    close: 'Zamknij',
    needsNewer: 'Ten link wymaga nowszej przeglądarki (co najmniej Safari 16.4, Chrome 103 albo Firefox 113). Poproś osobę, która go wysłała, o długi link.',
    standaloneTip: 'Jeden plik HTML z tym planem w środku, do otwarcia na komputerze',
  },
};
const t = makeT(STRINGS);

// One line for the Help dialog, and the tooltip of the Standalone HTML button.
export const shareHelp = () => t('helpNote');
export const standaloneTip = () => t('standaloneTip');

// What to tell a person for a link that could not be read; reason is the code decodeShort answers.
export const linkProblem = (reason) => (reason === 'unsupported' ? t('needsNewer') : loadMessage('invalid', 'link'));

const CSS = `
.pw-dlg.pw-share-dlg textarea{height:7em;width:min(520px,78vw)}
.pw-share-dlg p{margin:0 0 8px}
`;

// Where a link starts: the page address without its query (that only sets the language or the look) and without the fragment,
// or the public page when this one was not opened from the web, for example from a downloaded file (see site.js).
const pageUrl = () => linkBase(location, getLang());

// The PNG of Export PNG arrives as a data URL; turning it into a Blob right away keeps the share sheet inside the tap.
function pngBlob(dataUrl) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

// h is main.js's element helper. getPlan() is the plan on screen (or null), getName() its name, getSlug() a file name stem,
// getImage() a PNG data URL of the current view, download(blob, name) saves a file. Returns the toolbar controls, the
// dialog that shows a link when copying fails (add it to the page), and update(), which follows the plan on screen.
export function createShare({ h, getPlan, getName, getSlug, getImage, download }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);

  const copyBtn = h('button', { type: 'button', onclick: () => copyLink(false, copyBtn) });
  const longBtn = h('button', { type: 'button', onclick: () => copyLink(true, longBtn) });
  const imageBtn = h('button', { type: 'button', onclick: () => shareImage() });
  const area = h('textarea', { readonly: '', rows: '5', spellcheck: 'false', 'aria-label': '' });
  const text = h('p');
  const note = h('p');
  const closeBtn = h('button', { type: 'submit' });
  const dialog = h('dialog', { class: 'pw-dlg pw-share-dlg' }, h('form', { method: 'dialog' }, text, area, note, h('div', { style: 'margin-top:8px;text-align:right' }, closeBtn)));
  area.addEventListener('focus', () => area.select());

  const captions = new Map([[copyBtn, 'copyLink'], [longBtn, 'copyLong'], [imageBtn, 'shareImage']]);
  const timers = new Map();
  function label() {
    for (const [btn, key] of captions) btn.textContent = t(key);
    copyBtn.title = t('note');
    longBtn.title = t('longNote') + t('note');
    area.setAttribute('aria-label', t('linkLabel'));
    text.textContent = t('manual');
    note.textContent = t('note');
    closeBtn.textContent = t('close');
  }
  label();

  const flash = (btn) => {
    clearTimeout(timers.get(btn));
    btn.textContent = t('copied');
    timers.set(btn, setTimeout(() => { btn.textContent = t(captions.get(btn)); }, 1600));
  };

  // The short link is made ahead of the tap, so the copy itself happens inside the tap (Safari refuses clipboard writes that wait too long).
  let ready = null;
  function prepare() {
    const plan = getPlan();
    if (!plan || (ready && ready.plan === plan) || !canCompress()) return;
    const entry = { plan, frag: null };
    ready = entry;
    encodeShort(plan).then((frag) => { entry.frag = frag; }).catch(() => {});
  }

  async function copyLink(long, btn) {
    const plan = getPlan();
    if (!plan) return;
    let frag = null;
    if (!long && canCompress()) {
      if (!(ready && ready.plan === plan && ready.frag)) { try { frag = await encodeShort(plan); } catch { frag = null; } } else frag = ready.frag;
    }
    const link = pageUrl() + (frag || encodeLong(plan));
    if (await copyText(link)) { flash(btn); return; }
    area.value = link;
    openDialog(dialog);
    area.focus();
    area.select();
  }

  async function shareImage() {
    if (!getPlan()) return;
    const blob = pngBlob(getImage());
    const name = `${getSlug()}.png`;
    let file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch { file = null; }
    if (file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: getName() || 'planwalk' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // the person closed the share sheet
      }
    }
    download(blob, name);
  }

  function update() {
    const on = !!getPlan();
    for (const btn of captions.keys()) btn.disabled = !on;
    prepare();
  }

  return { controls: [copyBtn, longBtn, imageBtn], dialog, update, refresh: label };
}
