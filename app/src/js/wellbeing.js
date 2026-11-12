// Bienestar y vida de la oficina: Pomodoro con descansos que sí alertan, pausas activas a horas fijas,
// cierre del día, racha de bienestar (privada), premios del muñeco, cumpleaños y celebraciones.
// Todo corre en cada PC con reglas fijas; nada usa inteligencia artificial ni internet.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act } = L;
  const { useState, useEffect, useRef } = hooks;
  const PX = window.PIXCORE;

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bloqueado */ } },
  };
  const pad = (n) => String(n).padStart(2, "0");
  const toMin = (h) => { const [a, b] = String(h || "").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const weekday = () => { const d = new Date().getDay(); return d >= 1 && d <= 5; };
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + pad(s % 60); };
  const live = () => !!L.state.me && L.state.mode === "live" && L.state.me.role !== "pantalla";

  /* ================= alertas propias ================= */
  // Los descansos son clave: suenan aunque el sonido esté silenciado y su globito no se cierra solo.
  // big: aviso grande en el centro de la pantalla (pausas activas y descansos), con dos botones.
  function alertUser({ id, title, body = "", soundKind = "descanso", actions = [], route = "", big = "" }) {
    if (!L.state.screenBusy) L.sound(soundKind);
    if (L.desk && L.desk.notify) L.desk.notify(title, body, route, true);
    if (L.desk && L.desk.bubbleNotify) L.desk.bubbleNotify({ id, title, body, route, kind: "bienestar", sticky: true, actions });
    if (big) { L.set({ bigAlert: { id, kind: big, title, body, actions, at: Date.now() } }); fullScreen(); }
    else L.set({ wellAlert: { id, title, body, actions } });
  }
  // En el escritorio el aviso grande sale a pantalla completa, encima de cualquier programa.
  function fullScreen() {
    const a = L.state.bigAlert;
    if (!a || !L.desk || !L.desk.bigAlertShow) return;
    const me = L.state.me;
    const team = a.kind === "pausa" ? q.staff().filter((u) => q.presence(u) === "pausa" && q.online(u) && u.id !== me.id).map((u) => L.first(u.name)) : [];
    L.desk.bigAlertShow({ id: a.id, kind: a.kind, title: a.title, body: a.body, actions: a.actions, team, me: { id: me.id, name: me.name, muneco: me.muneco || null, premios: me.premios || [] } }).catch(() => {});
  }
  function clearAlert(id) {
    if (L.desk && L.desk.bigAlertHide && L.state.bigAlert && (!id || L.state.bigAlert.id === id)) L.desk.bigAlertHide(L.state.bigAlert.id);
    if (L.desk && L.desk.bubbleNotify) L.desk.bubbleNotify({ clear: id });
    if (L.state.wellAlert && (!id || L.state.wellAlert.id === id)) L.set({ wellAlert: null });
    if (L.state.bigAlert && (!id || L.state.bigAlert.id === id)) L.set({ bigAlert: null });
  }
  function nag(id) {
    if (!L.state.screenBusy) L.sound("descanso");
    if (L.desk && L.desk.bubbleNotify) L.desk.bubbleNotify({ nag: id });
    if (L.state.bigAlert && L.state.bigAlert.id === id) { L.set({ bigAlert: { ...L.state.bigAlert, at: Date.now() } }); fullScreen(); }
  }
  const showApp = () => { if (L.desk && L.desk.showApp) L.desk.showApp(); };

  /* ================= celebraciones ================= */
  function confetti(big) {
    const cv = document.createElement("canvas");
    cv.className = "confetti";
    cv.width = innerWidth; cv.height = innerHeight;
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    const cols = ["#0057ff", "#ea0029", "#e8c100", "#1f9d55", "#7c4dff", "#f08c00", "#5fb4ff"];
    const n = big ? 160 : 70;
    const ps = Array.from({ length: n }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.5, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 3, c: cols[(Math.random() * cols.length) | 0], s: 4 + ((Math.random() * 4) | 0) }));
    const t0 = performance.now();
    const step = (t) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) { p.vy += 0.32; p.x += p.vx; p.y += p.vy; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
      if (t - t0 < 2600) requestAnimationFrame(step); else cv.remove();
    };
    requestAnimationFrame(step);
  }
  function celebrate(text, big = false) {
    L.toast(text);
    if (document.visibilityState === "visible") confetti(big);
    if (!L.state.muted && !L.state.screenBusy) L.sound("fiesta");
    if (L.desk && L.desk.bubbleNotify) L.desk.bubbleNotify({ celebrate: text, big });
  }

  /* ================= bienestar (privado) ================= */
  const META = 8; // pausas activas + descansos por semana
  const todayIso = () => L.todayIso();
  const mine = () => (L.state.bienestar || []).filter((b) => b.user === (L.state.me && L.state.me.id));
  let wellQueue = Promise.resolve();
  function addWell(field) {
    wellQueue = wellQueue.then(async () => {
      if (!live()) return;
      const f = todayIso();
      const rec = mine().find((b) => b.fecha === f);
      const data = rec ? { [field]: (Number(rec[field]) || 0) + 1 } : { user: L.state.me.id, fecha: f, pausas: 0, descansos: 0, bloques: 0, agua: 0, [field]: 1 };
      await act.save("bienestar", rec ? rec.id : null, data);
      // Para el ranking de la oficina: solo los totales de la semana (lo demás sigue privado).
      if (field === "pausas" || field === "descansos") {
        const [a, b] = weekRange(0);
        const wk = mine().filter((x) => x.fecha >= a && x.fecha <= b);
        await act.movePresence({ puntos: { semana: a, pausas: wk.reduce((s2, x) => s2 + (Number(x.pausas) || 0), 0), descansos: wk.reduce((s2, x) => s2 + (Number(x.descansos) || 0), 0) } });
      }
    }).catch(() => {});
    return wellQueue;
  }
  const weekRange = (offset = 0) => { const m = L.addDays(L.monday(L.today()), 7 * offset); return [L.iso(m), L.iso(L.addDays(m, 6))]; };
  const sumWeek = (offset = 0) => { const [a, b] = weekRange(offset); return mine().filter((x) => x.fecha >= a && x.fecha <= b).reduce((s, x) => s + (Number(x.pausas) || 0) + (Number(x.descansos) || 0), 0); };
  function streak() {
    let n = 0;
    const cur = sumWeek(0) >= META;
    for (let w = cur ? 0 : -1; w > -60; w--) { if (sumWeek(w) >= META) n++; else break; }
    return n;
  }
  function weeksOk() {
    const by = {};
    for (const x of mine()) { const k = L.iso(L.monday(L.parse(x.fecha))); by[k] = (by[k] || 0) + (Number(x.pausas) || 0) + (Number(x.descansos) || 0); }
    return Object.values(by).filter((v) => v >= META).length;
  }

  /* ================= premios del muñeco ================= */
  const onTime = (uid) => L.state.tareas.filter((t) => (t.assignees || []).includes(uid) && t.status === "terminado" && t.due && t.doneAt && t.doneAt <= t.due).length;
  const totalPausas = () => mine().reduce((s, x) => s + (Number(x.pausas) || 0), 0);
  const PREMIOS = [
    { id: "planta", label: "Planta en tu puesto", how: "5 entregas a tiempo", goal: 5, val: () => onTime(L.state.me.id) },
    { id: "taza", label: "Taza propia", how: "10 pausas activas", goal: 10, val: totalPausas },
    { id: "trofeo", label: "Trofeo de la semana", how: `Cumplir la meta de bienestar: ${META} pausas o descansos en la semana`, goal: META, val: () => Math.max(sumWeek(0), sumWeek(-1)), weekly: true },
    { id: "cuadro", label: "Cuadro en tu puesto", how: "20 entregas a tiempo", goal: 20, val: () => onTime(L.state.me.id) },
    { id: "lampara", label: "Lámpara de escritorio", how: "3 semanas cumpliendo la meta de bienestar", goal: 3, val: weeksOk },
    { id: "medalla", label: "Medalla de compañerismo", how: "Recibir 5 agradecimientos del equipo", goal: 5, val: () => (L.state.reconocimientos || []).filter((r) => r.para === L.state.me.id).length },
    { id: "gorra", label: "Gorra para tu muñeco", how: "40 entregas a tiempo", goal: 40, val: () => onTime(L.state.me.id) },
  ];
  let premiosSig = "", premiosBusy = false;
  async function syncPremios() {
    if (!live() || premiosBusy) return;
    const me = L.state.me;
    const had = Array.isArray(me.premios) ? me.premios : [];
    const next = PREMIOS.filter((p) => (p.weekly ? p.val() >= p.goal : had.includes(p.id) || p.val() >= p.goal)).map((p) => p.id);
    const sig = next.join(",");
    if (sig === had.join(",") || sig === premiosSig) return;
    premiosSig = sig;
    premiosBusy = true;
    const nuevos = next.filter((id) => !had.includes(id));
    const ok = await act.movePresence({ premios: next });
    premiosBusy = false;
    if (ok && nuevos.length) {
      const p = PREMIOS.find((x) => x.id === nuevos[0]);
      celebrate(`¡Ganaste: ${p.label}! Ya se ve en la oficina.`, true);
    }
  }

  /* ================= Pomodoro ================= */
  const PRESETS = [{ id: "25", label: "25 / 5", trabajo: 25, descanso: 5, largo: 15 }, { id: "50", label: "50 / 10", trabajo: 50, descanso: 10, largo: 20 }, { id: "90", label: "90 / 20", trabajo: 90, descanso: 20, largo: 30 }];
  const POMO_KEY = "lap-cerebro-pomodoro", POMO_CFG = "lap-cerebro-pomodoro-cfg";
  const cfg = () => PRESETS.find((p) => p.id === ls.get(POMO_CFG, "50")) || PRESETS[1];
  let pomo = ls.get(POMO_KEY, null);
  // Al abrir la app, un Pomodoro de hace horas ya no sigue.
  if (pomo && pomo.endsAt && Date.now() - pomo.endsAt > 2 * 3600e3) pomo = null;
  const savePomo = () => { ls.set(POMO_KEY, pomo); L.set({ pomo }); L.syncBubble(); };
  const BREAK_ID = "pomo-descanso", BACK_ID = "pomo-vuelta";

  function pomoStart() {
    const c = cfg();
    const pres = q.presence(L.state.me);
    pomo = { phase: "trabajo", endsAt: Date.now() + c.trabajo * 60e3, ciclo: 1, prev: pres === "no_molestar" ? "disponible" : pres === "fuera" ? "disponible" : pres, snoozed: false };
    act.setPresence("no_molestar");
    clearAlert(BACK_ID);
    savePomo();
    L.toast(`Pomodoro: ${c.trabajo} min de trabajo en No molestar. Te aviso al descanso.`);
  }
  function pomoStop() {
    if (!pomo) return;
    const prev = pomo.prev || "disponible";
    const pres = q.presence(L.state.me);
    pomo = null;
    savePomo();
    clearAlert(BREAK_ID); clearAlert(BACK_ID);
    if (pres === "no_molestar" || pres === "pausa") act.setPresence(prev);
    L.toast("Pomodoro terminado");
  }
  function pomoBreak() {
    if (!pomo) return;
    const c = cfg();
    const mins = pomo.ciclo % 4 === 0 ? c.largo : c.descanso;
    pomo = { ...pomo, phase: "descanso", endsAt: Date.now() + mins * 60e3, nags: 0 };
    clearAlert(BREAK_ID);
    act.setPresence("pausa");
    savePomo();
    L.toast(`Descanso de ${mins} minutos. Levántate, estira y mira lejos de la pantalla.`);
  }
  function pomoNext() {
    if (!pomo) return pomoStart();
    const c = cfg();
    pomo = { ...pomo, phase: "trabajo", endsAt: Date.now() + c.trabajo * 60e3, ciclo: pomo.ciclo + 1, snoozed: false };
    clearAlert(BACK_ID);
    act.setPresence("no_molestar");
    savePomo();
  }
  function pomoTick() {
    if (!pomo || !live()) return;
    const t = Date.now();
    if (pomo.phase === "trabajo" && t >= pomo.endsAt) {
      addWell("bloques");
      pomo = { ...pomo, phase: "espera", endsAt: 0, dueAt: t, nagAt: t + 120e3, nags: 0 };
      savePomo();
      const c = cfg();
      const mins = pomo.ciclo % 4 === 0 ? c.largo : c.descanso;
      alertUser({ id: BREAK_ID, big: "descanso", title: "Hora de descansar", body: `Llevas ${c.trabajo} minutos concentrado. Tómate ${mins} minutos lejos de la pantalla: es parte del trabajo.`,
        actions: [{ a: "pomo-descanso", label: "Tomar el descanso" }, { a: "pomo-mas:5", label: "+5 min" }, { a: "pomo-mas:10", label: "+10 min" }, { a: "pomo-omitir", label: "Omitir descanso" }] });
    } else if (pomo.phase === "espera" && t >= pomo.nagAt && pomo.nags < 5) {
      // Si no lo atiende, insiste cada 2 minutos (hasta 5 veces).
      pomo = { ...pomo, nagAt: t + 120e3, nags: pomo.nags + 1 };
      savePomo();
      nag(BREAK_ID);
    } else if (pomo.phase === "descanso" && t >= pomo.endsAt) {
      addWell("descansos");
      pomo = { ...pomo, phase: "listo", endsAt: 0 };
      act.setPresence(pomo.prev || "disponible");
      savePomo();
      alertUser({ id: BACK_ID, title: "Terminó el descanso", body: `Bloque ${pomo.ciclo} listo. ¿Sigues con otro?`, soundKind: "vuelta",
        actions: [{ a: "pomo-seguir", label: "Otro bloque" }, { a: "pomo-terminar", label: "Terminar" }] });
    }
  }
  // Para la burbuja: qué mostrar debajo del muñeco.
  L.bubbleTimer = () => {
    if (!pomo) return null;
    if (pomo.phase === "trabajo") return { label: "Trabajo", endsAt: pomo.endsAt, color: "#e5484d" };
    if (pomo.phase === "descanso") return { label: "Descanso", endsAt: pomo.endsAt, color: "#0e9aa7" };
    if (pomo.phase === "espera") return { label: "¡A descansar!", endsAt: 0, color: "#0e9aa7", blink: true };
    return null;
  };

  /* ================= pausas activas ================= */
  const PAUSA_MINE = "lap-cerebro-pausas-mias";
  const studioPausas = () => { const a = (L.state.ajustes || []).find((x) => x.clave === "pausas"); return (a && a.valor) || { horas: [], min: 5 }; };
  const myPausas = () => ls.get(PAUSA_MINE, { horas: [] });
  const allHours = () => [...new Set([...(studioPausas().horas || []), ...(myPausas().horas || [])])].sort();
  const pausaMin = () => Number(studioPausas().min) || 5;
  const pkey = (h) => "lap-cerebro-pausa-" + todayIso() + "-" + h;
  function pausasTick() {
    if (!live() || !weekday() || q.absent(L.state.me.id)) return;
    const pres = q.presence(L.state.me);
    const m = nowMin();
    for (const h of allHours()) {
      const st = ls.get(pkey(h), null);
      const due = st && st.snoozeTo ? st.snoozeTo : toMin(h);
      if (m < due || m > toMin(h) + 180) continue;
      if (st && (st.done || st.skip || (st.shown && !st.snoozeTo))) {
        if (st.shown && !st.done && !st.skip && st.nags < 3 && Date.now() - st.shownAt > (st.nags + 1) * 180e3) { ls.set(pkey(h), { ...st, nags: st.nags + 1 }); nag("pausa-" + h); }
        continue;
      }
      if (pres === "reunion") continue; // se corre a cuando termine la reunión
      if (pres === "fuera" || (pomo && pomo.phase === "descanso") || q.presence(L.state.me) === "pausa") { ls.set(pkey(h), { skip: true }); continue; }
      ls.set(pkey(h), { shown: true, shownAt: Date.now(), nags: 0, snoozed: !!(st && st.snoozeTo) });
      alertUser({ id: "pausa-" + h, big: "pausa", title: "Es hora de la pausa activa", body: `${pausaMin()} minutos para todo el equipo: cuello, hombros, espalda y vista.`,
        actions: [{ a: "pausa-empezar:" + h, label: "Asistir" }, { a: "pausa-omitir:" + h, label: "Omitir pausa activa" }] });
      break;
    }
  }
  let pausaPrev = null, pausaHour = "";
  function pausaStart(h) {
    pausaHour = h || "";
    if (h) { const st = ls.get(pkey(h), {}); ls.set(pkey(h), { ...st, started: true }); clearAlert("pausa-" + h); }
    const pres = q.presence(L.state.me);
    pausaPrev = pres === "pausa" ? pausaPrev || "disponible" : pres;
    if (pres !== "pausa") act.setPresence("pausa");
    showApp();
    L.go("#pausa");
  }
  function pausaEnd(done) {
    if (pausaHour) { const st = ls.get(pkey(pausaHour), {}); ls.set(pkey(pausaHour), { ...st, done: !!done, skip: !done }); }
    pausaHour = "";
    if (done) { addWell("pausas"); celebrate("¡Pausa activa hecha!"); }
    if (q.presence(L.state.me) === "pausa" && !(pomo && pomo.phase === "descanso")) act.setPresence(pausaPrev || "disponible");
    pausaPrev = null;
    L.go("#inicio");
  }

  /* ================= cierre del día ================= */
  const CIERRE_CFG = "lap-cerebro-cierre";
  const cierreCfg = () => ls.get(CIERRE_CFG, { on: true, hora: "18:00" });
  const ckey = () => "lap-cerebro-cierre-" + todayIso();
  const cierreHoy = () => (L.state.cierres || []).find((c) => c.user === L.state.me.id && c.fecha === todayIso());
  function cierreTick() {
    const c = cierreCfg();
    if (!live() || !c.on || !weekday() || q.absent(L.state.me.id) || cierreHoy()) return;
    const st = ls.get(ckey(), null);
    const due = st && st.snoozeTo ? st.snoozeTo : toMin(c.hora);
    if (nowMin() < due || (st && st.shown && !st.snoozeTo) || (st && st.done)) return;
    ls.set(ckey(), { shown: true });
    alertUser({ id: "cierre", title: "Cierre del día", body: "Dos minutos: cuánto avanzaste y qué sigue mañana. Llena solo tu avance del comité.", soundKind: "normal", route: "#cierre",
      actions: [{ a: "cierre-abrir", label: "Hacer el cierre" }, ...(st && st.snoozeTo ? [] : [{ a: "cierre-30", label: "En 30 min" }])] });
  }

  /* ================= acciones desde la burbuja o los avisos ================= */
  function runAction(a) {
    const str = String(a || ""), cut = str.indexOf(":");
    const name = cut < 0 ? str : str.slice(0, cut), arg = cut < 0 ? "" : str.slice(cut + 1);
    if (name === "pomo-start") pomoStart();
    else if (name === "pomo-stop" || name === "pomo-terminar") pomoStop();
    else if (name === "pomo-descanso") pomoBreak();
    else if (name === "pomo-seguir") pomoNext();
    else if (name === "pomo-5" && pomo) { pomo = { ...pomo, phase: "trabajo", endsAt: Date.now() + 5 * 60e3, snoozed: true }; clearAlert(BREAK_ID); savePomo(); L.toast("Cinco minutos más. Después, a descansar."); }
    else if (name === "pausa-ahora") pausaStart("");
    else if (name === "pausa-empezar") pausaStart(arg);
    else if (name === "pomo-mas" && pomo) {
      const m = Number(arg) === 10 ? 10 : 5;
      pomo = { ...pomo, phase: "trabajo", endsAt: Date.now() + m * 60e3, snoozed: true };
      clearAlert(BREAK_ID); savePomo();
      L.toast(`${m} minutos más. Después, a descansar.`);
    }
    else if (name === "pomo-omitir") { clearAlert(BREAK_ID); pomoNext(); L.toast("Descanso omitido: no cuenta para tu racha ni el ranking."); }
    else if (name === "pausa-omitir") { const st = ls.get(pkey(arg), {}); ls.set(pkey(arg), { ...st, skip: true }); clearAlert("pausa-" + arg); L.toast("Pausa activa omitida"); }
    else if (name === "pausa-10") { ls.set(pkey(arg), { snoozeTo: nowMin() + 10 }); clearAlert("pausa-" + arg); L.toast("Te aviso en 10 minutos"); }
    else if (name === "agua-tome") aguaTome();
    else if (name === "cierre-abrir") { clearAlert("cierre"); showApp(); L.go("#cierre"); }
    else if (name === "cierre-30") { ls.set(ckey(), { snoozeTo: nowMin() + 30 }); clearAlert("cierre"); L.toast("Te recuerdo el cierre en 30 minutos"); }
  }
  L.onBubbleCustom = (a) => runAction(a.act);

  /* ================= enganches con el resto de la app ================= */
  L.onTaskDone = (t) => { if (t.due && t.doneAt && t.doneAt <= t.due) celebrate("¡Entregado a tiempo! " + t.title); };
  L.onNotif = (n) => {
    if (n.kind === "plan_aprobado") celebrate("¡" + n.title + "!", true);
    else if (n.kind === "gracias") celebrate(n.title + ": «" + n.body + "»");
  };

  /* ================= agua ================= */
  const AGUA_CFG = "lap-cerebro-agua", AGUA_LAST = "lap-cerebro-agua-ultimo";
  const aguaCfg = () => ls.get(AGUA_CFG, { on: false, cada: 90, meta: 8 });
  const aguaHoy = () => { const r = mine().find((b) => b.fecha === todayIso()); return (r && Number(r.agua)) || 0; };
  L.bubbleAgua = () => { const c = aguaCfg(); return c.on ? { n: aguaHoy(), meta: c.meta } : null; };
  function aguaTick() {
    const c = aguaCfg();
    if (!c.on || !live() || !weekday()) return;
    const m = nowMin();
    if (m < 8 * 60 || m > 18 * 60 + 30) return;
    const pres = q.presence(L.state.me);
    if (pres === "reunion" || pres === "fuera" || L.state.screenBusy) return;
    const n = aguaHoy();
    if (n >= c.meta) return;
    const last = ls.get(AGUA_LAST, 0);
    if (!last || new Date(last).toDateString() !== new Date().toDateString()) { ls.set(AGUA_LAST, Date.now()); return; }
    if (Date.now() - last < c.cada * 60e3) return;
    ls.set(AGUA_LAST, Date.now());
    // Suave: sin aviso de Windows y respeta el silencio.
    if (!L.state.muted && pres !== "no_molestar") L.sound("normal");
    if (L.desk && L.desk.bubbleNotify) L.desk.bubbleNotify({ id: "agua-" + Date.now(), kind: "bienestar", title: "¿Un vaso de agua?", body: `Llevas ${n} de ${c.meta} hoy.`, actions: [{ a: "agua-tome", label: "Tomé un vaso" }] });
    else L.toast(`¿Un vaso de agua? Llevas ${n} de ${c.meta} hoy.`);
  }
  async function aguaTome() {
    ls.set(AGUA_LAST, Date.now());
    await addWell("agua");
    const n = aguaHoy(), c = aguaCfg();
    if (n >= c.meta) celebrate(`¡Meta de agua cumplida: ${n} vasos!`); else L.toast(`Vaso ${n} de ${c.meta}`);
    L.syncBubble();
  }
  // Cumpleaños: la persona lo celebra al abrir la app ese día.
  function birthdayCheck() {
    if (!live()) return;
    const md = todayIso().slice(5);
    if (L.state.me.cumple !== md) return;
    const k = "lap-cerebro-cumple-" + todayIso();
    if (ls.get(k, false)) return;
    ls.set(k, true);
    setTimeout(() => celebrate(`¡Feliz cumpleaños, ${L.first(L.state.me.name)}! Todo el estudio lo sabe: tienes globos en tu puesto.`, true), 1500);
  }

  let ticks = 0;
  setInterval(() => {
    ticks++;
    try {
      pomoTick();
      if (ticks % 20 === 0) { pausasTick(); cierreTick(); aguaTick(); }
      if (ticks % 15 === 3) { syncPremios(); birthdayCheck(); }
    } catch (e) { /* sigue */ }
  }, 1000);
  L.set({ pomo });

  /* ================= componentes ================= */
  // Botón del Pomodoro en la barra superior.
  function PomodoroChip() {
    const s = L.useStore();
    const [open, setOpen] = useState(false);
    const [, force] = useState(0);
    const box = useRef(null);
    useEffect(() => { const id = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(id); }, []);
    useEffect(() => {
      const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", away);
      return () => document.removeEventListener("mousedown", away);
    }, []);
    const p = s.pomo;
    const label = !p ? "Pomodoro" : p.phase === "trabajo" ? "Trabajo " + mmss(p.endsAt - Date.now()) : p.phase === "descanso" ? "Descanso " + mmss(p.endsAt - Date.now()) : p.phase === "espera" ? "¡A descansar!" : "Bloque listo";
    const c = cfg();
    const pick = (fn) => { setOpen(false); fn(); };
    return html`<div class="pres pomo" ref=${box}>
      <button type="button" class=${L.cx("btn pres-btn", p && "on", p && p.phase === "espera" && "blink")} onClick=${() => setOpen(!open)} title="Trabajar y descansar por bloques"><span class="pomo-ico" aria-hidden="true">◷</span><span class="mono">${label}</span></button>
      ${open && html`<div class="pop pres-pop glass" role="menu">
        ${!p && html`${PRESETS.map((x) => html`<button type="button" key=${x.id} role="menuitem" onClick=${() => pick(() => { ls.set(POMO_CFG, x.id); pomoStart(); })}><span><b>Empezar ${x.label}</b><small>${x.trabajo} min de trabajo en No molestar, ${x.descanso} de descanso; cada 4 bloques, ${x.largo}.</small></span></button>`)}`}
        ${p && p.phase === "trabajo" && html`<button type="button" onClick=${() => pick(pomoBreak)}><span><b>Descansar ya</b><small>Empieza el descanso ahora.</small></span></button>`}
        ${p && p.phase === "espera" && html`<button type="button" onClick=${() => pick(pomoBreak)}><span><b>Empezar el descanso</b><small>Es parte del trabajo.</small></span></button>`}
        ${p && p.phase === "listo" && html`<button type="button" onClick=${() => pick(pomoNext)}><span><b>Otro bloque de ${c.trabajo} min</b></span></button>`}
        ${p && html`<button type="button" onClick=${() => pick(pomoStop)}><span><b>Terminar el Pomodoro</b><small>Vuelves a tu estado de antes.</small></span></button>`}
        <button type="button" onClick=${() => pick(() => pausaStart(""))}><span><b>Pausa activa ahora</b><small>${pausaMin()} minutos de ejercicios guiados.</small></span></button>
      </div>`}
    </div>`;
  }

  // Aviso dentro de la app (por si la burbuja está oculta).
  function WellAlert() {
    const s = L.useStore();
    const a = s.wellAlert;
    if (!a) return null;
    return html`<div class="banner glass well-banner" role="alert"><p><strong>${a.title}.</strong> ${a.body}</p>
      <div class="inline">${(a.actions || []).map((x, i) => html`<button type="button" key=${x.a} class=${L.cx("btn sm", i === 0 && "primary")} onClick=${() => runAction(x.a)}>${x.label}</button>`)}
      ${a.id === BREAK_ID && html`<button type="button" class="btn sm ghost" onClick=${() => { if (confirm("¿Saltar el descanso? Descansar 10 minutos mejora la concentración del siguiente bloque.")) { clearAlert(BREAK_ID); pomoNext(); } }}>Saltar</button>`}
      ${a.id !== BREAK_ID && a.id !== BACK_ID && html`<button type="button" class="btn sm ghost" onClick=${() => clearAlert(a.id)}>Cerrar</button>`}</div></div>`;
  }

  // Muñeco grande animado (pausa activa, premios).
  function BigDoll({ pose = "", view = "front", frame = 0, flip = false, k = 10, cfgOver }) {
    const ref = useRef(null);
    const me = L.state.me;
    useEffect(() => {
      const cv = ref.current; if (!cv) return;
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const c = { ...PX.withExtra(PX.config(me), "", me.premios), ...(cfgOver || {}), pose };
      ctx.fillStyle = "rgba(40,30,35,0.14)"; ctx.fillRect(3 * k, 24 * k, 10 * k, k);
      PX.drawFigure(ctx, 2 * k, 4 * k, c, view, frame, false, flip, k, Math.max(1, Math.round(k * 0.35)));
    });
    return html`<canvas ref=${ref} width=${16 * k} height=${26 * k} class="big-doll" aria-hidden="true"></canvas>`;
  }

  // Pausa activa guiada.
  const EJERCICIOS = [
    { t: "Cuello", d: "Inclina la cabeza despacio hacia un hombro y luego hacia el otro. Sin forzar.", poses: [{}, { pose: "cuelloI" }, { pose: "cuelloI" }, {}, { pose: "cuelloD" }, { pose: "cuelloD" }] },
    { t: "Brazos arriba", d: "Entrelaza los dedos, estira los brazos hacia el techo y respira hondo.", poses: [{}, { pose: "medio" }, { pose: "estira" }, { pose: "estira" }, { pose: "estira" }, { pose: "medio" }] },
    { t: "Hombros", d: "Sube los hombros hacia las orejas, sostén un segundo y suéltalos. Diez veces.", poses: [{}, { pose: "hombros" }, { pose: "hombros" }, {}] },
    { t: "Espalda", d: "De pie, estira los brazos hacia arriba y gira el tronco a cada lado.", poses: [{ pose: "medio" }, { pose: "estira" }, { pose: "giroI" }, { pose: "giroI" }, { pose: "estira" }, { pose: "giroD" }, { pose: "giroD" }, { pose: "estira" }] },
    { t: "Vista 20-20-20", d: "Mira algo a unos 6 metros durante 20 segundos y parpadea varias veces.", poses: [{ look: -1 }, { look: -1 }, { look: -1, blink: true }, { look: 1 }, { look: 1 }, { look: 1, blink: true }] },
    { t: "Camina", d: "Da una vuelta corta: sirve un vaso de agua o pásale a saludar a alguien.", poses: [{ frame: 1 }, { frame: 0 }, { frame: 3 }, { frame: 0 }] },
  ];
  function PausaView() {
    const total = pausaMin() * 60e3;
    const per = total / EJERCICIOS.length;
    const [t0] = useState(() => Date.now());
    const [, force] = useState(0);
    useEffect(() => { const id = setInterval(() => force((n) => n + 1), 150); return () => clearInterval(id); }, []);
    const el = Date.now() - t0;
    const i = Math.min(EJERCICIOS.length - 1, Math.floor(el / per));
    const ex = EJERCICIOS[i];
    const pz = ex.poses[Math.floor(el / 600) % ex.poses.length];
    const doneAll = el >= total;
    return html`
      <div class="pausa-view glass">
        <div class="pausa-doll"><${BigDoll} pose=${pz.pose || ""} view=${pz.view || "front"} frame=${pz.frame || 0} flip=${!!pz.flip} cfgOver=${{ look: pz.look || 0, blink: !!pz.blink }} /></div>
        <div class="pausa-body">
          <span class="eyebrow">Pausa activa · ejercicio ${i + 1} de ${EJERCICIOS.length}</span>
          <h1>${doneAll ? "¡Listo!" : ex.t}</h1>
          <p>${doneAll ? "Pausa terminada. Vuelve con calma." : ex.d}</p>
          <div class="pausa-bar"><i style=${{ width: Math.min(100, (el / total) * 100) + "%" }}></i></div>
          <span class="mono muted">${doneAll ? "0:00" : mmss(total - el)} restantes</span>
          <div class="pausa-steps">${EJERCICIOS.map((e, k) => html`<span key=${k} class=${L.cx(k < i || doneAll ? "done" : k === i && "now")}>${e.t}</span>`)}</div>
          <div class="inline">
            <button type="button" class="btn primary" onClick=${() => pausaEnd(doneAll || el >= total * 0.6)}>${doneAll ? "Terminar" : "Terminar la pausa"}</button>
            ${!doneAll && html`<button type="button" class="btn ghost" onClick=${() => pausaEnd(false)}>Salir sin terminar</button>`}
          </div>
          <p class="hint">Cuenta para tu racha de bienestar si haces al menos el 60 % de la pausa. Tu racha es privada.</p>
        </div>
      </div>`;
  }

  // Cierre del día.
  function CierreView() {
    const s = L.useStore();
    const me = s.me, t = L.todayIso(), tomorrow = L.iso(L.addDays(L.today(), 1));
    const prev = cierreHoy();
    const tasks = q.myTasks(me.id).filter((x) => x.status !== "terminado" && (x.status === "en_curso" || x.status === "revision" || (x.due && x.due <= tomorrow) || x.id === me.taskId)).sort(L.byDue);
    const [vals, setVals] = useState(() => Object.fromEntries(tasks.map((x) => [x.id, { progress: Number(x.progress) || 0, status: x.status }])));
    const doneToday = s.tareas.filter((x) => (x.assignees || []).includes(me.id) && x.doneAt === t);
    const [hice, setHice] = useState(prev ? prev.hice : doneToday.map((x) => "• Terminé: " + x.title).join("\n"));
    const [manana, setManana] = useState(prev ? prev.manana : "");
    const [busy, setBusy] = useState(false);
    const upd = (id, k, v) => setVals({ ...vals, [id]: { ...vals[id], [k]: v, ...(k === "progress" && v === 100 ? { status: "terminado" } : {}) } });
    const save = async () => {
      setBusy(true);
      const items = [];
      for (const x of tasks) {
        const v = vals[x.id]; if (!v) continue;
        const ch = v.progress !== (Number(x.progress) || 0) || v.status !== x.status;
        if (ch) { await act.saveTask(x.id, { progress: v.status === "terminado" ? 100 : v.progress, status: v.status }); items.push({ task: x.id, title: x.title, de: Number(x.progress) || 0, a: v.progress, status: v.status }); }
      }
      const lines = items.filter((i) => i.status !== "terminado").map((i) => `• ${i.title}: ${i.de}% → ${i.a}%`);
      const hiceTxt = [hice.trim(), ...lines.filter((l) => !hice.includes(l))].filter(Boolean).join("\n");
      const r = await act.save("cierres", prev ? prev.id : null, { user: me.id, fecha: t, hice: hiceTxt.slice(0, 3000), manana: manana.trim().slice(0, 3000), items });
      setBusy(false);
      if (r) { ls.set(ckey(), { done: true }); clearAlert("cierre"); celebrate("Cierre del día guardado. ¡Buen trabajo!"); L.go("#inicio"); }
    };
    return html`
      <${L.PageHead} eyebrow=${L.cap(L.fmtLong(t))} title="Cierre del día" sub="Dos minutos para dejar el día ordenado. Esto llena solo tu avance para el próximo comité." />
      <div class="grid">
        <${L.Panel} title="Tus tareas de hoy" cls="span-12">
          <div class="cierre-list">${tasks.length ? tasks.map((x) => { const v = vals[x.id] || { progress: 0, status: x.status }; const p = q.project(x.project); return html`
            <div class="cierre-row" key=${x.id}>
              <div class="ct"><b>${x.title}</b><small>${[p && (p.code || p.name), x.due && "entrega " + L.relDay(x.due).toLowerCase()].filter(Boolean).join(" · ")}</small></div>
              <label class="cp"><input type="range" min="0" max="100" step="10" value=${v.status === "terminado" ? 100 : v.progress} onInput=${(e) => upd(x.id, "progress", Number(e.target.value))} aria-label=${"Avance de " + x.title} /><span class="mono">${v.status === "terminado" ? 100 : v.progress}%</span></label>
              <${L.Pills} options=${L.STATUSES} value=${v.status} onChange=${(st) => upd(x.id, "status", st)} />
            </div>`; }) : html`<p class="note">No tienes tareas en curso ni por entregar mañana.</p>`}</div>
        <//>
        <${L.Panel} title="Qué hice hoy" cls="span-6"><textarea class="cierre-txt" value=${hice} onInput=${(e) => setHice(e.target.value)} placeholder="Lo principal que avanzaste. Lo que muevas arriba se agrega solo."></textarea><//>
        <${L.Panel} title="Qué sigue mañana" cls="span-6"><textarea class="cierre-txt" value=${manana} onInput=${(e) => setManana(e.target.value)} placeholder="Lo primero que harás mañana, o lo que te bloquea."></textarea><//>
        <div class="span-12 inline"><button type="button" class="btn primary" disabled=${busy} onClick=${save}>${prev ? "Actualizar el cierre" : "Guardar el cierre"}</button><button type="button" class="btn ghost" onClick=${() => L.go("#inicio")}>Ahora no</button></div>
      </div>`;
  }
  // Para el avance del comité: junta los cierres desde hace una semana.
  L.cierresParaComite = (evDate) => {
    const me = L.state.me;
    const desde = L.iso(L.addDays(L.parse(evDate) || L.today(), -7));
    const list = (L.state.cierres || []).filter((c) => c.user === me.id && c.fecha >= desde && c.fecha <= (evDate || "9999")).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!list.length) return null;
    return { done: list.map((c) => L.cap(L.fmtDay(c.fecha)) + ":\n" + (c.hice || "").trim()).filter((x) => x.trim()).join("\n\n"), next: (list[list.length - 1].manana || "").trim(), n: list.length };
  };

  // Racha de bienestar (privada) y premios: van en Mi semana.
  function Bienestar() {
    const s = L.useStore();
    const [a] = weekRange(0);
    const days = Array.from({ length: 5 }, (_, i) => L.iso(L.addDays(L.parse(a), i)));
    const recs = mine();
    const tot = sumWeek(0), st = streak();
    const max = Math.max(3, ...days.map((d) => { const r = recs.find((x) => x.fecha === d) || {}; return (Number(r.pausas) || 0) + (Number(r.descansos) || 0); }));
    return html`<${L.Panel} title="Tu bienestar" cls="span-5" action=${html`<span class="tag">Solo lo ves tú</span>`}>
      <div class="well">
        <div class="well-top"><b class=${tot >= META ? "ok" : ""}>${tot}<small>/${META}</small></b><span>pausas y descansos esta semana${tot >= META ? " · ¡meta cumplida! Trofeo en tu puesto" : ""}</span></div>
        <div class="well-days">${days.map((d) => { const r = recs.find((x) => x.fecha === d) || {}; const v = (Number(r.pausas) || 0) + (Number(r.descansos) || 0); return html`<div key=${d} class=${L.cx("wd", d === L.todayIso() && "today")}><i style=${{ height: (v / max) * 100 + "%" }}></i><span>${L.DIAS_C[L.parse(d).getDay()]}</span><small>${v || ""}</small></div>`; })}</div>
        ${aguaCfg().on && html`<p class="agua-line">Agua hoy: <b>${aguaHoy()} de ${aguaCfg().meta} vasos</b> <button type="button" class="link" onClick=${aguaTome}>Tomé un vaso</button></p>`}
        <p class="hint">${st ? `Racha: ${L.plural(st, "semana", "semanas")} seguidas cumpliendo la meta.` : "Haz pausas activas o usa el Pomodoro: cada descanso cuenta."} Bloques de trabajo esta semana: ${recs.filter((x) => x.fecha >= a).reduce((m, x) => m + (Number(x.bloques) || 0), 0)}.</p>
      </div>
    <//>`;
  }
  // Íconos de los premios en pixel art (8×8).
  const ICONS = {
    planta: [[3, 0, 2, 1, "#6aa34a"], [2, 1, 4, 2, "#4f8a36"], [1, 2, 6, 1, "#6aa34a"], [3, 3, 2, 1, "#3b6e2a"], [2, 4, 4, 3, "#c9a77d"], [3, 7, 2, 1, "#a98760"]],
    taza: [[1, 1, 5, 1, "#8b5a2b"], [1, 2, 5, 5, "#ea0029"], [6, 3, 2, 1, "#ea0029"], [7, 4, 1, 2, "#ea0029"], [6, 5, 1, 1, "#ea0029"], [2, 7, 3, 1, "#a3001a"]],
    medalla: [[2, 0, 1, 3, "#0057ff"], [5, 0, 1, 3, "#ea0029"], [3, 2, 2, 1, "#e8e2da"], [2, 3, 4, 4, "#f2c94c"], [3, 4, 2, 2, "#d9a925"], [3, 7, 2, 1, "#c08f12"]],
    trofeo: [[1, 0, 6, 1, "#f2c94c"], [2, 1, 4, 3, "#f2c94c"], [0, 1, 1, 2, "#d9a925"], [7, 1, 1, 2, "#d9a925"], [3, 4, 2, 2, "#d9a925"], [2, 6, 4, 2, "#c08f12"]],
    cuadro: [[0, 1, 8, 6, "#8b5a2b"], [1, 2, 6, 4, "#5fb4ff"], [1, 4, 4, 2, "#6aa34a"], [5, 2, 1, 1, "#f2c94c"]],
    lampara: [[2, 0, 4, 2, "#f3d77f"], [1, 2, 6, 1, "#e9c968"], [3, 3, 1, 4, "#4a4650"], [2, 7, 4, 1, "#4a4650"]],
    gorra: [[2, 2, 4, 2, "#ea0029"], [1, 4, 6, 1, "#ea0029"], [5, 5, 3, 1, "#b8001f"]],
  };
  const PremioIcon = ({ id, on }) => html`<svg class=${L.cx("premio-ico", !on && "off")} viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${(ICONS[id] || []).map(([x, y, w, h, c], i) => html`<rect key=${i} x=${x} y=${y} width=${w} height=${h} fill=${c} />`)}</svg>`;
  function Premios() {
    const s = L.useStore();
    const had = s.me.premios || [];
    return html`<${L.Panel} title="Premios de tu muñeco" cls="span-7" action=${html`<a class="link" href="#oficina">Ver en la oficina</a>`}>
      <div class="premios">${PREMIOS.map((p) => { const on = had.includes(p.id); const v = Math.min(p.goal, p.val()); return html`
        <div class=${L.cx("premio", on && "on")} key=${p.id}><${PremioIcon} id=${p.id} on=${on} /><span><b>${p.label}</b><small>${on ? (p.weekly ? "Ganado esta semana" : "Ganado") : p.how}</small>
          ${!on && html`<span class="bar-track wide"><i style=${{ width: (v / p.goal) * 100 + "%" }}></i></span><small class="mono">${v} de ${p.goal}</small>`}</span></div>`; })}</div>
      <p class="hint">Se ven en tu puesto de la oficina (la gorra, en tu muñeco). Entregas a tiempo = tareas terminadas antes de su fecha.</p>
    <//>`;
  }

  // Ajustes en el perfil: Pomodoro, pausas activas (las de Dirección para todo el estudio), cierre y cumpleaños.
  function WellSettings() {
    const s = L.useStore();
    const [mineH, setMineH] = useState(myPausas().horas || []);
    const [newH, setNewH] = useState("");
    const [cc, setCc] = useState(cierreCfg());
    const studio = studioPausas();
    const [stH, setStH] = useState(studio.horas || []);
    const [stNew, setStNew] = useState("");
    const director = q.isDirector();
    const saveMine = (h) => { setMineH(h); ls.set(PAUSA_MINE, { horas: h }); };
    const saveCc = (c) => { setCc(c); ls.set(CIERRE_CFG, c); };
    const [ag, setAg] = useState(aguaCfg());
    const saveAg = (c) => { setAg(c); ls.set(AGUA_CFG, c); L.syncBubble(); };
    const saveStudio = async (h) => {
      setStH(h);
      const rec = (s.ajustes || []).find((x) => x.clave === "pausas");
      if (await act.save("ajustes", rec ? rec.id : null, { clave: "pausas", valor: { horas: h, min: pausaMin() } })) L.toast("Pausas del estudio guardadas: le llegan a todo el equipo");
    };
    const [cum, setCum] = useState(() => { const [m, d] = (s.me.cumple || "").split("-"); return { m: m || "", d: d || "" }; });
    const setCumple = (m, d) => {
      setCum({ m, d });
      if (m && d) act.saveUser(s.me.id, { cumple: m + "-" + d }).then((r) => r && L.toast("Cumpleaños guardado"));
      else if (!m && !d) act.saveUser(s.me.id, { cumple: "" });
    };
    const cm = cum.m, cd = cum.d;
    const hourChips = (list, onRemove) => list.map((h) => html`<span class="hchip" key=${h}>${h}<button type="button" aria-label=${"Quitar " + h} onClick=${() => onRemove(h)}>×</button></span>`);
    return html`
      <div class="fld"><span class="lbl">Pomodoro</span>
        <${L.Seg} label="Pomodoro" value=${ls.get(POMO_CFG, "50")} onChange=${(v) => { ls.set(POMO_CFG, v); L.set({}); }} options=${PRESETS} />
        <span class="hint">Minutos de trabajo / descanso. Se empieza desde la burbuja o el botón Pomodoro de arriba. El descanso suena aunque silencies los avisos.</span></div>
      <div class="fld"><span class="lbl">Pausas activas</span>
        <div class="inline wrap">${studio.horas && studio.horas.length ? html`<span class="muted">Del estudio: ${studio.horas.join(", ")}</span>` : html`<span class="muted">El estudio aún no tiene horas de pausa.</span>`}</div>
        <div class="inline wrap">${hourChips(mineH, (h) => saveMine(mineH.filter((x) => x !== h)))}
          <input type="time" class="time-in" value=${newH} onInput=${(e) => setNewH(e.target.value)} aria-label="Hora de pausa personal" />
          <button type="button" class="btn sm" disabled=${!newH} onClick=${() => { if (newH && !mineH.includes(newH)) saveMine([...mineH, newH].sort()); setNewH(""); }}>Agregar mía</button></div>
        <span class="hint">De lunes a viernes. Si estás en una reunión, la pausa espera a que termine.</span></div>
      ${director && html`<div class="fld"><span class="lbl">Pausas activas de todo el estudio</span>
        <div class="inline wrap">${hourChips(stH, (h) => saveStudio(stH.filter((x) => x !== h)))}
          <input type="time" class="time-in" value=${stNew} onInput=${(e) => setStNew(e.target.value)} aria-label="Hora de pausa del estudio" />
          <button type="button" class="btn sm" disabled=${!stNew} onClick=${() => { if (stNew && !stH.includes(stNew)) saveStudio([...stH, stNew].sort()); setStNew(""); }}>Agregar al estudio</button></div>
        <span class="hint">Solo Dirección. Le llegan a todo el equipo.</span></div>`}
      <label class="check"><input type="checkbox" checked=${ag.on} onChange=${(e) => saveAg({ ...ag, on: e.target.checked })} />
        <span><b>Recordatorio de agua</b><small>De 8 a. m. a 6:30 p. m., un globito suave cada <select class="mini-sel" value=${ag.cada} onClick=${(e) => e.preventDefault()} onChange=${(e) => saveAg({ ...ag, cada: Number(e.target.value) })}>${[45, 60, 90, 120].map((m) => html`<option key=${m} value=${m}>${m} min</option>`)}</select>
          · meta <select class="mini-sel" value=${ag.meta} onClick=${(e) => e.preventDefault()} onChange=${(e) => saveAg({ ...ag, meta: Number(e.target.value) })}>${[6, 8, 10].map((m) => html`<option key=${m} value=${m}>${m} vasos</option>`)}</select>. En la burbuja se llena tu vaso.</small></span></label>
      <label class="check"><input type="checkbox" checked=${cc.on} onChange=${(e) => saveCc({ ...cc, on: e.target.checked })} />
        <span><b>Cierre del día</b><small>A esta hora te pregunto cuánto avanzaste y qué sigue mañana: <input type="time" class="time-in" value=${cc.hora} onClick=${(e) => e.preventDefault()} onInput=${(e) => saveCc({ ...cc, hora: e.target.value || "18:00" })} /></small></span></label>
      <div class="fld"><span class="lbl">Cumpleaños</span><div class="inline">
        <select aria-label="Día" value=${cd || ""} onChange=${(e) => setCumple(cm, e.target.value)}><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => pad(i + 1)).map((d) => html`<option key=${d} value=${d}>${Number(d)}</option>`)}</select>
        <select aria-label="Mes" value=${cm || ""} onChange=${(e) => setCumple(e.target.value, cd)}><option value="">Mes</option>${L.MES_L.map((m, i) => html`<option key=${m} value=${pad(i + 1)}>${m}</option>`)}</select></div>
        <span class="hint">Solo día y mes. Ese día tu puesto tiene globos y el equipo recibe un aviso.</span></div>`;
  }

  // Aviso grande en el centro (sin tapar el resto: lo de alrededor sigue funcionando).
  function BigAlert() {
    const s = L.useStore();
    const a = s.bigAlert;
    // En el escritorio se muestra a pantalla completa (ventana aparte); aquí solo sin escritorio.
    if (!a || (L.desk && L.desk.bigAlertShow)) return null;
    const team = a.kind === "pausa" ? q.staff().filter((u) => q.presence(u) === "pausa" && q.online(u) && u.id !== s.me.id) : [];
    return html`<div class="big-alert-wrap" role="alertdialog" aria-labelledby="ba-t">
      <div class=${L.cx("big-alert glass", a.kind)} key=${a.at}>
        <${BigDoll} k=${7} pose=${a.kind === "pausa" ? "estira" : ""} />
        <div class="ba-body">
          <span class="eyebrow">${a.kind === "pausa" ? "Pausa activa del equipo" : "Pomodoro"}</span>
          <h2 id="ba-t">${a.title}</h2>
          <p>${a.body}</p>
          ${team.length > 0 && html`<p class="ba-team"><${L.Faces} ids=${team.map((u) => u.id)} max=${6} /> Ya se sumaron ${team.map((u) => L.first(u.name)).join(", ")}</p>`}
          <div class="ba-acts">${(a.actions || []).map((x, i) => html`<button type="button" key=${x.a} class=${L.cx("btn", i === 0 ? "primary" : "ghost")} onClick=${() => runAction(x.a)}>${x.label}</button>`)}</div>
          <span class="hint">${a.kind === "pausa" ? "Asistir cuenta para tu racha, tus premios y el ranking de la oficina." : "Tomar el descanso cuenta para tu racha, tus premios y el ranking."}</span>
        </div>
      </div>
    </div>`;
  }

  /* ================= ranking de la oficina ================= */
  // Puntos de la semana: entrega a tiempo 3, agradecimiento recibido 2, pausa activa asistida 1, descanso tomado 1.
  function ranking() {
    const [a, b] = weekRange(0);
    return q.staff().map((u) => {
      const pt = u.puntos && u.puntos.semana === a ? u.puntos : {};
      const entregas = L.state.tareas.filter((t) => (t.assignees || []).includes(u.id) && t.status === "terminado" && t.doneAt >= a && t.doneAt <= b && t.due && t.doneAt <= t.due).length;
      const gracias = (L.state.reconocimientos || []).filter((r) => r.para === u.id && String(r.created).slice(0, 10) >= a).length;
      const pausas = Number(pt.pausas) || 0, descansos = Number(pt.descansos) || 0;
      return { u, entregas, gracias, pausas, descansos, premios: (u.premios || []).length, total: entregas * 3 + gracias * 2 + pausas + descansos };
    }).sort((x, y) => y.total - x.total || y.premios - x.premios || (x.u.name || "").localeCompare(y.u.name || "", "es"));
  }
  function Ranking({ big = false, limit = 10 }) {
    L.useStore();
    const list = ranking().slice(0, limit);
    const medal = ["#f2c94c", "#c0c6cf", "#c8874a"];
    return html`<div class=${L.cx("ranking", big && "big")}>
      ${list.map((r, i) => html`<div class=${L.cx("rk-row", r.u.id === L.state.me.id && "me")} key=${r.u.id}>
        <span class="rk-pos" style=${i < 3 && r.total ? { background: medal[i], color: "#1f1f1f" } : null}>${i + 1}</span>
        <${L.Avatar} id=${r.u.id} cls=${big ? "lg" : ""} />
        <span class="rk-name"><b>${big ? r.u.name : L.first(r.u.name)}</b><small>${[r.entregas && L.plural(r.entregas, "entrega a tiempo", "entregas a tiempo"), r.gracias && L.plural(r.gracias, "gracias", "gracias"), (r.pausas + r.descansos) && L.plural(r.pausas + r.descansos, "pausa", "pausas")].filter(Boolean).join(" · ") || "Aún sin puntos esta semana"}</small></span>
        <span class="rk-prem">${(r.u.premios || []).slice(0, big ? 7 : 4).map((p) => html`<${PremioIcon} key=${p} id=${p} on=${true} />`)}</span>
        <span class="rk-pts"><b>${r.total}</b><small>pts</small></span>
      </div>`)}
    </div>`;
  }

  Object.assign(L, { BigAlert, Ranking, ranking, PremioIcon, BigDoll });
  Object.assign(L, { celebrate, PomodoroChip, WellAlert, PausaView, CierreView, Bienestar, Premios, WellSettings, PREMIOS, wellRun: runAction });
})();
