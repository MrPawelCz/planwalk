// The prompt a newcomer gives to an AI chat. tools/build.mjs embeds the fenced prompt block of docs/PROMPT.md (and of
// docs/PROMPT.pl.md when it exists) as <script type="text/plain" id="planwalk-prompt-en|pl">, with "</script" and "<!--" escaped.
const LANGS = ['en', 'pl'];

// The prompt text of one language, or null when that language is not embedded in this page.
export function getPrompt(lang) {
  const el = typeof document !== 'undefined' ? document.getElementById(`planwalk-prompt-${lang}`) : null;
  return el ? el.textContent.replace(/<\\\/(script)/gi, '</$1').replace(/<\\!--/g, '<!--') : null;
}

export const promptLangs = () => LANGS.filter((l) => getPrompt(l) !== null);
// The prompt in the wanted language, English when that one is missing.
export const promptFor = (lang) => getPrompt(lang) ?? getPrompt('en') ?? '';

// Puts text on the clipboard; answers true when it worked. Falls back to a hidden textarea where the clipboard API is missing or refused.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* refused: try the old way */ }
  const ta = document.createElement('textarea');
  ta.style.cssText = 'position:fixed;opacity:0';
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* clipboard not permitted */ }
  ta.remove();
  return ok;
}
