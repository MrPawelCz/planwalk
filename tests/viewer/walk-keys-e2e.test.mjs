// End to end in headless Chrome: the space bar of Walk, pressed as a real key. It jumps away from doors, shuts and opens the door in front of
// the player, and never presses the button that still has the focus after a click on Walk or scrolls the page. Also the door in a GLB, and the
// doors after leaving Walk. PLANWALK_SHOTS=dir keeps the pictures. Skips with a clear message when Chrome or dist is missing.
// Run it through tools/chrome-lock.sh when other browsers may be running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, root, skip } from './chrome-page.mjs';

const shots = process.env.PLANWALK_SHOTS || '';
const plan = readFileSync(join(root, 'examples/flat-1.plan.json'), 'utf8');
const SPACE = { code: 'Space', key: ' ', vk: 32, text: ' ' };
const WALK = '.pw-seg button:nth-child(4)';

async function walkPage(p) {
  await p.evaluate(`window.planwalk.manualClock = true; window.planwalk.setLang('en'); window.planwalk.load(${JSON.stringify(plan)}).ok`);
  // The page's own listeners are older than these, so they have run by the time these look: defaultPrevented says whether the key press was taken.
  await p.evaluate(`window.__clicks = 0; document.addEventListener('click', () => { window.__clicks++; }, true);
    window.__space = []; for (const type of ['keydown', 'keyup']) window.addEventListener(type, (e) => { if (e.code === 'Space') window.__space.push(type + ':' + e.defaultPrevented); })`);
  await p.clickAt(WALK); // a real click: the focus stays on the Walk button
  assert.equal(await p.evaluate('window.planwalk.state().mode'), 'walk');
  assert.equal(await p.evaluate('document.activeElement && document.activeElement.textContent'), 'Walk', 'the Walk button has the focus');
  await p.evaluate('window.__clicks = 0');
}
const state = (p) => p.evaluate('window.planwalk.state()');
const press = async (p, hold = 0) => { await p.key('keyDown', SPACE); if (hold) await p.evaluate(`window.planwalk.advanceTime(${hold})`); await p.key('keyUp', SPACE); };
const shot = (p, name) => (shots ? p.screenshot(join(shots, `${name}.jpg`), 80) : null);
const leafNode = (glb) => {
  const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const n = json.nodes.find((q) => q.name === 'opening:d-living-bed/leaf');
  assert.ok(n, 'the leaf is a node of the GLB');
  return JSON.stringify([n.translation, n.rotation, n.scale, n.matrix]);
};
const exportGlb = async (p) => Buffer.from(await p.evaluate(`window.planwalk.exportGLB({ materials: 'clay' }).then((b) => { let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); })`), 'base64');

test('the space bar jumps from the floor, once, and a click on Walk does not make it press a button', { skip, timeout: 120000 }, async () => {
  if (shots) (await import('node:fs')).mkdirSync(shots, { recursive: true });
  const p = await openPage({ size: [1100, 620] });
  try {
    await walkPage(p);
    // far from every door (the nearest is 1.7 m away), looking down at the coffee table and the sofa
    await p.evaluate(`window.planwalk.walkTo(2.4, 1.6, 'L0', 0, -35); window.planwalk.advanceTime(50)`);
    const ground = await state(p);
    assert.equal(ground.camera.y, 1.6);
    assert.equal(ground.jump, 0);
    await shot(p, 'jump-1-ground');
    await p.key('keyDown', SPACE);
    assert.equal((await state(p)).jump, 0, 'nothing moves before time does');
    await p.evaluate('window.planwalk.advanceTime(306)'); // the top of the jump
    const top = await state(p);
    assert.ok(top.camera.y > 1.6 + 0.4 && top.camera.y < 1.6 + 0.5, `camera.y = ${top.camera.y}`);
    assert.ok(Math.abs(top.camera.y - 1.6 - top.jump) < 0.002, 'the camera is the eye height plus the jump');
    assert.ok(top.jump >= 0.44 && top.jump <= 0.47, `jump = ${top.jump}`);
    await shot(p, 'jump-2-top');
    await p.key('keyUp', SPACE);
    assert.equal(await p.evaluate('window.__clicks'), 0, 'the key up did not click the focused button');
    assert.equal((await state(p)).mode, 'walk');
    assert.equal(await p.evaluate('window.scrollY + document.scrollingElement.scrollTop'), 0, 'the page did not scroll');
    assert.deepEqual(await p.evaluate('window.__space'), ['keydown:true', 'keyup:true'], 'both halves of the key press were taken (no scroll, no click)');
    // a second press in the air does nothing; a held key (auto repeat) never starts a new jump
    await p.key('keyDown', { ...SPACE, autoRepeat: true });
    await press(p);
    await p.evaluate('window.planwalk.advanceTime(400)');
    const down = await state(p);
    assert.equal(down.jump, 0, 'back on the floor after 0.7 s: no second jump');
    assert.equal(down.camera.y, 1.6);
    await p.key('keyDown', { ...SPACE, autoRepeat: true });
    await p.key('keyUp', SPACE);
    await p.evaluate('window.planwalk.advanceTime(100)');
    assert.equal((await state(p)).jump, 0, 'a repeat is not a press');
    // another button with the focus: space must not press it (it would leave Walk)
    await p.evaluate(`document.querySelector('.pw-seg button:nth-child(1)').focus()`);
    await press(p, 100);
    assert.equal((await state(p)).mode, 'walk', 'space on the focused Dollhouse button did not press it');
    assert.equal(await p.evaluate('window.__clicks'), 0);
    assert.ok((await state(p)).jump > 0, 'it jumped instead');
    assert.deepEqual(p.pageErrors.concat(p.consoleErrors), []);
  } finally {
    p.close();
  }
});

test('Ctrl, Alt or Meta with the space bar is left to the browser, and a jump cut short by leaving Walk does not go on when the player is back', { skip, timeout: 120000 }, async () => {
  const p = await openPage({ size: [1100, 620] });
  try {
    await walkPage(p);
    await p.evaluate(`window.planwalk.walkTo(2.4, 1.6, 'L0', 0, -35); window.planwalk.advanceTime(50); window.__space.length = 0`);
    for (const modifiers of [2, 1, 4]) { // Ctrl, Alt, Meta
      await p.key('keyDown', { ...SPACE, modifiers });
      await p.key('keyUp', { ...SPACE, modifiers });
    }
    await p.evaluate('window.planwalk.advanceTime(100)');
    assert.equal((await state(p)).jump, 0, 'no jump with a modifier key down');
    const downs = (await p.evaluate('window.__space')).filter((e) => e.startsWith('keydown'));
    assert.deepEqual(downs, ['keydown:false', 'keydown:false', 'keydown:false'], 'the browser keeps those key presses (a shortcut of the system)');
    // a jump that leaving Walk cuts short does not hang in the air until the player is back
    await press(p);
    await p.evaluate('window.planwalk.advanceTime(150)');
    assert.ok((await state(p)).jump > 0.1, 'in the air');
    await p.evaluate(`window.planwalk.setMode('dollhouse'); window.planwalk.setMode('walk')`);
    const back = await state(p);
    assert.equal(back.jump, 0, 'on the floor again');
    assert.equal(back.camera.y, 1.6);
    assert.deepEqual(p.pageErrors.concat(p.consoleErrors), []);
  } finally {
    p.close();
  }
});

test('a text field keeps its spaces and Walk does not jump while one is focused', { skip, timeout: 120000 }, async () => {
  const p = await openPage({ size: [1100, 620] });
  try {
    await walkPage(p);
    await p.evaluate(`window.planwalk.walkTo(3.5, 1.6, 'L0', 0, 0); const i = document.createElement('input'); i.id = 'probe'; document.body.append(i); i.focus()`);
    await press(p, 100);
    assert.equal(await p.evaluate(`document.getElementById('probe').value`), ' ', 'the space was typed');
    assert.equal((await state(p)).jump, 0, 'no jump from a text field');
  } finally {
    p.close();
  }
});

test('a button in the Menu sheet of the compact layout is pressed by the space bar, and Walk does not jump while it has the focus', { skip, timeout: 120000 }, async () => {
  const p = await openPage({ size: [1100, 620] });
  try {
    await walkPage(p);
    // The sheet is a div with role="dialog" (compact.js), not a dialog element; a stand-in of that shape is enough to see who takes the key.
    await p.evaluate(`window.planwalk.walkTo(3.5, 1.6, 'L0', 0, 0); const d = document.createElement('div'); d.setAttribute('role', 'dialog'); const b = document.createElement('button'); b.id = 'probe'; b.textContent = 'Probe'; d.append(b); document.body.append(d); b.focus(); window.__clicks = 0`);
    await press(p, 100);
    assert.equal(await p.evaluate('window.__clicks'), 1, 'the space bar pressed the button');
    assert.equal((await state(p)).jump, 0, 'no jump from the Menu sheet');
  } finally {
    p.close();
  }
});

test('the space bar shuts and opens the door in front of the player, and a shut door stops the walk', { skip, timeout: 180000 }, async () => {
  const p = await openPage({ size: [1100, 620] });
  try {
    await walkPage(p);
    // d-living-bed: the door in the wall x = 5, y 1.0 to 1.9. The player stands 1 m from it in the living room, looking at it.
    await p.evaluate(`window.planwalk.walkTo(4.0, 1.45, 'L0', 0, 0); window.planwalk.advanceTime(50)`);
    const door = async () => (await state(p)).doors.find((d) => d.id === 'd-living-bed');
    assert.deepEqual(await door(), { id: 'd-living-bed', level: 'L0', closed: false, open: 1 }, 'the door starts open');
    await shot(p, 'door-1-open');
    const miniOf = () => p.evaluate(`document.querySelector('.pw-mini').toDataURL()`);
    const miniOpen = await miniOf();
    await press(p);
    assert.equal((await state(p)).jump, 0, 'at a door space does not jump');
    assert.equal((await door()).closed, true);
    await p.evaluate('window.planwalk.advanceTime(225)'); // half of 0.45 s
    const half = await door();
    assert.ok(half.open > 0.45 && half.open < 0.55, `half way: ${half.open}`);
    await shot(p, 'door-2-half');
    await p.evaluate('window.planwalk.advanceTime(300)');
    assert.equal((await door()).open, 0);
    await shot(p, 'door-3-shut');
    assert.notEqual(await miniOf(), miniOpen, 'the minimap draws a shut door as a wall');
    // shut: the walk stops at the door
    await p.evaluate(`window.planwalk.walkInput({ forward: 1 }); window.planwalk.advanceTime(2000); window.planwalk.walkInput({})`);
    const stopped = await state(p);
    assert.ok(stopped.camera.x < 5 - 0.06 - 0.2 + 0.02 && stopped.camera.x > 4.5, `x = ${stopped.camera.x}`);
    // open again and walk through
    await press(p);
    assert.equal((await door()).closed, false);
    await p.evaluate(`window.planwalk.walkTo(4.0, 1.45, 'L0', 0, 0); window.planwalk.advanceTime(500)`);
    assert.equal(await miniOf(), miniOpen, 'and an open door as the gap it was');
    await p.evaluate(`window.planwalk.walkInput({ forward: 1 }); window.planwalk.advanceTime(1500); window.planwalk.walkInput({})`);
    assert.ok((await state(p)).camera.x > 5.3, `through the door: x = ${(await state(p)).camera.x}`);
    assert.equal(await p.evaluate('window.__clicks'), 0);
    assert.deepEqual(p.pageErrors.concat(p.consoleErrors), []);
  } finally {
    p.close();
  }
});

test('a door does not shut on the player, the GLB shows a shut door open, and the doors are open again after leaving Walk', { skip, timeout: 180000 }, async () => {
  const p = await openPage({ size: [1100, 620] });
  try {
    await walkPage(p);
    const door = async () => (await state(p)).doors.find((d) => d.id === 'd-living-bed');
    // standing in the doorway: nothing happens
    await p.evaluate(`window.planwalk.walkTo(5.0, 1.45, 'L0', 0, 0); window.planwalk.advanceTime(50)`);
    await press(p, 600);
    assert.equal((await door()).closed, false, 'the door did not shut on the player');
    assert.equal((await state(p)).jump, 0, 'and the player did not jump');
    // the same door, shut from a step away, is exported open: the leaf node is the same as with the door open
    await p.evaluate(`window.planwalk.walkTo(4.0, 1.45, 'L0', 0, 0)`);
    const open = leafNode(await exportGlb(p));
    await press(p, 600);
    assert.equal((await door()).open, 0);
    const shut = leafNode(await exportGlb(p));
    assert.equal(shut, open, 'a GLB made with the door shut has the leaf in its open pose');
    assert.equal((await door()).open, 0, 'and the door is still shut on screen');
    // leaving Walk opens every door; the next walk starts with open doors
    await p.evaluate(`window.planwalk.setMode('dollhouse')`);
    assert.deepEqual(await door(), { id: 'd-living-bed', level: 'L0', closed: false, open: 1 });
    // the automation inputs do nothing outside Walk
    assert.deepEqual(await p.evaluate('window.planwalk.walkUse()'), { action: 'none' });
    await p.evaluate(`window.planwalk.walkInput({ jump: true }); window.planwalk.advanceTime(100)`);
    assert.equal((await state(p)).jump, 0);
    await p.evaluate(`window.planwalk.setMode('walk')`);
    assert.equal((await state(p)).doors.every((d) => !d.closed && d.open === 1), true);
    // in Walk walkInput({ jump: true }) is one jump and walkUse() says what it did
    await p.evaluate(`window.planwalk.walkTo(2.4, 1.6, 'L0', 0, 0); window.planwalk.walkInput({ jump: true }); window.planwalk.advanceTime(100)`);
    assert.ok((await state(p)).jump > 0.2, 'walkInput({ jump: true }) jumped');
    assert.deepEqual(await p.evaluate('window.planwalk.walkUse()'), { action: 'none' }, 'in the air, with no door: nothing');
    await p.evaluate(`window.planwalk.advanceTime(700)`);
    assert.deepEqual(await p.evaluate('window.planwalk.walkUse()'), { action: 'jump' });
    await p.evaluate(`window.planwalk.advanceTime(700)`);
    await p.evaluate(`window.planwalk.walkTo(4.0, 1.45, 'L0', 0, 0)`);
    assert.deepEqual(await p.evaluate('window.planwalk.walkUse()'), { id: 'd-living-bed', action: 'close' });
    assert.deepEqual(await p.evaluate('window.planwalk.walkUse()'), { id: 'd-living-bed', action: 'open' });
    // a plan loaded again starts with its doors open
    await p.evaluate(`window.planwalk.walkTo(4.0, 1.45, 'L0', 0, 0)`);
    await p.evaluate(`window.planwalk.walkUse()`);
    assert.equal((await door()).closed, true);
    await p.evaluate(`window.planwalk.load(${JSON.stringify(plan)})`);
    assert.equal((await state(p)).doors.every((d) => !d.closed && d.open === 1), true);
    assert.deepEqual(p.pageErrors.concat(p.consoleErrors), []);
  } finally {
    p.close();
  }
});
