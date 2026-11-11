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
    const [f, setF] = useState({ url: s.serverUrl || "", name: "", email: "", password: "", team: "" });
    const [err, setErr] = useState(g.error || "");
    const [busy, setBusy] = useState(false);
    useEffect(() => { setErr(g.error || ""); }, [g.mode]);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const submit = async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      let r = "";
      if (g.mode === "server") r = await auth.connect(f.url);
      else if (g.mode === "login") r = await auth.login(f.email.trim(), f.password);
      else r = !f.name.trim() ? "Escribe tu nombre." : !f.team ? "Elige el equipo al que perteneces." : await auth.register(f.name.trim(), f.email.trim(), f.password, f.team);
      setBusy(false);
      if (r) setErr(r);
    };
    return html`
      <div class="gate"><form class="gate-card glass" onSubmit=${submit}>
        <${Sym} />
        ${g.mode === "server" && html`
          <h1><span class="sl">//</span>Conectar</h1>
          <p>Escribe la dirección del servidor del Cerebro en la oficina. Te la da quien lo instaló, por ejemplo <span class="mono">192.168.1.20:8090</span>.</p>
          <div class="fld"><label for="g-url">Servidor</label><input id="g-url" class="mono" value=${f.url} onInput=${set("url")} placeholder="192.168.1.20:8090" autocomplete="off" required /></div>
          <button class="btn primary block" type="submit" disabled=${busy}>Conectar</button>
          ${g.back && html`<div class="alt"><button type="button" onClick=${auth.closeGate}>Cancelar</button></div>`}`}
        ${g.mode === "login" && html`
          <h1><span class="sl">//</span>Entrar</h1>
          <p>Usa tu cuenta del Cerebro. Es la misma en todos los PC de la oficina.</p>
          <div class="fld"><label for="g-email">Correo</label><input id="g-email" type="email" value=${f.email} onInput=${set("email")} autocomplete="username" required /></div>
          <div class="fld"><label for="g-pass">Contraseña</label><input id="g-pass" type="password" value=${f.password} onInput=${set("password")} autocomplete="current-password" required /></div>
          <button class="btn primary block" type="submit" disabled=${busy}>Entrar</button>
          <div class="alt"><button type="button" onClick=${() => auth.gate("register")}>Crear mi cuenta</button><button type="button" onClick=${() => auth.gate("server")}>Cambiar de servidor</button></div>`}
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
