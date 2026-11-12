// Muñecos en pixel art: cada persona arma el suyo (hombre o mujer, peinado, pelo, piel y ropa).
// Se dibujan pixel a pixel con rectángulos; el color de ropa no se repite entre personas.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act } = L;
  const { useState, useEffect, useRef } = hooks;

  const { GENEROS, PEINADOS, PELO, PIEL, ROPA, OUT, shade, config, drawFigure, withExtra } = window.PIXCORE;

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
    // Cara y hombros, más grandes en la foto de perfil.
    const k = 10.5, size = cv.width;
    drawFigure(ctx, (size - 12 * k) / 2, 3, cfg, "frontal", 0, true, false, k);
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
        // k = 112/21: cada pixel del dibujo grande ocupa justo un pixel del lienzo (nítido, sin desenfoque).
        const k = 112 / 21;
        ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(24, 132, 48, 6);
        drawFigure(ctx, (cv.width - 12 * k) / 2, 24, cfg, view, walk ? frame : 0, false, false, k, 2);
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

  Object.assign(L, { PIX: { GENEROS, PEINADOS, PELO, PIEL, ROPA, shade, config, drawFigure, faceUrl, OUT, withExtra }, MunecoSheet, MunecoPreview: Preview });
})();
