// File name stem for exports: the plan name in lower case ASCII, words joined by single hyphens ("Żółta kuchnia 2" gives
// "zolta-kuchnia-2"). Letters that NFD cannot split (ł, ø, ß, đ and a few more) have their own entry. No DOM, so Node tests reach it.
const EXTRA = { ł: 'l', ø: 'o', ß: 'ss', đ: 'd', ð: 'd', þ: 'th', æ: 'ae', œ: 'oe', ı: 'i', ħ: 'h' };

export function fileSlug(name, fallback = 'planwalk') {
  const s = String(name ?? '').toLowerCase()
    .replace(/[łøßđðþæœıħ]/g, (c) => EXTRA[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '')
    .slice(0, 48).replace(/-+$/, '');
  return s || fallback;
}
