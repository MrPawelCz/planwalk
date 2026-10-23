// Room areas as the viewer shows them (labels, About sheet, GLB node data). No DOM and no three.js, so Node tests reach it.
// A room polygon runs along the wall centrelines, which is 10 to 25% more than the floor you can see. So the area shown is
// what the drawing declares, or, when the plan carries none, an estimate net of the walls (the validator's netArea).
import { netArea } from '../../src/core/validate.js';
import { getLang } from './i18n.js';

// { m2, estimated } for a room of a model level (metres) and the walls of that level.
export function roomArea(room, walls) {
  const declared = room.declaredArea;
  if (Number.isFinite(declared) && declared > 0) return { m2: declared, estimated: false };
  const net = netArea(room.polygon, walls);
  return { m2: Number.isFinite(net) && net > 0 ? net : room.area, estimated: true };
}

// "12,3 m²" in Polish, "12.3 m²" in English; an estimate gets a leading "~".
export function formatArea(m2, estimated = false, lang = getLang()) {
  return `${estimated ? '~' : ''}${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(m2)} m²`;
}

export function areaText(room, walls, lang) {
  const a = roomArea(room, walls);
  return formatArea(a.m2, a.estimated, lang);
}

// Sum over all rooms of a built model: { m2, estimated, rooms }; estimated as soon as one room has no declared area.
export function totalArea(model) {
  let m2 = 0, estimated = false, rooms = 0;
  for (const lv of model.levels) {
    for (const r of lv.rooms) {
      if (r.polygon.length < 3) continue;
      const a = roomArea(r, lv.walls);
      m2 += a.m2; estimated = estimated || a.estimated; rooms++;
    }
  }
  return { m2, estimated, rooms };
}
