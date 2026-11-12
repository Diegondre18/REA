// Aviso a pantalla completa: dibuja el muñeco estirándose y los botones; el clic vuelve a la app.
(() => {
  "use strict";
  const PX = window.PIXCORE;
  const $ = (id) => document.getElementById(id);
  let data = null, t0 = performance.now();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function paint(t) {
    const cv = $("doll"), ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (data && data.me) {
      const k = 10;
      const cfg = PX.withExtra(PX.config(data.me), "pausa", data.me.premios || [], t);
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(3 * k, 24 * k, 10 * k, k);
      PX.drawFigure(ctx, 2 * k, 3 * k, cfg, "front", 0, false, false, k, 3);
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
  window.alerta.onData((d) => {
    const nag = data && d.id === data.id;
    data = d;
    $("shot").style.backgroundImage = d.shot ? `url(${d.shot})` : "none";
    $("eb").textContent = d.kind === "pausa" ? "Pausa activa del equipo" : "Pomodoro";
    $("t").textContent = d.title;
    $("b").textContent = d.body || "";
    $("team").hidden = !(d.team && d.team.length);
    $("team").textContent = d.team && d.team.length ? "Ya se sumaron: " + d.team.join(", ") : "";
    $("hint").textContent = d.kind === "pausa" ? "Asistir cuenta para tu racha, tus premios y el ranking de la oficina." : "Tomar el descanso cuenta para tu racha, tus premios y el ranking.";
    $("acts").innerHTML = (d.actions || []).map((x, i) => `<button type="button" class="${i === 0 ? "main" : ""}" data-a="${esc(x.a)}">${esc(x.label)}</button>`).join("");
    const card = $("card");
    if (nag) { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); }
    const first = document.querySelector("#acts button");
    if (first) first.focus();
  });
  $("acts").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]");
    if (b) window.alerta.action(b.dataset.a);
  });
})();
