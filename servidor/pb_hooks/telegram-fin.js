// Bot de Telegram, etapa 3 (Administración, Gestión y Dirección): gastos con foto de la factura,
// pagos a proveedores, cobros recibidos del cliente y consultas rápidas de dinero.
// Las cuentas son las mismas de la pantalla de Gestión.
const lib = require(`${__hooks}/lib.js`);
const { esc, corto, enviar, editar, descargar, fotoDe } = require(`${__hooks}/telegram-api.js`);
const obra = require(`${__hooks}/telegram-obra.js`);

const TIPOS = [["material", "Material"], ["mano_obra", "Mano de obra"], ["equipo", "Equipo"], ["transporte", "Transporte"], ["otro", "Otro"]];
const CATS_OFICINA = ["Servicios", "Papelería", "Transporte", "Software", "Mantenimiento", "Otro"];
const LISTO = { reply_markup: { inline_keyboard: [[{ text: "✅ Listo", callback_data: "fl" }]] } };

function puedeFin(u) {
  const a = lib.arr(u.getStringSlice("areas"));
  return lib.esDirector(u) || a.indexOf("administracion") >= 0 || a.indexOf("gestion") >= 0;
}
const num = (v) => Number(v) || 0;
const sum = (xs, f) => xs.reduce((a, x) => a + num(f(x)), 0);
const plata = (n) => (n < 0 ? "-" : "") + "$ " + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const nombreP = (p) => (p.getString("code") ? p.getString("code") + " · " : "") + p.getString("name");
const recs = (app, col, filtro, params, sort) => lib.arr(app.findRecordsByFilter(col, filtro, sort || "", 1000, 0, params || {}));

// "350.000", "$ 1.234.567,50", "350k", "1,5 millones", "2M".
function valorDe(txt) {
  let s = String(txt || "").trim().toLowerCase().replace(/\s+/g, " ");
  let mult = 1;
  const m = /^(.*?)\s*(k|mil|m|mm|millon|millones|millón)$/.exec(s);
  if (m && /\d/.test(m[1])) { s = m[1]; mult = m[2] === "k" || m[2] === "mil" ? 1e3 : 1e6; }
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return NaN;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (ld > -1 && /\.\d{3}(\.|$)/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s) * mult;
  return isFinite(n) ? Math.round(n) : NaN;
}
// "valor - qué - proveedor - factura" (proveedor y factura opcionales).
function partes(txt) {
  const p = String(txt || "").split(/\s+[-–]\s+|\n/).map((x) => x.trim()).filter(Boolean);
  let i = p.findIndex((x) => !isNaN(valorDe(x)) && /\d/.test(x));
  if (i < 0) return null;
  const valor = valorDe(p[i]);
  const resto = p.filter((_, j) => j !== i);
  return { valor, desc: resto[0] || "", prov: resto[1] || "", fac: resto[2] || "" };
}

/* ---------- cuentas (las mismas de Gestión) ---------- */
function cliente(app, pid) {
  const cobros = recs(app, "cobros", "project = {:p}", { p: pid });
  let f = null;
  try { f = app.findFirstRecordByFilter("proyecto_finanzas", "proyecto = {:p}", { p: pid }); } catch (e) { /* sin datos */ }
  const facturado = sum(cobros.filter((c) => c.getString("estado") !== "pendiente"), (c) => c.getFloat("valor"));
  const pagado = sum(cobros.filter((c) => c.getString("estado") === "pagado"), (c) => c.getFloat("valor"));
  const contrato = f && f.getFloat("valorContrato") ? f.getFloat("valorContrato") : sum(cobros, (c) => c.getFloat("valor"));
  const hoy = lib.hoy(0);
  const vencido = sum(cobros.filter((c) => c.getString("estado") !== "pagado" && c.getString("fechaEsperada") && c.getString("fechaEsperada") < hoy), (c) => c.getFloat("valor"));
  return { contrato, facturado, pagado, debe: facturado - pagado, porFacturar: Math.max(0, contrato - facturado), vencido, cobros };
}
function contrato(app, c) {
  const ad = recs(app, "adicionales", "contrato = {:c}", { c: c.id });
  const pagos = recs(app, "pagos_proveedor", "contrato = {:c}", { c: c.id });
  const adicionales = sum(ad.filter((a) => a.getBool("aprobado")), (a) => a.getFloat("valor"));
  const pagadoBase = sum(pagos.filter((p) => !p.getBool("adicional")), (p) => p.getFloat("valor"));
  const pagadoAd = sum(pagos.filter((p) => p.getBool("adicional")), (p) => p.getFloat("valor"));
  const valor = c.getFloat("valor");
  return { valor, adicionales, pagadoBase, pagadoAd, debeBase: valor - pagadoBase, debeAd: adicionales - pagadoAd, debe: valor + adicionales - pagadoBase - pagadoAd };
}

/* ---------- elegir proyecto ---------- */
const TITULOS = {
  g: "💸 <b>Gasto</b>\n¿De qué proyecto?", p: "💵 <b>Pago a proveedor</b>\n¿De qué proyecto?",
  c: "🧾 <b>Cobro recibido</b>\n¿De qué proyecto?", q: "📊 <b>Consultar</b>\n¿Qué quieres ver?",
};
function elegir(app, token, chatId, u, k) {
  if (!puedeFin(u)) return enviar(token, chatId, "Esto es para Administración, Gestión y Dirección.");
  let ps = recs(app, "proyectos", "status != 'cerrado'", {}, "name");
  if (k === "p") ps = ps.filter((p) => recs(app, "contratos", "proyecto = {:p}", { p: p.id }).length);
  if (k === "c") ps = ps.filter((p) => recs(app, "cobros", "project = {:p} && estado != 'pagado'", { p: p.id }).length);
  const botones = ps.slice(0, 30).map((p) => [{ text: corto(nombreP(p), 50), callback_data: "fp:" + k + ":" + p.id }]);
  if (k === "g") botones.unshift([{ text: "🏢 De la oficina (sin proyecto)", callback_data: "fp:g:oficina" }]);
  if (k === "q") botones.unshift([{ text: "📈 Resumen general", callback_data: "fp:q:todo" }]);
  if (!botones.length) return enviar(token, chatId, k === "p" ? "No hay contratos con proveedores registrados. Se crean en Cerebro → Finanzas del proyecto." : "No hay cobros pendientes en ningún proyecto. 🎉");
  enviar(token, chatId, TITULOS[k], { reply_markup: { inline_keyboard: botones } });
}

/* ---------- gasto ---------- */
function pedirTipo(token, chatId, f) {
  const g = f.pend;
  const txt = "💸 <b>" + plata(g.valor) + "</b> · " + esc(g.desc) + (g.prov ? " · " + esc(g.prov) : "") + (g.foto ? " · 📎 factura" : "") + "\n¿Qué tipo de gasto es?";
  const opciones = f.proyecto === "oficina" ? CATS_OFICINA.map((c) => [c, c]) : TIPOS;
  const botones = [];
  for (let i = 0; i < opciones.length; i += 3) botones.push(opciones.slice(i, i + 3).map((o) => ({ text: o[1], callback_data: "gt:" + o[0] })));
  botones.push([{ text: "✖ Descartar", callback_data: "gx" }]);
  enviar(token, chatId, txt, { reply_markup: { inline_keyboard: botones } });
}
function guardarGasto(app, token, u, f, tipo) {
  const g = f.pend;
  const soporte = g.foto ? descargar(token, g.foto, "factura") : null;
  if (f.proyecto === "oficina") {
    const r = new Record(app.findCollectionByNameOrId("flujo"));
    r.set("fecha", lib.hoy(0)); r.set("tipo", "egreso"); r.set("estado", "real");
    r.set("concepto", corto(g.desc + (g.prov ? " · " + g.prov : "") + (g.fac ? " · fact. " + g.fac : ""), 300));
    r.set("categoria", corto(tipo, 80)); r.set("valor", g.valor);
    if (soporte) r.set("soporte", soporte);
    app.save(r);
    return "en la caja de la oficina (" + tipo + ")";
  }
  const r = new Record(app.findCollectionByNameOrId("costos"));
  r.set("proyecto", f.proyecto); r.set("fecha", lib.hoy(0)); r.set("descripcion", corto(g.desc, 1000));
  r.set("proveedor", corto(g.prov, 200)); r.set("factura", corto(g.fac, 80)); r.set("tipo", tipo); r.set("valor", g.valor);
  if (soporte) r.set("soporte", soporte);
  app.save(r);
  lib.registrar(app, u.id, "edit", "Gasto " + plata(g.valor) + ": " + g.desc, r.id, f.proyecto);
  return "en los costos del proyecto";
}

/* ---------- consultas ---------- */
function consultaProyecto(app, pid) {
  let p;
  try { p = app.findRecordById("proyectos", pid); } catch (e) { return "No encontré ese proyecto."; }
  const cl = cliente(app, pid);
  const lineas = ["📊 <b>" + esc(nombreP(p)) + "</b>", "", "<b>Cliente</b>",
    "Contrato: " + plata(cl.contrato), "Facturado: " + plata(cl.facturado) + " · Pagado: " + plata(cl.pagado),
    "Nos debe: <b>" + plata(cl.debe) + "</b>" + (cl.vencido ? " (⚠ " + plata(cl.vencido) + " vencido)" : ""), "Falta por facturar: " + plata(cl.porFacturar)];
  const cs = recs(app, "contratos", "proyecto = {:p}", { p: pid });
  if (cs.length) {
    lineas.push("", "<b>Proveedores</b>");
    let total = 0;
    for (const c of cs) {
      const x = contrato(app, c); total += x.debe;
      const d = (n) => (n < 0 ? "⚠ pagado de más " + plata(-n) : "debemos " + plata(n));
      lineas.push("• " + esc(c.getString("proveedorNombre")) + ": " + d(x.debeBase) + (x.adicionales ? "; adicionales: " + d(x.debeAd) : "") + " (pagado " + plata(x.pagadoBase + x.pagadoAd) + " de " + plata(x.valor + x.adicionales) + ")");
    }
    lineas.push(total < 0 ? "⚠ En total se ha pagado <b>" + plata(-total) + " de más</b>" : "Total que debemos: <b>" + plata(total) + "</b>");
  }
  const pres = sum(recs(app, "presupuesto", "proyecto = {:p}", { p: pid }), (r) => r.getFloat("total") || r.getFloat("cantidad") * r.getFloat("valorUnitario"));
  const gastado = sum(recs(app, "costos", "proyecto = {:p}", { p: pid }), (r) => r.getFloat("valor"));
  if (pres || gastado) lineas.push("", "<b>Presupuesto</b>", "Gastado " + plata(gastado) + (pres ? " de " + plata(pres) + " (" + Math.round((gastado / pres) * 100) + "%)" + (gastado > pres ? " ⚠ sobrecosto" : "") : ""));
  return lineas.join("\n");
}
function consultaGeneral(app) {
  const ps = recs(app, "proyectos", "status != 'cerrado'", {});
  let debe = 0, vencido = 0, porFacturar = 0, debemos = 0;
  for (const p of ps) { const c = cliente(app, p.id); debe += c.debe; vencido += c.vencido; porFacturar += c.porFacturar; }
  for (const c of recs(app, "contratos", "id != ''", {})) debemos += contrato(app, c).debe;
  const per = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
  const fijos = sum(recs(app, "gastos_fijos", "activo = true", {}), (g) => g.getFloat("valor") / (per[g.getString("periodicidad")] || 1));
  const mes = lib.hoy(0).slice(0, 7);
  const gastosMes = sum(recs(app, "costos", "fecha >= {:a}", { a: mes + "-01" }), (r) => r.getFloat("valor")) + sum(recs(app, "flujo", "tipo = 'egreso' && estado = 'real' && fecha >= {:a}", { a: mes + "-01" }), (r) => r.getFloat("valor"));
  return ["📈 <b>Resumen general</b> (proyectos activos)", "",
    "Nos deben: <b>" + plata(debe) + "</b>" + (vencido ? " (⚠ " + plata(vencido) + " vencido)" : ""),
    "Falta por facturar: " + plata(porFacturar),
    debemos < 0 ? "⚠ A proveedores se les ha pagado " + plata(-debemos) + " de más" : "Debemos a proveedores: <b>" + plata(debemos) + "</b>",
    "Gastos fijos de la oficina: " + plata(fijos) + " al mes",
    "Gastos registrados este mes: " + plata(gastosMes)].join("\n");
}

/* ---------- mensajes y botones ---------- */
// Mensaje (texto o foto) mientras hay un gasto o un pago en curso. Devuelve true si lo atendió.
function onFlujo(app, token, chatId, u, v, msg) {
  const f = obra.flujo(v);
  if (!f || (f.tipo !== "gasto" && f.tipo !== "pago")) return false;
  const foto = fotoDe(msg);
  const texto = String((foto ? msg.caption : msg.text) || "").trim();
  if (foto && !texto) { f.foto = foto; obra.ponerFlujo(app, v, f); enviar(token, chatId, "📎 Recibí la foto. Ahora escribe: <i>valor - qué es" + (f.tipo === "gasto" ? " - proveedor" : "") + "</i>", LISTO); return true; }
  if (!texto) return false;
  const x = partes(texto);
  if (!x || !(x.valor > 0)) { enviar(token, chatId, "No encontré el valor. Escríbelo así: <i>350.000 - " + (f.tipo === "gasto" ? "Cemento 10 bultos - Ferretería El Puente" : "Anticipo") + "</i>", LISTO); return true; }
  if (f.tipo === "gasto") {
    if (!x.desc) { enviar(token, chatId, "¿Qué es? Escribe: <i>valor - qué es - proveedor</i>", LISTO); return true; }
    f.pend = { valor: x.valor, desc: x.desc, prov: x.prov, fac: x.fac, foto: foto || f.foto || "" };
    f.foto = "";
    obra.ponerFlujo(app, v, f);
    pedirTipo(token, chatId, f);
    return true;
  }
  // Pago a proveedor
  let c;
  try { c = app.findRecordById("contratos", f.contrato); } catch (e) { obra.ponerFlujo(app, v, null); enviar(token, chatId, "Ese contrato ya no existe."); return true; }
  const r = new Record(app.findCollectionByNameOrId("pagos_proveedor"));
  r.set("contrato", c.id); r.set("fecha", lib.hoy(0)); r.set("valor", x.valor);
  r.set("concepto", corto(x.desc || (f.adicional ? "Pago de adicional" : "Pago"), 300)); r.set("factura", corto(x.prov, 80)); r.set("adicional", !!f.adicional);
  const sop = foto || f.foto;
  if (sop) r.set("soporte", descargar(token, sop, "comprobante"));
  app.save(r);
  lib.registrar(app, u.id, "edit", "Pago " + plata(x.valor) + " a " + c.getString("proveedorNombre"), r.id, c.getString("proyecto"));
  f.foto = ""; f.n = (f.n || 0) + 1; obra.ponerFlujo(app, v, f);
  const s = contrato(app, c);
  const queda = f.adicional ? s.debeAd : s.debeBase;
  enviar(token, chatId, "💵 Pago de <b>" + plata(x.valor) + "</b> a " + esc(c.getString("proveedorNombre")) + " registrado" + (sop ? " con comprobante" : "") + ".\n" +
    (queda < 0 ? "⚠ Con este pago se le ha pagado <b>" + plata(-queda) + " de más</b>" + (f.adicional ? " en adicionales." : " sobre el contrato.") : "Le debemos " + plata(queda) + (f.adicional ? " de adicionales." : " del contrato.")), LISTO);
  return true;
}
// Botones de esta etapa. Devuelve el texto para la notificación del botón, o null si no era de aquí.
function onBoton(app, token, chatId, mid, u, v, k, id, extra) {
  const nuestros = ["fp", "gt", "gx", "fc", "fa", "fk", "fy"];
  if (nuestros.indexOf(k) < 0) return null;
  if (!puedeFin(u)) return "Esto es para Administración, Gestión y Dirección.";
  if (k === "fp") {
    const pid = extra;
    if (id === "q") { editar(token, chatId, mid, pid === "todo" ? consultaGeneral(app) : consultaProyecto(app, pid), []); return ""; }
    if (pid !== "oficina" && !(function () { try { app.findRecordById("proyectos", pid); return true; } catch (e) { return false; } })()) return "No encontré ese proyecto.";
    if (id === "g") {
      obra.ponerFlujo(app, v, { tipo: "gasto", proyecto: pid, n: 0 });
      editar(token, chatId, mid, "💸 <b>Gasto · " + (pid === "oficina" ? "Oficina" : esc(nombreP(app.findRecordById("proyectos", pid)))) + "</b>\nManda la foto de la factura con el pie de foto:\n<i>valor - qué es - proveedor</i>\nEj.: <i>350.000 - Cemento 10 bultos - Ferretería El Puente</i>\nTambién lo puedes escribir sin foto.", [[{ text: "✅ Listo", callback_data: "fl" }]]);
      return "";
    }
    if (id === "p") {
      const cs = recs(app, "contratos", "proyecto = {:p}", { p: pid });
      const botones = cs.map((c) => { const x = contrato(app, c); return [{ text: corto(c.getString("proveedorNombre") + " · debemos " + plata(x.debe), 55), callback_data: "fc:" + c.id }]; });
      editar(token, chatId, mid, "💵 ¿A qué proveedor?", botones);
      return "";
    }
    if (id === "c") {
      const cl = cliente(app, pid);
      const botones = cl.cobros.filter((c) => c.getString("estado") !== "pagado").map((c) => [{ text: corto(c.getString("concepto") + " · " + plata(c.getFloat("valor")) + (c.getString("estado") === "facturado" ? " · facturado" : ""), 55), callback_data: "fk:" + c.id }]);
      editar(token, chatId, mid, "🧾 ¿Cuál cobro pagó el cliente?\nNos debe " + plata(cl.debe) + (cl.vencido ? " (⚠ " + plata(cl.vencido) + " vencido)" : "") + ".", botones);
      return "";
    }
  }
  if (k === "fc") {
    let c; try { c = app.findRecordById("contratos", id); } catch (e) { return "Ese contrato ya no existe."; }
    const x = contrato(app, c);
    const botones = [[{ text: "Pago del contrato (debemos " + plata(x.debeBase) + ")", callback_data: "fa:" + c.id + ":0" }]];
    if (x.adicionales) botones.push([{ text: "Pago de adicional (debemos " + plata(x.debeAd) + ")", callback_data: "fa:" + c.id + ":1" }]);
    editar(token, chatId, mid, "💵 <b>" + esc(c.getString("proveedorNombre")) + "</b> · " + esc(c.getString("objeto")) + "\n¿El pago es del contrato o de un adicional?", botones);
    return "";
  }
  if (k === "fa") {
    let c; try { c = app.findRecordById("contratos", id); } catch (e) { return "Ese contrato ya no existe."; }
    obra.ponerFlujo(app, v, { tipo: "pago", contrato: c.id, adicional: extra === "1", n: 0 });
    editar(token, chatId, mid, "💵 <b>" + esc(c.getString("proveedorNombre")) + (extra === "1" ? " · adicional" : "") + "</b>\nEscribe: <i>valor - concepto - factura</i> (concepto y factura opcionales)\nEj.: <i>5.000.000 - Anticipo - FE-123</i>\nPuedes mandar la foto del comprobante con ese pie de foto.", [[{ text: "✅ Listo", callback_data: "fl" }]]);
    return "";
  }
  if (k === "fk") {
    let c; try { c = app.findRecordById("cobros", id); } catch (e) { return "Ese cobro ya no existe."; }
    editar(token, chatId, mid, "🧾 ¿El cliente pagó <b>" + esc(c.getString("concepto")) + "</b> por " + plata(c.getFloat("valor")) + "?", [[{ text: "✅ Sí, pagó hoy", callback_data: "fy:" + c.id }, { text: "Cancelar", callback_data: "fp:c:" + c.getString("project") }]]);
    return "";
  }
  if (k === "fy") {
    let c; try { c = app.findRecordById("cobros", id); } catch (e) { return "Ese cobro ya no existe."; }
    if (c.getString("estado") !== "pagado") {
      c.set("estado", "pagado"); c.set("fechaPago", lib.hoy(0)); app.save(c);
      lib.registrar(app, u.id, "edit", "Cobro recibido: " + c.getString("concepto") + " " + plata(c.getFloat("valor")), c.id, c.getString("project"));
    }
    const cl = cliente(app, c.getString("project"));
    editar(token, chatId, mid, "✅ Cobro <b>" + esc(c.getString("concepto")) + "</b> marcado como pagado.\nEl cliente nos debe " + plata(cl.debe) + " y falta por facturar " + plata(cl.porFacturar) + ".", []);
    return "¡Pagado!";
  }
  const f = obra.flujo(v);
  if (k === "gx") { if (f && f.pend) { f.pend = null; obra.ponerFlujo(app, v, f); } editar(token, chatId, mid, "Descartado. Manda otro gasto o toca Listo.", [[{ text: "✅ Listo", callback_data: "fl" }]]); return ""; }
  if (k === "gt") {
    if (!f || f.tipo !== "gasto" || !f.pend) return "Ya no hay un gasto en curso.";
    const donde = guardarGasto(app, token, u, f, id);
    const g = f.pend;
    f.pend = null; f.n = (f.n || 0) + 1; obra.ponerFlujo(app, v, f);
    editar(token, chatId, mid, "✅ Gasto de <b>" + plata(g.valor) + "</b> (" + esc(g.desc) + ") guardado " + donde + (g.foto ? ", con la foto de la factura" : "") + ".\n¿Otro? Mándalo o toca Listo.", [[{ text: "✅ Listo", callback_data: "fl" }]]);
    return "Guardado";
  }
  return null;
}

module.exports = { puedeFin, elegir, onFlujo, onBoton, valorDe };
