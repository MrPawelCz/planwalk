// The deny list of the Polish audit (not a test itself): English words that must not be left in the text of a Polish page, and
// the tool names that are fine in Polish text. Kept by hand: when the audit finds a new leftover, add its word here.
// Words that are also Polish (to, on, do, by, as, we, most, model, plan, link, menu, start) are deliberately not in the list.
export const KEEP = ['GLB', 'PNG', 'JSON', 'HTML', 'PDF', 'AI', 'WASD', 'Shift', 'Esc', 'WebGL', 'planwalk', 'prompt', 'Safari', 'Chrome', 'Firefox', 'Menu', 'CAD', 'URL', 'iPhone', 'PL', 'EN'];

export const ENGLISH_WORDS = [
  // articles, pronouns, little words
  'the', 'and', 'or', 'of', 'in', 'is', 'are', 'was', 'be', 'it', 'its', 'you', 'your', 'our', 'with', 'without', 'from', 'into',
  'here', 'there', 'please', 'this', 'that', 'these', 'those', 'not', 'cannot', 'could', 'should', 'would', 'will', 'has', 'have',
  'when', 'what', 'how', 'then', 'than', 'more', 'every', 'each', 'nothing', 'everything', 'whole', 'again', 'now', 'next',
  // verbs of the interface
  'click', 'tap', 'press', 'paste', 'copy', 'copied', 'export', 'open', 'close', 'closed', 'load', 'loaded', 'cancel', 'help', 'hide',
  'show', 'drop', 'pick', 'download', 'share', 'fix', 'reload', 'send', 'ask', 'try', 'check', 'found', 'contains', 'stored', 'uploaded',
  'upload', 'stays', 'works', 'failed', 'went', 'wrong', 'something',
  // nouns of the interface
  'level', 'levels', 'example', 'examples', 'file', 'files', 'note', 'notes', 'source', 'warning', 'warnings', 'error', 'errors',
  'issue', 'issues', 'label', 'labels', 'texture', 'textures', 'explode', 'cutaway', 'walk', 'orbit', 'dollhouse', 'top', 'about',
  'scale', 'room', 'rooms', 'answer', 'links', 'language', 'standalone', 'image', 'picture', 'drawing', 'request', 'details', 'page',
  'browser', 'chat', 'floor', 'wall', 'walls', 'door', 'doors', 'window', 'furniture', 'stairs', 'area', 'total', 'name', 'untitled',
  'version', 'text', 'plans',
  // the words of the bundled examples (examples/*.plan.json), which have Polish names on a Polish page
  'living', 'bedroom', 'kitchen', 'bathroom', 'hall', 'study', 'landing',
];

const keepRe = new RegExp(`(?<![\\p{L}\\d])(${KEEP.join('|')})(?![\\p{L}\\d])`, 'gu');
const wordRe = new RegExp(`(?<![\\p{L}\\d])(${ENGLISH_WORDS.join('|')})(?![\\p{L}\\d])`, 'giu');

// The English words found in a piece of Polish interface text (placeholders like {name} and tool names removed first); [] when there are none.
export function englishLeft(text) {
  return [...new Set((String(text).replace(/\{\w+\}/g, ' ').replace(keepRe, ' ').match(wordRe) || []).map((w) => w.toLowerCase()))];
}

// A line the validator wrote for the AI ("W113 levels[0].height ..."): English on purpose, see viewer/src/strings.js (fixRequestText).
export const isValidatorLine = (text) => /^[EW]\d{3}\b/.test(String(text).trim());

// The style rule for everything the product says: no em dash, no en dash.
export const DASHES = /[\u2013\u2014]/;
