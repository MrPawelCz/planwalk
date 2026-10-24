// The deny list of the Polish audit (not a test itself): English words that must not be left in the text of a Polish page, and
// the tool names that are fine in Polish text. The list is derived from the English string tables of the viewer: every word of an
// `en` value is denied unless it is a tool name (KEEP) or a word Polish shares (HOMONYMS), with its plural or singular form.
// A short hand kept floor (FLOOR) adds words the tables do not hold, so a new English table value is covered without an edit here.
import { STRINGS as MAIN } from '../../viewer/src/strings.js';
import { STRINGS as HELP } from '../../viewer/src/help.js';
import { STRINGS as VISIT } from '../../viewer/src/first-visit.js';
import { strings as ERRORS } from '../../viewer/src/load-errors.js';
import { STRINGS as LANG } from '../../viewer/src/lang-switch.js';
import { STRINGS as ABOUT } from '../../viewer/src/about.js';
import { STRINGS as COMPACT } from '../../viewer/src/compact.js';
import { STRINGS as SHARE } from '../../viewer/src/share.js';
import { STRINGS as LOADED } from '../../viewer/src/loaded-note.js';

export const KEEP = ['GLB', 'PNG', 'JSON', 'HTML', 'PDF', 'AI', 'WASD', 'Shift', 'Esc', 'WebGL', 'planwalk', 'prompt', 'Safari', 'Chrome', 'Firefox', 'Menu', 'CAD', 'URL', 'iPhone', 'PL', 'EN'];

// English words that are also Polish words (or Polish loanwords written the same way), so they are never denied.
export const HOMONYMS = ['to', 'on', 'do', 'by', 'as', 'we', 'most', 'model', 'plan', 'link', 'menu', 'start', 'one', 'ten', 'same', 'element', 'limit', 'status'];

// Words of the interface that the English tables may not hold in this exact form.
const FLOOR = [
  'the', 'and', 'or', 'of', 'in', 'is', 'are', 'was', 'be', 'it', 'its', 'you', 'your', 'our', 'with', 'without', 'from', 'into',
  'here', 'there', 'please', 'this', 'that', 'these', 'those', 'not', 'cannot', 'could', 'should', 'would', 'will', 'has', 'have',
  'when', 'what', 'how', 'then', 'than', 'more', 'every', 'each', 'nothing', 'everything', 'whole', 'again', 'now', 'next',
  'click', 'tap', 'press', 'paste', 'copy', 'copied', 'export', 'open', 'close', 'closed', 'load', 'loaded', 'cancel', 'help', 'hide',
  'show', 'drop', 'pick', 'download', 'share', 'fix', 'reload', 'send', 'ask', 'try', 'check', 'found', 'contains', 'stored', 'uploaded',
  'upload', 'stays', 'works', 'failed', 'went', 'wrong', 'something',
  'level', 'levels', 'example', 'examples', 'file', 'files', 'note', 'notes', 'source', 'warning', 'warnings', 'error', 'errors',
  'issue', 'issues', 'label', 'labels', 'texture', 'textures', 'explode', 'cutaway', 'walk', 'orbit', 'dollhouse', 'top', 'about',
  'scale', 'room', 'rooms', 'answer', 'links', 'language', 'standalone', 'image', 'picture', 'drawing', 'request', 'details', 'page',
  'browser', 'chat', 'floor', 'wall', 'walls', 'door', 'doors', 'window', 'furniture', 'stairs', 'area', 'total', 'name', 'untitled',
  'version', 'text', 'plans',
];

const TABLES = [MAIN, HELP, VISIT, ERRORS, LANG, ABOUT, COMPACT, SHARE, LOADED];
const skip = new Set([...KEEP, ...HOMONYMS].map((w) => w.toLowerCase()));
// The word itself and its plural or singular (browser, browsers; walls, wall). Words of one or two letters are left to FLOOR.
const forms = (w) => [w, `${w}s`, `${w}es`, ...(w.length > 4 && w.endsWith('s') ? [w.slice(0, -1)] : [])];
const wordsOf = (value) => String(value).replace(/\{\w+\}/g, ' ').match(/\p{L}+/gu) || [];

// Every word (three letters or more, lower case) of the English tables that the deny list is derived from.
export const TABLE_WORDS = [...new Set(TABLES.flatMap((table) => Object.values(table.en)).flatMap(wordsOf).map((w) => w.toLowerCase()).filter((w) => w.length >= 3))];

export const ENGLISH_WORDS = [...new Set([...FLOOR, ...TABLE_WORDS.filter((w) => !skip.has(w)).flatMap(forms)])].filter((w) => !skip.has(w));

const keepRe = new RegExp(`(?<![\\p{L}\\d])(${KEEP.join('|')})(?![\\p{L}\\d])`, 'gu');
const wordRe = new RegExp(`(?<![\\p{L}\\d])(${ENGLISH_WORDS.join('|')})(?![\\p{L}\\d])`, 'giu');

// The English words found in a piece of Polish interface text (placeholders like {name} and tool names removed first); [] when there are none.
export function englishLeft(text) {
  return [...new Set((String(text).replace(/\{\w+\}/g, ' ').replace(keepRe, ' ').match(wordRe) || []).map((w) => w.toLowerCase()))];
}

// A line the validator wrote for the AI ("W113 levels[0].height ..."): English on purpose, see viewer/src/strings.js (fixRequestText).
export const isValidatorLine = (text) => /^[EW]\d{3}\b/.test(String(text).trim());

// The style rule for everything the product says: no em dash, no en dash.
export const DASHES = /[–—]/;
