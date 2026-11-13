// Herramientas del estudio dentro de cada proyecto: licencias, planos y envíos, obra, finanzas,
// semáforo del proyecto, plantillas de plan, compromisos de actas y revisión de imágenes con pines.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Panel, Empty, Seg, Avatar, Faces, Icon, Field, Sheet, DeleteButton, PeoplePicker, PathBlock, Pills } = L;
  const { useState, useEffect, useRef } = hooks;
  const state = () => L.state;
  const today = () => L.todayIso();
  const label = (arr, id) => { const x = arr.find((o) => o.id === id); return x ? x.label : id || ""; };

  // Ruta local (Dropbox, red o disco) → dirección que la ventana puede mostrar como imagen.
  function fileUrl(p) {
    if (!p) return "";
    const s = String(p).trim().replace(/\\/g, "/");
    if (s.startsWith("//")) return "file:" + s.split("/").map((x, i) => (i < 4 ? x : encodeURIComponent(x))).join("/");
    return "file:///" + s.split("/").map((x, i) => (i === 0 && /^[a-zA-Z]:$/.test(x) ? x : encodeURIComponent(x))).join("/");
  }
  const isImage = (p) => /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(String(p || ""));

  /* ---------- formulario genérico de las herramientas ---------- */
  // Cada herramienta describe sus campos; un solo panel los dibuja y guarda.
  const staffIds = () => q.staff().map((u) => u.id);
  const SCHEMAS = {
    tramites: {
      title: "Trámite de licencia",
      initial: (d) => ({ tipo: "construccion", estado: "preparacion", responsable: L.state.me.id, ...d }),
      fields: [
        { k: "tipo", label: "Trámite", type: "select", options: () => L.TRAMITE_TIPOS },
        { k: "entidad", label: "Entidad", placeholder: "Curaduría Urbana 2 de Bogotá" },
        { k: "estado", label: "Estado", type: "pills", options: () => L.TRAMITE_ESTADOS },
        { k: "radicado", label: "Número de radicado", mono: true },
        { row: [{ k: "fechaRadicacion", label: "Radicado el", type: "date" }, { k: "fechaLimite", label: "Plazo para responder", type: "date", hint: "Si hay observaciones: hasta cuándo hay que responder." }] },
        { row: [{ k: "fechaResolucion", label: "Resolución", type: "date" }, { k: "vigenciaHasta", label: "Licencia vigente hasta", type: "date" }] },
        { k: "responsable", label: "Quién responde por el trámite", type: "user" },
        { k: "ruta", label: "Carpeta de documentos", type: "path" },
        { k: "notas", label: "Notas", type: "textarea" },
      ],
      // Cada cambio de estado queda en el historial del trámite.
      before: (body, prev) => {
        const h = (prev && prev.historial) || [];
        if (!prev || prev.estado !== body.estado) body.historial = [...h, { fecha: today(), estado: body.estado, by: L.state.me.id }];
        return body;
      },
    },
    planos: {
      title: "Plano",
      initial: (d) => ({ disciplina: "arquitectura", estado: "en_proceso", revision: "A", ...d }),
      fields: [
        { row: [{ k: "codigo", label: "Código", mono: true, required: true, placeholder: "A-101" }, { k: "revision", label: "Revisión actual", mono: true, placeholder: "A" }] },
        { k: "nombre", label: "Nombre", placeholder: "Planta primer piso" },
        { k: "disciplina", label: "Disciplina", type: "select", options: () => L.DISCIPLINAS },
        { k: "estado", label: "Estado", type: "pills", options: () => L.PLANO_ESTADOS },
        { k: "ruta", label: "Archivo o carpeta", type: "path" },
      ],
      before: (body) => ({ ...body, updatedBy: L.state.me.id }),
    },
    envios: {
      title: "Envío de planos",
      initial: (d) => ({ fecha: today(), medio: "correo", proposito: "aprobacion", items: [], by: L.state.me.id, ...d }),
      fields: [
        { row: [{ k: "fecha", label: "Fecha", type: "date" }, { k: "medio", label: "Medio", type: "select", options: () => L.ENVIO_MEDIOS }] },
        { row: [{ k: "destinatario", label: "Para", required: true }, { k: "empresa", label: "Empresa" }] },
        { k: "proposito", label: "Propósito", type: "select", options: () => L.ENVIO_PROPOSITOS },
        { k: "items", label: "Planos que se envían", type: "planos" },
        { k: "notas", label: "Notas", type: "textarea" },
      ],
    },
    visitas: {
      title: "Visita de obra",
      initial: (d) => ({ fecha: today(), by: L.state.me.id, avance: 0, ...d }),
      fields: [
        { row: [{ k: "fecha", label: "Fecha", type: "date" }, { k: "avance", label: "Avance de obra (%)", type: "number", min: 0, max: 100 }] },
        { k: "asistentes", label: "Quiénes estaban", placeholder: "Residente, interventoría, cliente…" },
        { k: "resumen", label: "Qué se vio", type: "textarea", rows: 6 },
        { k: "ruta", label: "Carpeta de fotos", type: "path" },
      ],
    },
    contactos: {
      title: "Contacto",
      initial: (d) => ({ tipo: "cliente", proyectos: [], ...d }),
      fields: [
        { k: "tipo", label: "Tipo", type: "pills", options: () => L.CONTACTO_TIPOS },
        { k: "nombre", label: "Nombre", required: true },
        { row: [{ k: "empresa", label: "Empresa" }, { k: "cargo", label: "Cargo" }] },
        { row: [{ k: "telefono", label: "Teléfono", mono: true }, { k: "email", label: "Correo" }] },
        { row: [{ k: "especialidad", label: "Especialidad", placeholder: "Estructura, carpintería, iluminación…" }, { k: "ciudad", label: "Ciudad" }] },
        { k: "proyectos", label: "Proyectos", type: "projects" },
        { k: "notas", label: "Notas", type: "textarea" },
      ],
    },
    cobros: {
      title: "Cobro",
      initial: (d) => ({ estado: "pendiente", fechaEsperada: today(), ...d }),
      fields: [
        { k: "concepto", label: "Concepto", required: true, placeholder: "Anticipo, entrega del anteproyecto…" },
        { row: [{ k: "valor", label: "Valor (COP)", type: "number", min: 0, required: true }, { k: "fechaEsperada", label: "Fecha esperada", type: "date" }] },
        { k: "estado", label: "Estado", type: "pills", options: () => L.COBRO_ESTADOS },
        { row: [{ k: "factura", label: "Factura", mono: true }, { k: "fechaPago", label: "Pagado el", type: "date" }] },
        { k: "notas", label: "Notas", type: "textarea" },
      ],
    },
    ausencias: {
      title: "Ausencia",
      initial: (d) => ({ user: L.state.me.id, tipo: "vacaciones", desde: today(), hasta: today(), ...d }),
      fields: [
        { k: "user", label: "Persona", type: "user", adminOnly: true },
        { k: "tipo", label: "Tipo", type: "pills", options: () => L.AUSENCIA_TIPOS },
        { row: [{ k: "desde", label: "Desde", type: "date" }, { k: "hasta", label: "Hasta", type: "date" }] },
        { k: "nota", label: "Nota", placeholder: "Opcional" },
      ],
      before: (body) => { if (body.hasta < body.desde) [body.desde, body.hasta] = [body.hasta, body.desde]; return body; },
      // Si ya tenía entregas en esas fechas, se avisa para reasignarlas (Equipo también lo marca).
      after: (a) => {
        const clash = L.state.tareas.filter((t) => t.status !== "terminado" && (t.assignees || []).includes(a.user) && ((t.due && t.due >= a.desde && t.due <= a.hasta) || (t.start && t.start >= a.desde && t.start <= a.hasta)));
        if (clash.length) setTimeout(() => L.toast(`Ojo: ${a.user === L.state.me.id ? "tienes" : L.first(q.name(a.user)) + " tiene"} ${L.plural(clash.length, "tarea", "tareas")} en esas fechas. Avísale a quien lidera para reasignarlas.`), 400);
      },
    },
    solicitudes: {
      title: "Solicitud a otra área",
      initial: (d) => ({ tipo: "render", area: "visualizacion", prioridad: "normal", estado: "nueva", solicitante: L.state.me.id, ...d }),
      fields: [
        { k: "area", label: "Para el área", type: "pills", options: () => L.AREAS, attr: "data-a" },
        { k: "tipo", label: "Qué necesitas", type: "select", options: () => L.SOLICITUD_TIPOS },
        { k: "titulo", label: "En pocas palabras", required: true, placeholder: "Render del lobby con luz de tarde" },
        { k: "project", label: "Proyecto", type: "project" },
        { k: "descripcion", label: "Detalles", type: "textarea", rows: 5, placeholder: "Referencias, formato, tamaño, cantidad…" },
        { row: [{ k: "fechaNecesaria", label: "Para cuándo", type: "date" }, { k: "prioridad", label: "Prioridad", type: "select", options: () => [{ id: "normal", label: "Normal" }, { id: "urgente", label: "Urgente" }] }] },
        { k: "ruta", label: "Carpeta con archivos de referencia", type: "path" },
      ],
    },
  };

  function ToolSheet({ col, id, defaults }) {
    const s = L.useStore();
    const sc = SCHEMAS[col];
    const rec = id ? s[col].find((x) => x.id === id) : null;
    const [f, setF] = useState(() => (rec ? { ...rec } : sc.initial(defaults || {})));
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const project = q.project(f.project);
    const all = sc.fields.flatMap((x) => x.row || [x]);
    const save = async () => {
      const missing = all.find((x) => x.required && (f[x.k] === "" || f[x.k] == null));
      if (missing) { setErr(`Completa «${missing.label}».`); return; }
      setBusy(true);
      let body = {};
      for (const x of all) {
        let v = f[x.k];
        if (x.type === "number") v = v === "" || v == null ? 0 : Number(v);
        if (typeof v === "string") v = v.trim();
        body[x.k] = v == null ? "" : v;
      }
      for (const k of Object.keys(sc.initial({}))) if (!(k in body)) body[k] = f[k];
      for (const k of Object.keys(defaults || {})) if (!(k in body)) body[k] = f[k];
      if (sc.before) body = sc.before(body, rec);
      const saved = await act.save(col, id, body);
      setBusy(false);
      if (saved) { L.toast(id ? "Guardado" : "Agregado"); L.closeSheet(); if (sc.after) sc.after(saved, rec); }
    };
    const remove = async () => { if (await act.remove(col, id)) { L.toast("Eliminado"); L.closeSheet(); } };
    const pickFolder = async (k, file) => {
      const r = file ? await L.desk.pickFile(f[k] || "") : await L.desk.pickFolder(f[k] || (project && project.folder) || "");
      if (r) set(k, r);
    };
    const input = (x) => {
      const v = f[x.k] == null ? "" : f[x.k];
      const id2 = "tf-" + x.k;
      switch (x.type) {
        case "textarea": return html`<textarea id=${id2} rows=${x.rows || 3} value=${v} placeholder=${x.placeholder || ""} onInput=${(e) => set(x.k, e.target.value)}></textarea>`;
        case "date": return html`<input id=${id2} type="date" value=${v} onInput=${(e) => set(x.k, e.target.value)} />`;
        case "number": return html`<input id=${id2} type="number" min=${x.min} max=${x.max} step=${x.step || "any"} value=${v} onInput=${(e) => set(x.k, e.target.value)} />`;
        case "select": return html`<select id=${id2} value=${v} onChange=${(e) => set(x.k, e.target.value)}>${x.options().map((o) => html`<option key=${o.id} value=${o.id}>${o.label}</option>`)}</select>`;
        case "pills": return html`<${Pills} options=${x.options()} value=${v} attr=${x.attr} onChange=${(o) => set(x.k, o)} />`;
        case "user": return html`<select id=${id2} value=${v} onChange=${(e) => set(x.k, e.target.value)}><option value="">Nadie</option>${q.staff().map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}</select>`;
        case "project": return html`<select id=${id2} value=${v} onChange=${(e) => set(x.k, e.target.value)}><option value="">${x.required ? "Elige un proyecto" : "Sin proyecto"}</option>${s.proyectos.filter((p) => p.status !== "cerrado" || p.id === v).map((p) => html`<option key=${p.id} value=${p.id}>${p.code ? p.code + " · " : ""}${p.name}</option>`)}</select>`;
        case "task": return html`<select id=${id2} value=${v} onChange=${(e) => set(x.k, e.target.value)}><option value="">Sin tarea</option>${s.tareas.filter((t) => t.project === f.project && t.status !== "terminado").map((t) => html`<option key=${t.id} value=${t.id}>${t.title}</option>`)}</select>`;
        case "contact": return html`<select id=${id2} value=${v} onChange=${(e) => set(x.k, e.target.value)}><option value="">Sin proveedor</option>${s.contactos.filter((c) => c.tipo === "proveedor" || c.tipo === "contratista" || c.id === v).map((c) => html`<option key=${c.id} value=${c.id}>${c.empresa || c.nombre}</option>`)}</select>`;
        case "projects": return html`<${Pills} options=${s.proyectos.filter((p) => p.status !== "cerrado" || (v || []).includes(p.id)).map((p) => ({ id: p.id, label: p.code || p.name }))} value=${v || []} onChange=${(pid) => set(x.k, (v || []).includes(pid) ? v.filter((z) => z !== pid) : [...(v || []), pid])} />`;
        case "path": return html`<div class="pick-row"><input id=${id2} class="mono" value=${v} placeholder=${x.file ? "Ruta del archivo" : "Ruta de la carpeta"} onInput=${(e) => set(x.k, e.target.value)} />
          ${L.desk && html`<button type="button" class="btn" onClick=${() => pickFolder(x.k, x.file)}>Elegir…</button>`}
          ${L.desk && v && html`<button type="button" class="btn icon" title="Abrir" aria-label="Abrir" onClick=${() => L.openPath(v)}><${Icon} name="folder" /></button>`}</div>`;
        case "planos": {
          const planos = s.planos.filter((p) => p.project === f.project).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
          const items = v || [];
          const has = (pid) => items.some((it) => it.plano === pid);
          const toggle = (p) => set(x.k, has(p.id) ? items.filter((it) => it.plano !== p.id) : [...items, { plano: p.id, codigo: p.codigo, nombre: p.nombre, rev: p.revision }]);
          return planos.length ? html`<div class="check-list">${planos.map((p) => html`<label key=${p.id} class="check"><input type="checkbox" checked=${has(p.id)} onChange=${() => toggle(p)} /><span><b class="mono">${p.codigo}</b> ${p.nombre} <span class="muted">· Rev. ${p.revision || "—"}</span></span></label>`)}</div>`
            : html`<span class="muted">Este proyecto aún no tiene planos registrados.</span>`;
        }
        default: return html`<input id=${id2} class=${x.mono ? "mono" : ""} value=${v} placeholder=${x.placeholder || ""} onInput=${(e) => set(x.k, e.target.value)} />`;
      }
    };
    const field = (x) => (x.adminOnly && !q.isDirector() ? null : html`<${Field} key=${x.k} label=${x.label} id=${"tf-" + x.k} hint=${x.hint}>${input(x)}<//>`);
    const footer = html`${id && html`<${DeleteButton} onConfirm=${remove} />`}<span class="spacer"></span>
      <button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary" disabled=${busy}>${id ? "Guardar" : "Agregar"}</button>`;
    return html`<${Sheet} title=${sc.title} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      ${sc.fields.map((x) => (x.row ? html`<div class="two">${x.row.map(field)}</div>` : field(x)))}
      ${err && html`<p class="err">${err}</p>`}
    <//>`;
  }
  const openTool = (col, id, defaults) => L.openSheet("tool", id, { col, ...defaults });

  /* ---------- semáforo del proyecto ---------- */
  function Health({ project }) {
    const lead = q.canLead(project);
    const [nota, setNota] = useState(project.saludNota || "");
    const choose = async (v) => { if (await act.save("proyectos", project.id, { salud: v, saludNota: nota, saludFecha: new Date().toISOString() })) L.toast("Estado del proyecto actualizado"); };
    return html`<div class="health">
      <div class="health-pick">${L.SALUD.map((o) => html`<button type="button" key=${o.id} class=${"light " + o.id} aria-pressed=${project.salud === o.id} disabled=${!lead} onClick=${() => choose(o.id)}><i></i>${o.label}</button>`)}</div>
      ${lead ? html`<input class="health-note" value=${nota} placeholder="Por qué (lo ve todo el estudio)" onInput=${(e) => setNota(e.target.value)} onBlur=${() => { if (nota !== (project.saludNota || "")) act.save("proyectos", project.id, { saludNota: nota }); }} />`
        : project.saludNota && html`<p class="muted">${project.saludNota}</p>`}
      ${project.saludFecha && html`<span class="meta-line">Actualizado ${L.relTime(project.saludFecha)}</span>`}
    </div>`;
  }
  const HealthDot = ({ p }) => (p && p.salud ? html`<span class=${"light-dot " + p.salud} title=${label(L.SALUD, p.salud) + (p.saludNota ? ": " + p.saludNota : "")}></span>` : null);

  /* ---------- plantillas del plan de entregables ---------- */
  function PlanTemplate({ plan, project }) {
    const [tpl, setTpl] = useState(project.phase && L.PLAN_TEMPLATES.some((t) => t.id === project.phase) ? project.phase : "anteproyecto");
    const [start, setStart] = useState(today());
    const [busy, setBusy] = useState(false);
    const t = L.PLAN_TEMPLATES.find((x) => x.id === tpl);
    const apply = async () => {
      setBusy(true);
      const base = L.parse(start);
      for (let i = 0; i < t.items.length; i++) {
        const [a, b, content, area, kind] = t.items[i];
        await act.saveItem(null, { plan: plan.id, date: L.iso(L.addDays(base, a)), end: L.iso(L.addDays(base, b)), content, area, kind, assignees: [], order: i + 1 });
      }
      setBusy(false);
      L.toast("Plantilla cargada. Ajusta fechas y asigna quién está al mando de cada entregable.");
    };
    return html`<div class="template-box">
      <p><b>¿Empezar desde una plantilla?</b> Carga los entregables típicos de la fase; después los ajustas.</p>
      <div class="inline wrap">
        <select class="select" value=${tpl} onChange=${(e) => setTpl(e.target.value)} aria-label="Plantilla">${L.PLAN_TEMPLATES.map((x) => html`<option key=${x.id} value=${x.id}>${x.label} · ${x.items.length} entregables</option>`)}</select>
        <label class="inline muted">desde <input class="select" type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
        <button type="button" class="btn" disabled=${busy} onClick=${apply}>Cargar plantilla</button>
      </div>
    </div>`;
  }

  /* ---------- compromisos: tareas que salen de un acta o de una visita de obra ---------- */
  function Commitments({ origen, project, people, title = "Compromisos", empty }) {
    const s = L.useStore();
    const tasks = q.fromOrigin(origen).sort(L.byDue);
    const [f, setF] = useState({ title: "", who: L.state.me.id, due: L.iso(L.addDays(L.today(), 7)) });
    const add = async (e) => {
      e.preventDefault();
      if (!f.title.trim()) return;
      const r = await act.createTasks([{ title: f.title.trim(), project: project || "", assignees: f.who ? [f.who] : [], start: today(), due: f.due, origen }]);
      if (r) { setF({ ...f, title: "" }); L.toast("Compromiso creado como tarea"); }
    };
    const candidates = (people && people.length ? people : q.staff().map((u) => u.id));
    return html`<${Panel} title=${title} cls="span-12" action=${html`<span class="tag">${tasks.filter((t) => t.status === "terminado").length} de ${tasks.length} cumplidos</span>`}>
      <div class="rows">${tasks.length ? tasks.map((t) => html`<${L.TaskRow} key=${t.id} task=${t} showProject=${false} />`) : html`<p class="note">${empty || "Cada compromiso se vuelve una tarea con responsable y fecha, y aparece en su cronograma."}</p>`}</div>
      <form class="commit-form" onSubmit=${add}>
        <input value=${f.title} onInput=${(e) => setF({ ...f, title: e.target.value })} placeholder="Qué hay que hacer" aria-label="Compromiso" />
        <select value=${f.who} onChange=${(e) => setF({ ...f, who: e.target.value })} aria-label="Responsable">${candidates.map((id) => html`<option key=${id} value=${id}>${L.first(q.name(id))}</option>`)}</select>
        <input type="date" value=${f.due} onInput=${(e) => setF({ ...f, due: e.target.value })} aria-label="Para cuándo" />
        <button type="submit" class="btn sm primary" disabled=${!f.title.trim()}>Agregar</button>
      </form>
    <//>`;
  }

  /* ---------- pestañas del proyecto ---------- */
  function LicenciasTab({ project }) {
    const s = L.useStore();
    const list = s.tramites.filter((t) => t.project === project.id).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    const t0 = today();
    return html`
      <div class="toolbar"><span class="muted light">Radicaciones, observaciones de curaduría, respuestas y vigencias.</span><span class="spacer"></span>
        <button type="button" class="btn primary" onClick=${() => openTool("tramites", null, { project: project.id })}><${Icon} name="plus" size=${12} /> Nuevo trámite</button></div>
      ${list.length ? html`<div class="grid">${list.map((t) => {
        const urgente = t.estado === "observaciones" && t.fechaLimite;
        const n = urgente ? L.diff(L.today(), L.parse(t.fechaLimite)) : null;
        return html`<article class="glass panel span-6 tramite" key=${t.id}>
          <div class="panel-head"><h2><span class="sl">/</span>${label(L.TRAMITE_TIPOS, t.tipo)}</h2><button type="button" class="btn sm" onClick=${() => openTool("tramites", t.id)}><${Icon} name="edit" /> Editar</button></div>
          <div class="tramite-state"><span class=${"chip state-" + t.estado}>${label(L.TRAMITE_ESTADOS, t.estado)}</span>
            ${urgente && html`<span class=${L.cx("due", n < 0 ? "late" : n <= 3 ? "soon" : "")}>${n < 0 ? "Plazo vencido hace " + -n + " días" : "Responder antes del " + L.fmtShort(t.fechaLimite)}</span>`}
            ${t.estado === "aprobado" && t.vigenciaHasta && html`<span class=${L.cx("due", t.vigenciaHasta < t0 ? "late" : "")}>Vigente hasta ${L.fmtShort(t.vigenciaHasta)} ${L.parse(t.vigenciaHasta).getFullYear()}</span>`}</div>
          <dl class="facts">
            ${t.entidad && html`<dt>Entidad</dt><dd>${t.entidad}</dd>`}
            ${t.radicado && html`<dt>Radicado</dt><dd class="mono">${t.radicado}${t.fechaRadicacion ? " · " + L.fmtShort(t.fechaRadicacion) : ""}</dd>`}
            ${t.responsable && html`<dt>Responde</dt><dd>${q.name(t.responsable)}</dd>`}
          </dl>
          ${t.ruta && html`<${PathBlock} path=${t.ruta} />`}
          ${t.notas && html`<p class="agenda">${t.notas}</p>`}
          ${(t.historial || []).length > 0 && html`<ol class="timeline">${[...t.historial].reverse().map((h, i) => html`<li key=${i}><b>${label(L.TRAMITE_ESTADOS, h.estado)}</b><span>${L.fmtShort(h.fecha)}${h.by ? " · " + L.first(q.name(h.by)) : ""}</span></li>`)}</ol>`}
        </article>`;
      })}</div>` : html`<div class="glass"><${Empty} small title="Sin trámites registrados" text="Registra la licencia y su estado: radicación, observaciones y plazo para responder. La app avisa antes de que se venza." /></div>`}`;
  }

  const nextRev = (r) => { const v = String(r || "").trim(); if (!v) return "A"; if (/^\d+$/.test(v)) return String(Number(v) + 1); if (/^[A-Y]$/i.test(v)) return String.fromCharCode(v.toUpperCase().charCodeAt(0) + 1); return v + "1"; };
  function PlanosTab({ project }) {
    const s = L.useStore();
    const [view, setView] = useState("planos");
    const [revOf, setRevOf] = useState(null); // plano al que se le registra revisión
    const [motivo, setMotivo] = useState("");
    const planos = s.planos.filter((p) => p.project === project.id).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    const envios = s.envios.filter((e) => e.project === project.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const addRev = async (p) => {
      const rev = nextRev(p.revision);
      const r = await act.save("planos", p.id, { revision: rev, estado: "en_proceso", updatedBy: L.state.me.id, revisiones: [...(p.revisiones || []), { rev, fecha: today(), motivo: motivo.trim(), by: L.state.me.id }] });
      if (r) { L.toast(`${p.codigo} pasa a revisión ${rev}`); setRevOf(null); setMotivo(""); }
    };
    return html`
      <div class="toolbar"><${Seg} label="Vista" value=${view} onChange=${setView} options=${[{ id: "planos", label: "Planos", count: planos.length || null }, { id: "envios", label: "Envíos", count: envios.length || null }]} /><span class="spacer"></span>
        ${view === "planos" ? html`<button type="button" class="btn primary" onClick=${() => openTool("planos", null, { project: project.id })}><${Icon} name="plus" size=${12} /> Nuevo plano</button>`
          : html`<button type="button" class="btn primary" onClick=${() => openTool("envios", null, { project: project.id })}><${Icon} name="plus" size=${12} /> Registrar envío</button>`}</div>
      ${view === "planos" && (planos.length ? html`<div class="glass arch">
        <div class="arch-row head planos"><div>Plano</div><div>Disciplina</div><div>Rev.</div><div>Estado</div><div>Archivo</div></div>
        ${planos.map((p) => html`<${L.Fragment} key=${p.id}>
          <div class="arch-row planos">
            <div><div class="t" onClick=${() => openTool("planos", p.id)}><span class="mono">${p.codigo}</span> ${p.nombre}</div><small>${(p.revisiones || []).length ? "Última revisión " + L.fmtShort(p.revisiones[p.revisiones.length - 1].fecha) : "Sin revisiones"}${p.updatedBy ? " · " + L.first(q.name(p.updatedBy)) : ""}</small></div>
            <div>${label(L.DISCIPLINAS, p.disciplina)}</div>
            <div class="mono rev">${p.revision || "—"}</div>
            <div><span class=${"chip plain state-" + p.estado}>${label(L.PLANO_ESTADOS, p.estado)}</span></div>
            <div class="inline">${p.ruta ? html`<${PathBlock} path=${p.ruta} />` : html`<span class="muted">Sin ruta</span>`}<button type="button" class="btn sm" onClick=${() => setRevOf(revOf === p.id ? null : p.id)}>Nueva revisión</button></div>
          </div>
          ${revOf === p.id && html`<div class="rev-form"><span>Pasa de <b class="mono">${p.revision || "—"}</b> a <b class="mono">${nextRev(p.revision)}</b></span><input value=${motivo} onInput=${(e) => setMotivo(e.target.value)} placeholder="Motivo: observaciones del cliente, curaduría…" /><button type="button" class="btn sm primary" onClick=${() => addRev(p)}>Registrar</button></div>`}
        <//>`)}
      </div>` : html`<div class="glass"><${Empty} small title="Sin planos registrados" text="Lleva el listado de planos con su revisión vigente (A, B, C…) y su archivo, para saber siempre cuál es la última versión." /></div>`)}
      ${view === "envios" && (envios.length ? html`<div class="rows glass panel">${envios.map((e) => html`
        <div class="row" key=${e.id} onClick=${() => openTool("envios", e.id)}><${Icon} name="out" />
          <div class="row-main"><div class="row-title">${e.destinatario}${e.empresa ? " · " + e.empresa : ""}</div>
            <div class="row-meta"><span>${label(L.ENVIO_PROPOSITOS, e.proposito)} · ${label(L.ENVIO_MEDIOS, e.medio)}</span><span class="mono">${(e.items || []).map((it) => it.codigo + " " + (it.rev || "")).join(", ")}</span></div></div>
          <div class="row-side"><span class="due">${L.fmtShort(e.fecha)}</span><span class="muted">${e.by ? L.first(q.name(e.by)) : ""}</span></div>
        </div>`)}</div>` : html`<div class="glass"><${Empty} small title="Sin envíos registrados" text="Registra qué planos, en qué revisión, se le enviaron a quién y cuándo." /></div>`)}`;
  }

  function ObraTab({ project }) {
    const s = L.useStore();
    const visitas = s.visitas.filter((v) => v.project === project.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const last = visitas[0];
    const people = [...new Set([project.leader, ...(project.members || [])].filter(Boolean))];
    return html`
      <div class="toolbar">${last ? html`<span class="obra-avance"><b>${last.avance || 0}%</b> de avance según la visita del ${L.fmtShort(last.fecha)}</span>` : html`<span class="muted light">La bitácora de las visitas de obra.</span>`}<span class="spacer"></span>
        <button type="button" class="btn primary" onClick=${() => openTool("visitas", null, { project: project.id })}><${Icon} name="plus" size=${12} /> Registrar visita</button></div>
      <div class="grid">${L.ActasSection && html`<${L.ActasSection} project=${project} />`}</div>
      ${visitas.length ? html`<h2 class="sub-h"><span class="sl">/</span>Bitácora de visitas</h2><div class="grid">${visitas.map((v) => html`
        <article class="glass panel span-12" key=${v.id}>
          <div class="panel-head"><h2><span class="sl">/</span>Visita del ${L.fmtLong(v.fecha)}</h2><div class="inline"><span class="tag">${v.avance || 0}% de avance</span><button type="button" class="btn sm" onClick=${() => openTool("visitas", v.id)}><${Icon} name="edit" /> Editar</button></div></div>
          <div class="row-meta"><${Avatar} id=${v.by} /><span>${q.name(v.by)}</span>${v.asistentes && html`<span>· con ${v.asistentes}</span>`}</div>
          ${v.resumen && html`<p class="agenda">${v.resumen}</p>`}
          ${v.ruta && html`<div class="inline"><span class="lbl">Fotos</span><${PathBlock} path=${v.ruta} /></div>`}
          <div class="nested"><${Commitments} origen=${"visita:" + v.id} project=${project.id} people=${people} title="Pendientes de la visita" empty="Cada pendiente de obra se vuelve una tarea con responsable y fecha." /></div>
        </article>`)}</div>` : html`<div class="glass"><${Empty} small title="Sin visitas registradas" text="Cada visita guarda fecha, avance, lo que se vio, la carpeta de fotos y los pendientes, que se vuelven tareas." /></div>`}`;
  }

  // Totales de cobros de un proyecto.
  function projectMoney(pid) {
    const s = state();
    const cobros = s.cobros.filter((c) => c.project === pid);
    const sum = (arr) => arr.reduce((a, c) => a + (Number(c.valor) || 0), 0);
    return { cobros, contratado: sum(cobros), pagado: sum(cobros.filter((c) => c.estado === "pagado")), facturado: sum(cobros.filter((c) => c.estado === "facturado")), pendiente: sum(cobros.filter((c) => c.estado === "pendiente")) };
  }

  function FinanzasTab({ project }) {
    L.useStore();
    const m = projectMoney(project.id);
    const fin = q.isFin();
    return html`
      <div class="grid">
        <div class="glass metrics span-12 money four" role="list">
          <div class="metric" role="listitem"><b>${L.money(m.contratado)}</b><span>Honorarios</span></div>
          <div class="metric" role="listitem"><b>${L.money(m.pagado)}</b><span>Pagado</span></div>
          <div class="metric" role="listitem"><b>${L.money(m.facturado)}</b><span>Facturado</span></div>
          <div class=${L.cx("metric", m.pendiente ? "" : "zero")} role="listitem"><b>${L.money(m.pendiente)}</b><span>Por facturar</span></div>
        </div>
        <${Panel} title="Cobros" cls="span-12" action=${fin ? html`<button type="button" class="btn sm primary" onClick=${() => openTool("cobros", null, { project: project.id })}><${Icon} name="plus" size=${12} /> Cobro</button>` : html`<span class="tag">Los registra Administración</span>`}>
          <div class="rows">${m.cobros.length ? m.cobros.sort((a, b) => (a.fechaEsperada || "").localeCompare(b.fechaEsperada || "")).map((c) => html`
            <div class=${L.cx("row", !fin && "static")} key=${c.id} onClick=${fin ? () => openTool("cobros", c.id) : null}>
              <span class=${"glyph " + (c.estado === "pagado" ? "fill" : "")} data-s=${c.estado === "pagado" ? "terminado" : c.estado === "facturado" ? "en_curso" : "pendiente"}></span>
              <div class="row-main"><div class="row-title">${c.concepto}</div><div class="row-meta"><span>${label(L.COBRO_ESTADOS, c.estado)}${c.factura ? " · factura " + c.factura : ""}</span></div></div>
              <div class="row-side"><b class="mono">${L.money(c.valor)}</b><span class=${L.cx("due", c.estado === "pendiente" && c.fechaEsperada && c.fechaEsperada < today() ? "late" : "")}>${c.estado === "pagado" && c.fechaPago ? "Pagado " + L.fmtShort(c.fechaPago) : c.fechaEsperada ? L.relDay(c.fechaEsperada) : ""}</span></div>
            </div>`) : html`<p class="note">Sin cobros registrados. Administración los agrega por hitos: anticipo, entregas, cierre.</p>`}</div>
        <//>
      </div>`;
  }

  /* ---------- revisión de imágenes con pines ---------- */
  function RevisionView({ id }) {
    const s = L.useStore();
    const r = q.revision(id);
    const [draft, setDraft] = useState(null); // { x, y, text }
    const [sel, setSel] = useState("");
    const [failed, setFailed] = useState(false);
    const [reply, setReply] = useState("");
    const box = useRef(null);
    useEffect(() => { setFailed(false); }, [r && r.ruta]);
    if (!r) return html`<div class="glass"><${Empty} title="Esta revisión ya no existe"><a class="btn" href="#inicio">Volver</a><//></div>`;
    const task = q.task(r.task);
    const pins = r.pins || [];
    const versions = s.revisiones.filter((x) => x.task === r.task).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
    const savePins = (next) => act.save("revisiones", r.id, { pins: next });
    const latest = () => (q.revision(id) || r).pins || [];
    const place = (e) => {
      if (r.estado === "resuelta") return;
      const rect = box.current.getBoundingClientRect();
      setDraft({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, text: "" });
      setSel("");
    };
    const addPin = async () => {
      if (!draft.text.trim()) { setDraft(null); return; }
      const pin = { id: L.key(), x: draft.x, y: draft.y, text: draft.text.trim(), by: L.state.me.id, at: new Date().toISOString(), resolved: false, replies: [] };
      if (await savePins([...latest(), pin])) { setDraft(null); setSel(pin.id); }
    };
    const update = (pid, fn) => savePins(latest().map((p) => (p.id === pid ? fn(p) : p)));
    const newVersion = async () => {
      const file = await L.desk.pickFile(r.ruta);
      if (!file) return;
      const next = await act.save("revisiones", null, { task: r.task, project: r.project, titulo: r.titulo, ruta: file, version: "v" + (versions.length + 1), estado: "abierta", pins: [], by: L.state.me.id });
      if (next) { await act.save("revisiones", r.id, { estado: "resuelta" }); L.go("#revision/" + next.id); }
    };
    const open = pins.filter((p) => !p.resolved).length;
    const n = (pid) => pins.findIndex((p) => p.id === pid) + 1;
    return html`
      <${L.PageHead} eyebrow=${html`${task ? html`<a href="#" onClick=${(e) => { e.preventDefault(); L.openTask(task.id); }}>${task.title}</a>` : "Tarea"} · Revisión de imagen`} title=${r.titulo}
        sub=${`${r.version || "v1"} · ${open ? L.plural(open, "comentario abierto", "comentarios abiertos") : "sin comentarios abiertos"} · pidió ${q.name(r.by)}`}>
        ${versions.length > 1 && html`<select class="select" value=${r.id} onChange=${(e) => L.go("#revision/" + e.target.value)} aria-label="Versión">${versions.map((v) => html`<option key=${v.id} value=${v.id}>${v.version || "v1"} · ${L.fmtShort((v.created || "").slice(0, 10))}${v.estado === "resuelta" ? " · resuelta" : ""}</option>`)}</select>`}
        ${L.desk && html`<button type="button" class="btn" onClick=${() => L.openPath(r.ruta)}><${Icon} name="folder" /> Abrir carpeta</button>`}
        ${L.desk && html`<button type="button" class="btn" onClick=${newVersion}><${Icon} name="plus" size=${12} /> Nueva versión</button>`}
        <button type="button" class=${L.cx("btn", r.estado === "abierta" && "primary")} onClick=${() => act.save("revisiones", r.id, { estado: r.estado === "abierta" ? "resuelta" : "abierta" })}>${r.estado === "abierta" ? "Marcar resuelta" : "Reabrir"}</button>
      <//>
      <div class="review">
        <div class="glass review-stage">
          ${failed ? html`<${Empty} small title="No encuentro la imagen en este PC" text=${"Revisa que la carpeta esté sincronizada: " + r.ruta} />` : html`
            <div class="review-img" ref=${box} onClick=${place}>
              <img src=${fileUrl(r.ruta)} alt=${r.titulo} onError=${() => setFailed(true)} draggable="false" />
              ${pins.map((p, i) => html`<button type="button" key=${p.id} class=${L.cx("pin", p.resolved && "done", sel === p.id && "sel")} style=${{ left: p.x * 100 + "%", top: p.y * 100 + "%" }} onClick=${(e) => { e.stopPropagation(); setSel(p.id); setDraft(null); }} title=${p.text}>${i + 1}</button>`)}
              ${draft && html`<div class="pin draft" style=${{ left: draft.x * 100 + "%", top: draft.y * 100 + "%" }}>+</div>
                <form class="pin-pop glass" style=${{ left: Math.min(draft.x, 0.7) * 100 + "%", top: draft.y * 100 + "%" }} onClick=${(e) => e.stopPropagation()} onSubmit=${(e) => { e.preventDefault(); addPin(); }}>
                  <textarea autofocus value=${draft.text} onInput=${(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Qué hay que cambiar aquí" onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addPin(); } if (e.key === "Escape") setDraft(null); }}></textarea>
                  <div class="inline"><button type="submit" class="btn sm primary">Comentar</button><button type="button" class="btn sm ghost" onClick=${() => setDraft(null)}>Cancelar</button></div>
                </form>`}
            </div>`}
          ${r.estado === "abierta" && !failed && html`<p class="meta-line">Haz clic sobre la imagen para dejar un comentario en ese punto.</p>`}
        </div>
        <aside class="glass panel review-side">
          <div class="panel-head"><h2><span class="sl">/</span>Comentarios</h2><span class="tag">${open} abiertos</span></div>
          ${pins.length ? pins.map((p) => html`
            <div class=${L.cx("pin-item", sel === p.id && "sel", p.resolved && "done")} key=${p.id} onClick=${() => setSel(p.id)}>
              <div class="pin-head"><span class="pin-n">${n(p.id)}</span><${Avatar} id=${p.by} /><b>${L.first(q.name(p.by))}</b><time>${L.relTime(p.at)}</time>
                <label class="check small" onClick=${(e) => e.stopPropagation()}><input type="checkbox" checked=${!!p.resolved} onChange=${() => update(p.id, (x) => ({ ...x, resolved: !x.resolved }))} />Resuelto</label></div>
              <p>${p.text}</p>
              ${(p.replies || []).map((rp, i) => html`<div class="reply" key=${i}><b>${L.first(q.name(rp.by))}</b> ${rp.text}<time>${L.relTime(rp.at)}</time></div>`)}
              ${sel === p.id && html`<form class="reply-form" onSubmit=${(e) => { e.preventDefault(); if (!reply.trim()) return; update(p.id, (x) => ({ ...x, replies: [...(x.replies || []), { by: L.state.me.id, text: reply.trim(), at: new Date().toISOString() }] })); setReply(""); }}>
                <input value=${reply} onInput=${(e) => setReply(e.target.value)} placeholder="Responder" /><button type="submit" class="btn sm">Enviar</button>
                ${p.by === L.state.me.id && html`<button type="button" class="btn sm ghost danger" onClick=${() => savePins(latest().filter((x) => x.id !== p.id))}>Borrar</button>`}</form>`}
            </div>`) : html`<p class="note">Todavía no hay comentarios. Haz clic sobre la imagen en el punto que quieras señalar.</p>`}
        </aside>
      </div>`;
  }

  // Botón del panel de tarea: pide revisión de una imagen de la carpeta del entregable.
  async function requestReview(task) {
    if (!L.desk) { L.toast("La revisión de imágenes funciona en la app de escritorio."); return; }
    const file = await L.desk.pickFile(task.path || "");
    if (!file) return;
    const prev = L.state.revisiones.filter((x) => x.task === task.id);
    const r = await act.save("revisiones", null, { task: task.id, project: task.project || "", titulo: task.title, ruta: file, version: "v" + (prev.length + 1), estado: "abierta", pins: [], by: L.state.me.id });
    if (r) { L.closeSheet(); L.go("#revision/" + r.id); }
  }

  /* ---------- dentro del panel de tarea: dependencias, subtareas y revisiones ---------- */
  function DependsField({ id, project, value, onChange }) {
    const s = L.useStore();
    const options = s.tareas.filter((t) => t.project === project && t.id !== id && !t.parent && (t.status !== "terminado" || value.includes(t.id))).sort(L.byDue);
    const [adding, setAdding] = useState(false);
    if (!options.length && !value.length) return null;
    const blocking = value.map((d) => q.task(d)).filter((t) => t && t.status !== "terminado");
    return html`<div class="fld"><span class="lbl">Depende de</span>
      <div class="deps">${value.map((d) => { const t = q.task(d); return t && html`<span key=${d} class=${L.cx("chip dep", t.status === "terminado" && "ok")}>${t.status === "terminado" ? "✓ " : ""}${t.title}<button type="button" aria-label="Quitar" onClick=${() => onChange(value.filter((x) => x !== d))}>×</button></span>`; })}
        ${adding ? html`<select class="select" autofocus onChange=${(e) => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false); }} onBlur=${() => setAdding(false)}><option value="">Elige la tarea…</option>${options.filter((t) => !value.includes(t.id)).map((t) => html`<option key=${t.id} value=${t.id}>${t.title}</option>`)}</select>`
          : html`<button type="button" class="btn sm ghost" onClick=${() => setAdding(true)}><${Icon} name="plus" size=${11} /> Agregar</button>`}</div>
      ${blocking.length > 0 && html`<span class="hint warn">No puede arrancar hasta que ${blocking.length === 1 ? "se termine esa tarea" : "se terminen esas tareas"}. Si se atrasan, se avisa.</span>`}
    </div>`;
  }

  function originLabel(origen) {
    const [k, oid] = String(origen || "").split(":");
    if (k === "evento") { const e = L.state.eventos.find((x) => x.id === oid); return "Compromiso del acta" + (e ? " de «" + e.title + "»" : ""); }
    if (k === "visita") { const v = L.state.visitas.find((x) => x.id === oid); return "Pendiente de la visita de obra" + (v ? " del " + L.fmtShort(v.fecha) : ""); }
    if (k === "solicitud") { const r = L.state.solicitudes.find((x) => x.id === oid); return "Viene de la solicitud" + (r ? " «" + r.titulo + "» de " + q.first(r.solicitante) : ""); }
    return "";
  }

  function TaskExtras({ task }) {
    const s = L.useStore();
    const subs = q.subtasks(task.id).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
    const [sub, setSub] = useState("");
    const revs = s.revisiones.filter((r) => r.task === task.id).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    const addSub = async () => {
      if (!sub.trim()) return;
      const r = await act.createTasks([{ title: sub.trim(), parent: task.id, project: task.project || "", area: task.area || "", assignees: task.assignees || [], start: task.start || "", due: task.due || "" }]);
      if (r) setSub("");
    };
    const toggle = (t) => act.saveTask(t.id, { status: t.status === "terminado" ? "pendiente" : "terminado", progress: t.status === "terminado" ? 0 : 100 });
    const done = subs.filter((t) => t.status === "terminado").length;
    return html`<div class="extras">
      <div class="fld"><span class="lbl">Subtareas ${subs.length ? html`<span class="muted">· ${done} de ${subs.length}</span>` : ""}</span>
        <div class="subs">${subs.map((t) => html`<div class="sub" key=${t.id}><input type="checkbox" checked=${t.status === "terminado"} onChange=${() => toggle(t)} aria-label="Terminada" /><a href="#" class=${t.status === "terminado" ? "done" : ""} onClick=${(e) => { e.preventDefault(); L.openTask(t.id); }}>${t.title}</a>${t.assignees && t.assignees.length > 0 && html`<${Faces} ids=${t.assignees} />`}</div>`)}
          <div class="sub add"><input value=${sub} onInput=${(e) => setSub(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} placeholder="Agregar un paso y Enter" aria-label="Nueva subtarea" /></div></div></div>
      <div class="fld"><span class="lbl">Revisión de imágenes</span>
        <div class="revs">${revs.map((r) => { const open = (r.pins || []).filter((p) => !p.resolved).length; return html`<a key=${r.id} class="rev-link" href=${"#revision/" + r.id} onClick=${() => L.closeSheet()}><b class="mono">${r.version || "v1"}</b> ${r.estado === "resuelta" ? "resuelta" : open ? L.plural(open, "comentario abierto", "comentarios abiertos") : "sin comentarios"}</a>`; })}
          <button type="button" class="btn sm" onClick=${() => requestReview(task)}><${Icon} name="plus" size=${11} /> ${revs.length ? "Otra imagen" : "Pedir revisión de una imagen"}</button></div></div>
    </div>`;
  }

  Object.assign(L, { DependsField, TaskExtras, originLabel, ToolSheet, openTool, Health, HealthDot, PlanTemplate, Commitments, LicenciasTab, PlanosTab, ObraTab, FinanzasTab, RevisionView, requestReview, projectMoney, fileUrl, isImage, labelOf: label });
})();
