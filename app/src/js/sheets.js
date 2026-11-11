// Paneles laterales: tarea, reunión o comité, proyecto y perfil.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Field, Sheet, PeoplePicker, Avatar, Faces, Icon, DeleteButton } = L;
  const { useState, useEffect } = hooks;

  const useForm = (initial) => {
    const [f, setF] = useState(initial);
    const set = (k) => (e) => setF((p) => ({ ...p, [k]: e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
    return [f, setF, set];
  };
  const Pills = ({ options, value, onChange, disabled, attr }) => html`
    <div class="stages">${options.map((o) => html`<button type="button" key=${o.id} ...${attr ? { [attr]: o.id } : {}} aria-pressed=${Array.isArray(value) ? value.includes(o.id) : value === o.id} disabled=${disabled} onClick=${() => onChange(o.id)}>${o.label}</button>`)}</div>`;
  const toggleIn = (arr, id) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const projectOptions = () => L.state.proyectos.filter((p) => p.status !== "cerrado").sort((a, b) => a.name.localeCompare(b.name, "es"));

  /* ---------- tarea ---------- */
  function TaskSheet({ id, defaults }) {
    const s = L.useStore();
    const task = id ? q.task(id) : null;
    const me = s.me;
    const t0 = L.today();
    const [f, setF, set] = useForm(() => task ? { ...task } : {
      title: "", project: "", area: (me.areas || []).find((a) => a !== "direccion") || "", kind: "", status: "pendiente", stage: "", progress: 0,
      assignees: [me.id], start: L.iso(t0), due: L.iso(L.addDays(t0, 3)), meeting: "", path: "", version: "", engine: "", resolution: "", notes: "", ...defaults,
    });
    const [meetingTouched, setMeetingTouched] = useState(!!task);
    const [newMeeting, setNewMeeting] = useState(null); // { title, date, time }
    const [err, setErr] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { act.setViewing(id || ""); return () => act.setViewing(""); }, [id]);
    // Si el proyecto ya tiene una reunión con cliente agendada, la tarea queda para la más cercana.
    useEffect(() => {
      if (meetingTouched || !f.project) return;
      const m = q.nextClientMeeting(f.project);
      setF((p) => ({ ...p, meeting: m ? m.id : "" }));
    }, [f.project, s.eventos.length]);

    if (id && !task) return html`<${Sheet} title="Tarea" onClose=${L.closeSheet} footer=${html`<button type="button" class="btn" onClick=${L.closeSheet}>Cerrar</button>`}><p class="note">Esta tarea ya no existe.</p><//>`;

    const project = q.project(f.project);
    const candidates = project ? [...new Set([project.leader, ...(project.members || [])].filter(Boolean))] : q.staff().map((u) => u.id);
    const meetings = f.project ? q.projectEvents(f.project).filter((e) => e.kind !== "comite" && (e.date >= L.todayIso() || e.id === f.meeting)) : [];
    const viz = f.area === "visualizacion";
    const workers = id ? q.workingOn(id) : [];
    const mine = workers.some((u) => u.id === me.id);
    const others = id ? q.viewing(id) : [];
    const plan = task && task.plan && s.planes.find((p) => p.id === task.plan);

    const save = async () => {
      if (!f.title.trim()) { setErr("Escribe qué hay que hacer."); return; }
      const ab = q.absenceIssues(f.assignees, f.start, f.due).block;
      if (ab.length && (!task || JSON.stringify([task.assignees, task.start, task.due]) !== JSON.stringify([f.assignees, f.start, f.due]))) { L.toast(ab[0].text); return; }
      if (f.status === "terminado" && viz && !f.path) { setErr("Agrega la ruta de la carpeta para dejarlo en el archivo."); return; }
      setSaving(true);
      let meeting = f.meeting;
      if (newMeeting && newMeeting.date && f.project) {
        const ev = await act.saveEvent(null, { project: f.project, kind: "cliente", title: newMeeting.title || "Reunión con cliente", date: newMeeting.date, time: newMeeting.time || "", duration: 60, attendees: candidates });
        if (!ev) { setSaving(false); return; }
        meeting = ev.id;
      }
      let start = f.start, due = f.due;
      if (start && due && due < start) [start, due] = [due, start];
      const body = {
        title: f.title.trim(), project: f.project || "", area: f.area || "", kind: f.kind || "", status: f.status, stage: f.status === "en_curso" && viz ? f.stage || "" : "",
        progress: Number(f.progress) || 0, assignees: f.assignees || [], start: start || "", due: due || "", meeting: meeting || "",
        path: (f.path || "").trim(), version: (f.version || "").trim(), engine: (f.engine || "").trim(), resolution: (f.resolution || "").trim(), notes: f.notes || "",
        dependsOn: (f.dependsOn || []).filter((d) => d !== id), parent: f.parent || "",
      };
      if (!id && f.origen) body.origen = f.origen;
      const rec = await act.saveTask(id, body);
      setSaving(false);
      if (rec) { L.toast(id ? "Cambios guardados" : "Tarea creada"); L.closeSheet(); }
    };
    const remove = async () => { if (await act.deleteTask(id)) { L.toast("Tarea eliminada"); L.closeSheet(); } };
    const pickFolder = async () => { const dir = await L.desk.pickFolder(f.path || (project && project.folder) || ""); if (dir) setF((p) => ({ ...p, path: dir })); };

    const footer = html`
      ${id && html`<${DeleteButton} onConfirm=${remove} />`}<span class="spacer"></span>
      <button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button>
      <button type="submit" class="btn primary" disabled=${saving}>${id ? "Guardar" : "Crear tarea"}</button>`;

    return html`
      <${Sheet} title=${id ? "Tarea" : "Nueva tarea"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
        ${id && html`<div class="stack">
          ${others.length > 0 && html`<div class="presence-note"><${Faces} ids=${others.map((u) => u.id)} /><p>${others.map((u) => L.first(u.name)).join(", ")} ${others.length === 1 ? "también tiene" : "también tienen"} abierta esta tarea. Si varios guardan, queda el último cambio.</p></div>`}
          <div class="work-box"><p>${workers.length ? html`<b>${workers.map((u) => q.first(u.id)).join(", ")}</b> ${workers.length === 1 && !mine ? "está" : workers.length === 1 ? "estás" : "están"} trabajando en esto ahora.` : "Nadie la tiene marcada como su trabajo de ahora."}</p>
            <button type="button" class=${L.cx("btn sm", mine && "on")} onClick=${() => act.setWorking(mine ? null : id)}>${mine ? "Dejar de trabajar en esto" : "Estoy trabajando en esto"}</button></div>
        </div>`}
        <${Field} label="Qué hay que hacer" id="t-title" error=${err && !f.title.trim() ? err : ""}><input id="t-title" value=${f.title} onInput=${set("title")} placeholder="Renders de fachada, planos de licencia, moodboard…" /><//>
        <div class="two">
          <${Field} label="Proyecto" id="t-project"><select id="t-project" value=${f.project} onChange=${set("project")}><option value="">Sin proyecto</option>${projectOptions().map((p) => html`<option key=${p.id} value=${p.id}>${p.code ? p.code + " · " : ""}${p.name}</option>`)}</select><//>
          <${Field} label="Tipo" id="t-kind"><select id="t-kind" value=${f.kind} onChange=${(e) => { const k = e.target.value; setF((p) => ({ ...p, kind: k, area: p.area || L.KIND_AREA[k] || "" })); }}><option value="">Sin tipo</option>${L.KINDS.map((k) => html`<option key=${k.id} value=${k.id}>${k.label}</option>`)}</select><//>
        </div>
        <div class="fld"><span class="lbl">Área</span><${Pills} options=${L.AREAS} value=${f.area} attr="data-a" onChange=${(a) => setF((p) => ({ ...p, area: p.area === a ? "" : a }))} /></div>
        <div class="fld"><span class="lbl">Estado</span><${Pills} options=${L.STATUSES} value=${f.status} attr="data-s" onChange=${(st) => setF((p) => ({ ...p, status: st, progress: st === "terminado" ? 100 : p.progress }))} /></div>
        ${viz && f.status === "en_curso" && html`<div class="fld"><span class="lbl">Etapa de visualización</span><${Pills} options=${L.STAGES} value=${f.stage} onChange=${(st) => setF((p) => ({ ...p, stage: p.stage === st ? "" : st }))} /></div>`}
        <div class="fld"><span class="lbl">Responsables</span><${PeoplePicker} candidates=${candidates} value=${f.assignees || []} onChange=${set("assignees")} range=${[f.start, f.due]} />
          <${L.AbsenceNote} ids=${f.assignees} start=${f.start} due=${f.due} /></div>
        <div class="two">
          <${Field} label="Inicio" id="t-start"><input id="t-start" type="date" value=${f.start} onInput=${set("start")} /><//>
          <${Field} label="Entrega" id="t-due"><input id="t-due" type="date" value=${f.due} onInput=${set("due")} /><//>
        </div>
        ${f.project && html`<${Field} label="Es contenido para la reunión" id="t-meeting" hint=${!newMeeting && f.meeting && !meetingTouched ? "Se eligió sola la reunión con cliente más cercana del proyecto." : ""}>
          <select id="t-meeting" value=${newMeeting ? "__new" : f.meeting || ""} onChange=${(e) => { const v = e.target.value; setMeetingTouched(true); if (v === "__new") setNewMeeting({ title: "Reunión con cliente", date: f.due || L.todayIso(), time: "10:00" }); else { setNewMeeting(null); setF((p) => ({ ...p, meeting: v })); } }}>
            <option value="">Ninguna</option>
            ${meetings.map((m) => html`<option key=${m.id} value=${m.id}>${L.fmtDay(m.date)} · ${m.title}</option>`)}
            <option value="__new">Registrar una reunión con el cliente…</option>
          </select>
          ${newMeeting && html`<div class="three"><input aria-label="Nombre de la reunión" value=${newMeeting.title} onInput=${(e) => setNewMeeting({ ...newMeeting, title: e.target.value })} /><input aria-label="Fecha" type="date" value=${newMeeting.date} onInput=${(e) => setNewMeeting({ ...newMeeting, date: e.target.value })} /><input aria-label="Hora" type="time" value=${newMeeting.time} onInput=${(e) => setNewMeeting({ ...newMeeting, time: e.target.value })} /></div>`}
        <//>`}
        <${Field} label="Avance" id="t-progress"><div class="range-row"><input id="t-progress" type="range" min="0" max="100" step="5" value=${Number(f.progress) || 0} onInput=${set("progress")} /><span class="mono" style="width:40px;text-align:right">${Number(f.progress) || 0}%</span></div><//>
        <${Field} label="Carpeta del entregable" id="t-path" hint="Dónde queda el archivo final. Al terminar, aparece en el archivo con esta ruta." error=${err && f.title.trim() ? err : ""}>
          <div class="pick-row"><input id="t-path" class="mono" value=${f.path} onInput=${set("path")} placeholder="\\\\NAS\\Proyectos\\…\\Final\\" />
            ${L.desk && html`<button type="button" class="btn" onClick=${pickFolder}>Elegir…</button>`}
            ${L.desk && f.path && html`<button type="button" class="btn icon" title="Abrir carpeta" aria-label="Abrir carpeta" onClick=${() => L.openPath(f.path)}><${Icon} name="folder" /></button>`}</div>
        <//>
        <div class=${viz ? "three" : "two"}>
          <${Field} label="Versión" id="t-version"><input id="t-version" class="mono" value=${f.version} onInput=${set("version")} placeholder="v01" /><//>
          ${viz && html`<${Field} label="Motor" id="t-engine"><input id="t-engine" list="dl-engine" value=${f.engine} onInput=${set("engine")} placeholder="V-Ray, Corona…" /><//>`}
          ${viz && html`<${Field} label="Resolución" id="t-res"><input id="t-res" class="mono" list="dl-res" value=${f.resolution} onInput=${set("resolution")} placeholder="3840×2160" /><//>`}
        </div>
        ${f.project && html`<${L.DependsField} id=${id} project=${f.project} value=${f.dependsOn || []} onChange=${(v) => setF((p) => ({ ...p, dependsOn: v }))} />`}
        <${Field} label="Notas" id="t-notes"><textarea id="t-notes" value=${f.notes} onInput=${set("notes")} placeholder="Comentarios del cliente, referencias, pendientes"></textarea><//>
        ${task && html`<${L.TaskExtras} task=${task} />`}
        ${task && task.parent && q.task(task.parent) && html`<p class="meta-line">Subtarea de <a href="#" onClick=${(e) => { e.preventDefault(); L.openTask(task.parent); }}>${q.task(task.parent).title}</a></p>`}
        ${task && task.origen && html`<p class="meta-line">${L.originLabel(task.origen)}</p>`}
        ${plan && html`<p class="meta-line">Viene del plan de entregables v${plan.version} del proyecto.</p>`}
        ${task && task.updated && html`<p class="meta-line">Última edición ${task.updatedBy ? "de " + q.first(task.updatedBy) + " " : ""}${L.relTime(task.updated)}</p>`}
        <datalist id="dl-engine">${L.ENGINES.map((x) => html`<option key=${x} value=${x}></option>`)}</datalist>
        <datalist id="dl-res">${L.RESOLUTIONS.map((x) => html`<option key=${x} value=${x}></option>`)}</datalist>
      <//>`;
  }

  /* ---------- reunión, comité o entrega ---------- */
  function EventSheet({ id, defaults }) {
    const s = L.useStore();
    const ev = id ? q.event(id) : null;
    const [f, setF, set] = useForm(() => {
      if (ev) return { ...ev };
      const p = q.project(defaults.project);
      return { kind: "cliente", title: "", project: "", date: L.iso(L.addDays(L.today(), 7)), time: "10:00", duration: 60, attendees: p ? [...new Set([p.leader, ...(p.members || [])].filter(Boolean))] : [s.me.id], place: "", meetUrl: "", agenda: "", ...defaults };
    });
    const [repeat, setRepeat] = useState(1);
    const [err, setErr] = useState("");
    const project = q.project(f.project);
    const candidates = project ? [...new Set([project.leader, ...(project.members || [])].filter(Boolean))] : q.staff().map((u) => u.id);
    const defTitle = () => ({ cliente: "Reunión con cliente", comite: "Comité interno", entrega: "Entrega", interna: "Reunión interna" }[f.kind] + (project ? " · " + project.name : ""));

    const save = async () => {
      if (!f.date) { setErr("Elige la fecha."); return; }
      const base = { kind: f.kind, title: (f.title || "").trim() || defTitle(), project: f.project || "", time: f.time || "", duration: Number(f.duration) || 0, attendees: f.attendees || [], place: f.place || "", meetUrl: (f.meetUrl || "").trim(), agenda: f.agenda || "" };
      const n = id ? 1 : Math.max(1, Math.min(12, Number(repeat) || 1));
      let first = null;
      for (let i = 0; i < n; i++) {
        const rec = await act.saveEvent(id, { ...base, date: L.iso(L.addDays(L.parse(f.date), i * 7)) });
        if (!rec) return;
        first = first || rec;
      }
      L.toast(id ? "Cambios guardados" : n > 1 ? `${n} comités programados` : "Agendado");
      L.closeSheet();
      if (!id && first) L.go("#evento/" + first.id);
    };
    const remove = async () => { if (await act.deleteEvent(id)) { L.toast("Eliminado"); L.closeSheet(); L.go(project ? "#proyecto/" + project.id + "/reuniones" : "#reuniones"); } };
    const footer = html`${id && html`<${DeleteButton} onConfirm=${remove} />`}<span class="spacer"></span>
      <button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary">${id ? "Guardar" : "Agendar"}</button>`;
    return html`
      <${Sheet} title=${id ? "Editar" : "Agendar"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
        <div class="fld"><span class="lbl">Qué es</span><${Pills} options=${L.EVENT_KINDS} value=${f.kind} onChange=${set("kind")} /></div>
        <${Field} label="Proyecto" id="e-project"><select id="e-project" value=${f.project} onChange=${(e) => { const p = q.project(e.target.value); setF((x) => ({ ...x, project: e.target.value, attendees: p ? [...new Set([p.leader, ...(p.members || [])].filter(Boolean))] : x.attendees })); }}><option value="">Sin proyecto</option>${projectOptions().map((p) => html`<option key=${p.id} value=${p.id}>${p.code ? p.code + " · " : ""}${p.name}</option>`)}</select><//>
        <${Field} label="Nombre" id="e-title"><input id="e-title" value=${f.title} onInput=${set("title")} placeholder=${defTitle()} /><//>
        <div class="three">
          <${Field} label="Fecha" id="e-date" error=${err}><input id="e-date" type="date" value=${f.date} onInput=${set("date")} /><//>
          <${Field} label="Hora" id="e-time"><input id="e-time" type="time" value=${f.time} onInput=${set("time")} /><//>
          <${Field} label="Minutos" id="e-dur"><input id="e-dur" type="number" min="0" step="15" value=${f.duration} onInput=${set("duration")} /><//>
        </div>
        ${!id && f.kind === "comite" && html`<${Field} label="Repetir cada semana" id="e-rep" hint="Programa varios comités seguidos para no esperar a la víspera de la reunión con el cliente.">
          <select id="e-rep" value=${repeat} onChange=${(e) => setRepeat(e.target.value)}>${[1, 2, 3, 4, 6, 8, 12].map((n) => html`<option key=${n} value=${n}>${n === 1 ? "Solo este" : n + " semanas"}</option>`)}</select><//>`}
        <div class="fld"><span class="lbl">Asisten</span><${PeoplePicker} candidates=${candidates} value=${f.attendees || []} onChange=${set("attendees")} /></div>
        <${Field} label="Lugar" id="e-place"><input id="e-place" value=${f.place} onInput=${set("place")} placeholder="Sala de reuniones, oficina del cliente…" /><//>
        <${Field} label="Enlace de Meet" id="e-meet" hint="Pégalo aquí después de agendarla en Google Calendar."><input id="e-meet" class="mono" value=${f.meetUrl} onInput=${set("meetUrl")} placeholder="https://meet.google.com/…" /><//>
        <${Field} label=${f.kind === "comite" ? "Temas a revisar" : "Agenda"} id="e-agenda"><textarea id="e-agenda" value=${f.agenda} onInput=${set("agenda")}></textarea><//>
      <//>`;
  }

  /* ---------- proyecto ---------- */
  function ProjectSheet({ id }) {
    const s = L.useStore();
    const p = id ? q.project(id) : null;
    const [f, setF, set] = useForm(() => p ? { ...p } : { name: "", code: "", client: "", phase: "anteproyecto", status: "activo", leader: s.me.id, members: [s.me.id], areas: [], start: L.todayIso(), end: "", folder: "", notes: "" });
    const [err, setErr] = useState("");
    const can = !id || q.canLead(p);
    const save = async () => {
      if (!f.name.trim()) { setErr("Escribe el nombre del proyecto."); return; }
      const members = [...new Set([f.leader, ...(f.members || [])].filter(Boolean))];
      const rec = await act.saveProject(id, { name: f.name.trim(), code: (f.code || "").trim(), client: (f.client || "").trim(), phase: f.phase, status: f.status, leader: f.leader, members, areas: f.areas || [], start: f.start || "", end: f.end || "", folder: (f.folder || "").trim(), notes: f.notes || "" });
      if (rec) { L.toast(id ? "Cambios guardados" : "Proyecto creado"); L.closeSheet(); if (!id) L.go("#proyecto/" + rec.id); }
    };
    const remove = async () => { if (await act.deleteProject(id)) { L.toast("Proyecto eliminado"); L.closeSheet(); L.go("#proyectos"); } };
    const pickFolder = async () => { const dir = await L.desk.pickFolder(f.folder || ""); if (dir) setF((x) => ({ ...x, folder: dir })); };
    const ro = !can;
    const footer = html`${id && can && html`<${DeleteButton} onConfirm=${remove} label="Eliminar proyecto" />`}<span class="spacer"></span>
      <button type="button" class="btn ghost" onClick=${L.closeSheet}>${can ? "Cancelar" : "Cerrar"}</button>${can && html`<button type="submit" class="btn primary">${id ? "Guardar" : "Crear proyecto"}</button>`}`;
    return html`
      <${Sheet} title=${id ? "Proyecto" : "Nuevo proyecto"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
        ${ro && html`<p class="note">Solo quien lidera el proyecto o el director pueden cambiar estos datos.</p>`}
        <${Field} label="Nombre" id="p-name" error=${err}><input id="p-name" value=${f.name} onInput=${set("name")} disabled=${ro} placeholder="Torre Alameda" /><//>
        <div class="two">
          <${Field} label="Código" id="p-code"><input id="p-code" class="mono" value=${f.code} onInput=${set("code")} disabled=${ro} placeholder="TA-24" /><//>
          <${Field} label="Cliente" id="p-client"><input id="p-client" value=${f.client} onInput=${set("client")} disabled=${ro} /><//>
        </div>
        <div class="two">
          <${Field} label="Fase" id="p-phase"><select id="p-phase" value=${f.phase} onChange=${set("phase")} disabled=${ro}>${L.PHASES.map((x) => html`<option key=${x.id} value=${x.id}>${x.label}</option>`)}</select><//>
          <${Field} label="Estado" id="p-status"><select id="p-status" value=${f.status} onChange=${set("status")} disabled=${ro}><option value="activo">Activo</option><option value="pausado">En pausa</option><option value="cerrado">Cerrado</option></select><//>
        </div>
        <div class="fld"><span class="lbl">Áreas que participan</span><${Pills} options=${L.AREAS} value=${f.areas || []} attr="data-a" disabled=${ro} onChange=${(a) => setF((x) => ({ ...x, areas: toggleIn(x.areas || [], a) }))} /></div>
        <${Field} label="Lidera" id="p-leader" hint="Arma el plan de entregables y lo aprueba cuando el equipo da su visto bueno."><select id="p-leader" value=${f.leader} onChange=${set("leader")} disabled=${ro}>${q.staff().map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}</select><//>
        <div class="fld"><span class="lbl">Integrantes</span><${PeoplePicker} candidates=${q.staff().map((u) => u.id)} value=${f.members || []} onChange=${set("members")} disabled=${ro} /></div>
        <div class="two">
          <${Field} label="Inicio" id="p-start"><input id="p-start" type="date" value=${f.start} onInput=${set("start")} disabled=${ro} /><//>
          <${Field} label="Entrega final" id="p-end"><input id="p-end" type="date" value=${f.end} onInput=${set("end")} disabled=${ro} /><//>
        </div>
        <${Field} label="Carpeta del proyecto" id="p-folder"><div class="pick-row"><input id="p-folder" class="mono" value=${f.folder} onInput=${set("folder")} disabled=${ro} placeholder="\\\\NAS\\Proyectos\\TA-24_TorreAlameda\\" />${L.desk && can && html`<button type="button" class="btn" onClick=${pickFolder}>Elegir…</button>`}</div><//>
        <${Field} label="Notas" id="p-notes"><textarea id="p-notes" value=${f.notes} onInput=${set("notes")} disabled=${ro}></textarea><//>
      <//>`;
  }

  /* ---------- perfil ---------- */
  function ProfileSheet({ id }) {
    const s = L.useStore();
    const u = q.user(id) || s.me;
    const isMe = u.id === s.me.id;
    const director = q.isDirector();
    const [f, setF, set] = useForm(() => ({ name: u.name || "", cargo: u.cargo || "", areas: (u.areas || []).filter((a) => a !== "direccion"), estado: u.estado || "", role: u.role || "miembro" }));
    const [autostart, setAutostart] = useState(null);
    const [version, setVersion] = useState("");
    const [hostInfo, setHostInfo] = useState(null);
    const [leaveHost, setLeaveHost] = useState(false);
    useEffect(() => {
      if (!isMe || !L.desk) return;
      L.desk.getAutostart().then(setAutostart).catch(() => {});
      L.desk.appInfo().then((i) => setVersion(i.version)).catch(() => {});
      if (L.desk.hostStatus) L.desk.hostStatus().then(setHostInfo).catch(() => {});
    }, []);
    const hosting = !!(hostInfo && hostInfo.hosting);
    const can = isMe || director;
    const save = async () => {
      const body = { cargo: f.cargo.trim(), areas: f.role === "director" ? ["direccion", ...f.areas] : f.areas };
      if (isMe) { body.name = f.name.trim() || u.name; body.estado = f.estado.trim(); }
      if (director && !isMe && f.role !== u.role) body.role = f.role;
      if (await act.saveUser(u.id, body)) { L.toast("Guardado"); L.closeSheet(); }
    };
    const areaOptions = L.AREAS;
    const roleOptions = [{ id: "miembro", label: "Integrante" }, { id: "director", label: "Director creativo (un solo cupo)" }, ...(q.isMaestro() ? [{ id: "maestro", label: "Perfil maestro" }] : [])];
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>${can ? "Cancelar" : "Cerrar"}</button>${can && html`<button type="submit" class="btn primary">Guardar</button>`}`;
    return html`
      <${Sheet} title=${isMe ? "Tu perfil" : "Persona"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
        <div class="profile-head"><${Avatar} id=${u.id} cls="xl" dot /><div><b>${u.name}</b><span class="muted">${u.email || ""}</span><span class="tag">${q.roleLabel(u)}</span></div></div>
        ${isMe && html`<${Field} label="Nombre" id="u-name"><input id="u-name" value=${f.name} onInput=${set("name")} /><//>`}
        <${Field} label="Cargo" id="u-cargo"><input id="u-cargo" value=${f.cargo} onInput=${set("cargo")} disabled=${!can} placeholder="Arquitecta, visualizador, coordinadora…" /><//>
        <div class="fld"><span class="lbl">${u.role === "director" || f.role === "director" ? "Áreas, además de Dirección" : "Equipo"}</span><${Pills} options=${areaOptions} value=${f.areas} attr="data-a" disabled=${!can} onChange=${(a) => setF((x) => ({ ...x, areas: toggleIn(x.areas, a) }))} /></div>
        ${isMe && html`<${Field} label="Estado" id="u-estado" hint="Lo ve el equipo junto a tu nombre. Por ejemplo: en obra hasta las 3."><input id="u-estado" value=${f.estado} onInput=${set("estado")} maxlength="80" /><//>`}
        ${director && !isMe && (u.role !== "maestro" || q.isMaestro()) && html`<${Field} label="Rol" id="u-role" hint="La Dirección creativa ve todo y aprueba cualquier plan. Para pasarla a otra persona, primero quítasela a quien la tiene.">
          <select id="u-role" value=${f.role} onChange=${set("role")}>${roleOptions.map((o) => html`<option key=${o.id} value=${o.id}>${o.label}</option>`)}</select><//>`}
        ${isMe && html`
          <div class="settings">
            <div class="fld"><span class="lbl">Muñeco de la oficina</span><div class="inline">${L.MunecoPreview && html`<span class="pix-mini"><${L.MunecoPreview} cfg=${L.PIX.config(s.me)} /></span>`}<button type="button" class="btn sm" onClick=${() => L.openSheet("muneco")}>${s.me.muneco && s.me.muneco.ropa ? "Cambiar mi muñeco" : "Crear mi muñeco"}</button></div></div>
            <div class="fld"><span class="lbl">Apariencia</span><${L.Seg} label="Apariencia" value=${s.theme} onChange=${L.setTheme} options=${L.THEMES} /></div>
            ${L.desk && autostart !== null && html`<label class="check"><input type="checkbox" checked=${autostart} onChange=${(e) => { setAutostart(e.target.checked); L.desk.setAutostart(e.target.checked); }} /><span><b>Abrir al iniciar Windows</b><small>La app se abre sola al prender el PC y te deja conectado con el equipo. Al cerrar la ventana sigue en la bandeja, junto al reloj.</small></span></label>`}
            ${hosting ? html`
              <div class="host-box">
                <span class="lbl">Servidor del estudio</span>
                <p><b>Este PC es el servidor.</b> Arranca solo cada vez que se abre la app; mientras este PC esté prendido, el equipo trabaja conectado. Los demás PC lo encuentran solos.</p>
                ${(hostInfo.addresses || []).length > 0 && html`<p class="muted">Si algún PC pide la dirección: <span class="mono">${hostInfo.addresses.join(" · ")}</span></p>`}
                ${hostInfo.error && html`<p class="err">${hostInfo.error}</p>`}
                <div class="inline wrap">
                  <button type="button" class="btn sm" onClick=${() => { L.closeSheet(); L.auth.gate("maestro"); }}>Crear o recuperar perfil maestro</button>
                  <button type="button" class="btn sm" onClick=${async () => { const ok = await L.desk.hostFirewall(); L.toast(ok ? "Firewall listo: los demás PC pueden entrar." : "Windows no dio el permiso. Pide a quien administra el PC que lo acepte."); }}>Revisar el firewall</button>
                  ${leaveHost ? html`<button type="button" class="btn sm danger" onClick=${L.auth.stopHosting}>Confirmar: dejar de ser el servidor</button><button type="button" class="btn sm ghost" onClick=${() => setLeaveHost(false)}>No</button>`
                    : html`<button type="button" class="btn sm ghost danger" onClick=${() => setLeaveHost(true)}>Dejar de ser el servidor</button>`}
                </div>
                ${leaveHost && html`<p class="hint">Los datos se quedan guardados en este PC. Mientras no haya otro servidor, nadie podrá conectarse.</p>`}
              </div>` : html`
              <div class="fld"><span class="lbl">Servidor</span><p class="mono">${s.serverUrl.replace(/^https?:\/\//, "")}</p></div>`}
            <div class="inline">${!hosting && html`<button type="button" class="btn sm" onClick=${() => { L.closeSheet(); L.auth.changeServer(); }}>Cambiar de servidor</button>`}<button type="button" class="btn sm" onClick=${L.auth.logout}>Cerrar sesión</button></div>
            ${L.desk && L.desk.checkUpdates ? html`<${UpdateBox} version=${version} />` : version && html`<p class="meta-line">LAP Cerebro ${version}</p>`}
          </div>`}
      <//>`;
  }

  // Actualizaciones: versión instalada, botón para buscar y lo que está pasando (buscando, descargando, error).
  function UpdateBox({ version }) {
    const s = L.useStore();
    const u = s.updateState || { state: "idle" };
    const busy = u.state === "checking" || u.state === "downloading";
    const text = {
      idle: "",
      checking: "Buscando una versión nueva…",
      latest: "Tienes la versión más reciente.",
      downloading: `Descargando la versión ${u.version || "nueva"}… ${u.percent ? u.percent + "%" : ""}`,
      ready: `La versión ${u.version} está lista. Se instala al reiniciar la app.`,
      error: u.error || "No se pudo buscar la actualización.",
      dev: "En modo de desarrollo las actualizaciones no se buscan.",
    }[u.state] || "";
    return html`<div class="update-box">
      <span class="lbl">Actualizaciones</span>
      <p>LAP Cerebro <b class="mono">${version || "…"}</b>${u.state === "latest" && u.at ? html` <span class="muted">· revisado ${L.relTime(u.at)}</span>` : ""}</p>
      ${text && html`<p class=${L.cx(u.state === "error" ? "err" : "muted", "upd-msg")}>${text}</p>`}
      ${u.state === "downloading" && html`<span class="bar-track wide" data-s="en_curso"><i style=${{ width: (u.percent || 2) + "%" }}></i></span>`}
      <div class="inline">
        ${u.state === "ready" ? html`<button type="button" class="btn sm primary" onClick=${() => L.desk.installUpdate()}>Reiniciar y actualizar</button>`
          : html`<button type="button" class="btn sm" disabled=${busy} onClick=${() => L.desk.checkUpdates()}>${u.state === "downloading" ? "Descargando…" : u.state === "checking" ? "Buscando…" : "Buscar actualizaciones"}</button>`}
      </div>
    </div>`;
  }

  function SheetHost() {
    const s = L.useStore();
    const sh = s.sheet;
    if (!sh) return null;
    const k = sh.type + (sh.id || "new");
    if (sh.type === "task") return html`<${TaskSheet} key=${k} id=${sh.id} defaults=${sh.defaults} />`;
    if (sh.type === "event") return html`<${EventSheet} key=${k} id=${sh.id} defaults=${sh.defaults} />`;
    if (sh.type === "project") return html`<${ProjectSheet} key=${k} id=${sh.id} />`;
    if (sh.type === "profile") return html`<${ProfileSheet} key=${k} id=${sh.id} />`;
    if (sh.type === "muneco") return html`<${L.MunecoSheet} key=${k} />`;
    if (sh.type === "tool") { const { col, ...d } = sh.defaults; return html`<${L.ToolSheet} key=${k + col} col=${col} id=${sh.id} defaults=${d} />`; }
    return null;
  }

  Object.assign(L, { SheetHost, Pills, useForm });
})();
