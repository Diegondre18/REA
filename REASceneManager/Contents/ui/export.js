// Exportar para el cliente: JPG ligeros, con el tamaño elegido y el logo LAP opcional.
// 3ds Max hace la conversión (scripts/REASM_variants.ms, REASM_clientExport).

const EXPORT_PRESETS = [
  ['original', 'Original', 0, 92],
  ['web', 'Web', 2560, 85],
  ['whatsapp', 'WhatsApp', 1600, 80],
  ['instagram', 'Instagram', 1080, 85],
];
const LOGO_POS = [['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']];

function exportOpts() {
  S.data.export = Object.assign({ preset: 'web', maxSide: 2560, quality: 85, logo: 'white', pos: 'br', size: 14, opacity: 0.85, folder: '', include: {} }, S.data.export || {});
  return S.data.export;
}

function exportItems() {
  const o = exportOpts();
  return S.data.setups.filter(s => (s.renders || []).length).map(s => ({ s, r: s.renders[0], on: o.include[s.id] !== false }));
}

function exportFolder() {
  const o = exportOpts();
  const d = new Date();
  const base = (S.data.batch.folder || '').trim() || S.scene.defaultFolder;
  return (o.folder || '').trim() || `${base}\\Cliente_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function viewExport() {
  const o = exportOpts();
  const items = exportItems();
  const n = items.filter(i => i.on).length;
  const logoStyle = `--lw:${o.size}%;--lo:${o.opacity};`;
  const tiles = items.map(({ s, r, on }) => `<div class="result ${on ? '' : 'off'}">
      <div class="thumb exp" data-action="exportInclude" data-id="${s.id}">
        ${r.thumb ? `<img src="${esc(fileUrl(r.thumb))}" alt="" draggable="false">` : `<span class="thumb-ph">${icon('image')}</span>`}
        ${o.logo ? `<span class="wm ${o.pos} ${o.logo}" style="${logoStyle}"></span>` : ''}
        <input type="checkbox" class="chk ${on ? 'is-on' : ''}" ${on ? 'checked' : ''} tabindex="-1">
      </div>
      <div class="tile-info"><div class="row-main"><span class="name">${esc(s.name)}</span><span class="meta">v${pad2(r.v)}${r.lightmix ? '  ·  LightMix' : ''}</span></div></div>
    </div>`).join('');
  return `<div class="page wide">
    <div class="toolbar"><button class="ib" data-action="goResults" title="Volver">${icon('back')}</button><h1>Exportar para cliente</h1>
      <span class="count">${n} de ${items.length}</span><span class="spacer"></span>
      <button class="btn primary" data-action="runExport" ${!n || S.exporting ? 'disabled' : ''}>${icon('up')}<span>${S.exporting ? 'Exportando…' : `Exportar ${plural(n, 'imagen', 'imágenes')}`}</span></button></div>
    <div class="export-grid">
      <section class="panel pad export-opts">
        <div class="form-row"><span>Tamaño</span>
          <div class="seg">${EXPORT_PRESETS.map(([k, l]) => `<button class="seg-btn ${o.preset === k ? 'on' : ''}" data-action="exportPreset" data-v="${k}">${l}</button>`).join('')}</div></div>
        <p class="hint">${o.maxSide ? `Lado largo ${o.maxSide} px` : 'Tamaño original del render'}  ·  calidad JPG ${o.quality}</p>
        <div class="form-row"><span>Lado largo (px)</span><input type="number" class="short" min="0" step="10" data-scope="data" data-field="export.maxSide" data-type="int" value="${o.maxSide}"></div>
        <div class="form-row"><span>Calidad</span><div class="line range"><input type="range" min="40" max="100" data-scope="data" data-field="export.quality" data-type="int" value="${o.quality}" id="expQ"><output>${o.quality}</output></div></div>
        <h3>Logo LAP</h3>
        <div class="seg full">
          <button class="seg-btn ${!o.logo ? 'on' : ''}" data-action="exportLogo" data-v="">Sin logo</button>
          <button class="seg-btn ${o.logo === 'white' ? 'on' : ''}" data-action="exportLogo" data-v="white">Blanco</button>
          <button class="seg-btn ${o.logo === 'black' ? 'on' : ''}" data-action="exportLogo" data-v="black">Negro</button>
        </div>
        ${o.logo ? `<div class="form-row"><span>Posición</span><div class="seg">${LOGO_POS.map(([k, l]) => `<button class="seg-btn ${o.pos === k ? 'on' : ''}" data-action="exportPos" data-v="${k}" title="${l}">${l}</button>`).join('')}</div></div>
        <div class="form-row"><span>Tamaño del logo</span><div class="line range"><input type="range" min="6" max="40" data-scope="data" data-field="export.size" data-type="int" value="${o.size}" id="expSize"><output>${o.size}%</output></div></div>
        <div class="form-row"><span>Opacidad</span><div class="line range"><input type="range" min="0.2" max="1" step="0.05" data-scope="data" data-field="export.opacity" data-type="float" value="${o.opacity}" id="expOp"><output>${Math.round(o.opacity * 100)}%</output></div></div>` : ''}
        <h3>Carpeta</h3>
        <div class="line"><input type="text" data-scope="data" data-field="export.folder" value="${esc(o.folder)}" placeholder="${esc(exportFolder())}">${ib('exportBrowse', 'folder', 'Elegir carpeta', {}, 'boxed')}</div>
        <p class="hint">Se usa el último render de cada setup (el LightMix si lo hay). Los archivos se llaman como el setup y su versión: <span class="mono">Lobby_v03.jpg</span>.</p>
      </section>
      <div class="tiles">${tiles || empty('Todavía no hay renders')}</div>
    </div>
  </div>`;
}

async function runExport() {
  const o = exportOpts();
  const items = exportItems().filter(i => i.on);
  const folder = exportFolder();
  S.exporting = true;
  render();
  let ok = 0, first = '';
  try {
    for (const { s, r } of items) {
      const dest = `${folder}\\${safeName(s.name)}_v${pad2(r.v)}.jpg`;
      try {
        const res = await Bridge.call('clientExport', r.file, dest, o.maxSide || 0, o.quality, o.logo || '', o.pos, o.size, o.opacity);
        ok++;
        if (!first) first = res.file;
      } catch (err) { toast(`${s.name}: ${err.message}`, 'error'); }
    }
  } finally {
    S.exporting = false;
    render();
  }
  if (ok) {
    toast(`${plural(ok, 'imagen exportada', 'imágenes exportadas')} en ${folder}`, 'ok');
    Bridge.call('showInFolder', first).catch(() => {});
  }
}

Object.assign(A, {
  goResults() { S.view = 'results'; render(); },
  exportInclude(el) { const o = exportOpts(); mutate(() => { o.include[el.dataset.id] = o.include[el.dataset.id] === false; }); },
  exportPreset(el) {
    const p = EXPORT_PRESETS.find(x => x[0] === el.dataset.v);
    const o = exportOpts();
    mutate(() => { o.preset = p[0]; o.maxSide = p[2]; o.quality = p[3]; });
  },
  exportLogo(el) { const o = exportOpts(); mutate(() => { o.logo = el.dataset.v; }); },
  exportPos(el) { const o = exportOpts(); mutate(() => { o.pos = el.dataset.v; }); },
  async exportBrowse() {
    const f = await Bridge.call('browseFolder', exportFolder());
    if (f) { const o = exportOpts(); mutate(() => { o.folder = f; }); }
  },
  runExport() { return runExport(); },
});

// vista previa en vivo de los deslizadores (sin redibujar toda la pantalla)
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id !== 'expQ' && id !== 'expSize' && id !== 'expOp') return;
  const out = e.target.parentNode.querySelector('output');
  const v = +e.target.value;
  if (out) out.textContent = id === 'expQ' ? v : id === 'expSize' ? v + '%' : Math.round(v * 100) + '%';
  document.querySelectorAll('.wm').forEach(w => {
    if (id === 'expSize') w.style.setProperty('--lw', v + '%');
    if (id === 'expOp') w.style.setProperty('--lo', v);
  });
});

VIEWS.export = viewExport;
