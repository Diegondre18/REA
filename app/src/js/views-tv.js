// Pantalla de la oficina: para una TV del estudio. La oficina en grande, la hora, las reuniones de hoy,
// las entregas de la semana y quién está. Solo para mirar: con una cuenta "Pantalla de la oficina"
// (Dirección la asigna en el perfil) se abre siempre así y no aparece como persona.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, Avatar } = L;
  const { useState, useEffect, useRef } = hooks;

  function Clock() {
    const [, force] = useState(0);
    useEffect(() => { const id = setInterval(() => force((n) => n + 1), 15000); return () => clearInterval(id); }, []);
    const d = new Date();
    return html`<div class="tv-clock"><b>${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</b><span>${L.cap(L.fmtLong(L.todayIso()))} · Semana ${L.isoWeek(L.today())}</span></div>`;
  }

  function Pantalla() {
    const s = L.useStore();
    const cv = useRef(null), ov = useRef(null), wrap = useRef(null), eng = useRef(null);
    useEffect(() => {
      eng.current = L.createOfficeEngine(cv.current, ov.current, { readOnly: true });
      const size = () => { const el = wrap.current; if (el && eng.current) eng.current.resize(el.clientWidth, el.clientHeight); };
      const ro = new ResizeObserver(size); ro.observe(wrap.current);
      setTimeout(size, 0);
      return () => { ro.disconnect(); eng.current && eng.current.destroy(); };
    }, []);
    useEffect(() => { if (eng.current) eng.current.update({ findings: {}, meet: null }); });
    const t = L.todayIso(), end = L.iso(L.addDays(L.monday(L.today()), 6));
    const mins = (h) => { const [a, b] = String(h || "").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const hoy = s.eventos.filter((e) => e.date === t && e.kind !== "entrega").sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const entregas = [
      ...s.eventos.filter((e) => e.kind === "entrega" && e.date >= t && e.date <= end).map((e) => ({ k: "e" + e.id, date: e.date, title: e.title, p: q.project(e.project) })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const vencen = s.tareas.filter((x) => x.status !== "terminado" && x.due && x.due >= t && x.due <= end).length;
    const staff = q.staff();
    const here = staff.filter((u) => q.online(u) && !q.absent(u.id));
    const away = staff.filter((u) => q.absent(u.id));
    const bdays = staff.filter((u) => u.cumple && u.cumple === t.slice(5));
    const exit = s.me.role !== "pantalla";
    return html`
      <div class="tv">
        <div class="tv-office glass" ref=${wrap}>
          <canvas ref=${cv} class="office-canvas" aria-label="Oficina del estudio"></canvas>
          <div ref=${ov} class="office-overlay" aria-hidden="true"></div>
        </div>
        <aside class="tv-side">
          <div class="tv-brand"><${L.Sym} /><b>LAP</b><span>Cerebro</span>${exit && html`<button type="button" class="btn sm ghost" onClick=${() => L.go("#oficina")}>Salir</button>`}</div>
          <${Clock} />
          ${bdays.length > 0 && html`<div class="tv-card bday"><h3>¡Cumpleaños!</h3>${bdays.map((u) => html`<div class="tv-row" key=${u.id}><${Avatar} id=${u.id} cls="lg" /><b>${u.name}</b></div>`)}</div>`}
          <div class="tv-card"><h3>Hoy</h3>${hoy.length ? hoy.map((e) => { const live = e.time && nowM >= mins(e.time) && nowM < mins(e.time) + (Number(e.duration) || 60); return html`
            <div class=${L.cx("tv-row", live && "live")} key=${e.id}><span class="mono">${e.time || "—"}</span><span><b>${e.title}</b><small>${live ? "En curso · " : ""}${L.EVENT_KIND[e.kind].label}${q.project(e.project) ? " · " + (q.project(e.project).code || q.project(e.project).name) : ""}</small></span></div>`; })
            : html`<p class="note">Sin reuniones hoy.</p>`}</div>
          <div class="tv-card"><h3>Entregas de la semana</h3>${entregas.length ? entregas.map((e) => html`<div class="tv-row" key=${e.k}><span class="mono">${L.fmtDay(e.date)}</span><span><b>${e.title}</b><small>${e.p ? e.p.code || e.p.name : ""}</small></span></div>`) : html`<p class="note">Sin entregas agendadas.</p>`}
            <p class="tv-foot">${L.plural(vencen, "tarea vence", "tareas vencen")} esta semana</p></div>
          <div class="tv-card"><h3>Quién está · ${here.length}</h3><div class="tv-people">${here.map((u) => { const pr = q.presenceInfo(u); const task = u.taskId && q.task(u.taskId); return html`
            <div class="tv-person" key=${u.id}><${Avatar} id=${u.id} dot /><span><b>${L.first(u.name)}</b><small>${pr.id !== "disponible" ? pr.label : task ? task.title : "Disponible"}</small></span></div>`; })}</div>
            ${away.length > 0 && html`<p class="tv-foot">Ausentes: ${away.map((u) => L.first(u.name)).join(", ")}</p>`}</div>
        </aside>
      </div>`;
  }

  Object.assign(L, { Pantalla });
})();
