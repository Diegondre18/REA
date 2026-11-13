// Gestión: cálculos de dinero, horas y semáforo de cada proyecto, medición automática del tiempo trabajado
// y reglas del agente de Gestión. Las vistas están en gestion-views.js.
(() => {
  "use strict";
  const L = LAP;
  const q = () => L.q;
  const st = () => L.state;
  const num = (v) => Number(v) || 0;
  const sum = (arr, f) => arr.reduce((a, x) => a + num(f ? f(x) : x), 0);

  /* ---------- ajustes de gestión (horario, recargo, caja) ---------- */
  const DEFAULTS = { inicio: "08:45", fin: "18:00", almuerzoIni: "13:15", almuerzoFin: "14:00", recargoExtra: null, saldoInicial: 0, saldoFecha: "", margenObjetivo: 20, incluirFijos: true };
  const cfg = () => {
    const r = st().ajustes.find((a) => a.clave === "gestion");
    return { ...DEFAULTS, ...((r && r.valor) || {}) };
  };
  const hm = (s) => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

  // ¿Este minuto es horario de oficina para esta persona? Lunes a viernes de 8:45 a 6:00, sin el almuerzo:
  // de lunes a jueves de 1:15 a 2:00; el viernes una hora, de 12 a 1 o de 1 a 2 según el turno de cada persona.
  function enHorario(d, user) {
    const c = cfg();
    const day = d.getDay(); // 0 domingo
    if (day === 0 || day === 6) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    if (m < hm(c.inicio) || m >= hm(c.fin)) return false;
    if (day === 5) {
      const ini = (user && user.almuerzoViernes === "13") ? 13 * 60 : 12 * 60;
      if (m >= ini && m < ini + 60) return false;
    } else if (m >= hm(c.almuerzoIni) && m < hm(c.almuerzoFin)) return false;
    return true;
  }
  // Horas de oficina de un día (para calcular el costo de los gastos fijos por hora).
  function horasDia(d) {
    const c = cfg();
    const day = d.getDay();
    if (day === 0 || day === 6) return 0;
    const total = (hm(c.fin) - hm(c.inicio)) / 60;
    return day === 5 ? total - 1 : total - (hm(c.almuerzoFin) - hm(c.almuerzoIni)) / 60;
  }
  function horasMes(year, month) {
    let h = 0;
    for (let d = new Date(year, month, 1); d.getMonth() === month; d.setDate(d.getDate() + 1)) h += horasDia(d);
    return h;
  }

  /* ---------- tarifas y tiempos ---------- */
  const tarifa = (uid) => { const t = st().tarifas.find((x) => x.user === uid); return t ? num(t.valorHora) : 0; };
  const recargo = () => { const r = cfg().recargoExtra; return r === null || r === undefined || r === "" ? 0 : num(r); };
  // Tiempos de un proyecto (automáticos y a mano), más las horas registradas antes en «horas».
  function tiemposDe({ proyecto, user, desde, hasta } = {}) {
    const inRange = (f) => (!desde || f >= desde) && (!hasta || f <= hasta);
    const t = st().tiempos.filter((x) => (!proyecto || x.proyecto === proyecto) && (!user || x.user === user) && inRange(x.fecha))
      .map((x) => ({ user: x.user, proyecto: x.proyecto, fecha: x.fecha, normal: num(x.minutos) / 60, extra: num(x.extra) / 60, id: x.id, auto: x.auto, tarea: x.tarea, nota: x.nota }));
    const h = st().horas.filter((x) => (!proyecto || x.project === proyecto) && (!user || x.user === user) && inRange(x.fecha))
      .map((x) => ({ user: x.user, proyecto: x.project, fecha: x.fecha, normal: num(x.horas), extra: 0, id: "h" + x.id, manual: true }));
    return [...t, ...h];
  }
  function costoHoras(rows) {
    const k = 1 + recargo() / 100;
    return sum(rows, (r) => tarifa(r.user) * (r.normal + r.extra * k));
  }
  // Costo de los gastos fijos de la oficina por cada hora trabajada (todo el equipo).
  function fijosMes() {
    const per = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
    return sum(st().gastosFijos.filter((g) => g.activo !== false), (g) => num(g.valor) / (per[g.periodicidad] || 1));
  }
  function tasaFijos() {
    const d = new Date();
    const gente = Math.max(1, q().staff().filter((u) => u.role !== "pantalla").length);
    const horas = horasMes(d.getFullYear(), d.getMonth()) * gente;
    return horas ? fijosMes() / horas : 0;
  }

  /* ---------- dinero de cada proyecto ---------- */
  const finOf = (pid) => st().pfin.find((x) => x.proyecto === pid) || null;
  function cliente(pid) {
    const cobros = st().cobros.filter((c) => c.project === pid);
    const f = finOf(pid);
    const facturado = sum(cobros.filter((c) => c.estado === "facturado" || c.estado === "pagado"), (c) => c.valor);
    const pagado = sum(cobros.filter((c) => c.estado === "pagado"), (c) => c.valor);
    const contrato = f && num(f.valorContrato) ? num(f.valorContrato) : sum(cobros, (c) => c.valor);
    const vencido = sum(cobros.filter((c) => c.estado !== "pagado" && c.fechaEsperada && c.fechaEsperada < L.todayIso()), (c) => c.valor);
    return { contrato, facturado, pagado, debe: facturado - pagado, porFacturar: Math.max(0, contrato - facturado), vencido, cobros };
  }
  function proveedores(pid) {
    const list = st().contratos.filter((c) => !pid || c.proyecto === pid).map((c) => {
      const ad = st().adicionales.filter((a) => a.contrato === c.id);
      const pagos = st().pagosProv.filter((p) => p.contrato === c.id);
      const adicionales = sum(ad.filter((a) => a.aprobado), (a) => a.valor);
      const adicionalesPend = sum(ad.filter((a) => !a.aprobado), (a) => a.valor);
      const pagadoBase = sum(pagos.filter((p) => !p.adicional), (p) => p.valor);
      const pagadoAd = sum(pagos.filter((p) => p.adicional), (p) => p.valor);
      const total = num(c.valor) + adicionales;
      return { c, ad, pagos, valor: num(c.valor), adicionales, adicionalesPend, pagadoBase, pagadoAd, pagado: pagadoBase + pagadoAd, total,
        debeBase: num(c.valor) - pagadoBase, debeAd: adicionales - pagadoAd, debe: total - pagadoBase - pagadoAd };
    });
    return { list, valor: sum(list, (x) => x.valor), adicionales: sum(list, (x) => x.adicionales), total: sum(list, (x) => x.total), pagado: sum(list, (x) => x.pagado), debe: sum(list, (x) => x.debe) };
  }
  function presupuestoDe(pid) {
    const items = st().presupuesto.filter((x) => x.proyecto === pid);
    const costos = st().costos.filter((x) => x.proyecto === pid);
    const caps = new Map();
    const cap = (k) => { const key = k || "Sin capítulo"; if (!caps.has(key)) caps.set(key, { capitulo: key, presupuesto: 0, real: 0, items: 0 }); return caps.get(key); };
    for (const it of items) { const c = cap(it.capitulo); c.presupuesto += num(it.total) || num(it.cantidad) * num(it.valorUnitario); c.items += 1; }
    for (const x of costos) cap(x.capitulo).real += num(x.valor);
    const capitulos = [...caps.values()];
    return { items, costos, capitulos, presupuesto: sum(capitulos, (c) => c.presupuesto), real: sum(capitulos, (c) => c.real) };
  }
  // Rentabilidad: lo que paga el cliente menos la obra (proveedores o, si no hay contratos, los costos reales),
  // el costo de las horas del equipo (las extra con su recargo) y la parte de los gastos fijos de la oficina.
  function rentabilidad(pid) {
    const cl = cliente(pid);
    const pr = proveedores(pid);
    const pre = presupuestoDe(pid);
    const rows = tiemposDe({ proyecto: pid });
    const hNormal = sum(rows, (r) => r.normal), hExtra = sum(rows, (r) => r.extra);
    const equipo = costoHoras(rows);
    const fijos = cfg().incluirFijos ? (hNormal + hExtra) * tasaFijos() : 0;
    const obra = pr.list.length ? pr.total : pre.real;
    const costo = obra + equipo + fijos;
    const utilidad = cl.contrato - costo;
    const f = finOf(pid);
    return { ingresos: cl.contrato, obra, equipo, fijos, costo, utilidad, margen: cl.contrato ? (utilidad / cl.contrato) * 100 : null,
      hNormal, hExtra, horasPresupuesto: f ? num(f.horasPresupuesto) : 0, margenObjetivo: f && f.margenObjetivo != null && f.margenObjetivo !== 0 ? num(f.margenObjetivo) : num(cfg().margenObjetivo) };
  }

  /* ---------- semáforo de cada proyecto ---------- */
  const WORST = { rojo: 2, amarillo: 1, verde: 0, gris: -1 };
  function semaforo(pid) {
    const t = L.todayIso();
    const tasks = q().projectTasks(pid);
    const open = tasks.filter((x) => x.status !== "terminado");
    const late = open.filter((x) => x.due && x.due < t);
    const lateEntrega = st().eventos.filter((e) => e.project === pid && e.kind === "entrega" && e.date < t).some((e) => open.some((x) => x.due && x.due <= e.date));
    const dims = [];
    dims.push({ k: "entregas", label: "Entregas", level: lateEntrega || late.length > 2 ? "rojo" : late.length ? "amarillo" : tasks.length ? "verde" : "gris",
      txt: late.length ? `${L.plural(late.length, "tarea atrasada", "tareas atrasadas")}` : tasks.length ? "Al día" : "Sin tareas" });
    const cl = cliente(pid);
    dims.push({ k: "cobros", label: "Cobros", level: cl.vencido > 0 ? "rojo" : cl.debe > 0 ? "amarillo" : cl.contrato ? "verde" : "gris",
      txt: cl.vencido > 0 ? L.money(cl.vencido) + " vencido" : cl.debe > 0 ? L.money(cl.debe) + " por pagar del cliente" : cl.contrato ? "Al día" : "Sin contrato" });
    const pre = presupuestoDe(pid);
    const ej = pre.presupuesto ? pre.real / pre.presupuesto : 0;
    dims.push({ k: "costos", label: "Costos", level: !pre.presupuesto ? "gris" : ej > 1 ? "rojo" : ej > 0.9 ? "amarillo" : "verde",
      txt: pre.presupuesto ? `${Math.round(ej * 100)}% del presupuesto gastado` : "Sin presupuesto" });
    const r = rentabilidad(pid);
    const hTot = r.hNormal + r.hExtra;
    const avance = tasks.length ? tasks.filter((x) => x.status === "terminado").length / tasks.length : 0;
    const usoH = r.horasPresupuesto ? hTot / r.horasPresupuesto : 0;
    dims.push({ k: "horas", label: "Horas", level: !r.horasPresupuesto ? "gris" : usoH > 1 ? "rojo" : usoH > Math.max(0.85, avance + 0.15) ? "amarillo" : "verde",
      txt: r.horasPresupuesto ? `${Math.round(hTot)} de ${Math.round(r.horasPresupuesto)} h${r.hExtra ? " · " + Math.round(r.hExtra) + " h extra" : ""}` : hTot ? `${Math.round(hTot)} h sin presupuesto de horas` : "Sin horas" });
    dims.push({ k: "margen", label: "Margen", level: r.margen === null ? "gris" : r.margen < 0 ? "rojo" : r.margen < r.margenObjetivo ? "amarillo" : "verde",
      txt: r.margen === null ? "Sin contrato" : `${Math.round(r.margen)}% (meta ${Math.round(r.margenObjetivo)}%)` });
    const total = dims.reduce((w, d) => (WORST[d.level] > WORST[w] ? d.level : w), "gris");
    return { total: total === "gris" ? "verde" : total, dims, r, cl, pre, avance };
  }

  /* ---------- flujo de caja por mes ---------- */
  function flujoMeses(nAtras = 2, nAdelante = 6) {
    const c = cfg();
    const now = new Date();
    const months = [];
    for (let i = -nAtras; i <= nAdelante; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: L.MES[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? " " + String(d.getFullYear()).slice(2) : ""), ing: 0, egr: 0, ingP: 0, egrP: 0 });
    }
    const M = Object.fromEntries(months.map((m) => [m.key, m]));
    const put = (fecha, tipo, valor, proyectado) => { const m = M[String(fecha || "").slice(0, 7)]; if (!m) return; m[(tipo === "ingreso" ? "ing" : "egr") + (proyectado ? "P" : "")] += num(valor); };
    for (const f of st().flujo) put(f.fecha, f.tipo, f.valor, f.estado === "proyectado");
    for (const cb of st().cobros) {
      if (cb.estado === "pagado") put(cb.fechaPago || cb.fechaEsperada, "ingreso", cb.valor, false);
      else if (cb.fechaEsperada) put(cb.fechaEsperada < L.todayIso() ? L.todayIso() : cb.fechaEsperada, "ingreso", cb.valor, true);
    }
    for (const p of st().pagosProv) put(p.fecha, "egreso", p.valor, false);
    // Gastos fijos: en cada mes futuro (y el actual) según su periodicidad.
    const per = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
    const curKey = months.find((m) => m.key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    months.forEach((m, i) => {
      if (m.key < (curKey ? curKey.key : "")) return;
      const idx = i - nAtras;
      for (const g of st().gastosFijos.filter((x) => x.activo !== false)) if (idx % (per[g.periodicidad] || 1) === 0) m.egrP += num(g.valor);
    });
    let saldo = num(c.saldoInicial);
    const desde = c.saldoFecha ? c.saldoFecha.slice(0, 7) : months[0].key;
    for (const m of months) {
      if (m.key >= desde) saldo += m.ing + m.ingP - m.egr - m.egrP;
      m.saldo = saldo;
    }
    return months;
  }

  /* ---------- reglas del agente de Gestión ---------- */
  function findings() {
    const out = [];
    const t = L.todayIso();
    const add = (level, key, title, detail, project, go) => out.push({ level, key, title, detail, project, go });
    const pname = (pid) => { const p = q().project(pid); return p ? (p.code ? p.code + " · " : "") + p.name : ""; };
    for (const p of st().proyectos.filter((x) => x.status !== "cerrado")) {
      const s = semaforo(p.id);
      const go = "#proyecto/" + p.id + "/finanzas";
      if (s.pre.presupuesto && s.pre.real > s.pre.presupuesto) add("alta", "sobre" + p.id, `Sobrecosto en ${pname(p.id)}`, `Gastado ${L.money(s.pre.real)} de ${L.money(s.pre.presupuesto)} presupuestados (${Math.round((s.pre.real / s.pre.presupuesto) * 100)}%).`, p.id, go);
      for (const c of s.pre.capitulos) if (c.presupuesto && c.real > c.presupuesto * 1.05) add("media", "cap" + p.id + c.capitulo, `Capítulo «${c.capitulo}» por encima del presupuesto`, `${pname(p.id)} · ${L.money(c.real)} de ${L.money(c.presupuesto)}.`, p.id, go);
      const h = s.r.hNormal + s.r.hExtra;
      if (s.r.horasPresupuesto && h > s.r.horasPresupuesto) add("alta", "horas" + p.id, `${pname(p.id)} pasó las horas presupuestadas`, `${Math.round(h)} h de ${Math.round(s.r.horasPresupuesto)} h.`, p.id, go);
      if (s.r.hExtra >= 4 && s.r.hExtra / Math.max(1, h) > 0.15) add("media", "extra" + p.id, `Muchas horas extra en ${pname(p.id)}`, `${Math.round(s.r.hExtra)} h fuera del horario (${Math.round((s.r.hExtra / h) * 100)}% del total): consumen más presupuesto.`, p.id, go);
      if (s.r.margen !== null && s.r.margen < 0) add("alta", "margen" + p.id, `${pname(p.id)} va con pérdida`, `Utilidad estimada ${L.money(s.r.utilidad)} (${Math.round(s.r.margen)}%).`, p.id, go);
      else if (s.r.margen !== null && s.r.margen < s.r.margenObjetivo) add("media", "margen" + p.id, `${pname(p.id)} rinde menos de la meta`, `Margen estimado ${Math.round(s.r.margen)}%; la meta es ${Math.round(s.r.margenObjetivo)}%.`, p.id, go);
    }
    for (const x of proveedores().list) {
      if (x.pagado > x.total + 1) add("alta", "sobrepago" + x.c.id, `Se le ha pagado de más a ${x.c.proveedorNombre}`, `${pname(x.c.proyecto)} · pagado ${L.money(x.pagado)} de ${L.money(x.total)} (contrato y adicionales aprobados).`, x.c.proyecto, "#proyecto/" + x.c.proyecto + "/finanzas");
      if (x.adicionalesPend > 0) add("media", "adpend" + x.c.id, `Adicionales sin aprobar de ${x.c.proveedorNombre}`, `${pname(x.c.proyecto)} · ${L.money(x.adicionalesPend)} por aprobar.`, x.c.proyecto, "#proyecto/" + x.c.proyecto + "/finanzas");
    }
    const meses = flujoMeses(0, 3);
    const rojo = meses.find((m) => m.saldo < 0);
    if (rojo && (cfg().saldoInicial || st().flujo.length)) add("alta", "caja" + rojo.key, `La caja queda en rojo en ${rojo.label}`, `Saldo proyectado ${L.money(rojo.saldo)}. Revisa cobros pendientes y pagos programados.`, "", "#gestion/flujo");
    if (!st().gastosFijos.length) add("info", "fijos", "Faltan los gastos fijos de la oficina", "Sin ellos la rentabilidad no incluye arriendo, nómina ni servicios.", "", "#gestion/gastos");
    if (cfg().recargoExtra === null || cfg().recargoExtra === undefined || cfg().recargoExtra === "") add("info", "recargo", "Falta el recargo de las horas extra", "Ponlo en Gestión → Ajustes para que las horas fuera del horario cuesten lo que realmente cuestan.", "", "#gestion/ajustes");
    const sinTarifa = q().staff().filter((u) => u.role !== "pantalla" && u.role !== "maestro" && !tarifa(u.id) && st().tiempos.some((x) => x.user === u.id));
    if (sinTarifa.length) add("media", "tarifas", `${L.plural(sinTarifa.length, "persona", "personas")} sin costo por hora`, sinTarifa.map((u) => L.first(u.name)).join(", ") + ": sus horas no se cuentan en la rentabilidad.", "", "#gestion/horas");
    return out;
  }

  /* ---------- medición automática del tiempo ---------- */
  // Mientras la persona tiene una tarea marcada con «Estoy trabajando en esto» y la app abierta, cada minuto
  // cuenta para el proyecto de esa tarea: dentro del horario como normal; fuera, en el almuerzo o en fin de
  // semana como extra. No cuenta si la persona lleva más de 10 minutos sin tocar el computador, ni si está
  // en almuerzo, en pausa o fuera.
  const pending = new Map(); // fecha|tarea|proyecto → { normal, extra }
  let lastFlush = Date.now(), flushing = false;
  async function tick() {
    const s = st();
    if (s.mode !== "live" || !s.me || !s.me.taskId) return;
    if (["almuerzo", "fuera", "pausa"].includes(q().presence(s.me))) return;
    if (L.desk && L.desk.idleSeconds) { try { if ((await L.desk.idleSeconds()) > 600) return; } catch (e) { /* sin dato */ } }
    else if (document.hidden) return;
    const task = q().task(s.me.taskId);
    if (!task) return;
    const now = new Date();
    const key = [L.iso(now), task.id, task.project || ""].join("|");
    const cur = pending.get(key) || { normal: 0, extra: 0 };
    cur[enHorario(now, s.me) ? "normal" : "extra"] += 1;
    pending.set(key, cur);
    if (Date.now() - lastFlush > 5 * 60e3) flush();
  }
  async function flush() {
    if (flushing || !pending.size || !st().me) return;
    flushing = true;
    lastFlush = Date.now();
    const items = [...pending.entries()];
    pending.clear();
    try {
      for (const [key, v] of items) {
        const [fecha, tarea, proyecto] = key.split("|");
        const me = st().me.id;
        const rec = st().tiempos.find((x) => x.user === me && x.auto && x.fecha === fecha && x.tarea === tarea);
        const ok = rec
          ? await L.act.save("tiempos", rec.id, { minutos: num(rec.minutos) + v.normal, extra: num(rec.extra) + v.extra })
          : await L.act.save("tiempos", null, { user: me, fecha, tarea, proyecto, minutos: v.normal, extra: v.extra, auto: true });
        if (!ok) { const back = pending.get(key) || { normal: 0, extra: 0 }; pending.set(key, { normal: back.normal + v.normal, extra: back.extra + v.extra }); }
      }
    } finally { flushing = false; }
  }
  setInterval(() => { tick().catch(() => {}); }, 60e3);
  // Al cambiar de tarea, al cerrar la app o al quedar sin conexión, se guarda lo pendiente.
  let lastTask = "";
  setInterval(() => { const t = st().me && st().me.taskId || ""; if (t !== lastTask) { lastTask = t; flush(); } }, 5e3);
  window.addEventListener("beforeunload", () => { flush(); });

  L.G = { cfg, enHorario, horasDia, horasMes, tarifa, recargo, tiemposDe, costoHoras, fijosMes, tasaFijos, finOf, cliente, proveedores, presupuestoDe, rentabilidad, semaforo, flujoMeses, flushTiempos: flush, DEFAULTS };
  L.gestionFindings = findings;
})();
