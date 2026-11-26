// Aviso a pantalla completa: dibuja el muñeco y los botones; el clic vuelve a la app.
// Modo "rutina": la pausa activa guiada en la misma pantalla bloqueada. "Terminar" solo se activa cuando se
// acaba el tiempo; "Salir sin terminar" no suma puntos.
(() => {
  "use strict";
  const PX = window.PIXCORE;
  const $ = (id) => document.getElementById(id);
  let data = null;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  // Dónde va la rutina en este momento.
  function paso() {
    const EJ = data.ejercicios || [];
    const total = data.total || 1, el = Date.now() - (data.startedAt || Date.now());
    const per = total / Math.max(1, EJ.length);
    const i = Math.min(EJ.length - 1, Math.floor(el / per));
    return { EJ, total, el, i, ex: EJ[i] || { t: "", d: "", poses: [{}] }, done: el >= total };
  }

  function paint(t) {
    const cv = $("doll"), ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (data && data.me) {
      const k = 10;
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(3 * k, 24 * k, 10 * k, k);
      if (data.mode === "rutina") {
        const p = paso();
        const poses = p.ex.poses && p.ex.poses.length ? p.ex.poses : [{}];
        const pz = p.done ? {} : poses[Math.floor(p.el / 600) % poses.length];
        const cfg = { ...PX.withExtra(PX.config(data.me), "", data.me.premios || []), look: pz.look || 0, blink: !!pz.blink, pose: pz.pose || "" };
        PX.drawFigure(ctx, 2 * k, 3 * k, cfg, pz.view || "front", pz.frame || 0, false, !!pz.flip, k, 3);
      } else {
        const cfg = PX.withExtra(PX.config(data.me), "pausa", data.me.premios || [], t);
        PX.drawFigure(ctx, 2 * k, 3 * k, cfg, "front", 0, false, false, k, 3);
      }
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);

  // Pantalla de la rutina: se actualiza cada medio segundo.
  let rutinaSig = "";
  function rutina() {
    if (!data || data.mode !== "rutina") return;
    const p = paso();
    $("eb").textContent = p.done ? "Pausa activa terminada" : "Pausa activa · ejercicio " + (p.i + 1) + " de " + p.EJ.length;
    $("t").textContent = p.done ? "¡Listo!" : p.ex.t;
    $("b").textContent = p.done ? "Toca Terminar para volver a trabajar." : p.ex.d;
    $("bar").hidden = false;
    $("barfill").style.width = Math.min(100, (p.el / p.total) * 100) + "%";
    $("left").textContent = p.done ? "" : mmss(p.total - p.el) + " restantes";
    $("steps").hidden = false;
    $("steps").innerHTML = p.EJ.map((e, k) => `<span class="${k < p.i || p.done ? "done" : k === p.i ? "now" : ""}">${esc(e.t)}</span>`).join("");
    const sig = (p.done ? "1" : "0");
    if (sig !== rutinaSig) {
      rutinaSig = sig;
      $("acts").innerHTML = p.done
        ? `<button type="button" class="main" data-a="pausa-fin:${esc(data.hora || "")}">Terminar y volver a trabajar</button>`
        : `<button type="button" class="main" disabled>Terminar (en ${mmss(p.total - p.el)})</button><button type="button" class="link" data-a="pausa-salir:${esc(data.hora || "")}">Salir sin terminar · no suma puntos</button>`;
      const first = document.querySelector("#acts button:not([disabled])");
      if (first && p.done && data.principal) first.focus();
    } else if (!p.done) {
      const b = document.querySelector("#acts button.main"); if (b) b.textContent = "Terminar (en " + mmss(p.total - p.el) + ")";
    }
    $("hint").textContent = "Suma a tu racha, tus premios y el ranking solo si haces la pausa completa y tocas Terminar.";
  }
  setInterval(rutina, 500);

  window.alerta.onData((d) => {
    const nag = data && d.id === data.id && d.mode === data.mode;
    data = d;
    rutinaSig = "";
    $("shot").style.backgroundImage = d.shot ? `url(${d.shot})` : "none";
    $("bar").hidden = true; $("steps").hidden = true; $("left").textContent = "";
    if (d.mode === "cargando") { $("acts").innerHTML = ""; $("hint").textContent = "Preparando la pausa…"; return; }
    if (d.mode === "rutina") { $("team").hidden = true; rutina(); return; }
    $("eb").textContent = d.kind === "pausa" ? "Pausa activa del equipo" : "Pomodoro";
    $("t").textContent = d.title;
    $("b").textContent = d.body || "";
    $("team").hidden = !(d.team && d.team.length);
    $("team").textContent = d.team && d.team.length ? "Ya se sumaron: " + d.team.join(", ") : "";
    $("hint").textContent = d.kind === "pausa" ? "Si asistes, la pausa se hace aquí mismo y la pantalla sigue bloqueada hasta que termine." : "Tomar el descanso cuenta para tu racha, tus premios y el ranking.";
    $("acts").innerHTML = (d.actions || []).map((x, i) => `<button type="button" class="${i === 0 ? "main" : ""}" data-a="${esc(x.a)}">${esc(x.label)}</button>`).join("");
    const card = $("card");
    if (nag) { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); }
    const first = document.querySelector("#acts button");
    if (first && d.principal !== false) first.focus();
  });
  $("acts").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]");
    if (b && !b.disabled) window.alerta.action(b.dataset.a);
  });
  // Ni Escape ni Alt+F4 la cierran: solo sus botones.
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" || (e.altKey && e.key === "F4")) e.preventDefault(); });
})();
