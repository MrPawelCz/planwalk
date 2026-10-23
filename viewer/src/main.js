// planwalk viewer entry: UI, camera modes, walk controls and the public window.planwalk API (docs/SPEC.md section 6).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { validatePlan } from '../../src/core/validate.js';
import { extractJson } from '../../src/core/extract-json.js';
import { createNotices, fetchPlanText, readPlanFile, reportCrash, loadMessage, downloadMessage, issueLines, severalPlansMessage, noWebglText } from './load-errors.js';
import { buildModel, roomAt, modelExtent, CUT_HEIGHT, PLAYER } from './geometry.js';
import { PlanScene, Stage } from './scene.js';
import { LOOKS, setTextureAnisotropy, withoutNormalMaps } from './materials.js';
import { createWorld, createPlayer, teleport, stepPlayer, defaultSpawn } from './physics.js';
import { createAbout, ABOUT_CSS } from './about.js';
import { version as PW_VERSION } from '../../package.json'; // the one place the version lives; esbuild inlines just this field
import { getLang } from './i18n.js';
import { createFirstVisit } from './first-visit.js';
import { createHelp } from './help.js';

// All user-facing strings live here so a translation is one object.
const T = {
  dollhouse: 'Dollhouse', orbit: 'Orbit', top: 'Top', walk: 'Walk',
  level: 'Level', allLevels: 'All levels', explode: 'Explode', cutaway: 'Cutaway', labels: 'Labels', textures: 'Textures',
  texturesTip: 'Procedural wood, tile, plaster and fabric textures instead of plain clay colours',
  exportGlb: 'Export GLB', exportPng: 'Export PNG', standalone: 'Standalone HTML', standaloneTip: 'Download one HTML file with this plan embedded', help: 'Help',
  paste: 'Paste JSON', load: 'Load', cancel: 'Cancel', examples: 'Examples',
  empty: 'Drop a plan JSON file here, paste one, or pick an example.',
  unusable: 'The plan could not be turned into a model. See the issues below.',
  noWebgl: 'WebGL is not available in this browser, so the 3D view cannot start.',
  copyFix: 'Copy fix request', copied: 'Copied', issues: 'Issues', fix: 'Fix',
  pastePrompt: 'Paste the plan JSON here',
  walkHint: 'Click to look around. WASD or arrows move, Shift runs, Esc goes back.',
};

const MODES = ['dollhouse', 'orbit', 'top', 'walk'];
const MODE_DEFAULTS = {
  dollhouse: { cutaway: true, labels: true },
  orbit: { cutaway: false, labels: true },
  top: { cutaway: true, labels: true },
  walk: { cutaway: false, labels: false },
};
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#dfe6ee;font:13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#37332d}
#pw-app{position:fixed;inset:0}
#pw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none}
.pw-bar{position:absolute;top:10px;left:10px;right:10px;display:flex;flex-wrap:wrap;gap:5px 6px;align-items:center;padding:5px 8px;font-size:12px;background:rgba(255,255,255,.86);backdrop-filter:blur(8px);border:1px solid rgba(80,72,62,.15);border-radius:10px;box-shadow:0 2px 10px rgba(60,50,40,.08)}
.pw-brand{font-weight:700;letter-spacing:.2px;margin-right:4px}
.pw-name{color:#7a7266;max-width:14ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pw-seg{display:flex;border:1px solid rgba(80,72,62,.25);border-radius:7px;overflow:hidden}
.pw-bar button,.pw-bar select,.pw-card button,.pw-dlg button{font:inherit;color:inherit;background:#fbfaf7;border:1px solid rgba(80,72,62,.25);border-radius:7px;padding:3px 8px;cursor:pointer}
.pw-seg button{border:0;border-radius:0;border-right:1px solid rgba(80,72,62,.2)}
.pw-seg button:last-child{border-right:0}
.pw-bar button:hover,.pw-card button:hover,.pw-dlg button:hover{background:#f0ece3}
.pw-bar button.on{background:#37332d;color:#fff}
.pw-bar button:disabled,.pw-bar select:disabled,.pw-bar input:disabled{opacity:.4;cursor:default}
.pw-bar label{display:flex;align-items:center;gap:4px;white-space:nowrap}
.pw-spacer{flex:1}
.pw-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:min(440px,86vw);padding:18px 20px;text-align:center;background:rgba(255,255,255,.9);border:1px dashed rgba(80,72,62,.4);border-radius:14px}
.pw-card p{margin:0 0 10px}
.pw-card button{margin:3px}
.pw-issues{position:absolute;left:10px;bottom:10px;width:min(560px,92vw);max-height:42vh;overflow:auto;background:rgba(255,255,255,.93);border:1px solid rgba(80,72,62,.2);border-radius:10px;padding:8px 10px;box-shadow:0 2px 10px rgba(60,50,40,.1)}
.pw-issues h3{margin:0 0 6px;font-size:13px;display:flex;gap:8px;align-items:center}
.pw-issues ul{margin:0;padding:0;list-style:none}
.pw-issues li{padding:4px 0;border-top:1px solid rgba(80,72,62,.12)}
.pw-issues .e{color:#b3321f;font-weight:600}.pw-issues .w{color:#9a6a12;font-weight:600}
.pw-issues em{display:block;color:#6a6358;font-style:normal}
.pw-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:5px 12px;background:rgba(40,36,30,.72);color:#fff;border-radius:999px;pointer-events:none}
.pw-mini{position:absolute;right:12px;bottom:12px;width:180px;height:180px;border:1px solid rgba(80,72,62,.3);border-radius:10px;background:rgba(255,255,255,.82)}
.pw-dlg{border:1px solid rgba(80,72,62,.3);border-radius:12px;padding:14px 16px;max-width:min(560px,92vw);color:#37332d}
.pw-dlg::backdrop{background:rgba(40,36,30,.35)}
.pw-dlg textarea{width:min(520px,80vw);height:260px;font:12px ui-monospace,Menlo,Consolas,monospace;box-sizing:border-box}
.pw-dlg h2{margin:0 0 8px;font-size:15px}.pw-dlg li{margin:4px 0}
[hidden]{display:none!important}
`;

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// <dialog> needs Safari 15.4; without it the open attribute alone shows and hides the dialog (see .pw-dlg in load-errors.js).
const openDialog = (d) => { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); };
const closeDialog = (d) => { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); };

function b64urlDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}

function start() {
  document.documentElement.lang = getLang();
  const style = h('style', { 'data-pw': '1' });
  style.textContent = CSS + ABOUT_CSS;
  document.head.append(style);

  // ---------- DOM ----------
  const canvas = h('canvas', { id: 'pw-canvas', tabindex: '0' });
  const root = h('div', { id: 'pw-app' }, canvas);
  document.body.append(root);
  const notes = createNotices(root, () => bar);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch (err) {
    root.append(h('div', { class: 'pw-card' }, h('p', {}, noWebglText())));
    window.planwalk = { error: String(err && err.message ? err.message : err) };
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  setTextureAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const modeBtns = Object.fromEntries(MODES.map((m) => [m, h('button', { type: 'button', onclick: () => api.setMode(m) }, T[m])]));
  const levelSel = h('select', { title: T.level, onchange: (e) => api.setLevel(e.target.value || null) });
  const explodeIn = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', style: 'width:70px', oninput: (e) => api.setExplode(+e.target.value) });
  const cutBox = h('input', { type: 'checkbox', onchange: (e) => api.setCutaway(e.target.checked) });
  const labBox = h('input', { type: 'checkbox', onchange: (e) => api.setLabels(e.target.checked) });
  const texBox = h('input', { type: 'checkbox', onchange: (e) => api.setMaterials(e.target.checked ? 'textured' : 'clay') });
  const sampleSel = h('select', { title: T.examples, onchange: (e) => { if (e.target.value) api.load(samples[e.target.value]); e.target.value = ''; } });
  const nameEl = h('span', { class: 'pw-name' });
  const about = createAbout(h, () => ({ plan, model, warnings: issues.warnings.length, version: PW_VERSION }));
  const visit = createFirstVisit({ h, onPaste: () => openDialog(pasteDlg) });
  const help = createHelp({ h });
  const bar = h('div', { class: 'pw-bar' },
    h('span', { class: 'pw-brand' }, 'planwalk'), nameEl, about.badge, visit.tag,
    h('div', { class: 'pw-seg' }, MODES.map((m) => modeBtns[m])),
    levelSel,
    h('label', {}, T.explode, explodeIn),
    h('label', {}, cutBox, T.cutaway),
    h('label', {}, labBox, T.labels),
    h('label', { title: T.texturesTip }, texBox, T.textures),
    h('span', { class: 'pw-spacer' }),
    sampleSel,
    h('button', { type: 'button', onclick: () => openDialog(pasteDlg) }, T.paste),
    h('button', { type: 'button', onclick: () => api.exportGLB().then((buf) => download(new Blob([buf], { type: 'model/gltf-binary' }), `${slug()}.glb`)) }, T.exportGlb),
    h('button', { type: 'button', onclick: () => fetch(api.screenshot()).then((r) => r.blob()).then((b) => download(b, `${slug()}.png`)) }, T.exportPng),
    h('button', { type: 'button', title: T.standaloneTip, onclick: () => download(new Blob([standaloneHtml()], { type: 'text/html' }), `${slug()}.html`) }, T.standalone),
    about.button,
    h('button', { type: 'button', onclick: () => help.open() }, T.help));
  const card = h('div', { class: 'pw-card' }, h('p', { id: 'pw-card-text' }, T.empty), h('div', { id: 'pw-card-samples' }));
  const issuesEl = h('div', { class: 'pw-issues', hidden: '' });
  const hint = h('div', { class: 'pw-hint', hidden: '' }, T.walkHint);
  const mini = h('canvas', { class: 'pw-mini', width: '180', height: '180', hidden: '' });
  const pasteArea = h('textarea', { placeholder: T.pastePrompt, spellcheck: 'false' });
  const pasteDlg = h('dialog', { class: 'pw-dlg' },
    h('form', { method: 'dialog' }, pasteArea,
      h('div', { style: 'margin-top:8px;display:flex;gap:8px;justify-content:flex-end' },
        notes.openFileButton(openPicked),
        h('button', { type: 'submit', value: 'cancel' }, T.cancel),
        h('button', { type: 'button', onclick: () => { api.load(pasteArea.value); closeDialog(pasteDlg); } }, T.load))));
  root.append(bar, card, visit.el, issuesEl, hint, mini, pasteDlg, help.el, about.dialog);
  card.append(notes.openFileButton(openPicked));

  // ---------- three.js ----------
  const scene = new THREE.Scene();
  const stage = new Stage(scene);
  const persp = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  ortho.up.set(0, 0, -1);
  const controls = new OrbitControls(persp, canvas);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.screenSpacePanning = true;

  // ---------- state ----------
  let plan = null, rawText = '', model = null, planScene = null, world = null, player = null;
  let mode = 'dollhouse', cutaway = true, labels = true, levelId = null;
  let materials = 'textured';
  let explodeT = 0, explodeV = 0;
  let issues = { errors: [], warnings: [] };
  let samples = {};
  let topView = { cx: 0, cz: 0, half: 5 };
  const apiIn = { forward: 0, strafe: 0, turn: 0, run: false };
  const kb = new Set();
  const touch = { forward: 0, strafe: 0 };
  let shift = false;
  let last = performance.now();

  const slug = () => (plan?.name || 'planwalk').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'planwalk';

  function size() {
    const w = Math.max(1, root.clientWidth || window.innerWidth), hgt = Math.max(1, root.clientHeight || window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, hgt, false);
    aspect(w / hgt);
  }
  function aspect(a) {
    persp.aspect = a;
    persp.updateProjectionMatrix();
    applyTop(a);
  }
  function applyTop(a = persp.aspect) {
    ortho.left = -topView.half * a; ortho.right = topView.half * a; ortho.top = topView.half; ortho.bottom = -topView.half;
    ortho.updateProjectionMatrix();
    const e = model ? modelExtent(model, explodeV) : { maxY: 3 };
    ortho.position.set(topView.cx, e.maxY + 50, topView.cz);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(topView.cx, 0, topView.cz);
  }

  function levelIndexOf(id) { return model && id != null ? model.levelIndex.get(id) : undefined; }
  function levelVisible(i) {
    if (mode === 'walk' || levelId == null) return true;
    const sel = levelIndexOf(levelId);
    return sel === undefined ? true : i <= sel;
  }

  // Labels of a lower level would shine through the level above, so while the levels are stacked only the
  // top visible level keeps its labels; once they are pulled apart every level shows its own.
  function updateLabels() {
    if (!planScene) return;
    const on = labels && mode !== 'walk';
    let top = 0;
    model.levels.forEach((_, i) => { if (levelVisible(i)) top = i; });
    for (const l of planScene.labels) l.visible = on && (explodeV > 0.3 || l.parent.userData.level === top);
  }

  function applyVisuals() {
    if (!planScene) return;
    const walking = mode === 'walk';
    planScene.setCut(!walking && cutaway ? CUT_HEIGHT : null);
    planScene.setCeilings(walking);
    planScene.setArcs(!walking);
    planScene.setWalkShadows(walking);
    planScene.setLevelVisible(levelVisible);
    updateLabels();
    stage.setWalk(walking);
  }

  function syncUi() {
    for (const m of MODES) modeBtns[m].classList.toggle('on', m === mode);
    cutBox.checked = cutaway; labBox.checked = labels; texBox.checked = materials === 'textured';
    explodeIn.value = String(explodeT);
    const walking = mode === 'walk';
    levelSel.disabled = walking || !model; explodeIn.disabled = walking || !model; cutBox.disabled = walking || !model; labBox.disabled = walking || !model;
    levelSel.value = levelId ?? '';
    hint.hidden = !walking || !model;
    mini.hidden = !walking || !model;
    card.hidden = !!model;
    nameEl.textContent = plan?.name || '';
    about.update();
    visit.setExample(!!plan && Object.values(samples).includes(plan));
    issuesEl.hidden = !(issues.errors.length || issues.warnings.length);
  }

  function renderIssues() {
    issuesEl.replaceChildren();
    const all = [...issues.errors.map((i) => ['e', i]), ...issues.warnings.map((i) => ['w', i])];
    if (!all.length) return;
    issuesEl.append(h('h3', {}, `${T.issues}: ${issues.errors.length} errors, ${issues.warnings.length} warnings`,
      h('button', { type: 'button', onclick: (e) => { copyText(fixRequest()); e.target.textContent = T.copied; setTimeout(() => { e.target.textContent = T.copyFix; }, 1500); } }, T.copyFix)),
    h('ul', {}, all.map(([k, i]) => h('li', {}, h('span', { class: k }, i.code), ` ${i.path || ''} ${i.message} `, h('em', {}, `${T.fix}: ${i.fix}`)))));
  }

  function fixRequest(p = plan, raw = rawText, shown = issues) {
    const lines = [...shown.errors, ...shown.warnings].map((i) => `- ${i.code} ${i.path || ''}: ${i.message} ${T.fix}: ${i.fix}`);
    const body = p ? JSON.stringify(p, null, 2) : raw;
    return `The floor plan JSON below failed validation in planwalk. Fix every error (and the warnings if you can) by correcting how the drawing was read. Return only the corrected JSON.\n\nIssues:\n${lines.join('\n')}\n\nPlan JSON:\n${body}`;
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); return; }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* clipboard not permitted */ }
    ta.remove();
  }

  function standaloneHtml() {
    const doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll('#pw-app, #planwalk-plan, #planwalk-samples, style[data-pw], meta[property^="og:"], meta[name^="twitter:"]').forEach((n) => n.remove());
    const s = document.createElement('script');
    s.type = 'application/json'; s.id = 'planwalk-plan';
    s.textContent = JSON.stringify(plan ?? {}).replace(/</g, '\\u003c');
    doc.querySelector('body').insertBefore(s, doc.querySelector('body').firstChild);
    return `<!doctype html>\n${doc.outerHTML}`;
  }

  // ---------- model lifecycle ----------
  function clearModel() {
    if (planScene) { scene.remove(planScene.group); planScene.dispose(); }
    planScene = null; model = null; world = null; player = null;
  }

  let fitR = 1;
  function extentInfo() {
    const e = modelExtent(model, explodeV);
    return {
      e,
      c: new THREE.Vector3((e.minX + e.maxX) / 2, (e.minY + e.maxY) / 2, (e.minZ + e.maxZ) / 2),
      R: Math.max(2, 0.5 * Math.hypot(e.maxX - e.minX, e.maxY - e.minY, e.maxZ - e.minZ)),
    };
  }

  // Keeps the whole model in view while the levels pull apart (centre follows, distance scales with the size).
  function refit() {
    if (!model || !(mode === 'dollhouse' || mode === 'orbit')) return;
    const { c, R } = extentInfo();
    const offset = persp.position.clone().sub(controls.target).multiplyScalar(R / fitR);
    controls.target.copy(c);
    persp.position.copy(c).add(offset);
    controls.maxDistance = R * 8.8;
    fitR = R;
    controls.update();
  }

  function frame() {
    if (!model) return;
    const { e, c, R } = extentInfo();
    fitR = R;
    const d = R * 2.0;
    persp.fov = 50; persp.updateProjectionMatrix();
    persp.position.copy(c).addScaledVector(new THREE.Vector3(-0.45, 0.57, 0.68).normalize(), d);
    controls.target.copy(c);
    controls.minDistance = 1; controls.maxDistance = d * 4;
    controls.update();
    topView = { cx: c.x, cz: c.z, half: Math.max((e.maxZ - e.minZ) / 2, (e.maxX - e.minX) / 2 / persp.aspect) * 1.12 + 0.4 };
    applyTop();
  }

  function spawn() {
    const sp = defaultSpawn(model);
    teleport(world, player, sp.x, sp.y, sp.level);
    player.yaw = rad(sp.yawDeg);
    player.pitch = 0;
    player.collisions = 0;
  }

  // input: plan text (a chat answer is fine) or an object. source: 'link' (#plan=), 'download' (?plan=) or 'file', which only changes the wording of a failure.
  // A text that holds no plan, or a plan that cannot become a model, leaves the model on screen alone and says so in the banner.
  function load(input, source) {
    try {
      return loadPlan(input, source);
    } catch (err) {
      reportCrash(err);
      return { ok: false, errors: [{ code: 'E001', path: '', message: String(err && err.message ? err.message : err), fix: 'Reload the page.' }], warnings: [], repairs: [] };
    }
  }

  function loadPlan(input, source) {
    let obj = input, repairs = [];
    if (typeof input === 'string') {
      const found = extractJson(input);
      if (!found.ok) {
        notes.show(loadMessage(found.kind, source, input));
        const bad = validatePlan(input);
        return { ok: false, errors: bad.errors, warnings: bad.warnings, repairs: [] };
      }
      obj = found.value; repairs = found.repairs;
    }
    const res = validatePlan(obj);
    if (!res.normalized && model) {
      const failed = { errors: res.errors, warnings: res.warnings };
      notes.show(loadMessage('unusable'), notes.copyFixAction(() => fixRequest(obj && typeof obj === 'object' ? obj : null, typeof input === 'string' ? input : '', failed)), issueLines(res.errors));
      return { ok: res.ok, errors: res.errors, warnings: res.warnings, repairs };
    }
    notes.hide();
    const several = severalPlansMessage(repairs);
    if (several && res.normalized) notes.show(several); // never claim a load that did not happen
    visit.hide();
    rawText = typeof input === 'string' ? input : '';
    issues = { errors: res.errors, warnings: res.warnings };
    plan = obj && typeof obj === 'object' ? obj : null;
    clearModel();
    if (res.normalized) {
      model = buildModel(res.normalized);
      planScene = new PlanScene(model, materials);
      scene.add(planScene.group);
      world = createWorld(model);
      player = createPlayer(world, {});
      spawn();
      levelId = null;
      explodeT = explodeV = 0;
      planScene.setExplode(0);
      stage.fit(model, 0);
      rebuildLevelSelect();
      const keep = mode;
      mode = keep;
      applyModeDefaults(mode);
      frame();
      applyVisuals();
    }
    document.getElementById('pw-card-text').textContent = res.normalized ? '' : T.unusable;
    renderIssues();
    syncUi();
    render();
    return { ok: res.ok, errors: res.errors, warnings: res.warnings, repairs };
  }

  // A file the person chose or dropped.
  function openPicked(file) {
    if (pasteDlg.hasAttribute('open')) closeDialog(pasteDlg);
    readPlanFile(file).then((r) => (r.ok ? load(r.text, 'file') : notes.show(downloadMessage(r))));
  }

  function rebuildLevelSelect() {
    levelSel.replaceChildren(h('option', { value: '' }, T.allLevels), ...model.levels.map((l) => h('option', { value: l.id }, l.name || l.id)));
    levelSel.hidden = model.levels.length < 2;
  }

  function applyModeDefaults(m) {
    cutaway = MODE_DEFAULTS[m].cutaway;
    labels = MODE_DEFAULTS[m].labels;
  }

  // ---------- modes ----------
  function setMode(m) {
    if (!MODES.includes(m) || m === mode) return;
    const was = mode;
    mode = m;
    applyModeDefaults(m);
    if (was === 'walk' && document.pointerLockElement === canvas) document.exitPointerLock?.();
    controls.enabled = m === 'dollhouse' || m === 'orbit';
    if (m === 'walk') visit.hide();
    if (m === 'walk' && model) {
      explodeT = explodeV = 0;
      planScene.setExplode(0);
      stage.fit(model, 0);
      persp.fov = 70; persp.updateProjectionMatrix();
      if (player.collisions === 0 && player.x === 0 && player.y === 0) spawn();
    } else if (was === 'walk') {
      persp.fov = 50; persp.updateProjectionMatrix();
      frame();
    }
    applyVisuals();
    syncUi();
    render();
  }

  // ---------- stepping and rendering ----------
  function effectiveInput() {
    const k = (a, b) => (kb.has(a) ? 1 : 0) - (kb.has(b) ? 1 : 0);
    return {
      forward: clamp(apiIn.forward + k('f+', 'f-') + touch.forward, -1, 1),
      strafe: clamp(apiIn.strafe + k('s+', 's-') + touch.strafe, -1, 1),
      turn: clamp(apiIn.turn + k('t+', 't-'), -1, 1),
      run: apiIn.run || shift,
    };
  }

  function stepOnce(dt) {
    if (!model) return;
    if (explodeV !== explodeT) {
      explodeV += (explodeT - explodeV) * (1 - Math.exp(-dt * 9));
      if (Math.abs(explodeT - explodeV) < 1e-3) explodeV = explodeT;
      planScene.setExplode(explodeV);
      stage.fit(model, explodeV);
      refit();
      updateLabels();
    }
    if (mode === 'walk') stepPlayer(world, player, effectiveInput(), dt);
  }

  function poseWalkCamera() {
    const cp = Math.cos(player.pitch), ey = player.floor + PLAYER.eye;
    persp.position.set(player.x, ey, player.y);
    persp.lookAt(player.x + Math.cos(player.yaw) * cp, ey + Math.sin(player.pitch), player.y + Math.sin(player.yaw) * cp);
  }

  function drawMinimap() {
    const ctx = mini.getContext('2d'), S = mini.width;
    const lv = model.levels[player.level], b = model.bounds;
    const bw = Math.max(1e-6, b.maxX - b.minX), bh = Math.max(1e-6, b.maxY - b.minY), pad = 12;
    const s = Math.min((S - 2 * pad) / bw, (S - 2 * pad) / bh);
    const ox = (S - bw * s) / 2, oy = (S - bh * s) / 2;
    const X = (x) => ox + (x - b.minX) * s, Y = (y) => oy + (y - b.minY) * s;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#6b655a';
    for (const c of lv.colliders) {
      if (c.kind === 'furniture' || c.kind === 'rail') continue;
      ctx.save();
      ctx.translate(X(c.cx), Y(c.cy));
      ctx.rotate(Math.atan2(c.uy, c.ux));
      ctx.fillRect(-c.hx * s, -Math.max(c.hy * s, 0.8), 2 * c.hx * s, Math.max(2 * c.hy * s, 1.6));
      ctx.restore();
    }
    ctx.save();
    ctx.translate(X(player.x), Y(player.y));
    ctx.rotate(player.yaw);
    ctx.fillStyle = '#d1542f';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function render() {
    if (mode === 'walk' && model) poseWalkCamera();
    renderer.render(scene, mode === 'top' ? ortho : persp);
    if (mode === 'walk' && model) drawMinimap();
  }

  function advanceTime(ms) {
    let left = Math.max(0, ms) / 1000;
    while (left > 1e-9) {
      const dt = Math.min(left, 1 / 60);
      stepOnce(dt);
      left -= dt;
    }
    render();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (api.manualClock) { last = now; return; }
    advanceTime(Math.min(100, now - last));
    last = now;
  }

  // ---------- public API ----------
  function state() {
    let cam;
    if (mode === 'walk' && player) cam = { x: player.x, y: player.floor + PLAYER.eye, z: player.y, yaw: deg(player.yaw), pitch: deg(player.pitch) };
    else {
      const c = mode === 'top' ? ortho : persp;
      const d = new THREE.Vector3();
      c.getWorldDirection(d);
      cam = { x: c.position.x, y: c.position.y, z: c.position.z, yaw: deg(Math.atan2(d.z, d.x)), pitch: deg(Math.asin(clamp(d.y, -1, 1))) };
    }
    const lvl = model ? (mode === 'walk' ? model.levels[player.level].id : levelId) : null;
    const room = model && mode === 'walk' ? (roomAt(model.levels[player.level], player.x, player.y)?.id ?? null) : null;
    return {
      mode, level: lvl, explode: r3(explodeV), cutaway: mode === 'walk' ? false : cutaway, labels: mode === 'walk' ? false : labels, materials,
      camera: { x: r3(cam.x), y: r3(cam.y), z: r3(cam.z), yaw: r3(cam.yaw), pitch: r3(cam.pitch) },
      room,
      counts: model ? { ...model.counts } : { levels: 0, walls: 0, openings: 0, rooms: 0, furniture: 0, stairs: 0 },
      collisions: player ? player.collisions : 0,
      issues: { errors: issues.errors.length, warnings: issues.warnings.length },
    };
  }

  function screenshot(opts = {}) {
    const w = opts.width ?? renderer.domElement.width, hgt = opts.height ?? renderer.domElement.height;
    const prevRatio = renderer.getPixelRatio(), prev = renderer.getSize(new THREE.Vector2());
    renderer.setPixelRatio(1);
    renderer.setSize(w, hgt, false);
    aspect(w / hgt);
    render();
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prev.x, prev.y, false);
    aspect(prev.x / prev.y);
    render();
    return url;
  }

  // opts.materials: 'clay' or 'textured' (default: the current look). A textured export embeds the colour maps as JPEG;
  // the normal maps stay out unless opts.normalMaps is true, because they are large and compress badly.
  // Exports run one after the other: the scene is rearranged for the file and put back afterwards, which two overlapping runs would mix up.
  let exportQueue = Promise.resolve();
  function exportGLB(opts = {}) {
    if (!planScene) return Promise.reject(new Error('No model loaded'));
    const run = exportQueue.then(() => exportNow(opts));
    exportQueue = run.catch(() => {});
    return run;
  }
  async function exportNow(opts) {
    if (!planScene) throw new Error('No model loaded');
    const look = LOOKS.includes(opts.materials) ? opts.materials : materials;
    const keep = { cut: cutaway, lab: labels, ex: explodeV };
    planScene.setCut(null); planScene.setCeilings(true); planScene.setLabels(false); planScene.setArcs(false);
    planScene.setExplode(0); planScene.setLevelVisible(() => true);
    planScene.setMaterials(look);
    planScene.shareBoxes(true);
    const run = () => new GLTFExporter().parseAsync(planScene.group, { binary: true, onlyVisible: true });
    try {
      return await (opts.normalMaps ? run() : withoutNormalMaps(run));
    } finally {
      planScene.shareBoxes(false);
      planScene.setMaterials(materials); // the look the user has now, which may have changed during the export
      planScene.setExplode(keep.ex);
      applyVisuals();
    }
  }

  const api = {
    version: PW_VERSION,
    manualClock: false,
    load,
    setMode,
    setExplode(v) { if (!model || mode === 'walk') return; explodeT = clamp(+v || 0, 0, 1); explodeIn.value = String(explodeT); },
    setCutaway(on) { cutaway = !!on; applyVisuals(); syncUi(); render(); },
    setLabels(on) { labels = !!on; applyVisuals(); syncUi(); render(); },
    // 'clay' (plain colours) or 'textured' (procedural textures); anything else is ignored.
    setMaterials(kind) {
      if (!LOOKS.includes(kind)) return materials;
      materials = kind;
      planScene?.setMaterials(kind);
      stage.setMaterials(kind);
      syncUi(); render();
      return materials;
    },
    setLevel(id) {
      levelId = id != null && levelIndexOf(id) !== undefined ? id : null;
      applyVisuals(); syncUi(); render();
    },
    walkTo(x, y, lvlId, yawDegrees, pitchDegrees) {
      if (!model) return;
      const li = lvlId != null && levelIndexOf(lvlId) !== undefined ? levelIndexOf(lvlId) : player.level;
      teleport(world, player, +x, +y, li);
      if (yawDegrees != null) player.yaw = rad(+yawDegrees);
      if (pitchDegrees != null && Number.isFinite(+pitchDegrees)) player.pitch = clamp(rad(+pitchDegrees), -1.35, 1.35);
      render();
    },
    walkInput(inp = {}) { apiIn.forward = +inp.forward || 0; apiIn.strafe = +inp.strafe || 0; apiIn.turn = +inp.turn || 0; apiIn.run = !!inp.run; },
    advanceTime,
    // Turns the dollhouse or orbit camera around the model (degrees, positive turns clockwise seen from above).
    rotateView(degrees) {
      if (!model || !(mode === 'dollhouse' || mode === 'orbit')) return;
      const t = controls.target, v = persp.position.clone().sub(t), a = rad(degrees), c = Math.cos(a), s = Math.sin(a);
      persp.position.set(t.x + v.x * c - v.z * s, persp.position.y, t.z + v.x * s + v.z * c);
      controls.update();
      render();
    },
    // Moves the dollhouse or orbit camera toward its target (factor below 1) or away from it (above 1); in Top it scales the view.
    zoomView(factor) {
      if (!model) return;
      const f = clamp(+factor || 1, 0.2, 5);
      if (mode === 'top') { topView.half = clamp(topView.half * f, 1, 400); applyTop(); render(); return; }
      if (!(mode === 'dollhouse' || mode === 'orbit')) return;
      const t = controls.target, offset = persp.position.clone().sub(t).multiplyScalar(f);
      persp.position.copy(t).add(offset);
      controls.update();
      render();
    },
    // Sets the elevation of the dollhouse or orbit camera in degrees above the horizon (azimuth and distance stay).
    tiltView(elevationDegrees) {
      if (!model || !(mode === 'dollhouse' || mode === 'orbit') || !Number.isFinite(+elevationDegrees)) return;
      const t = controls.target, v = persp.position.clone().sub(t), d = v.length(), az = Math.atan2(v.z, v.x), e = rad(clamp(+elevationDegrees, 5, 85));
      persp.position.set(t.x + d * Math.cos(e) * Math.cos(az), t.y + d * Math.sin(e), t.z + d * Math.cos(e) * Math.sin(az));
      controls.update();
      render();
    },
    state,
    renderGameToText: () => JSON.stringify(state()),
    screenshot,
    exportGLB,
  };
  window.planwalk = api;

  // ---------- input ----------
  const KEYMAP = { KeyW: 'f+', ArrowUp: 'f+', KeyS: 'f-', ArrowDown: 'f-', KeyD: 's+', KeyA: 's-', ArrowRight: 't+', ArrowLeft: 't-' };
  const typing = (e) => e.target && e.target.closest && e.target.closest('input,textarea,select,dialog');
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.key === 'Shift') shift = true;
    if (mode !== 'walk') return;
    if (e.code === 'Escape') { setMode('dollhouse'); return; }
    if (KEYMAP[e.code]) { kb.add(KEYMAP[e.code]); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shift = false;
    if (KEYMAP[e.code]) kb.delete(KEYMAP[e.code]);
  });
  window.addEventListener('blur', () => { kb.clear(); shift = false; });
  window.addEventListener('resize', () => { size(); render(); });
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'walk' || !player || document.pointerLockElement !== canvas) return;
    player.yaw += e.movementX * 0.0022;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.35, 1.35);
  });
  canvas.addEventListener('click', () => { if (mode === 'walk' && model) canvas.requestPointerLock?.(); });

  // top view: drag pans, wheel zooms
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (mode === 'top') { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); }
    if (mode === 'walk' && e.pointerType === 'touch') {
      const left = e.clientX < canvas.clientWidth / 2;
      touchPtr.set(e.pointerId, { left, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
      canvas.setPointerCapture(e.pointerId);
    }
  });
  const touchPtr = new Map();
  canvas.addEventListener('pointermove', (e) => {
    if (mode === 'top' && drag) {
      const k = (2 * topView.half) / canvas.clientHeight;
      topView.cx -= (e.clientX - drag.x) * k;
      topView.cz -= (e.clientY - drag.y) * k;
      drag = { x: e.clientX, y: e.clientY };
      applyTop(); render();
    }
    const t = touchPtr.get(e.pointerId);
    if (t && player) {
      if (t.left) { touch.strafe = clamp((e.clientX - t.ox) / 60, -1, 1); touch.forward = clamp(-(e.clientY - t.oy) / 60, -1, 1); }
      else { player.yaw += (e.clientX - t.x) * 0.005; player.pitch = clamp(player.pitch - (e.clientY - t.y) * 0.005, -1.35, 1.35); t.x = e.clientX; t.y = e.clientY; }
    }
  });
  const endPtr = (e) => {
    drag = null;
    const t = touchPtr.get(e.pointerId);
    if (t?.left) { touch.forward = 0; touch.strafe = 0; }
    touchPtr.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'top') return;
    e.preventDefault();
    topView.half = clamp(topView.half * Math.exp(e.deltaY * 0.001), 1, 400);
    applyTop(); render();
  }, { passive: false });

  // plan sources: drop, paste
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) openPicked(f);
  });
  window.addEventListener('paste', (e) => {
    if (typing(e)) return;
    const t = e.clipboardData?.getData('text');
    if (t && t.includes('{')) api.load(t); // a whole chat answer is fine; text without a { is not meant for planwalk
  });

  // ---------- boot ----------
  size();
  controls.enabled = true;
  const embeddedSamples = document.getElementById('planwalk-samples');
  if (embeddedSamples) {
    try { samples = JSON.parse(embeddedSamples.textContent); } catch { samples = {}; }
  }
  const sampleNames = Object.keys(samples);
  sampleSel.replaceChildren(h('option', { value: '' }, T.examples), ...sampleNames.map((n) => h('option', { value: n }, n)));
  sampleSel.hidden = !sampleNames.length;
  document.getElementById('pw-card-samples').replaceChildren(...sampleNames.map((n) => h('button', { type: 'button', onclick: () => api.load(samples[n]) }, n)));
  syncUi();

  stage.setMaterials(materials);
  const embedded = document.getElementById('planwalk-plan');
  const q = new URLSearchParams(location.search);
  if (LOOKS.includes(q.get('materials'))) api.setMaterials(q.get('materials'));
  const hash = /^#plan=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (embedded && embedded.textContent.trim()) api.load(embedded.textContent);
  else if (hash) { try { api.load(b64urlDecode(hash[1]), 'link'); } catch { notes.show(loadMessage('invalid', 'link')); } }
  else if (/^https?:\/\//i.test(q.get('plan') || '')) fetchPlanText(q.get('plan')).then((r) => (r.ok ? api.load(r.text, 'download') : notes.show(downloadMessage(r))));
  else if (sampleNames.length) { api.load(samples[sampleNames[0]]); visit.show(); }
  requestAnimationFrame(loop);
}

const boot = () => { try { start(); } catch (err) { reportCrash(err); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
