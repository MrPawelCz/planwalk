// Small plans for the Walk tests (not a test itself): two rooms with a door and an open passage between them.
import assert from 'node:assert/strict';
import { validatePlan } from '../../src/core/validate.js';
import { buildModel } from '../../viewer/src/geometry.js';

export const planModel = (plan) => { const r = validatePlan(plan); assert.ok(r.normalized, JSON.stringify(r.errors)); return buildModel(r.normalized); };

// Room A (x 0 to 4) and room B (x 4 to 8), 4 m deep, with the door d1 (y 1.0 to 1.9) and the passage p1 (y 2.6 to 3.6) in the wall x = 4.
// divider: a wall across room B at y = 2.4 that hides the door from the south part of B. sill: the sill of the door (a high one cannot be walked through).
export function twoRooms({ divider = false, sill } = {}) {
  const walls = [
    { id: 'w1', from: [0, 0], to: [8, 0], kind: 'exterior' }, { id: 'w2', from: [8, 0], to: [8, 4], kind: 'exterior' },
    { id: 'w3', from: [8, 4], to: [0, 4], kind: 'exterior' }, { id: 'w4', from: [0, 4], to: [0, 0], kind: 'exterior' },
    { id: 'w5', from: [4, 0], to: [4, 4], kind: 'interior' },
  ];
  if (divider) walls.push({ id: 'w6', from: [4, 2.4], to: [8, 2.4], kind: 'interior' });
  const door = { id: 'd1', wall: 'w5', type: 'door', offset: 1.0, width: 0.9 };
  if (sill !== undefined) door.sill = sill;
  return planModel({
    version: 1, name: 'Two rooms', units: 'm',
    levels: [{
      id: 'L0', name: 'Ground', height: 2.6, walls,
      openings: [door, { id: 'p1', wall: 'w5', type: 'passage', offset: 2.6, width: 1.0 }],
      rooms: [{ id: 'a', name: 'A', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], floor: 'wood', ceiling: true }, { id: 'b', name: 'B', polygon: [[4, 0], [8, 0], [8, 4], [4, 4]], floor: 'tile', ceiling: true }],
      stairs: [],
      furniture: [{ id: 'sofa', type: 'sofa', center: [2, 2], rotation: 0 }, { id: 'ward', type: 'wardrobe', center: [0.5, 0.45] }, { id: 'tbl', type: 'table-dining', center: [6, 2], rotation: 90 }],
    }],
  });
}
