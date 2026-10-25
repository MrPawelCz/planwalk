// The short confirmation after a plan got into the viewer from a paste, a dropped or opened file or a ?plan= address:
// "Loaded: <name>, 4 rooms" for about five seconds, in a polite status line under the toolbar. It takes no taps
// (pointer-events none), so it cannot cover a control. Strings live here as { en, pl } (see i18n.js); the plan name only
// reaches the page as a text node. The same line has a second use: the note after a tap on "Report a bad reading" (the plan is on the
// clipboard, the report opens in a new tab), given as show({ text: () => string }, MESSAGE_MS) and kept for 12 seconds; the text is a
// function, so it follows a change of language like the "Loaded" line does.
import { getLang, makeT } from './i18n.js';
import { pluralIndex } from './strings.js';
import { followBar } from './under-bar.js';

export const STRINGS = {
  en: { loaded: 'Loaded: {name}, {rooms}', rooms: '{n} room|{n} rooms', untitled: 'untitled plan' },
  pl: { loaded: 'Wczytano: {name}, {rooms}', rooms: '{n} pomieszczenie|{n} pomieszczenia|{n} pomieszczeń', untitled: 'plan bez nazwy' },
};
const t = makeT(STRINGS);

export const SHOW_MS = 5000;
export const MESSAGE_MS = 12000; // a sentence takes longer to read than "Loaded: name, 4 rooms"
const NAME_MAX = 60;

// "1 pomieszczenie", "2 pomieszczenia", "5 pomieszczeń" (Polish: one | 2 to 4 except 12 to 14 | the rest); "1 room", "2 rooms".
export function roomsText(n, lang = getLang()) {
  const forms = STRINGS[lang].rooms.split('|');
  return forms[Math.min(pluralIndex(n, lang), forms.length - 1)].replace(/\{n\}/g, String(n));
}

// The sentence for a plan on screen: { name, rooms } in, "Wczytano: Mieszkanie, 3 pomieszczenia" out.
export function loadedText({ name, rooms }, lang = getLang()) {
  const s = STRINGS[lang];
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const shown = trimmed ? (trimmed.length > NAME_MAX ? `${trimmed.slice(0, NAME_MAX - 3)}...` : trimmed) : s.untitled;
  return s.loaded.replace(/\{(name|rooms)\}/g, (_, slot) => (slot === 'name' ? shown : roomsText(rooms, lang))); // one pass, so a name holding "{rooms}" stays as typed
}

const CSS = `
.pw-loaded{position:absolute;left:50%;transform:translateX(-50%);z-index:5;box-sizing:border-box;width:max-content;max-width:min(560px,92vw);padding:7px 14px;font-size:14px;line-height:1.35;text-align:center;overflow-wrap:anywhere;color:#1f4d2b;background:#eaf3e6;border:1px solid #9cc79a;border-radius:12px;box-shadow:0 2px 10px rgba(60,50,40,.14);pointer-events:none;opacity:0;transition:opacity .2s}
.pw-loaded.on{opacity:1}
`;

// h is main.js's element helper, root the page element, getBar() the toolbar (the line sits just under it, and under a banner
// when one is showing). The element stays in the page, empty, so a screen reader announces the text when it appears.
export function createLoadedNote({ h, root, getBar }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);
  const el = h('div', { class: 'pw-loaded', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.append(el);
  let info = null, timer = 0;
  // info is { name, rooms } for the "Loaded" line, or { text } (a function, so it follows a change of language) for another short message.
  const draw = () => { el.textContent = info ? (typeof info.text === 'function' ? info.text() : loadedText(info)) : ''; };
  const place = followBar(el, getBar, () => root.querySelector('.pw-banner')); // under the banner while one is shown, and under the toolbar as it wraps
  const note = {
    el,
    show(next, ms = SHOW_MS) {
      info = next;
      draw();
      place();
      el.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(note.hide, ms);
    },
    hide() { clearTimeout(timer); info = null; el.classList.remove('on'); draw(); },
    refresh: draw, // after a change of language
  };
  return note;
}
