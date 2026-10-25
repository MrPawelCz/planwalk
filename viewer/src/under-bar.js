// Floating notes that sit just under the toolbar (the load banner, the "Loaded" line, and the phone's minimap below them). The toolbar
// wraps onto more or fewer rows when the window is resized or turned, when a font arrives late and when a change of language makes
// the labels longer, so a note cannot measure it once, when it appears. followBar() puts a note under the toolbar's real bottom
// edge and keeps it there: the note is placed again when the toolbar (or a note this one sits under) changes size and when the
// window is resized.
const GAP = 8;

// el: the note. getBar(): the toolbar element (it may be made after the note). getAbove(): the note or notes this one sits under,
// or nothing; one that is hidden is skipped but still watched, so this note moves when it comes up. prop: the style property that
// gets the top edge, 'top' unless the stylesheet wants it as a custom property. Returns place(), which the owner also calls when it
// shows the note.
export function followBar(el, getBar, getAbove, prop = 'top') {
  const watched = new Set();
  let armed = false, watch = null, frame = 0;
  // Puts the note under the toolbar (and under the notes above it) as they are right now.
  function put() {
    const bar = getBar && getBar(), above = [].concat(getAbove ? getAbove() : []).filter(Boolean);
    if (watch) for (const e of [bar, ...above]) if (e && !watched.has(e)) { watched.add(e); watch.observe(e); }
    let top = bar ? bar.getBoundingClientRect().bottom + GAP : 10;
    for (const e of above) if (!e.hidden) top += e.getBoundingClientRect().height + GAP;
    el.style.setProperty(prop, `${Math.round(top)}px`);
  }
  function place() {
    if (!armed) { // the first call comes when a note is shown, so the toolbar exists by now
      armed = true;
      window.addEventListener('resize', place);
      if (typeof ResizeObserver === 'function') watch = new ResizeObserver(place);
    }
    put();
    // A change of language sets the labels of the toolbar one after the other in the same task, so a call in the middle of it can measure the toolbar
    // at a height it will not keep, and the observer then stays silent when the toolbar ends as high as it was at its last notification (seen on a
    // runner with a wider font). One more measurement after the frame puts the note right in that case too.
    if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(() => { frame = 0; put(); });
  }
  return place;
}
