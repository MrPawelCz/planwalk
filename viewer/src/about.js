// "About this model" sheet: what the viewer knows about the plan on screen (counts, area, the scale note and notes the
// reader wrote, validator warnings, version) and what it does not (it is a picture of a drawing, not a survey).
// Plan strings reach the page as text nodes only. The rows are built by a pure function, so tests need no browser.
import { PLAN_SCHEMA } from '../../src/core/validate.js';
import { makeT } from './i18n.js';
import { totalArea, formatArea } from './areas.js';
import { openDialog } from './dialogs.js';

export const STRINGS = {
  en: {
    about: 'About', aboutTip: 'Counts, area, scale and notes of this model',
    title: 'About this model', close: 'Close',
    scaleBadge: 'Scale estimated', scaleBadgeTip: 'The scale note says the scale is a guess. Open the About sheet.',
    name: 'Plan', untitled: '(untitled)', levels: 'Levels', rooms: 'Rooms', area: 'Total area of the rooms',
    areaHint: 'Marked ~ because some rooms have no area on the drawing: those are estimated net of the walls.',
    areaSkipped: 'Very large plan: for some rooms the area runs to the wall centrelines, so it is higher than the floor you see.',
    scale: 'Scale', noScale: 'Not stated in the file', scaleGuess: 'The note says the scale is a guess. Check dimensions on your drawing.',
    notes: 'Notes from the reader', source: 'Source', warnings: 'Warnings from the check', version: 'planwalk version',
    src_image: 'Image', src_pdf: 'PDF', src_sketch: 'Sketch', src_synthetic: 'Synthetic example', src_manual: 'Entered by hand',
    disclaimer: 'A visualisation of the drawing you provided, not a survey. Check dimensions before you rely on them.',
  },
  pl: {
    about: 'O modelu', aboutTip: 'Liczby, powierzchnia, skala i uwagi do tego modelu',
    title: 'O tym modelu', close: 'Zamknij',
    scaleBadge: 'Skala szacowana', scaleBadgeTip: 'Z notatki o skali wynika, że skala jest przybliżona. Otwórz „O modelu”.',
    name: 'Plan', untitled: '(bez nazwy)', levels: 'Piętra', rooms: 'Pomieszczenia', area: 'Łączna powierzchnia pomieszczeń',
    areaHint: 'Znak ~ oznacza, że część pomieszczeń nie ma na rysunku podanej powierzchni, więc oszacowano ją bez grubości ścian.',
    areaSkipped: 'Bardzo duży plan: przy części pomieszczeń powierzchnia liczona jest po osiach ścian, więc jest większa niż widoczna podłoga.',
    scale: 'Skala', noScale: 'Brak informacji w pliku', scaleGuess: 'Notatka mówi, że skala jest przybliżona. Sprawdź wymiary na swoim rysunku.',
    notes: 'Uwagi z odczytu rysunku', source: 'Źródło', warnings: 'Ostrzeżenia z kontroli planu', version: 'Wersja planwalk',
    src_image: 'Obraz', src_pdf: 'PDF', src_sketch: 'Szkic', src_synthetic: 'Przykład syntetyczny', src_manual: 'Wpisany ręcznie',
    disclaimer: 'Wizualizacja przekazanego rysunku, nie pomiar. Sprawdź wymiary, zanim zaczniesz na nich polegać.',
  },
};
const t = makeT(STRINGS);

export const ABOUT_CSS = `
.pw-bar button.pw-badge{font-size:11px;padding:1px 8px;border-radius:999px;background:#fff3d6;border-color:#d4a84a;color:#6e4d0c}
.pw-bar button.pw-badge:hover{background:#ffe9b8}
.pw-about{width:min(520px,92vw);max-height:84vh;overflow:auto;box-sizing:border-box}
.pw-about dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 10px}
.pw-about dt{color:#7a7266}
.pw-about dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.pw-about dd em{display:block;margin-top:2px;color:#8a5d0e;font-style:normal}
.pw-about .pw-about-note{margin:0 0 12px}
@media (max-width:520px){.pw-about dl{grid-template-columns:1fr;gap:0}.pw-about dt{margin-top:8px;font-size:12px}}
`;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// The schema has no field for "the scale is a guess": the reader says how it got the scale in meta.scale_note. The badge claims
// an estimated scale only when the note says so about the scale itself, in English or Polish:
//   strong: an uncertainty word right next to the word scale ("scale estimated", "approximate scale", "skala szacowana", "Scale: unknown")
//           or a standard door as the basis ("scale from a standard door");
//   weak:   the scale is missing ("no printed scale", "brak skali") or comes from the doors ("derived from door widths", "na oko"),
//           which counts unless the note also names a printed basis ("scale from the printed dimension", "skala z wymiaru").
// Words about something else ("wall thickness estimated", "I guessed the layout of the bathroom") do not count, and a note that
// only names a printed basis raises no badge. The sheet shows every note either way.
// The note can be far longer than the schema allows (that is only a validator error and the model is still built), so it is cut
// to the schema cap first; every quantifier below is bounded and a word pattern starts at a word boundary, so matching stays linear.
const NOTE_MAX = PLAN_SCHEMA.properties.meta.properties.scale_note.maxLength;
const PL = '[a-ząćęłńóśźż]'; // \w does not cover the Polish letters
const UNSURE_EN = 'guess|estimat|approx|assum|unknown|unclear|uncertain|unsure|infer|rough';
const UNSURE_PL = 'zgadn|zgadyw|o?szacow|przybli|nieznan|niepewn|domysł';
const STRONG = [
  new RegExp(`\\bscale\\b(?:\\s+(?:is|was|are|has been|only|just|also)){0,3}\\s*[:=-]?\\s*(?:a\\s+)?(?:${UNSURE_EN})`, 'i'),
  new RegExp(`\\b(?:${UNSURE_EN})\\w{0,6}\\s+(?:(?:the|a|my|its|overall)\\s+)?scale\\b`, 'i'),
  /\b(?:standard|typical|average)\s+(?:[\w.'-]+\s+){0,3}?doors?\b/i,
  new RegExp(`\\bskal${PL}{0,4}[\\s:=-]+(?:(?:jest|była|została|tylko|raczej)\\s+){0,2}(?:${UNSURE_PL})`, 'i'),
  new RegExp(`\\b${PL}{0,3}(?:${UNSURE_PL})${PL}{0,6}\\s+skal`, 'i'),
  /\b(?:typow|standardow)[^\s;,.()]{0,20}\s+(?:[^\s;,.()]+\s+){0,2}?drzw/i,
];
const WEAK = new RegExp([
  '\\bno\\s+(?:\\w+\\s+){0,2}(?:scale|dimensions?)\\b',
  '\\bscale\\s+(?:is\\s+)?not\\s+(?:printed|given|stated|known|visible|shown)\\b',
  '\\b(?:from|on|using|via|by)\\s+(?:(?:the|a|typical|standard|average)\\s+)*doors?\\b',
  `\\b(?:brak|bez)\\s+(?:${PL}{1,15}\\s+){0,2}(?:skal|wymiar)${PL}*`,
  `\\bskal${PL}{0,4}\\s+nie\\s+(?:jest\\s+)?(?:podana|podano|wydrukowana|znana)`,
  '\\bz\\s+(?:(?:szerokości|wymiaru|typowych)\\s+)?drzwi',
  'na oko',
].join('|'), 'gi');
const PRINTED = [
  /\b(?:from|by|using|via)\s+(?:the\s+)?(?:printed|stated|given|written|marked|drawn)\b/i,
  /\bfrom\s+(?:the\s+)?(?:\d[\d.,]*\s*(?:m|cm|mm)\s+)?(?:dimension|room\s+areas?)/i,
  /\bscale\s+(?:is\s+)?(?:printed|exact|known|given|stated)\b/i,
  /\bprinted\s+(?:scale|dimension|overall|room|area|width|length)/i,
  new RegExp(`\\bz\\s+(?:(?:podanych|podanego|drukowanych)\\s+)?(?:wymiar|powierzchni)`, 'i'),
  new RegExp(`\\bskal${PL}{0,4}\\s+(?:jest\\s+)?(?:podana|dokładna|wydrukowana|znana)`, 'i'),
];
export function scaleGuessed(note) {
  const s = text(note).slice(0, NOTE_MAX);
  if (STRONG.some((re) => re.test(s))) return true;
  const rest = s.replace(WEAK, ' '); // what is left once the weak phrases are out, so "no printed scale" is not read as a printed basis
  return rest !== s && !PRINTED.some((re) => re.test(rest));
}

const metaOf = (plan) => (plan && typeof plan.meta === 'object' && plan.meta) || {};

// [{ id, label, value, hint }] in display order, in the current language. model is the built model, warnings a count.
export function aboutRows({ plan, model, warnings = 0, version = '' }) {
  const meta = metaOf(plan), total = totalArea(model);
  const scale = text(meta.scale_note), notes = text(meta.notes), source = text(meta.source);
  const rows = [
    { id: 'name', label: t('name'), value: text(plan && plan.name) || t('untitled') },
    { id: 'levels', label: t('levels'), value: String(model.levels.length) },
    { id: 'rooms', label: t('rooms'), value: String(total.rooms) },
    { id: 'area', label: t('area'), value: formatArea(total.m2, total.estimated), hint: total.estimated ? [t('areaHint'), total.skipped ? t('areaSkipped') : ''].filter(Boolean).join(' ') : '' },
    { id: 'scale', label: t('scale'), value: scale || t('noScale'), hint: scaleGuessed(scale) ? t('scaleGuess') : '' },
  ];
  if (notes) rows.push({ id: 'notes', label: t('notes'), value: notes, hint: '' });
  if (source) rows.push({ id: 'source', label: t('source'), value: Object.prototype.hasOwnProperty.call(STRINGS.en, `src_${source}`) ? t(`src_${source}`) : source, hint: '' });
  rows.push({ id: 'warnings', label: t('warnings'), value: String(warnings), hint: '' });
  if (version) rows.push({ id: 'version', label: t('version'), value: version, hint: '' });
  return rows;
}

// The toolbar button, the "Scale estimated" badge next to the plan name, and the dialog. h is main.js's element helper,
// getInfo() answers { plan, model, warnings, version } for the plan on screen (model is null when nothing is loaded).
export function createAbout(h, getInfo) {
  const body = h('dl');
  const title = h('h2');
  const note = h('p', { class: 'pw-about-note' });
  const closeBtn = h('button', { type: 'submit' });
  const dialog = h('dialog', { class: 'pw-dlg pw-about' }, title, note, body, h('form', { method: 'dialog' }, closeBtn));
  const button = h('button', { type: 'button', onclick: () => open() });
  const badge = h('button', { type: 'button', class: 'pw-badge', hidden: '', onclick: () => open() });
  // Texts are set here and not at creation, so a change of language shows on the next call.
  function texts() {
    button.textContent = t('about'); button.title = t('aboutTip');
    badge.textContent = t('scaleBadge'); badge.title = t('scaleBadgeTip');
    title.textContent = t('title'); note.textContent = t('disclaimer'); closeBtn.textContent = t('close');
  }
  function update() {
    const info = getInfo();
    texts();
    button.disabled = !info.model;
    badge.hidden = !(info.model && scaleGuessed(metaOf(info.plan).scale_note));
  }
  function fill(info) {
    texts();
    body.replaceChildren(...aboutRows(info).flatMap((r) => [h('dt', {}, r.label), h('dd', {}, r.value, r.hint ? h('em', {}, r.hint) : null)]));
  }
  function open() {
    const info = getInfo();
    if (!info.model) return;
    fill(info);
    openDialog(dialog);
    dialog.scrollTop = 0; // opening focuses the Close button at the end, which would scroll a long sheet down to it
  }
  // After a change of language: the captions again and, when the sheet is open, its rows.
  function refresh() {
    update();
    const info = getInfo();
    if (info.model && dialog.hasAttribute('open')) fill(info);
  }
  texts();
  return { button, badge, dialog, update, open, refresh };
}
