// Vistas del estudio: solicitudes entre áreas, directorio, materiales, horas, ausencias, finanzas y carga de trabajo.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Panel, Empty, Seg, Avatar, Faces, Icon, PathBlock, AreaTag } = L;
  const { useState } = hooks;
  const today = () => L.todayIso();
  const label = (arr, id) => { const x = arr.find((o) => o.id === id); return x ? x.label : id || ""; };
  const openTool = (col, id, d) => L.openTool(col, id, d);
  const norm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* ---------- solicitudes entre áreas ---------- */
  function Solicitudes() {
    const s = L.useStore();
    const me = s.me;
    const myAreas = me.areas || [];
    const canAttend = (r) => q.isDirector() || myAreas.includes(r.area);
    const [tab, setTab] = useState(myAreas.length ? "area" : "mias");
    const [answer, setAnswer] = useState({}); // id → texto
    const all = [...s.solicitudes].sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    const lists = {
      area: all.filter((r) => myAreas.includes(r.area) && r.estado !== "rechazada"),
      mias: all.filter((r) => r.solicitante === me.id),
      todas: all,
    };
    const shown = lists[tab] || [];
    const order = { nueva: 0, aceptada: 1, lista: 2, rechazada: 3 };
    shown.sort((a, b) => order[a.estado] - order[b.estado]);
    const accept = async (r) => {
      const [t] = (await act.createTasks([{ title: r.titulo, project: r.project || "", area: r.area, assignees: [me.id], start: today(), due: r.fechaNecesaria || L.iso(L.addDays(L.today(), 5)), notes: r.descripcion || "", path: r.ruta || "", origen: "solicitud:" + r.id }])) || [];
      if (t && await act.save("solicitudes", r.id, { estado: "aceptada", atiende: me.id, tarea: t.id })) L.toast("Aceptada. Ya está en tu cronograma como tarea.");
    };
    const close = async (r, estado) => {
      if (await act.save("solicitudes", r.id, { estado, respuesta: (answer[r.id] || "").trim(), atiende: r.atiende || me.id })) { L.toast(estado === "lista" ? "Solicitud entregada. Se le avisó a " + L.first(q.name(r.solicitante)) : "Solicitud rechazada"); setAnswer({ ...answer, [r.id]: "" }); }
    };
    const count = (k) => lists[k].filter((r) => r.estado === "nueva").length || null;
    return html`
      <${L.PageHead} title="Solicitudes" sub="Lo que un área le pide a otra: renders, impresiones, compras, cotizaciones. Al aceptarla se vuelve tarea.">
        <button type="button" class="btn primary" onClick=${() => openTool("solicitudes", null, {})}><${Icon} name="plus" size=${12} /> Nueva solicitud</button>
      <//>
      <div class="toolbar"><${Seg} label="Solicitudes" value=${tab} onChange=${setTab} options=${[
        ...(myAreas.length ? [{ id: "area", label: "Para mi área", count: count("area") }] : []),
        { id: "mias", label: "Las que pedí", count: lists.mias.filter((r) => r.estado !== "lista" && r.estado !== "rechazada").length || null },
        { id: "todas", label: "Todas" },
      ]} /></div>
      ${shown.length ? html`<div class="grid">${shown.map((r) => {
        const p = q.project(r.project);
        const t = r.tarea && q.task(r.tarea);
        const late = r.fechaNecesaria && r.fechaNecesaria < today() && (r.estado === "nueva" || r.estado === "aceptada");
        return html`<article class=${L.cx("glass panel span-6 solicitud", "st-" + r.estado)} key=${r.id}>
          <div class="sol-head"><${AreaTag} id=${r.area} /><span class="tag">${label(L.SOLICITUD_TIPOS, r.tipo)}</span>${r.prioridad === "urgente" && html`<span class="tag warn">Urgente</span>`}<span class="spacer"></span><span class=${"chip plain sol-" + r.estado}>${label(L.SOLICITUD_ESTADOS, r.estado)}</span></div>
          <h3 class="sol-title">${r.titulo}</h3>
          <div class="row-meta"><${Avatar} id=${r.solicitante} /><span>${q.name(r.solicitante)}</span>${p && html`<a href=${"#proyecto/" + p.id}>${p.code || p.name}</a>`}${r.fechaNecesaria && html`<span class=${L.cx("due", late && "late")}>Para ${L.relDay(r.fechaNecesaria).toLowerCase()}</span>`}</div>
          ${r.descripcion && html`<p class="agenda">${r.descripcion}</p>`}
          ${r.ruta && html`<${PathBlock} path=${r.ruta} />`}
          ${r.atiende && r.estado !== "nueva" && html`<p class="meta-line">La atiende ${q.name(r.atiende)}${t ? html` · <a href="#" onClick=${(e) => { e.preventDefault(); L.openTask(t.id); }}>tarea ${L.STATUS[t.status].label.toLowerCase()}</a>` : ""}</p>`}
          ${r.respuesta && html`<p class="sol-answer"><b>Respuesta:</b> ${r.respuesta}</p>`}
          ${canAttend(r) && (r.estado === "nueva" || r.estado === "aceptada") && html`<div class="sol-actions">
            <input value=${answer[r.id] || ""} onInput=${(e) => setAnswer({ ...answer, [r.id]: e.target.value })} placeholder=${r.estado === "nueva" ? "Respuesta (opcional)" : "Dónde quedó o qué se entregó"} aria-label="Respuesta" />
            ${r.estado === "nueva" && html`<button type="button" class="btn sm ghost danger" onClick=${() => close(r, "rechazada")}>Rechazar</button><button type="button" class="btn sm primary" onClick=${() => accept(r)}>Aceptar</button>`}
            ${r.estado === "aceptada" && html`<button type="button" class="btn sm primary" onClick=${() => close(r, "lista")}>Marcar entregada</button>`}
          </div>`}
          ${r.solicitante === me.id && r.estado === "nueva" && html`<div class="sol-actions"><span class="spacer"></span><button type="button" class="btn sm" onClick=${() => openTool("solicitudes", r.id)}><${Icon} name="edit" /> Editar</button></div>`}
        </article>`;
      })}</div>` : html`<div class="glass"><${Empty} small title=${tab === "area" ? "Tu área no tiene solicitudes" : "Nada por aquí"} text="Cuando alguien necesite algo de otra área, lo pide aquí y le llega aviso a esa área." /></div>`}`;
  }

  /* ---------- directorio ---------- */
  function Directorio() {
    const s = L.useStore();
    const [tipo, setTipo] = useState("");
    const [text, setText] = useState("");
    const list = s.contactos.filter((c) => (!tipo || c.tipo === tipo) && (!text || norm([c.nombre, c.empresa, c.especialidad, c.ciudad, c.cargo].join(" ")).includes(norm(text))))
      .sort((a, b) => (a.empresa || a.nombre).localeCompare(b.empresa || b.nombre, "es"));
    const copy = (v) => L.copyText(v);
    return html`
      <${L.PageHead} title="Directorio" sub="Clientes, proveedores, contratistas, consultores y entidades, con los proyectos en que han estado.">
        <button type="button" class="btn primary" onClick=${() => openTool("contactos", null, {})}><${Icon} name="plus" size=${12} /> Nuevo contacto</button>
      <//>
      <div class="toolbar"><${Seg} label="Tipo" value=${tipo} onChange=${setTipo} options=${[{ id: "", label: "Todos" }, ...L.CONTACTO_TIPOS.map((t) => ({ ...t, count: s.contactos.filter((c) => c.tipo === t.id).length || null }))]} />
        <span class="spacer"></span><input class="search-inline" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Buscar por nombre, empresa, especialidad…" aria-label="Buscar contacto" /></div>
      ${list.length ? html`<div class="cards">${list.map((c) => html`
        <article class="glass ccard" key=${c.id}>
          <div class="pcard-top"><span class="tag">${label(L.CONTACTO_TIPOS, c.tipo)}</span><span class="spacer"></span><button type="button" class="btn icon ghost sm" title="Editar" aria-label="Editar" onClick=${() => openTool("contactos", c.id)}><${Icon} name="edit" /></button></div>
          <h3>${c.empresa || c.nombre}</h3>
          ${c.empresa && html`<p class="muted">${c.nombre}${c.cargo ? " · " + c.cargo : ""}</p>`}
          ${c.especialidad && html`<p>${c.especialidad}${c.ciudad ? " · " + c.ciudad : ""}</p>`}
          <div class="contact-lines">
            ${c.telefono && html`<button type="button" class="copy-line" title="Copiar" onClick=${() => copy(c.telefono)}><span class="mono">${c.telefono}</span><${Icon} name="copy" size=${12} /></button>`}
            ${c.email && html`<button type="button" class="copy-line" title="Copiar" onClick=${() => copy(c.email)}><span>${c.email}</span><${Icon} name="copy" size=${12} /></button>`}
          </div>
          ${(c.proyectos || []).length > 0 && html`<div class="pcard-areas">${c.proyectos.map((pid) => { const p = q.project(pid); return p && html`<a key=${pid} class="chip plain" href=${"#proyecto/" + pid}>${p.code || p.name}</a>`; })}</div>`}
          ${c.notas && html`<p class="meta-line">${c.notas}</p>`}
        </article>`)}</div>` : html`<div class="glass"><${Empty} small title=${s.contactos.length ? "Nada coincide" : "El directorio está vacío"} text="Guarda aquí a los proveedores y contratistas buenos para que todo el estudio los encuentre." /></div>`}`;
  }

  /* ---------- materiales ---------- */
  function Materiales() {
    const s = L.useStore();
    const [cat, setCat] = useState("");
    const [text, setText] = useState("");
    const [broken, setBroken] = useState({});
    const list = s.materiales.filter((m) => (!cat || m.categoria === cat) && (!text || norm([m.nombre, m.referencia, m.notas, (q.contacto(m.proveedor) || {}).empresa].join(" ")).includes(norm(text))))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return html`
      <${L.PageHead} title="Materiales y mobiliario" sub="La biblioteca del estudio: referencia, proveedor, precio y en qué proyectos se usó.">
        <button type="button" class="btn primary" onClick=${() => openTool("materiales", null, {})}><${Icon} name="plus" size=${12} /> Nuevo material</button>
      <//>
      <div class="toolbar"><select class="select" value=${cat} onChange=${(e) => setCat(e.target.value)} aria-label="Categoría"><option value="">Todas las categorías</option>${L.MATERIAL_CATS.map((c) => html`<option key=${c.id} value=${c.id}>${c.label}</option>`)}</select>
        <span class="spacer"></span><input class="search-inline" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Buscar material, referencia o proveedor…" aria-label="Buscar material" /></div>
      ${list.length ? html`<div class="cards">${list.map((m) => {
        const prov = q.contacto(m.proveedor);
        const img = L.desk && L.isImage(m.ruta) && !broken[m.id];
        return html`<article class="glass mcard" key=${m.id} onClick=${() => openTool("materiales", m.id)}>
          <div class="mthumb">${img ? html`<img src=${L.fileUrl(m.ruta)} alt="" loading="lazy" onError=${() => setBroken({ ...broken, [m.id]: true })} />` : html`<span>${label(L.MATERIAL_CATS, m.categoria)}</span>`}</div>
          <div class="mbody"><h3>${m.nombre}</h3>
            <p class="muted">${[prov && (prov.empresa || prov.nombre), m.referencia].filter(Boolean).join(" · ") || label(L.MATERIAL_CATS, m.categoria)}</p>
            ${m.precio > 0 && html`<p class="mono">${L.money(m.precio)}${m.unidad ? " / " + m.unidad : ""}</p>`}
            ${(m.proyectos || []).length > 0 && html`<div class="pcard-areas">${m.proyectos.slice(0, 4).map((pid) => { const p = q.project(pid); return p && html`<span key=${pid} class="chip plain">${p.code || p.name}</span>`; })}</div>`}
            ${m.ruta && html`<div onClick=${(e) => e.stopPropagation()}><${PathBlock} path=${m.ruta} /></div>`}</div>
        </article>`;
      })}</div>` : html`<div class="glass"><${Empty} small title=${s.materiales.length ? "Nada coincide" : "La biblioteca está vacía"} text="Registra los acabados y muebles que especifican; la imagen o ficha se queda en su carpeta y aquí solo va la ruta." /></div>`}`;
  }

  /* ---------- horas ---------- */
  function Horas() {
    const s = L.useStore();
    const [week, setWeek] = useState(() => L.monday(L.today()));
    const [who, setWho] = useState(s.me.id);
    const days = Array.from({ length: 7 }, (_, i) => L.iso(L.addDays(week, i)));
    const rows = s.horas.filter((h) => h.user === who && h.fecha >= days[0] && h.fecha <= days[6]);
    const byProject = new Map();
    for (const h of rows) { if (!byProject.has(h.project)) byProject.set(h.project, {}); const m = byProject.get(h.project); m[h.fecha] = (m[h.fecha] || 0) + (Number(h.horas) || 0); }
    const dayTotal = (d) => rows.filter((h) => h.fecha === d).reduce((a, h) => a + (Number(h.horas) || 0), 0);
    const total = rows.reduce((a, h) => a + (Number(h.horas) || 0), 0);
    const people = q.isFin() ? q.staff() : [s.me];
    const mine = who === s.me.id;
    return html`
      <${L.PageHead} title=${mine ? "Mis horas" : "Horas de " + L.first(q.name(who))} sub=${`Semana ${L.isoWeek(week)} · ${L.fmtShort(days[0])} a ${L.fmtShort(days[6])} · ${L.hours(total)}`}>
        ${people.length > 1 && html`<select class="select" value=${who} onChange=${(e) => setWho(e.target.value)} aria-label="Persona">${people.map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}</select>`}
        <button type="button" class="btn icon" aria-label="Semana anterior" onClick=${() => setWeek(L.addDays(week, -7))}><${Icon} name="left" /></button>
        <button type="button" class="btn" onClick=${() => setWeek(L.monday(L.today()))}>Hoy</button>
        <button type="button" class="btn icon" aria-label="Semana siguiente" onClick=${() => setWeek(L.addDays(week, 7))}><${Icon} name="right" /></button>
        ${mine && html`<button type="button" class="btn primary" onClick=${() => openTool("horas", null, {})}><${Icon} name="plus" size=${12} /> Registrar horas</button>`}
      <//>
      <div class="glass hours-grid">
        <div class="hg-row head"><div>Proyecto</div>${days.map((d) => html`<div key=${d} class=${d === today() ? "today" : ""}>${L.DIAS_C[L.parse(d).getDay()]} ${L.parse(d).getDate()}</div>`)}<div>Total</div></div>
        ${[...byProject.entries()].map(([pid, m]) => { const p = q.project(pid); const sum = Object.values(m).reduce((a, b) => a + b, 0); return html`
          <div class="hg-row" key=${pid}><div class="t">${p ? html`<a href=${"#proyecto/" + pid}>${p.code ? p.code + " · " : ""}${p.name}</a>` : "Proyecto eliminado"}</div>${days.map((d) => html`<div key=${d} class="mono">${m[d] ? L.hours(m[d]) : ""}</div>`)}<div class="mono"><b>${L.hours(sum)}</b></div></div>`; })}
        ${!byProject.size && html`<p class="note">Sin horas registradas esta semana. ${mine ? "Regístralas aquí o desde el panel de cada tarea." : ""}</p>`}
        <div class="hg-row foot"><div>Total del día</div>${days.map((d) => html`<div key=${d} class="mono">${dayTotal(d) ? L.hours(dayTotal(d)) : ""}</div>`)}<div class="mono"><b>${L.hours(total)}</b></div></div>
      </div>
      ${rows.length > 0 && html`<${Panel} title="Detalle" cls="span-12"><div class="rows">${[...rows].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((h) => { const t = h.task && q.task(h.task); const p = q.project(h.project); return html`
        <div class="row" key=${h.id} onClick=${mine ? () => openTool("horas", h.id) : null}><${Icon} name="clock" /><div class="row-main"><div class="row-title">${t ? t.title : p ? p.name : ""}</div><div class="row-meta"><span>${L.cap(L.fmtLong(h.fecha))}</span>${h.nota && html`<span>${h.nota}</span>`}</div></div><div class="row-side"><b class="mono">${L.hours(h.horas)}</b></div></div>`; })}</div><//>`}`;
  }

  /* ---------- ausencias ---------- */
  function Ausencias() {
    const s = L.useStore();
    const t0 = today();
    const list = s.ausencias.filter((a) => a.hasta >= t0).sort((a, b) => a.desde.localeCompare(b.desde));
    const past = s.ausencias.filter((a) => a.hasta < t0).sort((a, b) => b.desde.localeCompare(a.desde)).slice(0, 20);
    const can = (a) => a.user === s.me.id || q.isDirector();
    const row = (a) => {
      const days = L.diff(L.parse(a.desde), L.parse(a.hasta)) + 1;
      const now = a.desde <= t0 && a.hasta >= t0;
      return html`<div class=${L.cx("row", !can(a) && "static")} key=${a.id} onClick=${can(a) ? () => openTool("ausencias", a.id) : null}>
        <${Avatar} id=${a.user} />
        <div class="row-main"><div class="row-title">${q.name(a.user)}</div><div class="row-meta"><span>${label(L.AUSENCIA_TIPOS, a.tipo)}</span>${a.nota && html`<span>${a.nota}</span>`}</div></div>
        <div class="row-side">${now && html`<span class="tag warn">Hoy no está</span>`}<span class="due">${a.desde === a.hasta ? L.fmtShort(a.desde) : L.fmtShort(a.desde) + " a " + L.fmtShort(a.hasta)}</span><span class="muted">${L.plural(days, "día", "días")}</span></div>
      </div>`;
    };
    return html`
      <${L.PageHead} title="Ausencias" sub="Vacaciones, permisos e incapacidades. Se ven en Equipo y en la carga de trabajo para no asignarle entregas a quien no está.">
        <button type="button" class="btn primary" onClick=${() => openTool("ausencias", null, {})}><${Icon} name="plus" size=${12} /> Registrar ausencia</button>
      <//>
      <div class="grid">
        <${Panel} title="Ahora y próximas" cls="span-12"><div class="rows">${list.length ? list.map(row) : html`<p class="note">Nadie tiene ausencias registradas.</p>`}</div><//>
        ${past.length > 0 && html`<${Panel} title="Anteriores" cls="span-12"><div class="rows">${past.map(row)}</div><//>`}
      </div>`;
  }

  /* ---------- finanzas del estudio ---------- */
  function Tarifas() {
    const s = L.useStore();
    const [draft, setDraft] = useState({});
    const save = async (u) => {
      const v = Number(String(draft[u.id] ?? "").replace(/[^\d]/g, ""));
      const cur = s.tarifas.find((t) => t.user === u.id);
      if (!v && cur) { await act.remove("tarifas", cur.id); }
      else if (v) { await act.save("tarifas", cur ? cur.id : null, { user: u.id, valorHora: v }); }
      setDraft({ ...draft, [u.id]: undefined });
      L.toast("Tarifa guardada");
    };
    return html`<${Panel} title="Tarifas por hora" cls="span-5" action=${html`<span class="tag">Solo Dirección y Administración</span>`}>
      <p class="note">El costo interno de una hora de cada persona. Con esto se calcula el margen de cada proyecto.</p>
      <div class="rows">${q.staff().map((u) => { const cur = s.tarifas.find((t) => t.user === u.id); const v = draft[u.id] ?? (cur ? String(cur.valorHora) : ""); return html`
        <div class="row static" key=${u.id}><${Avatar} id=${u.id} /><div class="row-main"><div class="row-title">${u.name}</div></div>
          <input class="rate mono" inputmode="numeric" value=${v} placeholder="$ / hora" onInput=${(e) => setDraft({ ...draft, [u.id]: e.target.value })} onKeyDown=${(e) => { if (e.key === "Enter") save(u); }} aria-label=${"Tarifa de " + u.name} />
          ${draft[u.id] !== undefined && html`<button type="button" class="btn sm primary" onClick=${() => save(u)}>Guardar</button>`}</div>`; })}</div>
    <//>`;
  }

  function Finanzas() {
    const s = L.useStore();
    if (!q.isFin()) return html`<div class="glass"><${Empty} title="Solo para Dirección y Administración" text="Quien lidera un proyecto ve sus finanzas en la pestaña Finanzas del proyecto." /></div>`;
    const t0 = today();
    const projects = s.proyectos.filter((p) => p.status !== "cerrado" || s.cobros.some((c) => c.project === p.id && c.estado !== "pagado"));
    const data = projects.map((p) => ({ p, m: L.projectMoney(p.id) })).filter((x) => x.m.contratado || x.m.totalHoras).sort((a, b) => b.m.contratado - a.m.contratado);
    const sum = (k) => data.reduce((a, x) => a + x.m[k], 0);
    const vencidos = s.cobros.filter((c) => c.estado !== "pagado" && c.fechaEsperada && c.fechaEsperada < t0).sort((a, b) => a.fechaEsperada.localeCompare(b.fechaEsperada));
    const proximos = s.cobros.filter((c) => c.estado !== "pagado" && c.fechaEsperada && c.fechaEsperada >= t0 && c.fechaEsperada <= L.iso(L.addDays(L.today(), 30))).sort((a, b) => a.fechaEsperada.localeCompare(b.fechaEsperada));
    const cobroRow = (c) => { const p = q.project(c.project); return html`<div class="row" key=${c.id} onClick=${() => openTool("cobros", c.id)}><span class="glyph" data-s=${c.estado === "facturado" ? "en_curso" : "pendiente"}></span>
      <div class="row-main"><div class="row-title">${c.concepto}</div><div class="row-meta"><span>${p ? (p.code ? p.code + " · " : "") + p.name : ""}</span><span>${label(L.COBRO_ESTADOS, c.estado)}</span></div></div>
      <div class="row-side"><b class="mono">${L.money(c.valor)}</b><span class=${L.cx("due", c.fechaEsperada < t0 && "late")}>${L.relDay(c.fechaEsperada)}</span></div></div>`; };
    return html`
      <${L.PageHead} title="Finanzas" sub="Honorarios, cobros y rentabilidad de los proyectos. Solo lo ven Dirección y Administración." />
      <div class="grid">
        <div class="glass metrics span-12 money" role="list">
          <div class="metric" role="listitem"><b>${L.money(sum("contratado"))}</b><span>Honorarios activos</span></div>
          <div class="metric" role="listitem"><b>${L.money(sum("pagado"))}</b><span>Pagado</span></div>
          <div class="metric" role="listitem"><b>${L.money(sum("facturado"))}</b><span>Facturado sin pagar</span></div>
          <div class=${L.cx("metric", vencidos.length ? "alert" : "zero")} role="listitem"><b>${L.money(vencidos.reduce((a, c) => a + (Number(c.valor) || 0), 0))}</b><span>Vencido</span></div>
        </div>
        <${Panel} title="Cobros vencidos" cls="span-6" action=${html`<span class="tag">${vencidos.length}</span>`}><div class="rows">${vencidos.length ? vencidos.map(cobroRow) : html`<p class="note">Nada vencido.</p>`}</div><//>
        <${Panel} title="Próximos 30 días" cls="span-6" action=${html`<span class="tag">${proximos.length}</span>`}><div class="rows">${proximos.length ? proximos.map(cobroRow) : html`<p class="note">Sin cobros esperados en el próximo mes.</p>`}</div><//>
        <${Panel} title="Proyectos" cls="span-7">
          ${data.length ? html`<div class="fin-table">
            <div class="fin-row head"><div>Proyecto</div><div>Honorarios</div><div>Cobrado</div><div>Horas</div><div>Margen</div></div>
            ${data.map(({ p, m }) => html`<a class="fin-row" key=${p.id} href=${"#proyecto/" + p.id + "/finanzas"}>
              <div class="t">${p.code ? html`<span class="mono">${p.code}</span> ` : ""}${p.name} <${L.HealthDot} p=${p} /></div>
              <div class="mono">${L.money(m.contratado)}</div>
              <div><span class="bar-track" data-s="terminado"><i style=${{ width: (m.contratado ? Math.min(100, (m.pagado / m.contratado) * 100) : 0) + "%" }}></i></span></div>
              <div class="mono">${L.hours(m.totalHoras)}</div>
              <div class=${L.cx("mono", m.conTarifas && m.margen < 0 && "neg")}>${m.conTarifas ? L.money(m.margen) : "—"}</div>
            </a>`)}
          </div>` : html`<p class="note">Registra los cobros de cada proyecto en su pestaña Finanzas.</p>`}
        <//>
        <${Tarifas} />
      </div>`;
  }

  /* ---------- carga de trabajo por semana (en Equipo) ---------- */
  function Carga() {
    const s = L.useStore();
    const weeks = Array.from({ length: 5 }, (_, i) => L.addDays(L.monday(L.today()), i * 7));
    const staff = L.sortPeople ? L.sortPeople(q.staff()) : q.staff();
    const cell = (u, w, i) => {
      const a = L.iso(w), b = L.iso(L.addDays(w, 6)), lo = i === 0 ? "0000" : a;
      const n = s.tareas.filter((t) => t.status !== "terminado" && (t.assignees || []).includes(u.id) && t.due && t.due >= lo && t.due <= b).length;
      const off = s.ausencias.filter((x) => x.user === u.id && x.desde <= b && x.hasta >= a);
      const lvl = n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
      return html`<div key=${a} class=${"load-cell l" + lvl} title=${`${L.plural(n, "entrega", "entregas")}${off.length ? " · " + off.map((x) => label(L.AUSENCIA_TIPOS, x.tipo).toLowerCase()).join(", ") : ""}`}>${n || ""}${off.length > 0 && html`<i class="off" aria-label="Ausente parte de la semana"></i>`}</div>`;
    };
    return html`<${Panel} title="Carga de trabajo" cls="span-12" action=${html`<span class="tag">Entregas por semana · lo atrasado cuenta en esta semana</span>`}>
      <div class="load-grid" style=${{ "--weeks": weeks.length }}>
        <div class="load-row head"><div></div>${weeks.map((w) => html`<div key=${L.iso(w)}>Sem ${L.isoWeek(w)}<small>${L.fmtShort(L.iso(w))}</small></div>`)}</div>
        ${staff.map((u) => html`<div class="load-row" key=${u.id}><div class="who"><${Avatar} id=${u.id} /><span>${u.name}</span></div>${weeks.map((w, i) => cell(u, w, i))}</div>`)}
      </div>
      <div class="load-legend"><span><i class="load-cell l1"></i>1-2</span><span><i class="load-cell l2"></i>3-4</span><span><i class="load-cell l3"></i>5-6</span><span><i class="load-cell l4"></i>7 o más</span><span><i class="load-cell"><i class="off"></i></i>Ausencia</span></div>
    <//>`;
  }

  Object.assign(L, { Solicitudes, Directorio, Materiales, Horas, Ausencias, Finanzas, Carga });
})();
