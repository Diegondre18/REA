// REA Scene Manager - interfaz
// Un "setup" es una vista guardada de la escena. Cada setup tiene tarjetas (camara, resolucion, sol,
// entorno, capas, objetos, render elements, Corona) que se pueden activar o desactivar: al aplicar
// el setup solo se cambia en 3ds Max lo que tiene la tarjeta activada.

const COMPONENTS = [
  { key: 'camera', title: 'Camara', icon: 'camera', tone: 'slate' },
  { key: 'res', title: 'Resolucion', icon: 'image', tone: 'slate' },
  { key: 'sun', title: 'Sol', icon: 'sun', tone: 'amber' },
  { key: 'env', title: 'Entorno', icon: 'mountain', tone: 'amber' },
  { key: 'layers', title: 'Capas', icon: 'layers', tone: 'teal' },
  { key: 'objects', title: 'Objetos', icon: 'cube', tone: 'teal' },
  { key: 'elements', title: 'Render elements', icon: 'layers2', tone: 'violet' },
  { key: 'corona', title: 'Corona', icon: 'zap', tone: 'red' },
];
const COLORS = ['#5b8def', '#e0a030', '#3fb68b', '#d9584f', '#9b6bd6', '#4fb3d9', '#d97fb3', '#8fbf4a'];
const FORMATS = ['.exr', '.png', '.jpg', '.tif'];
const PRESETS = [
  ['1920x1080', 'Full HD 16:9'], ['2560x1440', 'QHD 16:9'], ['3840x2160', '4K 16:9'],
  ['2000x2000', 'Cuadrado 1:1'], ['1080x1350', 'Instagram 4:5'], ['1080x1920', 'Vertical 9:16'],
  ['3000x2000', 'Foto 3:2'], ['2480x3508', 'A4 300dpi'],
];

const S = {
  scene: null,
  data: null,
  sel: null,
  view: 'setups',
  busy: false,
  batchLog: [],
};

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)));

// ---------------------------------------------------------------- datos

function defaultData() {
  return { version: 1, setups: [], batch: { folder: '', fmt: '.exr', restore: true }, output: { dir: '', name: '', fmt: '.exr' } };
}

function defaultComp() {
  return {
    camera: { on: true, name: '' },
    res: { on: true, w: 1920, h: 1080 },
    sun: { on: false, name: '' },
    env: { on: false, name: '' },
    layers: { on: true, items: [] },
    objects: { on: false, items: [] },
    elements: { on: false, items: [] },
    corona: { on: false, passLimit: '', noiseLimit: '', timeLimit: '' },
  };
}

function normalize(d) {
  const base = defaultData();
  d = Object.assign(base, d || {});
  d.batch = Object.assign(defaultData().batch, d.batch || {});
  d.output = Object.assign(defaultData().output, d.output || {});
  d.setups = (d.setups || []).map(s => {
    const comp = defaultComp();
    Object.keys(comp).forEach(k => { comp[k] = Object.assign(comp[k], (s.comp || {})[k] || {}); });
    return Object.assign({ id: uid(), name: 'Setup', color: COLORS[0], batch: true }, s, { comp });
  });
  return d;
}

function setupFromScene(name) {
  const sc = S.scene;
  const comp = defaultComp();
  comp.camera.name = sc.activeCamera || (sc.cameras[0] ? sc.cameras[0].name : '');
  comp.res.w = sc.res.w;
  comp.res.h = sc.res.h;
  const sun = sc.suns.find(s => s.on);
  comp.sun.name = sun ? sun.name : '';
  comp.env.name = sc.activeEnv || '';
  comp.layers.items = sc.layers.map(l => ({ name: l.name, on: l.on }));
  comp.elements.items = sc.elements.map(e => ({ name: e.name, on: e.enabled }));
  if (sc.corona.isCorona) {
    comp.corona.passLimit = sc.corona.passLimit ?? '';
    comp.corona.noiseLimit = sc.corona.noiseLimit ?? '';
    comp.corona.timeLimit = sc.corona.timeLimit ?? '';
  }
  const color = COLORS[S.data.setups.length % COLORS.length];
  return { id: uid(), name, color, batch: true, comp };
}

function uniqueName(base) {
  base = (base || 'Setup').trim() || 'Setup';
  const names = new Set(S.data.setups.map(s => s.name));
  if (!names.has(base)) return base;
  let k = 2;
  while (names.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

const getSetup = id => S.data.setups.find(s => s.id === id);
const selSetup = () => getSetup(S.sel);

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    Bridge.call('saveData', JSON.stringify(S.data)).catch(err => toast('No se pudo guardar: ' + err.message, 'error'));
  }, 250);
}

async function refreshScene() {
  S.scene = await Bridge.call('getScene');
  $('#fileName').textContent = S.scene.file || 'Escena sin guardar';
  if (!S.data.output.name) S.data.output.name = (S.scene.file || 'render').replace(/\.max$/i, '');
}

async function loadData() {
  let d = null;
  try {
    const txt = await Bridge.call('loadData');
    if (txt) d = JSON.parse(txt);
  } catch (err) {
    toast('Datos del archivo no validos, se empieza de cero.', 'warn');
  }
  S.data = normalize(d);
  if (!getSetup(S.sel)) S.sel = S.data.setups.length ? S.data.setups[0].id : null;
}

// ---------------------------------------------------------------- operaciones hacia 3ds Max

function opsFor(s) {
  const c = s.comp;
  const ops = [];
  if (c.camera.on && c.camera.name) ops.push(['cam', c.camera.name]);
  if (c.res.on) ops.push(['res', c.res.w, c.res.h]);
  if (c.layers.on) c.layers.items.forEach(l => ops.push(['layer', l.name, l.on ? 1 : 0]));
  if (c.objects.on) c.objects.items.forEach(o => ops.push(['obj', o.name, o.hidden ? 1 : 0]));
  if (c.elements.on) c.elements.items.forEach(e => ops.push(['elem', e.name, e.on ? 1 : 0]));
  if (c.sun.on) ops.push(['sun', c.sun.name]);
  if (c.env.on) ops.push(['env', c.env.name]);
  if (c.corona.on) {
    ['passLimit', 'noiseLimit', 'timeLimit'].forEach(k => {
      if (c.corona[k] !== '' && c.corona[k] !== null && c.corona[k] !== undefined) ops.push(['corona', k, c.corona[k]]);
    });
  }
  return ops.map(o => o.join(RS));
}

async function applySetup(s) {
  if (!s) return toast('Selecciona un setup.', 'warn');
  const missing = await Bridge.call('apply', ...opsFor(s));
  await refreshScene();
  render();
  if (missing && missing.length) toast('Aplicado, pero no se encontro: ' + missing.join(', '), 'warn');
  else toast(`"${s.name}" aplicado`, 'ok');
}

function setLog(s, state, text) {
  const item = S.batchLog.find(l => l.id === s.id);
  if (item) Object.assign(item, { state, text });
  else S.batchLog.push({ id: s.id, name: s.name, color: s.color, state, text });
}

async function runBatch(ids) {
  if (S.busy) return;
  const sets = S.data.setups.filter(s => ids.includes(s.id));
  if (!sets.length) return toast('No hay setups marcados para renderizar.', 'warn');
  const folder = (S.data.batch.folder || '').trim() || S.scene.defaultFolder;
  S.busy = true;
  S.batchLog = [];
  sets.forEach(s => setLog(s, 'wait', 'En cola'));
  S.view = 'batch';
  render();
  let done = 0;
  try {
    await Bridge.call('batchBegin');
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      if (!s.comp.camera.on || !s.comp.camera.name) { setLog(s, 'skip', 'Sin camara: activa la tarjeta Camara'); render(); continue; }
      setLog(s, 'run', `Renderizando ${i + 1} de ${sets.length}...`);
      render();
      await nextFrame();
      const missing = await Bridge.call('apply', ...opsFor(s));
      if ((missing || []).some(m => m.startsWith('Camara:'))) { setLog(s, 'skip', `No existe la camara "${s.comp.camera.name}"`); render(); continue; }
      const r = await Bridge.call('render', folder, s.name, S.data.batch.fmt);
      setLog(s, 'ok', r.file);
      done++;
      render();
      if (r.aborted) {
        sets.slice(i + 1).forEach(x => setLog(x, 'skip', 'Lote detenido con ESC'));
        break;
      }
    }
  } catch (err) {
    toast('Error durante el render: ' + err.message, 'error');
  } finally {
    try { await Bridge.call('batchEnd', S.data.batch.restore ? '1' : '0'); } catch (e) { /* nada */ }
    S.busy = false;
    await refreshScene().catch(() => {});
    render();
    toast(`Lote terminado: ${done} de ${sets.length} renderizados`, done ? 'ok' : 'warn');
  }
}

// ---------------------------------------------------------------- piezas de interfaz

function btnI(action, ic, title, extra = {}, cls = '') {
  const attrs = Object.entries(extra).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button class="icon-btn sm ${cls}" data-action="${action}"${attrs} title="${esc(title)}">${icon(ic)}</button>`;
}

function btn(action, label, ic, extra = {}, cls = '') {
  const attrs = Object.entries(extra).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button class="btn ${cls}" data-action="${action}"${attrs}>${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>`;
}

function switchHtml(on, action, key) {
  return `<button class="switch ${on ? 'on' : ''}" data-action="${action}" data-key="${key}" title="${on ? 'Activada: se aplica' : 'Desactivada: no se aplica'}"><span></span></button>`;
}

function card({ title, ic, tone = 'slate', actions = '', body = '', cls = '', toggle = null, off = false }) {
  return `<section class="card tone-${tone} ${cls} ${off ? 'off' : ''}">
    <header class="card-h">${icon(ic)}<span class="card-t">${title}</span><span class="spacer"></span>${actions}${toggle || ''}</header>
    <div class="card-b">${body}</div>
  </section>`;
}

function selectHtml(field, value, options, extra = '') {
  return `<select data-field="${field}" ${extra}>${options.map(([v, label]) =>
    `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
}

function empty(text, sub = '') {
  return `<div class="empty">${text}${sub ? `<br><span class="muted">${sub}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------- vista: setups

function rowSetup(s, i) {
  const c = s.comp;
  const cam = c.camera.on && c.camera.name ? c.camera.name : '-';
  const res = c.res.on ? `${c.res.w} x ${c.res.h}` : '-';
  return `<div class="row setup ${s.id === S.sel ? 'sel' : ''}" data-action="selSetup" data-id="${s.id}" data-dbl="applySetup">
    <span class="stripe" style="background:${esc(s.color)}"></span>
    <input type="checkbox" data-action="toggleBatch" data-id="${s.id}" ${s.batch ? 'checked' : ''} title="Incluir en render por lotes">
    <span class="idx">${i + 1}</span>
    <span class="name">${esc(s.name)}</span>
    <span class="meta">${icon('camera')}${esc(cam)}</span>
    <span class="meta res">${res}</span>
    <span class="row-actions">
      ${btnI('moveSetup', 'up', 'Subir', { id: s.id, dir: -1 })}
      ${btnI('moveSetup', 'down', 'Bajar', { id: s.id, dir: 1 })}
      ${btnI('renderOne', 'render', 'Renderizar solo este setup', { id: s.id })}
      ${btnI('applySetup', 'play', 'Aplicar a la escena', { id: s.id }, 'accent')}
    </span>
  </div>`;
}

function viewSetups() {
  const sets = S.data.setups;
  const list = sets.length ? sets.map(rowSetup).join('')
    : empty('No hay setups.', 'Prepara la escena en 3ds Max (camara, capas, resolucion...) y pulsa + para guardarla.');
  const actions = btnI('newSetup', 'plus', 'Nuevo setup con la escena actual') +
    btnI('dupSetup', 'copy', 'Duplicar setup') + btnI('delSetup', 'trash', 'Borrar setup');
  let html = card({ title: `Setups <span class="count">${sets.length}</span>`, ic: 'list', tone: 'head', actions, body: `<div class="list setup-list">${list}</div>`, cls: 'full' });
  const s = selSetup();
  if (s) html += `<div class="grid">${cardName(s)}${COMPONENTS.map(c => compCard(s, c)).join('')}</div>`;
  return html;
}

function cardName(s) {
  const sw = COLORS.map(c => `<button class="swatch ${c === s.color ? 'on' : ''}" style="background:${c}" data-action="setColor" data-color="${c}" title="Color"></button>`).join('');
  const body = `
    <input type="text" data-field="name" value="${esc(s.name)}" placeholder="Nombre del setup">
    <div class="swatches">${sw}</div>
    <label class="check"><input type="checkbox" data-field="batch" data-type="bool" ${s.batch ? 'checked' : ''}> Incluir en render por lotes</label>
    <div class="actions-row">${btn('applySetup', 'Aplicar', 'play', { id: s.id }, 'primary')}${btn('updateSetup', 'Capturar escena', 'target', { id: s.id })}${btn('renderOne', 'Renderizar', 'render', { id: s.id })}</div>`;
  return card({ title: 'Setup', ic: 'tag', tone: 'slate', body });
}

function compCard(s, def) {
  const c = s.comp[def.key];
  const actions = btnI('copyToAll', 'copy', 'Copiar esta tarjeta a todos los setups', { key: def.key });
  const body = BODIES[def.key](s, c);
  return card({ title: def.title, ic: def.icon, tone: def.tone, actions, body, off: !c.on, toggle: switchHtml(c.on, 'toggleComp', def.key) });
}

function itemList(listKey, items, rowFn, emptyText) {
  if (!items.length) return `<div class="list mini">${empty(emptyText)}</div>`;
  return `<div class="list mini">${items.map((it, i) => rowFn(it, i)).join('')}</div>`;
}

const BODIES = {
  camera(s, c) {
    const names = S.scene.cameras.map(x => x.name);
    const opts = [['', '- Elige una camara -'], ...names.map(n => [n, n])];
    if (c.name && !names.includes(c.name)) opts.push([c.name, `${c.name} (no existe)`]);
    return `<div class="inline">
      ${selectHtml('comp.camera.name', c.name, opts)}
      ${btnI('useActiveCam', 'target', 'Usar la camara activa del visor')}
      ${btnI('viewCam', 'eye', 'Ver esta camara en el visor', { name: c.name })}
    </div>
    ${c.name && !names.includes(c.name) ? `<div class="note warn">${icon('warn')} La camara no existe en la escena.</div>` : ''}`;
  },

  res(s, c) {
    const ratio = c.h ? (c.w / c.h).toFixed(3) : '-';
    const preset = PRESETS.find(p => p[0] === `${c.w}x${c.h}`);
    return `<div class="inline">
      <input type="number" min="1" data-field="comp.res.w" data-type="int" value="${c.w}" title="Ancho">
      <span class="muted">x</span>
      <input type="number" min="1" data-field="comp.res.h" data-type="int" value="${c.h}" title="Alto">
      ${btnI('swapRes', 'swap', 'Intercambiar ancho y alto')}
      ${btnI('useCurrentRes', 'target', 'Usar la resolucion actual de la escena')}
    </div>
    <div class="inline">
      <select data-preset="1">${[['', 'Preajustes...'], ...PRESETS.map(p => [p[0], `${p[1]} (${p[0].replace('x', ' x ')})`])]
        .map(([v, l]) => `<option value="${v}" ${preset && preset[0] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <span class="muted nowrap">${icon('aspect')} ${ratio}</span>
    </div>`;
  },

  sun(s, c) {
    const suns = S.scene.suns.map(x => x.name);
    const opts = [['', '- Apagar todos los soles -'], ...suns.map(n => [n, n])];
    if (c.name && !suns.includes(c.name)) opts.push([c.name, `${c.name} (no existe)`]);
    return `${selectHtml('comp.sun.name', c.name, opts)}
      <div class="note">${suns.length ? 'Enciende el sol elegido y apaga los demas.' : 'No hay soles (CoronaSun, Sunlight...) en la escena.'}</div>`;
  },

  env(s, c) {
    const envs = S.scene.envMaps;
    const opts = [['', '- Sin entorno (desactivar) -'], ...envs.map(n => [n, n])];
    if (c.name && !envs.includes(c.name)) opts.push([c.name, `${c.name} (no existe)`]);
    return `${selectHtml('comp.env.name', c.name, opts)}
      <div class="note">Mapas CoronaSky y HDRI (.hdr / .exr) de la escena.</div>`;
  },

  layers(s, c) {
    const scene = new Set(S.scene.layers.map(l => l.name));
    const list = itemList('layers', c.items, (l, i) => `<div class="row item">
        ${btnI('toggleItem', l.on ? 'eye' : 'eyeOff', l.on ? 'Encendida' : 'Apagada', { list: 'layers', index: i }, l.on ? 'accent' : 'dim')}
        <span class="name ${l.on ? '' : 'muted'}">${esc(l.name)}</span>
        ${scene.has(l.name) ? '' : `<span class="badge warn" title="No existe en la escena">${icon('warn')}</span>`}
        ${btnI('removeItem', 'x', 'Quitar de este setup', { list: 'layers', index: i })}
      </div>`, 'Sin capas. Pulsa "Capturar".');
    return `${list}<div class="actions-row">
      ${btn('captureLayers', 'Capturar', 'target')}${btn('setAll', 'Todas', 'eye', { list: 'layers', val: 1 })}${btn('setAll', 'Ninguna', 'eyeOff', { list: 'layers', val: 0 })}</div>`;
  },

  objects(s, c) {
    const list = itemList('objects', c.items, (o, i) => `<div class="row item">
        ${btnI('toggleItem', o.hidden ? 'eyeOff' : 'eye', o.hidden ? 'Oculto' : 'Visible', { list: 'objects', index: i }, o.hidden ? 'dim' : 'accent')}
        <span class="name ${o.hidden ? 'muted' : ''}">${esc(o.name)}</span>
        ${btnI('removeItem', 'x', 'Quitar de este setup', { list: 'objects', index: i })}
      </div>`, 'Selecciona objetos en 3ds Max y anadelos.');
    return `${list}<div class="actions-row">
      ${btn('addSelection', 'Ocultar seleccion', 'eyeOff', { val: 1 })}${btn('addSelection', 'Mostrar seleccion', 'eye', { val: 0 })}</div>`;
  },

  elements(s, c) {
    const list = itemList('elements', c.items, (e, i) => `<div class="row item">
        ${btnI('toggleItem', e.on ? 'check' : 'x', e.on ? 'Activo' : 'Inactivo', { list: 'elements', index: i }, e.on ? 'accent' : 'dim')}
        <span class="name ${e.on ? '' : 'muted'}">${esc(e.name)}</span>
        ${btnI('removeItem', 'x', 'Quitar de este setup', { list: 'elements', index: i })}
      </div>`, 'Sin render elements. Pulsa "Capturar".');
    return `${list}<div class="actions-row">${btn('captureElements', 'Capturar', 'target')}</div>`;
  },

  corona(s, c) {
    const mins = c.timeLimit === '' ? '' : +(c.timeLimit / 60000).toFixed(2);
    return `${S.scene.corona.isCorona ? '' : `<div class="note warn">${icon('warn')} El motor actual no es Corona (${esc(S.scene.renderer)}).</div>`}
      <div class="form">
        <label>Limite de pases<input type="number" min="0" step="1" data-field="comp.corona.passLimit" data-type="int" value="${esc(c.passLimit)}"></label>
        <label>Limite de ruido (%)<input type="number" min="0" step="0.1" data-field="comp.corona.noiseLimit" data-type="float" value="${esc(c.noiseLimit)}"></label>
        <label>Limite de tiempo (min)<input type="number" min="0" step="0.5" data-field="comp.corona.timeLimit" data-type="minutes" value="${esc(mins)}"></label>
      </div>
      <div class="note">0 = sin limite. Campo vacio = no se cambia.</div>
      <div class="actions-row">${btn('useCurrentCorona', 'Usar valores actuales', 'target')}</div>`;
  },
};

// ---------------------------------------------------------------- vista: camaras

function viewCameras() {
  const cams = S.scene.cameras;
  const used = name => S.data.setups.filter(s => s.comp.camera.name === name).length;
  const rows = cams.length ? cams.map(c => `<div class="row">
      ${icon('camera')}
      <span class="name">${esc(c.name)}</span>
      ${c.name === S.scene.activeCamera ? '<span class="badge ok">activa</span>' : ''}
      ${used(c.name) ? `<span class="badge">${used(c.name)} setup${used(c.name) > 1 ? 's' : ''}</span>` : ''}
      <span class="meta">${esc(c.cls)}</span>
      <span class="row-actions">
        ${btnI('cam', 'eye', 'Ver en el visor', { cmd: 'view', name: c.name }, 'accent')}
        ${btnI('cam', 'pointer', 'Seleccionar', { cmd: 'select', name: c.name })}
        ${btnI('cam', c.locked ? 'lock' : 'unlock', c.locked ? 'Bloqueada (clic para desbloquear)' : 'Bloquear', { cmd: 'lock', name: c.name }, c.locked ? 'warn' : '')}
        ${btnI('cam', 'edit', 'Renombrar', { cmd: 'rename', name: c.name })}
        ${btnI('cam', 'trash', 'Borrar', { cmd: 'delete', name: c.name })}
      </span>
    </div>`).join('') : empty('No hay camaras en la escena.');
  const create = `<div class="inline">
      <input type="text" id="newCamName" placeholder="Nombre (opcional)">
      ${btn('camCreate', 'Crear desde la vista', 'plus', {}, 'primary')}
    </div>
    <div class="note">Crea una CoronaCam con el encuadre del visor activo.</div>`;
  return card({ title: 'Nueva camara', ic: 'plus', tone: 'slate', body: create, cls: 'full' }) +
    card({ title: `Camaras de la escena <span class="count">${cams.length}</span>`, ic: 'camera', tone: 'head', body: `<div class="list">${rows}</div>`, cls: 'full' });
}

// ---------------------------------------------------------------- vista: render elements y salida

function viewElements() {
  const els = S.scene.elements;
  const rows = els.length ? els.map(e => `<div class="row">
      <button class="switch ${e.enabled ? 'on' : ''}" data-action="elem" data-cmd="toggle" data-index="${e.index}" title="${e.enabled ? 'Activo' : 'Inactivo'}"><span></span></button>
      <span class="name ${e.enabled ? '' : 'muted'}">${esc(e.name)}</span>
      <span class="meta">${esc(e.cls)}</span>
      <span class="row-actions">${btnI('elem', 'trash', 'Borrar', { cmd: 'remove', index: e.index, name: e.name })}</span>
    </div>`).join('') : empty('No hay render elements.');
  const add = `<div class="inline">
      <select id="elemClass">${S.scene.elementClasses.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      ${btn('elemAdd', 'Anadir', 'plus', {}, 'primary')}
    </div>`;
  const o = S.data.output;
  const dir = o.dir || S.scene.defaultFolder;
  const out = `<div class="form">
      <label>Carpeta<div class="inline"><input type="text" data-scope="data" data-field="output.dir" value="${esc(o.dir)}" placeholder="${esc(S.scene.defaultFolder)}">${btnI('browse', 'folder', 'Elegir carpeta', { target: 'output' })}</div></label>
      <label>Nombre<input type="text" data-scope="data" data-field="output.name" value="${esc(o.name)}"></label>
      <label>Formato${selectHtml('output.fmt', o.fmt, FORMATS.map(f => [f, f]), 'data-scope="data"')}</label>
    </div>
    <div class="note mono">${esc(dir)}\\${esc(o.name || 'render')}${esc(o.fmt)}<br>${esc(dir)}\\${esc(o.name || 'render')}_&lt;elemento&gt;${esc(o.fmt)}</div>
    <div class="actions-row">${btn('setOutput', 'Aplicar a imagen y render elements', 'check', {}, 'primary')}</div>
    <div class="note">Salida actual: <span class="mono">${esc(S.scene.outputFile || '(ninguna)')}</span></div>`;
  return card({ title: `Render elements <span class="count">${els.length}</span>`, ic: 'layers2', tone: 'violet', body: `<div class="list">${rows}</div>${add}`, cls: 'full' }) +
    card({ title: 'Ruta de salida', ic: 'folder', tone: 'slate', body: out, cls: 'full' });
}

// ---------------------------------------------------------------- vista: render por lotes

function viewBatch() {
  const sets = S.data.setups;
  const b = S.data.batch;
  const marked = sets.filter(s => s.batch).length;
  const rows = sets.length ? sets.map(s => `<div class="row">
      <span class="stripe" style="background:${esc(s.color)}"></span>
      <input type="checkbox" data-action="toggleBatch" data-id="${s.id}" ${s.batch ? 'checked' : ''} ${S.busy ? 'disabled' : ''}>
      <span class="name">${esc(s.name)}</span>
      <span class="meta">${icon('camera')}${esc(s.comp.camera.on ? (s.comp.camera.name || '-') : '-')}</span>
      <span class="meta res">${s.comp.res.on ? `${s.comp.res.w} x ${s.comp.res.h}` : '-'}</span>
    </div>`).join('') : empty('No hay setups.', 'Crea setups en la seccion Setups.');
  const folder = b.folder || S.scene.defaultFolder;
  const opts = `<div class="form">
      <label>Carpeta<div class="inline"><input type="text" data-scope="data" data-field="batch.folder" value="${esc(b.folder)}" placeholder="${esc(S.scene.defaultFolder)}">${btnI('browse', 'folder', 'Elegir carpeta', { target: 'batch' })}</div></label>
      <label>Formato${selectHtml('batch.fmt', b.fmt, FORMATS.map(f => [f, f]), 'data-scope="data"')}</label>
    </div>
    <label class="check"><input type="checkbox" data-scope="data" data-field="batch.restore" data-type="bool" ${b.restore ? 'checked' : ''}> Restaurar la escena al terminar</label>
    <div class="note mono">${esc(folder)}\\&lt;setup&gt;\\&lt;setup&gt;${esc(b.fmt)}</div>
    <div class="note">Desactiva el candado de vista en Render Setup. Manten ESC pulsado para detener el lote.</div>
    <button class="btn primary big" data-action="startBatch" ${S.busy || !marked ? 'disabled' : ''}>${icon('render')}<span>${S.busy ? 'Renderizando...' : `Renderizar ${marked} setup${marked === 1 ? '' : 's'}`}</span></button>`;
  const log = S.batchLog.length ? card({
    title: 'Progreso', ic: 'render', tone: 'teal', cls: 'full',
    body: `<div class="list">${S.batchLog.map(l => `<div class="row log ${l.state}">
        <span class="stripe" style="background:${esc(l.color)}"></span>
        <span class="state">${{ wait: 'En cola', run: 'Renderizando', ok: 'Hecho', skip: 'Omitido' }[l.state]}</span>
        <span class="name">${esc(l.name)}</span><span class="meta mono">${esc(l.text)}</span></div>`).join('')}</div>`,
  }) : '';
  const actions = btnI('batchAll', 'check', 'Marcar todos') + btnI('batchNone', 'x', 'Desmarcar todos');
  return log + `<div class="grid">${card({ title: `Setups a renderizar <span class="count">${marked}/${sets.length}</span>`, ic: 'list', tone: 'head', actions, body: `<div class="list">${rows}</div>` })}${card({ title: 'Opciones', ic: 'settings', tone: 'slate', body: opts })}</div>`;
}

// ---------------------------------------------------------------- vista: ayuda

function viewHelp() {
  return card({
    title: 'Como se usa', ic: 'help', tone: 'slate', cls: 'full', body: `<ol class="help">
      <li>Prepara la escena en 3ds Max: camara en el visor, capas, resolucion, sol, entorno...</li>
      <li>En <b>Setups</b> pulsa <b>+</b>. Se guarda todo lo que ves como un setup nuevo.</li>
      <li>Cada tarjeta (Camara, Resolucion, Sol...) tiene un interruptor. Solo las tarjetas activadas se aplican.</li>
      <li>Doble clic en un setup, o el boton ${icon('play')}, para aplicarlo a la escena.</li>
      <li>En <b>Render por lotes</b> marca los setups y pulsa <b>Renderizar</b>. Cada uno se guarda en su carpeta con sus render elements.</li>
      <li>Los setups se guardan dentro del archivo .max: guarda el archivo para no perderlos.</li>
    </ol>
    <div class="note">REA Scene Manager ${esc(S.scene.version)} - motor: ${esc(S.scene.renderer)}</div>`,
  });
}

// ---------------------------------------------------------------- render

const VIEWS = { setups: viewSetups, cameras: viewCameras, elements: viewElements, batch: viewBatch, help: viewHelp };

function render() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  const main = $('#main');
  const top = main.scrollTop;
  if (!S.scene || !S.data) { main.innerHTML = empty('Cargando escena...'); return; }
  main.innerHTML = VIEWS[S.view]();
  main.scrollTop = top;
}

function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('hide'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// ---------------------------------------------------------------- acciones

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.forEach(k => { obj = obj[k]; });
  obj[last] = value;
}

function readValue(el) {
  const t = el.dataset.type;
  if (t === 'bool') return el.checked;
  if (el.value === '') return t ? '' : '';
  if (t === 'int') return Math.max(0, parseInt(el.value, 10) || 0);
  if (t === 'float') return Math.max(0, parseFloat(el.value) || 0);
  if (t === 'minutes') return Math.round(Math.max(0, parseFloat(el.value) || 0) * 60000);
  return el.value;
}

function onFieldChange(el) {
  const target = el.dataset.scope === 'data' ? S.data : selSetup();
  if (!target) return;
  let v = readValue(el);
  if ((el.dataset.field === 'comp.res.w' || el.dataset.field === 'comp.res.h') && !v) v = 1;
  if (el.dataset.field === 'name') v = String(v).trim() || target.name;
  setPath(target, el.dataset.field, v);
  save();
  render();
}

function comp(key) { const s = selSetup(); return s ? s.comp[key] : null; }

const A = {
  async refresh() { await refreshScene(); render(); toast('Escena actualizada'); },
  renderSetup() { return Bridge.call('openRenderSetup'); },
  goBatch() { S.view = 'batch'; render(); },

  // setups
  async newSetup() {
    await refreshScene();
    const base = S.scene.activeCamera ? S.scene.activeCamera.replace(/^cam[_\s-]*/i, '') : 'Setup';
    const s = setupFromScene(uniqueName(base));
    S.data.setups.push(s);
    S.sel = s.id;
    save(); render();
    toast(`Setup "${s.name}" creado`, 'ok');
  },
  dupSetup() {
    const s = selSetup();
    if (!s) return toast('Selecciona un setup.', 'warn');
    const d = clone(s);
    d.id = uid();
    d.name = uniqueName(s.name + ' copia');
    S.data.setups.splice(S.data.setups.indexOf(s) + 1, 0, d);
    S.sel = d.id;
    save(); render();
  },
  delSetup() {
    const s = selSetup();
    if (!s) return toast('Selecciona un setup.', 'warn');
    if (!confirm(`Borrar el setup "${s.name}"?`)) return;
    const i = S.data.setups.indexOf(s);
    S.data.setups.splice(i, 1);
    const n = S.data.setups[Math.min(i, S.data.setups.length - 1)];
    S.sel = n ? n.id : null;
    save(); render();
  },
  async updateSetup(el) {
    const s = getSetup(el.dataset.id);
    if (!s || !confirm(`Sustituir el contenido de "${s.name}" por la escena actual?`)) return;
    await refreshScene();
    const fresh = setupFromScene(s.name);
    Object.keys(fresh.comp).forEach(k => { fresh.comp[k].on = s.comp[k].on; });
    if (s.comp.objects.items.length) fresh.comp.objects = s.comp.objects;
    s.comp = fresh.comp;
    save(); render();
    toast(`"${s.name}" actualizado con la escena actual`, 'ok');
  },
  selSetup(el) { S.sel = el.dataset.id; render(); },
  applySetup(el) { return applySetup(getSetup(el.dataset.id) || selSetup()); },
  renderOne(el) { return runBatch([el.dataset.id]); },
  moveSetup(el) {
    const list = S.data.setups;
    const i = list.findIndex(s => s.id === el.dataset.id);
    const j = i + Number(el.dataset.dir);
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save(); render();
  },
  toggleBatch(el) { const s = getSetup(el.dataset.id); s.batch = el.checked; save(); if (S.view === 'batch') render(); },
  setColor(el) { selSetup().color = el.dataset.color; save(); render(); },
  toggleComp(el) { const c = comp(el.dataset.key); c.on = !c.on; save(); render(); },
  copyToAll(el) {
    const s = selSetup();
    const k = el.dataset.key;
    const title = COMPONENTS.find(c => c.key === k).title;
    if (S.data.setups.length < 2 || !confirm(`Copiar la tarjeta "${title}" de "${s.name}" a todos los demas setups?`)) return;
    S.data.setups.forEach(o => { if (o !== s) o.comp[k] = clone(s.comp[k]); });
    save();
    toast(`"${title}" copiada a ${S.data.setups.length - 1} setups`, 'ok');
  },

  // tarjetas
  async useActiveCam() {
    await refreshScene();
    if (!S.scene.activeCamera) return toast('El visor activo no es una camara.', 'warn');
    Object.assign(comp('camera'), { name: S.scene.activeCamera, on: true });
    save(); render();
  },
  viewCam(el) { if (el.dataset.name) return Bridge.call('cam', 'view', el.dataset.name); },
  swapRes() { const r = comp('res'); [r.w, r.h] = [r.h, r.w]; save(); render(); },
  async useCurrentRes() { await refreshScene(); Object.assign(comp('res'), { w: S.scene.res.w, h: S.scene.res.h, on: true }); save(); render(); },
  toggleItem(el) {
    const it = comp(el.dataset.list).items[Number(el.dataset.index)];
    if (el.dataset.list === 'objects') it.hidden = !it.hidden; else it.on = !it.on;
    save(); render();
  },
  removeItem(el) { comp(el.dataset.list).items.splice(Number(el.dataset.index), 1); save(); render(); },
  setAll(el) { comp(el.dataset.list).items.forEach(it => { it.on = el.dataset.val === '1'; }); save(); render(); },
  async captureLayers() {
    await refreshScene();
    Object.assign(comp('layers'), { on: true, items: S.scene.layers.map(l => ({ name: l.name, on: l.on })) });
    save(); render();
  },
  async captureElements() {
    await refreshScene();
    Object.assign(comp('elements'), { on: true, items: S.scene.elements.map(e => ({ name: e.name, on: e.enabled })) });
    save(); render();
  },
  async addSelection(el) {
    const names = await Bridge.call('selection');
    if (!names.length) return toast('No hay objetos seleccionados en 3ds Max.', 'warn');
    const c = comp('objects');
    const hidden = el.dataset.val === '1';
    names.forEach(n => {
      const it = c.items.find(x => x.name === n);
      if (it) it.hidden = hidden; else c.items.push({ name: n, hidden });
    });
    c.on = true;
    save(); render();
  },
  async useCurrentCorona() {
    await refreshScene();
    if (!S.scene.corona.isCorona) return toast('El motor actual no es Corona.', 'warn');
    const c = comp('corona');
    ['passLimit', 'noiseLimit', 'timeLimit'].forEach(k => { c[k] = S.scene.corona[k] ?? ''; });
    c.on = true;
    save(); render();
  },

  // camaras
  async camCreate() {
    const name = await Bridge.call('camCreate', $('#newCamName').value.trim());
    await refreshScene(); render();
    toast(`Camara "${name}" creada`, 'ok');
  },
  async cam(el) {
    const cmd = el.dataset.cmd;
    const name = el.dataset.name;
    let arg = '';
    if (cmd === 'rename') {
      arg = (prompt('Nuevo nombre de la camara:', name) || '').trim();
      if (!arg || arg === name) return;
    }
    if (cmd === 'delete' && !confirm(`Borrar la camara "${name}"?`)) return;
    const ok = await Bridge.call('cam', cmd, name, arg);
    if (!ok) toast(`No se encontro la camara "${name}".`, 'warn');
    if (cmd === 'rename' && ok) {
      S.data.setups.forEach(s => { if (s.comp.camera.name === name) s.comp.camera.name = arg; });
      save();
    }
    await refreshScene(); render();
  },

  // render elements y salida
  async elem(el) {
    if (el.dataset.cmd === 'remove' && !confirm(`Borrar el render element "${el.dataset.name}"?`)) return;
    await Bridge.call('elem', el.dataset.cmd, el.dataset.index, '');
    await refreshScene(); render();
  },
  async elemAdd() {
    const cls = $('#elemClass').value;
    const ok = await Bridge.call('elem', 'add', 0, cls);
    if (!ok) toast(`No se pudo anadir ${cls}.`, 'error');
    await refreshScene(); render();
  },
  async browse(el) {
    const target = el.dataset.target === 'batch' ? S.data.batch : S.data.output;
    const key = el.dataset.target === 'batch' ? 'folder' : 'dir';
    const f = await Bridge.call('browseFolder', target[key] || S.scene.defaultFolder);
    if (f) { target[key] = f; save(); render(); }
  },
  async setOutput() {
    const o = S.data.output;
    const file = await Bridge.call('setOutput', o.dir || S.scene.defaultFolder, o.name || 'render', o.fmt);
    await refreshScene(); render();
    toast('Salida: ' + file, 'ok');
  },

  // lote
  batchAll() { S.data.setups.forEach(s => { s.batch = true; }); save(); render(); },
  batchNone() { S.data.setups.forEach(s => { s.batch = false; }); save(); render(); },
  startBatch() { return runBatch(S.data.setups.filter(s => s.batch).map(s => s.id)); },
};

// ---------------------------------------------------------------- eventos

document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-view]');
  if (nav) { S.view = nav.dataset.view; render(); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || !A[el.dataset.action]) return;
  if (S.busy && !['goBatch'].includes(el.dataset.action)) { if (el.tagName !== 'INPUT') toast('Espera a que termine el render por lotes.', 'warn'); return; }
  try { await A[el.dataset.action](el, e); } catch (err) { toast(err.message, 'error'); }
});

document.addEventListener('dblclick', async e => {
  const el = e.target.closest('[data-dbl]');
  if (!el || e.target.closest('button, input, select') || S.busy) return;
  try { await A[el.dataset.dbl](el, e); } catch (err) { toast(err.message, 'error'); }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.preset) {
    if (!el.value) return;
    const [w, h] = el.value.split('x').map(Number);
    Object.assign(comp('res'), { w, h });
    save(); render();
    return;
  }
  if (el.dataset.field) onFieldChange(el);
});

let eventTimer = null;
Bridge.onEvent(ev => {
  if (S.busy) return;
  clearTimeout(eventTimer);
  eventTimer = setTimeout(async () => {
    try {
      if (ev === 'scene') await loadData();
      await refreshScene();
      render();
    } catch (err) { /* la escena puede estar cargando */ }
  }, ev === 'scene' ? 300 : 500);
});

// ---------------------------------------------------------------- inicio

(async function init() {
  applyStaticIcons(document);
  render();
  try {
    S.data = defaultData();
    await refreshScene();
    await loadData();
    if (!S.data.output.name) S.data.output.name = (S.scene.file || 'render').replace(/\.max$/i, '');
    $('#dot').className = 'dot ' + (Bridge.isHost ? 'ok' : 'demo');
    $('#status').textContent = Bridge.isHost ? `Conectado a 3ds Max - ${S.scene.renderer}` : 'Modo demostracion (sin 3ds Max)';
    $('#version').textContent = 'v' + (Bridge.isHost ? S.scene.version : '0.2.1');
    render();
  } catch (err) {
    $('#dot').className = 'dot error';
    $('#status').textContent = 'Error: ' + err.message;
    $('#main').innerHTML = empty('No se pudo leer la escena.', esc(err.message));
  }
})();
