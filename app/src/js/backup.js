// Respaldo externo: en el PC servidor se elige la carpeta (disco externo o NAS), se ve el historial y se
// puede restaurar. Dirección ve desde cualquier PC si los respaldos se están haciendo.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q } = L;
  const { useState, useEffect } = hooks;

  const mb = (n) => (n >= 1048576 ? (n / 1048576).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const when = (iso) => { const t = Date.parse(String(iso || "").replace(" ", "T")); if (!t) return ""; const d = new Date(t); return L.fmtDay(L.iso(d)) + ", " + d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }); };
  const ago = (iso) => L.relTime(iso);

  // Lo último que registró el servidor (lo ve Dirección en cualquier PC).
  function lastLog() {
    const list = [...(L.state.respaldos || [])].sort((a, b) => String(b.created).localeCompare(String(a.created)));
    return { last: list[0] || null, lastOk: list.find((r) => r.ok) || null, count: list.length };
  }
  const stale = (iso) => !iso || Date.now() - Date.parse(String(iso).replace(" ", "T")) > 48 * 3600e3;

  // En el PC servidor, dentro del perfil.
  function BackupBox() {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(false);
    const [all, setAll] = useState(false);
    useEffect(() => {
      if (!L.desk || !L.desk.backupStatus) return;
      L.desk.backupStatus().then(setSt).catch(() => {});
      if (L.desk.onBackupChanged) L.desk.onBackupChanged(setSt);
    }, []);
    if (!st || !st.hosting) return null;
    const refresh = () => L.desk.backupStatus().then(setSt);
    const now = async () => {
      setBusy(true);
      const r = await L.desk.backupNow();
      setBusy(false); refresh();
      L.toast(r.ok ? "Respaldo listo: " + mb(r.tamano) : r.error);
    };
    const pick = async () => { try { setSt(await L.desk.backupPick()); } catch (e) { L.toast(String(e.message || e)); } };
    const restore = async (f) => {
      const r = await L.desk.backupRestore(f.name);
      if (r.canceled) return;
      if (r.ok) L.toast("Listo: el estudio volvió al respaldo del " + when(f.at) + ". Los datos de antes quedaron guardados aparte.");
      else L.toast(r.error || "No se pudo restaurar.");
      refresh();
      if (r.ok) setTimeout(() => L.act.reconnect(), 1500);
    };
    const last = st.last, files = st.files || [];
    return html`
      <div class="backup-box">
        <span class="lbl">Respaldo del estudio</span>
        <p>Una vez al día se saca una copia completa de todo el Cerebro a otra carpeta: un <b>disco externo</b> o el <b>NAS</b>. Se guardan las últimas ${st.keep}. Si la carpeta no está, se reintenta cada media hora y Dirección recibe un aviso.</p>
        <div class="bk-dir"><span class="mono">${st.dir || "Sin carpeta elegida"}</span>
          ${st.dir && html`<span class=${L.cx("bk-pill", st.reachable ? "ok" : "bad")}>${st.reachable ? "Conectada" : "No disponible"}</span>`}</div>
        ${last && html`<p class=${last.ok ? "ok-note" : "err"}>${last.ok ? `Último respaldo: ${when(last.at)} · ${mb(last.tamano)}` : last.error}${!last.ok && st.lastOk ? ` El último bueno fue el ${when(st.lastOk.at)}.` : ""}</p>`}
        ${!st.dir && html`<p class="warn-note">Todavía no hay respaldo fuera de este PC: si el disco falla se pierde todo. Elige una carpeta en un disco externo o en el NAS.</p>`}
        <div class="inline wrap">
          <button type="button" class=${L.cx("btn sm", !st.dir && "primary")} onClick=${pick}>${st.dir ? "Cambiar carpeta" : "Elegir carpeta del respaldo"}</button>
          ${st.dir && html`<button type="button" class="btn sm primary" disabled=${busy || st.running} onClick=${now}>${busy || st.running ? "Respaldando…" : "Respaldar ahora"}</button>
            <button type="button" class="btn sm ghost" onClick=${() => L.desk.backupOpen()}>Abrir carpeta</button>`}
        </div>
        ${files.length > 0 && html`
          <div class="bk-list">${(all ? files : files.slice(0, 4)).map((f) => html`<div class="bk-row" key=${f.name}><span>${when(f.at)}</span><span class="muted">${mb(f.size)}</span>
            <button type="button" class="link" onClick=${() => restore(f)}>Restaurar</button></div>`)}
            ${files.length > 4 && html`<button type="button" class="link" onClick=${() => setAll(!all)}>${all ? "Ver menos" : `Ver los ${files.length} respaldos`}</button>`}
          </div>
          <span class="hint">Restaurar vuelve todo el estudio a esa fecha. Los datos de ahora no se borran: quedan guardados aparte en este PC.</span>`}
      </div>`;
  }

  // Para Dirección en cualquier PC: cómo van los respaldos.
  function BackupSummary() {
    const s = L.useStore();
    if (!q.isDirector()) return null;
    const { last, lastOk } = lastLog();
    return html`<div class="fld"><span class="lbl">Respaldo del estudio</span>
      ${!last ? html`<p class="warn-note">Aún no se ha hecho ningún respaldo fuera del PC servidor. En ese PC: Tu perfil → Respaldo del estudio → elige un disco externo o el NAS.</p>`
        : html`<p class=${!last.ok || stale(lastOk && lastOk.created) ? "err" : "ok-note"}>${last.ok ? `Último respaldo ${ago(last.created)} · ${mb(last.tamano)} en ${last.destino}` : `Falló ${ago(last.created)}: ${last.error}`}${!last.ok && lastOk ? ` El último bueno fue ${ago(lastOk.created)}.` : ""}</p>`}</div>`;
  }

  // Aviso arriba para Dirección cuando el respaldo falla o lleva días sin hacerse.
  function BackupBanner() {
    const s = L.useStore();
    if (!q.isDirector()) return null;
    const { last, lastOk } = lastLog();
    if (!last || (last.ok && !stale(last.created))) return null;
    const msg = !last.ok ? `El último respaldo falló (${ago(last.created)}): ${last.error}` : `El estudio lleva ${ago(lastOk.created).replace("hace ", "")} sin respaldo.`;
    return html`<div class="banner glass bk-banner"><p><strong>Respaldo del estudio.</strong> ${msg}</p><button type="button" class="btn sm" onClick=${() => L.openSheet("profile", s.me.id)}>Ver</button></div>`;
  }

  Object.assign(L, { BackupBox, BackupSummary, BackupBanner });
})();
