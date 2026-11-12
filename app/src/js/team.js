// Equipo: reconocimientos entre compañeros, anuncios de Dirección, bienvenida guiada y
// "cuánto tardan las cosas de verdad" (estadística simple de las tareas terminadas, sin IA).
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Avatar } = L;
  const { useState } = hooks;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bloqueado */ } },
  };

  /* ================= reconocimientos ================= */
  const GRACIAS = ["por ayudarme con los planos", "por el render, quedó increíble", "por cubrirme en la reunión", "por la buena energía", "por resolver lo de la licencia"];
  function GraciasSheet({ id }) {
    const u = q.user(id);
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    if (!u) return null;
    const send = async () => {
      const m = msg.trim();
      if (!m) { L.toast("Escribe por qué le das las gracias."); return; }
      setBusy(true);
      const r = await act.save("reconocimientos", null, { de: L.state.me.id, para: u.id, mensaje: "Gracias " + m.replace(/^gracias\s*/i, "") });
      setBusy(false);
      if (r) { L.toast(`Le diste las gracias a ${L.first(u.name)}`); L.closeSheet(); }
    };
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary" disabled=${busy}>Dar las gracias</button>`;
    return html`<${L.Sheet} title="Dar las gracias" onClose=${L.closeSheet} onSubmit=${send} footer=${footer}>
      <div class="profile-head"><${Avatar} id=${u.id} cls="xl" /><div><b>${u.name}</b><span class="muted">Le llega a su burbuja con confeti y lo ve todo el equipo.</span></div></div>
      <div class="fld"><label for="gr-msg">Gracias…</label><input id="gr-msg" value=${msg} maxlength="270" placeholder="por ayudarme con los planos" onInput=${(e) => setMsg(e.target.value)} /></div>
      <div class="qchips">${GRACIAS.map((t) => html`<button type="button" key=${t} class="qchip" aria-pressed=${msg === t} onClick=${() => setMsg(t)}>${t}</button>`)}</div>
      <p class="note">Con 5 agradecimientos su muñeco gana la medalla de compañerismo.</p>
    <//>`;
  }
  const graciasPara = (uid) => (L.state.reconocimientos || []).filter((r) => r.para === uid);
  function Reconocimientos() {
    const s = L.useStore();
    const list = [...(s.reconocimientos || [])].sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 12);
    return html`<${L.Panel} title="Agradecimientos" cls="span-12" action=${html`<span class="tag">Dale las gracias a alguien desde su perfil o en la oficina</span>`}>
      <div class="kudos">${list.length ? list.map((r) => html`<div class="kudo" key=${r.id}><${Avatar} id=${r.de} /><span class="arrow">→</span><${Avatar} id=${r.para} />
        <span><b>${L.first(q.name(r.de))} a ${L.first(q.name(r.para))}</b><small>${r.mensaje}</small><time>${L.relTime(r.created)}</time></span></div>`)
        : html`<p class="note">Todavía nadie ha dado las gracias aquí. Abre el perfil de un compañero y toca «Dar las gracias».</p>`}</div>
    <//>`;
  }

  /* ================= anuncios ================= */
  const activos = () => (L.state.anuncios || []).filter((a) => a.hasta >= L.todayIso()).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  function AnuncioSheet({ id }) {
    const prev = id ? (L.state.anuncios || []).find((a) => a.id === id) : null;
    const [f, setF] = useState(() => ({ texto: prev ? prev.texto : "", hasta: prev ? prev.hasta : L.iso(L.addDays(L.today(), 3)), importante: prev ? !!prev.importante : false }));
    const save = async () => {
      if (!f.texto.trim()) { L.toast("Escribe el anuncio."); return; }
      const r = await act.save("anuncios", id || null, { texto: f.texto.trim(), hasta: f.hasta || L.todayIso(), importante: !!f.importante, by: L.state.me.id });
      if (r) { L.toast(id ? "Anuncio actualizado" : "Anuncio publicado: le llega a todo el equipo"); L.closeSheet(); }
    };
    const remove = async () => { if (await act.remove("anuncios", id)) { L.toast("Anuncio quitado"); L.closeSheet(); } };
    const footer = html`${id && html`<${L.DeleteButton} onConfirm=${remove} />`}<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary">${id ? "Guardar" : "Publicar"}</button>`;
    return html`<${L.Sheet} title=${id ? "Anuncio" : "Nuevo anuncio"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      <div class="fld"><label for="an-t">Anuncio</label><textarea id="an-t" maxlength="400" value=${f.texto} onInput=${(e) => setF({ ...f, texto: e.target.value })} placeholder="El viernes cerramos a las 3 p. m."></textarea></div>
      <div class="two"><div class="fld"><label for="an-h">Se muestra hasta</label><input id="an-h" type="date" value=${f.hasta} onInput=${(e) => setF({ ...f, hasta: e.target.value })} /></div>
        <label class="check"><input type="checkbox" checked=${f.importante} onChange=${(e) => setF({ ...f, importante: e.target.checked })} /><span><b>Importante</b><small>Suena y aparece aunque estén en No molestar.</small></span></label></div>
      <p class="note">Llega a la burbuja de todos, queda arriba en la app y en la pantalla de la oficina hasta esa fecha.</p>
    <//>`;
  }
  const HIDE = "lap-cerebro-anuncios-vistos";
  function AnunciosBanner() {
    const s = L.useStore();
    const [hidden, setHidden] = useState(() => ls.get(HIDE, []));
    const list = activos().filter((a) => !hidden.includes(a.id));
    if (!list.length) return null;
    const hide = (id) => { const h = [...hidden, id].slice(-50); setHidden(h); ls.set(HIDE, h); };
    return html`${list.slice(0, 2).map((a) => html`<div key=${a.id} class=${L.cx("banner glass anuncio", a.importante && "imp")}>
      <p><strong>${a.importante ? "Importante · " : ""}Anuncio de ${L.first(q.name(a.by))}:</strong> ${a.texto}</p>
      <div class="inline">${q.isDirector() && html`<button type="button" class="btn sm ghost" onClick=${() => L.openSheet("anuncio", a.id)}>Editar</button>`}<button type="button" class="btn sm" onClick=${() => hide(a.id)}>Entendido</button></div></div>`)}`;
  }

  /* ================= bienvenida ================= */
  const WELCOME_OFF = "lap-cerebro-bienvenida-oculta";
  const mark = (k) => { const v = ls.get("lap-cerebro-bienvenida", {}); if (!v[k]) { v[k] = true; ls.set("lap-cerebro-bienvenida", v); } };
  window.addEventListener("hashchange", () => { const h = location.hash; if (h.startsWith("#oficina")) mark("oficina"); if (h.startsWith("#semana")) mark("semana"); });
  L.welcomeMark = mark;
  function Bienvenida() {
    const s = L.useStore();
    const [off, setOff] = useState(() => ls.get(WELCOME_OFF, false));
    if (off || !s.me) return null;
    const v = ls.get("lap-cerebro-bienvenida", {});
    if (s.me.taskId) mark("tarea");
    if (q.presence(s.me) !== "disponible") mark("estado");
    const steps = [
      { k: "muneco", ok: !!(s.me.muneco && s.me.muneco.ropa), t: "Arma tu muñeco", d: "Peinado, pelo, piel y un color de ropa solo tuyo.", go: () => L.openSheet("muneco") },
      { k: "cumple", ok: !!s.me.cumple, t: "Pon tu cumpleaños", d: "Solo día y mes, en tu perfil.", go: () => L.openSheet("profile", s.me.id) },
      { k: "oficina", ok: !!v.oficina, t: "Conoce la oficina", d: "Camina con las flechas; los agentes viven en el laboratorio.", go: () => L.go("#oficina") },
      { k: "estado", ok: !!v.estado, t: "Cambia tu estado", d: "Desde la burbuja del borde de la pantalla o el botón de arriba.", go: () => L.toast("Haz clic en tu muñeco en el borde de la pantalla, o en tu estado arriba a la derecha.") },
      { k: "tarea", ok: !!v.tarea, t: "Marca en qué trabajas", d: "Abre una tarea y toca «Estoy trabajando en esto».", go: () => L.go("#agenda") },
      { k: "semana", ok: !!v.semana, t: "Mira tu semana", d: "Lo que vence, lo bloqueado y quién no estará.", go: () => L.go("#semana") },
    ];
    const done = steps.filter((x) => x.ok).length;
    if (done === steps.length) return null;
    const hide = () => { ls.set(WELCOME_OFF, true); setOff(true); };
    return html`<${L.Panel} title="Bienvenida al Cerebro" cls="span-12 welcome" action=${html`<span class="inline"><span class="tag">${done} de ${steps.length}</span><button type="button" class="link" onClick=${hide}>Ocultar</button></span>`}>
      <div class="steps">${steps.map((x) => html`<button type="button" key=${x.k} class=${L.cx("step", x.ok && "ok")} onClick=${x.go} disabled=${x.ok}><i>${x.ok ? "✓" : ""}</i><span><b>${x.t}</b><small>${x.d}</small></span></button>`)}</div>
    <//>`;
  }

  /* ================= cuánto tardan las cosas de verdad ================= */
  // Días hábiles (lunes a viernes) entre dos fechas, contando ambas.
  function bdays(a, b) {
    let d = L.parse(a); const e = L.parse(b);
    if (!d || !e) return null;
    if (e < d) return 1;
    let n = 0;
    for (let i = 0; i < 400 && d <= e; i++) { const w = d.getDay(); if (w > 0 && w < 6) n++; d = L.addDays(d, 1); }
    return Math.max(1, n);
  }
  function addBdays(a, n) {
    let d = L.parse(a); if (!d) return "";
    let left = Math.max(0, n - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d = L.addDays(d, 1);
    while (left > 0) { d = L.addDays(d, 1); if (d.getDay() > 0 && d.getDay() < 6) left--; }
    return L.iso(d);
  }
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  function rows(filter) {
    const out = [];
    for (const t of L.state.tareas) {
      if (t.status !== "terminado" || !t.doneAt || (filter && !filter(t))) continue;
      const start = t.start || String(t.created || "").slice(0, 10);
      const real = bdays(start, t.doneAt); if (!real || real > 260) continue;
      const plan = t.due ? bdays(start, t.due) : null;
      out.push({ t, kind: t.kind || "otro", real, plan, onTime: t.due ? t.doneAt <= t.due : null });
    }
    return out;
  }
  function stats(list) {
    const withDue = list.filter((r) => r.onTime !== null);
    const diffs = list.filter((r) => r.plan).map((r) => r.real - r.plan);
    return { n: list.length, real: median(list.map((r) => r.real)), plan: median(list.filter((r) => r.plan).map((r) => r.plan)), onTime: withDue.length ? Math.round((withDue.filter((r) => r.onTime).length / withDue.length) * 100) : null, diff: median(diffs) };
  }
  // Sugerencia para una tarea nueva: con el historial de la persona si tiene al menos 3 de ese tipo; si no, del estudio.
  function suggest(kind, assignees, start) {
    if (!kind || !start) return null;
    const uid = (assignees || [])[0];
    const mine = uid ? rows((t) => (t.kind || "otro") === kind && (t.assignees || []).includes(uid)) : [];
    const all = rows((t) => (t.kind || "otro") === kind);
    const use = mine.length >= 3 ? mine : all.length >= 3 ? all : null;
    if (!use) return null;
    const st = stats(use);
    return { ...st, who: use === mine ? L.first(q.name(uid)) : "el estudio", due: addBdays(start, st.real) };
  }
  function DurationHint({ kind, assignees, start, due, onUse }) {
    const sg = suggest(kind, assignees, start);
    if (!sg) return null;
    const planned = due ? bdays(start, due) : null;
    const short = planned && planned < sg.real;
    const label = (L.KIND[kind] || { label: "Esto" }).label;
    return html`<div class=${L.cx("dur-hint", short && "warn")}>
      <p>${label} suele tomar <b>${L.plural(sg.real, "día hábil", "días hábiles")}</b> (${sg.who}, ${L.plural(sg.n, "tarea terminada", "tareas terminadas")}${sg.onTime !== null ? `, ${sg.onTime}% a tiempo` : ""}).
        ${short ? ` Así como está tiene ${L.plural(planned, "día", "días")}: puede quedar corto.` : ""}</p>
      ${sg.due && sg.due !== due && html`<button type="button" class="btn sm" onClick=${() => onUse(sg.due)}>Entregar el ${L.fmtDay(sg.due)}</button>`}
    </div>`;
  }
  // Vista "Duraciones" dentro de la línea de tiempo.
  function Duraciones() {
    const s = L.useStore();
    const [who, setWho] = useState("");
    const list = rows(who ? (t) => (t.assignees || []).includes(who) : null);
    const kindOf = (r) => (L.KIND[r.kind] ? r.kind : "otro");
    const kinds = L.KINDS.map((k) => ({ k: k.id === "otro" ? { ...k, label: "Otro o sin tipo" } : k, st: stats(list.filter((r) => kindOf(r) === k.id)) })).filter((x) => x.st.n);
    const all = stats(list);
    const d = (n) => (n === null ? "—" : L.plural(n, "día", "días"));
    return html`
      <div class="toolbar"><select value=${who} onChange=${(e) => setWho(e.target.value)} aria-label="Persona"><option value="">Todo el estudio</option>${q.staff().map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}</select>
        <span class="muted light">Con las tareas terminadas: cuántos días hábiles tomaron de verdad contra los que se planearon.</span></div>
      <div class="glass dur-table" role="table">
        <div class="dur-row head" role="row"><span>Tipo</span><span>Terminadas</span><span>Se planean</span><span>Toman de verdad</span><span>A tiempo</span><span>Desvío típico</span></div>
        ${kinds.map(({ k, st }) => html`<div class="dur-row" role="row" key=${k.id}><span><b>${k.label}</b></span><span class="mono">${st.n}</span><span>${d(st.plan)}</span><span><b>${d(st.real)}</b></span>
          <span class=${st.onTime !== null && st.onTime < 60 ? "late" : ""}>${st.onTime === null ? "—" : st.onTime + "%"}</span><span class=${st.diff > 0 ? "late" : ""}>${st.diff === null ? "—" : st.diff > 0 ? "+" + d(st.diff) : st.diff < 0 ? "−" + d(-st.diff) : "justo"}</span></div>`)}
        ${!kinds.length && html`<p class="note pad">Todavía no hay tareas terminadas con fechas. Con el uso, aquí aparece cuánto toma cada tipo de trabajo.</p>`}
        ${kinds.length > 0 && html`<div class="dur-row foot" role="row"><span><b>Todo</b></span><span class="mono">${all.n}</span><span>${d(all.plan)}</span><span><b>${d(all.real)}</b></span><span>${all.onTime === null ? "—" : all.onTime + "%"}</span><span>${all.diff === null ? "—" : all.diff > 0 ? "+" + d(all.diff) : all.diff < 0 ? "−" + d(-all.diff) : "justo"}</span></div>`}
      </div>
      <p class="hint">Es la mediana (el valor del medio), así una tarea que se alargó mucho no distorsiona el resto. Al crear una tarea con tipo y fecha de inicio, la app sugiere una entrega realista.</p>`;
  }

  Object.assign(L, { GraciasSheet, Reconocimientos, graciasPara, AnuncioSheet, AnunciosBanner, anunciosActivos: activos, Bienvenida, DurationHint, Duraciones, durSuggest: suggest });
})();
