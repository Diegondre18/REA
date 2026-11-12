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
  const OUT = "#2a2228", EYE = "#231c20", PANTS = "#cbbda7", PANTS_S = "#ae9f88", SHOES = "#f4f2ee", SOLE = "#c9c4bb", SHIRT = "#f4f1ea";

  const hex = (c) => { const v = String(c).startsWith("rgb") ? c.match(/\d+/g).map(Number) : null; if (v) return v; const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (c, k) => { const [r, g, b] = hex(c); const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v * (1 - k) : v + (255 - v) * -k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

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

  // Piezas del muñeco en una cuadrícula de 24×42 (medios pixeles de la caja de 12×21 de siempre):
  // cabeza grande, pelo con volumen y brillos, buzo con sombra, camiseta asomando, pantalón y tenis.
  // Cada pieza: [x, y, ancho, alto, color, sinContorno]. Los pies quedan abajo (y = 41).
  function parts(cfg, view, frame, seated) {
    const s = cfg.piel, sS = shade(cfg.piel, 0.13), sD = shade(cfg.piel, 0.28);
    const c = cfg.ropa, cS = shade(cfg.ropa, 0.24), cH = shade(cfg.ropa, -0.18);
    const h = cfg.pelo, hS = shade(cfg.pelo, 0.3), hH = shade(cfg.pelo, -0.28);
    const out = [];
    const r = (x, y, w, hh, col) => out.push([x, y, w, hh, col, false]);
    const d = (x, y, w, hh, col) => out.push([x, y, w, hh, col, true]); // detalle interior, sin contorno
    const f1 = frame === 1 ? 1 : 0, f3 = frame === 3 ? 1 : 0;
    const woman = cfg.genero === "mujer";
    const front = view === "front";
    const st = cfg.peinado;
    const longHair = st === "largo" || (woman && st === "rizado");

    // Pelo largo por detrás de los hombros (se dibuja primero).
    if (longHair && front) { r(4, 9, 3, st === "rizado" ? 12 : 14, h); r(17, 9, 3, st === "rizado" ? 12 : 14, h); d(5, 12, 1, 7, hS); d(18, 12, 1, 7, hS); }

    // Piernas y tenis.
    if (!seated) {
      r(7, 30, 10, 2, PANTS);
      r(7, 32 - f1, 4, 6, PANTS); r(13, 32 - f3, 4, 6, PANTS);
      d(10, 32, 1, 6 - f1, PANTS_S); d(16, 32, 1, 6 - f3, PANTS_S);
      r(6, 38 - f1, 5, 3, SHOES); r(13, 38 - f3, 5, 3, SHOES);
      d(6, 40 - f1, 5, 1, SOLE); d(13, 40 - f3, 5, 1, SOLE);
    }
    // Torso: buzo con hombros, sombra a un lado, camiseta asomando abajo.
    const sh = woman ? 6 : 5, sw = woman ? 12 : 14;
    r(sh, 17, sw, 2, c);
    r(6, 19, 12, 10, c);
    d(15, 19, 2, 10, cS); d(7, 19, 3, 1, cH);
    // Textura de tejido del buzo (punteado suave).
    for (let yy = 21; yy < 28; yy += 2) for (let xx = 7 + (yy % 4 === 1 ? 1 : 0); xx < 15; xx += 3) d(xx, yy, 1, 1, cS);
    if (front) { d(9, 17, 6, 1, cS); d(10, 18, 4, 1, cS); }
    r(7, 29, 10, 1, SHIRT);
    // Brazos (mangas) y manos; al caminar se balancean; estirándose, arriba.
    if (cfg.pose === "estira") {
      r(3, 7, 3, 11, c); r(18, 7, 3, 11, c); d(5, 8, 1, 9, cS); d(20, 8, 1, 9, cS);
      r(3, 5, 3, 2, s); r(18, 5, 3, 2, s);
    } else {
      r(3, 18 + f3, 3, 10, c); r(18, 18 + f1, 3, 10, c); d(5, 19 + f3, 1, 8, cS); d(20, 19 + f1, 1, 8, cS);
      r(3, 28 + f3, 3, 2, s); r(18, 28 + f1, 3, 2, s);
    }
    // Cuello y cabeza.
    r(10, 15, 4, 3, sS);
    r(7, 4, 10, 1, s); r(6, 5, 12, 10, s); r(7, 15, 10, 1, s);
    r(5, 9, 1, 3, s); r(18, 9, 1, 3, s);
    if (front) {
      d(17, 7, 1, 7, sS); d(16, 13, 1, 2, sS);
      const look = cfg.look || 0; // -1 mira a la izquierda, 1 a la derecha (en la burbuja)
      if (cfg.blink) { d(8 + look, 11, 2, 1, EYE); d(14 + look, 11, 2, 1, EYE); }
      else {
        d(8 + look, 9, 2, 3, EYE); d(14 + look, 9, 2, 3, EYE);
        d(8 + look + (look > 0 ? 1 : 0), 9, 1, 1, "#ffffff"); d(14 + look + (look > 0 ? 1 : 0), 9, 1, 1, "#ffffff");
      }
      d(8, 7, 2, 1, hS); d(14, 7, 2, 1, hS);
      d(11 + (cfg.look || 0), 13, 2, 1, shade(cfg.piel, 0.2)); d(12 + (cfg.look || 0), 13, 1, 1, sD);
      if (woman) { d(7, 12, 1, 1, "#f2a3a0"); d(16, 12, 1, 1, "#f2a3a0"); d(7, 9, 1, 1, EYE); d(17, 9, 1, 1, EYE); }
    }

    // Peinados (de frente y de espaldas).
    if (front) {
      if (st === "rapado") { r(6, 3, 12, 2, h); r(6, 5, 1, 3, h); r(17, 5, 1, 3, h); d(8, 3, 4, 1, hH); }
      else if (st === "rizado") {
        // Volumen con borde ondulado y rizos (brillo arriba, sombra abajo de cada rizo).
        r(8, 0, 3, 1, h); r(13, 0, 3, 1, h); r(6, 1, 12, 1, h); r(4, 2, 16, 1, h); r(3, 3, 18, 3, h);
        r(2, 5, 2, 3, h); r(20, 5, 2, 3, h); r(3, 6, 4, 6, h); r(17, 6, 4, 6, h); r(4, 12, 2, 1, h); r(18, 12, 2, 1, h);
        r(7, 6, 3, 2, h); r(10, 6, 2, 1, h); r(13, 6, 3, 2, h); r(16, 6, 1, 1, h);
        const curl = (x, y) => { d(x, y, 1, 1, hH); d(x + 1, y + 1, 1, 1, hS); d(x - 1, y + 1, 1, 1, hS); };
        for (const [x, y] of [[6, 2], [10, 1], [14, 1], [18, 3], [4, 4], [9, 4], [13, 3], [16, 5], [4, 8], [19, 8], [8, 6], [14, 6], [11, 3], [5, 10], [18, 10]]) curl(x, y);
      } else if (st === "largo") {
        r(6, 2, 12, 2, h); r(5, 4, 14, 3, h); r(5, 7, 2, 3, h); r(17, 7, 2, 3, h); r(7, 7, 6, 1, h);
        d(8, 3, 5, 1, hH); d(14, 5, 3, 1, hS); d(6, 5, 1, 4, hS);
      } else if (st === "coleta") {
        r(6, 2, 12, 2, h); r(5, 4, 14, 3, h); r(5, 7, 1, 3, h); r(18, 7, 1, 3, h); r(7, 7, 5, 1, h);
        r(19, 5, 2, 2, "#ea0029"); r(19, 7, 3, 8, h); r(20, 15, 2, 3, h); d(20, 9, 1, 6, hS); d(8, 3, 5, 1, hH);
      } else if (st === "bob") {
        r(6, 2, 12, 2, h); r(5, 4, 14, 4, h); r(4, 7, 3, 9, h); r(17, 7, 3, 9, h); r(7, 8, 10, 0, h);
        d(5, 9, 1, 6, hS); d(18, 9, 1, 6, hS); d(8, 3, 6, 1, hH);
      } else { // corto
        r(6, 2, 12, 2, h); r(5, 4, 14, 3, h); r(5, 7, 2, 3, h); r(17, 7, 2, 3, h);
        r(7, 7, 2, 1, h); r(10, 7, 3, 1, h); r(14, 7, 2, 1, h);
        d(8, 3, 4, 1, hH); d(13, 5, 1, 1, hS); d(16, 4, 1, 2, hS);
      }
    } else {
      // De espaldas: el pelo tapa la cabeza.
      const big = st === "rizado";
      r(big ? 4 : 5, big ? 1 : 2, big ? 16 : 14, big ? 15 : 14, h);
      if (big) {
        r(2, 4, 2, 8, h); r(20, 4, 2, 8, h); r(8, 0, 3, 1, h); r(13, 0, 3, 1, h);
        for (const [x, y] of [[6, 3], [10, 2], [14, 4], [17, 7], [7, 9], [12, 11], [16, 12], [4, 7], [19, 6], [11, 6]]) { d(x, y, 1, 1, hH); d(x + 1, y + 1, 1, 1, hS); d(x - 1, y + 1, 1, 1, hS); }
      }
      else d(8, 3, 6, 1, hH);
      if (st === "largo" || (woman && big)) r(5, 14, 14, 8, h);
      if (st === "bob") r(4, 8, 16, 8, h);
      if (st === "coleta") { r(10, 15, 4, 8, h); r(10, 13, 4, 2, "#ea0029"); }
      d(11, 14, 2, 1, hS);
    }

    // Accesorios del estado y premios.
    const ex = cfg.extra;
    if (cfg.gorra && ex !== "audifonos") { r(5, 1, 14, 4, "#ea0029"); d(7, 2, 4, 1, "#ff4d6a"); if (front) r(12, 5, 9, 1, "#b8001f"); }
    if (ex === "audifonos") { r(6, 0, 12, 1, "#2d2f36"); r(4, 1, 2, 4, "#2d2f36"); r(18, 1, 2, 4, "#2d2f36"); r(2, 7, 4, 6, "#3a3d46"); r(18, 7, 4, 6, "#3a3d46"); d(3, 8, 1, 4, "#ff5a6e"); d(20, 8, 1, 4, "#ff5a6e"); }
    else if (ex === "taza" && front) { r(19, 24, 4, 5, "#f4f1ea"); r(23, 25, 1, 3, "#f4f1ea"); d(19, 24, 4, 1, "#8b5a2b"); }
    else if (ex === "libreta" && front) { r(19, 19, 3, 11, "#f4f1ea"); d(19, 19, 3, 1, "#d9d4cb"); d(20, 22, 1, 5, "#5c7fb8"); }
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
  // Dibuja con contorno: primero la silueta oscura, luego los colores. k = tamaño de un pixel de la caja
  // de 12×21 (cada pieza mide medio pixel); ow = grosor del contorno en pixeles de pantalla.
  function drawFigure(ctx, x, y, cfg, view = "front", frame = 0, seated = false, flip = false, k = 1, ow = 1) {
    const ps = parts(cfg, view, frame, seated);
    const u = k / 2;
    const R = (px, py, w, hh) => {
      const rx = flip ? 24 - px - w : px;
      const x1 = Math.round(x + rx * u), y1 = Math.round(y + py * u), x2 = Math.round(x + (rx + w) * u), y2 = Math.round(y + (py + hh) * u);
      return [x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1)];
    };
    ctx.fillStyle = OUT;
    for (const p of ps) { if (p[5] || !p[3]) continue; const [a, b, w, hh] = R(p[0], p[1], p[2], p[3]); ctx.fillRect(a - ow, b - ow, w + 2 * ow, hh + 2 * ow); }
    for (const p of ps) { if (!p[3]) continue; const [a, b, w, hh] = R(p[0], p[1], p[2], p[3]); ctx.fillStyle = p[4]; ctx.fillRect(a, b, w, hh); }
  }
  // Solo la cabeza (para la burbuja que se asoma por el borde de la pantalla).
  function drawHead(ctx, x, y, cfg, k = 6, ow = 2) {
    const u = k / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 4 * u, y - 2 * u, 32 * u, 18 * u); ctx.clip();
    drawFigure(ctx, x, y, cfg, "front", 0, true, false, k, ow);
    ctx.restore();
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
  window.PIXCORE = { PRESENCIAS, drawHead, GENEROS, PEINADOS, PELO, PIEL, ROPA, OUT, shade, defaults, config, parts, drawFigure, withExtra, EXTRA };
})();
