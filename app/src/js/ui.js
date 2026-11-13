// Piezas de interfaz compartidas por todas las vistas.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act } = L;
  const { useState, useEffect, useRef, useLayoutEffect } = hooks;

  /* ---------- iconos: línea fina, como pide el manual ---------- */
  const PATHS = {
    home: "M2.5 7.5 8 2.5l5.5 5v6h-4v-4h-3v4h-4z",
    calendar: "M2.5 4h11v9.5h-11zM2.5 6.5h11M5.5 2.5v3M10.5 2.5v3",
    folder: "M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6v5.5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z",
    users: "M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5M11 7.2a2.2 2.2 0 0 0 0-4.4M12 10.2c1.5.4 2.5 1.5 2.5 3.3",
    meet: "M2 4.5h8v7H2zM10 7l4-2.2v6.4L10 9",
    bell: "M4 11V7.5a4 4 0 0 1 8 0V11l1.2 1.5H2.8zM6.5 14h3",
    eye: "M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    eyeOff: "M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 2.5l11 11",
    search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM11 11l3.5 3.5",
    plus: "M8 2.5v11M2.5 8h11",
    close: "m4 4 8 8M12 4l-8 8",
    copy: "M5 5h8.5v8.5H5zM10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5",
    check: "m3 8.5 3.2 3.2L13 4.8",
    clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.5V8l2.5 1.5",
    left: "M10 3 5 8l5 5",
    right: "m6 3 5 5-5 5",
    edit: "M2.5 13.5l.6-3L10.8 2.8l2.4 2.4-7.7 7.7zM9.5 4.1l2.4 2.4",
    trash: "M3 4.5h10M6 4.5v-2h4v2M4.5 4.5l.5 9h6l.5-9",
    out: "M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4",
    grid: "M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z",
    plan: "M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3",
    flag: "M3.5 14V2.5M3.5 3h8l-1.5 2.5L11.5 8h-8",
    sun: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
    moon: "M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z",
    contrast: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 2v12",
    office: "M2 6.5 8 3l6 3.5L8 10zM2 6.5V10l6 3.5 6-3.5V6.5M8 10v3.5",
    bot: "M4 6h8a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 4 6zM8 6V3.5M6 9.5h.01M10 9.5h.01",
    settings: "M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
  };
  const Icon = ({ name, size = 15 }) => html`<svg class="ic" width=${size} height=${size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${PATHS[name] || ""} /></svg>`;
  const Sym = ({ cls = "sym" }) => html`<svg class=${cls} viewBox="0 0 88.89 76.26" aria-hidden="true"><use href="#lap-sym" /></svg>`;

  /* ---------- personas ---------- */
  function Avatar({ id, cls = "", dot = false }) {
    const u = q.user(id);
    const title = u ? u.name : "Alguien";
    const src = q.avatar(u) || (L.PIX && u && u.muneco ? L.PIX.faceUrl(u) : "");
    const inner = src ? html`<img class=${"av " + cls} src=${src} alt="" title=${title} />` : html`<span class=${"av " + cls} title=${title}>${L.initials(u && u.name)}</span>`;
    if (!dot) return inner;
    if (!q.online(u)) return html`<span class="av-wrap">${inner}</span>`;
    const pr = q.presenceInfo(u);
    return html`<span class="av-wrap">${inner}<span class=${L.cx("dot", pr.id === "no_molestar" && "dnd")} style=${pr.id === "disponible" ? null : { background: pr.color }} title=${pr.id === "disponible" ? "Conectado ahora" : pr.label}></span></span>`;
  }
  const Faces = ({ ids = [], max = 4, cls = "" }) => {
    if (!ids.length) return null;
    return html`<span class=${"faces " + cls}>${ids.slice(0, max).map((id) => html`<${Avatar} key=${id} id=${id} />`)}${ids.length > max && html`<span class="more">+${ids.length - max}</span>`}</span>`;
  };
  // Selector de personas con píldoras: se ve quién está y quién no de un vistazo.
  // Con `range` ([inicio, entrega]) marca a quien está ausente en esas fechas y no deja asignarle la tarea.
  function PeoplePicker({ candidates, value = [], onChange, disabled, range }) {
    const issue = (id) => (range ? q.absenceIssues([id], range[0], range[1]) : { block: [], warn: [] });
    const toggle = (id) => {
      if (!value.includes(id) && range) {
        const b = issue(id).block;
        if (b.length) { L.toast(b[0].text); return; }
      }
      onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    };
    if (!candidates.length) return html`<span class="muted">No hay personas para elegir.</span>`;
    return html`<div class="people">${candidates.map((id) => {
      const iss = issue(id);
      const away = iss.block.length ? "block" : iss.warn.length ? "warn" : "";
      return html`<button type="button" key=${id} class=${L.cx("pill", away && "away-" + away)} aria-pressed=${value.includes(id)} disabled=${disabled} onClick=${() => toggle(id)} title=${away ? (iss.block[0] || iss.warn[0]).text : ""}>
        <${Avatar} id=${id} /> ${L.first(q.name(id))}${away && html`<span class="away-tag">${away === "block" ? "ausente" : "ausencia en medio"}</span>`}
      </button>`;
    })}</div>`;
  }
  // Aviso bajo los responsables: quién no está en las fechas elegidas.
  function AbsenceNote({ ids, start, due }) {
    const iss = q.absenceIssues(ids || [], start, due);
    if (!iss.block.length && !iss.warn.length) return null;
    return html`<div class="absence-note">${iss.block.map((x) => html`<p class="err" key=${"b" + x.user}>${x.text}</p>`)}${iss.warn.map((x) => html`<p class="hint warn" key=${"w" + x.user}>${x.text}</p>`)}</div>`;
  }

  /* ---------- etiquetas ---------- */
  const Glyph = ({ s, live }) => html`<span class=${L.cx("glyph", live && "live", s === "terminado" && "fill")} data-s=${s}></span>`;
  const Chip = ({ s, label }) => html`<span class="chip" data-s=${s}>${label || (L.STATUS[s] && L.STATUS[s].label) || s}</span>`;
  const TaskChip = ({ task }) => {
    const stage = task.status === "en_curso" && task.stage && L.STAGE[task.stage];
    return html`<${Chip} s=${task.status} label=${stage ? stage.label : null} />`;
  };
  const AreaTag = ({ id }) => (L.AREA[id] ? html`<span class="tag area" data-a=${id}>${L.AREA[id].label}</span>` : null);
  const Progress = ({ value, s }) => {
    const p = Math.max(0, Math.min(100, Number(value) || 0));
    return html`<span class="bar-track" data-s=${s} title=${p + "%"}><i style=${{ width: p + "%" }}></i></span>`;
  };
  const Due = ({ task }) => html`<span class=${"due " + L.dueClass(task)}>${task.status === "terminado" ? "Terminada" : L.relDay(task.due)}</span>`;

  function copyText(text) {
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (p) p.then(() => L.toast("Copiado"), () => L.toast("No se pudo copiar. Selecciona la ruta y usa Ctrl+C."));
    } catch (e) { L.toast("No se pudo copiar. Selecciona la ruta y usa Ctrl+C."); }
  }
  function openPath(path) {
    if (!L.desk) return;
    L.desk.openPath(path).then((r) => { if (!r.ok) L.toast("No encuentro esa carpeta desde este PC. Revisa que la unidad de red esté conectada."); });
  }
  const PathBlock = ({ path }) => {
    if (!path) return html`<span class="muted">Sin ruta</span>`;
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    return html`<div class="path-wrap"><span class="path">${path}</span>
      ${L.desk && html`<button type="button" class="btn icon ghost sm" title="Abrir carpeta" aria-label="Abrir carpeta" onClick=${stop(() => openPath(path))}><${Icon} name="folder" /></button>`}
      <button type="button" class="btn icon ghost sm" title="Copiar ruta" aria-label="Copiar ruta" onClick=${stop(() => copyText(path))}><${Icon} name="copy" /></button>
    </div>`;
  };

  /* ---------- contenedores ---------- */
  const Panel = ({ title, action, children, cls = "" }) => html`
    <article class=${"glass panel " + cls}>
      <div class="panel-head"><h2><span class="sl">/</span>${title}</h2>${action}</div>
      ${children}
    </article>`;
  const Empty = ({ title, text, children, small }) => html`
    <div class=${L.cx("empty", small && "small")}>${!small && html`<${Sym} />`}<h2>${title}</h2>${text && html`<p>${text}</p>`}${children && html`<div class="acts">${children}</div>`}</div>`;
  const Seg = ({ options, value, onChange, label }) => html`
    <div class="seg" role="group" aria-label=${label}>${options.map((o) => html`<button type="button" key=${o.id} aria-pressed=${value === o.id} onClick=${() => onChange(o.id)}>${o.label}${o.count != null && html`<span class="count">${o.count}</span>`}</button>`)}</div>`;
  const Field = ({ label, hint, error, children, id }) => html`
    <div class="fld"><label for=${id}>${label}</label>${children}${hint && html`<span class="hint">${hint}</span>`}${error && html`<span class="err">${error}</span>`}</div>`;

  // Panel lateral de edición. Escape o el fondo lo cierran.
  function Sheet({ title, onClose, onSubmit, footer, children, wide }) {
    useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, []);
    return html`
      <div class="scrim" onClick=${onClose}></div>
      <form class=${L.cx("sheet glass", wide && "wide")} role="dialog" aria-modal="true" novalidate onSubmit=${(e) => { e.preventDefault(); if (onSubmit) onSubmit(); }}>
        <div class="sheet-head"><h2><span class="sl">/</span>${title}</h2><button type="button" class="btn icon ghost" aria-label="Cerrar" onClick=${onClose}><${Icon} name="close" size=${16} /></button></div>
        <div class="sheet-body">${children}</div>
        <div class="sheet-foot">${footer}</div>
      </form>`;
  }
  // Botón de eliminar con confirmación en el sitio.
  function DeleteButton({ onConfirm, label = "Eliminar" }) {
    const [ask, setAsk] = useState(false);
    if (!ask) return html`<button type="button" class="btn ghost danger" onClick=${() => setAsk(true)}>${label}</button>`;
    return html`<button type="button" class="btn danger" onClick=${onConfirm}>Confirmar</button><button type="button" class="btn ghost" onClick=${() => setAsk(false)}>No</button>`;
  }

  /* ---------- tareas ---------- */
  const taskMeta = (t, showProject) => {
    const p = showProject && q.project(t.project);
    return [p && (p.code || p.name), L.AREA[t.area] && L.AREA[t.area].label, L.KIND[t.kind] && L.KIND[t.kind].label].filter(Boolean).join(" · ");
  };
  const openTask = (id) => L.openSheet("task", id);
  function TaskRow({ task: t, showProject = true }) {
    const busy = q.workingOn(t.id).map((u) => u.id);
    const mt = t.meeting && q.event(t.meeting);
    return html`
      <div class="row" tabindex="0" onClick=${() => openTask(t.id)} onKeyDown=${(e) => { if (e.key === "Enter") openTask(t.id); }}>
        <${Glyph} s=${t.status} live=${busy.length > 0} />
        <div class="row-main">
          <div class="row-title">${t.title}</div>
          <div class="row-meta"><span>${taskMeta(t, showProject)}</span>${mt && html`<span class="for-meeting" title=${"Para: " + mt.title}><${Icon} name="flag" size=${12} /> ${L.fmtShort(mt.date)}</span>`}</div>
        </div>
        <div class="row-side">
          <div class="inline"><${Faces} ids=${t.assignees || []} max=${3} cls=${busy.length ? "busy" : ""} /><${TaskChip} task=${t} /></div>
          <div class="inline">${Number(t.progress) > 0 && t.status !== "terminado" && html`<${Progress} value=${t.progress} s=${t.status} />`}<${Due} task=${t} /></div>
        </div>
      </div>`;
  }

  // Tablero por estado. Arrastrar una tarjeta cambia su estado.
  function Board({ tasks, showProject = true }) {
    const [over, setOver] = useState("");
    const drag = useRef("");
    const drop = async (status) => {
      const id = drag.current; drag.current = ""; setOver("");
      const t = id && q.task(id);
      if (t && t.status !== status) { await act.saveTask(id, { status }); L.toast("Movida a " + L.STATUS[status].label); }
    };
    return html`<div class="board">${L.STATUSES.map((s) => {
      const items = tasks.filter((t) => t.status === s.id).sort(s.id === "terminado" ? (a, b) => (b.doneAt || "").localeCompare(a.doneAt || "") : L.byDue).slice(0, s.id === "terminado" ? 12 : 200);
      return html`
        <div key=${s.id} class=${L.cx("glass col", over === s.id && "over")} onDragOver=${(e) => { if (drag.current) { e.preventDefault(); setOver(s.id); } }} onDragLeave=${() => setOver("")} onDrop=${(e) => { e.preventDefault(); drop(s.id); }}>
          <div class="col-head"><${Glyph} s=${s.id} /><h2>${s.label}</h2><span class="mono">${tasks.filter((t) => t.status === s.id).length}</span></div>
          ${items.map((t) => {
            const busy = q.workingOn(t.id).length > 0;
            return html`
              <div key=${t.id} class=${L.cx("card", busy && "busy")} draggable="true" tabindex="0"
                onDragStart=${(e) => { drag.current = t.id; try { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* ignorar */ } }}
                onDragEnd=${() => { drag.current = ""; setOver(""); }}
                onClick=${() => openTask(t.id)} onKeyDown=${(e) => { if (e.key === "Enter") openTask(t.id); }}>
                <div class="card-title">${t.title}</div>
                <div class="card-meta">${taskMeta(t, showProject)}</div>
                ${t.status === "en_curso" && t.stage && html`<div><${TaskChip} task=${t} /></div>`}
                ${Number(t.progress) > 0 && t.status !== "terminado" && html`<${Progress} value=${t.progress} s=${t.status} />`}
                <div class="card-foot"><${Due} task=${t} /><${Faces} ids=${t.assignees || []} max=${3} cls=${busy ? "busy" : ""} /></div>
              </div>`;
          })}
        </div>`;
    })}</div>`;
  }

  // Archivo: lo terminado, con la ruta de su carpeta.
  function Archive({ tasks, showProject = true }) {
    const done = tasks.filter((t) => t.status === "terminado").sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    if (!done.length) return html`<div class="glass"><${Empty} small title="Nada terminado todavía" text="Lo que se marca como terminado queda aquí con la ruta de su carpeta." /></div>`;
    return html`
      <div class="glass arch">
        <div class="arch-row head"><div>Entregable</div><div>Versión</div><div>Terminado</div><div>Carpeta</div></div>
        ${done.map((t) => html`
          <div class="arch-row" key=${t.id}>
            <div><div class="t" onClick=${() => openTask(t.id)}>${t.title}</div><small>${taskMeta(t, showProject)}</small></div>
            <div class="mono">${[t.version, t.resolution].filter(Boolean).join(" · ") || "—"}</div>
            <div class="mono">${t.doneAt ? L.fmtShort(t.doneAt) : "—"}</div>
            <${PathBlock} path=${t.path} />
          </div>`)}
      </div>`;
  }

  /* ---------- cronograma (Gantt) ---------- */
  // groups: [{ label, sub, markers: [{ date, label, onClick }], rows: [{ id, label, sub, start, end, status, progress, late, faces, onClick }] }]
  function Gantt({ groups, corner = "Proyecto y tarea" }) {
    const [weeks, setWeeks] = useState(6);
    const [shift, setShift] = useState(0);
    const ref = useRef(null);
    const [width, setWidth] = useState(1000);
    useLayoutEffect(() => {
      const measure = () => { if (ref.current) setWidth(ref.current.clientWidth); };
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, []);
    const t = L.today();
    const start = L.addDays(L.monday(t), -7 + shift * 7);
    const days = weeks * 7;
    const end = L.addDays(start, days - 1);
    const labelW = width < 700 ? 150 : 240;
    const dayW = Math.max(weeks > 8 ? 14 : 20, Math.floor((width - labelW - 2) / days));
    const pos = (d) => L.diff(start, d);
    const todayPos = pos(t);
    const style = { "--day": dayW + "px", "--days": days, "--label": labelW + "px", width: labelW + dayW * days + "px" };
    return html`
      <div class="toolbar">
        <${Seg} label="Rango" value=${weeks} onChange=${setWeeks} options=${[4, 6, 10].map((w) => ({ id: w, label: w + " semanas" }))} />
        <div class="seg" role="group" aria-label="Mover">
          <button type="button" aria-label="Semana anterior" onClick=${() => setShift(shift - 1)}>‹</button>
          <button type="button" aria-pressed=${shift === 0} onClick=${() => setShift(0)}>Hoy</button>
          <button type="button" aria-label="Semana siguiente" onClick=${() => setShift(shift + 1)}>›</button>
        </div>
        <span class="muted light">${L.fmtShort(start)} a ${L.fmtShort(end)} ${end.getFullYear()}</span>
      </div>
      <div class="glass gantt-card" ref=${ref}><div class="g-scroll"><div class="g-inner" style=${style}>
        <div class="g-row g-head"><div class="g-label">${corner}</div><div class="g-lane plain">
          <div class="g-weeks">${Array.from({ length: weeks }, (_, i) => { const w = L.addDays(start, i * 7); return html`<span key=${i}><b>S${L.isoWeek(w)}</b>${L.fmtShort(w)}</span>`; })}</div>
          ${dayW >= 18 && html`<div class="g-days">${Array.from({ length: days }, (_, i) => { const d = L.addDays(start, i); return html`<span key=${i} class=${L.diff(d, t) === 0 ? "t" : ""}>${dayW >= 26 ? d.getDate() : L.INI[d.getDay()]}</span>`; })}</div>`}
        </div></div>
        ${groups.map((g) => html`
          <${L.Fragment} key=${g.label}>
            <div class="g-row g-proj"><div class="g-label"><b>${g.label}</b>${g.sub && html`<small>${g.sub}</small>`}</div><div class="g-lane">
              ${(g.markers || []).map((m, i) => { const d = L.parse(m.date); if (!d || d < start || d > end) return null; return html`<button type="button" key=${i} class="ms" style=${{ left: pos(d) * dayW + dayW / 2 + "px" }} title=${m.label + " · " + L.fmtShort(d)} onClick=${m.onClick}><i></i><span>${m.label}</span></button>`; })}
            </div></div>
            ${g.rows.map((r) => {
              let s = L.parse(r.start) || L.parse(r.end), e = L.parse(r.end) || L.parse(r.start);
              if (!s) return null;
              if (e < s) [s, e] = [e, s];
              const visible = !(e < start || s > end);
              const a = Math.max(0, pos(s)), b = Math.min(days - 1, pos(e));
              return html`
                <div class="g-row" key=${r.id}><div class="g-label"><b>${r.label}</b>${r.sub && html`<small>${r.sub}</small>`}</div><div class="g-lane">
                  ${visible && html`<button type="button" class=${L.cx("bar", r.late && "late", r.draft && "draft")} data-s=${r.status} style=${{ left: a * dayW + 2 + "px", width: Math.max(dayW - 4, (b - a + 1) * dayW - 4) + "px", "--p": (r.progress || 0) + "%" }} title=${r.label + " · " + L.fmtShort(s) + " a " + L.fmtShort(e)} onClick=${r.onClick}>
                    ${r.faces && r.faces.length > 0 && html`<${Faces} ids=${r.faces} max=${2} />`}<span>${r.label}</span></button>`}
                </div></div>`;
            })}
          <//>`)}
        ${todayPos >= 0 && todayPos < days && html`<div class="today-line" style=${{ left: labelW + todayPos * dayW + dayW / 2 + "px" }}></div>`}
      </div></div></div>`;
  }
  const taskToRow = (t) => ({
    id: t.id, label: t.title, sub: [L.STATUS[t.status].label, (t.assignees || []).map((id) => L.first(q.name(id))).join(", ")].filter(Boolean).join(" · "),
    start: t.start, end: t.due, status: t.status, progress: t.status === "terminado" ? 100 : t.progress, late: L.dueClass(t) === "late",
    faces: q.workingOn(t.id).map((u) => u.id), onClick: () => openTask(t.id),
  });

  /* ---------- reuniones ---------- */
  function EventRow({ ev, showProject = true }) {
    const p = q.project(ev.project);
    const d = L.parse(ev.date);
    const n = d ? L.diff(L.today(), d) : 0;
    const mine = state().me && (ev.attendees || []).includes(state().me.id);
    const needsReport = ev.kind === "comite" && mine && n >= 0 && !state().reportes.some((r) => r.event === ev.id && r.user === state().me.id);
    return html`
      <div class="row" tabindex="0" onClick=${() => L.go("#evento/" + ev.id)} onKeyDown=${(e) => { if (e.key === "Enter") L.go("#evento/" + ev.id); }}>
        <span class=${"ev-mark " + ev.kind}><i></i></span>
        <div class="row-main">
          <div class="row-title">${ev.title}</div>
          <div class="row-meta"><span>${L.EVENT_KIND[ev.kind].label}${showProject && p ? " · " + (p.code || p.name) : ""}</span>${needsReport && html`<span class="tag warn">Falta tu avance</span>`}</div>
        </div>
        <div class="row-side">
          <span class=${L.cx("due", n < 0 ? "" : n <= 1 ? "soon" : "")}>${L.relDay(ev.date)}${ev.time ? " · " + ev.time : ""}</span>
          <div class="inline"><span class="mono muted">${L.fmtDay(ev.date)}</span><${Faces} ids=${ev.attendees || []} max=${4} /></div>
        </div>
      </div>`;
  }
  // Campo de contraseña con el ojito para verla mientras se escribe.
  function PassInput(props) {
    const [show, setShow] = useState(false);
    return html`<span class="pass-wrap"><input ...${props} type=${show ? "text" : "password"} /><button type="button" class="pass-eye" tabindex="-1" aria-label=${show ? "Ocultar la contraseña" : "Ver la contraseña"} aria-pressed=${show} title=${show ? "Ocultar" : "Ver"} onClick=${() => setShow(!show)}><${Icon} name=${show ? "eyeOff" : "eye"} size=${16} /></button></span>`;
  }
  const state = () => L.state;

  Object.assign(L, {
    PassInput,
    Icon, Sym, Avatar, Faces, PeoplePicker, AbsenceNote, Glyph, Chip, TaskChip, AreaTag, Progress, Due, PathBlock, Panel, Empty, Seg, Field, Sheet, DeleteButton,
    TaskRow, Board, Archive, Gantt, taskToRow, EventRow, openTask, taskMeta, copyText, openPath,
  });
})();
