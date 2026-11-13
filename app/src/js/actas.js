// Actas de obra (Arquitectura y Diseño Interior): numeradas por proyecto, con asistentes, avance, temas,
// compromisos (los del equipo se vuelven tareas), pendientes del acta anterior, fotos, firmas y PDF con marca LAP.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks } = L;
  const { useState, useEffect, useRef } = hooks;
  const q = () => L.q;
  const act = () => L.act;
  const Icon = (p) => html`<${L.Icon} ...${p} />`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const actasOf = (pid) => L.state.actas.filter((a) => a.proyecto === pid).sort((a, b) => (b.numero || 0) - (a.numero || 0));
  const openCount = (a) => (a.compromisos || []).filter((c) => !c.hecho).length + q().fromOrigin("acta:" + a.id).filter((t) => t.status !== "terminado").length;

  async function nuevaActa(project) {
    const prev = actasOf(project.id)[0];
    const rec = await act().save("actas", null, {
      proyecto: project.id, fecha: L.todayIso(), estado: "borrador", by: L.state.me.id,
      lugar: prev ? prev.lugar || "" : "", avance: prev ? prev.avance || 0 : 0,
      equipo: prev && prev.equipo && prev.equipo.length ? prev.equipo : [L.state.me.id],
      asistentes: prev ? (prev.asistentes || []).map((x) => ({ ...x })) : [],
      compromisos: [], fotosNotas: {}, firmas: [],
    });
    if (rec) L.go("#acta/" + rec.id);
  }

  // Lista de actas dentro de la pestaña Obra del proyecto.
  function ActasSection({ project }) {
    const s = L.useStore();
    const list = actasOf(project.id);
    return html`<${L.Panel} title="Actas de obra" cls="span-12" action=${html`<button type="button" class="btn sm primary" onClick=${() => nuevaActa(project)}><${Icon} name="plus" size=${12} /> Nueva acta</button>`}>
      <div class="rows">${list.length ? list.map((a) => {
        const n = openCount(a);
        return html`<a class="row" key=${a.id} href=${"#acta/" + a.id}>
          <span class=${L.cx("acta-num mono", a.estado === "cerrada" && "closed")}>#${a.numero || "–"}</span>
          <div class="row-main"><div class="row-title">Acta de obra #${a.numero || ""} · ${L.fmtLong(a.fecha)}</div>
            <div class="row-meta"><span>${a.estado === "cerrada" ? "Cerrada" : "Borrador"}</span><span>${a.avance || 0}% de avance</span>${n > 0 && html`<span class="due soon">${L.plural(n, "compromiso abierto", "compromisos abiertos")}</span>`}${(a.fotos || []).length > 0 && html`<span>${L.plural(a.fotos.length, "foto", "fotos")}</span>`}</div></div>
          <div class="row-side"><${L.Faces} ids=${a.equipo || []} max=${4} /></div>
        </a>`;
      }) : html`<p class="note">Cada visita o comité de obra queda como acta numerada: asistentes, avance, temas, compromisos con responsable, fotos y firmas. Se descarga en PDF con la marca LAP para el cliente.</p>`}</div>
    <//>`;
  }

  /* ---------- un acta ---------- */
  const FIELDS = ["fecha", "hora", "lugar", "clima", "avance", "temas", "observaciones", "equipo", "asistentes", "compromisos", "fotosNotas"];
  function ActaView({ id }) {
    const s = L.useStore();
    const a = s.actas.find((x) => x.id === id);
    const [f, setF] = useState(() => (a ? pick(a) : null));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState("");
    const timer = useRef(0);
    const fRef = useRef(f); fRef.current = f;
    useEffect(() => { if (a && !dirty) setF(pick(a)); }, [a && a.updated]);
    useEffect(() => () => { clearTimeout(timer.current); if (dirtyRef.current) flush(); }, []);
    const dirtyRef = useRef(false); dirtyRef.current = dirty;
    if (!a || !f) return html`<div class="glass"><${L.Empty} title="Esta acta ya no existe"><a class="btn" href="#proyectos">Ver proyectos</a><//></div>`;
    const p = q().project(a.proyecto);
    const closed = a.estado === "cerrada";
    const admin = q().isDirector();
    const edit = !closed || admin;
    function pick(r) { const o = {}; FIELDS.forEach((k) => { o[k] = r[k] == null ? (["equipo", "asistentes", "compromisos"].includes(k) ? [] : k === "fotosNotas" ? {} : "") : r[k]; }); return o; }
    async function flush() {
      const cur = fRef.current;
      if (!cur) return;
      setSaving(true);
      const patch = {};
      FIELDS.forEach((k) => { patch[k] = cur[k]; });
      patch.avance = Math.max(0, Math.min(100, Number(cur.avance) || 0));
      await act().save("actas", id, patch);
      setSaving(false); setDirty(false);
    }
    const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); clearTimeout(timer.current); timer.current = setTimeout(flush, 900); };
    const prev = actasOf(a.proyecto).find((x) => (x.numero || 0) < (a.numero || 0));
    const people = [...new Set([p && p.leader, p && p.apoyo, ...((p && p.members) || []), ...q().staff().map((u) => u.id)].filter(Boolean))];

    // Asistentes externos
    const setAsis = (i, k, v) => set("asistentes", f.asistentes.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
    // Compromisos de contratistas o cliente
    const setComp = (cid, patch) => set("compromisos", f.compromisos.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
    const addComp = (c = {}) => set("compromisos", [...f.compromisos, { id: uid(), texto: "", resp: "", fecha: L.iso(L.addDays(L.today(), 7)), hecho: false, ...c }]);
    const prevOpen = prev ? (prev.compromisos || []).filter((c) => !c.hecho && !f.compromisos.some((x) => x.desde === prev.id + ":" + c.id)) : [];
    const prevTasks = prev ? q().fromOrigin("acta:" + prev.id).filter((t) => t.status !== "terminado") : [];

    const addFotos = async () => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = "image/*"; i.multiple = true;
      i.onchange = async () => {
        const files = [...(i.files || [])];
        if (!files.length) return;
        L.toast(files.length === 1 ? "Subiendo la foto…" : `Subiendo ${files.length} fotos…`);
        const fd = new FormData();
        for (const file of files) fd.append("fotos+", await L.compressImage(file, 1600));
        await act().save("actas", id, fd);
      };
      i.click();
    };
    const delFoto = (name) => { act().save("actas", id, { "fotos-": [name] }); const n = { ...f.fotosNotas }; delete n[name]; set("fotosNotas", n); };
    const cerrar = async () => {
      setConfirm("");
      clearTimeout(timer.current);
      await flush();
      if (await act().save("actas", id, { estado: "cerrada" })) L.toast("Acta cerrada. Ya puedes descargar el PDF.");
    };
    const borrar = async () => { if (await act().remove("actas", id)) { L.toast("Acta borrada"); L.go("#proyecto/" + a.proyecto + "/obra"); } };
    const firmas = a.firmas || [];

    return html`
      <${L.PageHead} eyebrow=${html`<a href="#proyectos">Proyectos</a> · <a href=${"#proyecto/" + a.proyecto + "/obra"}>${p ? (p.code ? p.code + " · " : "") + p.name : "Proyecto"}</a>`}
        title=${"Acta de obra #" + (a.numero || "")} sub=${(closed ? "Cerrada" : "Borrador") + " · " + L.fmtLong(f.fecha || a.fecha) + (a.by ? " · la lleva " + q().name(a.by) : "") + (saving ? " · guardando…" : dirty ? " · cambios sin guardar" : "")}>
        <button type="button" class="btn" onClick=${async () => { if (dirty) await flush(); pdf(id); }}><${Icon} name="pdf" /> Descargar PDF</button>
        ${!closed && (confirm === "cerrar"
          ? html`<button type="button" class="btn primary" onClick=${cerrar}>Confirmar: cerrar acta</button><button type="button" class="btn ghost" onClick=${() => setConfirm("")}>No</button>`
          : html`<button type="button" class="btn primary" onClick=${() => setConfirm("cerrar")}>Cerrar acta</button>`)}
        ${!closed && (a.by === s.me.id || admin) && (confirm === "borrar"
          ? html`<button type="button" class="btn danger" onClick=${borrar}>Confirmar: borrar</button>`
          : html`<button type="button" class="btn icon ghost" title="Borrar acta" aria-label="Borrar acta" onClick=${() => setConfirm("borrar")}><${Icon} name="trash" /></button>`)}
      <//>
      ${closed && html`<div class="banner glass"><p><strong>Acta cerrada.</strong> ${admin ? "Como Dirección todavía puedes corregirla." : "Ya no se puede cambiar. Si algo quedó mal, pídele a Dirección que lo corrija."}</p></div>`}
      <div class="grid acta">
        <${L.Panel} title="Datos de la visita" cls="span-12">
          <div class="acta-datos">
            <${L.Field} label="Fecha" id="ac-f"><input id="ac-f" type="date" value=${f.fecha} disabled=${!edit} onInput=${(e) => set("fecha", e.target.value)} /><//>
            <${L.Field} label="Hora" id="ac-h"><input id="ac-h" type="time" value=${f.hora} disabled=${!edit} onInput=${(e) => set("hora", e.target.value)} /><//>
            <${L.Field} label="Lugar" id="ac-l"><input id="ac-l" value=${f.lugar} disabled=${!edit} onInput=${(e) => set("lugar", e.target.value)} placeholder="Obra, oficina del cliente…" /><//>
            <${L.Field} label="Clima" id="ac-c"><input id="ac-c" value=${f.clima} disabled=${!edit} onInput=${(e) => set("clima", e.target.value)} placeholder="Soleado, lluvia…" /><//>
            <div class="fld acta-avance"><label for="ac-a">Avance de obra</label><div class="inline"><input id="ac-a" type="range" min="0" max="100" step="5" value=${f.avance || 0} disabled=${!edit} onInput=${(e) => set("avance", Number(e.target.value))} /><b class="mono">${f.avance || 0}%</b></div></div>
          </div>
        <//>
        <${L.Panel} title="Asistentes" cls="span-12">
          <div class="fld"><span class="lbl">Del equipo LAP</span><${L.PeoplePicker} candidates=${people} value=${f.equipo} disabled=${!edit} onChange=${(v) => set("equipo", v)} /></div>
          <div class="fld"><span class="lbl">Cliente, contratistas y otros</span>
            <div class="asis">${f.asistentes.map((x, i) => html`<div class="asis-row" key=${i}>
              <input value=${x.nombre || ""} disabled=${!edit} placeholder="Nombre" onInput=${(e) => setAsis(i, "nombre", e.target.value)} />
              <input value=${x.rol || ""} disabled=${!edit} placeholder="Rol (cliente, residente, interventor…)" onInput=${(e) => setAsis(i, "rol", e.target.value)} />
              <input value=${x.empresa || ""} disabled=${!edit} placeholder="Empresa" onInput=${(e) => setAsis(i, "empresa", e.target.value)} />
              ${edit && html`<button type="button" class="btn icon ghost" aria-label="Quitar" onClick=${() => set("asistentes", f.asistentes.filter((_, j) => j !== i))}><${Icon} name="close" /></button>`}
            </div>`)}
            ${edit && html`<button type="button" class="btn sm" onClick=${() => set("asistentes", [...f.asistentes, { nombre: "", rol: "", empresa: "" }])}><${Icon} name="plus" size=${12} /> Agregar asistente</button>`}</div></div>
        <//>
        ${prev && (prevOpen.length > 0 || prevTasks.length > 0) && html`<${L.Panel} title=${"Pendiente del acta #" + prev.numero} cls="span-12">
          <p class="note">Lo que quedó abierto en la visita anterior. Revísalo con todos antes de empezar.</p>
          ${prevTasks.length > 0 && html`<div class="rows">${prevTasks.map((t) => html`<${L.TaskRow} key=${t.id} task=${t} showProject=${false} />`)}</div>`}
          ${prevOpen.map((c) => html`<div class="comp-prev" key=${c.id}><span>${L.plainText(c.texto)}</span><small class="muted">${c.resp || "Sin responsable"}${c.fecha ? " · " + L.fmtShort(c.fecha) : ""}</small>
            ${edit && html`<button type="button" class="btn sm" onClick=${() => addComp({ texto: c.texto, resp: c.resp, fecha: c.fecha, desde: prev.id + ":" + c.id })}>Traer a esta acta</button>`}</div>`)}
        <//>`}
        <${L.Panel} title="Temas tratados" cls="span-12">
          <${L.MentionArea} cls="acta-text" value=${f.temas} disabled=${!edit} onInput=${(v) => set("temas", v)} placeholder="Qué se revisó, qué se decidió, observaciones del cliente o la interventoría. Usa @ para mencionar a alguien del equipo." />
        <//>
        <div class="span-12 nested"><${L.Commitments} origen=${"acta:" + id} project=${a.proyecto} people=${people} title="Compromisos del equipo" empty="Cada compromiso del equipo se vuelve una tarea con responsable y fecha." /></div>
        <${L.Panel} title="Compromisos de contratistas y cliente" cls="span-12">
          <div class="comp-list">${f.compromisos.map((c) => html`<div class=${L.cx("comp-row", c.hecho && "done")} key=${c.id}>
            <input type="checkbox" checked=${!!c.hecho} disabled=${!edit} onChange=${(e) => setComp(c.id, { hecho: e.target.checked })} aria-label="Cumplido" />
            <input class="comp-t" value=${c.texto} disabled=${!edit} placeholder="Qué se comprometió" onInput=${(e) => setComp(c.id, { texto: e.target.value })} />
            <input value=${c.resp || ""} disabled=${!edit} placeholder="Responsable (nombre o empresa)" onInput=${(e) => setComp(c.id, { resp: e.target.value })} />
            <input type="date" value=${c.fecha || ""} disabled=${!edit} onInput=${(e) => setComp(c.id, { fecha: e.target.value })} />
            ${edit && html`<button type="button" class="btn icon ghost" aria-label="Quitar" onClick=${() => set("compromisos", f.compromisos.filter((x) => x.id !== c.id))}><${Icon} name="close" /></button>`}
          </div>`)}
          ${!f.compromisos.length && html`<p class="note">Lo que se comprometen el contratista, el cliente o la interventoría. Se revisa en la siguiente acta.</p>`}
          ${edit && html`<button type="button" class="btn sm" onClick=${() => addComp()}><${Icon} name="plus" size=${12} /> Agregar compromiso</button>`}</div>
        <//>
        <${L.Panel} title="Fotos" cls="span-12" action=${edit && html`<button type="button" class="btn sm" onClick=${addFotos}><${Icon} name="image" /> Subir fotos</button>`}>
          ${(a.fotos || []).length ? html`<div class="acta-fotos">${a.fotos.map((name) => html`<figure key=${name}>
            <a href=${L.pbFile(a, name)} target="_blank" rel="noopener"><img src=${L.pbFile(a, name, "480x0")} alt="" loading="lazy" /></a>
            <input value=${(f.fotosNotas || {})[name] || ""} disabled=${!edit} placeholder="Nota de la foto" onInput=${(e) => set("fotosNotas", { ...(f.fotosNotas || {}), [name]: e.target.value })} />
            ${edit && html`<button type="button" class="btn icon ghost foto-del" aria-label="Quitar foto" onClick=${() => delFoto(name)}><${Icon} name="trash" /></button>`}
          </figure>`)}</div>` : html`<p class="note">Sube las fotos de la visita; se reducen solas para que no ocupen mucho y salen en el PDF con su nota.</p>`}
        <//>
        <${L.Panel} title="Observaciones" cls="span-12">
          <${L.MentionArea} cls="acta-text" value=${f.observaciones} disabled=${!edit} onInput=${(v) => set("observaciones", v)} placeholder="Seguridad, calidad, cambios pedidos, lo que deba quedar por escrito." />
        <//>
        <${L.Panel} title="Firmas" cls="span-12" action=${edit && html`<button type="button" class="btn sm" onClick=${() => L.openSheet("acta-firma", id)}><${Icon} name="pen" /> Agregar firma</button>`}>
          ${firmas.length ? html`<div class="firmas">${firmas.map((x, i) => html`<div class="firma" key=${i}><img src=${x.img} alt=${"Firma de " + x.nombre} /><b>${x.nombre}</b><small>${x.rol || ""}</small>
            ${edit && html`<button type="button" class="btn icon ghost" aria-label="Quitar firma" onClick=${() => act().save("actas", id, { firmas: firmas.filter((_, j) => j !== i) })}><${Icon} name="close" /></button>`}</div>`)}</div>`
            : html`<p class="note">Opcional. El cliente, el contratista o quien asista firma en la pantalla (mouse, tableta o el dedo en una pantalla táctil).</p>`}
        <//>
      </div>`;
  }

  /* ---------- firma en pantalla ---------- */
  function FirmaSheet({ id }) {
    const s = L.useStore();
    const a = s.actas.find((x) => x.id === id);
    const cv = useRef(null);
    const [nombre, setNombre] = useState("");
    const [rol, setRol] = useState("");
    const [has, setHas] = useState(false);
    useEffect(() => {
      const c = cv.current, ctx = c.getContext("2d");
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1d1d2b";
      let down = false;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      const start = (e) => { down = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
      const move = (e) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setHas(true); };
      const end = () => { down = false; };
      c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move); c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
      return () => { c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", end); c.removeEventListener("pointercancel", end); };
    }, []);
    if (!a) return null;
    const clear = () => { const c = cv.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setHas(false); };
    const save = async () => {
      if (!nombre.trim() || !has) { L.toast(!has ? "Falta la firma." : "Escribe el nombre de quien firma."); return; }
      const img = cv.current.toDataURL("image/png");
      if (await act().save("actas", id, { firmas: [...(a.firmas || []), { nombre: nombre.trim(), rol: rol.trim(), img, fecha: new Date().toISOString() }] })) { L.toast("Firma agregada"); L.closeSheet(); }
    };
    const footer = html`<button type="button" class="btn ghost" onClick=${clear}>Borrar trazo</button><span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary">Guardar firma</button>`;
    return html`<${L.Sheet} title="Firma" onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      <${L.Field} label="Nombre" id="fi-n"><input id="fi-n" value=${nombre} onInput=${(e) => setNombre(e.target.value)} placeholder="Quien firma" /><//>
      <${L.Field} label="Rol o empresa" id="fi-r"><input id="fi-r" value=${rol} onInput=${(e) => setRol(e.target.value)} placeholder="Cliente, residente de obra, interventor…" /><//>
      <div class="fld"><span class="lbl">Firma</span><canvas ref=${cv} class="firma-pad" width="600" height="220" aria-label="Espacio para firmar"></canvas><span class="hint">Firma con el mouse, un lápiz o el dedo.</span></div>
    <//>`;
  }

  /* ---------- PDF con la marca LAP ---------- */
  function pdfHtml(a) {
    const p = q().project(a.proyecto) || {};
    const sym = document.getElementById("lap-sym");
    const logo = sym ? `<svg viewBox="${sym.getAttribute("viewBox")}" class="logo">${sym.innerHTML}</svg>` : "";
    const base = location.href.replace(/#.*$/, "").replace(/[^/]*$/, "");
    const rich = (t) => esc(L.plainText(t)).replace(/\n/g, "<br>");
    const tasks = q().fromOrigin("acta:" + a.id);
    const equipo = (a.equipo || []).map((u) => esc(q().name(u))).join(", ");
    const ext = (a.asistentes || []).filter((x) => x.nombre).map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.rol)}</td><td>${esc(x.empresa)}</td></tr>`).join("");
    const comps = [
      ...tasks.map((t) => `<tr><td>${t.status === "terminado" ? "✓" : ""}</td><td>${esc(t.title)}</td><td>${esc((t.assignees || []).map((u) => q().name(u)).join(", "))} (LAP)</td><td>${t.due ? esc(L.fmtShort(t.due)) : ""}</td></tr>`),
      ...(a.compromisos || []).filter((c) => c.texto).map((c) => `<tr><td>${c.hecho ? "✓" : ""}</td><td>${rich(c.texto)}</td><td>${esc(c.resp)}</td><td>${c.fecha ? esc(L.fmtShort(c.fecha)) : ""}</td></tr>`),
    ].join("");
    const fotos = (a.fotos || []).map((n) => `<figure><img src="${L.pbFile(a, n)}"><figcaption>${esc((a.fotosNotas || {})[n] || "")}</figcaption></figure>`).join("");
    const firmas = (a.firmas || []).map((x) => `<div class="firma"><img src="${x.img}"><b>${esc(x.nombre)}</b><small>${esc(x.rol)}</small></div>`).join("");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="${base}"><title>Acta ${a.numero}</title><style>
      @font-face { font-family: "Hanken Grotesk"; font-weight: 400; src: url("vendor/fonts/hanken-grotesk-400.woff2") format("woff2"); }
      @font-face { font-family: "Hanken Grotesk"; font-weight: 600; src: url("vendor/fonts/hanken-grotesk-600.woff2") format("woff2"); }
      @page { size: Letter; margin: 16mm 15mm 18mm; }
      * { box-sizing: border-box; } body { font: 10.5pt/1.45 "Hanken Grotesk", sans-serif; color: #17213b; margin: 0; }
      header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0057ff; padding-bottom: 10px; margin-bottom: 14px; }
      .logo { width: 46px; height: 40px; color: #0057ff; } .brand b { display: block; letter-spacing: .32em; font-size: 13pt; } .brand small { color: #5b6476; }
      header .num { margin-left: auto; text-align: right; } header .num b { font-size: 17pt; color: #0057ff; display: block; }
      h2 { font-size: 10pt; letter-spacing: .16em; text-transform: uppercase; color: #0057ff; margin: 16px 0 6px; }
      .datos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; } .datos div small { display: block; color: #5b6476; font-size: 8.5pt; }
      table { width: 100%; border-collapse: collapse; font-size: 9.5pt; } td, th { border-bottom: 1px solid #dfe3ec; padding: 5px 6px; text-align: left; vertical-align: top; } th { color: #5b6476; font-weight: 600; font-size: 8.5pt; }
      .bar { height: 8px; background: #e6ebf5; border-radius: 4px; overflow: hidden; } .bar i { display: block; height: 100%; background: #0057ff; }
      .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } figure { margin: 0; break-inside: avoid; } figure img { width: 100%; height: 190px; object-fit: cover; border-radius: 4px; } figcaption { font-size: 8.5pt; color: #5b6476; }
      .firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 8px; } .firma { border-top: 1px solid #17213b; padding-top: 4px; break-inside: avoid; } .firma img { width: 100%; height: 70px; object-fit: contain; } .firma b, .firma small { display: block; } .firma small { color: #5b6476; }
      footer { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 8pt; color: #8a92a6; display: flex; justify-content: space-between; }
    </style></head><body>
      <header>${logo}<div class="brand"><b>LAP</b><small>Left Angle Partnership</small></div>
        <div class="num"><small>Acta de obra</small><b>#${a.numero || ""}</b><small>${esc(a.estado === "cerrada" ? "Cerrada" : "Borrador")}</small></div></header>
      <div class="datos">
        <div><small>Proyecto</small>${esc((p.code ? p.code + " · " : "") + (p.name || ""))}</div>
        <div><small>Cliente</small>${esc(p.client || "—")}</div>
        <div><small>Fecha</small>${esc(L.fmtLong(a.fecha))}${a.hora ? " · " + esc(a.hora) : ""}</div>
        <div><small>Lugar</small>${esc(a.lugar || "—")}${a.clima ? " · " + esc(a.clima) : ""}</div>
      </div>
      <h2>Avance de obra · ${a.avance || 0}%</h2><div class="bar"><i style="width:${a.avance || 0}%"></i></div>
      <h2>Asistentes</h2>
      <table><tr><th>Nombre</th><th>Rol</th><th>Empresa</th></tr>${equipo ? `<tr><td>${equipo}</td><td>Equipo de diseño</td><td>LAP</td></tr>` : ""}${ext}</table>
      ${a.temas ? `<h2>Temas tratados</h2><p>${rich(a.temas)}</p>` : ""}
      ${comps ? `<h2>Compromisos</h2><table><tr><th></th><th>Compromiso</th><th>Responsable</th><th>Fecha</th></tr>${comps}</table>` : ""}
      ${a.observaciones ? `<h2>Observaciones</h2><p>${rich(a.observaciones)}</p>` : ""}
      ${fotos ? `<h2>Registro fotográfico</h2><div class="fotos">${fotos}</div>` : ""}
      ${firmas ? `<h2>Firmas</h2><div class="firmas">${firmas}</div>` : ""}
      <footer><span>LAP · Acta de obra #${a.numero || ""} · ${esc(p.name || "")}</span><span>Generada el ${esc(L.fmtLong(L.todayIso()))}</span></footer>
    </body></html>`;
  }
  async function pdf(id) {
    const a = L.state.actas.find((x) => x.id === id);
    if (!a) return;
    const p = q().project(a.proyecto) || {};
    const name = `Acta ${a.numero || ""} ${(p.code || p.name || "").replace(/[\\/:*?"<>|]/g, "")} ${a.fecha}.pdf`.replace(/\s+/g, " ");
    const doc = pdfHtml(a);
    if (L.desk && L.desk.printPdf) {
      const r = await L.desk.printPdf(doc, name);
      if (r && r.ok) L.toast("PDF guardado"); else if (r && !r.canceled) L.toast("No se pudo crear el PDF" + (r && r.error ? ": " + r.error : "."));
      return;
    }
    const w = window.open("", "_blank");
    if (!w) { L.toast("El navegador bloqueó la ventana del PDF."); return; }
    w.document.write(doc); w.document.close();
    setTimeout(() => w.print(), 800);
  }

  L.EXTRA_SHEETS = { ...(L.EXTRA_SHEETS || {}), "acta-firma": FirmaSheet };
  Object.assign(L, { ActasSection, ActaView, actaPdf: pdf, actaHtml: pdfHtml });
})();
