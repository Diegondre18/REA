// Proyectos: lista, detalle y plan de entregables con vistos buenos y aprobación.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Panel, Empty, Seg, Avatar, Faces, Icon, TaskRow, EventRow, Board, Archive, Gantt, AreaTag, PeoplePicker, PathBlock, PageHead } = L;
  const { useState } = hooks;

  const progressOf = (pid) => {
    const ts = q.projectTasks(pid);
    return { total: ts.length, done: ts.filter((t) => t.status === "terminado").length, late: ts.filter((t) => L.dueClass(t) === "late").length };
  };
  const planLabel = (pid) => {
    const open = q.openPlan(pid), ok = q.approvedPlan(pid);
    if (open) return { s: open.status === "borrador" ? "pendiente" : "revision", label: `Plan v${open.version}: ${open.status === "borrador" ? "borrador" : "en visto bueno"}` };
    if (ok) return { s: "terminado", label: `Plan v${ok.version} aprobado` };
    return null;
  };

  function ProjectRow({ p }) {
    const pr = progressOf(p.id);
    const next = q.nextClientMeeting(p.id);
    return html`
      <div class="row" tabindex="0" onClick=${() => L.go("#proyecto/" + p.id)} onKeyDown=${(e) => { if (e.key === "Enter") L.go("#proyecto/" + p.id); }}>
        <${Icon} name="folder" />
        <div class="row-main"><div class="row-title">${p.name} <${L.HealthDot} p=${p} /></div><div class="row-meta"><span>${[p.code, p.client, L.PHASE[p.phase] && L.PHASE[p.phase].label].filter(Boolean).join(" · ")}</span></div></div>
        <div class="row-side"><div class="inline"><${Faces} ids=${p.members || []} max=${4} /></div>
          <div class="inline">${pr.total > 0 && html`<span class="bar-track" data-s="en_curso"><i style=${{ width: (pr.done / pr.total) * 100 + "%" }}></i></span>`}<span class="due">${next ? "Cliente: " + L.relDay(next.date).toLowerCase() : pr.total ? `${pr.done}/${pr.total}` : ""}</span></div></div>
      </div>`;
  }

  function Proyectos() {
    const s = L.useStore();
    const [scope, setScope] = useState("activos");
    const list = s.proyectos.filter((p) => (scope === "activos" ? p.status !== "cerrado" : scope === "mios" ? (p.members || []).includes(s.me.id) || p.leader === s.me.id : true)).sort((a, b) => a.name.localeCompare(b.name, "es"));
    return html`
      <${PageHead} title="Proyectos" sub=${`${L.plural(s.proyectos.filter((p) => p.status === "activo").length, "proyecto activo", "proyectos activos")}`}>
        <${Seg} label="Cuáles" value=${scope} onChange=${setScope} options=${[{ id: "activos", label: "Activos" }, { id: "mios", label: "Los míos" }, { id: "todos", label: "Todos" }]} />
        <button type="button" class="btn primary" onClick=${() => L.openSheet("project")}><${Icon} name="plus" size=${12} /> Nuevo proyecto</button>
      <//>
      ${list.length ? html`<div class="cards">${list.map((p) => {
        const pr = progressOf(p.id);
        const next = q.nextClientMeeting(p.id);
        const plan = planLabel(p.id);
        return html`
          <a class="glass pcard" key=${p.id} href=${"#proyecto/" + p.id}>
            <div class="pcard-top"><span class="mono">${p.code || "—"}</span><${L.HealthDot} p=${p} />${p.sample && html`<span class="chip plain sample">Ejemplo</span>`}${p.status !== "activo" && html`<span class="tag">${p.status === "pausado" ? "En pausa" : "Cerrado"}</span>`}</div>
            <h3>${p.name}</h3>
            <p class="muted">${[p.client, L.PHASE[p.phase] && L.PHASE[p.phase].label].filter(Boolean).join(" · ") || "Sin cliente"}</p>
            <div class="pcard-areas">${(p.areas || []).map((a) => html`<${AreaTag} key=${a} id=${a} />`)}</div>
            <div class="pcard-progress"><span class="bar-track wide" data-s="en_curso"><i style=${{ width: (pr.total ? (pr.done / pr.total) * 100 : 0) + "%" }}></i></span><span class="mono">${pr.done}/${pr.total}</span></div>
            <div class="pcard-facts">
              <span>${next ? html`<${Icon} name="flag" size=${12} /> Cliente ${L.relDay(next.date).toLowerCase()}` : "Sin reunión con cliente"}</span>
              ${plan && html`<span class="chip" data-s=${plan.s}>${plan.label}</span>`}
              ${pr.late > 0 && html`<span class="tag warn">${L.plural(pr.late, "atrasada", "atrasadas")}</span>`}
            </div>
            <div class="pcard-foot"><span class="inline"><${Faces} ids=${q.aCargo(p).map((x) => x.id)} max=${3} /><span class="muted">Dirige ${L.first(q.name(p.leader))}${p.apoyo ? " · apoyo " + L.first(q.name(p.apoyo)) : ""}</span></span><${Faces} ids=${(p.members || []).filter((m) => m !== p.leader && m !== p.apoyo)} max=${5} /></div>
          </a>`;
      })}</div>` : html`<div class="glass"><${Empty} title="Sin proyectos en esta vista" text="Un proyecto reúne a su equipo, su plan de entregables, sus tareas y sus reuniones."><button type="button" class="btn primary" onClick=${() => L.openSheet("project")}>Crear proyecto</button>${!s.proyectos.length && html`<button type="button" class="btn" onClick=${act.loadSample}>Ver con datos de ejemplo</button>`}<//></div>`}`;
  }

  /* ---------- plan de entregables ---------- */
  function ItemEditor({ item, plan, project, onDone }) {
    const base = item || { date: L.todayIso(), end: "", content: "", area: "", kind: "", assignees: [], meeting: "" };
    const [f, setF] = useState({ ...base });
    const [err, setErr] = useState("");
    const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? e.target.value : e });
    const members = [...new Set([project.leader, ...(project.members || [])].filter(Boolean))];
    const meetings = q.projectEvents(project.id).filter((e) => e.kind !== "comite");
    const save = async () => {
      if (!f.content.trim() || !f.date) { setErr("Pon la fecha y qué se va a entregar."); return; }
      let { date, end } = f;
      if (end && end < date) [date, end] = [end, date];
      const body = { plan: plan.id, date, end: end || "", content: f.content.trim(), area: f.area || "", kind: f.kind || "", assignees: f.assignees || [], meeting: f.meeting || "", order: item ? item.order : Date.now() % 1e9 };
      if (await act.saveItem(item ? item.id : null, body)) onDone();
    };
    return html`
      <form class="item-editor" onSubmit=${(e) => { e.preventDefault(); save(); }}>
        <div class="item-grid">
          <div class="fld"><label>Desde</label><input type="date" value=${f.date} onInput=${set("date")} /></div>
          <div class="fld"><label>Hasta</label><input type="date" value=${f.end} onInput=${set("end")} /></div>
          <div class="fld grow"><label>Qué se entrega</label><input value=${f.content} onInput=${set("content")} placeholder="Renders de fachada, planos de licencia, presentación…" /></div>
        </div>
        <div class="item-grid">
          <div class="fld"><label>Tipo</label><select value=${f.kind} onChange=${(e) => setF({ ...f, kind: e.target.value, area: f.area || L.KIND_AREA[e.target.value] || "" })}><option value="">Sin tipo</option>${L.KINDS.map((k) => html`<option key=${k.id} value=${k.id}>${k.label}</option>`)}</select></div>
          <div class="fld"><label>Área</label><select value=${f.area} onChange=${set("area")}><option value="">Sin área</option>${L.AREAS.map((a) => html`<option key=${a.id} value=${a.id}>${a.label}</option>`)}</select></div>
          <div class="fld grow"><label>Es para la reunión</label><select value=${f.meeting} onChange=${set("meeting")}><option value="">Ninguna</option>${meetings.map((m) => html`<option key=${m.id} value=${m.id}>${L.fmtDay(m.date)} · ${m.title}</option>`)}</select></div>
        </div>
        <div class="fld"><span class="lbl">Quién está al mando</span><${PeoplePicker} candidates=${members} value=${f.assignees} onChange=${set("assignees")} range=${[f.date, f.end || f.date]} />
          <${L.AbsenceNote} ids=${f.assignees} start=${f.date} due=${f.end || f.date} /></div>
        ${err && html`<span class="err">${err}</span>`}
        <div class="inline"><button type="submit" class="btn primary sm">${item ? "Guardar" : "Agregar al plan"}</button><button type="button" class="btn ghost sm" onClick=${onDone}>Cancelar</button>
          ${item && html`<span class="spacer"></span><button type="button" class="btn ghost danger sm" onClick=${async () => { if (await act.deleteItem(item.id)) onDone(); }}>Quitar del plan</button>`}</div>
      </form>`;
  }

  function VistoBox({ plan }) {
    const s = L.useStore();
    const mine = q.planVistos(plan.id).find((v) => v.user === s.me.id);
    const [ask, setAsk] = useState(false);
    const [comment, setComment] = useState("");
    const ok = async () => { if (await act.setVisto(plan.id, "ok", "")) L.toast("Visto bueno dado"); };
    const changes = async () => { if (!comment.trim()) return; if (await act.setVisto(plan.id, "cambios", comment.trim())) { setAsk(false); L.toast("Le avisamos a quien lidera"); } };
    if (mine && mine.verdict === "ok") return html`<div class="plan-banner ok"><${Icon} name="check" /><p><b>Diste tu visto bueno.</b> Cuando quien lidera apruebe el plan, tus entregables pasan a tu cronograma.</p></div>`;
    return html`
      <div class="plan-banner mine">
        <p><b>${mine ? "Pediste cambios." : "Este plan espera tu visto bueno."}</b> ${mine ? `«${mine.comment}». Si ya se resolvió, puedes darlo.` : "Revisa fechas, contenido y quién está al mando. Nada pasa a tu cronograma hasta que el plan se apruebe."}</p>
        ${ask ? html`<div class="inline grow"><input class="grow" value=${comment} onInput=${(e) => setComment(e.target.value)} placeholder="Qué habría que cambiar" aria-label="Qué habría que cambiar" /><button type="button" class="btn sm primary" onClick=${changes}>Enviar</button><button type="button" class="btn sm ghost" onClick=${() => setAsk(false)}>Cancelar</button></div>`
          : html`<div class="inline"><button type="button" class="btn primary" onClick=${ok}><${Icon} name="check" /> Dar visto bueno</button><button type="button" class="btn" onClick=${() => setAsk(true)}>Pedir cambios</button></div>`}
      </div>`;
  }

  function PlanTab({ project }) {
    const s = L.useStore();
    const plans = q.projectPlans(project.id);
    const open = q.openPlan(project.id), approved = q.approvedPlan(project.id);
    const [sel, setSel] = useState("");
    const [editing, setEditing] = useState(""); // id del entregable en edición, o "new"
    const [busy, setBusy] = useState(false);
    const lead = q.canLead(project);
    const plan = plans.find((p) => p.id === sel) || open || approved || plans[plans.length - 1];
    const step = async (name, msg) => { setBusy(true); const r = await act.planStep(plan.id, name); setBusy(false); if (r) { L.toast(msg); if (name === "nueva-version") setSel(r.id); } };

    if (!plan) {
      return html`<div class="glass"><${Empty} title="Este proyecto aún no tiene plan de entregables" text="El plan dice qué se entrega cada día o semana y quién está al mando. Cuando el equipo da su visto bueno y se aprueba, cada entregable pasa al cronograma personal de sus responsables.">
        ${lead ? html`<button type="button" class="btn primary" onClick=${async () => { const p = await act.createPlan(project.id); if (p) { setSel(p.id); setEditing("new"); } }}>Armar el plan</button>` : html`<span class="muted">Lo arma ${q.name(project.leader)}, que dirige el proyecto${project.apoyo ? ", con apoyo de " + q.name(project.apoyo) : ""}.</span>`}<//></div>`;
    }

    const items = q.planItems(plan.id);
    const reviewers = q.reviewers(project);
    const vistos = q.planVistos(plan.id);
    const okCount = reviewers.filter((m) => vistos.some((v) => v.user === m && v.verdict === "ok")).length;
    const allOk = okCount === reviewers.length;
    const editable = plan.status === "borrador" && lead;
    const iAmReviewer = reviewers.includes(s.me.id);
    const weeks = new Map();
    for (const it of items) { const d = L.parse(it.date); const k = L.iso(L.monday(d)); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(it); }

    return html`
      <div class="plan-top">
        <${Seg} label="Versión" value=${plan.id} onChange=${(id) => { setSel(id); setEditing(""); }} options=${plans.map((p) => ({ id: p.id, label: `v${p.version} · ${L.PLAN_STATUS[p.status]}` }))} />
        <span class="spacer"></span>
        ${editable && html`<button type="button" class="btn primary" disabled=${busy || !items.length} onClick=${() => step("enviar", reviewers.length ? "Plan enviado. El equipo ya fue avisado." : "Plan listo para aprobar.")}>Enviar a visto bueno</button>`}
        ${plan.status === "en_aprobacion" && lead && html`<button type="button" class="btn" disabled=${busy} onClick=${() => step("retirar", "Plan de vuelta en borrador. Los vistos buenos se reinician.")}>Retirar para corregir</button>`}
        ${plan.status === "en_aprobacion" && lead && html`<button type="button" class="btn primary" disabled=${busy || (!allOk && !q.isDirector())} title=${!allOk && !q.isDirector() ? "Se activa cuando todos den su visto bueno" : ""} onClick=${() => step("aprobar", "Plan aprobado. Cada entregable ya está en el cronograma de sus responsables.")}>${allOk ? "Aprobar plan" : q.isDirector() ? "Aprobar sin esperar" : "Aprobar plan"}</button>`}
        ${plan.status === "aprobado" && lead && !open && html`<button type="button" class="btn" disabled=${busy} onClick=${() => step("nueva-version", "Versión nueva en borrador. La aprobada sigue vigente hasta que apruebes esta.")}>Cambiar el plan</button>`}
      </div>

      ${plan.status === "borrador" && html`<div class="plan-banner"><p><b>Borrador.</b> ${lead ? "Todavía no está en el cronograma de nadie. Cuando esté listo, envíalo para que el equipo dé su visto bueno." : `${q.name(project.leader)} lo está armando. Te avisaremos cuando pida tu visto bueno.`}${approved && approved.id !== plan.id ? ` La versión ${approved.version} sigue vigente mientras tanto.` : ""}</p></div>`}
      ${plan.status === "en_aprobacion" && iAmReviewer && html`<${VistoBox} key=${plan.id} plan=${plan} />`}
      ${plan.status === "aprobado" && html`<div class="plan-banner ok"><${Icon} name="check" /><p><b>Aprobado${plan.approvedBy ? " por " + q.name(plan.approvedBy) : ""}${plan.approvedAt ? " el " + L.fmtShort(plan.approvedAt.slice(0, 10)) : ""}.</b> Cada entregable está en el cronograma personal de sus responsables.</p></div>`}
      ${plan.status === "reemplazado" && html`<div class="plan-banner"><p><b>Versión anterior.</b> Se conserva como registro; la vigente es la v${approved ? approved.version : ""}.</p></div>`}

      <div class="grid">
        <article class=${"glass panel " + (plan.status === "en_aprobacion" || plan.status === "aprobado" ? "span-8" : "span-12")}>
          <div class="panel-head"><h2><span class="sl">/</span>Entregables</h2><span class="tag">${items.length}</span></div>
          ${[...weeks.entries()].map(([wk, its]) => html`
            <div class="plan-week" key=${wk}>
              <div class="group-label">Semana ${L.isoWeek(L.parse(wk))}<span class="mono">${L.fmtShort(wk)} a ${L.fmtShort(L.iso(L.addDays(L.parse(wk), 6)))}</span></div>
              ${its.map((it) => editing === it.id ? html`<${ItemEditor} key=${it.id} item=${it} plan=${plan} project=${project} onDone=${() => setEditing("")} />` : html`
                <div class=${L.cx("plan-item", editable && "editable")} key=${it.id} onClick=${editable ? () => setEditing(it.id) : null} tabindex=${editable ? 0 : null}>
                  <div class="plan-date"><b>${L.fmtDay(it.date)}</b>${it.end && it.end !== it.date && html`<span>a ${L.fmtDay(it.end)}</span>`}</div>
                  <div class="plan-what"><div class="row-title">${it.content}</div>
                    <div class="row-meta">${it.area && html`<${AreaTag} id=${it.area} />`}${it.kind && html`<span>${L.KIND[it.kind].label}</span>`}${it.meeting && q.event(it.meeting) && html`<span class="for-meeting"><${Icon} name="flag" size=${12} /> Para ${q.event(it.meeting).title}, ${L.fmtShort(q.event(it.meeting).date)}</span>`}</div></div>
                  <div class="plan-who">${(it.assignees || []).length ? html`<${Faces} ids=${it.assignees} max=${4} /><span class="muted">${it.assignees.map((a) => L.first(q.name(a))).join(", ")}</span>` : html`<span class="tag warn">Sin responsable</span>`}</div>
                </div>`)}
            </div>`)}
          ${!items.length && editable && html`<${L.PlanTemplate} plan=${plan} project=${project} />`}
          ${!items.length && !editable && editing !== "new" && html`<p class="note">El plan está vacío.</p>`}
          ${editable && (editing === "new" ? html`<${ItemEditor} plan=${plan} project=${project} onDone=${() => setEditing("")} />` : html`<button type="button" class="btn add" onClick=${() => setEditing("new")}><${Icon} name="plus" size=${12} /> Agregar entregable</button>`)}
        </article>

        ${(plan.status === "en_aprobacion" || plan.status === "aprobado") && html`
          <article class="glass panel span-4">
            <div class="panel-head"><h2><span class="sl">/</span>Vistos buenos</h2><span class="tag">${okCount} de ${reviewers.length}</span></div>
            <div class="rows">
              ${[project.leader, project.apoyo].filter(Boolean).map((uid) => html`<div class="row static" key=${uid}><${Avatar} id=${uid} /><div class="row-main"><div class="row-title">${q.name(uid)}</div><div class="row-meta">${uid === project.leader ? "Dirige el proyecto y aprueba" : "Apoyo: arma y aprueba"}</div></div></div>`)}
              ${reviewers.map((m) => {
                const v = vistos.find((x) => x.user === m);
                return html`<div class="row static" key=${m}><${Avatar} id=${m} /><div class="row-main"><div class="row-title">${q.name(m)}</div>
                  <div class="row-meta">${v ? (v.verdict === "ok" ? "Visto bueno " + L.relTime(v.updated) : html`<span class="tag warn">Pide cambios</span> ${v.comment}`) : plan.status === "aprobado" ? "No alcanzó a responder" : "Pendiente"}</div></div>
                  ${v && v.verdict === "ok" ? html`<span class="ok-mark"><${Icon} name="check" /></span>` : null}</div>`;
              })}
              ${!reviewers.length && html`<p class="note">No hay más integrantes en el proyecto; quien lidera puede aprobar directamente.</p>`}
            </div>
          </article>`}

        ${items.length > 0 && html`<div class="span-12"><${Gantt} corner="Entregable" groups=${[{ label: "Plan v" + plan.version, sub: L.PLAN_STATUS[plan.status], markers: q.projectEvents(project.id).filter((e) => e.kind !== "comite").map((e) => ({ date: e.date, label: e.title, onClick: () => L.go("#evento/" + e.id) })),
          rows: items.map((it) => ({ id: it.id, label: it.content, sub: (it.assignees || []).map((a) => L.first(q.name(a))).join(", "), start: it.date, end: it.end || it.date, status: plan.status === "aprobado" ? "en_curso" : "pendiente", draft: plan.status !== "aprobado", onClick: editable ? () => setEditing(it.id) : null })) }]} /></div>`}
      </div>`;
  }

  /* ---------- detalle de proyecto ---------- */
  function ProjectSummary({ project }) {
    const s = L.useStore();
    const tasks = q.projectTasks(project.id);
    const open = tasks.filter((t) => t.status !== "terminado");
    const next = q.nextClientMeeting(project.id);
    const forNext = next ? tasks.filter((t) => t.meeting === next.id) : [];
    const comite = q.projectEvents(project.id).find((e) => e.kind === "comite" && e.date >= L.todayIso());
    const plan = q.openPlan(project.id) || q.approvedPlan(project.id);
    const people = [...new Set([project.leader, ...(project.members || [])].filter(Boolean))].map(q.user).filter(Boolean);
    const count = (st) => tasks.filter((t) => t.status === st).length;
    return html`
      <div class="grid">
        <div class="glass metrics span-12" role="list">
          ${L.STATUSES.map((st) => html`<div class=${L.cx("metric", !count(st.id) && "zero")} role="listitem" key=${st.id}><b>${count(st.id)}</b><span>${st.label}</span></div>`)}
          <div class=${L.cx("metric", open.some((t) => L.dueClass(t) === "late") ? "alert" : "zero")} role="listitem"><b>${open.filter((t) => L.dueClass(t) === "late").length}</b><span>Atrasadas</span></div>
        </div>
        <${Panel} title="¿Cómo va el proyecto?" cls="span-12">${html`<${L.Health} project=${project} />`}<//>
        <${Panel} title="Próxima reunión con el cliente" cls="span-6" action=${next ? html`<a class="link" href=${"#evento/" + next.id}>Abrir</a>` : html`<button type="button" class="btn sm" onClick=${() => L.openSheet("event", null, { kind: "cliente", project: project.id })}>Agendar</button>`}>
          ${next ? html`<div class="next-meeting"><div class="count"><b>${Math.max(0, L.diff(L.today(), L.parse(next.date)))}</b><span>días</span></div><div><div class="row-title">${next.title}</div><div class="row-meta">${L.cap(L.fmtLong(next.date))}${next.time ? " · " + next.time : ""}</div>
            <div class="row-meta">${forNext.length ? `${forNext.filter((t) => t.status === "terminado").length} de ${forNext.length} contenidos listos` : "Sin contenido asignado todavía"}</div></div></div>`
            : html`<p class="note">Agenda la reunión para que las tareas queden ligadas a ella.</p>`}
        <//>
        <${Panel} title="Plan y comité" cls="span-6" action=${html`<a class="link" href=${"#proyecto/" + project.id + "/plan"}>Ver plan</a>`}>
          <div class="rows">
            <div class="row static"><${Icon} name="plan" /><div class="row-main"><div class="row-title">${plan ? `Plan de entregables v${plan.version}` : "Sin plan de entregables"}</div><div class="row-meta">${plan ? L.PLAN_STATUS[plan.status] : q.canLead(project) ? "Ármalo en la pestaña Plan." : "Lo arma quien lidera."}</div></div></div>
            <div class="row static"><${Icon} name="users" /><div class="row-main"><div class="row-title">${comite ? comite.title : "Sin comité interno programado"}</div><div class="row-meta">${comite ? `${L.cap(L.relDay(comite.date))}${comite.time ? " · " + comite.time : ""}` : "Prográmalo para revisar avances antes de la reunión con el cliente."}</div></div>
              ${comite ? html`<a class="btn sm" href=${"#evento/" + comite.id}>Abrir</a>` : html`<button type="button" class="btn sm" onClick=${() => L.openSheet("event", null, { kind: "comite", project: project.id })}>Programar</button>`}</div>
          </div>
        <//>
        <${L.TeamNow} users=${people} title="Equipo del proyecto" />
        <${Panel} title="Lo que sigue" cls="span-7" action=${html`<a class="link" href=${"#proyecto/" + project.id + "/tareas"}>Tablero</a>`}>
          <div class="rows">${open.length ? open.sort(L.byDue).slice(0, 7).map((t) => html`<${TaskRow} key=${t.id} task=${t} showProject=${false} />`) : html`<p class="note">Sin tareas abiertas en este proyecto.</p>`}</div>
        <//>
        <${L.Feed} items=${s.actividad.filter((a) => a.project === project.id)} />
      </div>`;
  }

  function Proyecto({ id, tab }) {
    const s = L.useStore();
    const p = q.project(id);
    const [area, setArea] = useState("");
    if (!p) return html`<div class="glass"><${Empty} title="Este proyecto ya no existe"><a class="btn" href="#proyectos">Ver proyectos</a><//></div>`;
    const cur = tab || "resumen";
    const tasks = q.projectTasks(id);
    const events = q.projectEvents(id);
    const areas = [...new Set(tasks.map((t) => t.area).filter(Boolean))];
    const shown = area ? tasks.filter((t) => t.area === area) : tasks;
    const open = q.openPlan(id);
    const tabs = [
      { id: "resumen", label: "Resumen" }, { id: "plan", label: "Plan", count: open ? "•" : null }, { id: "tareas", label: "Tareas", count: tasks.filter((t) => t.status !== "terminado").length || null },
      { id: "cronograma", label: "Cronograma" }, { id: "reuniones", label: "Reuniones", count: events.filter((e) => e.date >= L.todayIso()).length || null }, { id: "archivo", label: "Archivo", count: tasks.filter((t) => t.status === "terminado").length || null },
      { id: "licencias", label: "Licencias", count: s.tramites.filter((x) => x.project === id && x.estado === "observaciones").length || null },
      { id: "planos", label: "Planos", count: s.planos.filter((x) => x.project === id).length || null },
      { id: "obra", label: "Obra", count: s.visitas.filter((x) => x.project === id).length || null },
      ...(q.canSeeMoney(p) ? [{ id: "finanzas", label: "Finanzas" }] : []),
    ];
    const groups = () => {
      const m = new Map();
      for (const t of shown.filter((t) => t.start || t.due)) { const k = t.area || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
      const g = [...m.entries()].map(([a, rows]) => ({ label: L.AREA[a] ? L.AREA[a].label : "Sin área", rows: rows.sort((x, y) => (x.start || x.due).localeCompare(y.start || y.due)).map(L.taskToRow) }));
      return [{ label: "Reuniones y entregas", markers: events.map((e) => ({ date: e.date, label: e.title, onClick: () => L.go("#evento/" + e.id) })), rows: [] }, ...g];
    };
    const areaFilter = areas.length > 1 && html`<${Seg} label="Área" value=${area} onChange=${setArea} options=${[{ id: "", label: "Todas" }, ...areas.map((a) => ({ id: a, label: L.AREA[a].label }))]} />`;
    const t = L.todayIso();
    return html`
      <${PageHead} eyebrow=${html`<a href="#proyectos">Proyectos</a>${p.code ? " · " + p.code : ""}${p.client ? " · " + p.client : ""}`} title=${p.name}
        sub=${[L.PHASE[p.phase] && L.PHASE[p.phase].label, q.aCargo(p).map((x) => (x.rol === "Director creativo" ? "Dirección creativa " : x.rol === "Apoyo" ? "apoyo " : "dirige ") + L.first(q.name(x.id))).join(", "), p.end && "Entrega final " + L.fmtShort(p.end)].filter(Boolean).join(" · ")}>
        <${Faces} ids=${p.members || []} max=${6} />
        ${p.folder && L.desk && html`<button type="button" class="btn" onClick=${() => L.openPath(p.folder)}><${Icon} name="folder" /> Carpeta</button>`}
        <button type="button" class="btn" onClick=${() => L.openSheet("project", p.id)}><${Icon} name="edit" /> ${q.canLead(p) ? "Editar" : "Datos"}</button>
      <//>
      <nav class="tabs" aria-label="Secciones del proyecto">${tabs.map((x) => html`<a key=${x.id} href=${"#proyecto/" + id + "/" + x.id} aria-current=${cur === x.id ? "page" : null}>${x.label}${x.count != null && html`<span class="count">${x.count}</span>`}</a>`)}</nav>
      ${cur === "resumen" && html`<${ProjectSummary} project=${p} />`}
      ${cur === "plan" && html`<${PlanTab} key=${id} project=${p} />`}
      ${cur === "tareas" && html`<div class="toolbar">${areaFilter}<span class="spacer"></span><button type="button" class="btn primary" onClick=${() => L.openSheet("task", null, { project: id, area })}><${Icon} name="plus" size=${12} /> Nueva tarea</button></div>
        ${tasks.length ? html`<${Board} tasks=${shown} showProject=${false} />` : html`<div class="glass"><${Empty} small title="Sin tareas" text="Créalas a mano o aprueba el plan de entregables para que se creen solas." /></div>`}`}
      ${cur === "cronograma" && html`${areaFilter && html`<div class="toolbar">${areaFilter}</div>`}<${Gantt} corner="Área y tarea" groups=${groups()} />`}
      ${cur === "reuniones" && html`
        <div class="toolbar"><span class="spacer"></span><button type="button" class="btn" onClick=${() => L.openSheet("event", null, { kind: "comite", project: id })}>Programar comité interno</button>
          <button type="button" class="btn primary" onClick=${() => L.openSheet("event", null, { kind: "cliente", project: id })}><${Icon} name="plus" size=${12} /> Reunión con cliente</button></div>
        <div class="grid">
          <${Panel} title="Próximas" cls="span-12"><div class="rows">${events.filter((e) => e.date >= t).length ? events.filter((e) => e.date >= t).map((e) => html`<${EventRow} key=${e.id} ev=${e} showProject=${false} />`) : html`<p class="note">Nada agendado. Registra la reunión con el cliente y los comités internos del proyecto.</p>`}</div><//>
          ${events.some((e) => e.date < t) && html`<${Panel} title="Anteriores" cls="span-12"><div class="rows">${events.filter((e) => e.date < t).reverse().map((e) => html`<${EventRow} key=${e.id} ev=${e} showProject=${false} />`)}</div><//>`}
        </div>`}
      ${cur === "archivo" && html`<${Archive} tasks=${tasks} showProject=${false} />`}
      ${cur === "licencias" && html`<${L.LicenciasTab} project=${p} />`}
      ${cur === "planos" && html`<${L.PlanosTab} project=${p} />`}
      ${cur === "obra" && html`<${L.ObraTab} project=${p} />`}
      ${cur === "finanzas" && (q.canSeeMoney(p) ? html`<${L.FinanzasTab} project=${p} />` : html`<div class="glass"><${Empty} small title="Solo para quien lidera, Dirección y Administración" /></div>`)}`;
  }

  Object.assign(L, { ProjectRow, Proyectos, Proyecto, PlanTab });
})();
