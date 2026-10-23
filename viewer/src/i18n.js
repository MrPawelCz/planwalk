// Language choice and string lookup for the viewer. A UI module keeps its own strings as { en: {...}, pl: {...} } and
// calls makeT(dict) once; t(key, params) answers in the current language, falls back to English, fills {name} slots.
const SUPPORTED = ['en', 'pl'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function detectLang(search = typeof location !== 'undefined' ? location.search : '', nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const q = new URLSearchParams(search).get('lang');
  if (SUPPORTED.includes(q)) return q;
  const first = (nav.languages && nav.languages[0]) || nav.language || '';
  return /^pl\b/i.test(first) ? 'pl' : 'en';
}

let current = detectLang();
export const getLang = () => current;
export function setLang(lang) { if (SUPPORTED.includes(lang)) current = lang; }

export function makeT(dict) {
  return (key, params) => {
    const s = (has(dict, current) && has(dict[current], key) ? dict[current][key] : null) ?? (has(dict.en, key) ? dict.en[key] : key);
    return params ? s.replace(/\{(\w+)\}/g, (m, k) => (has(params, k) ? String(params[k]) : m)) : s;
  };
}
