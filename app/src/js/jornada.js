// Jornada: lo que hace falta para medir bien el tiempo.
// - En horario, quien está en la oficina tiene que marcar en qué tarea trabaja (ventana que no se cierra sola).
// - A los 40 minutos de empezar una reunión, la app se abre y pregunta a los asistentes si fueron; si sí, los
//   lleva al acta.
// - En el cierre del día, quien no marcó tareas dice en qué proyectos trabajó (medio día o todo el día), y quien
//   almorzó trabajando en el puesto lo puede anotar.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks } = L;
  const { useState, useEffect } = hooks;
  const q = () => L.q;
  const act = () => L.act;
  const st = () => L.state;
  const num = (v) => Number(v) || 0;
  const abiertaDesde = Date.now();

  const live = () => { const s = st(); return s.mode === "live" && s.me && s.me.role !== "pantalla" && s.me.role !== "maestro"; };
  // Se refresca cada 15 segundos aunque no cambie nada en el servidor (depende de la hora).
  function useTick(ms) {
    const [, force] = useState(0);
    useEffect(() => { const id = setInterval(() => force((n) => n + 1), ms); return () => clearInterval(id); }, []);
  }

  /* ================= tarea obligatoria ================= */
  function debeMarcar() {
    const s = st();
    if (!live() || s.me.taskId || !L.G) return false;
    if (Date.now() - abiertaDesde < 60e3) return false; // deja cargar y orientarse un minuto
    if (s.sheet || s.bigAlert || (s.route && s.route.name === "cierre")) return false;
    if (!["disponible", "no_molestar"].includes(q().presence(s.me))) return false; // en reunión, almuerzo, pausa o fuera, no
    if (q().absent(s.me.id)) return false;
    return L.G.enHorario(new Date(), s.me);
  }
  function TareaObligatoria() {
    const s = L.useStore();
    useTick(15e3);
    const [busy, setBusy] = useState(false);
    if (!debeMarcar() || pendiente()) return null; // primero se responde la asistencia a la reunión
    const t = L.todayIso();
    const mias = q().myTasks(s.me.id).filter((x) => x.status !== "terminado")
      .sort((a, b) => (a.status === "en_curso" ? -1 : 0) - (b.status === "en_curso" ? -1 : 0) || (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 8);
    const pick = async (id) => { setBusy(true); await act().setWorking(id); setBusy(false); L.toast("Listo: el tiempo se cuenta para esa tarea"); };
    return html`<div class="cumple-wrap jornada-wrap" role="dialog" aria-modal="true" aria-labelledby="jt-t">
      <div class="glass cumple-modal jornada-modal">
        <div class="jornada-body">
          <p class="eyebrow">Horario de oficina</p>
          <h2 id="jt-t">¿En qué tarea estás trabajando?</h2>
          <p class="muted">Márcala para que tus horas queden en el proyecto correcto. Es obligatorio en el horario de LAP.</p>
          <div class="jornada-tareas">${mias.length ? mias.map((x) => { const p = q().project(x.project); return html`<button type="button" class="jornada-tarea" key=${x.id} disabled=${busy} onClick=${() => pick(x.id)}>
              <b>${x.title}</b><small>${[p && (p.code || p.name), x.status === "en_curso" ? "en curso" : null, x.due && (x.due < t ? "atrasada · " : "entrega ") + L.relDay(x.due).toLowerCase()].filter(Boolean).join(" · ")}</small></button>`; })
            : html`<p class="note">No tienes tareas abiertas. Crea la tarea de lo que estás haciendo.</p>`}</div>
          <div class="inline wrap">
            <button type="button" class="btn primary" onClick=${() => L.openSheet("task", null, { assignees: [s.me.id] })}>＋ Crear una tarea</button>
            <span class="spacer"></span>
            <button type="button" class="btn ghost sm" onClick=${() => act().setPresence("reunion")}>Estoy en reunión</button>
            <button type="button" class="btn ghost sm" onClick=${() => act().setPresence("pausa")}>Estoy en pausa</button>
            <button type="button" class="btn ghost sm" onClick=${() => act().setPresence("fuera")}>No estoy en la oficina</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ================= ¿asististe a la reunión? ================= */
  const SKIP = "lap-cerebro-asistencia-";
  const minutos = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  // La reunión de hoy, con hora, en la que estoy invitado, que empezó hace 40 minutos o más (y hace menos de 8 horas)
  // y a la que aún no he respondido.
  function pendiente() {
    const s = st();
    if (!live()) return null;
    const t = L.todayIso(), now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    return s.eventos.filter((e) => e.date === t && e.time && e.kind !== "entrega" && (e.attendees || []).includes(s.me.id))
      .filter((e) => m >= minutos(e.time) + 40 && m < minutos(e.time) + 8 * 60)
      .filter((e) => !(s.asistencias || []).some((a) => a.evento === e.id && a.user === s.me.id))
      .filter((e) => { try { return !sessionStorage.getItem(SKIP + e.id); } catch (err) { return true; } })
      .sort((a, b) => a.time.localeCompare(b.time))[0] || null;
  }
  let avisada = "";
  setInterval(() => {
    const e = pendiente();
    if (e && avisada !== e.id) {
      avisada = e.id;
      if (L.desk && L.desk.showApp) L.desk.showApp(); // abre la app encima de lo que esté haciendo
      if (L.desk && L.desk.notify) L.desk.notify("¿Asististe a " + e.title + "?", "Responde en LAP Cerebro.", "#evento/" + e.id, true);
      L.sound && L.sound("normal");
    }
  }, 30e3);
  function Asistencia() {
    const s = L.useStore();
    useTick(30e3);
    const [busy, setBusy] = useState(false);
    const e = pendiente();
    if (!e || s.sheet) return null;
    const responder = async (asistio) => {
      setBusy(true);
      const r = await act().save("asistencias", null, { evento: e.id, user: s.me.id, asistio });
      setBusy(false);
      if (!r) { try { sessionStorage.setItem(SKIP + e.id, "1"); } catch (err) { /* nada */ } return; }
      if (asistio) { L.go("#evento/" + e.id); L.toast(e.acta ? "Revisa y completa el acta" : "Escribe el acta ahora que está fresco"); setTimeout(() => { const ta = document.querySelector("textarea.acta"); if (ta) { ta.scrollIntoView({ block: "center" }); ta.focus(); } }, 400); }
      else L.toast("Anotado: no asististe");
    };
    const p = q().project(e.project);
    return html`<div class="cumple-wrap" role="dialog" aria-modal="true" aria-labelledby="as-t">
      <div class="glass cumple-modal jornada-modal asis-modal">
        <div class="jornada-body">
          <p class="eyebrow">Reunión de las ${L.hora12 ? L.hora12(e.time) : e.time}</p>
          <h2 id="as-t">¿Asististe a «${e.title}»?</h2>
          <p class="muted">${p ? (p.code ? p.code + " · " : "") + p.name + ". " : ""}Si fuiste, te llevo al acta para que la escribas de una vez${e.acta ? " (ya tiene algo escrito: compleméntala)" : ""}.</p>
          <div class="inline"><button type="button" class="btn primary" disabled=${busy} onClick=${() => responder(true)}>Sí, asistí: hacer el acta</button><button type="button" class="btn" disabled=${busy} onClick=${() => responder(false)}>No asistí</button></div>
        </div>
      </div>
    </div>`;
  }

  /* ================= cierre del día: proyectos y almuerzo ================= */
  const NOTA = "Cierre del día";
  const NOTA_ALM = "Almuerzo trabajando en el puesto";
  let selCierre = null; // lo que la persona eligió en el cierre (se guarda al guardar el cierre)
  const tiemposHoy = (auto) => (st().tiempos || []).filter((x) => x.user === st().me.id && x.fecha === L.todayIso() && (auto ? x.auto : !x.auto));
  function CierreProyectos() {
    const s = L.useStore();
    const t = L.todayIso();
    const minAuto = tiemposHoy(true).reduce((a, x) => a + num(x.minutos) + num(x.extra), 0);
    const previos = tiemposHoy(false).filter((x) => x.nota === NOTA);
    const almPrev = tiemposHoy(false).find((x) => x.nota === NOTA_ALM);
    const necesita = minAuto < 60; // menos de una hora medida con tareas: hay que decir en qué se trabajó
    const [rows, setRows] = useState(() => previos.length ? previos.map((x) => ({ proyecto: x.proyecto || "", parte: num(x.minutos) >= (L.G ? L.G.horasDia(new Date()) * 60 : 480) - 1 ? "todo" : "medio" })) : necesita ? [{ proyecto: "", parte: "todo" }] : []);
    const [alm, setAlm] = useState(() => (almPrev ? { on: true, proyecto: almPrev.proyecto || "" } : { on: false, proyecto: "" }));
    selCierre = { rows, alm };
    const mios = q().myProjects(s.me.id);
    const proyectos = mios.length ? mios : s.proyectos.filter((p) => p.status !== "cerrado");
    const opts = html`<option value="">Elige el proyecto…</option>${proyectos.map((p) => html`<option key=${p.id} value=${p.id}>${p.code ? p.code + " · " : ""}${p.name}</option>`)}<option value="oficina">De la oficina (sin proyecto)</option>`;
    const setR = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
    const medios = rows.reduce((a, r) => a + (r.parte === "todo" ? 2 : 1), 0);
    return html`<${L.Panel} title="¿En qué proyectos trabajaste hoy?" cls="span-12">
      ${necesita ? html`<p class="note">Hoy casi no marcaste tareas (${Math.round(minAuto)} min medidos). Di en qué proyectos trabajaste para que tus horas queden registradas.</p>`
        : html`<p class="muted light">Hoy se midieron ${Math.round(minAuto / 6) / 10} h con tus tareas. Si trabajaste en algo más sin marcarlo, agrégalo aquí.</p>`}
      ${rows.map((r, i) => html`<div class="desc-row cierre-proy" key=${i}><select aria-label="Proyecto" value=${r.proyecto} onChange=${(e) => setR(i, "proyecto", e.target.value)}>${opts}</select>
        <${L.Seg} label="Cuánto" value=${r.parte} onChange=${(v) => setR(i, "parte", v)} options=${[{ id: "medio", label: "Medio día" }, { id: "todo", label: "Todo el día" }]} />
        <button type="button" class="btn ghost sm" aria-label="Quitar" onClick=${() => setRows(rows.filter((_, j) => j !== i))}>✕</button></div>`)}
      ${medios > 2 && html`<p class="note warn">Eso suma más de un día. Revisa: dos proyectos de medio día, o uno de todo el día.</p>`}
      <button type="button" class="btn ghost sm mas-apoyo" onClick=${() => setRows([...rows, { proyecto: "", parte: rows.length ? "medio" : "todo" }])}>＋ Agregar proyecto</button>
      <label class="check"><input type="checkbox" checked=${alm.on} onChange=${(e) => setAlm({ ...alm, on: e.target.checked })} /><span><b>Hoy almorcé trabajando en el puesto</b><small>El almuerzo no se registra; si trabajaste en ese rato, cuenta como hora extra del proyecto.</small></span></label>
      ${alm.on && html`<select aria-label="Proyecto del almuerzo" value=${alm.proyecto} onChange=${(e) => setAlm({ ...alm, proyecto: e.target.value })}>${opts}</select>`}
    <//>`;
  }
  // Se llama al guardar el cierre. Reemplaza lo que se haya guardado antes desde el cierre de hoy.
  async function guardarCierre() {
    if (!selCierre || !L.G) return true;
    const t = L.todayIso(), me = st().me.id, hoy = new Date();
    const dia = L.G.horasDia(hoy) * 60 || 480;
    const almMin = hoy.getDay() === 5 ? 60 : 45;
    for (const x of tiemposHoy(false).filter((y) => y.nota === NOTA || y.nota === NOTA_ALM)) await act().remove("tiempos", x.id);
    for (const r of selCierre.rows.filter((y) => y.proyecto)) {
      await act().save("tiempos", null, { user: me, fecha: t, proyecto: r.proyecto === "oficina" ? "" : r.proyecto, minutos: Math.round(r.parte === "todo" ? dia : dia / 2), extra: 0, auto: false, nota: NOTA });
    }
    if (selCierre.alm.on) await act().save("tiempos", null, { user: me, fecha: t, proyecto: selCierre.alm.proyecto === "oficina" ? "" : selCierre.alm.proyecto, minutos: 0, extra: almMin, auto: false, nota: NOTA_ALM });
    return true;
  }

  Object.assign(L, { TareaObligatoria, Asistencia, CierreProyectos, guardarCierreJornada: guardarCierre });
})();
