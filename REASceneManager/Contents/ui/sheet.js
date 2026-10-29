// Hoja de contactos en PDF con el diseño de presentacion de LAP.
// Construye las paginas en HTML (sheet.css) y 3ds Max las imprime a PDF con WebView2.

function sheetDefaults() {
  return {
    project: (S.scene && S.scene.file ? S.scene.file.replace(/\.max$/i, '') : 'Proyecto').replace(/[_-]+/g, ' '),
    subtitle: 'Renders',
    client: '', type: '', place: '',
    layout: 'n6', full: true, include: {},
  };
}

function sheetOpts() {
  S.data.sheet = Object.assign(sheetDefaults(), S.data.sheet || {});
  return S.data.sheet;
}

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Ultimo render de cada setup incluido, en el orden de la lista.
function sheetItems() {
  const o = sheetOpts();
  return S.data.setups
    .filter(s => (s.renders || []).length && o.include[s.id] !== false)
    .map(s => ({ s, r: s.renders[0] }));
}

function lpHeader(n, photo) {
  return `<div class="lp-tags"><div class="lp-tag t1">Left Angle Partnership</div><div class="lp-tag t2">Oficina de arquitectura</div></div>
    <div class="lp-num">/ ${pad2(n)}</div>`;
}
const lpLap = () => '<div class="lp-lap l">L</div><div class="lp-lap a">A</div><div class="lp-lap p">P</div>';
const lpContact = () => `<div class="lp-logo"></div>
  <div class="lp-contact k1">LAP<br>admin@laparq.com<br>www.laparq.com</div>
  <div class="lp-contact k2">Carrera 10 #72-66, Of. 902<br>Bogotá, Colombia<br>110221</div>`;

// srcOf(item) -> url de la imagen (miniatura en la vista previa, alta resolucion al exportar)
function sheetPages(srcOf) {
  const o = sheetOpts();
  const items = sheetItems();
  const d = new Date();
  const date = `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  const per = { n6: 6, n4: 4, n2: 2 }[o.layout] || 6;
  const pages = [];
  let n = 1;
  const info = [
    [o.client || 'Cliente', o.place || '', ''],
    [o.type || 'Renders', `${items.length} ${items.length === 1 ? 'imagen' : 'imágenes'}`, ''],
    ['Contenido', 'Hoja de contactos', o.full ? 'Imágenes a página completa' : ''],
  ];
  pages.push(`<section class="lp blue">
    <div class="lp-cover-title">${esc(o.project)}</div>
    <div class="lp-cover-date" style="top:${52 + 36 * Math.max(1, Math.ceil(o.project.length / 28))}pt"><span class="lp-slash">//</span>${esc(date)}</div>
    ${info.map((c, i) => `<div class="lp-info c${i + 1}"><b>${esc(c[0])}</b><br>${c.slice(1).filter(Boolean).map(esc).join('<br>')}</div>`).join('')}
    <div class="lp-rule" style="top:172pt;border-color:rgba(255,255,255,.9)"></div>
    ${lpContact()}
  </section>`);
  n++;
  pages.push(`<section class="lp">${lpHeader(n)}
    <div class="lp-chapter">Renders</div>
    <div class="lp-sub"><span class="lp-slash">//</span>${esc(o.subtitle)}</div>
    <div class="lp-rule" style="top:172pt"></div>${lpLap()}
  </section>`);
  n++;
  for (let i = 0; i < items.length; i += per) {
    const chunk = items.slice(i, i + per);
    pages.push(`<section class="lp">${lpHeader(n)}
      <div class="lp-title">${esc(o.subtitle)}</div>
      <div class="lp-rule" style="top:92pt"></div>
      <div class="lp-grid ${o.layout}">${chunk.map((it, k) => {
        const c = it.s.comp;
        return `<div class="lp-cell">
          <div class="lp-label"><span class="n">${pad2(i + k + 1)} /</span><span>${esc(it.s.name)}</span></div>
          <div class="lp-img" style="background-image:url('${esc(srcOf(it))}')"></div>
          <div class="lp-meta"><span>CÁMARA:</span> ${esc(c.camera.name || '—')} &nbsp; <span>VERSIÓN:</span> v${pad2(it.r.v)}${c.res.on ? ` &nbsp; <span>RESOLUCIÓN:</span> ${c.res.w} × ${c.res.h}` : ''}</div>
        </div>`;
      }).join('')}</div>
    </section>`);
    n++;
  }
  if (o.full) {
    items.forEach((it, k) => {
      pages.push(`<section class="lp photo">
        <div class="lp-full" style="background-image:url('${esc(srcOf(it))}')"></div><div class="lp-shade"></div>
        ${lpHeader(n, true)}
        <div class="lp-title">${esc(it.s.name)}</div>
        <div class="lp-rule" style="top:92pt;border-color:rgba(255,255,255,.85)"></div>
        <div class="lp-photo-meta">${pad2(k + 1)} / ${pad2(items.length)}</div>
      </section>`);
      n++;
    });
  }
  pages.push(`<section class="lp blue">
    <div class="lp-big l">L</div><div class="lp-big a">A</div><div class="lp-big p">P</div>
    <div class="lp-rule" style="top:172pt;border-color:rgba(255,255,255,.9)"></div>
    ${lpContact()}
  </section>`);
  return pages;
}

function viewSheet() {
  const o = sheetOpts();
  const withRenders = S.data.setups.filter(s => (s.renders || []).length);
  const pages = sheetPages(it => fileUrl(/\.(png|jpe?g)$/i.test(it.r.file) ? it.r.file : it.r.thumb));
  const field = (k, label, ph = '') => `<label class="stack-label"><span>${label}</span><input type="text" data-scope="data" data-field="sheet.${k}" value="${esc(o[k])}" placeholder="${esc(ph)}"></label>`;
  return `<div class="page wide">
    <div class="toolbar">${ib('goResults', 'back', 'Volver a Resultados')}<h1>Hoja de contactos</h1><span class="count">${pages.length} páginas</span><span class="spacer"></span>
      ${btn('exportSheet', S.pdfBusy ? 'Generando PDF…' : 'Exportar PDF', 'render', {}, 'primary')}</div>
    <div class="sheet-layout">
      <section class="panel pad sheet-form">
        ${field('project', 'Proyecto')}${field('subtitle', 'Subtítulo', 'Renders')}
        ${field('client', 'Cliente')}${field('type', 'Tipo de proyecto')}${field('place', 'Ubicación')}
        <div class="form-row"><span>Imágenes por página</span>
          <div class="seg">${[['n6', '6'], ['n4', '4'], ['n2', '2']].map(([v, l]) => `<button class="seg-btn ${o.layout === v ? 'on' : ''}" data-action="sheetLayout" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="form-row"><span>Una página por render</span>${toggle(o.full, 'sheetFull')}</div>
        <h2 style="margin:10px 0 0">Setups</h2>
        <div class="items">${withRenders.map(s => `<label class="item check"><input type="checkbox" class="chk" data-action="sheetInclude" data-id="${s.id}" ${o.include[s.id] !== false ? 'checked' : ''}><span class="name">${esc(s.name)}</span><span class="meta muted">v${pad2(s.renders[0].v)}</span></label>`).join('') || '<p class="hint">Aún no hay renders.</p>'}</div>
        <p class="hint">Usa el último render de cada setup. Tipografía Whyte: instálala en Windows o copia los .ttf en la carpeta fonts del plugin.</p>
      </section>
      <div class="sheet-preview" style="--k:${S.sheetK || 0.42}">${pages.map(p => `<div class="sheet-page lapdoc">${p}</div>`).join('')}</div>
    </div>
  </div>`;
}

async function exportSheet() {
  const items = sheetItems();
  if (!items.length) return toast('No hay renders para la hoja de contactos.', 'warn');
  S.pdfBusy = true; render();
  try {
    // imagenes en alta resolucion: png/jpg tal cual; exr/tif se convierten a jpg
    const hi = {};
    for (const it of items) {
      hi[it.r.file] = /\.(png|jpe?g)$/i.test(it.r.file) ? it.r.file
        : await Bridge.call('exportJpg', it.r.file, `${it.s.id}_v${it.r.v}`, 3200).catch(() => it.r.thumb);
    }
    const root = document.getElementById('printRoot');
    root.className = 'lapdoc';
    root.innerHTML = sheetPages(it => fileUrl(hi[it.r.file] || it.r.thumb)).join('');
    await Promise.all([...root.querySelectorAll('[style*="background-image"]')].map(el => new Promise(res => {
      const m = /url\('([^']+)'\)/.exec(el.getAttribute('style'));
      if (!m) return res();
      const img = new Image(); img.onload = img.onerror = res; img.src = m[1];
    })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const o = sheetOpts();
    const d = new Date();
    const folder = (S.data.batch.folder || '').trim() || S.scene.defaultFolder;
    const path = `${folder}\\${safeName(o.project)}_Renders_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.pdf`;
    if (!Bridge.isHost) { window.print(); return; }
    await Bridge.call('printPdf', path, 17, 11);
    let st = 'busy';
    for (let i = 0; i < 240 && st === 'busy'; i++) {
      await new Promise(r => setTimeout(r, 500));
      st = await Bridge.call('pdfStatus');
    }
    if (st === 'ok') {
      toast('PDF guardado: ' + path, 'ok');
      Bridge.call('openFile', path).catch(() => {});
    } else toast('No se pudo generar el PDF (' + st + ').', 'error');
  } finally {
    S.pdfBusy = false;
    render();
  }
}
