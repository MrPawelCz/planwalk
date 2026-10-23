// One way to show and hide every dialog. <dialog> with showModal() needs Safari 15.4; before that the open attribute alone
// shows it, a class gives it a place on the screen, and a form with method="dialog" (not known there, so it would reload the
// page) is closed by hand. Escape closes it too. Tested by deleting HTMLDialogElement.prototype.showModal before load.
const FALLBACK_CSS = `
.pw-dlg.pw-dlg-plain{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;max-height:86vh;overflow:auto;box-sizing:border-box;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.35)}
`;
let cssAdded = false;

function wireFallback(d) {
  if (d.pwWired) return;
  d.pwWired = true;
  d.addEventListener('submit', (e) => { e.preventDefault(); closeDialog(d); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialog(d); });
}

export function openDialog(d) {
  if (typeof d.showModal === 'function') { d.showModal(); return; }
  if (!cssAdded) {
    const style = document.createElement('style');
    style.setAttribute('data-pw', '1');
    style.textContent = FALLBACK_CSS;
    document.head.append(style);
    cssAdded = true;
  }
  wireFallback(d);
  d.classList.add('pw-dlg-plain');
  d.setAttribute('open', '');
  const first = d.querySelector('textarea, button, a');
  if (first && first.focus) first.focus();
}

export function closeDialog(d) {
  d.classList.remove('pw-dlg-plain');
  if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
}
