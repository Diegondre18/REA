// Vistas generales: Inicio, Mi cronograma, Reuniones, detalle de reunión o comité, Áreas y Equipo.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Panel, Empty, Seg, Avatar, Faces, Icon, TaskRow, EventRow, Board, Archive, Gantt, AreaTag, Glyph } = L;
  const { useState } = hooks;

  const PageHead = ({ eyebrow, title, sub, children }) => html`
    <div class="page-head">
      <div>${eyebrow && html`<div class="eyebrow">${eyebrow}</div>`}<h1><span class="sl">//</span>${title}</h1>${sub && html`<p class="sub">${sub}</p>`}</div>
      ${children && html`<div class="acts">${children}</div>`}
    </div>`;

  /* ---------- equipo ahora ---------- */
  function PersonCard({ u, compact }) {
    const task = u.taskId && q.task(u.taskId);
    const p = task && q.project(task.project);
    const online = q.online(u);
    const open = () => (task ? L.openTask(task.id) : L.openSheet("profile", u.id));
    return html`
      <button type="button" class=${L.cx("person", !online && !task && "idle")} onClick=${open}>
        <${Avatar} id=${u.id} cls="lg" dot />
        <span class="person-body">
          <span class="who">${u.name}${L.state.me.id === u.id && html`<span class="tag">Tú</span>`}</span>
          <span class="what">${task ? html`En <b>${task.title}</b>${p ? " · " + (p.code || p.name) : ""}` : u.estado || (online ? "Conectado, sin tarea marcada" : u.lastSeen ? "Visto " + L.relTime(u.lastSeen) : "Sin conectarse aún")}</span>
          ${!compact && html`<span class="tag">${[u.cargo, task && u.since ? "desde " + L.relTime(u.since) : ""].filter(Boolean).join(" · ") || (u.areas || []).map((a) => L.AREA[a] && L.AREA[a].label).filter(Boolean).join(", ")}</span>`}
        </span>
      </button>`;
  }
  const sortPeople = (users) => [...users].sort((a, b) => (q.online(b) - q.online(a)) || ((b.taskId ? 1 : 0) - (a.taskId ? 1 : 0)) || (a.name || "").localeCompare(b.name || "", "es"));
  function TeamNow({ users, title = "Equipo ahora" }) {
    const online = users.filter(q.online).length;
    return html`<${Panel} title=${title} cls="span-12" action=${html`<span class="tag">${L.plural(online, "persona conectada", "personas conectadas")}</span>`}>
      <div class="team">${sortPeople(users).map((u) => html`<${PersonCard} key=${u.id} u=${u} />`)}</div>
    <//>`;
  }

  /* ---------- actividad ---------- */
  const VERB = {
    create: "registró", stage: "movió", done: "terminó", working: "empezó a trabajar en", delete: "eliminó", project: "creó el proyecto",
    meeting: "agendó", comite: "programó", plan_sent: "envió a visto bueno el", plan_approved: "aprobó el",
  };
  function Feed({ items, cls = "span-5" }) {
    return html`<${Panel} title="Actividad" cls=${cls}>
      <div class="feed">${items.length ? items.slice(0, 12).map((a) => {
        const exists = a.ref && q.task(a.ref);
        const p = q.project(a.project);
        return html`<div class="ev" key=${a.id}><${Avatar} id=${a.by} />
          <p><b>${q.first(a.by)}</b> ${VERB[a.kind] || "cambió"} <q class=${exists ? "link" : ""} onClick=${exists ? () => L.openTask(a.ref) : null}>${a.title}</q>${a.kind === "stage" && L.STATUS[a.to] ? " a " + L.STATUS[a.to].label : ""}${p && a.kind !== "project" ? html` <span class="muted">· ${p.code || p.name}</span>` : ""}</p>
          <time>${L.relTime(a.created)}</time></div>`;
      }) : html`<p class="note">Cada tarea nueva, cambio de estado, reunión o plan aprobado queda registrado aquí.</p>`}</div>
    <//>`;
  }

  /* ---------- inicio ---------- */
  function Pending({ pend }) {
    const [busy, setBusy] = useState("");
    const approve = async (planId) => { setBusy(planId); const r = await act.planStep(planId, "aprobar"); setBusy(""); if (r) L.toast("Plan aprobado. Los entregables ya están en los cronogramas."); };
    const n = pend.vistos.length + pend.aprobar.length + pend.reportes.length;
    if (!n) return null;
    return html`<${Panel} title="Esperan por ti" cls="span-12 attention" action=${html`<span class="tag warn">${n}</span>`}>
      <div class="rows">
        ${pend.vistos.map(({ plan, project }) => html`
          <div class="row static" key=${plan.id}><${Icon} name="plan" /><div class="row-main"><div class="row-title">Da tu visto bueno al plan de ${project.name}</div><div class="row-meta">Versión ${plan.version} · lo envió ${q.first(project.leader)} ${L.relTime(plan.sentAt)}</div></div>
            <a class="btn sm primary" href=${"#proyecto/" + project.id + "/plan"}>Revisar plan</a></div>`)}
        ${pend.aprobar.map(({ plan, project, ok, total, cambios }) => html`
          <div class="row static" key=${plan.id}><${Icon} name="check" /><div class="row-main"><div class="row-title">Plan de ${project.name}: ${ok} de ${total} vistos buenos</div>
            <div class="row-meta">${cambios.length ? html`<span class="tag warn">${cambios.map((v) => q.first(v.user)).join(", ")} ${cambios.length === 1 ? "pide" : "piden"} cambios</span>` : ok === total ? "Listo para aprobar. Al hacerlo, cada entregable pasa al cronograma de sus responsables." : "Esperando al equipo."}</div></div>
            <div class="inline"><a class="btn sm" href=${"#proyecto/" + project.id + "/plan"}>Ver plan</a>${ok === total && html`<button type="button" class="btn sm primary" disabled=${busy === plan.id} onClick=${() => approve(plan.id)}>Aprobar</button>`}</div></div>`)}
        ${pend.reportes.map((ev) => html`
          <div class="row static" key=${ev.id}><${Icon} name="edit" /><div class="row-main"><div class="row-title">Escribe tu avance para: ${ev.title}</div><div class="row-meta">${L.cap(L.relDay(ev.date))}${ev.time ? " a las " + ev.time : ""} · qué hiciste, qué sigue y qué te bloquea</div></div>
            <a class="btn sm primary" href=${"#evento/" + ev.id}>Escribir avance</a></div>`)}
      </div>
    <//>`;
  }

  function Inicio() {
    const s = L.useStore();
    const me = s.me;
    const t = L.todayIso();
    const weekEnd = L.iso(L.addDays(L.monday(L.today()), 6));
    if (!s.proyectos.length && !s.tareas.length) {
      return html`<${PageHead} eyebrow=${L.cap(L.fmtLong(t))} title=${`${L.greeting()}, ${L.first(me.name)}.`} />
        <div class="grid"><${TeamNow} users=${q.staff()} />
        <div class="glass span-12"><${Empty} title="El estudio todavía no tiene proyectos aquí" text="Crea un proyecto, suma a su equipo y arma el plan de entregables. Cuando el plan se aprueba, cada quien ve lo suyo en su cronograma.">
          <button type="button" class="btn primary" onClick=${() => L.openSheet("project")}>Crear el primer proyecto</button>
          <button type="button" class="btn" onClick=${act.loadSample}>Ver con datos de ejemplo</button><//></div></div>`;
    }
    const mine = q.myTasks(me.id).filter((x) => x.status !== "terminado").sort(L.byDue);
    const late = mine.filter((x) => x.due && x.due < t);
    const hoy = mine.filter((x) => x.due === t);
    const semana = mine.filter((x) => x.due > t && x.due <= weekEnd);
    const luego = mine.filter((x) => !x.due || x.due > weekEnd);
    const eventos = q.myEvents(me.id).filter((e) => e.date >= t).sort((a, b) => L.eventStamp(a).localeCompare(L.eventStamp(b)));
    const estaSemana = eventos.filter((e) => e.date <= weekEnd).length;
    const pend = q.pending();
    const proyectos = q.myProjects(me.id);
    const group = (label, items, cls) => items.length > 0 && html`<div class="group-label ${cls || ""}">${label}<span class="mono">${items.length}</span></div>${items.map((x) => html`<${TaskRow} key=${x.id} task=${x} />`)}`;
    const para = late.length + hoy.length;
    return html`
      <${PageHead} eyebrow=${`${L.cap(L.fmtLong(t))} · Semana ${L.isoWeek(L.today())}`} title=${`${L.greeting()}, ${L.first(me.name)}.`}
        sub=${`${para ? `Tienes ${L.plural(para, "tarea", "tareas")} para hoy` : "No tienes entregas para hoy"}${estaSemana ? ` y ${L.plural(estaSemana, "reunión", "reuniones")} esta semana` : ""}.`} />
      <div class="grid">
        <${Pending} pend=${pend} />
        <${Panel} title="Mis tareas" cls="span-7" action=${html`<a class="link" href="#agenda">Mi cronograma</a>`}>
          <div class="rows">${mine.length ? html`${group("Atrasadas", late, "late")}${group("Hoy", hoy)}${group("Esta semana", semana)}${group("Después", luego.slice(0, 6))}` : html`<p class="note">No tienes tareas abiertas. Las que te asignen o lleguen de un plan aprobado aparecen aquí.</p>`}</div>
        <//>
        <${Panel} title="Mis reuniones" cls="span-5" action=${html`<a class="link" href="#reuniones">Todas</a>`}>
          <div class="rows">${eventos.length ? eventos.slice(0, 6).map((e) => html`<${EventRow} key=${e.id} ev=${e} />`) : html`<p class="note">Sin reuniones ni comités agendados.</p>`}</div>
        <//>
        <${TeamNow} users=${q.staff()} />
        <${Panel} title="Mis proyectos" cls="span-7" action=${html`<a class="link" href="#proyectos">Todos</a>`}>
          <div class="rows">${proyectos.length ? proyectos.map((p) => html`<${L.ProjectRow} key=${p.id} p=${p} />`) : html`<p class="note">Todavía no estás en ningún proyecto.</p>`}</div>
        <//>
        <${Feed} items=${s.actividad} />
      </div>`;
  }

  /* ---------- mi cronograma ---------- */
  function Agenda() {
    const s = L.useStore();
    const [uid, setUid] = useState(s.me.id);
    const [mode, setMode] = useState("semana");
    const [shift, setShift] = useState(0);
    const tasks = q.myTasks(uid);
    const events = q.myEvents(uid);
    const t = L.today();
    const start = L.addDays(L.monday(t), shift * 7);
    const allDays = Array.from({ length: 7 }, (_, i) => L.iso(L.addDays(start, i)));
    const has = (d) => events.some((e) => e.date === d) || tasks.some((x) => x.due === d && x.status !== "terminado");
    const days = allDays.filter((d, i) => i < 5 || has(d));
    const who = uid === s.me.id ? "Mi cronograma" : "Cronograma de " + L.first(q.name(uid));
    const groups = () => {
      const byProject = new Map();
      for (const x of tasks.filter((x) => x.start || x.due)) { const k = x.project || ""; if (!byProject.has(k)) byProject.set(k, []); byProject.get(k).push(x); }
      return [...byProject.entries()].map(([pid, rows]) => {
        const p = q.project(pid);
        return { label: p ? p.name : "Sin proyecto", sub: p && p.code, markers: events.filter((e) => e.project === pid).map((e) => ({ date: e.date, label: e.title, onClick: () => L.go("#evento/" + e.id) })), rows: rows.sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due)).map(L.taskToRow) };
      }).sort((a, b) => a.label.localeCompare(b.label, "es"));
    };
    return html`
      <${PageHead} title=${who} sub="Tus tareas y los entregables de los planes aprobados, con tus reuniones y comités.">
        <select class="select" aria-label="Ver el cronograma de" value=${uid} onChange=${(e) => setUid(e.target.value)}>${sortPeople(q.staff()).map((u) => html`<option key=${u.id} value=${u.id}>${u.id === s.me.id ? "Yo" : u.name}</option>`)}</select>
        <${Seg} label="Vista" value=${mode} onChange=${setMode} options=${[{ id: "semana", label: "Semana" }, { id: "tiempo", label: "Línea de tiempo" }]} />
      <//>
      ${mode === "tiempo" ? (tasks.length ? html`<${Gantt} groups=${groups()} />` : html`<div class="glass"><${Empty} small title="Sin tareas con fecha" /></div>`) : html`
        <div class="toolbar">
          <div class="seg" role="group" aria-label="Semana"><button type="button" aria-label="Semana anterior" onClick=${() => setShift(shift - 1)}>‹</button><button type="button" aria-pressed=${shift === 0} onClick=${() => setShift(0)}>Esta semana</button><button type="button" aria-label="Semana siguiente" onClick=${() => setShift(shift + 1)}>›</button></div>
          <span class="muted light">Semana ${L.isoWeek(start)} · ${L.fmtShort(start)} a ${L.fmtShort(L.addDays(start, 6))}</span>
        </div>
        <div class="week" style=${{ "--cols": days.length }}>${days.map((d) => {
          const evs = events.filter((e) => e.date === d).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
          const due = tasks.filter((x) => x.due === d);
          const going = tasks.filter((x) => x.status !== "terminado" && x.start && x.due && x.start <= d && x.due > d);
          const dd = L.parse(d);
          return html`
            <div class=${L.cx("glass day", d === L.todayIso() && "today")} key=${d}>
              <div class="day-head"><b>${L.DIAS_C[dd.getDay()]}</b><span>${dd.getDate()} ${L.MES[dd.getMonth()]}</span></div>
              ${evs.map((e) => html`<button type="button" key=${e.id} class=${"day-ev " + e.kind} onClick=${() => L.go("#evento/" + e.id)}><span class="mono">${e.time || "—"}</span>${e.title}</button>`)}
              ${due.map((x) => html`<button type="button" key=${x.id} class=${L.cx("day-task", x.status === "terminado" && "done")} data-s=${x.status} onClick=${() => L.openTask(x.id)}><span class="tag">Entrega</span>${x.title}<small>${L.taskMeta(x, true)}</small></button>`)}
              ${going.map((x) => html`<button type="button" key=${x.id} class="day-going" data-s=${x.status} onClick=${() => L.openTask(x.id)}><${Glyph} s=${x.status} />${x.title}</button>`)}
              ${!evs.length && !due.length && !going.length && html`<span class="day-empty">Libre</span>`}
            </div>`;
        })}</div>`}`;
  }

  /* ---------- reuniones ---------- */
  function Reuniones() {
    const s = L.useStore();
    const [scope, setScope] = useState("mias");
    const t = L.todayIso();
    const all = (scope === "mias" ? q.myEvents(s.me.id) : s.eventos).slice().sort((a, b) => L.eventStamp(a).localeCompare(L.eventStamp(b)));
    const weekEnd = L.iso(L.addDays(L.monday(L.today()), 6));
    const nextEnd = L.iso(L.addDays(L.monday(L.today()), 13));
    const up = all.filter((e) => e.date >= t);
    const past = all.filter((e) => e.date < t).reverse().slice(0, 10);
    const block = (title, items) => items.length > 0 && html`<${Panel} title=${title} cls="span-12"><div class="rows">${items.map((e) => html`<${EventRow} key=${e.id} ev=${e} />`)}</div><//>`;
    return html`
      <${PageHead} title="Reuniones y comités" sub="Reuniones con cliente, comités internos y entregas de todos los proyectos.">
        <${Seg} label="Cuáles" value=${scope} onChange=${setScope} options=${[{ id: "mias", label: "Las mías" }, { id: "todas", label: "Todas" }]} />
        <button type="button" class="btn" onClick=${() => L.openSheet("event", null, { kind: "comite" })}>Programar comité</button>
        <button type="button" class="btn primary" onClick=${() => L.openSheet("event", null, { kind: "cliente" })}><${Icon} name="plus" size=${12} /> Agendar reunión</button>
      <//>
      <div class="grid">
        ${!all.length && html`<div class="glass span-12"><${Empty} title="Nada agendado" text="Agenda la reunión con el cliente y programa comités internos para llegar con el avance de todos revisado." /></div>`}
        ${block("Esta semana", up.filter((e) => e.date <= weekEnd))}
        ${block("La próxima semana", up.filter((e) => e.date > weekEnd && e.date <= nextEnd))}
        ${block("Más adelante", up.filter((e) => e.date > nextEnd))}
        ${block("Anteriores", past)}
      </div>`;
  }

  function ReportForm({ ev }) {
    const s = L.useStore();
    const mine = s.reportes.find((r) => r.event === ev.id && r.user === s.me.id);
    const [f, setF] = useState({ done: (mine && mine.done) || "", next: (mine && mine.next) || "", blockers: (mine && mine.blockers) || "" });
    const [open, setOpen] = useState(!mine);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const save = async () => { if (await act.saveReport(ev.id, f)) { L.toast("Avance guardado"); setOpen(false); } };
    if (!open) return html`<button type="button" class="btn sm" onClick=${() => setOpen(true)}>Editar mi avance</button>`;
    return html`
      <form class="report-form" onSubmit=${(e) => { e.preventDefault(); save(); }}>
        <div class="fld"><label for="r-done">Qué hice</label><textarea id="r-done" value=${f.done} onInput=${set("done")} placeholder="Lo que avanzaste desde el último comité"></textarea></div>
        <div class="two">
          <div class="fld"><label for="r-next">Qué sigue</label><textarea id="r-next" value=${f.next} onInput=${set("next")}></textarea></div>
          <div class="fld"><label for="r-block">Qué me bloquea</label><textarea id="r-block" value=${f.blockers} onInput=${set("blockers")} placeholder="Decisiones, archivos o personas que necesitas"></textarea></div>
        </div>
        <div class="inline"><button type="submit" class="btn primary sm">Guardar mi avance</button>${mine && html`<button type="button" class="btn ghost sm" onClick=${() => setOpen(false)}>Cancelar</button>`}</div>
      </form>`;
  }

  function Acta({ ev }) {
    const [text, setText] = useState(ev.acta || "");
    const dirty = text !== (ev.acta || "");
    return html`<${Panel} title="Acta" cls="span-12" action=${dirty ? html`<button type="button" class="btn sm primary" onClick=${async () => { if (await act.saveEvent(ev.id, { acta: text })) L.toast("Acta guardada"); }}>Guardar acta</button>` : null}>
      <textarea class="acta" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Decisiones, compromisos y responsables. Lo ve todo el equipo del proyecto."></textarea>
    <//>`;
  }

  function Evento({ id }) {
    const s = L.useStore();
    const ev = q.event(id);
    if (!ev) return html`<div class="glass"><${Empty} title="Esta reunión ya no existe"><a class="btn" href="#reuniones">Ver reuniones</a><//></div>`;
    const p = q.project(ev.project);
    const attendees = ev.attendees || [];
    const tasks = s.tareas.filter((x) => x.meeting === ev.id).sort(L.byDue);
    const done = tasks.filter((x) => x.status === "terminado").length;
    const emails = attendees.map((a) => (q.user(a) || {}).email).filter(Boolean);
    const details = [p && "Proyecto: " + p.name, ev.agenda, tasks.length ? "Contenido:\n" + tasks.map((x) => "• " + x.title).join("\n") : ""].filter(Boolean).join("\n\n");
    const weekAgo = L.iso(L.addDays(L.today(), -7));
    const isComite = ev.kind === "comite";
    const mine = attendees.includes(s.me.id);
    return html`
      <${PageHead} eyebrow=${html`<a href=${p ? "#proyecto/" + p.id + "/reuniones" : "#reuniones"}>${p ? p.name : "Reuniones"}</a> · ${L.EVENT_KIND[ev.kind].label}`} title=${ev.title}
        sub=${`${L.cap(L.fmtLong(ev.date))}${ev.time ? " · " + ev.time : ""}${ev.duration ? " · " + ev.duration + " min" : ""}${ev.place ? " · " + ev.place : ""}`}>
        ${ev.meetUrl && html`<a class="btn primary" href=${ev.meetUrl} target="_blank" rel="noreferrer"><${Icon} name="meet" /> Unirse a Meet</a>`}
        <a class="btn" href=${L.calendarLink(ev, emails, details)} target="_blank" rel="noreferrer" title="Abre Google Calendar con la reunión ya llenada. Al guardarla, Google le agrega el enlace de Meet."><${Icon} name="calendar" /> Agendar en Google Calendar</a>
        <button type="button" class="btn" onClick=${() => L.openSheet("event", ev.id)}><${Icon} name="edit" /> Editar</button>
      <//>
      <div class="grid">
        <${Panel} title="Asisten" cls="span-12" action=${html`<span class="tag">${attendees.length}</span>`}>
          <div class="people static">${attendees.map((a) => html`<span class="pill" key=${a}><${Avatar} id=${a} /> ${q.name(a)}</span>`)}</div>
          ${ev.agenda && html`<p class="agenda">${ev.agenda}</p>`}
        <//>
        ${!isComite && html`<${Panel} title="Contenido para esta reunión" cls="span-12" action=${html`<div class="inline"><span class="tag">${tasks.length ? `${done} de ${tasks.length} listos` : ""}</span><button type="button" class="btn sm" onClick=${() => L.openSheet("task", null, { project: ev.project, meeting: ev.id, due: ev.date })}>Agregar tarea</button></div>`}>
          <div class="rows">${tasks.length ? tasks.map((x) => html`<${TaskRow} key=${x.id} task=${x} showProject=${false} />`) : html`<p class="note">Las tareas marcadas como contenido para esta reunión aparecen aquí, con su estado.</p>`}</div>
        <//>`}
        ${isComite && html`<${Panel} title="Avances del equipo" cls="span-12" action=${html`<span class="tag">${s.reportes.filter((r) => r.event === ev.id).length} de ${attendees.length} escritos</span>`}>
          ${mine && html`<${ReportForm} key=${ev.id} ev=${ev} />`}
          <div class="reports">${attendees.map((a) => {
            const r = s.reportes.find((x) => x.event === ev.id && x.user === a);
            const theirs = s.tareas.filter((x) => (x.assignees || []).includes(a) && (!ev.project || x.project === ev.project));
            const finished = theirs.filter((x) => x.status === "terminado" && x.doneAt >= weekAgo);
            const going = theirs.filter((x) => x.status === "en_curso" || x.status === "revision");
            return html`
              <div class="report" key=${a}>
                <div class="report-head"><${Avatar} id=${a} cls="lg" dot /><div><b>${q.name(a)}</b><span class="muted">${r ? "Actualizado " + L.relTime(r.updated) : "Sin avance escrito"}</span></div></div>
                ${r ? html`
                  ${r.done && html`<div class="report-part"><span class="lbl">Qué hizo</span><p>${r.done}</p></div>`}
                  ${r.next && html`<div class="report-part"><span class="lbl">Qué sigue</span><p>${r.next}</p></div>`}
                  ${r.blockers && html`<div class="report-part block"><span class="lbl">Qué lo bloquea</span><p>${r.blockers}</p></div>`}` : null}
                ${(finished.length > 0 || going.length > 0) && html`<div class="report-part auto"><span class="lbl">Según sus tareas</span>
                  ${finished.map((x) => html`<button type="button" class="mini-task" key=${x.id} onClick=${() => L.openTask(x.id)}><${Glyph} s="terminado" />${x.title}</button>`)}
                  ${going.map((x) => html`<button type="button" class="mini-task" key=${x.id} onClick=${() => L.openTask(x.id)}><${Glyph} s=${x.status} />${x.title}${Number(x.progress) > 0 ? html`<span class="mono">${x.progress}%</span>` : null}</button>`)}
                </div>`}
              </div>`;
          })}</div>
        <//>`}
        <${Acta} key=${ev.id} ev=${ev} />
        <${L.Commitments} origen=${"evento:" + ev.id} project=${ev.project || ""} people=${ev.attendees || []} title="Compromisos de la reunión" />
      </div>`;
  }

  /* ---------- áreas ---------- */
  function Area({ id }) {
    const s = L.useStore();
    const [mode, setMode] = useState("tablero");
    const area = L.AREA[id];
    if (!area) return html`<div class="glass"><${Empty} title="Área desconocida" /></div>`;
    const people = q.staff().filter((u) => (u.areas || []).includes(id));
    const tasks = s.tareas.filter((x) => x.area === id);
    const open = tasks.filter((x) => x.status !== "terminado");
    const groups = () => {
      const m = new Map();
      for (const x of open.filter((x) => x.start || x.due)) { const k = x.project || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
      return [...m.entries()].map(([pid, rows]) => ({ label: (q.project(pid) || { name: "Sin proyecto" }).name, rows: rows.sort(L.byDue).map(L.taskToRow) }));
    };
    return html`
      <${PageHead} eyebrow="Área" title=${area.label} sub=${`${L.plural(people.length, "persona", "personas")} · ${L.plural(open.length, "tarea abierta", "tareas abiertas")}`}>
        <${Seg} label="Vista" value=${mode} onChange=${setMode} options=${[{ id: "tablero", label: "Tablero" }, { id: "tiempo", label: "Cronograma" }, { id: "archivo", label: "Archivo", count: tasks.length - open.length || null }]} />
        <button type="button" class="btn primary" onClick=${() => L.openSheet("task", null, { area: id })}><${Icon} name="plus" size=${12} /> Nueva tarea</button>
      <//>
      <div class="grid">
        ${people.length > 0 && html`<${TeamNow} users=${people} title=${"Equipo de " + area.label} />`}
        <div class="span-12">${mode === "tablero" ? html`<${Board} tasks=${tasks} />` : mode === "tiempo" ? (open.length ? html`<${Gantt} groups=${groups()} />` : html`<div class="glass"><${Empty} small title="Sin tareas con fecha" /></div>`) : html`<${Archive} tasks=${tasks} />`}</div>
      </div>`;
  }

  /* ---------- equipo ---------- */
  function Equipo() {
    const s = L.useStore();
    const t = L.todayIso();
    const weekEnd = L.iso(L.addDays(L.monday(L.today()), 6));
    const staff = q.staff();
    const sections = [L.AREA.direccion, ...L.AREAS].map((a) => ({ a, people: staff.filter((u) => (u.areas || []).includes(a.id)) }));
    const none = staff.filter((u) => !(u.areas || []).length);
    const card = (u) => {
      const open = q.myTasks(u.id).filter((x) => x.status !== "terminado");
      const week = open.filter((x) => x.due && x.due <= weekEnd).length;
      const late = open.filter((x) => x.due && x.due < t).length;
      return html`<div class="member" key=${u.id}>
        <${PersonCard} u=${u} />
        ${q.absent(u.id) && html`<span class="tag warn absent">${L.labelOf(L.AUSENCIA_TIPOS, q.absent(u.id).tipo)} hasta el ${L.fmtShort(q.absent(u.id).hasta)}</span>`}
        <div class="load"><span><b>${open.length}</b> abiertas</span><span><b>${week}</b> esta semana</span>${late > 0 && html`<span class="late"><b>${late}</b> atrasadas</span>`}
          <button type="button" class="btn icon ghost sm" title="Ver perfil" aria-label="Ver perfil" onClick=${() => L.openSheet("profile", u.id)}><${Icon} name="settings" /></button></div>
      </div>`;
    };
    return html`
      <${PageHead} title="Equipo" sub=${`${L.plural(staff.length, "persona", "personas")} · ${staff.filter(q.online).length} conectadas ahora`}>
        <button type="button" class="btn" onClick=${() => L.openSheet("profile", s.me.id)}><${Icon} name="edit" /> Mi perfil</button>
      <//>
      <div class="grid">
        <${L.Carga} />
        ${sections.filter((x) => x.people.length).map(({ a, people }) => html`<${Panel} key=${a.id} title=${a.label} cls="span-12" action=${html`<span class="tag">${people.length}</span>`}><div class="members">${sortPeople(people).map(card)}</div><//>`)}
        ${none.length > 0 && html`<${Panel} title="Sin área asignada" cls="span-12" action=${q.isDirector() ? html`<span class="tag">Ábreles el perfil para asignarla</span>` : null}><div class="members">${sortPeople(none).map(card)}</div><//>`}
      </div>`;
  }

  Object.assign(L, { PageHead, PersonCard, TeamNow, Feed, Inicio, Agenda, Reuniones, Evento, Area, Equipo, sortPeople });
})();
