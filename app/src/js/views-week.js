// "Mi semana" (resumen que arman los agentes con reglas) y la línea de tiempo de todo el estudio.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, Panel, Empty, Seg, Avatar, Faces, Icon, TaskRow, EventRow } = L;
  const { useState, useRef, useLayoutEffect } = hooks;

  const weekKey = () => L.iso(L.monday(L.today()));
  const open = (t) => t.status !== "terminado";
  const pendingDeps = (t) => (t.dependsOn || []).map((id) => q.task(id)).filter((d) => d && open(d));
  const who = (ids) => (ids || []).map((id) => L.first(q.name(id))).join(", ") || "sin responsable";
  // Tareas abiertas que ocupan a alguien en un rango de fechas (empiezan, siguen o vencen en él).
  const active = (t, a, b) => open(t) && !!t.due && (t.start || t.due) <= b && t.due >= a;
  const LOAD_MED = 4, LOAD_HIGH = 6;
  const loadLevel = (n) => (n >= LOAD_HIGH ? "high" : n >= LOAD_MED ? "med" : n ? "ok" : "");

  /* ================= Mi semana ================= */
  function Semana({ offset = 0 }) {
    const s = L.useStore();
    const me = s.me;
    const mon = L.addDays(L.monday(L.today()), 7 * offset);
    const a = L.iso(mon), b = L.iso(L.addDays(mon, 6)), t = L.todayIso();
    const mine = q.myTasks(me.id).filter(open);
    const vencen = mine.filter((x) => x.due && x.due >= (offset ? a : t) && x.due <= b).sort(L.byDue);
    const late = offset === 0 ? mine.filter((x) => x.due && x.due < t).sort(L.byDue) : [];
    const blocked = mine.filter((x) => pendingDeps(x).length);
    const waiting = s.tareas.filter((x) => open(x) && !(x.assignees || []).includes(me.id) && pendingDeps(x).some((d) => (d.assignees || []).includes(me.id)));
    const meetings = q.myEvents(me.id).filter((e) => e.date >= a && e.date <= b).sort((x, y) => L.eventStamp(x).localeCompare(L.eventStamp(y)));
    const aus = s.ausencias.filter((x) => x.desde <= b && x.hasta >= a && q.user(x.user)).sort((x, y) => x.desde.localeCompare(y.desde));
    const byDay = {};
    for (const x of vencen) (byDay[x.due] = byDay[x.due] || []).push(x);
    const director = q.isDirector();
    const tipo = (id) => (L.AUSENCIA_TIPOS.find((x) => x.id === id) || { label: "Ausente" }).label;
    return html`
      <${L.PageHead} eyebrow=${`Semana ${L.isoWeek(mon)} · ${L.fmtShort(mon)} al ${L.fmtShort(L.addDays(mon, 6))}`} title=${offset ? "La próxima semana" : "Mi semana"}
        sub="Lo que vence, lo que está atrasado, lo que espera a otros y quién del equipo no estará. Se arma solo con tus tareas y reuniones.">
        <div class="seg" role="group" aria-label="Semana"><button type="button" aria-pressed=${!offset} onClick=${() => L.go("#semana")}>Esta semana</button><button type="button" aria-pressed=${!!offset} onClick=${() => L.go("#semana/proxima")}>Próxima</button></div>
      <//>
      <div class="grid">
        <div class="glass metrics four span-12" role="list">
          <div class=${L.cx("metric", !vencen.length && "zero")} role="listitem"><b>${vencen.length}</b><span>Vencen en la semana</span></div>
          <div class=${L.cx("metric", late.length ? "alert" : "zero")} role="listitem"><b>${late.length}</b><span>Atrasadas</span></div>
          <div class=${L.cx("metric", blocked.length ? "alert" : "zero")} role="listitem"><b>${blocked.length}</b><span>Bloqueadas</span></div>
          <div class=${L.cx("metric", !meetings.length && "zero")} role="listitem"><b>${meetings.length}</b><span>Reuniones</span></div>
        </div>
        <${Panel} title="Vence en la semana" cls="span-7" action=${html`<a class="link" href="#agenda">Mi cronograma</a>`}>
          <div class="rows">
            ${late.length > 0 && html`<div class="group-label late">Atrasadas<span class="mono">${late.length}</span></div>${late.map((x) => html`<${TaskRow} key=${x.id} task=${x} />`)}`}
            ${Object.keys(byDay).sort().map((d) => html`<${L.Fragment} key=${d}><div class=${L.cx("group-label", d === t && "today")}>${L.cap(L.fmtLong(d))}<span class="mono">${byDay[d].length}</span></div>${byDay[d].map((x) => html`<${TaskRow} key=${x.id} task=${x} />`)}<//>`)}
            ${!vencen.length && !late.length && html`<p class="note">Nada vence ${offset ? "la próxima semana" : "esta semana"}. Las tareas que te asignen aparecen aquí.</p>`}
          </div>
        <//>
        <${Panel} title="Reuniones" cls="span-5" action=${html`<a class="link" href="#reuniones">Todas</a>`}>
          <div class="rows">${meetings.length ? meetings.map((e) => html`<${EventRow} key=${e.id} ev=${e} />`) : html`<p class="note">Sin reuniones ni comités ${offset ? "la próxima semana" : "esta semana"}.</p>`}</div>
        <//>
        <${Panel} title="Bloqueadas: esperas a otros" cls="span-6" action=${html`<span class="tag">${blocked.length}</span>`}>
          <div class="rows">${blocked.length ? blocked.map((x) => html`<div class="row wait" key=${x.id} onClick=${() => L.openTask(x.id)}><span class="glyph" data-s="pendiente"></span>
            <span class="row-body"><b>${x.title}</b><span class="row-meta">${pendingDeps(x).map((d) => html`<span key=${d.id}>Espera «${d.title}» de ${who(d.assignees)}${d.due ? " · " + L.relDay(d.due) : ""}</span>`)}</span></span></div>`)
            : html`<p class="note">Nada tuyo está esperando trabajo de otra persona.</p>`}</div>
        <//>
        <${Panel} title="Otros te esperan" cls="span-6" action=${html`<span class="tag">${waiting.length}</span>`}>
          <div class="rows">${waiting.length ? waiting.map((x) => html`<div class="row wait" key=${x.id} onClick=${() => L.openTask(x.id)}><span class="glyph" data-s="revision"></span>
            <span class="row-body"><b>${x.title}</b><span class="row-meta"><span>${who(x.assignees)} necesita${(x.assignees || []).length > 1 ? "n" : ""}: ${pendingDeps(x).filter((d) => (d.assignees || []).includes(me.id)).map((d) => "«" + d.title + "»").join(", ")}</span></span></span></div>`)
            : html`<p class="note">Nadie está bloqueado esperando algo tuyo.</p>`}</div>
        <//>
        <${Panel} title="Quién no estará" cls="span-12" action=${html`<a class="link" href="#ausencias">Ausencias</a>`}>
          <div class="rows">${aus.length ? aus.map((x) => html`<div class="row" key=${x.id}><${Avatar} id=${x.user} /><span class="row-body"><b>${q.name(x.user)}</b><span class="row-meta"><span>${tipo(x.tipo)} · del ${L.fmtShort(x.desde)} al ${L.fmtShort(x.hasta)}</span></span></span></div>`)
            : html`<p class="note">Todo el equipo está ${offset ? "la próxima semana" : "esta semana"}.</p>`}</div>
        <//>
        ${!offset && L.Premios && html`<${L.Premios} />`}
        ${!offset && L.Bienestar && html`<${L.Bienestar} />`}
        ${director && html`<${StudioWeek} a=${a} b=${b} />`}
      </div>`;
  }

  // Para Dirección: entregas, atrasos y carga de todo el estudio en la semana.
  function StudioWeek({ a, b }) {
    const s = L.useStore();
    const t = L.todayIso();
    const projects = s.proyectos.filter((p) => p.status !== "cerrado").map((p) => {
      const tasks = s.tareas.filter((x) => x.project === p.id && open(x));
      return { p, due: tasks.filter((x) => x.due && x.due >= a && x.due <= b).length, late: tasks.filter((x) => x.due && x.due < t).length,
        entregas: s.eventos.filter((e) => e.project === p.id && e.kind === "entrega" && e.date >= a && e.date <= b) };
    }).filter((x) => x.due || x.late || x.entregas.length).sort((x, y) => y.late - x.late || y.due - x.due);
    const people = q.staff().map((u) => ({ u, n: s.tareas.filter((x) => (x.assignees || []).includes(u.id) && active(x, a, b)).length, late: s.tareas.filter((x) => (x.assignees || []).includes(u.id) && open(x) && x.due && x.due < t).length, away: q.absent(u.id, a) || q.absent(u.id, b) }))
      .sort((x, y) => y.n - x.n);
    const max = Math.max(LOAD_HIGH, ...people.map((x) => x.n));
    return html`
      <${Panel} title="Todo el estudio: entregas y atrasos" cls="span-7">
        <div class="rows">${projects.length ? projects.map(({ p, due, late, entregas }) => html`<div class="row" key=${p.id} onClick=${() => L.go("#proyecto/" + p.id)}><span class="mono code">${p.code || "··"}</span>
          <span class="row-body"><b>${p.name}</b><span class="row-meta">${entregas.map((e) => html`<span key=${e.id} class="ent">Entrega ${L.fmtDay(e.date)}</span>`)}<span>${L.plural(due, "tarea vence", "tareas vencen")}</span>${late > 0 && html`<span class="late">${L.plural(late, "atrasada", "atrasadas")}</span>`}</span></span></div>`)
          : html`<p class="note">Ningún proyecto tiene entregas ni atrasos esta semana.</p>`}</div>
      <//>
      <${Panel} title="Carga de la semana" cls="span-5" action=${html`<a class="link" href="#linea">Línea de tiempo</a>`}>
        <div class="wk-load-list">${people.map(({ u, n, late, away }) => html`<div class="wk-load-row" key=${u.id}><${Avatar} id=${u.id} /><span class="nm">${L.first(u.name)}${away ? html` <small>ausente</small>` : ""}</span>
          <span class="lb"><i class=${loadLevel(n)} style=${{ width: (n / max) * 100 + "%" }}></i></span><span class="mono">${n}${late ? html` <b class="late">${late}↯</b>` : ""}</span></div>`)}</div>
        <p class="hint">Tareas abiertas que la persona tiene en la semana. Amarillo desde ${LOAD_MED}, rojo desde ${LOAD_HIGH}. ↯ = atrasadas.</p>
      <//>`;
  }

  /* ================= Línea de tiempo del estudio ================= */
  const ZOOMS = [{ id: "sem", label: "Semanas", weeks: 8 }, { id: "mes", label: "Meses", weeks: 17 }, { id: "tri", label: "Trimestre", weeks: 26 }];
  function Linea() {
    const s = L.useStore();
    const [mode, setMode] = useState("proyectos");
    const [zoom, setZoom] = useState("sem");
    const [shift, setShift] = useState(0);
    const [area, setArea] = useState("todas");
    const [openP, setOpenP] = useState({});
    const ref = useRef(null);
    const [width, setWidth] = useState(1100);
    useLayoutEffect(() => {
      const m = () => { if (ref.current) setWidth(ref.current.clientWidth); };
      m(); window.addEventListener("resize", m);
      return () => window.removeEventListener("resize", m);
    }, []);
    const Z = ZOOMS.find((z) => z.id === zoom);
    const t = L.today();
    const start = L.addDays(L.monday(t), -7 + shift * 7 * Math.max(1, Math.floor(Z.weeks / 4)));
    const days = Z.weeks * 7, end = L.addDays(start, days - 1);
    const a = L.iso(start), b = L.iso(end);
    const labelW = width < 760 ? 170 : 250;
    const dayW = Math.max(zoom === "sem" ? 16 : 4, (width - labelW - 2) / days);
    const pos = (d) => L.diff(start, d);
    const style = { "--day": dayW + "px", "--days": days, "--label": labelW + "px", width: labelW + dayW * days + "px" };
    const inArea = (x) => area === "todas" || x.area === area;
    const span = (sIso, eIso) => {
      let s0 = L.parse(sIso) || L.parse(eIso), e0 = L.parse(eIso) || L.parse(sIso);
      if (!s0) return null;
      if (e0 < s0) [s0, e0] = [e0, s0];
      if (e0 < start || s0 > end) return null;
      const x0 = Math.max(0, pos(s0)), x1 = Math.min(days - 1, pos(e0));
      return { left: x0 * dayW, width: Math.max(dayW, (x1 - x0 + 1) * dayW) };
    };
    const weeksArr = Array.from({ length: Z.weeks }, (_, i) => L.addDays(start, i * 7));
    const head = html`<div class="g-row g-head"><div class="g-label">${mode === "proyectos" ? "Proyecto" : "Persona y carga por semana"}</div><div class="g-lane plain">
      <div class="g-weeks">${weeksArr.map((w, i) => html`<span key=${i} title=${"Semana " + L.isoWeek(w) + " · " + L.fmtShort(w)}><b>S${L.isoWeek(w)}</b>${dayW * 7 >= 70 ? L.fmtShort(w) : ""}</span>`)}</div></div></div>`;
    const todayPos = pos(t);

    let body;
    if (mode === "duraciones") body = html`<${L.Duraciones} />`;
    else if (mode === "proyectos") {
      const projects = s.proyectos.filter((p) => p.status !== "cerrado").map((p) => {
        const tasks = s.tareas.filter((x) => x.project === p.id && x.due && inArea(x) && span(x.start, x.due));
        const marks = [
          ...s.eventos.filter((e) => e.project === p.id && (e.kind === "entrega" || e.kind === "cliente") && e.date >= a && e.date <= b).map((e) => ({ d: e.date, k: e.kind, label: (e.kind === "entrega" ? "Entrega: " : "Cliente: ") + e.title, go: () => L.go("#evento/" + e.id) })),
          ...s.tramites.filter((x) => x.project === p.id && x.estado === "observaciones" && x.fechaLimite && x.fechaLimite >= a && x.fechaLimite <= b).map((x) => ({ d: x.fechaLimite, k: "tramite", label: "Responder observaciones de la licencia", go: () => L.go("#proyecto/" + p.id + "/licencias") })),
        ];
        const openTasks = tasks.filter(open);
        const lo = openTasks.reduce((m, x) => ((x.start || x.due) < m ? x.start || x.due : m), "9999"), hi = openTasks.reduce((m, x) => (x.due > m ? x.due : m), "");
        return { p, tasks, marks, range: openTasks.length ? span(lo, hi) : null, late: openTasks.filter((x) => L.dueClass(x) === "late").length };
      }).filter((x) => x.tasks.length || (area === "todas" && x.marks.length)).sort((x, y) => (x.p.code || x.p.name).localeCompare(y.p.code || y.p.name, "es"));
      const allOpen = projects.length > 0 && projects.every((x) => openP[x.p.id]);
      body = html`
        <div class="toolbar"><button type="button" class="btn sm" onClick=${() => setOpenP(allOpen ? {} : Object.fromEntries(projects.map((x) => [x.p.id, true])))}>${allOpen ? "Cerrar todos" : "Abrir todos"}</button>
          <span class="tl-legend"><i class="mk entrega"></i>Entrega <i class="mk cliente"></i>Reunión con cliente <i class="mk tramite"></i>Plazo de licencia</span></div>
        <div class="glass gantt-card" ref=${ref}><div class="g-scroll"><div class="g-inner tl" style=${style}>
          ${head}
          ${projects.map(({ p, tasks, marks, range, late }) => html`<${L.Fragment} key=${p.id}>
            <div class="g-row g-proj tl-proj"><button type="button" class="g-label" aria-expanded=${!!openP[p.id]} onClick=${() => setOpenP({ ...openP, [p.id]: !openP[p.id] })}>
              <b><span class="caret">${openP[p.id] ? "▾" : "▸"}</span> ${p.code ? p.code + " · " : ""}${p.name}</b><small>${L.plural(tasks.filter(open).length, "tarea abierta", "tareas abiertas")}${late ? ` · ${late} atrasada${late > 1 ? "s" : ""}` : ""}${p.leader ? " · lidera " + L.first(q.name(p.leader)) : ""}</small></button>
              <div class="g-lane">
                ${range && html`<span class="tl-span" style=${{ left: range.left + "px", width: range.width + "px" }}></span>`}
                ${marks.map((m, i) => { const d = L.parse(m.d); return html`<button type="button" key=${i} class=${"mk " + m.k} style=${{ left: pos(d) * dayW + dayW / 2 + "px" }} title=${m.label + " · " + L.fmtDay(m.d)} aria-label=${m.label + ", " + L.fmtDay(m.d)} onClick=${m.go}></button>`; })}
              </div></div>
            ${openP[p.id] && tasks.sort((x, y) => (x.start || x.due).localeCompare(y.start || y.due)).map((x) => { const sp = span(x.start, x.due); return html`
              <div class="g-row" key=${x.id}><div class="g-label"><b>${x.title}</b><small>${[L.STATUS[x.status].label, who(x.assignees)].join(" · ")}</small></div><div class="g-lane">
                <button type="button" class=${L.cx("bar", L.dueClass(x) === "late" && "late")} data-s=${x.status} style=${{ left: sp.left + 2 + "px", width: Math.max(6, sp.width - 4) + "px", "--p": (x.status === "terminado" ? 100 : x.progress || 0) + "%" }} title=${x.title + " · " + L.fmtShort(x.start || x.due) + " a " + L.fmtShort(x.due)} onClick=${() => L.openTask(x.id)}><span>${sp.width > 60 ? x.title : ""}</span></button>
              </div></div>`; })}
          <//>`)}
          ${!projects.length && html`<div class="g-row"><div class="g-label"><small>Sin proyectos con tareas en estas fechas.</small></div><div class="g-lane"></div></div>`}
          ${todayPos >= 0 && todayPos < days && html`<div class="today-line" style=${{ left: labelW + todayPos * dayW + dayW / 2 + "px" }}></div>`}
        </div></div></div>`;
    } else {
      const people = (L.sortPeople ? q.staff().sort((x, y) => (x.name || "").localeCompare(y.name || "", "es")) : q.staff()).filter((u) => area === "todas" || (u.areas || []).includes(area));
      const weekLoad = (uid, w) => { const wa = L.iso(w), wb = L.iso(L.addDays(w, 6)); return s.tareas.filter((x) => (x.assignees || []).includes(uid) && active(x, wa, wb)).length; };
      const studio = weeksArr.map((w) => { const counts = people.map((u) => weekLoad(u.id, w)); return { total: counts.reduce((m, n) => m + n, 0), high: counts.filter((n) => n >= LOAD_HIGH).length }; });
      body = html`
        <div class="toolbar"><span class="tl-legend"><i class="ld ok"></i>Normal <i class="ld med"></i>Cargada (${LOAD_MED}+) <i class="ld high"></i>Sobrecargada (${LOAD_HIGH}+) <i class="ld aus"></i>Ausente</span></div>
        <div class="glass gantt-card" ref=${ref}><div class="g-scroll"><div class="g-inner tl" style=${style}>
          ${head}
          <div class="g-row g-proj"><div class="g-label"><b>Estudio</b><small>Tareas activas por semana</small></div><div class="g-lane tl-load">
            ${studio.map((x, i) => html`<span key=${i} class=${L.cx("cell", x.high && "high")} style=${{ left: i * 7 * dayW + "px", width: 7 * dayW + "px" }} title=${`Semana ${L.isoWeek(weeksArr[i])}: ${x.total} tareas activas${x.high ? `, ${x.high} persona${x.high > 1 ? "s" : ""} sobrecargada${x.high > 1 ? "s" : ""}` : ""}`}>${x.total}${x.high ? html` <b>${x.high}!</b>` : ""}</span>`)}
          </div></div>
          ${people.map((u) => {
            const tasks = s.tareas.filter((x) => (x.assignees || []).includes(u.id) && open(x) && x.due && inArea(x) && span(x.start, x.due)).sort((x, y) => (x.start || x.due).localeCompare(y.start || y.due));
            // Carriles: cada tarea va en el primero donde no choca con otra.
            const lanes = [];
            const placed = tasks.map((x) => { const sp = span(x.start, x.due); let i = lanes.findIndex((r) => r <= sp.left); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = sp.left + sp.width; return { x, sp, i }; });
            const shown = Math.min(3, lanes.length || 1), hidden = placed.filter((pp) => pp.i >= 3).length;
            const aus = s.ausencias.filter((x) => x.user === u.id && x.desde <= b && x.hasta >= a);
            return html`<div class="g-row tl-person" key=${u.id} style=${{ "--lanes": shown }}>
              <div class="g-label"><span class="who"><${Avatar} id=${u.id} dot /><b>${u.name}</b></span><small>${L.plural(tasks.length, "tarea abierta", "tareas abiertas")}${hidden ? ` · ${hidden} más sin espacio` : ""}</small></div>
              <div class="g-lane">
                ${aus.map((x) => { const sp = span(x.desde, x.hasta); return sp && html`<span key=${x.id} class="tl-aus" style=${{ left: sp.left + "px", width: sp.width + "px" }} title=${(L.AUSENCIA_TIPOS.find((k) => k.id === x.tipo) || { label: "Ausente" }).label + " · " + L.fmtShort(x.desde) + " a " + L.fmtShort(x.hasta)}><span>${sp.width > 50 ? (L.AUSENCIA_TIPOS.find((k) => k.id === x.tipo) || { label: "Ausente" }).label : ""}</span></span>`; })}
                ${placed.filter((pp) => pp.i < 3).map(({ x, sp, i }) => html`<button type="button" key=${x.id} class=${L.cx("bar thin", L.dueClass(x) === "late" && "late")} data-s=${x.status} style=${{ left: sp.left + 1 + "px", width: Math.max(5, sp.width - 2) + "px", top: 5 + i * 17 + "px", "--p": (x.progress || 0) + "%" }} title=${x.title + (q.project(x.project) ? " · " + (q.project(x.project).code || q.project(x.project).name) : "") + " · " + L.fmtShort(x.start || x.due) + " a " + L.fmtShort(x.due)} onClick=${() => L.openTask(x.id)}><span>${sp.width > 70 ? x.title : ""}</span></button>`)}
                <div class="tl-week">${weeksArr.map((w, i) => { const n = weekLoad(u.id, w); return html`<span key=${i} class=${loadLevel(n)} style=${{ width: 7 * dayW + "px" }} title=${`Semana ${L.isoWeek(w)}: ${L.plural(n, "tarea activa", "tareas activas")}`}>${n || ""}</span>`; })}</div>
              </div></div>`;
          })}
          ${todayPos >= 0 && todayPos < days && html`<div class="today-line" style=${{ left: labelW + todayPos * dayW + dayW / 2 + "px" }}></div>`}
        </div></div></div>`;
    }
    return html`
      <${L.PageHead} title="Línea de tiempo" sub="Todos los proyectos y la carga de cada persona en un solo calendario. Por ahora es para mirar: las fechas se cambian en cada tarea." />
      <div class="toolbar wrap">
        <${Seg} label="Ver por" value=${mode} onChange=${setMode} options=${[{ id: "proyectos", label: "Proyectos" }, { id: "personas", label: "Personas" }, { id: "duraciones", label: "Duraciones" }]} />
        <${Seg} label="Escala" value=${zoom} onChange=${(z) => { setZoom(z); setShift(0); }} options=${ZOOMS} />
        <div class="seg" role="group" aria-label="Mover"><button type="button" aria-label="Antes" onClick=${() => setShift(shift - 1)}>‹</button><button type="button" aria-pressed=${shift === 0} onClick=${() => setShift(0)}>Hoy</button><button type="button" aria-label="Después" onClick=${() => setShift(shift + 1)}>›</button></div>
        <span class="muted light">${L.fmtShort(start)} a ${L.fmtShort(end)} ${end.getFullYear()}</span>
      </div>
      <div class="toolbar"><${L.Pills} options=${[{ id: "todas", label: "Todas las áreas" }, ...L.AREAS]} value=${area} attr="data-a" onChange=${setArea} /></div>
      ${body}`;
  }

  Object.assign(L, { Semana, Linea, weekKey });
})();
