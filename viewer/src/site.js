// The public address of the live page, and where a shared link starts. A page that does not come from the web (a downloaded
// planwalk.html opened from disk, about:blank, a blob or data page) has an address that opens nowhere else and, for a file,
// holds a local path; a link made there would be broken and would give the path away. tools/build.mjs keeps the same address
// for the link preview tags, and tests/viewer/share-base.test.mjs keeps the two equal.
export const SITE = 'https://mrpawelcz.github.io/planwalk/';
export const SITE_PL = `${SITE}pl/`;

// loc is a location (any object with protocol, host and pathname will do), lang the interface language. On http and https the
// page's own address without query and fragment, so a fork or a local server keeps working. Anywhere else the public page,
// the Polish copy for a Polish interface so that the person who opens the link lands in Polish; nothing of loc is used then.
export function linkBase(loc, lang) {
  if (loc && /^https?:$/.test(loc.protocol) && loc.host) return `${loc.protocol}//${loc.host}${loc.pathname}`;
  return lang === 'pl' ? SITE_PL : SITE;
}
