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
  const DEFAULTS = { inicio: "08:45", fin: "18:00", viernesInicio: "07:30", viernesFin: "16:30", almuerzoIni: "13:15", almuerzoFin: "14:00", recargoExtra: null, saldoInicial: 0, saldoFecha: "", margenObjetivo: 20, incluirFijos: true };
  const cfg = () => {
    const r = st().ajustes.find((a) => a.clave === "gestion");
    const v = (r && r.valor) || {};
    return { ...DEFAULTS, ...RETCFG, ...v, nomina: { ...NOMINA, ...(v.nomina || {}) },
      retConceptos: v.retConceptos && v.retConceptos.length ? v.retConceptos : RET_CONCEPTOS, icaTipos: v.icaTipos && v.icaTipos.length ? v.icaTipos : ICA_TIPOS };
  };
  const hm = (s) => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

  // ¿Este minuto es horario de oficina para esta persona? Lunes a jueves de 8:45 a 6:00 y viernes de 7:30 a 4:30,
  // sin el almuerzo: de lunes a jueves 45 minutos (1:15 a 2:00); el viernes una hora, de 12 a 1 o de 1 a 2 según
  // el turno de cada persona. El almuerzo lo paga LAP pero no se registra.
  const jornada = (c, day) => (day === 5 ? [hm(c.viernesInicio), hm(c.viernesFin)] : [hm(c.inicio), hm(c.fin)]);
  function enHorario(d, user) {
    const c = cfg();
    const day = d.getDay(); // 0 domingo
    if (day === 0 || day === 6 || L.festivo(L.iso(d))) return false; // fin de semana o festivo: extra
    const m = d.getHours() * 60 + d.getMinutes();
    const [ini, fin] = jornada(c, day);
    if (m < ini || m >= fin) return false;
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
    if (day === 0 || day === 6 || L.festivo(L.iso(d))) return 0;
    const [ini, fin] = jornada(c, day);
    const total = (fin - ini) / 60;
    return day === 5 ? total - 1 : total - (hm(c.almuerzoFin) - hm(c.almuerzoIni)) / 60;
  }
  function horasMes(year, month) {
    let h = 0;
    for (let d = new Date(year, month, 1); d.getMonth() === month; d.setDate(d.getDate() + 1)) h += horasDia(d);
    return h;
  }

  /* ---------- nómina y costo por hora ---------- */
  // Prestaciones y aportes de ley (Colombia) que paga LAP, en % sobre el salario base. Se ajustan en Gestión → Ajustes.
  // La exoneración (art. 114-1 E.T.) quita salud, SENA e ICBF a quienes ganan menos de 10 salarios mínimos.
  const NOMINA = { smmlv: 1750905, auxilio: 249095, cesantias: 8.33, intCesantias: 1, prima: 8.33, vacaciones: 4.17,
    salud: 8.5, pension: 12, arl: 0.522, caja: 4, icbf: 3, sena: 2, exonerada: true, saludEmpleado: 4, pensionEmpleado: 4 };
  const salarioDe = (uid) => st().tarifas.find((x) => x.user === uid) || null;
  // Todo lo de una persona en un mes: lo que gana, lo que le cuesta a LAP, el costo por hora y lo que se le paga.
  function nomina(uid, year, month, over) {
    const t = over || salarioDe(uid);
    const n = cfg().nomina;
    const base = num(t && t.base), variable = num(t && t.variable);
    if (!base && !variable) return null;
    const salario = base + variable;
    const auxilio = base && base <= 2 * num(n.smmlv) ? num(n.auxilio) : 0;
    const exo = n.exonerada && base < 10 * num(n.smmlv);
    const P = (k) => (base * num(n[k])) / 100;
    const prestaciones = [
      ["Cesantías", P("cesantias")], ["Intereses de cesantías", P("intCesantias")], ["Prima", P("prima")], ["Vacaciones", P("vacaciones")],
      ["Salud", exo ? 0 : P("salud")], ["Pensión", P("pension")], ["ARL", P("arl")], ["Caja de compensación", P("caja")],
      ["ICBF", exo ? 0 : P("icbf")], ["SENA", exo ? 0 : P("sena")],
    ].map(([label, v]) => ({ label, v: Math.round(v) }));
    const totalPrest = sum(prestaciones, (x) => x.v);
    const costoMes = salario + auxilio + totalPrest;
    const horas = horasMes(year, month);
    const ley = [["Salud (empleado)", Math.round((base * num(n.saludEmpleado)) / 100)], ["Pensión (empleado)", Math.round((base * num(n.pensionEmpleado)) / 100)]].map(([label, v]) => ({ label, v }));
    const descuentos = ((t && t.descuentos) || []).filter((d) => num(d.valor)).map((d) => ({ label: d.concepto || "Descuento", v: num(d.valor) }));
    const totalDesc = sum(ley, (x) => x.v) + sum(descuentos, (x) => x.v);
    const aPagar = salario + auxilio - totalDesc;
    return { base, variable, salario, auxilio, prestaciones, totalPrest, costoMes, horas, valorHora: horas ? costoMes / horas : 0,
      ley, descuentos, totalDesc, aPagar, quincena: aPagar / 2 };
  }
  // Costo de una hora de trabajo de esa persona en el mes de la fecha (con base y variable), o el valor fijo de antes.
  function tarifa(uid, fecha) {
    const d = fecha ? new Date(fecha + "T12:00:00") : new Date();
    const n = nomina(uid, d.getFullYear(), d.getMonth());
    if (n) return n.valorHora;
    const t = salarioDe(uid);
    return t ? num(t.valorHora) : 0;
  }
  const nominaMes = (year, month) => sum(q().staff(), (u) => { const n = nomina(u.id, year, month); return n ? n.costoMes : 0; });

  /* ---------- contrato con el cliente ---------- */
  // Retención en la fuente: conceptos más comunes (persona jurídica declarante), con su tarifa y su base mínima en
  // UVT. Si el pago es menor que la base mínima, no se retiene. Todo se ajusta en Gestión → Ajustes.
  const RET_CONCEPTOS = [
    { id: "honorarios_pj", label: "Honorarios y consultoría (persona jurídica)", pct: 11, uvt: 0 },
    { id: "honorarios_pn", label: "Honorarios (persona natural)", pct: 10, uvt: 0 },
    { id: "servicios", label: "Servicios generales (declarante)", pct: 4, uvt: 2 },
    { id: "servicios_nd", label: "Servicios generales (no declarante)", pct: 6, uvt: 2 },
    { id: "construccion", label: "Contratos de construcción y urbanización", pct: 2, uvt: 10 },
    { id: "compras", label: "Compras generales (declarante)", pct: 2.5, uvt: 10 },
    { id: "compras_nd", label: "Compras generales (no declarante)", pct: 3.5, uvt: 10 },
    { id: "arriendo_inmueble", label: "Arrendamiento de inmuebles", pct: 3.5, uvt: 10 },
    { id: "arriendo_mueble", label: "Arrendamiento de muebles", pct: 4, uvt: 0 },
    { id: "transporte_carga", label: "Transporte de carga", pct: 1, uvt: 2 },
    { id: "aseo_vigilancia", label: "Aseo y vigilancia", pct: 2, uvt: 2 },
  ];
  // ReteICA (SHD, Bogotá): solo la practican los clientes inscritos en Bogotá; la tarifa (por mil) depende del tipo de cliente.
  const ICA_TIPOS = [
    { id: "pj", label: "Persona jurídica", porMil: 9.66 },
    { id: "gran", label: "Gran contribuyente", porMil: 9.66 },
    { id: "publica", label: "Entidad pública", porMil: 9.66 },
    { id: "pn", label: "Persona natural (agente retenedor)", porMil: 9.66 },
  ];
  const RETCFG = { uvt: 52374, iva: 19, reteIva: 15 };
  const conceptoRet = (id) => (cfg().retConceptos || RET_CONCEPTOS).find((c) => c.id === id) || null;
  const icaTipo = (id) => (cfg().icaTipos || ICA_TIPOS).find((c) => c.id === id) || null;
  const clienteDe = (pid) => { const p = pid && q().project(pid); return p && p.cliente ? st().contactos.find((c) => c.id === p.cliente) || null : null; };
  // Qué retenciones aplica el contrato: lo marcado en el contrato o, si no se ha marcado, lo que dice el cliente.
  function retencionesDe(f, cli) {
    const r = (f && f.retenciones) || {};
    const def = { fuente: f && f.tipoContrato === "obra" ? "construccion" : "honorarios_pj", iva: !!(cli && cli.reteIva), ica: !!(cli && cli.icaBogota), icaTipo: (cli && cli.icaTipo) || "pj" };
    return { ...def, ...r };
  }
  // Diseño: valor + IVA (cada adicional igual). Obra (AIU): costo directo + A + I + U + IVA sobre la utilidad.
  // La retención en la fuente y el ReteICA van sobre el valor antes de IVA (en obra, CD + A + I + U); el ReteIVA, sobre el IVA.
  function contratoCliente(f, cliOverride) {
    if (!f || !f.tipoContrato) return null;
    const c = cfg();
    const cli = cliOverride !== undefined ? cliOverride : clienteDe(f.proyecto);
    const sel = retencionesDe(f, cli);
    const concepto = sel.fuente ? conceptoRet(sel.fuente) : null;
    const tipoIca = sel.ica ? icaTipo(sel.icaTipo) : null;
    const r = { iva: num(c.iva), reteIva: num(c.reteIva), concepto, tipoIca, sel, uvt: num(c.uvt), cli };
    const pc = (v, p) => Math.round((num(v) * num(p)) / 100);
    const ret = (base, iva) => {
      const minimo = concepto ? num(concepto.uvt) * r.uvt : 0;
      const x = { fuente: concepto && base >= minimo ? pc(base, concepto.pct) : 0, bajoMinimo: !!(concepto && base < minimo), minimo,
        iva: sel.iva ? pc(iva, r.reteIva) : 0, ica: tipoIca ? Math.round((base * num(tipoIca.porMil)) / 1000) : 0, base };
      x.total = x.fuente + x.iva + x.ica;
      return x;
    };
    if (f.tipoContrato === "obra") {
      const cd = num(f.costoDirecto);
      const a = pc(cd, f.pctAdmin), i = pc(cd, f.pctImprevistos), u = pc(cd, f.pctUtilidad);
      const iva = pc(u, r.iva);
      const antesIva = cd + a + i + u;
      const rr = ret(antesIva, iva);
      return { tipo: "obra", r, cd, a, i, u, iva, antesIva, total: antesIva + iva, ret: rr, recibir: antesIva + iva - rr.total, adicionales: [], ingreso: antesIva };
    }
    const valor = num(f.valorDiseno);
    const iva = pc(valor, r.iva);
    const principal = { valor, iva, total: valor + iva, ret: ret(valor, iva) };
    principal.recibir = principal.total - principal.ret.total;
    const adicionales = (f.adicionalesCliente || []).filter((x) => num(x.valor)).map((x) => {
      const v = num(x.valor), iv = pc(v, r.iva), rt = ret(v, iv);
      return { ...x, valor: v, iva: iv, total: v + iv, ret: rt, recibir: v + iv - rt.total };
    });
    const all = [principal, ...adicionales];
    return { tipo: "diseno", r, principal, adicionales, valor: sum(all, (x) => x.valor), iva: sum(all, (x) => x.iva), total: sum(all, (x) => x.total),
      ret: { fuente: sum(all, (x) => x.ret.fuente), iva: sum(all, (x) => x.ret.iva), ica: sum(all, (x) => x.ret.ica), total: sum(all, (x) => x.ret.total) },
      recibir: sum(all, (x) => x.recibir), ingreso: sum(all, (x) => x.valor) };
  }

  /* ---------- tiempos ---------- */
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
    return sum(rows, (r) => tarifa(r.user, r.fecha) * (r.normal + r.extra * k));
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
    const cc = contratoCliente(f);
    const contrato = cc && cc.ingreso ? cc.ingreso : f && num(f.valorContrato) ? num(f.valorContrato) : sum(cobros, (c) => c.valor);
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

  L.G = { cfg, NOMINA, RET_CONCEPTOS, ICA_TIPOS, conceptoRet, icaTipo, clienteDe, retencionesDe, nomina, nominaMes, salarioDe, contratoCliente, enHorario, horasDia, horasMes, tarifa, recargo, tiemposDe, costoHoras, fijosMes, tasaFijos, finOf, cliente, proveedores, presupuestoDe, rentabilidad, semaforo, flujoMeses, flushTiempos: flush, DEFAULTS };
  L.gestionFindings = findings;
})();
