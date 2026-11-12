// Estados (disponible, no molestar, en reunión, almuerzo, fuera) y "tocar el hombro".
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, Avatar, Icon } = L;
  const { useState, useEffect, useRef } = hooks;

  const Dot = ({ id }) => html`<i class="pres-dot" style=${{ background: (L.PRESENCIA[id] || L.PRESENCIA.disponible).color }}></i>`;

  // Botón en la barra superior para cambiar el estado sin abrir la burbuja.
  function PresenceChip() {
    const s = L.useStore();
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
      const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", away);
      return () => document.removeEventListener("mousedown", away);
    }, []);
    const cur = q.presenceInfo(s.me);
    const pick = (id) => { setOpen(false); if (id !== cur.id) act.setPresence(id); };
    return html`
      <div class="pres" ref=${box}>
        <button type="button" class="btn pres-btn" aria-haspopup="menu" aria-expanded=${open} title="Tu estado: lo ve el equipo y decide si te llegan globitos y sonido" onClick=${() => setOpen(!open)}>
          <${Dot} id=${cur.id} /><span>${cur.label}</span></button>
        ${open && html`<div class="pop pres-pop glass" role="menu">
          ${L.PRESENCIAS.map((p) => html`<button type="button" key=${p.id} role="menuitemradio" aria-checked=${p.id === cur.id} onClick=${() => pick(p.id)}>
            <${Dot} id=${p.id} /><span><b>${p.label}</b>${p.hint && html`<small>${p.hint}</small>`}</span></button>`)}
        </div>`}
      </div>`;
  }

  // Tocar el hombro: un mensaje corto opcional; la otra persona responde "Voy", "En 10 min" o "Ahora no".
  const QUICK = ["¿Tienes 5 minutos?", "Ven a mi puesto", "Revisemos esto juntos", "Te necesito en la sala de juntas"];
  function ToqueSheet({ id }) {
    const u = q.user(id);
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    if (!u) return null;
    const pres = q.presenceInfo(u);
    const quiet = pres.id === "no_molestar" || pres.id === "reunion";
    const send = async () => {
      setBusy(true);
      const r = await act.toque(u.id, msg.trim());
      setBusy(false);
      if (r) { L.toast(`Le tocaste el hombro a ${L.first(u.name)}`); L.closeSheet(); }
    };
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary" disabled=${busy}>Tocar el hombro</button>`;
    return html`<${L.Sheet} title="Tocar el hombro" onClose=${L.closeSheet} onSubmit=${send} footer=${footer}>
      <div class="profile-head"><${Avatar} id=${u.id} cls="xl" dot /><div><b>${u.name}</b><span class="muted"><${Dot} id=${pres.id} /> ${pres.label}${!q.online(u) ? " · no está conectado" : ""}</span></div></div>
      ${quiet && html`<p class=${q.isDirector() ? "ok-note" : "warn-note"}>${q.isDirector()
        ? `${L.first(u.name)} está en «${pres.label}», pero como eres Dirección le llega igual, con sonido.`
        : `${L.first(u.name)} está en «${pres.label}»: le llega sin sonido ni globito y lo verá cuando se desocupe.`}</p>`}
      ${!q.online(u) && html`<p class="warn-note">${L.first(u.name)} no tiene la app abierta: lo verá al conectarse.</p>`}
      <div class="fld"><label for="tq-msg">Mensaje (opcional)</label><input id="tq-msg" value=${msg} maxlength="200" placeholder="¿Tienes 5 minutos?" onInput=${(e) => setMsg(e.target.value)} /></div>
      <div class="qchips">${QUICK.map((t) => html`<button type="button" key=${t} class="qchip" aria-pressed=${msg === t} onClick=${() => setMsg(t)}>${t}</button>`)}</div>
      <p class="note">Le llega en su burbuja, aunque tenga la app minimizada, con tres botones para responderte: Voy, En 10 min o Ahora no.</p>
    <//>`;
  }

  // Botones de respuesta para un toque recibido (en la lista de avisos).
  function ToqueReply({ n }) {
    if (n.kind !== "toque" || n.respuesta) return null;
    const r = (v) => (e) => { e.stopPropagation(); act.replyToque(n, v); };
    return html`<div class="toque-acts"><button type="button" class="btn sm primary" onClick=${r("voy")}>Voy</button><button type="button" class="btn sm" onClick=${r("10")}>En 10 min</button><button type="button" class="btn sm ghost" onClick=${r("no")}>Ahora no</button></div>`;
  }

  // Ajustes del perfil: estado, burbuja y sonido.
  function DeskSettings() {
    const s = L.useStore();
    const cur = q.presence(s.me);
    return html`
      <div class="fld"><span class="lbl">Tu estado</span>
        <div class="pres-pills">${L.PRESENCIAS.map((p) => html`<button type="button" key=${p.id} class="pill" aria-pressed=${p.id === cur} onClick=${() => act.setPresence(p.id)}><${Dot} id=${p.id} /> ${p.label}</button>`)}</div>
        <span class="hint">${(L.PRESENCIA[cur] || {}).hint || "El equipo te ve disponible. Los avisos llegan con globito y sonido."} Las reuniones agendadas en la app te ponen «En reunión» solas.</span></div>
      ${L.desk && L.desk.setBubbleVisible && html`<label class="check"><input type="checkbox" checked=${s.bubbleVisible} onChange=${(e) => { L.set({ bubbleVisible: e.target.checked }); L.desk.setBubbleVisible(e.target.checked); }} />
        <span><b>Burbuja en la pantalla</b><small>Tu muñeco queda en el borde de la pantalla aunque minimices la app: ahí llegan los avisos y cambias tu estado. Arrástralo al borde que quieras.</small></span></label>`}
      <label class="check"><input type="checkbox" checked=${!s.muted} onChange=${(e) => act.setMuted(!e.target.checked)} />
        <span><b>Sonido de los avisos</b><small>Un tono suave para lo normal y otro más notorio para lo urgente (cambios de fecha y mensajes de Dirección), que suena aunque silencies.</small></span></label>
      <div class="inline"><button type="button" class="btn sm" onClick=${() => act.testSound(false)}>Probar sonido normal</button><button type="button" class="btn sm" onClick=${() => act.testSound(true)}>Probar sonido urgente</button></div>`;
  }

  Object.assign(L, { PresenceChip, ToqueSheet, ToqueReply, DeskSettings, PresDot: Dot });
})();
