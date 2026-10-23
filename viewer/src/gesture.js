// Touch maths for the Top view: what one finger (pan) and two fingers (pinch) do to the view { cx, cz, half }, where (cx, cz) is the
// plan point in the middle of the screen and half is half the visible height in metres. No DOM, no three.js, so a test can drive it.
// Screen x grows to the right and screen y downwards; the Top camera looks down with plan z growing downwards too.
export const TOP_HALF_MIN = 1;
export const TOP_HALF_MAX = 400;
const MIN_SPREAD = 8; // CSS px: two fingers closer than this give no usable zoom ratio

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ok = (...n) => n.every(Number.isFinite);

// One finger moved from `from` to `to` (CSS px) on a screen h px high: the plan follows the finger.
export function panTop(view, from, to, h) {
  const k = (2 * view.half) / h;
  if (!ok(from.x, from.y, to.x, to.y, k) || !(h > 0)) return { ...view };
  return { cx: view.cx - (to.x - from.x) * k, cz: view.cz - (to.y - from.y) * k, half: view.half };
}

// Two fingers moved from a0, b0 to a1, b1 on a w x h px screen: the zoom follows the spread (twice as far apart, half the height)
// and the plan point that was between the fingers stays between them, so the same move also pans.
export function pinchTop(view, a0, b0, a1, b1, w, h) {
  if (!ok(a0.x, a0.y, b0.x, b0.y, a1.x, a1.y, b1.x, b1.y) || !(w > 0) || !(h > 0)) return { ...view };
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const half = clamp(d0 >= MIN_SPREAD && d1 >= MIN_SPREAD ? (view.half * d0) / d1 : view.half, TOP_HALF_MIN, TOP_HALF_MAX);
  const k0 = (2 * view.half) / h, k1 = (2 * half) / h;
  const mx0 = (a0.x + b0.x) / 2, my0 = (a0.y + b0.y) / 2, mx1 = (a1.x + b1.x) / 2, my1 = (a1.y + b1.y) / 2;
  const px = view.cx + (mx0 - w / 2) * k0, pz = view.cz + (my0 - h / 2) * k0; // the plan point under the first midpoint
  return { cx: px - (mx1 - w / 2) * k1, cz: pz - (my1 - h / 2) * k1, half };
}

// The plan point under a screen point, for the same view and screen size.
export const planAt = (view, p, w, h) => ({ x: view.cx + (p.x - w / 2) * ((2 * view.half) / h), z: view.cz + (p.y - h / 2) * ((2 * view.half) / h) });
