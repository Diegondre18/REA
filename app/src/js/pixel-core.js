// Dibujo de los muñecos en pixel art, sin dependencias: lo usan la app y la burbuja de escritorio.
(() => {
  "use strict";
  const GENEROS = [{ id: "hombre", label: "Hombre" }, { id: "mujer", label: "Mujer" }];
  const PEINADOS = {
    hombre: [{ id: "corto", label: "Corto" }, { id: "rapado", label: "Rapado" }, { id: "rizado", label: "Rizado" }, { id: "largo", label: "Largo" }],
    mujer: [{ id: "largo", label: "Largo" }, { id: "coleta", label: "Coleta" }, { id: "bob", label: "Melena corta" }, { id: "rizado", label: "Rizado" }],
  };
  const PELO = [
    { id: "#2b2220", label: "Negro" }, { id: "#5a3825", label: "Castaño" }, { id: "#8a5a35", label: "Castaño claro" }, { id: "#d9b25f", label: "Rubio" },
    { id: "#b4532a", label: "Pelirrojo" }, { id: "#9a9a9a", label: "Gris" }, { id: "#d97aa6", label: "Rosado" }, { id: "#4b6fd1", label: "Azul" },
  ];
  const PIEL = [{ id: "#f3d5b5", label: "Muy clara" }, { id: "#e2b48c", label: "Clara" }, { id: "#c68e62", label: "Media" }, { id: "#9b6a43", label: "Morena" }, { id: "#6e4a2e", label: "Oscura" }];
  const ROPA = [
    { id: "#0057ff", label: "Azul LAP" }, { id: "#ea0029", label: "Rojo" }, { id: "#1f9d55", label: "Verde" }, { id: "#f08c00", label: "Naranja" },
    { id: "#7c4dff", label: "Morado" }, { id: "#0e9aa7", label: "Turquesa" }, { id: "#e8c100", label: "Amarillo" }, { id: "#e0569b", label: "Rosado" },
    { id: "#8b5a2b", label: "Café" }, { id: "#2d2f36", label: "Negro" }, { id: "#e9e6e1", label: "Blanco" }, { id: "#8a8f98", label: "Gris" },
    { id: "#1f3a68", label: "Azul oscuro" }, { id: "#6b7a2f", label: "Verde oliva" }, { id: "#7a1f3d", label: "Vino" }, { id: "#5fb4ff", label: "Celeste" },
  ];
  const OUT = "#2a2228", PANTS = "#3b3f4a", SHOES = "#202227", EYE = "#2a2228";

  const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (c, k) => { const [r, g, b] = hex(c); const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

  // Muñeco por defecto para quien aún no arma el suyo: pelo y piel según su id, ropa gris neutra.
  function defaults(u) {
    const id = (u && u.id) || "x";
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { genero: h % 2 ? "mujer" : "hombre", peinado: h % 2 ? "largo" : "corto", pelo: PELO[h % 5].id, piel: PIEL[(h >>> 3) % PIEL.length].id, ropa: "#b9b4ae", generico: true };
  }
  function config(u) {
    const m = u && u.muneco;
    if (m && typeof m === "object" && m.ropa) return { ...defaults(u), ...m, generico: false };
    return defaults(u);
  }

  // Piezas del muñeco en una caja de 12×21 pixeles; los pies quedan en y = 20.
  function parts(cfg, view, frame, seated) {
    const s = cfg.piel, sS = shade(cfg.piel, 0.14), c = cfg.ropa, cS = shade(cfg.ropa, 0.22), h = cfg.pelo, hS = shade(cfg.pelo, 0.25);
    const out = [];
    const r = (x, y, w, hh, col) => out.push([x, y, w, hh, col]);
    const step = frame === 1 ? 1 : 0, step2 = frame === 3 ? 1 : 0;
    if (!seated) {
      r(4, 16, 2, 4 - step, PANTS); r(6, 16, 2, 4 - step2, PANTS);
      r(4, 20 - step, 2, 1, SHOES); r(6, 20 - step2, 2, 1, SHOES);
    }
    const narrow = cfg.genero === "mujer";
    r(narrow ? 3 : 2, 10, narrow ? 6 : 8, 2, c); r(3, 12, 6, 4, c); r(8, 11, 1, 5, cS);
    if (cfg.pose === "estira") { r(2, 6, 1, 5, c); r(9, 6, 1, 5, c); r(2, 5, 1, 1, s); r(9, 5, 1, 1, s); }
    else { r(2, 12 - step2, 1, 3, c); r(9, 12 - step, 1, 3, c); r(2, 15 - step2, 1, 1, s); r(9, 15 - step, 1, 1, s); }
    r(5, 9, 2, 1, sS);
    r(3, 3, 6, 6, s);
    const st = cfg.peinado;
    if (view === "front") {
      r(4, 6, 1, 1, EYE); r(7, 6, 1, 1, EYE); r(5, 8, 2, 1, sS);
      if (st === "rapado") { r(3, 2, 6, 1, h); r(3, 3, 1, 1, hS); r(8, 3, 1, 1, hS); }
      else if (st === "rizado") { r(3, 1, 6, 1, h); r(2, 2, 8, 2, h); r(2, 4, 1, 2, h); r(9, 4, 1, 2, h); r(3, 4, 1, 1, hS); r(8, 4, 1, 1, hS); r(4, 1, 1, 1, hS); r(7, 2, 1, 1, hS); }
      else if (st === "largo") { r(3, 2, 6, 2, h); r(2, 3, 1, 8, h); r(9, 3, 1, 8, h); r(3, 4, 1, 2, hS); r(8, 4, 1, 2, hS); }
      else if (st === "coleta") { r(3, 2, 6, 2, h); r(3, 4, 1, 1, hS); r(8, 4, 1, 1, hS); r(9, 3, 2, 2, h); r(10, 5, 1, 4, hS); }
      else if (st === "bob") { r(3, 2, 6, 2, h); r(2, 3, 1, 5, h); r(9, 3, 1, 5, h); r(3, 4, 1, 1, hS); r(8, 4, 1, 1, hS); }
      else { r(3, 2, 6, 2, h); r(3, 4, 1, 1, h); r(8, 4, 1, 1, h); r(4, 2, 2, 1, hS); }
    } else {
      r(3, 2, 6, 6, h); r(4, 3, 4, 1, hS);
      if (st === "largo") { r(2, 3, 8, 8, h); r(3, 9, 6, 2, hS); }
      else if (st === "coleta") { r(5, 8, 2, 4, hS); r(5, 7, 2, 1, h); }
      else if (st === "bob") { r(2, 3, 8, 5, h); }
      else if (st === "rizado") { r(2, 1, 8, 6, h); r(3, 2, 1, 1, hS); r(7, 4, 1, 1, hS); }
      else if (st === "rapado") { r(3, 2, 6, 6, hS); }
    }
    // Accesorios según el estado: audífonos (no molestar), taza (almuerzo), libreta (reunión).
    const ex = cfg.extra;
    // Gorra: premio del muñeco (los audífonos van por encima si está en No molestar).
    if (cfg.gorra && ex !== "audifonos") { r(3, 1, 6, 2, "#ea0029"); r(view === "front" ? (cfg.flipCap ? 1 : 7) : 3, 3, view === "front" ? 4 : 6, 1, view === "front" ? "#b8001f" : "#ea0029"); }
    if (ex === "audifonos") { r(3, 1, 6, 1, "#2d2f36"); r(2, 2, 1, 2, "#2d2f36"); r(9, 2, 1, 2, "#2d2f36"); r(1, 4, 2, 3, "#3a3d46"); r(9, 4, 2, 3, "#3a3d46"); r(1, 5, 1, 1, "#ff5a6e"); r(10, 5, 1, 1, "#ff5a6e"); }
    else if (ex === "taza" && view === "front") { r(9, 12, 2, 3, "#f4f1ea"); r(11, 13, 1, 1, "#f4f1ea"); r(9, 12, 2, 1, "#8b5a2b"); }
    else if (ex === "libreta" && view === "front") { r(9, 12, 2, 3, "#5c7fb8"); r(9, 12, 2, 1, "#f4f1ea"); }
    return out;
  }
  // Accesorio que lleva cada estado.
  const EXTRA = { no_molestar: "audifonos", almuerzo: "taza", reunion: "libreta" };
  // Accesorio del estado, gorra si la ganó y, en pausa, alterna estirarse (t = tiempo en ms).
  const withExtra = (cfg, presencia, premios, t) => {
    const out = { ...cfg };
    if (EXTRA[presencia]) out.extra = EXTRA[presencia];
    if (Array.isArray(premios) && premios.includes("gorra")) out.gorra = true;
    if (presencia === "pausa" && t !== undefined && Math.floor(t / 900) % 2 === 0) out.pose = "estira";
    return out;
  };
  // Dibuja con contorno de 1 pixel: primero la silueta oscura, luego los colores.
  // k = tamaño de cada pixel del muñeco; ow = grosor del contorno (más fino que el pixel = más definición).
  function drawFigure(ctx, x, y, cfg, view = "front", frame = 0, seated = false, flip = false, k = 1, ow = 1) {
    const ps = parts(cfg, view, frame, seated);
    const X = (px, w) => x + (flip ? 12 - px - w : px) * k;
    ctx.fillStyle = OUT;
    for (const [px, py, w, hh] of ps) ctx.fillRect(X(px, w) - ow, y + py * k - ow, w * k + 2 * ow, hh * k + 2 * ow);
    for (const [px, py, w, hh, col] of ps) { ctx.fillStyle = col; ctx.fillRect(X(px, w), y + py * k, w * k, hh * k); }
    // Brillo sutil en el pelo y la ropa para dar volumen sin perder el pixel.
    if (k >= 3) {
      const hl = Math.max(1, Math.round(k / 3));
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      if (view === "front") { ctx.fillRect(X(4, 2), y + 2 * k, 2 * k, hl); ctx.fillRect(X(3, 1), y + 10 * k, 3 * k, hl); }
      else ctx.fillRect(X(4, 3), y + 3 * k, 3 * k, hl);
    }
  }

  // Estados de cada persona: los usa la app, la oficina y la burbuja.
  const PRESENCIAS = [
    { id: "disponible", label: "Disponible", color: "#22a06b" },
    { id: "no_molestar", label: "No molestar", color: "#e5484d", hint: "Sin globitos ni sonido. Lo urgente pasa igual." },
    { id: "reunion", label: "En reunión", color: "#7c4dff", hint: "Tu muñeco va a la sala de juntas." },
    { id: "almuerzo", label: "Almuerzo", color: "#f08c00", hint: "Tu muñeco va a la cafetería." },
    { id: "pausa", label: "En pausa", color: "#0e9aa7", hint: "Pausa activa o descanso. Sin globitos ni sonido salvo lo urgente." },
    { id: "fuera", label: "Fuera", color: "#8a8f98", hint: "No apareces en la oficina." },
  ];
  window.PIXCORE = { PRESENCIAS, GENEROS, PEINADOS, PELO, PIEL, ROPA, OUT, shade, defaults, config, parts, drawFigure, withExtra, EXTRA };
})();
