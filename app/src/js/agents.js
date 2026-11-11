// Agentes del estudio: muñequitos que revisan los datos con reglas fijas, sin inteligencia artificial
// ni servicios externos. Todo corre en este PC con lo que ya está sincronizado; no consumen nada.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, Panel, Empty, Seg, Avatar, Icon } = L;
  const { useState } = hooks;

  const AGENTS = [
    { id: "vigia", name: "Vigía", job: "Fechas de entrega y tareas bloqueadas", color: "#0057ff", prop: "clock",
      intro: "Reviso que nada se pase de fecha y aviso cuando una tarea espera por otra." },
    { id: "agenda", name: "Agenda", job: "Reuniones, actas y avances de comité", color: "#e08a00", prop: "calendar",
      intro: "Miro las reuniones que vienen y lo que falta para llegar listos." },
    { id: "plan", name: "Plan", job: "Planes de entregables y vistos buenos", color: "#7c4dff", prop: "plan",
      intro: "Sigo los planes: quién debe dar visto bueno, qué falta aprobar y qué proyecto no tiene plan." },
    { id: "equipo", name: "Equipo", job: "Carga de trabajo y ausencias", color: "#16a34a", prop: "users",
      intro: "Cuido que nadie esté sobrecargado y que no haya entregas para quien no está." },
    { id: "tramites", name: "Trámites", job: "Licencias, planos y revisiones de imagen", color: "#0e9aa7", prop: "flag",
      intro: "Vigilo plazos de curaduría, vigencias, planos en revisión y comentarios sin resolver." },
    { id: "cuentas", name: "Cuentas", job: "Cobros vencidos y por facturar", color: "#3d3d3d", prop: "grid", fin: true,
      intro: "Llevo los cobros vencidos y lo que toca facturar pronto." },
  ];
  const AGENT = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
  const LEVELS = { alta: 0, media: 1, info: 2 };

  const days = (a, b) => L.diff(L.parse(a), L.parse(b));
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const leaderOf = (pid) => { const p = q.project(pid); return p ? p.leader : ""; };
  const pname = (pid) => { const p = q.project(pid); return p ? (p.code ? p.code + " · " : "") + p.name : ""; };
  const minutes = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

  // Reglas: cada una devuelve hallazgos { key, agent, level, title, detail, who, project, go }.
  function run() {
    const s = L.state;
    if (!s.me) return [];
    const t = L.todayIso();
    const plus = (n) => L.iso(L.addDays(L.today(), n));
    const out = [];
    const add = (agent, level, key, title, detail, who, project, go) => out.push({ agent, level, key: agent + ":" + key, title, detail, who: uniq(who || []), project: project || "", go: go || "" });
    const open = s.tareas.filter((x) => x.status !== "terminado");

    /* Vigía: atrasos, entregas de hoy sin empezar y dependencias */
    for (const x of open) {
      const go = "#tarea/" + x.id;
      if (x.due && x.due < t) {
        const n = days(x.due, t);
        add("vigia", n > 3 ? "alta" : "media", "late" + x.id, `«${x.title}» va ${L.plural(n, "día", "días")} atrasada`, [pname(x.project), "Era para el " + L.fmtShort(x.due)].filter(Boolean).join(" · "), [...(x.assignees || []), leaderOf(x.project)], x.project, go);
      } else if (x.due && x.due <= plus(1) && x.status === "pendiente") {
        add("vigia", "media", "start" + x.id, `«${x.title}» se entrega ${x.due === t ? "hoy" : "mañana"} y no ha empezado`, pname(x.project), x.assignees, x.project, go);
      }
      for (const d of x.dependsOn || []) {
        const dep = q.task(d);
        if (!dep || dep.status === "terminado") continue;
        if (dep.due && x.due && dep.due > x.due) add("vigia", "alta", "dep" + x.id + d, `«${x.title}» depende de algo que se entrega después`, `«${dep.title}» es para el ${L.fmtShort(dep.due)} y esta para el ${L.fmtShort(x.due)}.`, [...(x.assignees || []), ...(dep.assignees || []), leaderOf(x.project)], x.project, go);
        else if (x.start && x.start <= t) add("vigia", "media", "blk" + x.id + d, `«${x.title}» está esperando a «${dep.title}»`, `Debía arrancar el ${L.fmtShort(x.start)}. ${dep.assignees && dep.assignees.length ? "La tiene " + dep.assignees.map((a) => q.first(a)).join(", ") + "." : ""}`, [...(x.assignees || []), ...(dep.assignees || [])], x.project, "#tarea/" + dep.id);
      }
    }

    /* Agenda: reuniones con cliente sin contenido listo, actas pendientes y avances de comité */
    for (const ev of s.eventos) {
      const go = "#evento/" + ev.id;
      const lead = leaderOf(ev.project);
      if (ev.kind === "cliente" && ev.date >= t && ev.date <= plus(7)) {
        const content = s.tareas.filter((x) => x.meeting === ev.id);
        const missing = content.filter((x) => x.status !== "terminado");
        const n = days(t, ev.date);
        if (missing.length && n <= 3) add("agenda", n <= 1 ? "alta" : "media", "cont" + ev.id, `${L.cap(L.relDay(ev.date))}: «${ev.title}» con ${L.plural(missing.length, "contenido pendiente", "contenidos pendientes")}`, missing.slice(0, 3).map((x) => x.title).join(", ") + (missing.length > 3 ? "…" : ""), [lead, ...missing.flatMap((x) => x.assignees || [])], ev.project, go);
        else if (!content.length) add("agenda", "info", "empty" + ev.id, `«${ev.title}» no tiene contenido asignado`, `${L.cap(L.relDay(ev.date))}. Liga las tareas que se van a mostrar para saber si llegan listas.`, [lead], ev.project, go);
      }
      if (ev.date < t && ev.date >= plus(-10) && !String(ev.acta || "").trim()) add("agenda", "info", "acta" + ev.id, `«${ev.title}» no tiene acta`, `Fue el ${L.fmtShort(ev.date)}. Anotar decisiones y compromisos evita que se pierdan.`, [lead, ev.createdBy], ev.project, go);
      if (ev.kind === "comite" && ev.date >= t && ev.date <= plus(3)) {
        const faltan = (ev.attendees || []).filter((a) => !s.reportes.some((r) => r.event === ev.id && r.user === a));
        for (const a of faltan) add("agenda", ev.date === t ? "alta" : "media", "rep" + ev.id + a, `${q.first(a) === "Tú" ? "Te falta" : q.first(a) + " no ha escrito"} el avance para «${ev.title}»`, L.cap(L.relDay(ev.date)) + (ev.time ? " · " + ev.time : ""), [a], ev.project, go);
      }
    }

    /* Plan: vistos buenos, aprobaciones y proyectos sin plan */
    for (const p of s.proyectos.filter((x) => x.status === "activo")) {
      const go = "#proyecto/" + p.id + "/plan";
      const openPlan = q.openPlan(p.id);
      if (!openPlan && !q.approvedPlan(p.id)) add("plan", "info", "none" + p.id, `${pname(p.id)} no tiene plan de entregables`, "Sin plan aprobado, nadie tiene sus entregas en el cronograma.", [p.leader], p.id, go);
      if (openPlan && openPlan.status === "en_aprobacion") {
        const vistos = q.planVistos(openPlan.id);
        const rev = q.reviewers(p);
        const faltan = rev.filter((m) => !vistos.some((v) => v.user === m));
        const cambios = vistos.filter((v) => v.verdict === "cambios");
        for (const m of faltan) add("plan", "media", "visto" + openPlan.id + m, `${q.first(m) === "Tú" ? "Falta tu" : "Falta el de " + q.first(m) + ","} visto bueno al plan de ${p.name}`, "El plan no pasa a los cronogramas hasta que todos lo revisen.", [m], p.id, go);
        if (cambios.length) add("plan", "media", "cambios" + openPlan.id, `Piden cambios al plan de ${p.name}`, cambios.map((v) => q.first(v.user) + (v.comment ? ": " + v.comment : "")).join(" · "), [p.leader], p.id, go);
        if (!faltan.length && !cambios.length) add("plan", "alta", "aprobar" + openPlan.id, `El plan de ${p.name} ya tiene todos los vistos buenos`, "Solo falta aprobarlo para que pase al cronograma de cada responsable.", [p.leader], p.id, go);
      }
      if (openPlan && openPlan.status === "borrador") {
        const sin = q.planItems(openPlan.id).filter((i) => !(i.assignees || []).length).length;
        if (sin) add("plan", "info", "sinresp" + openPlan.id, `El borrador del plan de ${p.name} tiene ${L.plural(sin, "entregable", "entregables")} sin responsable`, "Asigna quién está al mando de cada uno antes de enviarlo.", [p.leader], p.id, go);
      }
    }

    /* Equipo: sobrecarga y entregas para quien está ausente */
    const weekEnd = L.iso(L.addDays(L.monday(L.today()), 6));
    for (const u of q.staff()) {
      const mine = open.filter((x) => (x.assignees || []).includes(u.id));
      const week = mine.filter((x) => x.due && x.due <= weekEnd);
      if (week.length >= 7) add("equipo", "media", "load" + u.id, `${q.first(u.id) === "Tú" ? "Tienes" : q.first(u.id) + " tiene"} ${week.length} entregas esta semana`, "Puede ser buen momento para repartir algunas.", [u.id], "", "#equipo");
      for (const a of s.ausencias.filter((x) => x.user === u.id && x.hasta >= t)) {
        const clash = mine.filter((x) => x.due && x.due >= a.desde && x.due <= a.hasta);
        if (clash.length) add("equipo", "alta", "aus" + a.id, `${q.first(u.id) === "Tú" ? "Tienes" : q.first(u.id) + " tiene"} ${L.plural(clash.length, "entrega", "entregas")} mientras está ${L.labelOf(L.AUSENCIA_TIPOS, a.tipo).toLowerCase() === "vacaciones" ? "de vacaciones" : "ausente"}`, clash.slice(0, 3).map((x) => x.title + " (" + L.fmtShort(x.due) + ")").join(", "), [u.id, ...clash.map((x) => leaderOf(x.project))], clash[0].project, "#tarea/" + clash[0].id);
      }
    }

    /* Trámites: curaduría, vigencias, planos y revisiones de imagen */
    for (const tr of s.tramites) {
      const go = "#proyecto/" + tr.project + "/licencias";
      if (tr.estado === "observaciones" && tr.fechaLimite && tr.fechaLimite <= plus(5)) {
        const n = days(t, tr.fechaLimite);
        add("tramites", n <= 2 ? "alta" : "media", "obs" + tr.id, n < 0 ? `Se venció el plazo para responder observaciones de ${pname(tr.project)}` : `Quedan ${L.plural(n, "día", "días")} para responder observaciones de ${pname(tr.project)}`, (tr.entidad || "Curaduría") + (tr.radicado ? " · radicado " + tr.radicado : ""), [tr.responsable, leaderOf(tr.project)], tr.project, go);
      }
      if (tr.estado === "aprobado" && tr.vigenciaHasta && tr.vigenciaHasta >= t && tr.vigenciaHasta <= plus(60)) add("tramites", "info", "vig" + tr.id, `La licencia de ${pname(tr.project)} vence el ${L.fmtShort(tr.vigenciaHasta)}`, "Si la obra no termina antes, toca pedir prórroga a tiempo.", [tr.responsable, leaderOf(tr.project)], tr.project, go);
    }
    for (const pl of s.planos.filter((x) => x.estado === "para_revision" && x.updated && days(x.updated.slice(0, 10), t) >= 5)) add("tramites", "info", "plano" + pl.id, `${pl.codigo} lleva ${days(pl.updated.slice(0, 10), t)} días esperando revisión`, pname(pl.project), [leaderOf(pl.project)], pl.project, "#proyecto/" + pl.project + "/planos");
    for (const r of s.revisiones.filter((x) => x.estado === "abierta")) {
      const pending = (r.pins || []).filter((p) => !p.resolved && p.at && days(p.at.slice(0, 10), t) >= 3);
      if (pending.length) { const task = q.task(r.task); add("tramites", "media", "rev" + r.id, `${L.plural(pending.length, "comentario", "comentarios")} sin resolver en «${r.titulo}»`, "Llevan más de 3 días en la revisión de imagen.", task ? task.assignees : [r.by], r.project, "#revision/" + r.id); }
    }

    /* Cuentas: solo Dirección y Administración */
    if (q.isFin()) {
      const fin = q.staff().filter((u) => u.role === "director" || (u.areas || []).includes("administracion")).map((u) => u.id);
      for (const c of s.cobros.filter((x) => x.estado !== "pagado" && x.fechaEsperada)) {
        const go = "#proyecto/" + c.project + "/finanzas";
        if (c.fechaEsperada < t) add("cuentas", days(c.fechaEsperada, t) > 15 ? "alta" : "media", "venc" + c.id, `Cobro vencido: ${c.concepto} · ${L.money(c.valor)}`, `${pname(c.project)} · esperado el ${L.fmtShort(c.fechaEsperada)}${c.estado === "facturado" ? " · ya facturado" : " · sin facturar"}`, fin, c.project, go);
        else if (c.fechaEsperada <= plus(7) && c.estado === "pendiente") add("cuentas", "info", "prox" + c.id, `Toca facturar ${c.concepto} · ${L.money(c.valor)}`, `${pname(c.project)} · ${L.relDay(c.fechaEsperada)}`, fin, c.project, go);
      }
    }
    return out.sort((a, b) => LEVELS[a.level] - LEVELS[b.level]);
  }

  // Lo que le toca a la persona: lo suyo, y lo de los proyectos que lidera. Dirección ve todo con "Todo el estudio".
  const relevant = (f, me) => f.who.includes(me) || (f.project && leaderOf(f.project) === me);
  function mine() { const me = L.state.me && L.state.me.id; return run().filter((f) => relevant(f, me)); }
  function counts(list) { const c = {}; for (const f of list) { c[f.agent] = c[f.agent] || { total: 0, alta: 0 }; c[f.agent].total++; if (f.level === "alta") c[f.agent].alta++; } return c; }
  const visibleAgents = () => AGENTS.filter((a) => !a.fin || q.isFin());

  /* ---------- muñequito: figura propia, hecha con formas simples ---------- */
  const PROP_PATHS = { clock: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3l2 1.5", calendar: "M2.5 4h11v9.5h-11zM2.5 6.5h11M5.5 2.5v3M10.5 2.5v3", plan: "M3 3.5h10M3 8h10M3 12.5h6", users: "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM1.5 13c0-2.2 1.8-4 4-4s4 1.8 4 4M11 7a1.8 1.8 0 1 0 0-3.6M12 9c1.6.4 2.5 1.9 2.5 4", flag: "M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8", grid: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z" };
  // Dibujada con el origen en los pies; sirve en la página y dentro de la oficina isométrica.
  function AgentShape({ agent, mood = "ok", bob = true }) {
    const c = agent.color;
    return html`<g class=${L.cx("agent-shape", bob && "bob")}>
      <ellipse cx="0" cy="0" rx="13" ry="5" class="agent-shadow" />
      <rect x="-11" y="-30" width="22" height="26" rx="9" fill=${c} />
      <rect x="-7" y="-25" width="14" height="9" rx="4" class="agent-visor" />
      <circle cx="-3" cy="-20.5" r="1.6" class="agent-eye" /><circle cx="3" cy="-20.5" r="1.6" class="agent-eye" />
      ${mood === "alert" ? html`<path d="M-3 -12 h6" class="agent-mouth" />` : html`<path d="M-3 -13 q3 2.4 6 0" class="agent-mouth" />`}
      <line x1="0" y1="-30" x2="0" y2="-36" stroke=${c} stroke-width="1.6" />
      <g transform="translate(-7,-50) scale(0.875)"><rect x="0" y="0" width="16" height="16" rx="5" fill=${c} /><path d=${PROP_PATHS[agent.prop]} class="agent-prop" /></g>
    </g>`;
  }
  const AgentBadge = ({ agent, count, alta, size = 64 }) => html`<svg class="agent-svg" width=${size} height=${size * 1.05} viewBox="-26 -56 52 60" aria-hidden="true">
    <${AgentShape} agent=${agent} mood=${alta ? "alert" : "ok"} />
    ${count > 0 && html`<g transform="translate(14,-50)"><circle r="8" class=${alta ? "agent-count alta" : "agent-count"} /><text y="3.5" text-anchor="middle" class="agent-count-t">${count > 9 ? "9+" : count}</text></g>`}
  </svg>`;

  /* ---------- página de agentes ---------- */
  function Agentes({ id }) {
    const s = L.useStore();
    const me = s.me.id;
    const [scope, setScope] = useState("mio");
    const all = run();
    const list = scope === "todo" && (q.isDirector() || q.isFin()) ? all : all.filter((f) => relevant(f, me));
    const agents = visibleAgents();
    const sel = id && AGENT[id] ? id : "";
    const c = counts(list);
    const shown = sel ? list.filter((f) => f.agent === sel) : list;
    const open = (f) => { if (f.go.startsWith("#tarea/")) L.openTask(f.go.slice(7)); else L.go(f.go); };
    return html`
      <${L.PageHead} title="Agentes" sub="Muñequitos que revisan el estudio con reglas fijas. No usan inteligencia artificial ni internet: corren en este PC con los datos que ya tienes.">
        ${(q.isDirector() || q.isFin()) && html`<${Seg} label="Alcance" value=${scope} onChange=${setScope} options=${[{ id: "mio", label: "Lo mío" }, { id: "todo", label: "Todo el estudio" }]} />`}
      <//>
      <div class="agents-row">
        ${agents.map((a) => html`<a key=${a.id} class=${L.cx("glass agent-card", sel === a.id && "on")} href=${sel === a.id ? "#agentes" : "#agentes/" + a.id} aria-current=${sel === a.id ? "page" : null}>
          <${AgentBadge} agent=${a} count=${(c[a.id] || {}).total || 0} alta=${(c[a.id] || {}).alta || 0} />
          <b>${a.name}</b><small>${a.job}</small>
        </a>`)}
      </div>
      ${sel && html`<p class="agent-intro"><b>${AGENT[sel].name}:</b> ${AGENT[sel].intro}</p>`}
      ${shown.length ? html`<div class="glass panel"><div class="rows">${shown.map((f) => html`
        <div class="row finding" key=${f.key} tabindex="0" onClick=${() => open(f)} onKeyDown=${(e) => { if (e.key === "Enter") open(f); }}>
          <span class=${"lvl " + f.level} title=${f.level === "alta" ? "Urgente" : f.level === "media" ? "Importante" : "Para tener en cuenta"}></span>
          <svg class="agent-mini" width="26" height="28" viewBox="-16 -54 32 56" aria-hidden="true"><${AgentShape} agent=${AGENT[f.agent]} bob=${false} /></svg>
          <div class="row-main"><div class="row-title">${f.title}</div><div class="row-meta">${f.detail && html`<span>${f.detail}</span>`}</div></div>
          <div class="row-side">${f.who.length > 0 && html`<${L.Faces} ids=${f.who.filter((w) => q.user(w))} max=${3} />`}<${Icon} name="right" /></div>
        </div>`)}</div></div>`
        : html`<div class="glass"><${Empty} title=${sel ? AGENT[sel].name + " no encontró nada" : "Todo en orden"} text=${scope === "mio" ? "Nada pendiente para ti. Los agentes vuelven a revisar cada vez que algo cambia." : "Nada pendiente en el estudio."} /></div>`}`;
  }

  // Tira para Inicio: lo más urgente de los agentes.
  function AgentStrip() {
    L.useStore();
    const list = mine();
    if (!list.length) return null;
    const top = list.filter((f) => f.level !== "info").slice(0, 3);
    const c = counts(list);
    return html`<a class="glass agent-strip span-12" href="#agentes">
      <div class="agent-faces">${visibleAgents().filter((a) => c[a.id]).map((a) => html`<svg key=${a.id} width="30" height="32" viewBox="-16 -54 32 56" aria-hidden="true"><${AgentShape} agent=${a} bob=${false} mood=${c[a.id].alta ? "alert" : "ok"} /></svg>`)}</div>
      <div class="row-main"><div class="row-title">Los agentes encontraron ${L.plural(list.length, "cosa", "cosas")} para ti</div>
        <div class="row-meta">${(top.length ? top : list.slice(0, 2)).map((f) => html`<span key=${f.key}>${f.title}</span>`)}</div></div>
      <span class="link">Ver todo</span>
    </a>`;
  }

  Object.assign(L, { AGENTS, AGENT, agentFindings: run, myFindings: mine, agentCounts: counts, visibleAgents, AgentShape, AgentBadge, Agentes, AgentStrip });
})();
