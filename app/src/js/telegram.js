// Telegram en el perfil: cada persona vincula su chat con el bot del estudio, y Dirección conecta el bot.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks } = L;
  const { useState, useEffect } = hooks;

  function TelegramBox() {
    const s = L.useStore();
    const [st, setSt] = useState(null);       // estado que manda el servidor
    const [cod, setCod] = useState(null);     // { codigo, link } mientras se vincula
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [token, setToken] = useState("");
    const [cfgOpen, setCfgOpen] = useState(false);
    const dir = L.q.isDirector();
    const load = () => L.act.telegram("").then((r) => { setSt(r); if (r.vinculado) setCod(null); return r; }).catch(() => setSt({ error: "sin-servidor" }));
    useEffect(() => { load(); }, []);
    // Mientras está el código en pantalla, revisa cada 3 s si ya se vinculó.
    useEffect(() => { if (!cod) return; const id = setInterval(load, 3000); return () => clearInterval(id); }, [cod]);
    const call = async (fn) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr(L.errMsg(e)); } setBusy(false); };

    if (!st) return html`<div class="fld"><span class="lbl">Telegram</span><span class="muted">Cargando…</span></div>`;
    if (st.error === "sin-servidor") return html`<div class="fld"><span class="lbl">Telegram</span><span class="hint">El servidor del estudio todavía no tiene esta función. Se activa cuando el NAS se actualice.</span></div>`;

    const conectar = () => call(async () => { const r = await L.act.telegram("/config", "POST", { token: token.trim() }); setToken(""); setCfgOpen(false); L.toast("Bot conectado: @" + r.botUser); await load(); });
    const desconectar = () => call(async () => { await L.act.telegram("/config", "DELETE"); await load(); });
    const config = dir && html`<div class="tg-cfg">
      ${st.configurado && !cfgOpen
        ? html`<p class="hint">Bot del estudio: <b>@${st.botUser}</b>${st.error ? html` · <span class="err">Problema: ${st.error}</span>` : ""}</p>
          <div class="inline wrap"><button type="button" class="btn sm ghost" onClick=${() => setCfgOpen(true)}>Cambiar la clave del bot</button><button type="button" class="btn sm ghost danger" disabled=${busy} onClick=${desconectar}>Desconectar el bot</button></div>`
        : html`<p class="hint">${st.configurado ? "Pega la nueva clave del bot." : "Para que el equipo use Telegram, crea el bot una vez: en Telegram busca @BotFather, envíale /newbot, ponle un nombre (por ejemplo LAP Cerebro) y copia aquí la clave que te da."}</p>
          <div class="inline"><input type="password" autocomplete="off" placeholder="Clave del bot (123456789:AA…)" value=${token} onInput=${(e) => setToken(e.target.value)} />
          <button type="button" class="btn sm primary" disabled=${busy || !token.trim()} onClick=${conectar}>${busy ? "Conectando…" : "Conectar"}</button>${st.configurado && html`<button type="button" class="btn sm ghost" onClick=${() => setCfgOpen(false)}>Cancelar</button>`}</div>
          <span class="hint">La clave queda guardada solo en el servidor; nadie del equipo la puede ver.</span>`}
    </div>`;

    let mio;
    if (!st.configurado) mio = !dir && html`<span class="hint">Dirección todavía no ha conectado el bot de Telegram del estudio.</span>`;
    else if (st.vinculado) {
      mio = html`<p class="hint">Vinculado${st.username ? html` como <b>${st.username}</b>` : ""} con <b>@${st.botUser}</b>. Desde allí ves tus tareas, las entregas y cambias tu estado.</p>
        <${L.Seg} label="Avisos por Telegram" value=${st.avisos} onChange=${(v) => call(async () => { await L.act.telegram("/avisos", "POST", { avisos: v }); await load(); })}
          options=${[{ id: "fuera", label: "Cuando no estoy en el PC" }, { id: "siempre", label: "Siempre" }, { id: "nunca", label: "Nunca" }]} />
        <div class="inline"><button type="button" class="btn sm ghost danger" disabled=${busy} onClick=${() => call(async () => { await L.act.telegram("/desvincular", "POST"); await load(); })}>Desvincular</button></div>`;
    } else if (cod) {
      mio = html`<p class="hint">Abre el bot y toca <b>Iniciar</b>. Si no se abre, búscalo en Telegram como <b>@${cod.botUser}</b> y envíale este código:</p>
        <div class="inline wrap"><a class="btn sm primary" href=${cod.link} target="_blank" rel="noopener">Abrir Telegram</a><span class="tg-code mono">${cod.codigo}</span></div>
        <span class="hint">El código vence en 30 minutos. Esta ventana se actualiza sola al vincular.</span>`;
    } else {
      mio = html`<p class="hint">Recibe avisos, mira tus tareas, entrégalas y cambia tu estado desde el celular, aunque estés en obra.</p>
        <div class="inline"><button type="button" class="btn sm" disabled=${busy} onClick=${() => call(async () => setCod(await L.act.telegram("/codigo", "POST")))}>Vincular mi Telegram</button></div>`;
    }
    return html`<div class="fld tg-box"><span class="lbl">Telegram</span>${mio}${config}${err && html`<span class="err">${err}</span>`}</div>`;
  }

  Object.assign(L, { TelegramBox });
})();
