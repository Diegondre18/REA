// REA Scene Manager - interfaz
// Un "setup" es una vista guardada de la escena. Solo las propiedades que el setup usa
// (camara, resolucion, capas...) se aplican en 3ds Max; el resto no se toca.

const VERSION = '0.3.0';

const PROPS = [
  { key: 'camera', title: 'Cámara', icon: 'camera' },
  { key: 'res', title: 'Resolución', icon: 'aspect' },
  { key: 'layers', title: 'Capas', icon: 'layers' },
  { key: 'objects', title: 'Objetos', icon: 'cube' },
  { key: 'sun', title: 'Sol', icon: 'sun' },
  { key: 'env', title: 'Entorno', icon: 'mountain' },
  { key: 'elements', title: 'Render elements', icon: 'layers2' },
  { key: 'corona', title: 'Calidad Corona', icon: 'zap' },
];
const COLORS = ['#7c8cff', '#f2b84b', '#3ecf8e', '#ff6b6b', '#b18cff', '#4cc3ff', '#ff8fc7', '#a3d65c'];
const ACCENTS = ['#3ecf8e', '#4c8dff', '#a78bfa', '#ff8a4c', '#f5c542', '#ff5c8a'];
const FORMATS = ['.exr', '.png', '.jpg', '.tif'];
const PRESETS = [
  ['1920x1080', 'Full HD'], ['2560x1440', 'QHD'], ['3840x2160', '4K'], ['2000x2000', 'Cuadrado'],
  ['1080x1350', 'Instagram 4:5'], ['1080x1920', 'Vertical 9:16'], ['3000x2000', 'Foto 3:2'], ['2480x3508', 'A4 300 dpi'],
];

const S = {
  scene: null,
  data: null,
  sel: [],          // ids seleccionados (el ultimo es el principal)
  view: 'setups',
  busy: false,
  progress: null,   // { i, n, name }
  batchLog: [],
  undo: [],
  redo: [],
  search: '',
  menu: null,       // menu contextual / desplegable abierto
  palette: null,    // paleta de comandos
  inspector: false, // en pantallas estrechas, inspector abierto encima
  open: {},         // propiedades desplegadas en el inspector
  ui: loadUi(),
};

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- preferencias de la interfaz (por PC)

function loadUi() {
  const def = { layout: 'grid', accent: ACCENTS[0], thumbs: true, groupsClosed: {} };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('reasm-ui') || '{}')); } catch (e) { return def; }
}
function saveUi() {
  try { localStorage.setItem('reasm-ui', JSON.stringify(S.ui)); } catch (e) { /* sin almacenamiento */ }
  applyAccent();
}
function applyAccent() {
  document.documentElement.style.setProperty('--accent', S.ui.accent);
}

// ---------------------------------------------------------------- datos

function defaultData() {
  return { version: 2, setups: [], batch: { folder: '', fmt: '.exr', restore: true }, output: { dir: '', name: '', fmt: '.exr' } };
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
  d = Object.assign(defaultData(), d || {});
  d.batch = Object.assign(defaultData().batch, d.batch || {});
  d.output = Object.assign(defaultData().output, d.output || {});
  d.setups = (d.setups || []).map(s => {
    const comp = defaultComp();
    Object.keys(comp).forEach(k => { comp[k] = Object.assign(comp[k], (s.comp || {})[k] || {}); });
    return Object.assign({ id: uid(), name: 'Setup', color: COLORS[0], batch: true, group: '', thumb: '', thumbV: 0 }, s, { comp });
  });
  return d;
}

function setupFromScene(name) {
  const sc = S.scene;
  const comp = defaultComp();
  comp.camera.name = sc.activeCamera || '';
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
  return { id: uid(), name, color: COLORS[S.data.setups.length % COLORS.length], batch: true, group: '', thumb: '', thumbV: 0, comp };
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
const primary = () => getSetup(S.sel[S.sel.length - 1]);
const selected = () => S.sel.map(getSetup).filter(Boolean);
const groups = () => [...new Set(S.data.setups.map(s => s.group).filter(Boolean))];

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    Bridge.call('saveData', JSON.stringify(S.data)).catch(err => toast('No se pudo guardar: ' + err.message, 'error'));
  }, 250);
}

// Todo cambio pasa por aqui: guarda un paso de deshacer, guarda en el .max y redibuja.
function mutate(fn) {
  S.undo.push(JSON.stringify(S.data));
  if (S.undo.length > 80) S.undo.shift();
  S.redo = [];
  fn();
  save();
  render();
}

function undo() {
  if (!S.undo.length) return toast('Nada que deshacer');
  S.redo.push(JSON.stringify(S.data));
  S.data = JSON.parse(S.undo.pop());
  S.sel = S.sel.filter(getSetup);
  save(); render();
  toast('Deshecho');
}

function redo() {
  if (!S.redo.length) return toast('Nada que rehacer');
  S.undo.push(JSON.stringify(S.data));
  S.data = JSON.parse(S.redo.pop());
  S.sel = S.sel.filter(getSetup);
  save(); render();
  toast('Rehecho');
}

async function refreshScene() {
  S.scene = await Bridge.call('getScene');
  $('#fileName').textContent = S.scene.file || 'Escena sin guardar';
}

async function loadData() {
  let d = null;
  try {
    const txt = await Bridge.call('loadData');
    if (txt) d = JSON.parse(txt);
  } catch (err) {
    toast('Datos del archivo no válidos, se empieza de cero.', 'warn');
  }
  S.data = normalize(d);
  S.undo = []; S.redo = [];
  S.sel = S.sel.filter(getSetup);
  if (!S.sel.length && S.data.setups.length) S.sel = [S.data.setups[0].id];
  if (!S.data.output.name) S.data.output.name = (S.scene.file || 'render').replace(/\.max$/i, '');
}

// ---------------------------------------------------------------- resumenes y diferencias

function summary(s, key) {
  const c = s.comp[key];
  switch (key) {
    case 'camera': return c.name || 'Sin cámara';
    case 'res': return `${c.w} × ${c.h}`;
    case 'layers': return c.items.length ? `${c.items.filter(i => i.on).length} de ${c.items.length} visibles` : 'Sin capas';
    case 'objects': {
      const h = c.items.filter(i => i.hidden).length;
      return c.items.length ? [h && `${h} ocultos`, c.items.length - h && `${c.items.length - h} visibles`].filter(Boolean).join(' · ') : 'Sin objetos';
    }
    case 'sun': return c.name || 'Soles apagados';
    case 'env': return c.name || 'Sin entorno';
    case 'elements': return c.items.length ? `${c.items.filter(i => i.on).length} de ${c.items.length} activos` : 'Sin elementos';
    case 'corona': {
      const parts = [];
      if (c.passLimit !== '' && c.passLimit != null) parts.push(+c.passLimit ? `${c.passLimit} pases` : 'Pases ∞');
      if (c.noiseLimit !== '' && c.noiseLimit != null) parts.push(`Ruido ${c.noiseLimit}%`);
      if (c.timeLimit !== '' && c.timeLimit != null) parts.push(+c.timeLimit ? `${+(c.timeLimit / 60000).toFixed(1)} min` : 'Tiempo ∞');
      return parts.join(' · ') || 'Sin cambios';
    }
  }
  return '';
}

// Lista de propiedades en las que la escena actual no coincide con el setup.
function diffs(s) {
  const sc = S.scene;
  const c = s.comp;
  const out = [];
  if (!sc) return out;
  if (c.camera.on && c.camera.name && sc.activeCamera !== c.camera.name) out.push('cámara');
  if (c.res.on && (sc.res.w !== c.res.w || sc.res.h !== c.res.h)) out.push('resolución');
  if (c.layers.on) {
    const map = new Map(sc.layers.map(l => [l.name, l.on]));
    if (c.layers.items.some(l => map.has(l.name) && map.get(l.name) !== l.on)) out.push('capas');
  }
  if (c.sun.on) {
    const on = sc.suns.filter(x => x.on).map(x => x.name);
    if (c.sun.name ? (on.length !== 1 || on[0] !== c.sun.name) : on.length) out.push('sol');
  }
  if (c.env.on && (sc.activeEnv || '') !== (c.env.name || '')) out.push('entorno');
  if (c.elements.on) {
    const map = new Map(sc.elements.map(e => [e.name, e.enabled]));
    if (c.elements.items.some(e => map.has(e.name) && map.get(e.name) !== e.on)) out.push('render elements');
  }
  return out;
}

const isCurrent = s => S.scene && s.comp.camera.on && s.comp.camera.name && !diffs(s).length;

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
  if (missing && missing.length) toast('Aplicado, pero no se encontró: ' + missing.join(', '), 'warn');
  else toast(`${s.name} aplicado`, 'ok');
}

async function updateThumb(s, file) {
  if (!S.ui.thumbs) return;
  try {
    const path = file ? await Bridge.call('thumbFromFile', s.id, file) : await Bridge.call('thumbViewport', s.id);
    if (path) { s.thumb = path; s.thumbV = Date.now(); save(); }
  } catch (err) { /* la miniatura es opcional */ }
}

function thumbSrc(s) {
  if (!s.thumb) return '';
  if (s.thumb.startsWith('data:')) return s.thumb;
  return 'file:///' + s.thumb.replace(/\\/g, '/') + '?v=' + (s.thumbV || 0);
}

function setLog(s, state, text) {
  const item = S.batchLog.find(l => l.id === s.id);
  if (item) Object.assign(item, { state, text });
  else S.batchLog.push({ id: s.id, name: s.name, color: s.color, state, text });
}

async function runBatch(ids) {
  if (S.busy) return;
  const sets = S.data.setups.filter(s => ids.includes(s.id));
  if (!sets.length) return toast('No hay setups para renderizar.', 'warn');
  const folder = (S.data.batch.folder || '').trim() || S.scene.defaultFolder;
  S.busy = true;
  S.batchLog = [];
  sets.forEach(s => setLog(s, 'wait', 'En cola'));
  render();
  let done = 0;
  try {
    await Bridge.call('batchBegin');
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      S.progress = { i: i + 1, n: sets.length, name: s.name };
      if (!s.comp.camera.on || !s.comp.camera.name) { setLog(s, 'skip', 'Sin cámara'); render(); continue; }
      setLog(s, 'run', 'Renderizando');
      render();
      await nextFrame();
      const missing = await Bridge.call('apply', ...opsFor(s));
      if ((missing || []).some(m => m.startsWith('Camara:'))) { setLog(s, 'skip', `No existe la cámara ${s.comp.camera.name}`); render(); continue; }
      const r = await Bridge.call('render', folder, s.name, S.data.batch.fmt);
      setLog(s, 'ok', r.file);
      done++;
      if (S.data.batch.fmt !== '.exr') await updateThumb(s, r.file);
      render();
      if (r.aborted) {
        sets.slice(i + 1).forEach(x => setLog(x, 'skip', 'Detenido con ESC'));
        break;
      }
    }
  } catch (err) {
    toast('Error durante el render: ' + err.message, 'error');
  } finally {
    try { await Bridge.call('batchEnd', S.data.batch.restore ? '1' : '0'); } catch (e) { /* nada */ }
    S.busy = false;
    S.progress = null;
    await refreshScene().catch(() => {});
    render();
    toast(`Render terminado: ${done} de ${sets.length}`, done ? 'ok' : 'warn');
  }
}

// ---------------------------------------------------------------- piezas de interfaz

function attrs(extra) {
  return Object.entries(extra || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
}
function ib(action, ic, title, extra = {}, cls = '') {
  return `<button class="ib ${cls}" data-action="${action}"${attrs(extra)} title="${esc(title)}">${icon(ic)}</button>`;
}
function btn(action, label, ic, extra = {}, cls = '') {
  return `<button class="btn ${cls}" data-action="${action}"${attrs(extra)}>${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>`;
}
function toggle(on, action, extra = {}, title = '') {
  return `<button class="toggle ${on ? 'on' : ''}" data-action="${action}"${attrs(extra)} title="${esc(title)}"><span></span></button>`;
}
function selectHtml(field, value, options, extra = '') {
  return `<select data-field="${field}" ${extra}>${options.map(([v, label]) =>
    `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
}
function thumbHtml(s, cls = '') {
  const src = S.ui.thumbs ? thumbSrc(s) : '';
  return `<div class="thumb ${cls}" style="--c:${esc(s.color)}">${src ? `<img src="${esc(src)}" alt="" draggable="false">` : `<span class="thumb-ph">${icon('camera')}</span>`}</div>`;
}
function dots(s) {
  return `<span class="dots">${PROPS.filter(p => s.comp[p.key].on).map(p => `<span title="${esc(p.title)}">${icon(p.icon)}</span>`).join('')}</span>`;
}
function empty(title, sub = '', action = '') {
  return `<div class="empty"><div class="empty-ico">${icon('sparkle')}</div><strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}${action}</div>`;
}

// ---------------------------------------------------------------- vista: setups

function filteredSetups() {
  const q = S.search.trim().toLowerCase();
  if (!q) return S.data.setups;
  return S.data.setups.filter(s => [s.name, s.group, s.comp.camera.name].some(v => (v || '').toLowerCase().includes(q)));
}

function tile(s) {
  const sel = S.sel.includes(s.id);
  const c = s.comp;
  const meta = [c.camera.on && c.camera.name, c.res.on && `${c.res.w}×${c.res.h}`].filter(Boolean).join(' · ') || 'Sin cámara';
  const cur = isCurrent(s);
  if (S.ui.layout === 'list') {
    return `<div class="row-s ${sel ? 'sel' : ''}" draggable="true" data-sid="${s.id}" data-action="select" data-id="${s.id}" data-dbl="applyId">
      <span class="grip">${icon('grip')}</span>
      ${thumbHtml(s, 'sm')}
      <div class="row-main"><span class="name">${esc(s.name)}</span><span class="meta">${esc(meta)}</span></div>
      ${cur ? '<span class="live" title="La escena coincide con este setup"></span>' : ''}
      ${dots(s)}
      <input type="checkbox" class="chk" data-action="toggleBatch" data-id="${s.id}" ${s.batch ? 'checked' : ''} title="Incluir en el render">
      ${ib('applyId', 'play', 'Aplicar', { id: s.id }, 'accent quick')}
    </div>`;
  }
  return `<div class="tile ${sel ? 'sel' : ''}" draggable="true" data-sid="${s.id}" data-action="select" data-id="${s.id}" data-dbl="applyId">
    <div class="tile-media">
      ${thumbHtml(s)}
      <input type="checkbox" class="chk ${s.batch ? 'is-on' : ''}" data-action="toggleBatch" data-id="${s.id}" ${s.batch ? 'checked' : ''} title="Incluir en el render">
      ${cur ? '<span class="live-badge"><span class="live"></span>En escena</span>' : ''}
      <button class="play" data-action="applyId" data-id="${s.id}" title="Aplicar">${icon('play')}</button>
    </div>
    <div class="tile-info">
      <span class="swatch-dot" style="background:${esc(s.color)}"></span>
      <div class="row-main"><span class="name">${esc(s.name)}</span><span class="meta">${esc(meta)}</span></div>
    </div>
  </div>`;
}

function browser() {
  const list = filteredSetups();
  if (!S.data.setups.length) {
    return empty('Crea tu primer setup',
      'Prepara la vista en 3ds Max (cámara, capas, resolución) y guárdala. Podrás volver a ella con un clic.',
      btn('newSetup', 'Nuevo setup', 'plus', {}, 'primary'));
  }
  if (!list.length) return empty('Sin resultados', `Ningún setup coincide con “${esc(S.search)}”.`);
  const byGroup = new Map();
  list.forEach(s => {
    const g = s.group || '';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(s);
  });
  const showHeaders = byGroup.size > 1 || (byGroup.size === 1 && !byGroup.has(''));
  return [...byGroup.entries()].map(([g, items]) => {
    const closed = !!S.ui.groupsClosed[g];
    const head = showHeaders ? `<div class="group-h" data-action="toggleGroup" data-group="${esc(g)}" data-dropgroup="${esc(g)}">
        <span class="chev ${closed ? '' : 'open'}">${icon('chevron')}</span>
        <span>${esc(g || 'Sin grupo')}</span><span class="count">${items.length}</span>
      </div>` : '';
    return `<section class="group">${head}${closed ? '' : `<div class="${S.ui.layout === 'list' ? 'rows' : 'tiles'}">${items.map(tile).join('')}</div>`}</section>`;
  }).join('');
}

function propBody(s, key) {
  const c = s.comp[key];
  switch (key) {
    case 'camera': {
      const names = S.scene.cameras.map(x => x.name);
      const opts = [['', 'Elige una cámara'], ...names.map(n => [n, n])];
      if (c.name && !names.includes(c.name)) opts.push([c.name, `${c.name} (no existe)`]);
      return `<div class="line">${selectHtml('comp.camera.name', c.name, opts)}
          ${ib('useActiveCam', 'target', 'Usar la cámara del visor')}${ib('viewCam', 'eye', 'Ver en el visor', { name: c.name })}</div>
        ${c.name && !names.includes(c.name) ? `<p class="hint warn">${icon('warn')} Esta cámara ya no existe en la escena.</p>` : ''}`;
    }
    case 'res': {
      const ratio = c.h ? (c.w / c.h).toFixed(2) : '-';
      return `<div class="line">
          <input type="number" min="1" data-field="comp.res.w" data-type="int" value="${c.w}" title="Ancho">
          <span class="x">×</span>
          <input type="number" min="1" data-field="comp.res.h" data-type="int" value="${c.h}" title="Alto">
          ${ib('swapRes', 'swap', 'Girar (horizontal / vertical)')}${ib('useCurrentRes', 'target', 'Usar la resolución de la escena')}
        </div>
        <div class="chips">${PRESETS.map(([v, l]) => `<button class="chip ${v === `${c.w}x${c.h}` ? 'on' : ''}" data-action="preset" data-v="${v}" title="${v.replace('x', ' × ')}">${esc(l)}</button>`).join('')}</div>
        <p class="hint">Proporción ${ratio}</p>`;
    }
    case 'layers': {
      const scene = new Set(S.scene.layers.map(l => l.name));
      return `<div class="items">${c.items.map((l, i) => `<div class="item">
            ${ib('toggleItem', l.on ? 'eye' : 'eyeOff', l.on ? 'Visible' : 'Oculta', { list: 'layers', index: i }, l.on ? 'accent' : 'dim')}
            <span class="name ${l.on ? '' : 'off'}">${esc(l.name)}</span>
            ${scene.has(l.name) ? '' : `<span class="warn-ico" title="No existe en la escena">${icon('warn')}</span>`}
            ${ib('removeItem', 'x', 'Quitar', { list: 'layers', index: i }, 'hover')}
          </div>`).join('') || '<p class="hint">Sin capas.</p>'}</div>
        <div class="line end">${btn('setAll', 'Todas', '', { list: 'layers', val: 1 }, 'ghost')}${btn('setAll', 'Ninguna', '', { list: 'layers', val: 0 }, 'ghost')}${btn('captureLayers', 'Capturar', 'target', {}, 'ghost')}</div>`;
    }
    case 'objects':
      return `<div class="items">${c.items.map((o, i) => `<div class="item">
            ${ib('toggleItem', o.hidden ? 'eyeOff' : 'eye', o.hidden ? 'Oculto' : 'Visible', { list: 'objects', index: i }, o.hidden ? 'dim' : 'accent')}
            <span class="name ${o.hidden ? 'off' : ''}">${esc(o.name)}</span>
            ${ib('removeItem', 'x', 'Quitar', { list: 'objects', index: i }, 'hover')}
          </div>`).join('') || '<p class="hint">Selecciona objetos en 3ds Max y añádelos.</p>'}</div>
        <div class="line end">${btn('addSelection', 'Ocultar selección', 'eyeOff', { val: 1 }, 'ghost')}${btn('addSelection', 'Mostrar selección', 'eye', { val: 0 }, 'ghost')}</div>`;
    case 'sun': {
      const suns = S.scene.suns.map(x => x.name);
      const opts = [['', 'Apagar todos los soles'], ...suns.map(n => [n, n])];
      if (c.name && !suns.includes(c.name)) opts.push([c.name, `${c.name} (no existe)`]);
      return `${selectHtml('comp.sun.name', c.name, opts)}${suns.length ? '' : '<p class="hint">No hay soles en la escena.</p>'}`;
    }
    case 'env': {
      const envs = S.scene.envMaps;
      const opts = [['', 'Sin entorno'], ...envs.map(n => [n, n])];
      if (c.name && !envs.includes(c.name)) opts.push([c.name, `${c.name} (no existe)`]);
      return selectHtml('comp.env.name', c.name, opts);
    }
    case 'elements':
      return `<div class="items">${c.items.map((e, i) => `<div class="item">
            ${toggle(e.on, 'toggleItem', { list: 'elements', index: i }, e.on ? 'Activo' : 'Inactivo')}
            <span class="name ${e.on ? '' : 'off'}">${esc(e.name)}</span>
            ${ib('removeItem', 'x', 'Quitar', { list: 'elements', index: i }, 'hover')}
          </div>`).join('') || '<p class="hint">Sin render elements.</p>'}</div>
        <div class="line end">${btn('captureElements', 'Capturar', 'target', {}, 'ghost')}</div>`;
    case 'corona': {
      const mins = c.timeLimit === '' ? '' : +(c.timeLimit / 60000).toFixed(2);
      return `${S.scene.corona.isCorona ? '' : `<p class="hint warn">${icon('warn')} El motor actual no es Corona.</p>`}
        <div class="fields">
          <label><span>Pases</span><input type="number" min="0" step="1" data-field="comp.corona.passLimit" data-type="int" value="${esc(c.passLimit)}" placeholder="—"></label>
          <label><span>Ruido %</span><input type="number" min="0" step="0.1" data-field="comp.corona.noiseLimit" data-type="float" value="${esc(c.noiseLimit)}" placeholder="—"></label>
          <label><span>Minutos</span><input type="number" min="0" step="0.5" data-field="comp.corona.timeLimit" data-type="minutes" value="${esc(mins)}" placeholder="—"></label>
        </div>
        <p class="hint">0 = sin límite · vacío = no cambiar</p>
        <div class="line end">${btn('useCurrentCorona', 'Usar valores actuales', 'target', {}, 'ghost')}</div>`;
    }
  }
  return '';
}

function inspectorSingle(s) {
  const active = PROPS.filter(p => s.comp[p.key].on);
  const inactive = PROPS.filter(p => !s.comp[p.key].on);
  const d = diffs(s);
  const groupOpts = groups().map(g => `<option value="${esc(g)}">`).join('');
  const props = active.map(p => {
    const open = !!S.open[p.key];
    return `<div class="prop ${open ? 'open' : ''}">
      <div class="prop-h" data-action="toggleProp" data-key="${p.key}">
        <span class="prop-ico">${icon(p.icon)}</span>
        <span class="prop-t">${esc(p.title)}</span>
        <span class="prop-sum">${esc(summary(s, p.key))}</span>
        <span class="chev ${open ? 'open' : ''}">${icon('chevron')}</span>
      </div>
      ${open ? `<div class="prop-b">${propBody(s, p.key)}
        <div class="prop-foot">
          ${btn('copyToAll', 'Copiar a todos', 'copy', { key: p.key }, 'link')}
          ${btn('removeProp', 'Quitar', 'minus', { key: p.key }, 'link')}
        </div></div>` : ''}
    </div>`;
  }).join('');
  return `<div class="insp-head">
      ${ib('closeInspector', 'back', 'Volver', {}, 'only-narrow')}
      <div class="insp-thumb">${thumbHtml(s, 'lg')}${ib('thumbUpdate', 'refresh', 'Actualizar miniatura desde el visor', {}, 'thumb-btn')}</div>
      <div class="insp-title">
        <button class="color-btn" data-action="colorMenu" style="background:${esc(s.color)}" title="Color"></button>
        <input class="title-input" type="text" data-field="name" value="${esc(s.name)}" spellcheck="false">
      </div>
      <div class="insp-sub">
        <label class="group-input">${icon('folder')}<input type="text" list="groupList" data-field="group" value="${esc(s.group)}" placeholder="Sin grupo"><datalist id="groupList">${groupOpts}</datalist></label>
        <label class="render-flag" title="Incluir en el render por lotes">${toggle(s.batch, 'toggleBatchFlag', { id: s.id })}<span>Render</span></label>
      </div>
      <div class="insp-actions">
        ${btn('applyId', 'Aplicar', 'play', { id: s.id }, 'primary grow')}
        ${btn('updateSetup', 'Capturar', 'target', { id: s.id }, 'ghost')}
        ${ib('setupMenu', 'more', 'Más', { id: s.id }, 'boxed')}
      </div>
      ${d.length ? `<div class="diff">${icon('warn')}<span>La escena difiere en ${esc(d.join(', '))}</span></div>` : ''}
    </div>
    <div class="props">${props || '<p class="hint pad">Este setup no cambia nada todavía.</p>'}</div>
    ${inactive.length ? `<div class="add-prop">${btn('addPropMenu', 'Propiedad', 'plus', {}, 'ghost wide')}</div>` : ''}`;
}

function inspectorMulti(list) {
  const r = list[0].comp.res;
  return `<div class="insp-head">
      ${ib('closeInspector', 'back', 'Volver', {}, 'only-narrow')}
      <div class="stack">${list.slice(0, 4).map(s => thumbHtml(s)).join('')}</div>
      <div class="insp-title"><span class="title-static">${plural(list.length, 'setup seleccionado', 'setups seleccionados')}</span></div>
      <div class="insp-actions">
        ${btn('renderSelected', 'Renderizar', 'render', {}, 'primary grow')}
        ${btn('dupSelected', 'Duplicar', 'copy', {}, 'ghost')}
        ${ib('deleteSelected', 'trash', 'Borrar', {}, 'boxed')}
      </div>
    </div>
    <div class="props">
      <div class="prop open"><div class="prop-h static"><span class="prop-ico">${icon('aspect')}</span><span class="prop-t">Resolución para todos</span></div>
        <div class="prop-b"><div class="line">
          <input type="number" min="1" id="multiW" value="${r.w}"><span class="x">×</span><input type="number" min="1" id="multiH" value="${r.h}">
          ${btn('multiRes', 'Aplicar', 'check', {}, 'ghost')}</div></div></div>
      <div class="prop open"><div class="prop-h static"><span class="prop-ico">${icon('folder')}</span><span class="prop-t">Grupo</span></div>
        <div class="prop-b"><div class="line"><input type="text" id="multiGroup" list="groupList2" placeholder="Nombre del grupo"><datalist id="groupList2">${groups().map(g => `<option value="${esc(g)}">`).join('')}</datalist>
          ${btn('multiGroup', 'Mover', 'check', {}, 'ghost')}</div></div></div>
      <div class="prop open"><div class="prop-h static"><span class="prop-ico">${icon('render')}</span><span class="prop-t">Render por lotes</span></div>
        <div class="prop-b"><div class="line">${btn('multiBatch', 'Incluir', 'check', { val: 1 }, 'ghost')}${btn('multiBatch', 'Excluir', 'x', { val: 0 }, 'ghost')}</div></div></div>
    </div>`;
}

function viewSetups() {
  const list = selected();
  const insp = list.length > 1 ? inspectorMulti(list) : list.length ? inspectorSingle(list[0]) : '';
  return `<div class="split ${S.inspector ? 'insp-open' : ''} ${insp ? '' : 'no-insp'}">
    <div class="browser" data-action="clearSel">${browser()}</div>
    ${insp ? `<aside class="inspector">${insp}</aside>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- vista: camaras

function viewCameras() {
  const cams = S.scene.cameras;
  const used = name => S.data.setups.filter(s => s.comp.camera.name === name).length;
  const rows = cams.map(c => `<div class="lrow">
      <span class="lrow-ico">${icon('camera')}</span>
      <div class="row-main"><span class="name">${esc(c.name)}</span><span class="meta">${esc(c.cls)}${used(c.name) ? ` · ${plural(used(c.name), 'setup', 'setups')}` : ''}</span></div>
      ${c.name === S.scene.activeCamera ? '<span class="pill">En visor</span>' : ''}
      ${c.locked ? `<span class="lock-ico" title="Bloqueada">${icon('lock')}</span>` : ''}
      <span class="lrow-tools">
        ${ib('cam', 'eye', 'Ver en el visor', { cmd: 'view', name: c.name })}
        ${ib('cam', 'pointer', 'Seleccionar', { cmd: 'select', name: c.name })}
        ${ib('cam', c.locked ? 'unlock' : 'lock', c.locked ? 'Desbloquear' : 'Bloquear', { cmd: 'lock', name: c.name })}
        ${ib('cam', 'edit', 'Renombrar', { cmd: 'rename', name: c.name })}
        ${ib('cam', 'trash', 'Borrar', { cmd: 'delete', name: c.name })}
      </span>
    </div>`).join('');
  return `<div class="page">
    <div class="page-h"><h1>Cámaras</h1><span class="count">${cams.length}</span></div>
    <div class="create">
      <input type="text" id="newCamName" placeholder="Nombre de la nueva cámara (opcional)">
      ${btn('camCreate', 'Crear desde la vista', 'plus', {}, 'primary')}
    </div>
    <p class="hint">Crea una CoronaCam con el encuadre del visor activo.</p>
    <div class="panel">${rows || empty('No hay cámaras', 'Crea una desde la vista del visor.')}</div>
  </div>`;
}

// ---------------------------------------------------------------- vista: render

function viewRender() {
  const sets = S.data.setups;
  const b = S.data.batch;
  const marked = sets.filter(s => s.batch);
  const folder = b.folder || S.scene.defaultFolder;
  const logFor = id => S.batchLog.find(l => l.id === id);
  const queue = sets.map(s => {
    const l = logFor(s.id);
    return `<div class="lrow ${s.batch ? '' : 'muted-row'}" draggable="true" data-sid="${s.id}">
      <input type="checkbox" class="chk" data-action="toggleBatch" data-id="${s.id}" ${s.batch ? 'checked' : ''} ${S.busy ? 'disabled' : ''}>
      ${thumbHtml(s, 'sm')}
      <div class="row-main"><span class="name">${esc(s.name)}</span><span class="meta">${esc([s.comp.camera.on && s.comp.camera.name, s.comp.res.on && `${s.comp.res.w}×${s.comp.res.h}`].filter(Boolean).join(' · ') || 'Sin cámara')}</span></div>
      ${l ? `<span class="state ${l.state}" title="${esc(l.text)}">${{ wait: 'En cola', run: 'Renderizando', ok: 'Hecho', skip: 'Omitido' }[l.state]}</span>` : ''}
    </div>`;
  }).join('');
  const els = S.scene.elements.map(e => `<div class="lrow">
      ${toggle(e.enabled, 'elem', { cmd: 'toggle', index: e.index }, e.enabled ? 'Activo' : 'Inactivo')}
      <div class="row-main"><span class="name ${e.enabled ? '' : 'off'}">${esc(e.name)}</span></div>
      <span class="lrow-tools">${ib('elem', 'trash', 'Borrar', { cmd: 'remove', index: e.index, name: e.name })}</span>
    </div>`).join('');
  return `<div class="page">
    <div class="page-h"><h1>Render</h1><span class="count">${marked.length}/${sets.length}</span>
      <span class="spacer"></span>${ib('batchAll', 'check', 'Marcar todos')}${ib('batchNone', 'x', 'Desmarcar todos')}</div>
    <div class="panel">${queue || empty('No hay setups', 'Crea setups en la galería para renderizarlos aquí.')}</div>

    <h2>Salida</h2>
    <div class="panel pad">
      <div class="fields wide">
        <label class="span2"><span>Carpeta</span><div class="line"><input type="text" data-scope="data" data-field="batch.folder" value="${esc(b.folder)}" placeholder="${esc(S.scene.defaultFolder)}">${ib('browse', 'folder', 'Elegir carpeta', { target: 'batch' }, 'boxed')}</div></label>
        <label><span>Formato</span>${selectHtml('batch.fmt', b.fmt, FORMATS.map(f => [f, f.slice(1).toUpperCase()]), 'data-scope="data"')}</label>
        <label class="switch-label"><span>Restaurar escena al terminar</span>${toggle(b.restore, 'toggleRestore')}</label>
      </div>
      <p class="hint mono">${esc(folder)}\\&lt;setup&gt;\\&lt;setup&gt;${esc(b.fmt)}</p>
    </div>

    <h2>Render elements</h2>
    <div class="panel">${els || '<p class="hint pad">Sin render elements.</p>'}
      <div class="lrow add">
        <select id="elemClass">${S.scene.elementClasses.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        ${btn('elemAdd', 'Añadir', 'plus', {}, 'ghost')}
      </div>
    </div>
    <p class="hint">Desactiva el candado de vista en Render Setup. Mantén ESC para detener el lote.</p>
    <div class="sticky-cta">
      <button class="btn primary big" data-action="startBatch" ${S.busy || !marked.length ? 'disabled' : ''}>${icon('render')}<span>${S.busy ? 'Renderizando…' : `Renderizar ${plural(marked.length, 'setup', 'setups')}`}</span></button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- vista: ajustes

function viewSettings() {
  const keys = [
    ['N', 'Nuevo setup con la escena actual'], ['Enter', 'Aplicar el setup seleccionado'], ['F2', 'Renombrar'],
    ['Ctrl D', 'Duplicar'], ['Supr', 'Borrar'], ['← → ↑ ↓', 'Moverse entre setups'], ['Ctrl A', 'Seleccionar todos'],
    ['Ctrl Z / Ctrl Y', 'Deshacer / rehacer'], ['Ctrl K', 'Paleta de comandos'], ['Ctrl F', 'Buscar'], ['G', 'Galería / lista'],
  ];
  return `<div class="page narrow">
    <div class="page-h"><h1>Ajustes</h1></div>
    <div class="panel pad">
      <div class="setting"><div><strong>Color de acento</strong><p class="hint">El color de botones y selección.</p></div>
        <div class="accents">${ACCENTS.map(a => `<button class="accent-dot ${a === S.ui.accent ? 'on' : ''}" style="background:${a}" data-action="setAccent" data-v="${a}"></button>`).join('')}</div></div>
      <div class="setting"><div><strong>Miniaturas</strong><p class="hint">Captura del visor al crear un setup.</p></div>${toggle(S.ui.thumbs, 'toggleThumbs')}</div>
      <div class="setting"><div><strong>Vista de setups</strong></div>
        <div class="seg">${btn('setLayout', 'Galería', 'grid', { v: 'grid' }, S.ui.layout === 'grid' ? 'on' : '')}${btn('setLayout', 'Lista', 'rows', { v: 'list' }, S.ui.layout === 'list' ? 'on' : '')}</div></div>
    </div>
    <h2>Atajos de teclado</h2>
    <div class="panel pad keys">${keys.map(([k, d]) => `<div class="key-row"><span>${esc(d)}</span><kbd>${esc(k)}</kbd></div>`).join('')}</div>
    <h2>Cómo funciona</h2>
    <div class="panel pad prose">
      <p>Un <b>setup</b> guarda una vista de la escena: cámara, resolución, capas… Solo se aplican las propiedades que aparecen en su inspector; con <b>+ Propiedad</b> añades más.</p>
      <p>Los setups se guardan dentro del archivo .max. Guarda el archivo para no perderlos.</p>
      <p class="hint">REA Scene Manager ${esc(VERSION)} · ${esc(S.scene.renderer)}</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- render general

const VIEWS = { setups: viewSetups, cameras: viewCameras, render: viewRender, settings: viewSettings };

function renderTop() {
  const marked = S.data ? S.data.setups.filter(s => s.batch).length : 0;
  $('#topActions').innerHTML = `
    ${ib('undo', 'undo', 'Deshacer (Ctrl Z)', {}, S.undo.length ? '' : 'disabled')}
    ${ib('redo', 'redo', 'Rehacer (Ctrl Y)', {}, S.redo.length ? '' : 'disabled')}
    <span class="sep"></span>
    ${ib('toggleLayout', S.ui.layout === 'grid' ? 'rows' : 'grid', S.ui.layout === 'grid' ? 'Ver como lista (G)' : 'Ver como galería (G)')}
    ${ib('refresh', 'refresh', 'Leer la escena de nuevo')}
    ${btn('newSetup', 'Nuevo', 'plus', {}, 'ghost')}
    ${btn('goRender', marked ? `Render · ${marked}` : 'Render', 'render', {}, 'primary')}`;
  $('#search').closest('.search').style.visibility = S.view === 'setups' ? 'visible' : 'hidden';
}

function renderStatus() {
  const ok = S.scene && Bridge.isHost;
  const p = S.progress;
  $('#statusbar').innerHTML = `
    <span class="dot ${S.scene ? (ok ? 'ok' : 'demo') : ''}"></span>
    <span>${S.scene ? (ok ? `3ds Max · ${esc(S.scene.renderer)}` : 'Modo demostración') : 'Conectando…'}</span>
    ${p ? `<span class="prog"><span class="prog-bar"><span style="width:${Math.round((p.i - 1) / p.n * 100)}%"></span></span>Renderizando ${p.i}/${p.n} · ${esc(p.name)}</span>` : ''}
    <span class="spacer"></span>
    <span>${S.data ? plural(S.data.setups.length, 'setup', 'setups') : ''}</span>
    <span class="muted">v${esc(VERSION)}</span>`;
}

function render() {
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  const main = $('#main');
  if (!S.scene || !S.data) { main.innerHTML = empty('Leyendo la escena…'); renderStatus(); return; }
  const scrollers = [...main.querySelectorAll('.browser, .inspector, .page')].map(el => [el.className.split(' ')[0], el.scrollTop]);
  main.innerHTML = VIEWS[S.view]();
  scrollers.forEach(([cls, top]) => { const el = main.querySelector('.' + cls); if (el) el.scrollTop = top; });
  renderTop();
  renderStatus();
  renderOverlay();
}

function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstChild.remove();
  box.appendChild(el);
  setTimeout(() => el.classList.add('hide'), 2600);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------- menus y paleta

function openMenu(anchor, items) {
  const r = anchor.getBoundingClientRect();
  S.menu = { x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 6, items };
  renderOverlay();
}
function openMenuAt(x, y, items) {
  S.menu = { x: Math.min(x, window.innerWidth - 230), y: Math.min(y, window.innerHeight - items.length * 34 - 20), items };
  renderOverlay();
}
function closeOverlay() { S.menu = null; S.palette = null; renderOverlay(); }

function paletteItems() {
  const acts = [
    ['Nuevo setup con la escena actual', 'plus', () => A.newSetup()],
    ['Ir a la galería', 'grid', () => { S.view = 'setups'; render(); }],
    ['Ir a cámaras', 'camera', () => { S.view = 'cameras'; render(); }],
    ['Ir a render', 'render', () => { S.view = 'render'; render(); }],
    ['Renderizar setups marcados', 'render', () => A.startBatch()],
    ['Crear cámara desde la vista', 'camera', () => { S.view = 'cameras'; render(); A.camCreate(); }],
    ['Cambiar galería / lista', 'grid', () => A.toggleLayout()],
    ['Leer la escena de nuevo', 'refresh', () => A.refresh()],
    ['Ajustes', 'settings', () => { S.view = 'settings'; render(); }],
  ].map(([label, ic, run]) => ({ label, ic, run, kind: 'Acción' }));
  const sets = S.data.setups.flatMap(s => [
    { label: `Aplicar ${s.name}`, ic: 'play', run: () => applySetup(s), kind: s.group || 'Setup' },
    { label: `Renderizar ${s.name}`, ic: 'render', run: () => runBatch([s.id]), kind: s.group || 'Setup' },
  ]);
  return [...sets, ...acts];
}

function renderOverlay() {
  const ov = $('#overlay');
  if (S.palette) {
    const q = S.palette.q.toLowerCase();
    const items = paletteItems().filter(it => it.label.toLowerCase().includes(q)).slice(0, 9);
    S.palette.items = items;
    S.palette.i = Math.min(S.palette.i, Math.max(0, items.length - 1));
    const listHtml = items.map((it, i) => `<div class="pal-item ${i === S.palette.i ? 'on' : ''}" data-pal="${i}">${icon(it.ic)}<span>${esc(it.label)}</span><span class="muted">${esc(it.kind)}</span></div>`).join('') || '<p class="hint pad">Nada coincide.</p>';
    if (!ov.querySelector('.palette')) {
      ov.innerHTML = `<div class="scrim" data-close="1"><div class="palette"><div class="pal-input">${icon('search')}<input id="palInput" placeholder="Escribe un comando o un setup…" autocomplete="off" spellcheck="false"></div><div class="pal-list"></div></div></div>`;
      const inp = $('#palInput');
      inp.value = S.palette.q;
      setTimeout(() => inp.focus(), 0);
    }
    ov.querySelector('.pal-list').innerHTML = listHtml;
    return;
  }
  if (S.menu) {
    ov.innerHTML = `<div class="scrim clear" data-close="1"></div><div class="menu" style="left:${S.menu.x}px;top:${S.menu.y}px">${S.menu.items.map((it, i) =>
      it.sep ? '<div class="menu-sep"></div>'
        : it.colors ? `<div class="menu-colors">${COLORS.map(c => `<button class="accent-dot" style="background:${c}" data-menu="${i}" data-color="${c}"></button>`).join('')}</div>`
          : `<button class="menu-item ${it.danger ? 'danger' : ''}" data-menu="${i}">${it.ic ? icon(it.ic) : ''}<span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`).join('')}</div>`;
    return;
  }
  ov.innerHTML = '';
}

function setupMenuItems(s) {
  return [
    { label: 'Aplicar', ic: 'play', key: 'Enter', run: () => applySetup(s) },
    { label: 'Renderizar', ic: 'render', run: () => runBatch([s.id]) },
    { sep: true },
    { label: 'Renombrar', ic: 'edit', key: 'F2', run: () => focusName() },
    { label: 'Duplicar', ic: 'copy', key: 'Ctrl D', run: () => A.dupSelected() },
    { label: 'Actualizar miniatura', ic: 'image', run: () => A.thumbUpdate() },
    { colors: true, run: c => mutate(() => { s.color = c; }) },
    { sep: true },
    { label: 'Borrar', ic: 'trash', key: 'Supr', danger: true, run: () => A.deleteSelected() },
  ];
}

function focusName() {
  S.view = 'setups'; S.inspector = true; render();
  const el = document.querySelector('.title-input');
  if (el) { el.focus(); el.select(); }
}

// ---------------------------------------------------------------- campos

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.forEach(k => { obj = obj[k]; });
  obj[last] = value;
}

function readValue(el) {
  const t = el.dataset.type;
  if (t === 'bool') return el.checked;
  if (el.value === '') return '';
  if (t === 'int') return Math.max(0, parseInt(el.value, 10) || 0);
  if (t === 'float') return Math.max(0, parseFloat(el.value) || 0);
  if (t === 'minutes') return Math.round(Math.max(0, parseFloat(el.value) || 0) * 60000);
  return el.value;
}

function onFieldChange(el) {
  const target = el.dataset.scope === 'data' ? S.data : primary();
  if (!target) return;
  let v = readValue(el);
  const f = el.dataset.field;
  if ((f === 'comp.res.w' || f === 'comp.res.h') && !v) v = 1;
  if (f === 'name') v = String(v).trim() || target.name;
  if (f === 'group') v = String(v).trim();
  mutate(() => setPath(target, f, v));
}

const comp = key => { const s = primary(); return s ? s.comp[key] : null; };

// ---------------------------------------------------------------- acciones

const A = {
  async refresh() { await refreshScene(); render(); toast('Escena actualizada'); },
  goRender() { S.view = 'render'; render(); },
  palette() { S.palette = { q: '', i: 0, items: [] }; S.menu = null; renderOverlay(); },
  undo() { undo(); },
  redo() { redo(); },
  toggleLayout() { S.ui.layout = S.ui.layout === 'grid' ? 'list' : 'grid'; saveUi(); render(); },
  setLayout(el) { S.ui.layout = el.dataset.v; saveUi(); render(); },
  setAccent(el) { S.ui.accent = el.dataset.v; saveUi(); render(); },
  toggleThumbs() { S.ui.thumbs = !S.ui.thumbs; saveUi(); render(); },
  closeInspector() { S.inspector = false; render(); },

  // seleccion
  select(el, e) {
    const id = el.dataset.id;
    if (e && (e.ctrlKey || e.metaKey)) {
      S.sel = S.sel.includes(id) ? S.sel.filter(x => x !== id) : [...S.sel, id];
    } else if (e && e.shiftKey && S.sel.length) {
      const order = filteredSetups().map(s => s.id);
      const a = order.indexOf(S.sel[S.sel.length - 1]);
      const b = order.indexOf(id);
      const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
      S.sel = [...new Set([...S.sel, ...range.filter(x => x !== id)]), id];
    } else {
      S.sel = [id];
      S.inspector = true;
    }
    render();
  },
  clearSel(el, e) { if (e.target === el || e.target.classList.contains('group')) { S.sel = []; S.inspector = false; render(); } },
  toggleGroup(el) { const g = el.dataset.group; S.ui.groupsClosed[g] = !S.ui.groupsClosed[g]; saveUi(); render(); },

  // setups
  async newSetup() {
    if (S.view !== 'setups') S.view = 'setups';
    await refreshScene();
    const base = S.scene.activeCamera ? S.scene.activeCamera.replace(/^(rea_)?cam(era)?[_\s-]*/i, '') : 'Setup';
    const s = setupFromScene(uniqueName(base || 'Setup'));
    const p = primary();
    if (p && p.group) s.group = p.group;
    mutate(() => { S.data.setups.push(s); S.sel = [s.id]; S.inspector = true; });
    toast(`${s.name} creado`, 'ok');
    await updateThumb(s);
    render();
  },
  applyId(el) { return applySetup(getSetup(el.dataset.id) || primary()); },
  async updateSetup(el) {
    const s = getSetup(el.dataset.id);
    if (!s) return;
    await refreshScene();
    const fresh = setupFromScene(s.name);
    mutate(() => {
      Object.keys(fresh.comp).forEach(k => { fresh.comp[k].on = s.comp[k].on; });
      fresh.comp.objects = s.comp.objects;
      s.comp = fresh.comp;
    });
    await updateThumb(s);
    render();
    toast(`${s.name} actualizado con la escena`, 'ok');
  },
  async thumbUpdate() { const s = primary(); if (!s) return; await updateThumb(s); render(); },
  dupSelected() {
    const list = selected();
    if (!list.length) return;
    const ids = [];
    mutate(() => {
      list.forEach(s => {
        const d = clone(s);
        d.id = uid();
        d.name = uniqueName(s.name + ' copia');
        S.data.setups.splice(S.data.setups.indexOf(s) + 1, 0, d);
        ids.push(d.id);
      });
      S.sel = ids;
    });
  },
  deleteSelected() {
    const list = selected();
    if (!list.length) return;
    const idx = S.data.setups.indexOf(list[0]);
    mutate(() => {
      S.data.setups = S.data.setups.filter(s => !list.includes(s));
      const n = S.data.setups[Math.min(idx, S.data.setups.length - 1)];
      S.sel = n ? [n.id] : [];
    });
    toast(`${plural(list.length, 'setup borrado', 'setups borrados')} · Ctrl Z para deshacer`);
  },
  renderSelected() { return runBatch(selected().map(s => s.id)); },
  toggleBatch(el) { const s = getSetup(el.dataset.id); mutate(() => { s.batch = el.checked; }); },
  toggleBatchFlag(el) { const s = getSetup(el.dataset.id); mutate(() => { s.batch = !s.batch; }); },
  setupMenu(el) { openMenu(el, setupMenuItems(getSetup(el.dataset.id))); },
  colorMenu(el) { const s = primary(); openMenu(el, [{ colors: true, run: c => mutate(() => { s.color = c; }) }]); },
  multiRes() {
    const w = Math.max(1, parseInt($('#multiW').value, 10) || 1);
    const h = Math.max(1, parseInt($('#multiH').value, 10) || 1);
    mutate(() => selected().forEach(s => Object.assign(s.comp.res, { w, h, on: true })));
    toast('Resolución aplicada', 'ok');
  },
  multiGroup() { const g = $('#multiGroup').value.trim(); mutate(() => selected().forEach(s => { s.group = g; })); },
  multiBatch(el) { mutate(() => selected().forEach(s => { s.batch = el.dataset.val === '1'; })); },

  // propiedades
  toggleProp(el) { S.open[el.dataset.key] = !S.open[el.dataset.key]; render(); },
  addPropMenu(el) {
    const s = primary();
    openMenu(el, PROPS.filter(p => !s.comp[p.key].on).map(p => ({
      label: p.title, ic: p.icon, run: () => { S.open[p.key] = true; mutate(() => { s.comp[p.key].on = true; }); },
    })));
  },
  removeProp(el) { const k = el.dataset.key; mutate(() => { primary().comp[k].on = false; }); },
  copyToAll(el) {
    const s = primary();
    const k = el.dataset.key;
    if (S.data.setups.length < 2) return toast('Solo hay un setup.');
    mutate(() => S.data.setups.forEach(o => { if (o !== s) o.comp[k] = clone(s.comp[k]); }));
    toast(`${PROPS.find(p => p.key === k).title} copiada a ${plural(S.data.setups.length - 1, 'setup', 'setups')}`, 'ok');
  },
  async useActiveCam() {
    await refreshScene();
    if (!S.scene.activeCamera) return toast('El visor activo no es una cámara.', 'warn');
    mutate(() => Object.assign(comp('camera'), { name: S.scene.activeCamera, on: true }));
  },
  viewCam(el) { if (el.dataset.name) return Bridge.call('cam', 'view', el.dataset.name).then(refreshScene).then(render); },
  swapRes() { mutate(() => { const r = comp('res'); [r.w, r.h] = [r.h, r.w]; }); },
  preset(el) { const [w, h] = el.dataset.v.split('x').map(Number); mutate(() => Object.assign(comp('res'), { w, h })); },
  async useCurrentRes() { await refreshScene(); mutate(() => Object.assign(comp('res'), { w: S.scene.res.w, h: S.scene.res.h })); },
  toggleItem(el) {
    mutate(() => {
      const it = comp(el.dataset.list).items[Number(el.dataset.index)];
      if (el.dataset.list === 'objects') it.hidden = !it.hidden; else it.on = !it.on;
    });
  },
  removeItem(el) { mutate(() => comp(el.dataset.list).items.splice(Number(el.dataset.index), 1)); },
  setAll(el) { mutate(() => comp(el.dataset.list).items.forEach(it => { it.on = el.dataset.val === '1'; })); },
  async captureLayers() { await refreshScene(); mutate(() => { comp('layers').items = S.scene.layers.map(l => ({ name: l.name, on: l.on })); }); },
  async captureElements() { await refreshScene(); mutate(() => { comp('elements').items = S.scene.elements.map(e => ({ name: e.name, on: e.enabled })); }); },
  async addSelection(el) {
    const names = await Bridge.call('selection');
    if (!names.length) return toast('No hay objetos seleccionados en 3ds Max.', 'warn');
    const hidden = el.dataset.val === '1';
    mutate(() => {
      const c = comp('objects');
      names.forEach(n => {
        const it = c.items.find(x => x.name === n);
        if (it) it.hidden = hidden; else c.items.push({ name: n, hidden });
      });
    });
  },
  async useCurrentCorona() {
    await refreshScene();
    if (!S.scene.corona.isCorona) return toast('El motor actual no es Corona.', 'warn');
    mutate(() => { const c = comp('corona'); ['passLimit', 'noiseLimit', 'timeLimit'].forEach(k => { c[k] = S.scene.corona[k] ?? ''; }); });
  },

  // camaras
  async camCreate() {
    const inp = $('#newCamName');
    const name = await Bridge.call('camCreate', inp ? inp.value.trim() : '');
    await refreshScene(); render();
    toast(`Cámara ${name} creada`, 'ok');
  },
  async cam(el) {
    const cmd = el.dataset.cmd;
    const name = el.dataset.name;
    let arg = '';
    if (cmd === 'rename') {
      arg = (prompt('Nuevo nombre de la cámara:', name) || '').trim();
      if (!arg || arg === name) return;
    }
    if (cmd === 'delete' && !confirm(`¿Borrar la cámara ${name}?`)) return;
    const ok = await Bridge.call('cam', cmd, name, arg);
    if (!ok) toast(`No se encontró la cámara ${name}.`, 'warn');
    if (cmd === 'rename' && ok) mutate(() => S.data.setups.forEach(s => { if (s.comp.camera.name === name) s.comp.camera.name = arg; }));
    await refreshScene(); render();
  },

  // render
  async elem(el) {
    if (el.dataset.cmd === 'remove' && !confirm(`¿Borrar el render element ${el.dataset.name}?`)) return;
    await Bridge.call('elem', el.dataset.cmd, el.dataset.index, '');
    await refreshScene(); render();
  },
  async elemAdd() {
    const cls = $('#elemClass').value;
    const ok = await Bridge.call('elem', 'add', 0, cls);
    if (!ok) toast(`No se pudo añadir ${cls}.`, 'error');
    await refreshScene(); render();
  },
  async browse() {
    const f = await Bridge.call('browseFolder', S.data.batch.folder || S.scene.defaultFolder);
    if (f) mutate(() => { S.data.batch.folder = f; });
  },
  toggleRestore() { mutate(() => { S.data.batch.restore = !S.data.batch.restore; }); },
  batchAll() { mutate(() => S.data.setups.forEach(s => { s.batch = true; })); },
  batchNone() { mutate(() => S.data.setups.forEach(s => { s.batch = false; })); },
  startBatch() { return runBatch(S.data.setups.filter(s => s.batch).map(s => s.id)); },
};

// ---------------------------------------------------------------- eventos

async function run(fn, ...args) {
  try { await fn(...args); } catch (err) { toast(err.message, 'error'); }
}

document.addEventListener('click', e => {
  // overlay: menu y paleta
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) {
    const it = S.menu.items[Number(menuBtn.dataset.menu)];
    closeOverlay();
    run(it.run, menuBtn.dataset.color);
    return;
  }
  const pal = e.target.closest('[data-pal]');
  if (pal) { const it = S.palette.items[Number(pal.dataset.pal)]; closeOverlay(); run(it.run); return; }
  if (e.target.closest('[data-close]') && !e.target.closest('.palette')) { closeOverlay(); return; }

  const nav = e.target.closest('[data-view]');
  if (nav) { S.view = nav.dataset.view; S.inspector = false; render(); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.classList.contains('disabled') || !A[el.dataset.action]) return;
  if (S.busy && !['goRender', 'palette', 'select'].includes(el.dataset.action)) {
    if (el.tagName === 'INPUT') e.preventDefault();
    toast('Espera a que termine el render.', 'warn');
    return;
  }
  run(A[el.dataset.action], el, e);
});

document.addEventListener('dblclick', e => {
  const el = e.target.closest('[data-dbl]');
  if (!el || e.target.closest('button, input, select') || S.busy) return;
  run(A[el.dataset.dbl], el, e);
});

document.addEventListener('contextmenu', e => {
  const t = e.target.closest('[data-sid]');
  if (e.target.closest('input, textarea')) return;
  e.preventDefault();
  if (!t || S.view !== 'setups') return;
  const id = t.dataset.sid;
  if (!S.sel.includes(id)) { S.sel = [id]; render(); }
  openMenuAt(e.clientX, e.clientY, setupMenuItems(getSetup(id)));
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.field) onFieldChange(el);
});

document.addEventListener('input', e => {
  if (e.target.id === 'search') { S.search = e.target.value; render(); }
  if (e.target.id === 'palInput') { S.palette.q = e.target.value; S.palette.i = 0; renderOverlay(); }
});

// arrastrar para ordenar (y para mover entre grupos)
let dragIds = null;
document.addEventListener('dragstart', e => {
  const t = e.target.closest('[data-sid]');
  if (!t) return;
  const id = t.dataset.sid;
  dragIds = S.sel.includes(id) && S.view === 'setups' ? [...S.sel] : [id];
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  requestAnimationFrame(() => t.classList.add('dragging'));
});
document.addEventListener('dragover', e => {
  if (!dragIds) return;
  const t = e.target.closest('[data-sid], [data-dropgroup]');
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
  if (!t) return;
  e.preventDefault();
  if (t.dataset.dropgroup !== undefined) { t.classList.add('drop-into'); return; }
  const r = t.getBoundingClientRect();
  const horizontal = t.classList.contains('tile');
  const after = horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
  t.classList.add(after ? 'drop-after' : 'drop-before');
});
document.addEventListener('drop', e => {
  if (!dragIds) return;
  e.preventDefault();
  const t = e.target.closest('[data-sid], [data-dropgroup]');
  const ids = dragIds;
  dragIds = null;
  if (!t) return render();
  mutate(() => {
    const moving = S.data.setups.filter(s => ids.includes(s.id));
    let rest = S.data.setups.filter(s => !ids.includes(s.id));
    if (t.dataset.dropgroup !== undefined) {
      moving.forEach(s => { s.group = t.dataset.dropgroup; });
      S.data.setups = [...rest, ...moving];
      return;
    }
    const target = getSetup(t.dataset.sid);
    if (!target || ids.includes(target.id)) return;
    if (S.view === 'setups') moving.forEach(s => { s.group = target.group; });
    const after = t.classList.contains('drop-after');
    rest.splice(rest.indexOf(target) + (after ? 1 : 0), 0, ...moving);
    S.data.setups = rest;
  });
});
document.addEventListener('dragend', () => { dragIds = null; document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging')); });

// teclado
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, select, textarea');
  const ctrl = e.ctrlKey || e.metaKey;
  if (S.palette) {
    if (e.key === 'Escape') { closeOverlay(); return; }
    if (e.key === 'ArrowDown') { S.palette.i = Math.min(S.palette.i + 1, S.palette.items.length - 1); renderOverlay(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { S.palette.i = Math.max(S.palette.i - 1, 0); renderOverlay(); e.preventDefault(); return; }
    if (e.key === 'Enter') { const it = S.palette.items[S.palette.i]; closeOverlay(); if (it) run(it.run); e.preventDefault(); }
    return;
  }
  if (e.key === 'Escape') { if (S.menu) closeOverlay(); else if (typing) e.target.blur(); else { S.sel = []; S.inspector = false; render(); } return; }
  if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); A.palette(); return; }
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); S.view = 'setups'; render(); $('#search').focus(); return; }
  if (typing) {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
    return;
  }
  if (S.busy) return;
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (S.view !== 'setups') return;
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); A.dupSelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); S.sel = filteredSetups().map(s => s.id); render(); return; }
  if (e.key === 'n' || e.key === 'N') { run(A.newSetup); return; }
  if (e.key === 'g' || e.key === 'G') { A.toggleLayout(); return; }
  if (e.key === 'Enter') { run(applySetup, primary()); return; }
  if (e.key === 'F2') { e.preventDefault(); focusName(); return; }
  if (e.key === 'Delete') { A.deleteSelected(); return; }
  const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (moves[e.key]) {
    e.preventDefault();
    const order = filteredSetups().map(s => s.id);
    if (!order.length) return;
    let step = moves[e.key];
    if (S.ui.layout === 'grid' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const tiles = document.querySelector('.tiles');
      const cols = tiles ? getComputedStyle(tiles).gridTemplateColumns.split(' ').length : 1;
      step *= cols;
    }
    const i = order.indexOf(S.sel[S.sel.length - 1]);
    const j = Math.max(0, Math.min(order.length - 1, i < 0 ? 0 : i + step));
    S.sel = [order[j]];
    render();
    const t = document.querySelector(`[data-sid="${order[j]}"]`);
    if (t) t.scrollIntoView({ block: 'nearest' });
  }
});

// releer la escena al volver a la ventana (por si se cambio algo en 3ds Max)
let focusTimer = null;
window.addEventListener('focus', () => {
  if (S.busy || !S.scene) return;
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => refreshScene().then(render).catch(() => {}), 150);
});

let eventTimer = null;
Bridge.onEvent(ev => {
  if (S.busy) return;
  clearTimeout(eventTimer);
  eventTimer = setTimeout(async () => {
    try {
      await refreshScene();
      if (ev === 'scene') await loadData();
      render();
    } catch (err) { /* la escena puede estar cargando */ }
  }, ev === 'scene' ? 300 : 500);
});

// ---------------------------------------------------------------- inicio

(async function init() {
  applyAccent();
  applyStaticIcons(document);
  render();
  try {
    S.data = defaultData();
    await refreshScene();
    await loadData();
    render();
  } catch (err) {
    S.scene = null;
    $('#main').innerHTML = empty('No se pudo leer la escena', esc(err.message));
    renderStatus();
  }
})();
