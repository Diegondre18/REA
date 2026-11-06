// Granja de render en red: enviar trabajos, ver los nodos (PCs) y la cola compartida.
// No hay servidor: todo es una carpeta compartida en el NAS (ver scripts/REASM_farm.ms y node/REA_Node.ps1).

const NAS_FARM = '\\\\LAP-NAS\\LAP Arquitectura NAS\\Arch Viz Lap\\00_RenderFarm';
const PLUGINS = [['max', '3ds Max'], ['corona', 'Corona'], ['forest', 'Forest Pack'], ['railclone', 'RailClone'], ['tyflow', 'tyFlow']];
const MODES = [['always', 'Siempre'], ['idle', 'Sin uso'], ['night', 'De noche']];

S.farm = { raw: null, nodes: [], jobs: [], err: '', polledAt: 0, pc: '', local: null, seen: null, sending: false };
if (S.ui.farmRoot === undefined) S.ui.farmRoot = NAS_FARM;
if (!S.ui.prodTab) S.ui.prodTab = 'local';

const pj = t => { try { return JSON.parse(String(t || '').replace(/^﻿/, '')); } catch (e) { return null; } };
const farmRel = (...p) => p.join('\\');
const isUnc = p => /^\\\\/.test(p || '');
const ago = ms => ms < 60000 ? 'hace un momento' : `hace ${fmtDur(ms)}`;

// ---------------------------------------------------------------- estado

function farmParse(raw) {
  const now = +raw.now || Date.now();
  const sets = {};
  (raw.settings || []).forEach(f => { sets[f.file.replace(/\.settings\.json$/i, '')] = pj(f.text) || {}; });
  const nodes = (raw.nodes || []).map(f => pj(f.text)).filter(Boolean).map(n => Object.assign(n, {
    online: n.state !== 'off' && now - (+n.lastSeen || 0) < 45000,
    seenAgo: now - (+n.lastSeen || 0),
    settings: Object.assign({}, n.settings || {}, sets[n.name] || {}),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const busyTask = {};
  nodes.forEach(n => { if (n.online && n.job) busyTask[n.job.id + '/' + n.job.task] = n.name; });
  const jobs = (raw.jobs || []).map(j => {
    const job = pj(j.text);
    if (!job) return null;
    const st = {};
    (j.tasks || []).forEach(f => { const o = pj(f.text); if (o) st[f.file.replace(/\.json$/i, '')] = o; });
    Object.assign(job, { dir: j.dir, paused: !!j.paused, cancelled: !!j.cancelled });
    job.tasks.forEach(t => {
      const o = st[t.id];
      const claimed = (j.claims || []).includes(t.id);
      t.st = o || (claimed ? { state: 'run' } : { state: job.cancelled ? 'cancelled' : 'wait' });
      // tomada por un nodo que ya no responde
      t.stale = t.st.state === 'run' && !busyTask[job.id + '/' + t.id];
      if (t.st.state === 'run' && t.st.start) t.st.elapsed = now - t.st.start;
    });
    const c = s => job.tasks.filter(t => t.st.state === s).length;
    job.n = { ok: c('ok'), run: c('run'), wait: c('wait'), error: c('error'), cancelled: c('cancelled'), all: job.tasks.length };
    job.status = job.n.ok === job.n.all ? 'done' : job.cancelled ? 'cancelled' : job.n.run ? 'run' : job.paused ? 'paused'
      : job.n.wait ? 'wait' : job.n.error ? 'error' : 'cancelled';
    return job;
  }).filter(Boolean).sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.priority - a.priority || b.created - a.created);
  return { nodes, jobs };
}

async function farmPoll(quiet) {
  const root = (S.ui.farmRoot || '').trim();
  if (!root) { S.farm.err = 'noroot'; return; }
  try {
    if (!S.farm.pc) S.farm.pc = await Bridge.call('pcName');
    const raw = await Bridge.call('farmState', root);
    S.farm.raw = raw;
    if (!raw.ok) { S.farm.err = 'unreachable'; S.farm.nodes = []; S.farm.jobs = []; }
    else { S.farm.err = ''; Object.assign(S.farm, farmParse(raw)); farmCollect(); }
    S.farm.polledAt = Date.now();
  } catch (err) {
    S.farm.err = err.message;
  }
  if (!quiet && (S.view === 'production' || S.view === 'submit')) render();
}

// Las imagenes que terminan en la red se guardan en Resultados del setup (si el trabajo salio de esta escena)
// y avisan al PC que las envio.
function farmCollect() {
  const first = !S.farm.seen;
  if (first) S.farm.seen = new Set();
  let changed = false;
  for (const job of S.farm.jobs) {
    for (const t of job.tasks) {
      const key = job.id + '/' + t.id;
      if (t.st.state !== 'ok' && t.st.state !== 'error') continue;
      if (!S.farm.seen.has(key)) {
        S.farm.seen.add(key);
        if (!first && job.by === S.farm.pc) {
          toast(t.st.state === 'ok' ? `${t.name} listo en ${t.st.node}` : `${t.name}: error en ${t.st.node}`, t.st.state === 'ok' ? 'ok' : 'error');
          if (S.ui.sound) chime();
        }
      }
      if (t.st.state !== 'ok' || job.scene !== S.scene.file) continue;
      const s = S.data.setups.find(x => x.id === t.setupId);
      if (!s || (s.renders || []).some(r => r.farm === key)) continue;
      s.renders = [{ file: t.st.lightmix || t.st.file, beauty: t.st.file, lightmix: !!t.st.lightmix, v: t.v, time: t.st.end || Date.now(),
        dur: t.st.ms || (t.st.end - t.st.start) || 0, thumb: t.st.thumb || '', farm: key, node: t.st.node }, ...(s.renders || [])]
        .sort((a, b) => b.time - a.time).slice(0, 40);
      if (t.st.thumb) { s.thumb = t.st.thumb; s.thumbV = Date.now(); }
      s.v = Math.max(s.v || 0, t.v || 0);
      changed = true;
    }
  }
  if (changed) save();
}

// Consulta cada 4 s mientras se mira la red; cada 20 s en segundo plano si hay trabajos propios pendientes.
let farmTicks = 0;
setInterval(() => {
  farmTicks++;
  if (S.busy || !S.scene || !S.data || S.farm.sending || !(S.ui.farmRoot || '').trim()) return;
  const watching = S.view === 'production' && S.ui.prodTab === 'net';
  const mineActive = S.farm.jobs.some(j => j.by === S.farm.pc && (j.status === 'run' || j.status === 'wait'));
  if (watching || (mineActive && farmTicks % 5 === 0)) farmPoll(!watching);
}, 4000);

// ---------------------------------------------------------------- piezas

function versionChips(v, ref) {
  return PLUGINS.map(([k, label]) => {
    const mine = ref ? ref[k] : '';
    const val = (v || {})[k] || '';
    const bad = ref && mine && val !== mine;
    if (!val && !bad) return '';
    return `<span class="vchip ${bad ? 'bad' : ''}" title="${bad ? esc(`Este PC: ${mine || 'no instalado'}`) : ''}">${esc(label)} <b>${esc(val || 'no instalado')}</b></span>`;
  }).join('');
}

function mismatches(node, ref) {
  if (!ref || !node.versions) return [];
  return PLUGINS.filter(([k]) => ref[k] && node.versions[k] !== ref[k]).map(([k, label]) => `${label} ${node.versions[k] || 'no instalado'} (aquí ${ref[k]})`);
}

const NODE_STATE = { busy: ['Renderizando', 'run'], idle: ['Libre', 'ok'], waiting: ['En uso', 'info'], paused: ['En pausa', 'wait'], error: ['Sin 3ds Max', 'skip'], off: ['Apagado', 'wait'] };
const TASK_STATE = { wait: 'En cola', run: 'Renderizando', ok: 'Hecho', error: 'Error', cancelled: 'Cancelado' };
const JOB_STATE = { done: 'Terminado', run: 'En curso', wait: 'En cola', paused: 'En pausa', error: 'Con errores', cancelled: 'Cancelado' };

function bar(pct, cls = '') { return `<div class="mbar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></span></div>`; }

function nodeRow(n) {
  const [label, cls] = n.online ? (NODE_STATE[n.state] || [n.state, '']) : NODE_STATE.off;
  const me = n.name === S.farm.pc;
  const j = n.online && n.job;
  const el = j ? Date.now() - S.farm.polledAt + (S.farm.raw.now - j.start) : 0;
  const mode = n.settings.mode || 'idle';
  const bad = mismatches(n, S.farm.local);
  const waitTxt = n.state === 'waiting' ? (mode === 'night' ? `renderiza de ${n.settings.nightFrom} a ${n.settings.nightTo}` : `renderiza tras ${n.settings.idleMin} min sin uso`) : '';
  return `<div class="node ${n.online ? '' : 'offline'}">
    <div class="node-h">
      <span class="node-ic">${icon(me ? 'camera' : 'render')}</span>
      <div class="row-main"><span class="name">${esc(n.name)}${me ? ' <span class="muted">· este PC</span>' : ''}</span>
        <span class="meta">${n.online ? esc([n.hw && n.hw.cpu, n.hw && n.hw.ram && `${n.hw.ram} GB`, n.hw && n.hw.gpu].filter(Boolean).join('  ·  ')) : `Visto ${ago(n.seenAgo)}. Abre REA Node en ese PC.`}</span></div>
      <span class="state ${cls}">${n.state === 'busy' && n.online ? '<i class="pulse"></i>' : ''}${label}</span>
    </div>
    ${n.online ? `<div class="node-b">
      <div class="node-m"><span class="k">CPU</span>${bar(n.cpuLoad, n.cpuLoad > 85 ? 'hot' : '')}<span class="v">${n.cpuLoad}%</span></div>
      <div class="node-m"><span class="k">RAM</span>${bar(n.ramUsed / n.ramTotal * 100, n.ramUsed / n.ramTotal > .9 ? 'hot' : '')}<span class="v">${n.ramUsed} / ${n.ramTotal} GB</span></div>
      <div class="node-job">${j ? `<span class="name">${esc(j.taskName)}</span><span class="meta">${esc(j.name)}  ·  ${clock(el)}${j.est ? ` de ~${fmtDur(j.est)}` : ''}</span>`
        : `<span class="meta">${n.settings.paused ? 'En pausa: no toma trabajos' : waitTxt || 'Esperando trabajos'}</span>`}</div>
    </div>` : ''}
    <div class="node-f">
      <div class="vchips">${versionChips(n.versions, me ? null : S.farm.local)}</div>
      <span class="spacer"></span>
      <div class="seg small">${MODES.map(([k, l]) => `<button class="seg-btn ${mode === k ? 'on' : ''}" data-action="farmNodeMode" data-node="${esc(n.name)}" data-v="${k}" title="Disponibilidad">${l}</button>`).join('')}</div>
      ${btn('farmNodePause', n.settings.paused ? 'Reanudar' : 'Pausar', '', { node: n.name }, 'small')}
    </div>
    ${bad.length && !me ? `<p class="node-warn">${icon('warn')}<span>Versiones distintas a este PC: ${esc(bad.join(', '))}. Puede renderizar diferente o no abrir la escena.</span></p>` : ''}
  </div>`;
}

function taskRow(job, t, i) {
  const st = t.st.state;
  const el = st === 'run' && t.st.start ? Date.now() - S.farm.polledAt + (t.st.elapsed || 0) : 0;
  const pct = st === 'run' && t.est ? Math.min(.97, el / t.est) * 100 : 0;
  const thumb = t.st.thumb ? fileUrl(t.st.thumb) : '';
  const right = st === 'ok' ? fmtDur(t.st.ms || (t.st.end - t.st.start)) : st === 'run' && t.st.start ? clock(el) : t.est ? '~' + fmtDur(t.est) : '';
  return `<div class="prow ${st}${t.stale ? ' stale' : ''}">
    <span class="pnum">${pad2(i + 1)}</span>
    <span class="stripe" style="background:${esc(t.color)}"></span>
    ${thumb ? `<img class="pthumb" src="${esc(thumb)}" alt="" draggable="false">` : `<span class="pthumb ph">${icon(st === 'run' ? 'render' : 'image')}</span>`}
    <div class="row-main"><span class="name">${esc(t.name)}</span>
      <span class="meta" title="${esc(t.st.error || t.st.file || '')}">${esc([t.st.node, t.cam, t.res].filter(Boolean).join('  ·  '))}${t.stale ? '  ·  el nodo no responde' : ''}${t.st.error ? '  ·  ' + esc(t.st.error) : ''}</span>
      ${st === 'run' && t.est ? bar(pct) : ''}</div>
    <span class="ptime">${right}</span>
    <span class="state ${st === 'cancelled' ? 'wait' : st === 'error' ? 'skip' : st}">${st === 'run' && !t.stale ? '<i class="pulse"></i>' : ''}${TASK_STATE[st] || st}</span>
    <span class="lrow-tools">
      ${t.st.file && st === 'ok' ? ib('openFile', 'image', 'Abrir imagen', { file: t.st.lightmix || t.st.file }) + ib('showInFolder', 'folder', 'Mostrar en la carpeta', { file: t.st.lightmix || t.st.file }) : ''}
      ${st === 'run' && !t.stale ? ib('farmTaskStop', 'x', 'Detener esta imagen', { job: job.id, task: t.id }) : ''}
      ${st === 'error' || st === 'cancelled' || t.stale || st === 'ok' ? ib('farmTaskRetry', 'refresh', st === 'ok' ? 'Renderizar otra vez' : 'Reintentar', { job: job.id, task: t.id }) : ''}
      ${t.st.log ? ib('openFile', 'list', 'Ver el log', { file: t.st.log }) : ''}
    </span>
  </div>`;
}

function jobCard(job) {
  const d = new Date(job.created);
  const pct = job.n.all ? (job.n.ok / job.n.all) * 100 : 0;
  const live = job.status === 'run' || job.status === 'wait' || job.status === 'paused';
  return `<section class="panel job ${job.status}">
    <div class="job-h">
      <div class="row-main"><span class="name">${esc(job.name)}</span>
        <span class="meta">${esc(job.by)}  ·  ${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${pad2(d.getHours())}:${pad2(d.getMinutes())}  ·  ${job.pc ? 'solo ' + esc(job.pc) : 'cualquier PC'}  ·  ${job.n.ok} de ${job.n.all}</span></div>
      <span class="state ${job.status === 'done' ? 'ok' : job.status === 'error' ? 'skip' : job.status === 'run' ? 'run' : 'wait'}">${JOB_STATE[job.status]}</span>
    </div>
    ${bar(pct, 'job-bar')}
    <div class="job-tools">
      ${live ? `<span class="pri" title="Prioridad: los trabajos con más prioridad se renderizan antes">${ib('farmPriority', 'down', 'Bajar prioridad', { job: job.id, d: -10 })}<b>${job.priority}</b>${ib('farmPriority', 'up', 'Subir prioridad', { job: job.id, d: 10 })}</span>` : ''}
      <span class="spacer"></span>
      ${btn('showInFolder', 'Carpeta', 'folder', { file: job.folder + '\\' }, 'small')}
      ${live ? btn('farmJobPause', job.paused ? 'Reanudar' : 'Pausar', '', { job: job.id }, 'small') : ''}
      ${live ? btn('farmJobCancel', 'Cancelar', '', { job: job.id }, 'small') : ''}
      ${!live ? btn('farmJobDelete', 'Quitar', 'trash', { job: job.id }, 'small') : ''}
    </div>
    <div class="job-tasks">${job.tasks.map((t, i) => taskRow(job, t, i)).join('')}</div>
  </section>`;
}

function prodTabs() {
  const n = S.farm.jobs.filter(j => j.status === 'run' || j.status === 'wait').length;
  return `<div class="seg">
    <button class="seg-btn wide ${S.ui.prodTab !== 'net' ? 'on' : ''}" data-action="prodTab" data-v="local">Este PC</button>
    <button class="seg-btn wide ${S.ui.prodTab === 'net' ? 'on' : ''}" data-action="prodTab" data-v="net">Red${n ? ` <span class="nav-count">${n}</span>` : ''}</button>
  </div>`;
}

// ---------------------------------------------------------------- vista: red

function viewFarm() {
  const head = `<div class="toolbar"><h1>Producción</h1>${prodTabs()}<span class="spacer"></span>
    ${S.ui.farmRoot ? btn('showInFolder', 'Carpeta', 'folder', { file: S.ui.farmRoot.replace(/\\?$/, '\\') }) : ''}${btn('farmRefresh', '', 'refresh')}</div>`;
  if (!S.farm.polledAt && !S.farm.err) { farmPoll(); return `<div class="page">${head}${empty('Leyendo la granja…')}</div>`; }
  if (S.farm.err === 'noroot' || S.farm.err === 'unreachable') {
    return `<div class="page">${head}${empty(S.farm.err === 'noroot' ? 'Configura la granja de render' : 'No se encuentra la carpeta de la granja',
      `${S.farm.err === 'unreachable' ? `No se puede abrir <span class="mono">${esc(S.ui.farmRoot)}</span>. Comprueba que el NAS está encendido y que este PC lo ve.<br><br>` : ''}La granja es una carpeta compartida en el NAS. Elígela en Ajustes y abre <b>REA Node</b> en cada PC que vaya a renderizar.`,
      btn('goSettings', 'Ir a Ajustes', 'settings', {}, 'primary'))}</div>`;
  }
  if (S.farm.err) return `<div class="page">${head}${empty('No se pudo leer la granja', esc(S.farm.err), btn('farmRefresh', 'Reintentar', 'refresh', {}, 'primary'))}</div>`;
  const nodes = S.farm.nodes;
  const online = nodes.filter(n => n.online);
  const jobs = S.farm.jobs;
  const active = jobs.filter(j => j.status !== 'done' && j.status !== 'cancelled');
  const done = jobs.filter(j => j.status === 'done' || j.status === 'cancelled');
  const mine = nodes.find(n => n.name === S.farm.pc);
  const startMine = !mine || !mine.online ? `<section class="panel pad start-node"><div class="form-row"><div><strong>El nodo de este PC está cerrado</strong>
      <p class="hint">Ábrelo para que este PC renderice trabajos de la red. Marca «Iniciar con Windows» en su menú (el punto junto al reloj) para que se abra solo.</p></div>
      ${btn('farmStartNode', 'Abrir nodo en este PC', 'play', {}, 'primary')}</div></section>` : '';
  return `<div class="page">
    ${head}
    ${startMine}
    <h2>Nodos <span class="count">${online.length} de ${nodes.length} conectados</span></h2>
    ${nodes.length ? `<div class="nodes">${nodes.map(nodeRow).join('')}</div>`
      : `<section class="panel pad"><p class="hint" style="margin:0">Ningún PC conectado. En cada PC que vaya a renderizar, abre <b>iniciar_nodo.bat</b> (viene en el zip del plugin). Aparece un punto junto al reloj de Windows.</p></section>`}
    <h2>Cola <span class="count">${active.length ? plural(active.length, 'trabajo', 'trabajos') : 'vacía'}</span></h2>
    ${active.length ? active.map(jobCard).join('') : `<section class="panel pad"><p class="hint" style="margin:0">No hay trabajos pendientes. Envíalos desde Render → <b>Enviar a la red</b>.</p></section>`}
    ${done.length ? `<h2>Terminados</h2>${done.slice(0, 8).map(jobCard).join('')}` : ''}
  </div>`;
}

// ---------------------------------------------------------------- vista: enviar a la red

function submitChecks(sets) {
  const out = [];
  const folder = (S.data.batch.folder || '').trim() || S.scene.defaultFolder;
  if (S.farm.err === 'unreachable' || S.farm.err === 'noroot') out.push(['bad', 'No se encuentra la carpeta de la granja. Revísala en Ajustes.']);
  const online = S.farm.nodes.filter(n => n.online);
  if (!S.farm.err && !online.length) out.push(['warn', 'Ningún nodo conectado ahora. El trabajo se quedará en cola hasta que se abra REA Node en algún PC.']);
  online.forEach(n => { const m = mismatches(n, S.farm.local); if (m.length && n.name !== S.farm.pc) out.push(['warn', `${n.name} tiene versiones distintas: ${m.join(', ')}.`]); });
  if (!isUnc(folder)) out.push(['warn', `La carpeta de salida (${folder}) no es de red. Cada PC guardará en su propia carpeta con esa ruta; usa una carpeta del NAS para tener todo junto.`]);
  if (!S.scene.file) out.push(['warn', 'La escena no tiene nombre. Guárdala antes para reconocer el trabajo.']);
  const noCam = sets.filter(s => !s.comp.camera.on || !s.comp.camera.name);
  if (noCam.length) out.push(['warn', `Sin cámara (no se envían): ${noCam.map(s => s.name).join(', ')}.`]);
  return out;
}

function viewSubmit() {
  if (S.farm.form) readSubmitForm();
  const f = S.farm.form || (S.farm.form = { name: (S.scene.file || 'Escena').replace(/\.max$/i, ''), priority: 50, pc: '', ids: S.data.setups.filter(s => s.batch).map(s => s.id) });
  const sets = S.data.setups.filter(s => f.ids.includes(s.id));
  const send = sets.filter(s => s.comp.camera.on && s.comp.camera.name);
  const checks = submitChecks(sets);
  const blocked = checks.some(c => c[0] === 'bad') || !send.length;
  const est = send.reduce((a, s) => a + estimateFor(s, []), 0);
  const nodes = S.farm.nodes;
  return `<div class="page narrow">
    <div class="toolbar"><button class="ib" data-action="goRender" title="Volver">${icon('back')}</button><h1>Enviar a la red</h1></div>
    <section class="panel pad">
      <div class="form-row"><span>Nombre</span><div class="line"><input type="text" id="farmName" value="${esc(f.name)}" spellcheck="false"></div></div>
      <div class="form-row"><div><span>Prioridad</span><p class="hint">Los trabajos con más prioridad se renderizan antes.</p></div>
        <div class="line range"><input type="range" id="farmPri" min="1" max="100" value="${f.priority}"><output>${f.priority}</output></div></div>
      <div class="form-row"><span>Renderizar en</span>
        <select id="farmPc"><option value="">Cualquier PC libre</option>${nodes.map(n => `<option value="${esc(n.name)}" ${f.pc === n.name ? 'selected' : ''}>${esc(n.name)}${n.name === S.farm.pc ? ' (este PC)' : ''}${n.online ? '' : ' · apagado'}</option>`).join('')}</select></div>
    </section>
    <h2>Imágenes <span class="count">${send.length}</span></h2>
    <section class="panel">${S.data.setups.map(s => `<label class="lrow">
        <input type="checkbox" class="chk" data-action="farmPick" data-id="${s.id}" ${f.ids.includes(s.id) ? 'checked' : ''}>
        <span class="stripe" style="background:${esc(s.color)}"></span>${thumbHtml(s, 'sm')}
        <div class="row-main"><span class="name">${esc(s.name)}</span><span class="meta">${esc(metaText(s))}</span></div>
        <span class="ptime">${estimateFor(s, []) ? '~' + fmtDur(estimateFor(s, [])) : ''}</span>
      </label>`).join('')}</section>
    ${S.farm.sendError ? `<section class="panel pad checks"><p class="check bad">${icon('warn')}<span><b>No se pudo enviar:</b> ${esc(S.farm.sendError)}</span></p></section>` : ''}
    ${checks.length ? `<section class="panel pad checks">${checks.map(([k, t]) => `<p class="check ${k}">${icon('warn')}<span>${esc(t)}</span></p>`).join('')}</section>` : ''}
    <p class="hint">Se guarda una copia de la escena en la granja: puedes seguir trabajando y cambiarla sin afectar a lo enviado. La salida usa la carpeta, el nombre y el formato de Render.${est ? ` Tiempo total estimado: ~${fmtDur(est)}.` : ''}</p>
    <div class="cta"><button class="btn primary big" data-action="farmSubmit" ${blocked || S.farm.sending ? 'disabled' : ''}>${icon('render')}<span>${S.farm.sending ? 'Enviando…' : `Enviar ${plural(send.length, 'imagen', 'imágenes')}`}</span></button></div>
  </div>`;
}

function readSubmitForm() {
  const f = S.farm.form;
  if (!f) return;
  const n = $('#farmName'); if (n) f.name = n.value.trim() || f.name;
  const p = $('#farmPri'); if (p) f.priority = +p.value;
  const c = $('#farmPc'); if (c) f.pc = c.value;
}

async function farmSubmit() {
  readSubmitForm();
  const f = S.farm.form;
  const root = S.ui.farmRoot.trim();
  const sets = S.data.setups.filter(s => f.ids.includes(s.id) && s.comp.camera.on && s.comp.camera.name);
  if (!sets.length) return;
  const folder = (S.data.batch.folder || '').trim() || S.scene.defaultFolder;
  const ext = S.data.batch.fmt;
  const d = new Date();
  const id = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}_${Math.random().toString(36).slice(2, 6)}`;
  S.farm.sending = true;
  S.farm.sendError = '';
  render();
  try {
    const tasks = [];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const v = await nextVersion(s, folder, ext);
      s.v = v;  // la version queda reservada para no repetir nombre
      const base = fileBase(s, v);
      const res = s.comp.res.on ? `${s.comp.res.w} × ${s.comp.res.h}` : `${S.scene.res.w} × ${S.scene.res.h}`;
      tasks.push({ id: 't' + pad2(i + 1), setupId: s.id, name: s.name, color: s.color, cam: s.comp.camera.name, res, est: estimateFor(s, []), v, base,
        text: [folder, s.name, base, ext, S.data.batch.lightmix !== false ? '1' : '0', ...opsFor(s)].join('\n') });
    }
    const job = { id, name: f.name, created: Date.now(), by: S.farm.pc, scene: S.scene.file, sceneDir: S.scene.filePath, priority: f.priority, pc: f.pc,
      folder, ext, versions: S.farm.local || {}, tasks: tasks.map(({ text, ...t }) => t) };
    await Bridge.call('farmSubmit', root, id, JSON.stringify(job), ...tasks.flatMap(t => [t.id, t.text]));
    save();
    S.farm.form = null;
    S.ui.prodTab = 'net'; saveUi();
    S.view = 'production';
    toast(`Enviado a la red: ${plural(tasks.length, 'imagen', 'imágenes')}`, 'ok');
    await farmPoll(true);
  } catch (err) {
    S.farm.sendError = err.message;
    toast('No se pudo enviar: ' + err.message, 'error');
  } finally {
    S.farm.sending = false;
    render();
  }
}

// ---------------------------------------------------------------- acciones

const findJob = id => S.farm.jobs.find(j => j.id === id);
const fileOp = (op, rel, txt = '') => Bridge.call('farmFile', S.ui.farmRoot.trim(), op, rel, txt);

function jobJson(job) {
  const { dir, paused, cancelled, n, status, ...rest } = job;
  rest.tasks = job.tasks.map(({ st, stale, ...t }) => t);
  return JSON.stringify(rest);
}

async function farmDo(fn) {
  try { await fn(); } catch (err) { toast(err.message, 'error'); }
  await farmPoll();
}

Object.assign(A, {
  prodTab(el) { S.ui.prodTab = el.dataset.v; saveUi(); if (el.dataset.v === 'net') farmPoll(); render(); },
  farmRefresh() { return farmPoll(); },
  async farmStartNode() {
    await Bridge.call('startNode');
    toast('Abriendo REA Node… aparecerá en unos segundos.', 'ok');
    setTimeout(() => farmPoll(), 6000);
  },
  goSettings() { S.view = 'settings'; render(); },
  async goSubmit() {
    S.farm.form = null;
    S.farm.sendError = '';
    S.view = 'submit';
    render();
    if (!S.farm.local) S.farm.local = await Bridge.call('versions').catch(() => null);
    await farmPoll();
  },
  farmPick(el) { readSubmitForm(); const f = S.farm.form; f.ids = el.checked ? [...f.ids, el.dataset.id] : f.ids.filter(x => x !== el.dataset.id); render(); },
  farmSubmit() { return farmSubmit(); },
  farmJobPause(el) { const j = findJob(el.dataset.job); return farmDo(() => fileOp(j.paused ? 'unflag' : 'flag', farmRel('jobs', j.id, 'pause.flag'))); },
  farmJobCancel(el) {
    const j = findJob(el.dataset.job);
    if (!confirm(`¿Cancelar «${j.name}»? Las imágenes que se están renderizando se detienen.`)) return;
    return farmDo(() => fileOp('flag', farmRel('jobs', j.id, 'cancel.flag')));
  },
  farmJobDelete(el) {
    const j = findJob(el.dataset.job);
    if (!confirm(`¿Quitar «${j.name}» de la lista? Las imágenes renderizadas no se borran.`)) return;
    return farmDo(() => fileOp('rmdir', farmRel('jobs', j.id)));
  },
  farmPriority(el) {
    const j = findJob(el.dataset.job);
    j.priority = Math.max(1, Math.min(100, j.priority + (+el.dataset.d)));
    return farmDo(() => fileOp('write', farmRel('jobs', j.id, 'job.json'), jobJson(j)));
  },
  farmTaskStop(el) { return farmDo(() => fileOp('flag', farmRel('jobs', el.dataset.job, 'tasks', el.dataset.task + '.stop'))); },
  farmTaskRetry(el) {
    const j = findJob(el.dataset.job);
    return farmDo(async () => {
      if (j.cancelled) {
        // reactivar un trabajo cancelado: vuelven a la cola las imagenes canceladas
        await fileOp('unflag', farmRel('jobs', j.id, 'cancel.flag'));
      }
      for (const ext of ['.json', '.claim', '.txt.result', '.stop']) await fileOp('delete', farmRel('jobs', j.id, 'tasks', el.dataset.task + ext));
    });
  },
  farmNodeMode(el) {
    const n = S.farm.nodes.find(x => x.name === el.dataset.node);
    const s = Object.assign({}, n.settings, { mode: el.dataset.v });
    return farmDo(() => fileOp('write', farmRel('nodes', n.name + '.settings.json'), JSON.stringify(s)));
  },
  farmNodePause(el) {
    const n = S.farm.nodes.find(x => x.name === el.dataset.node);
    const s = Object.assign({}, n.settings, { paused: !n.settings.paused });
    return farmDo(() => fileOp('write', farmRel('nodes', n.name + '.settings.json'), JSON.stringify(s)));
  },
  async farmPickRoot() {
    const f = await Bridge.call('browseFolder', S.ui.farmRoot || '');
    if (!f) return;
    S.ui.farmRoot = f; saveUi();
    await Bridge.call('farmSetRoot', f).catch(() => {});
    S.farm.polledAt = 0; S.farm.err = ''; S.farm.seen = null;
    render();
  },
});

document.addEventListener('input', e => {
  if (e.target.id === 'farmPri') { const o = e.target.parentNode.querySelector('output'); if (o) o.textContent = e.target.value; }
});

VIEWS.submit = viewSubmit;
