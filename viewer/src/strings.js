// Strings of the main window (toolbar, empty card, issues panel, paste dialog) in English and Polish, plus the helpers that
// turn counts and issues into sentences. Other modules keep their own tables (see i18n.js). No DOM here, so Node tests reach it.
import { getLang, makeT } from './i18n.js';

export const STRINGS = {
  en: {
    dollhouse: 'Dollhouse', orbit: 'Orbit', top: 'Top', walk: 'Walk',
    level: 'Level', allLevels: 'All levels', explode: 'Explode', cutaway: 'Cutaway', labels: 'Labels', textures: 'Textures',
    texturesTip: 'Procedural wood, tile, plaster and fabric textures instead of plain clay colours',
    exportGlb: 'Export GLB', exportPng: 'Export PNG', standalone: 'Standalone HTML', standaloneTip: 'A single HTML file with this plan inside, to open on a computer', help: 'Help',
    paste: 'Paste JSON', load: 'Load', cancel: 'Cancel', examples: 'Examples',
    empty: 'Drop a plan JSON file here, paste one, or pick an example.',
    unusable: 'The plan could not be turned into a model. See the issues below.',
    noWebgl: 'WebGL is not available in this browser, so the 3D view cannot start.',
    copyFix: 'Copy fix request', copied: 'Copied', issues: 'Issues', fix: 'Fix',
    pastePrompt: 'Paste the whole answer from the AI chat here (the JSON alone works too)',
    walkHint: 'Click to look around. WASD or arrows move, Shift runs, Esc goes back.',
    // counts: one form per plural category (English: one|other, Polish: one|few|many), see countText()
    errorsCount: '{n} error|{n} errors',
    warningsCount: '{n} warning|{n} warnings',
    noteErrors: 'Errors: something in the plan does not add up. Copy the fix request, paste it into the same AI chat and load the corrected answer.',
    noteWarnings: 'Warnings: the model loaded, but a value looks odd (a size, the scale). Check it against your drawing, or ask the AI to fix it.',
    // the request that goes to the AI chat: the instruction follows the page language, the issue lines stay as the validator wrote them
    fixIntro: 'The floor plan JSON below failed validation in planwalk. Fix every error (and the warnings if you can) by correcting how the drawing was read. Return only the corrected JSON.',
    fixIssues: 'Issues', fixPlan: 'Plan JSON',
  },
  pl: {
    dollhouse: 'Makieta', orbit: 'Obrót', top: 'Z góry', walk: 'Spacer',
    level: 'Piętro', allLevels: 'Wszystkie piętra', explode: 'Rozsuń piętra', cutaway: 'Niskie ściany', labels: 'Nazwy pokoi', textures: 'Tekstury',
    texturesTip: 'Drewno, płytki, tynk i tkaniny zamiast gładkich kolorów',
    exportGlb: 'Pobierz model 3D (GLB)', exportPng: 'Pobierz obraz (PNG)', standalone: 'Pobierz jako plik HTML', standaloneTip: 'Jeden plik HTML z tym planem w środku, do otwarcia na komputerze', help: 'Pomoc',
    paste: 'Wklej odpowiedź', load: 'Wczytaj', cancel: 'Anuluj', examples: 'Przykłady',
    empty: 'Wklej odpowiedź z czatu z AI, otwórz plik z planem albo wybierz przykład.',
    unusable: 'Z tego planu nie udało się zbudować modelu. Zobacz problemy poniżej.',
    noWebgl: 'W tej przeglądarce nie ma WebGL, więc widok 3D nie może się uruchomić.',
    copyFix: 'Kopiuj prośbę o poprawkę', copied: 'Skopiowano', issues: 'Problemy', fix: 'Jak poprawić',
    pastePrompt: 'Wklej tutaj całą odpowiedź z czatu z AI (sam JSON też wystarczy)',
    walkHint: 'Kliknij, żeby się rozglądać. Strzałki lub WASD: ruch, Shift: bieg, Esc: powrót.',
    errorsCount: '{n} błąd|{n} błędy|{n} błędów',
    warningsCount: '{n} ostrzeżenie|{n} ostrzeżenia|{n} ostrzeżeń',
    noteErrors: 'Błędy: coś w planie się nie zgadza. Opisy niżej są po angielsku, bo są pisane dla AI: skopiuj prośbę o poprawkę, wklej ją do czatu z AI i wczytaj poprawioną odpowiedź.',
    noteWarnings: 'Ostrzeżenia: model się wczytał, ale jakaś wartość wygląda dziwnie (wymiar, skala). Sprawdź ją na rysunku albo poproś AI o poprawkę (opisy niżej są po angielsku).',
    fixIntro: 'Poniższy JSON planu mieszkania nie przeszedł kontroli w planwalk. Popraw każdy błąd (a jeśli się da, także ostrzeżenia), odczytując rysunek jeszcze raz. Odpowiedz tylko poprawionym JSON-em.',
    fixIssues: 'Problemy', fixPlan: 'JSON planu',
  },
};
export const t = makeT(STRINGS);

// T.key is the caption in the current language. It is a String object that remembers its key, so main.js's h() can bind the
// element to it and give it the new caption when the language changes; used as a plain string it reads like one.
export const T = {};
for (const key of Object.keys(STRINGS.en)) {
  Object.defineProperty(T, key, { enumerable: true, get: () => Object.assign(new String(t(key)), { key }) });
}

// 0 for one, 1 for few (Polish) or other (English), 2 for many (Polish): English 1 | other, Polish 1 | 2 to 4 except 12 to 14 | the rest.
export function pluralIndex(n, lang = getLang()) {
  if (n === 1) return 0;
  if (lang !== 'pl') return 1;
  const m10 = n % 10, m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14) ? 1 : 2;
}

// "1 błąd", "2 błędy", "5 błędów" from a key whose value lists the forms divided by "|".
export function countText(key, n, lang = getLang()) {
  const forms = (STRINGS[lang] && STRINGS[lang][key] ? STRINGS[lang][key] : STRINGS.en[key]).split('|');
  return forms[Math.min(pluralIndex(n, lang), forms.length - 1)].replace(/\{n\}/g, String(n));
}

// The heading of the issues panel: "Issues: 0 errors, 3 warnings".
export const issuesHeading = (errors, warnings, lang = getLang()) => `${STRINGS[lang].issues}: ${countText('errorsCount', errors, lang)}, ${countText('warningsCount', warnings, lang)}`;

// The text a person pastes into the AI chat to get a plan corrected. Issue lines keep the validator's English (code, path,
// message, fix), the sentences around them follow lang.
export function fixRequestText({ errors, warnings, body }, lang = getLang()) {
  const s = STRINGS[lang] || STRINGS.en;
  const lines = [...errors, ...warnings].map((i) => `- ${i.code} ${i.path || ''}: ${i.message} ${STRINGS.en.fix}: ${i.fix}`);
  return `${s.fixIntro}\n\n${s.fixIssues}:\n${lines.join('\n')}\n\n${s.fixPlan}:\n${body}`;
}
