// Marco de la app: barra de título, barra lateral, búsqueda, avisos, conexión y arranque.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, act, auth, Icon, Sym, Avatar, Faces, Pills } = L;
  const { useState, useEffect, useRef } = hooks;

  /* ---------- conexión: servidor, entrar, crear cuenta ---------- */
  function Gate() {
    const s = L.useStore();
    const g = s.gate || { mode: "server" };
    const [f, setF] = useState({ url: s.serverUrl || "", name: "", email: "", password: "", team: "", mname: "Soporte LAP" });
    const [err, setErr] = useState(g.error || "");
    const [busy, setBusy] = useState(false);
    const [found, setFound] = useState(null); // null = buscando
    const [manual, setManual] = useState(!L.desk);
    const [confirmHost, setConfirmHost] = useState(false);
    const [hosting, setHosting] = useState(false);
    const [notice] = useState(g.notice ? g.notice : g.hosted ? (g.firewall === false ? "Este PC ya es el servidor. Windows no abrió el firewall: si los demás PC no lo encuentran, ve a Tu perfil → Revisar el firewall." : "Este PC ya es el servidor del estudio. Los demás PC lo encontrarán solos.") : "");
    useEffect(() => { setErr(g.error || ""); }, [g.mode]);
    useEffect(() => {
      if (L.desk && L.desk.hostStatus) L.desk.hostStatus().then((h) => setHosting(!!(h && h.hosting))).catch(() => {});
      if (g.mode !== "server" || !L.desk) return;
      let alive = true;
      setFound(null);
      auth.discover().then((list) => { if (alive) setFound(list); });
      return () => { alive = false; };
    }, [g.mode]);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const run = async (fn) => { setBusy(true); setErr(""); const r = await fn(); setBusy(false); if (r) setErr(r); };
    const submit = (e) => {
      e.preventDefault();
      if (g.mode === "server") run(() => auth.connect(f.url));
      else if (g.mode === "login") run(() => auth.login(f.email.trim(), f.password));
      else if (g.mode === "register") run(async () => (!f.name.trim() ? "Escribe tu nombre." : !f.team ? "Elige el equipo al que perteneces." : auth.register(f.name.trim(), f.email.trim(), f.password, f.team)));
      else if (g.mode === "maestro") run(async () => {
        if (f.password.length < 10) return "La contraseña del perfil maestro necesita al menos 10 caracteres.";
        const r = await auth.maestro(f.email.trim(), f.password, f.mname.trim());
        if (!r) auth.gate("login", { notice: "Perfil maestro listo. Entra con ese correo y contraseña." });
        return r;
      });
    };
    const search = () => { setFound(null); auth.discover().then(setFound); };
    return html`
      <div class="gate"><form class="gate-card glass" onSubmit=${submit}>
        <${Sym} />
        ${g.mode === "server" && html`
          <h1><span class="sl">//</span>Conectar</h1>
          ${L.desk && html`
            <p>${found === null ? "Buscando el servidor del estudio en la red…" : found.length ? "Encontramos el servidor del estudio:" : "No encontramos el servidor del estudio en esta red."}</p>
            ${found && found.length > 0 && html`<div class="found">${found.map((x) => html`<button type="button" key=${x.url} class="btn block" disabled=${busy} onClick=${() => run(() => auth.connect(x.url))}><${Icon} name="check" /> Conectar a ${x.name} <span class="mono muted">${x.url.replace(/^https?:\/\//, "")}</span></button>`)}</div>`}
            ${found && !found.length && html`
              <div class="host-offer">
                <p><b>¿Este es el PC del servidor?</b> Elige el PC del estudio que siempre está prendido. La app arranca el servidor sola cada vez que ese PC prende, y los demás lo encuentran sin escribir nada.</p>
                ${confirmHost ? html`<div class="inline wrap"><button type="button" class="btn primary" disabled=${busy} onClick=${() => run(auth.hostHere)}>Sí, este PC será el servidor</button><button type="button" class="btn ghost" onClick=${() => setConfirmHost(false)}>Cancelar</button></div>
                  <span class="hint">Windows puede pedir permiso de administrador una vez, para dejar entrar a los demás PC.</span>` : html`<button type="button" class="btn" onClick=${() => setConfirmHost(true)}>Usar este PC como servidor del estudio</button>`}
              </div>
              <div class="alt"><button type="button" onClick=${search}>Buscar de nuevo</button><button type="button" onClick=${() => setManual(!manual)}>${manual ? "Ocultar dirección" : "Escribir la dirección a mano"}</button></div>`}`}
          ${manual && html`
            <div class="fld"><label for="g-url">Dirección del servidor</label><input id="g-url" class="mono" value=${f.url} onInput=${set("url")} placeholder="192.168.1.20:8090" autocomplete="off" /></div>
            <button class="btn primary block" type="submit" disabled=${busy || !f.url.trim()}>Conectar</button>`}
          ${g.back && html`<div class="alt"><button type="button" onClick=${auth.closeGate}>Cancelar</button></div>`}`}
        ${g.mode === "login" && html`
          <h1><span class="sl">//</span>Entrar</h1>
          ${notice ? html`<p class="ok-note">${notice}</p>` : html`<p>Usa tu cuenta del Cerebro. Es la misma en todos los PC de la oficina.</p>`}
          <div class="fld"><label for="g-email">Correo</label><input id="g-email" type="email" value=${f.email} onInput=${set("email")} autocomplete="username" required /></div>
          <div class="fld"><label for="g-pass">Contraseña</label><input id="g-pass" type="password" value=${f.password} onInput=${set("password")} autocomplete="current-password" required /></div>
          <button class="btn primary block" type="submit" disabled=${busy}>Entrar</button>
          <div class="alt"><button type="button" onClick=${() => auth.gate("register")}>Crear mi cuenta</button>
            ${hosting ? html`<button type="button" onClick=${() => auth.gate("maestro")}>Crear perfil maestro</button>` : html`<button type="button" onClick=${() => auth.gate("server")}>Cambiar de servidor</button>`}</div>`}
        ${g.mode === "register" && html`
          <h1><span class="sl">//</span>Crear cuenta</h1>
          <p>Con tu correo del estudio. Tu nombre es el que verá el equipo junto a tu trabajo.</p>
          <div class="fld"><label for="g-name">Nombre y apellido</label><input id="g-name" value=${f.name} onInput=${set("name")} autocomplete="name" required /></div>
          <div class="fld"><label for="g-email">Correo</label><input id="g-email" type="email" value=${f.email} onInput=${set("email")} autocomplete="username" placeholder="nombre@laparq.com" required /></div>
          <div class="fld"><label for="g-pass">Contraseña</label><input id="g-pass" type="password" value=${f.password} onInput=${set("password")} autocomplete="new-password" minlength="8" required /><span class="hint">Mínimo 8 caracteres.</span></div>
          <div class="fld"><span class="lbl">¿A qué equipo perteneces?</span><${Pills} options=${L.TEAMS} value=${f.team} attr="data-a" onChange=${(t) => setF({ ...f, team: t })} />
            ${f.team === "direccion" && html`<span class="hint">La Dirección creativa tiene un solo cupo. Si ya está ocupado, el registro te lo dirá.</span>`}</div>
          <button class="btn primary block" type="submit" disabled=${busy}>Crear cuenta y entrar</button>
          <div class="alt"><button type="button" onClick=${() => auth.gate("login")}>Ya tengo cuenta</button></div>`}
        ${g.mode === "maestro" && html`
          <h1><span class="sl">//</span>Perfil maestro</h1>
          <p>Cuenta de soporte por si algo falla: puede cambiar roles, corregir proyectos y aprobar planes. No aparece en el equipo. Solo se crea desde el PC que es el servidor. Si ya existe con ese correo, se le pone esta contraseña nueva.</p>
          <div class="fld"><label for="g-email">Correo</label><input id="g-email" type="email" value=${f.email} onInput=${set("email")} autocomplete="off" required /></div>
          <div class="fld"><label for="g-pass">Contraseña</label><input id="g-pass" type="password" value=${f.password} onInput=${set("password")} autocomplete="new-password" minlength="10" required /><span class="hint">Mínimo 10 caracteres. Guárdala en un lugar seguro.</span></div>
          <div class="fld"><label for="g-mname">Nombre</label><input id="g-mname" value=${f.mname} onInput=${set("mname")} /></div>
          <button class="btn primary block" type="submit" disabled=${busy}>Crear perfil maestro</button>
          <div class="alt"><button type="button" onClick=${() => auth.gate("login")}>Volver</button></div>`}
        ${err && html`<p class="err">${err}</p>`}
      </form></div>`;
  }

  /* ---------- barra lateral ---------- */
  function Sidebar() {
    const s = L.useStore();
    const r = s.route;
    const pend = q.pending();
    const nPend = pend.vistos.length + pend.reportes.length + pend.aprobar.filter((a) => a.ok === a.total).length;
    const mine = q.myProjects(s.me.id).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const item = (href, icon, label, active, badge) => html`<a href=${href} aria-current=${active ? "page" : null}><${Icon} name=${icon} /><span>${label}</span>${badge ? html`<span class="badge">${badge}</span>` : null}</a>`;
    const areaCount = (a) => s.tareas.filter((t) => t.area === a && t.status !== "terminado").length;
    return html`
      <aside class="side glass">
        <a class="brand" href="#inicio" aria-label="LAP Cerebro, inicio"><${Sym} /><span class="lap">LAP</span><span class="rule"></span><span class="prod"><b>Cerebro</b></span></a>
        <nav class="side-nav" aria-label="Principal">
          ${item("#inicio", "home", "Inicio", r.name === "inicio", nPend || null)}
          ${item("#agenda", "calendar", "Mi cronograma", r.name === "agenda")}
          ${item("#proyectos", "folder", "Proyectos", r.name === "proyectos")}
          ${item("#reuniones", "meet", "Reuniones", r.name === "reuniones" || r.name === "evento")}
          ${item("#equipo", "users", "Equipo", r.name === "equipo")}
        </nav>
        <div class="side-label">Estudio</div>
        <nav class="side-nav" aria-label="Estudio">
          ${item("#solicitudes", "out", "Solicitudes", r.name === "solicitudes", s.solicitudes.filter((x) => x.estado === "nueva" && (s.me.areas || []).includes(x.area)).length || null)}
          ${item("#horas", "clock", "Horas", r.name === "horas")}
          ${item("#ausencias", "calendar", "Ausencias", r.name === "ausencias")}
          ${item("#directorio", "users", "Directorio", r.name === "directorio")}
          ${item("#materiales", "grid", "Materiales", r.name === "materiales")}
          ${q.isFin() && item("#finanzas", "flag", "Finanzas", r.name === "finanzas")}
        </nav>
        <div class="side-label">Áreas</div>
        <nav class="side-nav" aria-label="Áreas">
          ${L.AREAS.map((a) => html`<a key=${a.id} href=${"#area/" + a.id} aria-current=${r.name === "area" && r.id === a.id ? "page" : null}><i class="area-dot" data-a=${a.id}></i><span>${a.label}</span>${areaCount(a.id) ? html`<span class="count">${areaCount(a.id)}</span>` : null}</a>`)}
        </nav>
        ${mine.length > 0 && html`<div class="side-label">Mis proyectos</div>
          <nav class="side-nav scroll" aria-label="Mis proyectos">${mine.map((p) => html`<a key=${p.id} href=${"#proyecto/" + p.id} aria-current=${r.name === "proyecto" && r.id === p.id ? "page" : null}><span class="mono code">${p.code || "··"}</span><span>${p.name}</span></a>`)}</nav>`}
        <span class="spacer"></span>
        <button type="button" class="me" onClick=${() => L.openSheet("profile", s.me.id)}>
          <${Avatar} id=${s.me.id} cls="lg" dot />
          <span><b>${s.me.name}</b><small>${s.me.role !== "miembro" ? q.roleLabel(s.me) : (s.me.areas || []).map((a) => L.AREA[a] && L.AREA[a].label).filter(Boolean).join(", ") || "Elige tu equipo"}</small></span>
        </button>
      </aside>`;
  }

  /* ---------- búsqueda rápida ---------- */
  function Search() {
    const s = L.useStore();
    const [text, setText] = useState("");
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
      const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", away);
      return () => document.removeEventListener("mousedown", away);
    }, []);
    const term = text.trim().toLowerCase();
    const has = (...v) => v.some((x) => String(x || "").toLowerCase().includes(term));
    const results = term.length < 2 ? [] : [
      ...s.proyectos.filter((p) => has(p.name, p.code, p.client)).slice(0, 4).map((p) => ({ k: "p" + p.id, icon: "folder", title: p.name, sub: "Proyecto" + (p.client ? " · " + p.client : ""), go: () => L.go("#proyecto/" + p.id) })),
      ...s.tareas.filter((t) => has(t.title, t.path, t.notes)).slice(0, 6).map((t) => ({ k: "t" + t.id, icon: "check", title: t.title, sub: L.taskMeta(t, true) || "Tarea", go: () => L.openTask(t.id) })),
      ...s.eventos.filter((e) => has(e.title)).slice(0, 3).map((e) => ({ k: "e" + e.id, icon: "meet", title: e.title, sub: L.fmtDay(e.date), go: () => L.go("#evento/" + e.id) })),
      ...q.staff().filter((u) => has(u.name, u.cargo)).slice(0, 3).map((u) => ({ k: "u" + u.id, icon: "users", title: u.name, sub: u.cargo || "Persona", go: () => L.openSheet("profile", u.id) })),
    ];
    const pick = (r) => { r.go(); setText(""); setOpen(false); };
    return html`
      <div class="search" ref=${box}>
        <${Icon} name="search" size=${14} />
        <input type="search" value=${text} placeholder="Buscar proyecto, tarea, ruta o persona" aria-label="Buscar" onInput=${(e) => { setText(e.target.value); setOpen(true); }} onFocus=${() => setOpen(true)}
          onKeyDown=${(e) => { if (e.key === "Enter" && results[0]) pick(results[0]); if (e.key === "Escape") { setOpen(false); e.target.blur(); } }} />
        ${open && term.length >= 2 && html`<div class="pop results glass">
          ${results.length ? results.map((r) => html`<button type="button" key=${r.k} onClick=${() => pick(r)}><${Icon} name=${r.icon} /><span><b>${r.title}</b><small>${r.sub}</small></span></button>`) : html`<p class="note">Nada coincide con «${text.trim()}».</p>`}
        </div>`}
      </div>`;
  }

  /* ---------- avisos ---------- */
  function Bell() {
    const s = L.useStore();
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
      const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", away);
      return () => document.removeEventListener("mousedown", away);
    }, []);
    const unread = q.unread();
    const pick = (n) => { act.readNotif(n); setOpen(false); if (n.route) L.go(n.route); };
    return html`
      <div class="bell" ref=${box}>
        <button type="button" class="btn icon" aria-label=${unread ? `Avisos, ${unread} sin leer` : "Avisos"} onClick=${() => setOpen(!open)}><${Icon} name="bell" size=${16} />${unread > 0 && html`<span class="badge">${unread > 9 ? "9+" : unread}</span>`}</button>
        ${open && html`<div class="pop notifs glass">
          <div class="pop-head"><h2><span class="sl">/</span>Avisos</h2>${unread > 0 && html`<button type="button" class="link" onClick=${act.readAll}>Marcar leídos</button>`}</div>
          <div class="pop-list">${s.notifs.length ? s.notifs.slice(0, 30).map((n) => html`
            <button type="button" key=${n.id} class=${L.cx("notif", !n.read && "unread")} onClick=${() => pick(n)}>
              <i></i><span><b>${n.title}</b>${n.body && html`<small>${n.body}</small>`}<time>${L.relTime(n.created)}</time></span>
            </button>`) : html`<p class="note">Aquí llegan las tareas que te asignan, los planes que esperan tu visto bueno, las reuniones y los recordatorios.</p>`}</div>
        </div>`}
      </div>`;
  }

  function TopBar() {
    const s = L.useStore();
    const online = q.staff().filter((u) => u.id !== s.me.id && q.online(u));
    const r = s.route;
    const defaults = r.name === "proyecto" ? { project: r.id } : r.name === "area" ? { area: r.id } : {};
    const label = { connecting: "Conectando", live: "En vivo", offline: "Sin conexión" }[s.mode] || "";
    return html`
      <header class="top">
        <${Search} />
        <span class="spacer"></span>
        ${online.length > 0 && html`<span class="online" title=${"Conectados: " + online.map((u) => u.name).join(", ")}><${Faces} ids=${online.map((u) => u.id)} max=${5} /></span>`}
        <span class="sync" data-mode=${s.mode} title=${s.mode === "live" ? "Los cambios se comparten con todo el equipo al instante." : "Reintentando la conexión con el servidor."}><i></i><span>${label}</span></span>
        <button type="button" class="btn icon" title=${"Modo: " + L.THEMES.find((t) => t.id === s.theme).label + ". Clic para cambiar."} aria-label="Cambiar entre modo claro, oscuro o el del sistema"
          onClick=${() => { const i = L.THEMES.findIndex((t) => t.id === s.theme); L.setTheme(L.THEMES[(i + 1) % L.THEMES.length].id); }}>
          <${Icon} name=${s.theme === "light" ? "sun" : s.theme === "dark" ? "moon" : "contrast"} size=${16} /></button>
        <${Bell} />
        <button type="button" class="btn primary" onClick=${() => L.openSheet("task", null, defaults)}><${Icon} name="plus" size=${12} /> Nueva tarea</button>
      </header>`;
  }

  function Banners() {
    const s = L.useStore();
    const sample = s.proyectos.some((p) => p.sample);
    return html`
      ${s.update && html`<div class="banner glass update"><p><strong>LAP Cerebro ${s.update} está lista.</strong> Se instala al reiniciar la app; tarda unos segundos y vuelve a abrir sola.</p><button type="button" class="btn sm primary" onClick=${() => L.desk.installUpdate()}>Reiniciar y actualizar</button></div>`}
      ${s.mode === "offline" && html`<div class="banner glass"><p><strong>Sin conexión con el servidor.</strong> Lo que ves puede estar desactualizado. La app reintenta sola cada minuto.</p><button type="button" class="btn sm" onClick=${act.reconnect}>Reintentar ahora</button></div>`}
      ${sample && html`<div class="banner glass"><p><strong>Hay proyectos de ejemplo.</strong> Torre Alameda y Casa Encinos son ficticios, para ver cómo funciona todo.</p><button type="button" class="btn sm" onClick=${act.clearSample}>Borrar ejemplos</button></div>`}`;
  }

  function View() {
    const s = L.useStore();
    const r = s.route;
    switch (r.name) {
      case "agenda": return html`<${L.Agenda} />`;
      case "proyectos": return html`<${L.Proyectos} />`;
      case "proyecto": return html`<${L.Proyecto} key=${r.id} id=${r.id} tab=${r.tab} />`;
      case "reuniones": return html`<${L.Reuniones} />`;
      case "evento": return html`<${L.Evento} key=${r.id} id=${r.id} />`;
      case "area": return html`<${L.Area} key=${r.id} id=${r.id} />`;
      case "equipo": return html`<${L.Equipo} />`;
      case "solicitudes": return html`<${L.Solicitudes} />`;
      case "directorio": return html`<${L.Directorio} />`;
      case "materiales": return html`<${L.Materiales} />`;
      case "horas": return html`<${L.Horas} />`;
      case "ausencias": return html`<${L.Ausencias} />`;
      case "finanzas": return html`<${L.Finanzas} />`;
      case "revision": return html`<${L.RevisionView} key=${r.id} id=${r.id} />`;
      default: return html`<${L.Inicio} />`;
    }
  }

  function Root() {
    const s = L.useStore();
    const main = useRef(null);
    useEffect(() => { if (main.current) main.current.scrollTop = 0; }, [s.route.name, s.route.id]);
    const live = s.me && (s.mode === "live" || s.mode === "offline" || (s.mode === "gate" && s.gate && s.gate.back));
    return html`
      <div class="titlebar">
        <${Sym} cls="tb-sym" /><b>LAP</b><span>Cerebro</span><span class="spacer"></span>
        ${s.me && html`<span class="tb-user">${s.me.name} · ${s.serverUrl.replace(/^https?:\/\//, "")}</span>`}
      </div>
      ${live ? html`
        <div class="app">
          <${Sidebar} />
          <main class="main" ref=${main}><${TopBar} /><${Banners} /><${View} /></main>
        </div>
        <${L.SheetHost} />` : s.mode === "gate" ? null : html`<div class="boot"><${Sym} /><p>Conectando con el estudio…</p></div>`}
      ${s.mode === "gate" && html`<${Gate} key=${s.gate.mode} />`}
      ${s.toast && html`<div class="toast" role="status">${s.toast}</div>`}`;
  }

  L.parseRoute();
  L.render(html`<${Root} />`, document.getElementById("root"));
  L.boot();
})();
