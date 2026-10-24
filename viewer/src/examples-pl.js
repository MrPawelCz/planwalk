// Polish names for the two bundled examples (examples/*.plan.json), shown instead of the English ones when the page is Polish.
// Display only: the JSON files stay as they are and the plan on screen is a copy. Pure data and functions, no DOM, so Node tests reach them.
// Keyed by the example (its file name without .plan.json) and by the ids inside it; tests/viewer/examples-pl.test.mjs fails when an
// example changes and this table does not follow. A plan that is not one of the two (pasted, a file, ?plan=) is never renamed.
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export const EXAMPLES_PL = {
  'flat-1': {
    en: 'One-bedroom flat with study (48 m2 gross)', // the English name tells which example a plan is
    name: 'Mieszkanie z jedną sypialnią i gabinetem (48 m², brutto)',
    notes: 'Przykład napisany ręcznie. CC0.',
    levels: { L0: 'Mieszkanie' },
    rooms: { living: 'Salon', bedroom: 'Sypialnia', hall: 'Przedpokój', bath: 'Łazienka', study: 'Gabinet' },
  },
  'duplex-1': {
    en: 'Two-level house with stair (115 m2 gross)',
    name: 'Dom dwupoziomowy ze schodami (115 m², brutto)',
    notes: 'Przykład napisany ręcznie. Dwa poziomy połączone jednymi prostymi schodami. CC0.',
    levels: { L0: 'Parter', L1: 'Piętro' },
    rooms: { hall: 'Przedpokój', kitchen: 'Kuchnia', wc: 'WC', living: 'Salon', bath: 'Łazienka', landing: 'Podest', bed1: 'Sypialnia 1', bed2: 'Sypialnia 2' },
  },
};

// The example id of a plan ('flat-1', 'duplex-1'), or null when the plan is not one of the bundled examples.
export function exampleId(plan) {
  const name = plan && typeof plan === 'object' ? plan.name : null;
  return Object.keys(EXAMPLES_PL).find((id) => EXAMPLES_PL[id].en === name) ?? null;
}

// The name a list of examples shows for a plan: Polish for a bundled example on a Polish page, the plan's own name otherwise.
export function exampleTitle(plan, lang) {
  const id = lang === 'pl' ? exampleId(plan) : null;
  return id ? EXAMPLES_PL[id].name : plan.name;
}

// A deep copy with the Polish name, notes, level names and room names when lang is 'pl' and the plan is the bundled example id;
// anything else comes back as the same object. Ids, geometry and every other field are copied as they are.
export function localizeExample(plan, id, lang) {
  if (lang !== 'pl' || !has(EXAMPLES_PL, id) || exampleId(plan) !== id) return plan;
  const row = EXAMPLES_PL[id];
  const copy = JSON.parse(JSON.stringify(plan));
  copy.name = row.name;
  copy.meta = { ...copy.meta, notes: row.notes };
  for (const level of copy.levels || []) {
    if (has(row.levels, level.id)) level.name = row.levels[level.id];
    for (const room of level.rooms || []) if (has(row.rooms, room.id)) room.name = row.rooms[room.id];
  }
  return copy;
}
