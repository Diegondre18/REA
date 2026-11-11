// Muñecos en pixel art: cada persona arma el suyo (hombre o mujer, peinado, pelo, piel y ropa).
// Se dibujan pixel a pixel con rectángulos; el color de ropa no se repite entre personas.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act } = L;
  const { useState, useEffect, useRef } = hooks;

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
    r(2, 12 - step2, 1, 3, c); r(9, 12 - step, 1, 3, c);
    r(2, 15 - step2, 1, 1, s); r(9, 15 - step, 1, 1, s);
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
    return out;
  }
  // Dibuja con contorno de 1 pixel: primero la silueta oscura, luego los colores.
  function drawFigure(ctx, x, y, cfg, view = "front", frame = 0, seated = false, flip = false) {
    const ps = parts(cfg, view, frame, seated);
    const X = (px, w) => (flip ? x + 12 - px - w : x + px);
    ctx.fillStyle = OUT;
    for (const [px, py, w, hh] of ps) ctx.fillRect(X(px, w) - 1, y + py - 1, w + 2, hh + 2);
    for (const [px, py, w, hh, col] of ps) { ctx.fillStyle = col; ctx.fillRect(X(px, w), y + py, w, hh); }
  }

  // Cara del muñeco para usar como foto de perfil (cabeza y hombros), en caché por configuración.
  const faces = new Map();
  function faceUrl(u) {
    const cfg = config(u);
    if (cfg.generico) return "";
    const key = JSON.stringify(cfg);
    if (faces.has(key)) return faces.get(key);
    const scale = 6, cv = document.createElement("canvas");
    cv.width = 14 * scale; cv.height = 14 * scale;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = shade(cfg.ropa, -0.75); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(scale, scale);
    drawFigure(ctx, 1, 1, cfg, "front", 0, true);
    const url = cv.toDataURL("image/png");
    faces.set(key, url);
    return url;
  }

  // Vista previa grande en el editor.
  function Preview({ cfg, view = "front", walk = false }) {
    const ref = useRef(null);
    useEffect(() => {
      let frame = 0, id = 0;
      const paint = () => {
        const cv = ref.current; if (!cv) return;
        const ctx = cv.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.setTransform(6, 0, 0, 6, 0, 0);
        ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(3, 23, 10, 1);
        drawFigure(ctx, 2, 2, cfg, view, walk ? frame : 0);
      };
      paint();
      if (walk) id = setInterval(() => { frame = (frame + 1) % 4; paint(); }, 220);
      return () => clearInterval(id);
    }, [JSON.stringify(cfg), view, walk]);
    return html`<canvas ref=${ref} class="pix-preview" width=${16 * 6} height=${25 * 6} aria-hidden="true"></canvas>`;
  }

  function Swatches({ options, value, onChange, taken = {} }) {
    return html`<div class="swatches">${options.map((o) => {
      const who = taken[o.id.toLowerCase()];
      return html`<button type="button" key=${o.id} class="swatch" style=${{ "--sw": o.id }} aria-pressed=${value && value.toLowerCase() === o.id.toLowerCase()} disabled=${!!who}
        title=${who ? `${o.label}: ya lo tiene ${who}` : o.label} aria-label=${who ? `${o.label}, ya lo tiene ${who}` : o.label} onClick=${() => onChange(o.id)}>${who && html`<i>×</i>`}</button>`;
    })}</div>`;
  }

  // Editor del muñeco: se abre desde la oficina o desde el perfil.
  function MunecoSheet() {
    const s = L.useStore();
    const me = s.me;
    const base = config(me);
    const taken = {};
    for (const u of s.users) if (u.id !== me.id && u.muneco && u.muneco.ropa) taken[String(u.muneco.ropa).toLowerCase()] = L.first(u.name);
    const firstFree = (ROPA.find((o) => !taken[o.id.toLowerCase()]) || ROPA[0]).id;
    const [cfg, setCfg] = useState(() => ({ genero: base.genero, peinado: base.peinado, pelo: base.pelo, piel: base.piel, ropa: base.generico || taken[base.ropa.toLowerCase()] ? firstFree : base.ropa }));
    const [busy, setBusy] = useState(false);
    const set = (k) => (v) => setCfg((c) => {
      const n = { ...c, [k]: v };
      if (k === "genero" && !PEINADOS[v].some((p) => p.id === n.peinado)) n.peinado = PEINADOS[v][0].id;
      return n;
    });
    const save = async () => {
      if (taken[cfg.ropa.toLowerCase()]) { L.toast("Ese color de ropa ya lo tiene " + taken[cfg.ropa.toLowerCase()] + "."); return; }
      setBusy(true);
      const r = await act.saveUser(me.id, { muneco: { genero: cfg.genero, peinado: cfg.peinado, pelo: cfg.pelo, piel: cfg.piel, ropa: cfg.ropa } });
      setBusy(false);
      if (r) { L.toast("Tu muñeco está listo"); L.closeSheet(); }
    };
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary" disabled=${busy}>Guardar muñeco</button>`;
    return html`<${L.Sheet} title="Tu muñeco" onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      <div class="pix-stage"><${Preview} cfg=${cfg} /><${Preview} cfg=${cfg} view="back" /><${Preview} cfg=${cfg} walk /></div>
      <p class="note">Así te ven en la oficina. El color de ropa es solo tuyo: los que ya tienen otras personas aparecen tachados.</p>
      <div class="fld"><span class="lbl">Muñeco</span><${L.Seg} label="Muñeco" value=${cfg.genero} onChange=${set("genero")} options=${GENEROS} /></div>
      <div class="fld"><span class="lbl">Peinado</span><${L.Pills} options=${PEINADOS[cfg.genero]} value=${cfg.peinado} onChange=${set("peinado")} /></div>
      <div class="fld"><span class="lbl">Color de pelo</span><${Swatches} options=${PELO} value=${cfg.pelo} onChange=${set("pelo")} /></div>
      <div class="fld"><span class="lbl">Piel</span><${Swatches} options=${PIEL} value=${cfg.piel} onChange=${set("piel")} /></div>
      <div class="fld"><span class="lbl">Color de la ropa</span><${Swatches} options=${ROPA} value=${cfg.ropa} onChange=${set("ropa")} taken=${taken} /></div>
    <//>`;
  }

  Object.assign(L, { PIX: { GENEROS, PEINADOS, PELO, PIEL, ROPA, shade, config, drawFigure, faceUrl, OUT }, MunecoSheet, MunecoPreview: Preview });
})();
