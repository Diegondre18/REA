// Pantallas de Gestión: tablero, mapa de proyectos con semáforo, estado de pagos (cliente y proveedores),
// presupuesto y control de costos (con importación de Excel), flujo de caja, gastos fijos, horas y rentabilidad.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks } = L;
  const { useState, useMemo } = hooks;
  const q = () => L.q;
  const act = () => L.act;
  const G = () => L.G;
  const Icon = (p) => html`<${L.Icon} ...${p} />`;
  const num = (v) => Number(v) || 0;
  const $ = (n) => L.money(n);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const pname = (pid) => { const p = q().project(pid); return p ? (p.code ? p.code + " · " : "") + p.name : "Sin proyecto"; };
  const h1 = (n) => (Math.round(num(n) * 10) / 10).toLocaleString("es-CO");

  /* ---------- semáforo ---------- */
  const COLORS = { verde: "#22a06b", amarillo: "#e5a000", rojo: "#e5484d", gris: "#a0a7b0" };
  const WORD = { verde: "Bien", amarillo: "Atención", rojo: "En riesgo", gris: "Sin datos" };
  function Luz({ level, size = 12, title }) {
    return html`<i class="luz" style=${{ width: size + "px", height: size + "px", background: COLORS[level] || COLORS.gris }} title=${title || WORD[level]} aria-label=${title || WORD[level]}></i>`;
  }
  function Semaforo({ pid, compact }) {
    L.useStore();
    const s = G().semaforo(pid);
    if (compact) return html`<span class="sema-mini" title=${s.dims.map((d) => d.label + ": " + d.txt).join("\n")}><${Luz} level=${s.total} size=${10} /></span>`;
    return html`<div class="sema glass">
      <div class="sema-total"><${Luz} level=${s.total} size=${18} /><b>${WORD[s.total]}</b></div>
      <div class="sema-dims">${s.dims.map((d) => html`<div class="sema-dim" key=${d.k}><${Luz} level=${d.level} /><span><b>${d.label}</b><small>${d.txt}</small></span></div>`)}</div>
    </div>`;
  }

  const STATE_KEY = { proyecto_finanzas: "pfin", pagos_proveedor: "pagosProv", gastos_fijos: "gastosFijos", premios_semana: "premiosSemana" };
  /* ---------- formulario genérico ---------- */
  // defaults: { col, title, fields: [{ k, label, type, options, required }], data, after }
  function GForm({ id, defaults }) {
    const s = L.useStore();
    const { col, title, fields, data = {} } = defaults || {};
    const rec = id ? (s[STATE_KEY[col] || col] || []).find((x) => x.id === id) : null;
    const [f, setF] = useState(() => { const o = {}; fields.forEach((x) => { o[x.k] = rec ? rec[x.k] : data[x.k] !== undefined ? data[x.k] : x.type === "bool" ? false : ""; }); return o; });
    const [err, setErr] = useState("");
    const save = async () => {
      const miss = fields.find((x) => x.required && (f[x.k] === "" || f[x.k] === null || f[x.k] === undefined));
      if (miss) { setErr("Falta: " + miss.label); return; }
      const body = { ...data };
      fields.forEach((x) => { body[x.k] = x.type === "number" || x.type === "money" ? (f[x.k] === "" ? 0 : num(f[x.k])) : f[x.k]; });
      const r = await act().save(col, id || null, body);
      if (r) { L.toast("Guardado"); L.closeSheet(); }
    };
    const remove = async () => { if (await act().remove(col, id)) { L.toast("Borrado"); L.closeSheet(); } };
    const field = (x) => {
      const v = f[x.k] === undefined || f[x.k] === null ? "" : f[x.k];
      const set = (val) => setF((o) => ({ ...o, [x.k]: val }));
      const idf = "gf-" + x.k;
      let input;
      if (x.type === "select") input = html`<select id=${idf} value=${v} onChange=${(e) => set(e.target.value)}>${(x.options || []).map((o) => html`<option key=${o.id} value=${o.id}>${o.label}</option>`)}</select>`;
      else if (x.type === "bool") return html`<label class="check" key=${x.k}><input type="checkbox" checked=${!!v} onChange=${(e) => set(e.target.checked)} /><span><b>${x.label}</b>${x.hint && html`<small>${x.hint}</small>`}</span></label>`;
      else if (x.type === "textarea") input = html`<textarea id=${idf} rows="3" value=${v} onInput=${(e) => set(e.target.value)}></textarea>`;
      else if (x.type === "date") input = html`<input id=${idf} type="date" value=${v} onInput=${(e) => set(e.target.value)} />`;
      else if (x.type === "number" || x.type === "money") input = html`<input id=${idf} type="number" step=${x.step || (x.type === "money" ? "1000" : "any")} value=${v} onInput=${(e) => set(e.target.value)} />`;
      else input = html`<input id=${idf} value=${v} onInput=${(e) => set(e.target.value)} placeholder=${x.placeholder || ""} />`;
      return html`<${L.Field} key=${x.k} label=${x.label + (x.type === "money" && v !== "" ? " · " + $(v) : "")} id=${idf} hint=${x.hint}>${input}<//>`;
    };
    const footer = html`${id && html`<${L.DeleteButton} onConfirm=${remove} />`}<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary">Guardar</button>`;
    return html`<${L.Sheet} title=${title || "Editar"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      ${fields.map(field)}${err && html`<p class="err">${err}</p>`}
    <//>`;
  }
  const open = (col, id, title, fields, data) => L.openSheet("g-form", id || null, { col, title, fields, data });

  /* ---------- formularios de cada cosa ---------- */
  const F = {
    pfin: (pid, id) => open("proyecto_finanzas", id, "Datos del proyecto", [
      { k: "valorContrato", label: "Valor del contrato con el cliente", type: "money", hint: "Todo lo que paga el cliente al estudio: diseño y obra." },
      { k: "horasPresupuesto", label: "Horas presupuestadas del equipo", type: "number" },
      { k: "margenObjetivo", label: "Margen objetivo (%)", type: "number", hint: "Si lo dejas en 0 se usa el de los ajustes de Gestión." },
      { k: "notas", label: "Notas", type: "textarea" },
    ], { proyecto: pid }),
    contrato: (pid, id) => open("contratos", id, id ? "Contrato con proveedor" : "Nuevo contrato con proveedor", [
      { k: "proveedorNombre", label: "Proveedor", required: true, placeholder: "Carpintería, contratista de obra…" },
      { k: "objeto", label: "Objeto del contrato", required: true },
      { k: "capitulo", label: "Capítulo del presupuesto", placeholder: "Opcional" },
      { k: "valor", label: "Valor del contrato", type: "money", required: true },
      { k: "fecha", label: "Fecha", type: "date" },
      { k: "estado", label: "Estado", type: "select", options: [{ id: "vigente", label: "Vigente" }, { id: "terminado", label: "Terminado" }] },
      { k: "notas", label: "Notas", type: "textarea" },
    ], { proyecto: pid, estado: "vigente", fecha: L.todayIso() }),
    adicional: (cid, id) => open("adicionales", id, "Adicional", [
      { k: "descripcion", label: "Qué se adicionó", required: true },
      { k: "valor", label: "Valor", type: "money", required: true },
      { k: "fecha", label: "Fecha", type: "date" },
      { k: "aprobado", label: "Aprobado", type: "bool", hint: "Solo los adicionales aprobados suman a lo que se le debe al proveedor." },
    ], { contrato: cid, fecha: L.todayIso() }),
    pago: (cid, id, adicional) => open("pagos_proveedor", id, adicional ? "Pago de adicional" : "Pago a proveedor", [
      { k: "fecha", label: "Fecha", type: "date", required: true },
      { k: "valor", label: "Valor", type: "money", required: true },
      { k: "concepto", label: "Concepto", placeholder: "Anticipo, acta de avance #2…" },
      { k: "factura", label: "Factura o comprobante" },
      { k: "adicional", label: "Es pago de un adicional", type: "bool" },
    ], { contrato: cid, fecha: L.todayIso(), adicional: !!adicional }),
    costo: (pid, id) => open("costos", id, "Costo real", [
      { k: "fecha", label: "Fecha", type: "date" },
      { k: "capitulo", label: "Capítulo" },
      { k: "descripcion", label: "Descripción", required: true },
      { k: "proveedor", label: "Proveedor" },
      { k: "factura", label: "Factura" },
      { k: "tipo", label: "Tipo", type: "select", options: [["material", "Material"], ["mano_obra", "Mano de obra"], ["equipo", "Equipo"], ["transporte", "Transporte"], ["otro", "Otro"]].map(([id2, label]) => ({ id: id2, label })) },
      { k: "valor", label: "Valor", type: "money", required: true },
    ], { proyecto: pid, fecha: L.todayIso(), tipo: "material" }),
    flujo: (id, data) => open("flujo", id, "Movimiento de caja", [
      { k: "fecha", label: "Fecha", type: "date", required: true },
      { k: "tipo", label: "Tipo", type: "select", options: [{ id: "ingreso", label: "Ingreso" }, { id: "egreso", label: "Egreso" }] },
      { k: "concepto", label: "Concepto", required: true },
      { k: "categoria", label: "Categoría", placeholder: "Honorarios, obra, impuestos, préstamo…" },
      { k: "valor", label: "Valor", type: "money", required: true },
      { k: "estado", label: "Estado", type: "select", options: [{ id: "proyectado", label: "Proyectado" }, { id: "real", label: "Real (ya pasó)" }] },
      { k: "proyecto", label: "Proyecto", type: "select", options: [{ id: "", label: "De la oficina (sin proyecto)" }, ...L.state.proyectos.map((p) => ({ id: p.id, label: pname(p.id) }))] },
    ], { fecha: L.todayIso(), tipo: "egreso", estado: "proyectado", proyecto: "", ...(data || {}) }),
    gasto: (id) => open("gastos_fijos", id, "Gasto fijo de la oficina", [
      { k: "concepto", label: "Concepto", required: true, placeholder: "Arriendo, internet, contador…" },
      { k: "categoria", label: "Categoría", type: "select", options: CATS },
      { k: "valor", label: "Valor", type: "money", required: true },
      { k: "periodicidad", label: "Cada cuánto se paga", type: "select", options: [["mensual", "Mensual"], ["bimestral", "Cada 2 meses"], ["trimestral", "Cada 3 meses"], ["semestral", "Cada 6 meses"], ["anual", "Anual"]].map(([id2, label]) => ({ id: id2, label })) },
      { k: "diaPago", label: "Día de pago", type: "number" },
      { k: "activo", label: "Activo", type: "bool" },
      { k: "notas", label: "Notas", type: "textarea" },
    ], { categoria: "otro", periodicidad: "mensual", activo: true }),
    tarifa: (uid, id) => open("tarifas", id, "Costo por hora de " + q().name(uid), [
      { k: "valorHora", label: "Costo de una hora de trabajo", type: "money", required: true, hint: "Salario más prestaciones dividido entre las horas del mes. Solo lo ven Dirección, Administración y Gestión." },
    ], { user: uid }),
    tiempo: (id, data) => open("tiempos", id, "Tiempo trabajado", [
      { k: "fecha", label: "Fecha", type: "date", required: true },
      { k: "proyecto", label: "Proyecto", type: "select", options: [{ id: "", label: "Sin proyecto" }, ...L.state.proyectos.map((p) => ({ id: p.id, label: pname(p.id) }))] },
      { k: "minutos", label: "Minutos en horario", type: "number" },
      { k: "extra", label: "Minutos extra (fuera de horario)", type: "number" },
      { k: "nota", label: "Nota" },
    ], { fecha: L.todayIso(), user: L.state.me.id, auto: false, ...(data || {}) }),
  };
  const CATS = [["arriendo", "Arriendo"], ["servicios", "Servicios públicos"], ["nomina", "Nómina"], ["seguridad_social", "Seguridad social"], ["software", "Software y licencias"], ["contabilidad", "Contabilidad"], ["impuestos", "Impuestos"], ["mantenimiento", "Mantenimiento"], ["transporte", "Transporte"], ["otro", "Otro"]].map(([id, label]) => ({ id, label }));

  /* ---------- importar Excel ---------- */
  const KINDS = {
    presupuesto: { label: "Presupuesto", cols: [["capitulo", "Capítulo"], ["codigo", "Ítem / código"], ["descripcion", "Descripción"], ["unidad", "Unidad"], ["cantidad", "Cantidad"], ["valorUnitario", "Valor unitario"], ["total", "Valor total"]],
      guess: { capitulo: /cap[ií]tulo|grupo/, codigo: /^(i?tem|c[oó]d|no\.?|n[°º])/, descripcion: /descrip|actividad|concepto|nombre/, unidad: /^(und|un|unidad|u\.?)$/, cantidad: /cant/, valorUnitario: /unit|v\.?\s*u|precio/, total: /total|parcial|valor$/ } },
    costos: { label: "Control de costos", cols: [["fecha", "Fecha"], ["capitulo", "Capítulo"], ["codigo", "Ítem / código"], ["descripcion", "Descripción"], ["proveedor", "Proveedor"], ["factura", "Factura"], ["valor", "Valor"]],
      guess: { fecha: /fecha/, capitulo: /cap[ií]tulo|grupo/, codigo: /^(i?tem|c[oó]d)/, descripcion: /descrip|concepto|detalle/, proveedor: /proveed|tercero|beneficiario/, factura: /factura|doc|comprobante/, valor: /valor|total|monto|costo/ } },
    flujo: { label: "Flujo de caja", cols: [["fecha", "Fecha"], ["concepto", "Concepto"], ["categoria", "Categoría"], ["ingreso", "Ingreso"], ["egreso", "Egreso"], ["valor", "Valor (si hay una sola columna)"], ["tipo", "Tipo (ingreso/egreso)"]],
      guess: { fecha: /fecha|mes/, concepto: /concepto|descrip|detalle/, categoria: /categ|rubro|cuenta/, ingreso: /ingreso|entrada|cr[eé]dito/, egreso: /egreso|salida|gasto|d[eé]bito/, valor: /^valor|monto/, tipo: /^tipo/ } },
  };
  // Números como "$ 1.234.567,89", "1,234,567.89" o con paréntesis negativos.
  function parseNum(v) {
    if (typeof v === "number") return v;
    let t = String(v == null ? "" : v).trim();
    if (!t) return null;
    const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
    t = t.replace(/[^\d.,]/g, "");
    if (!t) return null;
    const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
    if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if (lc > -1) t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
    else if (ld > -1 && /\.\d{3}(\.|$)/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
    const n = Number(t);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }
  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return L.iso(v);
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return L.iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    const t = String(v || "").trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    return "";
  }
  function ImportSheet({ defaults }) {
    const s = L.useStore();
    const [kind, setKind] = useState((defaults && defaults.kind) || "presupuesto");
    const [proyecto, setProyecto] = useState((defaults && defaults.proyecto) || "");
    const [book, setBook] = useState(null); // { name, sheets: { nombre: rows[][] } }
    const [hoja, setHoja] = useState("");
    const [headerRow, setHeaderRow] = useState(0);
    const [map, setMap] = useState({});
    const [modo, setModo] = useState("reemplazar");
    const [busy, setBusy] = useState("");
    const K = KINDS[kind];
    const rows = book && hoja ? book.sheets[hoja] || [] : [];
    const headers = (rows[headerRow] || []).map((h) => String(h == null ? "" : h).trim());
    const autoMap = (hdrs, k) => {
      const m = {};
      for (const [field] of KINDS[k].cols) {
        const re = KINDS[k].guess[field];
        const i = hdrs.findIndex((h, j) => re && re.test(h.toLowerCase()) && !Object.values(m).includes(j));
        if (i > -1) m[field] = i;
      }
      return m;
    };
    const pickHeader = (rs) => {
      for (let i = 0; i < Math.min(rs.length, 30); i++) if ((rs[i] || []).filter((c) => typeof c === "string" && c.trim()).length >= 3) return i;
      return 0;
    };
    const load = async () => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = ".xlsx,.xls,.xlsm,.csv,.ods";
      i.onchange = async () => {
        const file = i.files && i.files[0]; if (!file) return;
        if (!window.XLSX) { L.toast("No se pudo cargar el lector de Excel."); return; }
        setBusy("Leyendo…");
        try {
          const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
          const sheets = {};
          for (const n of wb.SheetNames) sheets[n] = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
          const first = wb.SheetNames[0];
          const hr = pickHeader(sheets[first]);
          setBook({ name: file.name, sheets }); setHoja(first); setHeaderRow(hr);
          setMap(autoMap((sheets[first][hr] || []).map((h) => String(h || "").trim()), kind));
        } catch (e) { L.toast("No pude leer ese archivo: " + (e.message || e)); }
        setBusy("");
      };
      i.click();
    };
    const changeSheet = (n) => { setHoja(n); const hr = pickHeader(book.sheets[n]); setHeaderRow(hr); setMap(autoMap((book.sheets[n][hr] || []).map((h) => String(h || "").trim()), kind)); };
    const changeKind = (k) => { setKind(k); if (book) setMap(autoMap(headers, k)); };
    const val = (r, f) => (map[f] === undefined || map[f] === "" ? "" : r[map[f]]);
    // Filas → registros. En el presupuesto, las filas sin cantidad ni valores son títulos de capítulo.
    const build = () => {
      const out = [];
      let cap = "";
      const data = rows.slice(headerRow + 1);
      data.forEach((r, i) => {
        if (!r || !r.some((c) => String(c).trim())) return;
        if (kind === "presupuesto") {
          const desc = String(val(r, "descripcion") || "").trim();
          const cant = parseNum(val(r, "cantidad")), vu = parseNum(val(r, "valorUnitario"));
          let tot = parseNum(val(r, "total"));
          const capCol = String(val(r, "capitulo") || "").trim();
          if (capCol) cap = capCol;
          if (!desc) return;
          if (cant === null && vu === null && (tot === null || map.capitulo === undefined) && !/total/i.test(desc)) { if (map.capitulo === undefined) cap = desc; if (cant === null && vu === null && tot === null) return; }
          if (/^total|subtotal/i.test(desc)) return;
          if (tot === null && cant !== null && vu !== null) tot = cant * vu;
          if (tot === null && cant === null) return;
          out.push({ proyecto, capitulo: cap, codigo: String(val(r, "codigo") || "").trim().slice(0, 40), descripcion: desc.slice(0, 1000), unidad: String(val(r, "unidad") || "").trim().slice(0, 30), cantidad: cant || 0, valorUnitario: vu || 0, total: tot || 0, orden: (i + 1) * 10 });
        } else if (kind === "costos") {
          const desc = String(val(r, "descripcion") || "").trim();
          const v = parseNum(val(r, "valor"));
          if (!desc || v === null || /^total|subtotal/i.test(desc)) return;
          out.push({ proyecto, fecha: parseDate(val(r, "fecha")) || L.todayIso(), capitulo: String(val(r, "capitulo") || "").trim(), codigo: String(val(r, "codigo") || "").trim().slice(0, 40), descripcion: desc.slice(0, 1000), proveedor: String(val(r, "proveedor") || "").trim().slice(0, 200), factura: String(val(r, "factura") || "").trim().slice(0, 80), tipo: "otro", valor: v });
        } else {
          const concepto = String(val(r, "concepto") || "").trim();
          const fecha = parseDate(val(r, "fecha"));
          if (!concepto || !fecha) return;
          const ing = parseNum(val(r, "ingreso")), egr = parseNum(val(r, "egreso")), v = parseNum(val(r, "valor"));
          const tipoTxt = String(val(r, "tipo") || "").toLowerCase();
          const push = (tipo, valor) => out.push({ fecha, concepto: concepto.slice(0, 300), categoria: String(val(r, "categoria") || "").trim().slice(0, 80), tipo, valor: Math.abs(valor), estado: fecha <= L.todayIso() ? "real" : "proyectado", proyecto: proyecto || "" });
          if (ing) push("ingreso", ing);
          if (egr) push("egreso", egr);
          if (!ing && !egr && v) push(/egr|sal|gas/.test(tipoTxt) || v < 0 ? "egreso" : "ingreso", v);
        }
      });
      return out;
    };
    const preview = book ? build() : [];
    const col = kind === "presupuesto" ? "presupuesto" : kind === "costos" ? "costos" : "flujo";
    const needProject = kind !== "flujo";
    const go = async () => {
      if (needProject && !proyecto) { L.toast("Elige el proyecto."); return; }
      if (!preview.length) { L.toast("No encontré filas para importar. Revisa las columnas."); return; }
      setBusy("Importando…");
      if (modo === "reemplazar" && kind !== "flujo") {
        const old = (kind === "presupuesto" ? s.presupuesto : s.costos).filter((x) => x.proyecto === proyecto);
        for (const o of old) await act().remove(col, o.id);
      }
      let ok = 0;
      const queue = [...preview];
      const worker = async () => { while (queue.length) { const r = queue.shift(); if (await act().save(col, null, r)) ok += 1; setBusy(`Importando… ${ok} de ${preview.length}`); } };
      await Promise.all([worker(), worker(), worker(), worker()]);
      setBusy("");
      L.toast(`Listo: ${ok} ${ok === 1 ? "fila importada" : "filas importadas"}.`);
      L.closeSheet();
    };
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary" disabled=${!!busy || !preview.length}>${busy || `Importar ${preview.length || ""} filas`}</button>`;
    return html`<${L.Sheet} title="Importar desde Excel" onClose=${L.closeSheet} onSubmit=${go} footer=${footer} wide=${true}>
      <div class="two">
        <${L.Field} label="Qué vas a importar" id="im-k"><select id="im-k" value=${kind} onChange=${(e) => changeKind(e.target.value)}>${Object.entries(KINDS).map(([k, v]) => html`<option key=${k} value=${k}>${v.label}</option>`)}</select><//>
        <${L.Field} label=${needProject ? "Proyecto" : "Proyecto (opcional)"} id="im-p"><select id="im-p" value=${proyecto} onChange=${(e) => setProyecto(e.target.value)}><option value="">${needProject ? "Elige el proyecto…" : "De la oficina"}</option>${s.proyectos.map((p) => html`<option key=${p.id} value=${p.id}>${pname(p.id)}</option>`)}</select><//>
      </div>
      <div class="fld"><button type="button" class="btn" onClick=${load}><${Icon} name="out" /> ${book ? "Cambiar archivo" : "Elegir archivo de Excel"}</button>${book && html` <span class="muted">${book.name}</span>`}</div>
      ${book && html`
        <div class="two">
          <${L.Field} label="Hoja" id="im-h"><select id="im-h" value=${hoja} onChange=${(e) => changeSheet(e.target.value)}>${Object.keys(book.sheets).map((n) => html`<option key=${n} value=${n}>${n}</option>`)}</select><//>
          <${L.Field} label="Fila de los títulos" id="im-r" hint="La fila donde están los nombres de las columnas."><input id="im-r" type="number" min="1" value=${headerRow + 1} onInput=${(e) => { const n = Math.max(0, num(e.target.value) - 1); setHeaderRow(n); setMap(autoMap((rows[n] || []).map((h) => String(h || "").trim()), kind)); }} /><//>
        </div>
        <div class="fld"><span class="lbl">Columnas</span><div class="map-grid">${K.cols.map(([f, label]) => html`<label key=${f}><span>${label}</span><select value=${map[f] === undefined ? "" : map[f]} onChange=${(e) => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}><option value="">— No está —</option>${headers.map((h, i) => html`<option key=${i} value=${i}>${h || "Columna " + (i + 1)}</option>`)}</select></label>`)}</div></div>
        ${kind !== "flujo" && html`<${L.Seg} label="Si ya hay datos" value=${modo} onChange=${setModo} options=${[{ id: "reemplazar", label: "Reemplazar lo que hay" }, { id: "agregar", label: "Agregar a lo que hay" }]} />`}
        <div class="fld"><span class="lbl">Vista previa · ${L.plural(preview.length, "fila", "filas")}${kind === "presupuesto" ? " · total " + $(preview.reduce((a, r) => a + num(r.total), 0)) : kind === "costos" ? " · total " + $(preview.reduce((a, r) => a + num(r.valor), 0)) : ""}</span>
          <div class="imp-prev">${preview.slice(0, 8).map((r, i) => html`<div class="imp-row" key=${i}>${kind === "presupuesto" ? html`<small>${r.capitulo}</small><span>${r.codigo} ${r.descripcion}</span><b class="mono">${$(r.total)}</b>`
            : kind === "costos" ? html`<small>${r.fecha} · ${r.capitulo}</small><span>${r.descripcion}</span><b class="mono">${$(r.valor)}</b>`
            : html`<small>${r.fecha} · ${r.tipo}</small><span>${r.concepto}</span><b class="mono">${$(r.valor)}</b>`}</div>`)}
            ${preview.length > 8 && html`<p class="note">…y ${preview.length - 8} más.</p>`}${!preview.length && html`<p class="note">Elige qué columna corresponde a cada dato.</p>`}</div></div>`}
    <//>`;
  }

  /* ---------- barras simples ---------- */
  function FlujoChart({ meses }) {
    const max = Math.max(1, ...meses.map((m) => Math.max(m.ing + m.ingP, m.egr + m.egrP)));
    const W = 640, H = 180, bw = W / meses.length;
    const y = (v) => H - 20 - (v / max) * (H - 40);
    return html`<svg class="flujo-chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Ingresos y egresos por mes">
      ${meses.map((m, i) => {
        const x = i * bw + bw * 0.18, w = bw * 0.3;
        return html`<g key=${m.key}>
          <rect x=${x} y=${y(m.ing + m.ingP)} width=${w} height=${H - 20 - y(m.ing + m.ingP)} class="b-ing p" />
          <rect x=${x} y=${y(m.ing)} width=${w} height=${H - 20 - y(m.ing)} class="b-ing" />
          <rect x=${x + w + 2} y=${y(m.egr + m.egrP)} width=${w} height=${H - 20 - y(m.egr + m.egrP)} class="b-egr p" />
          <rect x=${x + w + 2} y=${y(m.egr)} width=${w} height=${H - 20 - y(m.egr)} class="b-egr" />
          <text x=${i * bw + bw / 2} y=${H - 4} text-anchor="middle" class="ax">${m.label}</text>
          <title>${m.label}: ingresos ${$(m.ing + m.ingP)}, egresos ${$(m.egr + m.egrP)}, saldo ${$(m.saldo)}</title>
        </g>`;
      })}
    </svg>`;
  }
  function Bar({ value, max, level }) {
    return html`<span class="gbar"><i style=${{ width: Math.max(0, Math.min(100, max ? (value / max) * 100 : 0)) + "%", background: level ? COLORS[level] : null }}></i></span>`;
  }

  /* ---------- vista principal ---------- */
  const TABS = [
    { id: "resumen", label: "Tablero" }, { id: "mapa", label: "Mapa de proyectos" }, { id: "pagos", label: "Estado de pagos" },
    { id: "presupuesto", label: "Presupuesto y costos" }, { id: "flujo", label: "Flujo de caja" }, { id: "gastos", label: "Gastos fijos" },
    { id: "horas", label: "Horas y rentabilidad" }, { id: "ajustes", label: "Ajustes" },
  ];
  function Gestion({ tab }) {
    const s = L.useStore();
    if (!q().isFin()) return html`<div class="glass"><${L.Empty} title="Solo para Dirección, Administración y Gestión" text="Quien lidera un proyecto ve su parte en la pestaña Finanzas del proyecto." /></div>`;
    const cur = TABS.some((t) => t.id === tab) ? tab : "resumen";
    return html`
      <${L.PageHead} title="Gestión" sub="Presupuestos, costos, pagos, caja, horas y rentabilidad de los proyectos. Solo lo ven Dirección, Administración y Gestión.">
        <button type="button" class="btn" onClick=${() => L.openSheet("g-import", null, { kind: "presupuesto" })}><${Icon} name="out" /> Importar Excel</button>
      <//>
      <nav class="tabs" aria-label="Secciones de Gestión">${TABS.map((x) => html`<a key=${x.id} href=${"#gestion/" + x.id} aria-current=${cur === x.id ? "page" : null}>${x.label}</a>`)}</nav>
      ${cur === "resumen" && html`<${Tablero} />`}
      ${cur === "mapa" && html`<${Mapa} />`}
      ${cur === "pagos" && html`<${Pagos} />`}
      ${cur === "presupuesto" && html`<${Presupuestos} />`}
      ${cur === "flujo" && html`<${Flujo} />`}
      ${cur === "gastos" && html`<${Gastos} />`}
      ${cur === "horas" && html`<${Horas} />`}
      ${cur === "ajustes" && html`<${Ajustes} />`}`;
  }
  const activos = () => L.state.proyectos.filter((p) => p.status !== "cerrado");

  function Tablero() {
    const s = L.useStore();
    const ps = activos();
    const data = ps.map((p) => ({ p, sem: G().semaforo(p.id) }));
    const tot = (f) => data.reduce((a, x) => a + num(f(x)), 0);
    const prov = G().proveedores();
    const meses = G().flujoMeses(1, 5);
    const finMes = meses[1];
    const mesIni = L.iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const horasMes = G().tiemposDe({ desde: mesIni });
    const hN = horasMes.reduce((a, r) => a + r.normal, 0), hE = horasMes.reduce((a, r) => a + r.extra, 0);
    const count = (lv) => data.filter((x) => x.sem.total === lv).length;
    const findings = (L.gestionFindings ? L.gestionFindings() : []).slice(0, 6);
    return html`<div class="grid">
      <div class="glass metrics span-12 money four" role="list">
        <div class="metric" role="listitem"><b>${$(tot((x) => x.sem.cl.contrato))}</b><span>Contratado (proyectos activos)</span></div>
        <div class="metric" role="listitem"><b>${$(tot((x) => x.sem.cl.pagado))}</b><span>Cobrado</span></div>
        <div class=${L.cx("metric", tot((x) => x.sem.cl.vencido) ? "alert" : "")} role="listitem"><b>${$(tot((x) => x.sem.cl.debe))}</b><span>Nos deben${tot((x) => x.sem.cl.vencido) ? " · " + $(tot((x) => x.sem.cl.vencido)) + " vencido" : ""}</span></div>
        <div class="metric" role="listitem"><b>${$(tot((x) => x.sem.cl.porFacturar))}</b><span>Por facturar</span></div>
        <div class="metric" role="listitem"><b>${$(prov.debe)}</b><span>Debemos a proveedores</span></div>
        <div class="metric" role="listitem"><b>${$(G().fijosMes())}</b><span>Gastos fijos al mes</span></div>
        <div class=${L.cx("metric", finMes && finMes.saldo < 0 ? "alert" : "")} role="listitem"><b>${$(finMes ? finMes.saldo : 0)}</b><span>Caja al cierre del mes</span></div>
        <div class="metric" role="listitem"><b>${h1(hN + hE)} h</b><span>Horas este mes${hE ? " · " + h1(hE) + " extra (" + pct(hE, hN + hE) + "%)" : ""}</span></div>
      </div>
      <${L.Panel} title="Semáforo" cls="span-4">
        <div class="sema-count">${["verde", "amarillo", "rojo"].map((lv) => html`<a key=${lv} href="#gestion/mapa"><${Luz} level=${lv} size=${16} /><b>${count(lv)}</b><span>${WORD[lv]}</span></a>`)}</div>
      <//>
      <${L.Panel} title="Flujo de caja" cls="span-8" action=${html`<a class="btn sm ghost" href="#gestion/flujo">Ver detalle</a>`}>
        <${FlujoChart} meses=${meses} /><p class="legend"><i class="lg ing"></i>Ingresos <i class="lg egr"></i>Egresos · claro = proyectado</p>
      <//>
      <${L.Panel} title="Rentabilidad por proyecto" cls="span-6">
        <div class="rent-list">${data.filter((x) => x.sem.r.ingresos).sort((a, b) => (a.sem.r.margen || 0) - (b.sem.r.margen || 0)).map((x) => html`<a class="rent-row" key=${x.p.id} href=${"#proyecto/" + x.p.id + "/finanzas"}>
          <span>${pname(x.p.id)}</span><${Bar} value=${Math.max(0, x.sem.r.margen || 0)} max=${Math.max(40, x.sem.r.margenObjetivo * 1.5)} level=${x.sem.dims.find((d) => d.k === "margen").level} /><b class="mono">${Math.round(x.sem.r.margen || 0)}%</b></a>`)}
          ${!data.some((x) => x.sem.r.ingresos) && html`<p class="note">Pon el valor del contrato en cada proyecto (pestaña Finanzas del proyecto) para ver su rentabilidad.</p>`}</div>
      <//>
      <${L.Panel} title="Lo que dice el agente de Gestión" cls="span-6" action=${html`<a class="btn sm ghost" href="#agentes/gestion">Ver todo</a>`}>
        <div class="rows">${findings.length ? findings.map((f) => html`<a class="row" key=${f.key} href=${f.go || "#gestion"}><span class=${"lvl " + f.level}></span><div class="row-main"><div class="row-title">${f.title}</div><div class="row-meta"><span>${f.detail}</span></div></div></a>`) : html`<p class="note">Todo en orden por ahora.</p>`}</div>
      <//>
    </div>`;
  }

  function Mapa() {
    const s = L.useStore();
    const [filtro, setFiltro] = useState("");
    const data = activos().map((p) => ({ p, sem: G().semaforo(p.id) })).filter((x) => !filtro || x.sem.total === filtro)
      .sort((a, b) => ({ rojo: 0, amarillo: 1, verde: 2 }[a.sem.total] - { rojo: 0, amarillo: 1, verde: 2 }[b.sem.total]));
    return html`<div class="toolbar"><${L.Seg} label="Mostrar" value=${filtro} onChange=${setFiltro} options=${[{ id: "", label: "Todos" }, { id: "rojo", label: "En riesgo" }, { id: "amarillo", label: "Atención" }, { id: "verde", label: "Bien" }]} /></div>
      <div class="mapa-grid">${data.map(({ p, sem }) => {
        const prov = G().proveedores(p.id);
        return html`<a class=${"mapa-card glass lv-" + sem.total} key=${p.id} href=${"#proyecto/" + p.id + "/finanzas"}>
          <div class="mc-head"><${Luz} level=${sem.total} size=${14} /><b>${p.code ? html`<span class="mono">${p.code}</span> ` : ""}${p.name}</b></div>
          <div class="mc-bars">
            <label><span>Entregas</span><${Bar} value=${sem.avance} max=${1} level=${sem.dims[0].level} /><small>${Math.round(sem.avance * 100)}%</small></label>
            <label><span>Cobrado</span><${Bar} value=${sem.cl.pagado} max=${sem.cl.contrato} level=${sem.dims[1].level} /><small>${pct(sem.cl.pagado, sem.cl.contrato)}%</small></label>
            <label><span>Pagado a proveedores</span><${Bar} value=${prov.pagado} max=${prov.total} /><small>${pct(prov.pagado, prov.total)}%</small></label>
            <label><span>Costos</span><${Bar} value=${sem.pre.real} max=${sem.pre.presupuesto} level=${sem.dims[2].level} /><small>${sem.pre.presupuesto ? pct(sem.pre.real, sem.pre.presupuesto) + "%" : "—"}</small></label>
            <label><span>Horas</span><${Bar} value=${sem.r.hNormal + sem.r.hExtra} max=${sem.r.horasPresupuesto} level=${sem.dims[3].level} /><small>${sem.r.horasPresupuesto ? pct(sem.r.hNormal + sem.r.hExtra, sem.r.horasPresupuesto) + "%" : h1(sem.r.hNormal + sem.r.hExtra) + " h"}</small></label>
          </div>
          <div class="mc-dims">${sem.dims.map((d) => html`<span key=${d.k} title=${d.label + ": " + d.txt}><${Luz} level=${d.level} size=${8} /> ${d.label}</span>`)}</div>
        </a>`;
      })}${!data.length && html`<p class="note">No hay proyectos en este grupo.</p>`}</div>`;
  }

  function Pagos() {
    L.useStore();
    const data = activos().map((p) => ({ p, cl: G().cliente(p.id), pr: G().proveedores(p.id) })).filter((x) => x.cl.contrato || x.pr.list.length);
    const T = (f) => data.reduce((a, x) => a + num(f(x)), 0);
    return html`<div class="grid">
      <${L.Panel} title="Cliente" cls="span-12">
        <div class="pay-table">
          <div class="pay-row head"><div>Proyecto</div><div>Contrato</div><div>Facturado</div><div>Pagado</div><div>Nos debe</div><div>Por facturar</div></div>
          ${data.map(({ p, cl }) => html`<a class="pay-row" key=${p.id} href=${"#proyecto/" + p.id + "/finanzas"}><div class="t">${pname(p.id)}</div><div class="mono">${$(cl.contrato)}</div><div class="mono">${$(cl.facturado)}</div><div class="mono">${$(cl.pagado)}</div><div class=${L.cx("mono", cl.vencido && "late")}>${$(cl.debe)}</div><div class="mono">${$(cl.porFacturar)}</div></a>`)}
          <div class="pay-row foot"><div>Total</div><div class="mono">${$(T((x) => x.cl.contrato))}</div><div class="mono">${$(T((x) => x.cl.facturado))}</div><div class="mono">${$(T((x) => x.cl.pagado))}</div><div class="mono">${$(T((x) => x.cl.debe))}</div><div class="mono">${$(T((x) => x.cl.porFacturar))}</div></div>
        </div>
      <//>
      <${L.Panel} title="Proveedores" cls="span-12">
        <div class="pay-table">
          <div class="pay-row head"><div>Proyecto</div><div>Contratos</div><div>Adicionales</div><div>Pagado</div><div>Les debemos</div><div>Proveedores</div></div>
          ${data.filter((x) => x.pr.list.length).map(({ p, pr }) => html`<a class="pay-row" key=${p.id} href=${"#proyecto/" + p.id + "/finanzas"}><div class="t">${pname(p.id)}</div><div class="mono">${$(pr.valor)}</div><div class="mono">${$(pr.adicionales)}</div><div class="mono">${$(pr.pagado)}</div><div class="mono">${$(pr.debe)}</div><div>${pr.list.length}</div></a>`)}
        </div>
        ${!data.some((x) => x.pr.list.length) && html`<p class="note">Registra los contratos con proveedores en la pestaña Finanzas de cada proyecto.</p>`}
      <//>
    </div>`;
  }

  function Presupuestos() {
    const s = L.useStore();
    const [pid, setPid] = useState(() => (activos()[0] || {}).id || "");
    const pre = pid ? G().presupuestoDe(pid) : null;
    const [abierto, setAbierto] = useState("");
    return html`<div class="toolbar">
        <select value=${pid} onChange=${(e) => setPid(e.target.value)} aria-label="Proyecto">${s.proyectos.map((p) => html`<option key=${p.id} value=${p.id}>${pname(p.id)}</option>`)}</select>
        <span class="spacer"></span>
        <button type="button" class="btn" onClick=${() => L.openSheet("g-import", null, { kind: "presupuesto", proyecto: pid })}>Importar presupuesto</button>
        <button type="button" class="btn" onClick=${() => L.openSheet("g-import", null, { kind: "costos", proyecto: pid })}>Importar costos</button>
        <button type="button" class="btn primary" onClick=${() => F.costo(pid)}><${Icon} name="plus" size=${12} /> Costo</button>
      </div>
      ${pre && html`<div class="grid">
        <div class="glass metrics span-12 money four" role="list">
          <div class="metric"><b>${$(pre.presupuesto)}</b><span>Presupuesto</span></div>
          <div class="metric"><b>${$(pre.real)}</b><span>Gastado</span></div>
          <div class=${L.cx("metric", pre.real > pre.presupuesto && pre.presupuesto ? "alert" : "")}><b>${$(pre.presupuesto - pre.real)}</b><span>Disponible</span></div>
          <div class="metric"><b>${pre.presupuesto ? pct(pre.real, pre.presupuesto) : 0}%</b><span>Ejecutado</span></div>
        </div>
        <${L.Panel} title="Por capítulo" cls="span-12">
          ${pre.capitulos.length ? html`<div class="cap-table">
            <div class="cap-row head"><div>Capítulo</div><div>Presupuesto</div><div>Gastado</div><div>Diferencia</div><div>Ejecución</div></div>
            ${pre.capitulos.map((c) => {
              const lv = !c.presupuesto ? "gris" : c.real > c.presupuesto ? "rojo" : c.real > c.presupuesto * 0.9 ? "amarillo" : "verde";
              return html`<${L.Fragment} key=${c.capitulo}><button type="button" class="cap-row" onClick=${() => setAbierto(abierto === c.capitulo ? "" : c.capitulo)}>
                <div class="t">${c.capitulo}<small>${L.plural(c.items, "ítem", "ítems")}</small></div><div class="mono">${$(c.presupuesto)}</div><div class="mono">${$(c.real)}</div>
                <div class=${L.cx("mono", c.real > c.presupuesto && "late")}>${$(c.presupuesto - c.real)}</div><div class="inline"><${Bar} value=${c.real} max=${c.presupuesto || c.real} level=${lv} /><small>${c.presupuesto ? pct(c.real, c.presupuesto) + "%" : "—"}</small></div></button>
                ${abierto === c.capitulo && html`<div class="cap-detail">
                  ${pre.items.filter((i) => (i.capitulo || "Sin capítulo") === c.capitulo).sort((a, b) => num(a.orden) - num(b.orden)).map((i) => html`<div class="cap-item" key=${i.id}><span class="mono">${i.codigo}</span><span>${i.descripcion}</span><small>${num(i.cantidad).toLocaleString("es-CO")} ${i.unidad} × ${$(i.valorUnitario)}</small><b class="mono">${$(i.total)}</b></div>`)}
                  ${pre.costos.filter((x) => (x.capitulo || "Sin capítulo") === c.capitulo).map((x) => html`<button type="button" class="cap-item cost" key=${x.id} onClick=${() => F.costo(pid, x.id)}><span class="mono">${x.fecha}</span><span>${x.descripcion}${x.proveedor ? " · " + x.proveedor : ""}</span><small>${x.factura || ""}</small><b class="mono">${$(x.valor)}</b></button>`)}
                </div>`}<//>`;
            })}</div>` : html`<p class="note">Importa el presupuesto desde Excel. El lector encuentra solo las columnas de capítulo, ítem, descripción, unidad, cantidad, valor unitario y total; puedes corregirlas antes de importar. Después registra o importa los costos reales para comparar.</p>`}
        <//>
      </div>`}`;
  }

  function Flujo() {
    const s = L.useStore();
    const meses = G().flujoMeses(2, 9);
    const movs = [...s.flujo].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 60);
    return html`<div class="toolbar"><span class="muted light">Incluye los cobros (pagados y esperados), los pagos a proveedores, los gastos fijos y los movimientos que registres o importes.</span><span class="spacer"></span>
        <button type="button" class="btn" onClick=${() => L.openSheet("g-import", null, { kind: "flujo" })}>Importar flujo</button>
        <button type="button" class="btn primary" onClick=${() => F.flujo()}><${Icon} name="plus" size=${12} /> Movimiento</button></div>
      <div class="grid">
        <${L.Panel} title="Por mes" cls="span-12"><${FlujoChart} meses=${meses} /><p class="legend"><i class="lg ing"></i>Ingresos <i class="lg egr"></i>Egresos · claro = proyectado</p>
          <div class="flujo-table">
            <div class="fl-row head"><div>Mes</div><div>Ingresos</div><div>Egresos</div><div>Neto</div><div>Saldo</div></div>
            ${meses.map((m) => html`<div class="fl-row" key=${m.key}><div>${m.label}</div><div class="mono">${$(m.ing + m.ingP)}${m.ingP ? html`<small> (${$(m.ingP)} proy.)</small>` : ""}</div><div class="mono">${$(m.egr + m.egrP)}${m.egrP ? html`<small> (${$(m.egrP)} proy.)</small>` : ""}</div><div class=${L.cx("mono", m.ing + m.ingP - m.egr - m.egrP < 0 && "late")}>${$(m.ing + m.ingP - m.egr - m.egrP)}</div><div class=${L.cx("mono", m.saldo < 0 && "late")}><b>${$(m.saldo)}</b></div></div>`)}
          </div>
          ${!G().cfg().saldoInicial && html`<p class="note">Pon el saldo inicial de caja en Ajustes para que el saldo sea el real.</p>`}
        <//>
        <${L.Panel} title="Movimientos registrados" cls="span-12">
          <div class="rows">${movs.length ? movs.map((m) => html`<div class="row" key=${m.id} onClick=${() => F.flujo(m.id)}><span class=${"lvl " + (m.tipo === "ingreso" ? "baja" : "media")}></span>
            <div class="row-main"><div class="row-title">${m.concepto}</div><div class="row-meta"><span>${m.categoria || (m.tipo === "ingreso" ? "Ingreso" : "Egreso")}</span>${m.proyecto && html`<span>${pname(m.proyecto)}</span>`}<span>${m.estado === "real" ? "Real" : "Proyectado"}</span></div></div>
            <div class="row-side"><b class=${L.cx("mono", m.tipo === "egreso" && "neg")}>${m.tipo === "egreso" ? "−" : "+"}${$(m.valor)}</b><span class="mono muted">${m.fecha}</span></div></div>`) : html`<p class="note">Sin movimientos todavía.</p>`}</div>
        <//>
      </div>`;
  }

  function Gastos() {
    const s = L.useStore();
    const per = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
    const list = [...s.gastosFijos].sort((a, b) => num(b.valor) / (per[b.periodicidad] || 1) - num(a.valor) / (per[a.periodicidad] || 1));
    const byCat = CATS.map((c) => ({ ...c, v: list.filter((g) => g.categoria === c.id && g.activo !== false).reduce((a, g) => a + num(g.valor) / (per[g.periodicidad] || 1), 0) })).filter((c) => c.v);
    const total = G().fijosMes();
    return html`<div class="toolbar"><span class="muted light">Lo que cuesta la oficina cada mes. Se reparte entre las horas trabajadas para calcular la rentabilidad real de cada proyecto.</span><span class="spacer"></span><button type="button" class="btn primary" onClick=${() => F.gasto()}><${Icon} name="plus" size=${12} /> Gasto fijo</button></div>
      <div class="grid">
        <div class="glass metrics span-12 money four" role="list">
          <div class="metric"><b>${$(total)}</b><span>Al mes</span></div><div class="metric"><b>${$(total * 12)}</b><span>Al año</span></div>
          <div class="metric"><b>${$(G().tasaFijos())}</b><span>Por hora trabajada</span></div><div class="metric"><b>${list.filter((g) => g.activo !== false).length}</b><span>Gastos activos</span></div>
        </div>
        <${L.Panel} title="Gastos" cls="span-8"><div class="rows">${list.length ? list.map((g) => html`<div class=${L.cx("row", g.activo === false && "muted")} key=${g.id} onClick=${() => F.gasto(g.id)}><span class="lvl baja"></span>
          <div class="row-main"><div class="row-title">${g.concepto}</div><div class="row-meta"><span>${(CATS.find((c) => c.id === g.categoria) || {}).label}</span><span>${g.periodicidad}${g.diaPago ? " · día " + g.diaPago : ""}</span>${g.activo === false && html`<span>Inactivo</span>`}</div></div>
          <div class="row-side"><b class="mono">${$(g.valor)}</b><small class="muted">${g.periodicidad !== "mensual" ? $(num(g.valor) / (per[g.periodicidad] || 1)) + " al mes" : ""}</small></div></div>`) : html`<p class="note">Agrega arriendo, servicios, nómina, software, contador… Con esto la rentabilidad de cada proyecto incluye lo que cuesta tener la oficina.</p>`}</div><//>
        <${L.Panel} title="Por categoría" cls="span-4"><div class="rent-list">${byCat.map((c) => html`<div class="rent-row" key=${c.id}><span>${c.label}</span><${Bar} value=${c.v} max=${total} /><b class="mono">${pct(c.v, total)}%</b></div>`)}</div><//>
      </div>`;
  }

  function Horas() {
    const s = L.useStore();
    const now = new Date();
    const [mes, setMes] = useState(0); // 0 este mes, -1 el anterior…
    const d0 = new Date(now.getFullYear(), now.getMonth() + mes, 1), d1 = new Date(now.getFullYear(), now.getMonth() + mes + 1, 0);
    const desde = L.iso(d0), hasta = L.iso(d1);
    const rows = G().tiemposDe({ desde, hasta });
    const k = 1 + G().recargo() / 100;
    const people = q().staff().filter((u) => u.role !== "pantalla" && u.role !== "maestro");
    const byUser = people.map((u) => { const r = rows.filter((x) => x.user === u.id); const n = r.reduce((a, x) => a + x.normal, 0), e = r.reduce((a, x) => a + x.extra, 0); return { u, n, e, costo: G().tarifa(u.id) * (n + e * k) }; });
    const pids = [...new Set(rows.map((r) => r.proyecto).filter(Boolean))];
    const byProj = pids.map((pid) => { const r = rows.filter((x) => x.proyecto === pid); const n = r.reduce((a, x) => a + x.normal, 0), e = r.reduce((a, x) => a + x.extra, 0); return { pid, n, e, costo: G().costoHoras(r), r: G().rentabilidad(pid) }; }).sort((a, b) => b.n + b.e - a.n - a.e);
    const capacidad = G().horasMes(d0.getFullYear(), d0.getMonth());
    const [ver, setVer] = useState("");
    return html`<div class="toolbar">
        <button type="button" class="btn sm ghost" onClick=${() => setMes(mes - 1)} aria-label="Mes anterior"><${Icon} name="left" /></button>
        <b>${L.cap(L.MES_L[d0.getMonth()])} ${d0.getFullYear()}</b>
        <button type="button" class="btn sm ghost" disabled=${mes >= 0} onClick=${() => setMes(mes + 1)} aria-label="Mes siguiente"><${Icon} name="right" /></button>
        <span class="muted light">Horario: ${G().cfg().inicio} a ${G().cfg().fin} · ${h1(capacidad)} h de oficina en el mes por persona${G().recargo() ? " · hora extra +" + G().recargo() + "%" : " · falta el recargo de hora extra (Ajustes)"}</span>
      </div>
      <div class="grid">
        <${L.Panel} title="Por persona" cls="span-12">
          <div class="h-table"><div class="h-row head"><div>Persona</div><div>En horario</div><div>Extra</div><div>% del mes</div><div>Costo hora</div><div>Costo del mes</div></div>
          ${byUser.map((x) => html`<div class="h-row" key=${x.u.id}>
            <button type="button" class="t link" onClick=${() => setVer(ver === x.u.id ? "" : x.u.id)}><${L.Avatar} id=${x.u.id} /> ${x.u.name}</button>
            <div class="mono">${h1(x.n)} h</div><div class=${L.cx("mono", x.e > 0 && "late")}>${h1(x.e)} h</div>
            <div><${Bar} value=${x.n} max=${capacidad} /><small>${pct(x.n, capacidad)}%</small></div>
            <button type="button" class="mono link" onClick=${() => { const t = s.tarifas.find((y) => y.user === x.u.id); F.tarifa(x.u.id, t ? t.id : null); }}>${G().tarifa(x.u.id) ? $(G().tarifa(x.u.id)) : "Poner"}</button>
            <div class="mono">${$(x.costo)}</div>
          </div>
          ${ver === x.u.id && html`<div class="h-detail">${G().tiemposDe({ user: x.u.id, desde, hasta }).sort((a, b) => b.fecha.localeCompare(a.fecha)).map((r) => html`<button type="button" class="cap-item" key=${r.id} onClick=${() => !r.manual && F.tiempo(r.id)}>
              <span class="mono">${r.fecha}</span><span>${pname(r.proyecto)}${r.tarea && q().task(r.tarea) ? " · " + q().task(r.tarea).title : ""}${r.nota ? " · " + r.nota : ""}</span><small>${r.auto ? "automático" : "a mano"}</small><b class="mono">${h1(r.normal)} h${r.extra ? html` <span class="late">+${h1(r.extra)} extra</span>` : ""}</b></button>`)}
            <button type="button" class="btn sm" onClick=${() => F.tiempo(null, { user: x.u.id })}><${Icon} name="plus" size=${12} /> Registrar tiempo a mano</button></div>`}`)}
          </div>
        <//>
        <${L.Panel} title="Por proyecto" cls="span-12">
          <div class="h-table"><div class="h-row head p"><div>Proyecto</div><div>En horario</div><div>Extra</div><div>Costo del equipo</div><div>Horas del presupuesto</div></div>
          ${byProj.map((x) => html`<a class="h-row p" key=${x.pid} href=${"#proyecto/" + x.pid + "/finanzas"}><div class="t">${pname(x.pid)}</div><div class="mono">${h1(x.n)} h</div><div class=${L.cx("mono", x.e > 0 && "late")}>${h1(x.e)} h</div><div class="mono">${$(x.costo)}</div>
            <div>${x.r.horasPresupuesto ? html`<${Bar} value=${x.r.hNormal + x.r.hExtra} max=${x.r.horasPresupuesto} level=${x.r.hNormal + x.r.hExtra > x.r.horasPresupuesto ? "rojo" : "verde"} /><small>${pct(x.r.hNormal + x.r.hExtra, x.r.horasPresupuesto)}% (todo el proyecto)</small>` : html`<small class="muted">Sin presupuesto de horas</small>`}</div></a>`)}
          ${!byProj.length && html`<p class="note">Las horas se cuentan solas mientras cada persona tiene una tarea marcada con «Estoy trabajando en esto» y la app abierta. Fuera del horario, en el almuerzo o el fin de semana cuentan como extra.</p>`}</div>
        <//>
      </div>`;
  }

  function Ajustes() {
    const s = L.useStore();
    const c = G().cfg();
    const [f, setF] = useState(c);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    const save = async () => {
      const rec = s.ajustes.find((a) => a.clave === "gestion");
      const valor = { ...f, recargoExtra: f.recargoExtra === "" || f.recargoExtra === null ? null : num(f.recargoExtra), saldoInicial: num(f.saldoInicial), margenObjetivo: num(f.margenObjetivo) };
      if (await act().save("ajustes", rec ? rec.id : null, { clave: "gestion", valor })) L.toast("Ajustes guardados");
    };
    const people = q().staff().filter((u) => u.role !== "pantalla");
    return html`<div class="grid">
      <${L.Panel} title="Horario de la oficina" cls="span-6">
        <div class="two"><${L.Field} label="Entrada" id="ga-i"><input id="ga-i" type="time" value=${f.inicio} onInput=${set("inicio")} /><//><${L.Field} label="Salida" id="ga-f"><input id="ga-f" type="time" value=${f.fin} onInput=${set("fin")} /><//></div>
        <div class="two"><${L.Field} label="Almuerzo lunes a jueves: desde" id="ga-ai"><input id="ga-ai" type="time" value=${f.almuerzoIni} onInput=${set("almuerzoIni")} /><//><${L.Field} label="Hasta" id="ga-af"><input id="ga-af" type="time" value=${f.almuerzoFin} onInput=${set("almuerzoFin")} /><//></div>
        <p class="note">El viernes el almuerzo es de una hora, de 12 a 1 o de 1 a 2, según el turno de cada persona (abajo).</p>
      <//>
      <${L.Panel} title="Costos" cls="span-6">
        <${L.Field} label="Recargo de la hora extra (%)" id="ga-r" hint="Cuánto más cuesta una hora fuera del horario. Déjalo vacío si aún no lo defines."><input id="ga-r" type="number" min="0" step="1" value=${f.recargoExtra === null ? "" : f.recargoExtra} onInput=${set("recargoExtra")} placeholder="Ej.: 25" /><//>
        <${L.Field} label="Margen objetivo por defecto (%)" id="ga-m"><input id="ga-m" type="number" min="0" max="100" value=${f.margenObjetivo} onInput=${set("margenObjetivo")} /><//>
        <label class="check"><input type="checkbox" checked=${!!f.incluirFijos} onChange=${set("incluirFijos")} /><span><b>Repartir los gastos fijos en los proyectos</b><small>Cada hora trabajada carga su parte del arriendo, la nómina y los servicios.</small></span></label>
      <//>
      <${L.Panel} title="Caja" cls="span-6">
        <div class="two"><${L.Field} label="Saldo inicial de caja" id="ga-s"><input id="ga-s" type="number" step="1000" value=${f.saldoInicial} onInput=${set("saldoInicial")} /><//><${L.Field} label="A la fecha" id="ga-sf"><input id="ga-sf" type="date" value=${f.saldoFecha} onInput=${set("saldoFecha")} /><//></div>
      <//>
      <${L.Panel} title="Turno de almuerzo del viernes" cls="span-6">
        <div class="share-list">${people.map((u) => html`<div class="share-row" key=${u.id}><${L.Avatar} id=${u.id} /><span class="share-name"><b>${u.name}</b></span>
          ${u.id === s.me.id || q().isDirector() ? html`<${L.Seg} label=${"Turno de " + u.name} value=${u.almuerzoViernes || "12"} onChange=${(v) => (u.id === s.me.id ? act().saveUser(u.id, { almuerzoViernes: v }) : act().save("users", u.id, { almuerzoViernes: v }))} options=${[{ id: "12", label: "12 a 1" }, { id: "13", label: "1 a 2" }]} />` : html`<span class="tag">${u.almuerzoViernes === "13" ? "1 a 2" : "12 a 1"}</span>`}</div>`)}</div>
        <p class="note">Cada persona elige su turno en su perfil. Dirección también puede cambiarlo aquí.</p>
      <//>
      <div class="span-12 inline"><button type="button" class="btn primary" onClick=${save}>Guardar ajustes</button></div>
    </div>`;
  }

  /* ---------- pestaña Finanzas del proyecto ---------- */
  function FinanzasProyecto({ project }) {
    const s = L.useStore();
    const pid = project.id;
    const fin = q().isFin();
    const f = G().finOf(pid);
    const sem = G().semaforo(pid);
    const cl = sem.cl, r = sem.r;
    const pr = G().proveedores(pid);
    const [abierto, setAbierto] = useState("");
    const k = 1 + G().recargo() / 100;
    const rows = G().tiemposDe({ proyecto: pid });
    const people = [...new Set(rows.map((x) => x.user))].map((u) => { const rr = rows.filter((x) => x.user === u); const n = rr.reduce((a, x) => a + x.normal, 0), e = rr.reduce((a, x) => a + x.extra, 0); return { u, n, e, costo: G().tarifa(u) * (n + e * k) }; }).sort((a, b) => b.n + b.e - a.n - a.e);
    return html`<div class="grid">
      <div class="span-12"><${Semaforo} pid=${pid} /></div>
      ${fin && html`<div class="span-12 toolbar"><span class="muted light">${f ? `Contrato ${$(f.valorContrato)} · ${f.horasPresupuesto ? f.horasPresupuesto + " h presupuestadas" : "sin presupuesto de horas"}` : "Pon el valor del contrato y las horas presupuestadas para medir este proyecto."}</span><span class="spacer"></span>
        <button type="button" class="btn" onClick=${() => F.pfin(pid, f && f.id)}><${Icon} name="edit" /> Datos del proyecto</button>
        <button type="button" class="btn" onClick=${() => L.openSheet("g-import", null, { kind: "presupuesto", proyecto: pid })}>Importar presupuesto</button></div>`}
      <${L.Panel} title="Cliente" cls="span-12" action=${fin && html`<button type="button" class="btn sm primary" onClick=${() => L.openTool("cobros", null, { project: pid })}><${Icon} name="plus" size=${12} /> Cobro</button>`}>
        <div class="glass metrics money five" role="list">
          <div class="metric"><b>${$(cl.contrato)}</b><span>Contrato</span></div>
          <div class="metric"><b>${$(cl.pagado)}</b><span>Ha pagado</span></div>
          <div class=${L.cx("metric", cl.vencido ? "alert" : cl.debe ? "" : "zero")}><b>${$(cl.debe)}</b><span>Nos debe${cl.vencido ? " · " + $(cl.vencido) + " vencido" : ""}</span></div>
          <div class="metric"><b>${$(cl.facturado)}</b><span>Facturado</span></div>
          <div class=${L.cx("metric", cl.porFacturar ? "" : "zero")}><b>${$(cl.porFacturar)}</b><span>Falta por facturar</span></div>
        </div>
        <div class="rows">${cl.cobros.length ? [...cl.cobros].sort((a, b) => (a.fechaEsperada || "").localeCompare(b.fechaEsperada || "")).map((c) => html`<div class=${L.cx("row", !fin && "static")} key=${c.id} onClick=${fin ? () => L.openTool("cobros", c.id) : null}>
          <span class=${"glyph " + (c.estado === "pagado" ? "fill" : "")} data-s=${c.estado === "pagado" ? "terminado" : c.estado === "facturado" ? "en_curso" : "pendiente"}></span>
          <div class="row-main"><div class="row-title">${c.concepto}</div><div class="row-meta"><span>${L.labelOf(L.COBRO_ESTADOS, c.estado)}${c.factura ? " · factura " + c.factura : ""}</span></div></div>
          <div class="row-side"><b class="mono">${$(c.valor)}</b><span class=${L.cx("due", c.estado !== "pagado" && c.fechaEsperada && c.fechaEsperada < L.todayIso() && "late")}>${c.estado === "pagado" && c.fechaPago ? "Pagado " + L.fmtShort(c.fechaPago) : c.fechaEsperada ? L.relDay(c.fechaEsperada) : ""}</span></div>
        </div>`) : html`<p class="note">Los cobros al cliente por hitos: anticipo, actas de avance, entregas.</p>`}</div>
      <//>
      <${L.Panel} title="Proveedores" cls="span-12" action=${fin && html`<button type="button" class="btn sm primary" onClick=${() => F.contrato(pid)}><${Icon} name="plus" size=${12} /> Contrato</button>`}>
        <div class="glass metrics money five" role="list">
          <div class="metric"><b>${$(pr.valor)}</b><span>Contratos</span></div>
          <div class="metric"><b>${$(pr.adicionales)}</b><span>Adicionales aprobados</span></div>
          <div class="metric"><b>${$(pr.total)}</b><span>Total</span></div>
          <div class="metric"><b>${$(pr.pagado)}</b><span>Pagado</span></div>
          <div class=${L.cx("metric", pr.debe ? "" : "zero")}><b>${$(pr.debe)}</b><span>Les debemos</span></div>
        </div>
        <div class="prov-table">
          ${pr.list.length ? html`<div class="prov-row head"><div>Proveedor</div><div>Contrato</div><div>Pagado</div><div>Debemos</div><div>Adicionales</div><div>Pagado adic.</div><div>Debemos adic.</div></div>` : ""}
          ${pr.list.map((x) => html`<${L.Fragment} key=${x.c.id}>
            <button type="button" class="prov-row" onClick=${() => setAbierto(abierto === x.c.id ? "" : x.c.id)}>
              <div class="t"><b>${x.c.proveedorNombre}</b><small>${x.c.objeto}${x.c.estado === "terminado" ? " · terminado" : ""}</small></div>
              <div class="mono">${$(x.valor)}</div><div class="mono">${$(x.pagadoBase)}</div><div class="mono">${$(x.debeBase)}</div>
              <div class="mono ad">${x.adicionales ? $(x.adicionales) : "—"}${x.adicionalesPend ? html`<small> +${$(x.adicionalesPend)} sin aprobar</small>` : ""}</div><div class="mono ad">${x.pagadoAd ? $(x.pagadoAd) : "—"}</div><div class="mono ad">${x.adicionales ? $(x.debeAd) : "—"}</div>
            </button>
            ${abierto === x.c.id && html`<div class="prov-detail">
              ${fin && html`<div class="inline wrap"><button type="button" class="btn sm" onClick=${() => F.pago(x.c.id)}><${Icon} name="plus" size=${12} /> Pago</button><button type="button" class="btn sm" onClick=${() => F.adicional(x.c.id)}><${Icon} name="plus" size=${12} /> Adicional</button><button type="button" class="btn sm" onClick=${() => F.pago(x.c.id, null, true)}><${Icon} name="plus" size=${12} /> Pago de adicional</button><button type="button" class="btn sm ghost" onClick=${() => F.contrato(pid, x.c.id)}><${Icon} name="edit" /> Contrato</button></div>`}
              <div class="two">
                <div><span class="lbl">Pagos</span>${x.pagos.length ? [...x.pagos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((p) => html`<button type="button" class="cap-item" key=${p.id} onClick=${() => fin && F.pago(x.c.id, p.id)}><span class="mono">${p.fecha}</span><span>${p.concepto || "Pago"}${p.adicional ? " · adicional" : ""}${p.factura ? " · " + p.factura : ""}</span><b class="mono">${$(p.valor)}</b></button>`) : html`<p class="note">Sin pagos.</p>`}</div>
                <div><span class="lbl">Adicionales (aparte del contrato)</span>${x.ad.length ? x.ad.map((a) => html`<button type="button" class="cap-item" key=${a.id} onClick=${() => fin && F.adicional(x.c.id, a.id)}><span class="mono">${a.fecha || ""}</span><span>${a.descripcion}</span><small>${a.aprobado ? "Aprobado" : "Sin aprobar"}</small><b class="mono">${$(a.valor)}</b></button>`) : html`<p class="note">Sin adicionales.</p>`}</div>
              </div>
            </div>`}<//>`)}
          ${!pr.list.length && html`<p class="note">El cliente le paga al estudio el 100% de la obra y el estudio les paga a los proveedores. Registra aquí cada contrato, sus pagos y, aparte, sus adicionales.</p>`}
        </div>
      <//>
      <${L.Panel} title="Presupuesto y costos" cls="span-6" action=${html`<a class="btn sm ghost" href="#gestion/presupuesto">Detalle</a>`}>
        ${sem.pre.presupuesto || sem.pre.real ? html`<div class="rent-list">
          <div class="rent-row"><span>Presupuesto</span><${Bar} value=${sem.pre.presupuesto} max=${Math.max(sem.pre.presupuesto, sem.pre.real)} /><b class="mono">${$(sem.pre.presupuesto)}</b></div>
          <div class="rent-row"><span>Gastado</span><${Bar} value=${sem.pre.real} max=${Math.max(sem.pre.presupuesto, sem.pre.real)} level=${sem.dims[2].level} /><b class="mono">${$(sem.pre.real)}</b></div></div>` : html`<p class="note">Importa el presupuesto desde Excel y registra los costos para ver la ejecución.</p>`}
      <//>
      <${L.Panel} title="Rentabilidad" cls="span-6">
        <div class="rent-calc">
          <div><span>Contrato con el cliente</span><b class="mono">${$(r.ingresos)}</b></div>
          <div><span>Obra y proveedores</span><b class="mono">− ${$(r.obra)}</b></div>
          <div><span>Horas del equipo${r.hExtra ? ` (incluye ${h1(r.hExtra)} h extra)` : ""}</span><b class="mono">− ${$(r.equipo)}</b></div>
          ${G().cfg().incluirFijos && html`<div><span>Parte de los gastos fijos</span><b class="mono">− ${$(r.fijos)}</b></div>`}
          <div class="tot"><span>Utilidad estimada</span><b class=${L.cx("mono", r.utilidad < 0 && "late")}>${$(r.utilidad)}${r.margen !== null ? html` <small>(${Math.round(r.margen)}%)</small>` : ""}</b></div>
        </div>
      <//>
      <${L.Panel} title="Horas del equipo" cls="span-12" action=${html`<span class="tag">${h1(r.hNormal)} h en horario · ${h1(r.hExtra)} h extra${r.horasPresupuesto ? " · de " + r.horasPresupuesto + " h" : ""}</span>`}>
        ${people.length ? html`<div class="h-table">${people.map((x) => html`<div class="h-row p" key=${x.u}><div class="t"><${L.Avatar} id=${x.u} /> ${q().name(x.u)}</div><div class="mono">${h1(x.n)} h</div><div class=${L.cx("mono", x.e > 0 && "late")}>${h1(x.e)} h extra</div><div class="mono">${fin ? $(x.costo) : ""}</div><div></div></div>`)}</div>`
          : html`<p class="note">Las horas se cuentan solas cuando alguien marca una tarea de este proyecto con «Estoy trabajando en esto». Las de después de las 6, antes de las 8:45, en el almuerzo o el fin de semana cuentan como extra y le cuestan más al proyecto.</p>`}
      <//>
    </div>`;
  }

  L.EXTRA_SHEETS = { ...(L.EXTRA_SHEETS || {}), "g-form": GForm, "g-import": ImportSheet };
  Object.assign(L, { Gestion, FinanzasProyecto, Semaforo, Luz, gParseNum: parseNum, gParseDate: parseDate });
})();
