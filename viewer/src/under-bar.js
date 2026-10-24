// Floating notes that sit just under the toolbar (the load banner, the "Loaded" line). The toolbar wraps onto more or fewer rows when
// the window is resized or turned, when a font arrives late and when a change of language makes the labels longer, so a note cannot
// measure it once, when it appears. followBar() puts a note under the toolbar's real bottom edge and keeps it there: the note is
// placed again when the toolbar (or a note this one sits under) changes size and when the window is resized.
const GAP = 8;

// el: the note. getBar(): the toolbar element (it may be made after the note). getAbove(): another note this one sits under
// when it is shown (the "Loaded" line under the banner), or nothing. Returns place(), which the owner also calls when it shows the note.
export function followBar(el, getBar, getAbove) {
  const watched = new Set();
  let armed = false, watch = null;
  function place() {
    const bar = getBar && getBar(), above = getAbove && getAbove();
    if (!armed) { // the first call comes when a note is shown, so the toolbar exists by now
      armed = true;
      window.addEventListener('resize', place);
      if (typeof ResizeObserver === 'function') watch = new ResizeObserver(place);
    }
    if (watch) for (const e of [bar, above]) if (e && !watched.has(e)) { watched.add(e); watch.observe(e); }
    let top = bar ? bar.getBoundingClientRect().bottom + GAP : 10;
    if (above && !above.hidden) top += above.getBoundingClientRect().height + GAP;
    el.style.top = `${Math.round(top)}px`;
  }
  return place;
}
