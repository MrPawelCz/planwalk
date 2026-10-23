// Phone layout. A narrow window (700 px or less) or a short one (450 px or less, a phone on its side) gets the compact layout:
// a one row top bar (brand, plan name, issues badge, Menu), a bottom bar with the four modes, and a Menu sheet that holds every
// other control. main.js builds the desktop toolbar as always; this module moves the same elements between the toolbar and the
// sheet, so their handlers and state stay where they were. The layout is decided here in JS and shown as classes on the root
// (pw-compact, plus pw-landscape for the one-bar variant), so a test can drive it by resizing the window.
// Strings live here as { en, pl }; other modules put their controls into the Menu with registerExtra() (the end of the Menu, and the
// desktop toolbar) or registerMenuHead() (the title row, phone only).
import { makeT } from './i18n.js';

export const STRINGS = {
  en: {
    menu: 'Menu', close: 'Close', openFile: 'Open file', issues: 'Issues: {n}',
    walkLeft: 'Walk', walkRight: 'Look around', touchHint: 'Drag the left half to walk, the right half to look',
  },
  pl: {
    menu: 'Menu', close: 'Zamknij', openFile: 'Otwórz plik', issues: 'Problemy: {n}',
    walkLeft: 'Idź', walkRight: 'Rozglądaj się', touchHint: 'Lewa połowa: idź, prawa: rozglądaj się',
  },
};
const t = makeT(STRINGS);

// 'landscape' (a short window: one top bar, no bottom bar), 'portrait' (a narrow one) or 'desktop'.
export const layoutKind = (w, h) => (h <= 450 ? 'landscape' : w <= 700 ? 'portrait' : 'desktop');

const touchDevice = () => {
  try { return window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : (navigator.maxTouchPoints || 0) > 0; } catch { return false; }
};

const CSS = `
.pw-name{color:#5f574c}
.pw-mini{pointer-events:none}
.pw-issues-btn{font:inherit;font-size:11px;color:#6e4d0c;background:#fff3d6;border:1px solid #d4a84a;border-radius:999px;padding:1px 8px;cursor:pointer;white-space:nowrap}
.pw-issues-btn.e{color:#8f2514;background:#fde6e1;border-color:#d98474}
.pw-issues-close{float:right;position:sticky;top:0;width:28px;height:28px;margin:-2px -4px 0 6px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:20px;line-height:1;cursor:pointer}
.pw-modebar,.pw-scrim,.pw-sheet,.pw-walkzones,.pw-touchhint{display:none}
.pw-compact{--pw-modebar-h:0px}
.pw-compact:not(.pw-landscape){--pw-modebar-h:calc(60px + env(safe-area-inset-bottom))}
.pw-compact .pw-bar{z-index:3;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));height:52px;box-sizing:border-box;flex-wrap:nowrap;gap:8px;padding:3px 4px 3px 12px;font-size:14px}
.pw-compact .pw-brand{margin:0;flex:none}
.pw-compact .pw-name{flex:1 1 0;min-width:0;max-width:none}
.pw-compact .pw-bar button{min-height:44px;min-width:44px;font-size:15px;border-radius:10px;padding:4px 12px}
.pw-compact .pw-bar .pw-seg{flex:none}
.pw-compact .pw-bar .pw-seg button{border-radius:0;padding:4px 10px;font-size:14px}
.pw-compact .pw-bar .pw-issues-btn{font-size:14px;font-weight:600;min-width:44px;border-radius:22px}
.pw-compact .pw-menu-btn{font-weight:600}
.pw-compact .pw-modebar{display:flex;position:absolute;z-index:4;left:0;right:0;bottom:0;box-sizing:border-box;padding:6px max(8px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));background:rgba(255,255,255,.94);box-shadow:0 -1px 0 rgba(80,72,62,.18)}
.pw-compact .pw-modebar[hidden]{display:none}
.pw-modebar .pw-seg{flex:1;gap:6px;border:0;border-radius:0;overflow:visible}
.pw-modebar button{flex:1;min-height:48px;font:inherit;font-size:15px;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.25);border-radius:10px;cursor:pointer}
.pw-modebar .pw-seg button,.pw-modebar .pw-seg button:last-child{border:1px solid rgba(80,72,62,.25);border-radius:10px}
.pw-modebar button.on{background:#37332d;color:#fff}
.pw-modebar button:disabled{opacity:.4}
.pw-compact .pw-scrim{display:block;position:absolute;z-index:6;inset:0;background:rgba(40,36,30,.32)}
.pw-compact .pw-scrim[hidden]{display:none}
.pw-compact .pw-sheet{display:block;position:absolute;z-index:7;left:0;right:0;bottom:0;max-height:86%;overflow:auto;box-sizing:border-box;padding:0 14px calc(12px + env(safe-area-inset-bottom));background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 22px rgba(40,36,30,.24);font-size:15px}
.pw-compact .pw-sheet[hidden]{display:none}
.pw-sheet-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:6px 0 4px;background:#fff}
.pw-sheet-head h2{margin:0;font-size:17px}
.pw-sheet-head-extra{display:flex;align-items:center;margin:0 4px 0 auto}
.pw-sheet-head .pw-lang{gap:6px;border:0;border-radius:0;overflow:visible}
.pw-sheet-head .pw-lang button,.pw-sheet-head .pw-lang button:last-child{min-width:48px;min-height:44px;padding:4px 10px;font-size:16px;border:1px solid rgba(80,72,62,.25);border-radius:10px}
.pw-sheet-x{width:44px;height:44px;padding:0;font:inherit;font-size:26px;line-height:1;color:inherit;background:none;border:0;cursor:pointer}
.pw-menu-body{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pw-menu-body > *{min-width:0}
.pw-menu-body .pw-full,.pw-menu-body > select{grid-column:1/-1}
.pw-menu-body button,.pw-menu-body select{min-height:44px;font:inherit;font-size:16px;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.25);border-radius:10px;padding:6px 10px;cursor:pointer}
.pw-menu-body button:disabled,.pw-menu-body select:disabled,.pw-menu-body input:disabled{opacity:.4;cursor:default}
.pw-menu-body button.pw-badge{font-size:14px;background:#fff3d6;border-color:#d4a84a;color:#6e4d0c}
.pw-menu-body label{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;white-space:normal}
.pw-menu-body label.pw-switch{flex-direction:row-reverse}
.pw-menu-body input[type=range]{flex:1;width:auto!important;height:44px;margin:0;min-width:0}
.pw-menu-body input[type=checkbox]{appearance:none;-webkit-appearance:none;margin:0;flex:none;width:56px;height:44px;box-sizing:border-box;padding:10px 0;border:0;border-radius:12px/22px;background-color:#b9b3a7;background-clip:content-box;background-origin:content-box;background-repeat:no-repeat;background-image:radial-gradient(circle at 12px 50%,#fff 9px,transparent 10px);cursor:pointer}
.pw-menu-body input[type=checkbox]:checked{background-color:#37332d;background-image:radial-gradient(circle at calc(100% - 12px) 50%,#fff 9px,transparent 10px)}
.pw-compact.pw-landscape .pw-sheet{max-height:94%}
.pw-landscape .pw-menu-body{grid-template-columns:repeat(4,1fr)}
.pw-landscape .pw-menu-body .pw-full,.pw-landscape .pw-menu-body > select{grid-column:span 2}
.pw-landscape .pw-menu-body > .pw-badge,.pw-landscape .pw-menu-body > .pw-menu-extras{grid-column:1/-1}
.pw-compact .pw-tag{display:none}
.pw-compact .pw-issues{left:0;right:0;bottom:var(--pw-modebar-h);z-index:7;box-sizing:border-box;width:auto;max-height:25%;border-radius:14px 14px 0 0}
.pw-compact.pw-landscape .pw-issues{padding-bottom:calc(8px + env(safe-area-inset-bottom))}
.pw-compact .pw-issues h3{flex-wrap:wrap}
.pw-compact .pw-issues button{min-width:44px;min-height:44px;font:inherit;font-size:14px;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.25);border-radius:10px;padding:4px 12px;cursor:pointer}
.pw-compact .pw-issues-close{min-width:44px;min-height:44px}
.pw-compact .pw-issues-close{width:44px;margin:-8px -10px 0 6px;font-size:26px}
.pw-compact .pw-visit{left:0;right:0;bottom:var(--pw-modebar-h);box-sizing:border-box;width:auto;max-height:calc(100% - 140px);overflow:auto;border-width:1px 0 0;border-radius:14px 14px 0 0}
.pw-compact.pw-landscape .pw-visit{padding-bottom:calc(10px + env(safe-area-inset-bottom))}
.pw-compact .pw-mini{z-index:2;top:calc(max(8px,env(safe-area-inset-top)) + 60px);bottom:auto;right:max(10px,env(safe-area-inset-right));width:112px;height:112px}
.pw-compact .pw-hint{bottom:calc(var(--pw-modebar-h) + 12px)}
.pw-compact .pw-dlg button,.pw-compact .pw-banner button,.pw-compact .pw-about button{min-height:44px;min-width:44px}
.pw-dlg-xrow{display:none}
.pw-compact .pw-dlg-xrow{display:block;position:sticky;top:0;height:0;z-index:3}
.pw-dlg-x{position:absolute;top:-8px;right:-10px;width:44px;height:44px;padding:0;font:inherit;font-size:28px;line-height:1;color:inherit;background:none;border:0;cursor:pointer}
.pw-compact .pw-dlg{box-sizing:border-box;margin:12px auto auto;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;-webkit-overflow-scrolling:touch}
.pw-compact .pw-dlg h2,.pw-compact .pw-share-dlg form > p:first-child{padding-right:44px}
.pw-compact .pw-dlg textarea{display:block;box-sizing:border-box;width:100%;height:min(150px,34vh);margin-top:34px}
.pw-compact.pw-landscape .pw-dlg textarea{height:min(96px,26vh)}
.pw-compact .pw-visit-note button{min-height:44px;min-width:44px;font-size:14px}
.pw-compact .pw-visit-note{font-size:14px}
.pw-compact .pw-banner-x{font-size:24px}
.pw-compact .pw-dlg select,.pw-compact .pw-dlg input,.pw-compact .pw-dlg textarea,.pw-compact select,.pw-compact textarea{font-size:16px}
.pw-compact .pw-help a{display:inline-block;padding:10px 0}
.pw-compact .pw-walkzones{display:flex;position:absolute;z-index:1;inset:0;pointer-events:none}
.pw-compact .pw-walkzones[hidden]{display:none}
.pw-walkzones div{flex:1;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.45)}
.pw-walkzones div:first-child{background:rgba(40,90,160,.2);border-right:2px dashed rgba(255,255,255,.7)}
.pw-walkzones div:last-child{background:rgba(209,84,47,.2)}
.pw-compact .pw-touchhint{display:block;position:absolute;z-index:2;left:50%;bottom:calc(var(--pw-modebar-h) + 14px);transform:translateX(-50%);box-sizing:border-box;max-width:calc(100% - 20px);padding:7px 14px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;background:rgba(40,36,30,.78);border-radius:999px;pointer-events:none}
.pw-compact .pw-touchhint[hidden]{display:none}
`;

// h is main.js's element helper. Parts: root (#pw-app), bar (the desktop toolbar, already filled), nameEl and badge (the plan name and
// the "Scale estimated" button), tag (the "Example" caption), issuesEl (the issues panel), hint, mini (Walk overlays), visit (the
// first-visit card, with setCompact), actionSelects (selects whose choice is an action, like the examples), openFile (opens the file
// chooser; the Menu gets a button for it). Every dialog of the page also gets a close cross and closes on a tap on the dimmed page. onLayout(kind) runs after the layout changed, so main.js can resize and frame again.
export function createCompact({ h, root, bar, nameEl, badge, tag, issuesEl, hint, mini, visit, actionSelects = [], openFile, onLayout }) {
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS;
  document.head.append(style);

  const brand = bar.querySelector('.pw-brand'), seg = bar.querySelector('.pw-seg'), spacer = bar.querySelector('.pw-spacer');
  const fixed = new Set([brand, nameEl, badge, tag, seg, spacer]);
  let desktopOrder = [...bar.children];
  let kind = null, menuWasOpen = false, menuOpen = false, issuesOpen = true, issueCount = 0, errorCount = 0, mode = 'dollhouse', hasModel = false, walkTimer = 0;
  const extras = [], crosses = [];

  const menuBtn = h('button', { type: 'button', class: 'pw-menu-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: () => { menuOpen = !menuOpen; issuesOpen = false; sheets(); } });
  const issuesBtn = h('button', { type: 'button', class: 'pw-issues-btn', hidden: '', onclick: () => { issuesOpen = !issuesOpen; menuOpen = false; sheets(); } });
  const issuesClose = h('button', { type: 'button', class: 'pw-issues-close', onclick: () => { issuesOpen = false; sheets(); } }, '×');
  const modebar = h('div', { class: 'pw-modebar', hidden: '' });
  const scrim = h('div', { class: 'pw-scrim', hidden: '', onclick: () => closeSheets() });
  const fileBtn = openFile ? h('button', { type: 'button', class: 'pw-menu-file', onclick: openFile }) : null;
  const menuTitle = h('h2', { id: 'pw-menu-title' });
  const menuX = h('button', { type: 'button', class: 'pw-sheet-x', onclick: () => closeSheets() }, '×');
  const menuBody = h('div', { class: 'pw-menu-body' });
  // Anything you append to menuExtras shows at the end of the Menu in the compact layout; registerExtra() also keeps the element in the toolbar otherwise.
  const menuExtras = h('div', { class: 'pw-full pw-menu-extras' });
  // registerMenuHead() puts a control in the Menu's title row (between the title and the close cross), where it stays in view while the sheet scrolls.
  const menuHead = h('div', { class: 'pw-sheet-head-extra' });
  const menu = h('div', { class: 'pw-sheet pw-menu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pw-menu-title', hidden: '' },
    h('div', { class: 'pw-sheet-head' }, menuTitle, menuHead, menuX), menuBody);
  const zoneL = h('div'), zoneR = h('div');
  const zones = h('div', { class: 'pw-walkzones', hidden: '', 'aria-hidden': 'true' }, zoneL, zoneR);
  const touchHint = h('div', { class: 'pw-touchhint', hidden: '', 'aria-hidden': 'true' });
  root.append(modebar, scrim, menu, zones, touchHint);

  function texts() {
    menuBtn.textContent = t('menu'); menuTitle.textContent = t('menu');
    for (const b of [menuX, issuesClose]) { b.setAttribute('aria-label', t('close')); b.title = t('close'); }
    issuesBtn.textContent = `⚠ ${issueCount}`;
    issuesBtn.setAttribute('aria-label', t('issues', { n: issueCount })); issuesBtn.title = t('issues', { n: issueCount });
    issuesBtn.classList.toggle('e', errorCount > 0);
    if (fileBtn) fileBtn.textContent = t('openFile');
    for (const b of crosses) { b.setAttribute('aria-label', t('close')); b.title = t('close'); }
    zoneL.textContent = t('walkLeft'); zoneR.textContent = t('walkRight'); touchHint.textContent = t('touchHint');
  }

  function toDesktop() {
    const order = desktopOrder.filter((el) => el !== menuBtn && el !== issuesBtn);
    order.splice(Math.max(0, order.indexOf(tag) + 1), 0, issuesBtn);
    bar.replaceChildren(...order, ...extras);
    modebar.replaceChildren();
    menuBody.replaceChildren();
  }

  function toCompact(next) {
    if (kind === 'desktop' || kind === null) desktopOrder = [...bar.children].filter((el) => el !== issuesBtn && !extras.includes(el));
    const controls = desktopOrder.filter((el) => !fixed.has(el));
    if (fileBtn && !controls.some((el) => el.classList && el.classList.contains('pw-open-file'))) controls.splice(Math.max(0, controls.indexOf(actionSelects[0]) + 1), 0, fileBtn);
    for (const el of controls) {
      const sw = !!(el.querySelector && el.querySelector('input[type=checkbox]'));
      el.classList.toggle('pw-switch', sw);
      el.classList.toggle('pw-full', el.tagName !== 'BUTTON' && !sw); // switches share a row, so the Menu is shorter
    }
    badge.classList.add('pw-full');
    menuBody.replaceChildren(badge, ...controls, menuExtras);
    menuExtras.replaceChildren(...extras);
    bar.replaceChildren(brand, nameEl, ...(next === 'landscape' ? [seg] : []), issuesBtn, menuBtn);
    modebar.replaceChildren(...(next === 'portrait' ? [seg] : []));
  }

  function update() {
    const next = layoutKind(window.innerWidth, window.innerHeight);
    root.classList.toggle('pw-compact', next !== 'desktop');
    root.classList.toggle('pw-landscape', next === 'landscape');
    if (next === kind) return;
    const was = kind;
    kind = next;
    visit.setCompact(next !== 'desktop');
    if (next === 'desktop') toDesktop(); else toCompact(next);
    menuOpen = false;
    issuesOpen = next === 'desktop';
    modebar.hidden = next !== 'portrait';
    texts();
    sheets();
    if (was !== null && onLayout) onLayout(next);
  }

  const issuesShown = () => issueCount > 0 && issuesOpen && mode !== 'walk';

  // One place decides what is open: the Menu sheet, the issues panel (a sheet in the compact layout), and the scrim behind them.
  function sheets() {
    const compact = kind !== 'desktop';
    if (mode === 'walk') menuOpen = false;
    menu.hidden = !(compact && menuOpen);
    issuesEl.hidden = !issuesShown();
    issuesBtn.hidden = issueCount === 0;
    scrim.hidden = !(compact && (menuOpen || issuesShown()));
    menuBtn.setAttribute('aria-expanded', String(compact && menuOpen));
    issuesBtn.setAttribute('aria-expanded', String(issuesShown()));
    if (compact && menuOpen && !menuWasOpen) menuX.focus({ preventScroll: true });
    menuWasOpen = compact && menuOpen;
  }

  function closeSheets() {
    const was = menuOpen || (kind !== 'desktop' && issuesShown());
    menuOpen = false;
    if (kind !== 'desktop') issuesOpen = false;
    sheets();
    return was;
  }

  // The part of the screen no bar or card covers, in CSS px with the origin at the top left of the page.
  function freeRect() {
    const W = root.clientWidth || window.innerWidth, H = root.clientHeight || window.innerHeight;
    let top = bar.getBoundingClientRect().bottom + 4, bottom = H - 4;
    if (kind === 'portrait' && !modebar.hidden) bottom = Math.min(bottom, modebar.getBoundingClientRect().top - 4);
    if (kind !== 'desktop' && !visit.el.hidden) bottom = Math.min(bottom, visit.el.getBoundingClientRect().top - 4);
    if (bottom - top < 80) { top = 0; bottom = H; }
    return { left: 0, top, right: W, bottom };
  }

  // main.js calls this after every change of mode, plan or issues.
  function sync(s) {
    const entering = s.mode === 'walk' && mode !== 'walk';
    mode = s.mode; hasModel = !!s.hasModel; issueCount = s.issues; errorCount = s.errors || 0;
    texts();
    update();
    sheets();
    clearTimeout(walkTimer);
    const touchHelp = kind !== 'desktop' && touchDevice() && mode === 'walk' && hasModel;
    if (touchHelp) hint.hidden = true;
    if (entering && touchHelp) {
      zones.hidden = false; touchHint.hidden = false;
      walkTimer = setTimeout(() => { zones.hidden = true; touchHint.hidden = true; }, 4000);
    } else if (mode !== 'walk') { zones.hidden = true; touchHint.hidden = true; }
  }

  // A new plan was drawn: the issues panel opens by itself on a desktop and waits behind the badge on a phone. Returns the close button.
  function issuesRenewed() { issuesOpen = kind === 'desktop'; return issuesClose; }

  function registerExtra(el) {
    extras.push(el);
    if (kind === 'desktop' || kind === null) bar.append(el); else menuExtras.append(el);
  }

  // A control that lives only in the phone Menu's title row (the page language switch); the desktop toolbar does not get it.
  function registerMenuHead(el) { menuHead.append(el); }

  // Dialogs: a 44 px cross in the top right corner (phone layout) and a tap on the dimmed page closes them. The cross is the first
  // control, so opening the paste dialog on a phone does not focus its text box and raise the keyboard; Help rebuilds its content on
  // every opening, so the cross is put back when the dialog opens.
  for (const d of root.querySelectorAll('dialog.pw-dlg')) {
    const shut = () => { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); };
    const cross = h('button', { type: 'button', class: 'pw-dlg-x', onclick: shut }, '×');
    const row = h('div', { class: 'pw-dlg-xrow' }, cross);
    crosses.push(cross);
    const ensure = () => { if (d.firstElementChild !== row) d.prepend(row); };
    ensure();
    new MutationObserver(() => { if (d.hasAttribute('open')) ensure(); }).observe(d, { attributes: true, attributeFilter: ['open'] });
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) shut();
    });
  }
  // A button in the Menu is an action (export, paste, About, Help): the Menu gets out of its way. Switches, the sliders and buttons marked
  // data-keep-menu stay open: the copy buttons answer "Copied" on themselves, which a closed Menu would hide.
  menuBody.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && !b.hasAttribute('data-keep-menu')) closeSheets();
  });
  for (const s of actionSelects) s.addEventListener('change', () => closeSheets());
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || kind === 'desktop') return;
    if (closeSheets()) { e.preventDefault(); e.stopImmediatePropagation(); }
  });
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 60));
  update();

  return { update, sync, freeRect, issuesRenewed, registerExtra, registerMenuHead, menuExtras, closeSheets, get kind() { return kind; }, get touch() { return touchDevice(); } };
}
