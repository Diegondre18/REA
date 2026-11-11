// Base compartida: constantes del estudio, fechas y utilidades. Todo cuelga de window.LAP.
window.LAP = {};
(() => {
  "use strict";
  const { h, render, Fragment } = preact;
  const html = htm.bind(h);

  const AREAS = [
    { id: "arquitectura", label: "Arquitectura", short: "ARQ" },
    { id: "interior", label: "Diseño Interior", short: "INT" },
    { id: "visualizacion", label: "Visualización", short: "VIZ" },
    { id: "administracion", label: "Administración", short: "ADM" },
  ];
  const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));
  AREA.direccion = { id: "direccion", label: "Dirección Creativa", short: "DIR" };
  // Equipos para registrarse: las cuatro áreas y la Dirección creativa, que tiene un solo cupo.
  const TEAMS = [...AREAS, AREA.direccion];

  const STATUSES = [
    { id: "pendiente", label: "Por hacer" },
    { id: "en_curso", label: "En curso" },
    { id: "revision", label: "En revisión" },
    { id: "terminado", label: "Terminado" },
  ];
  const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
  // Etapas propias de Visualización dentro de "En curso".
  const STAGES = [{ id: "escena", label: "Escena" }, { id: "render", label: "Renderizando" }, { id: "post", label: "Postproducción" }];
  const STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s]));

  const KINDS = [
    { id: "diseno", label: "Diseño" }, { id: "planos", label: "Planos" }, { id: "modelado", label: "Modelado 3D" },
    { id: "render", label: "Render" }, { id: "presentacion", label: "Presentación" }, { id: "documento", label: "Documento" },
    { id: "obra", label: "Obra" }, { id: "gestion", label: "Gestión" }, { id: "otro", label: "Otro" },
  ];
  const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const KIND_AREA = { render: "visualizacion", modelado: "visualizacion", planos: "arquitectura", obra: "arquitectura", gestion: "administracion" };

  const PHASES = [
    { id: "anteproyecto", label: "Anteproyecto" }, { id: "basico", label: "Proyecto básico" }, { id: "ejecucion", label: "Proyecto de ejecución" },
    { id: "licencia", label: "Licencia" }, { id: "obra", label: "Obra" }, { id: "cerrado", label: "Cerrado" },
  ];
  const PHASE = Object.fromEntries(PHASES.map((p) => [p.id, p]));

  const EVENT_KINDS = [
    { id: "cliente", label: "Reunión con cliente" }, { id: "comite", label: "Comité interno" },
    { id: "entrega", label: "Entrega" }, { id: "interna", label: "Reunión interna" },
  ];
  const EVENT_KIND = Object.fromEntries(EVENT_KINDS.map((k) => [k.id, k]));

  const PLAN_STATUS = {
    borrador: "Borrador", en_aprobacion: "Esperando vistos buenos", aprobado: "Aprobado", reemplazado: "Reemplazado",
  };
  const ENGINES = ["V-Ray", "Corona", "D5 Render", "Lumion", "Enscape", "Twinmotion", "Unreal Engine", "Blender Cycles"];
  const RESOLUTIONS = ["1920×1080", "3840×2160", "5000×2813", "6000×4000", "7680×4320"];

  /* ---------- herramientas del estudio ---------- */
  const list = (pairs) => pairs.map(([id, label]) => ({ id, label }));
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const TRAMITE_TIPOS = list([["construccion", "Licencia de construcción"], ["modificacion", "Modificación de licencia"], ["reconocimiento", "Reconocimiento"], ["demolicion", "Demolición"], ["propiedad_horizontal", "Propiedad horizontal"], ["urbanismo", "Urbanismo"], ["otro", "Otro trámite"]]);
  const TRAMITE_ESTADOS = list([["preparacion", "En preparación"], ["radicado", "Radicado"], ["observaciones", "Con observaciones"], ["respuesta", "Respuesta enviada"], ["aprobado", "Aprobado"], ["negado", "Negado"], ["desistido", "Desistido"]]);
  const DISCIPLINAS = list([["arquitectura", "Arquitectura"], ["estructura", "Estructura"], ["hidrosanitario", "Hidrosanitario"], ["electrico", "Eléctrico"], ["interiores", "Interiores"], ["paisajismo", "Paisajismo"], ["otro", "Otra"]]);
  const PLANO_ESTADOS = list([["en_proceso", "En proceso"], ["para_revision", "Para revisión"], ["aprobado", "Aprobado"], ["emitido", "Emitido"]]);
  const ENVIO_MEDIOS = list([["correo", "Correo"], ["dropbox", "Dropbox"], ["impreso", "Impreso"], ["otro", "Otro"]]);
  const ENVIO_PROPOSITOS = list([["aprobacion", "Para aprobación"], ["informacion", "Para información"], ["construccion", "Para construcción"], ["licencia", "Para licencia"], ["cotizacion", "Para cotización"]]);
  const CONTACTO_TIPOS = list([["cliente", "Cliente"], ["proveedor", "Proveedor"], ["contratista", "Contratista"], ["consultor", "Consultor"], ["entidad", "Entidad"], ["otro", "Otro"]]);
  const MATERIAL_CATS = list([["piso", "Pisos"], ["muro", "Muros"], ["cielo", "Cielos"], ["carpinteria", "Carpintería"], ["mobiliario", "Mobiliario"], ["iluminacion", "Iluminación"], ["sanitario", "Baños"], ["cocina", "Cocina"], ["fachada", "Fachada"], ["otro", "Otros"]]);
  const AUSENCIA_TIPOS = list([["vacaciones", "Vacaciones"], ["incapacidad", "Incapacidad"], ["permiso", "Permiso"], ["fuera", "Fuera de la oficina"], ["otro", "Otro"]]);
  const SOLICITUD_TIPOS = list([["render", "Render"], ["modelado", "Modelado 3D"], ["planos", "Planos"], ["impresion", "Impresión o plotter"], ["compra", "Compra"], ["cotizacion", "Cotización"], ["otro", "Otra"]]);
  const SOLICITUD_ESTADOS = list([["nueva", "Nueva"], ["aceptada", "Aceptada"], ["lista", "Lista"], ["rechazada", "No se tomó"]]);
  const COBRO_ESTADOS = list([["pendiente", "Pendiente"], ["facturado", "Facturado"], ["pagado", "Pagado"]]);
  const SALUD = list([["verde", "En orden"], ["amarillo", "En riesgo"], ["rojo", "Atrasado"]]);
  const money = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const hours = (n) => { const v = Math.round((Number(n) || 0) * 4) / 4; return (v % 1 ? v.toLocaleString("es-CO") : String(v)) + " h"; };

  // Plantillas de plan de entregables por fase. Días contados desde la fecha de inicio que se elija.
  const PLAN_TEMPLATES = [
    { id: "anteproyecto", label: "Anteproyecto", items: [
      [0, 3, "Visita, levantamiento y programa de necesidades", "arquitectura", "diseno"],
      [3, 10, "Esquema básico: plantas y zonificación", "arquitectura", "diseno"],
      [8, 14, "Modelo volumétrico 3D", "visualizacion", "modelado"],
      [10, 14, "Concepto de interiores y moodboard", "interior", "presentacion"],
      [13, 16, "Vistas del anteproyecto", "visualizacion", "render"],
      [15, 17, "Presentación del anteproyecto al cliente", "arquitectura", "presentacion"],
    ] },
    { id: "basico", label: "Proyecto básico", items: [
      [0, 15, "Plantas, cortes y fachadas", "arquitectura", "planos"],
      [5, 15, "Modelo 3D completo", "visualizacion", "modelado"],
      [5, 18, "Propuesta de interiores y acabados", "interior", "diseno"],
      [14, 20, "Renders de presentación", "visualizacion", "render"],
      [18, 21, "Presentación del proyecto básico", "arquitectura", "presentacion"],
    ] },
    { id: "licencia", label: "Licencia", items: [
      [0, 12, "Planos arquitectónicos para licencia", "arquitectura", "planos"],
      [0, 10, "Coordinación con estructura y redes", "arquitectura", "gestion"],
      [5, 12, "Formularios, memorias y documentos", "administracion", "documento"],
      [13, 13, "Radicación en curaduría", "administracion", "gestion"],
    ] },
    { id: "ejecucion", label: "Proyecto de ejecución", items: [
      [0, 25, "Planos constructivos", "arquitectura", "planos"],
      [10, 30, "Detalles constructivos", "arquitectura", "planos"],
      [10, 25, "Especificaciones de acabados y mobiliario", "interior", "documento"],
      [20, 30, "Cantidades y presupuesto", "administracion", "gestion"],
      [28, 30, "Entrega del proyecto de ejecución", "arquitectura", "presentacion"],
    ] },
    { id: "obra", label: "Obra (primer mes)", items: [
      [0, 0, "Visita de inicio de obra", "arquitectura", "obra"],
      [7, 7, "Visita de obra semanal", "arquitectura", "obra"],
      [14, 14, "Visita de obra semanal", "arquitectura", "obra"],
      [21, 21, "Visita de obra semanal", "arquitectura", "obra"],
      [28, 28, "Informe mensual de obra", "arquitectura", "documento"],
    ] },
  ];

  /* ---------- fechas (todas como "AAAA-MM-DD" en hora local) ---------- */
  const DAY = 864e5;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const todayIso = () => iso(today());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const diff = (a, b) => Math.round((b - a) / DAY);
  const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / DAY + 1) / 7);
  };
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIAS_C = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const INI = ["D", "L", "M", "M", "J", "V", "S"];
  const fmtShort = (d) => (typeof d === "string" ? (parse(d) ? fmtShort(parse(d)) : "") : `${d.getDate()} ${MES[d.getMonth()]}`);
  const fmtDay = (s) => { const d = parse(s); return d ? `${DIAS_C[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}` : ""; };
  const fmtLong = (s) => { const d = parse(s); return d ? `${DIAS[d.getDay()]} ${d.getDate()} de ${MES_L[d.getMonth()]}` : ""; };
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const relDay = (s) => {
    const d = parse(s); if (!d) return "Sin fecha";
    const n = diff(today(), d);
    if (n === 0) return "Hoy";
    if (n === 1) return "Mañana";
    if (n === -1) return "Ayer";
    if (n < 0) return `Hace ${-n} días`;
    if (n < 7) return `En ${n} días`;
    return fmtShort(d);
  };
  const relTime = (stamp) => {
    const t = Date.parse(String(stamp || "").replace(" ", "T")); if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "hace un momento";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    const d = new Date(t);
    return diff(new Date(d.getFullYear(), d.getMonth(), d.getDate()), today()) === 1 ? "ayer" : fmtShort(d);
  };
  const dueClass = (t) => {
    const d = parse(t.due); if (!d || t.status === "terminado") return "";
    const n = diff(today(), d);
    return n < 0 ? "late" : n <= 2 ? "soon" : "";
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const first = (name) => String(name || "").trim().split(/\s+/)[0] || "";
  const key = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999");
  const cx = (...a) => a.filter(Boolean).join(" ");
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? "Buenos días" : hr < 19 ? "Buenas tardes" : "Buenas noches"; };
  const eventStamp = (e) => `${e.date} ${e.time || "00:00"}`;

  // Enlace que abre Google Calendar con la reunión ya llenada (Google le agrega el Meet al guardar).
  function calendarLink(ev, emails, details) {
    const d = parse(ev.date); if (!d) return "";
    const [hh, mm] = (ev.time || "09:00").split(":").map(Number);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0);
    const end = new Date(start.getTime() + (Number(ev.duration) || 60) * 60000);
    const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    const q = new URLSearchParams({ action: "TEMPLATE", text: ev.title || "", dates: `${f(start)}/${f(end)}`, details: details || "", location: ev.place || "" });
    if (emails && emails.length) q.set("add", emails.join(","));
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }

  Object.assign(LAP, {
    h, render, Fragment, html, hooks: preactHooks,
    AREAS, AREA, TEAMS, STATUSES, STATUS, STAGES, STAGE, KINDS, KIND, KIND_AREA, PHASES, PHASE, EVENT_KINDS, EVENT_KIND, PLAN_STATUS, ENGINES, RESOLUTIONS,
    iso, parse, today, todayIso, addDays, diff, monday, isoWeek, MES, MES_L, DIAS, DIAS_C, INI, fmtShort, fmtDay, fmtLong, cap, relDay, relTime,
    dueClass, plural, initials, first, key, byDue, cx, greeting, eventStamp, calendarLink,
    byId, TRAMITE_TIPOS, TRAMITE_ESTADOS, DISCIPLINAS, PLANO_ESTADOS, ENVIO_MEDIOS, ENVIO_PROPOSITOS, CONTACTO_TIPOS, MATERIAL_CATS,
    AUSENCIA_TIPOS, SOLICITUD_TIPOS, SOLICITUD_ESTADOS, COBRO_ESTADOS, SALUD, money, hours, PLAN_TEMPLATES,
  });
})();
