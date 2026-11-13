// Libretas: páginas de bloques (como Notion) y tableros libres (un mini Miro), personales o compartidas
// con permiso de ver o de editar. Cada persona tiene además su libreta personal, su página de inicio.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks } = L;
  const { useState, useEffect, useRef, useLayoutEffect } = hooks;
  const q = () => L.q;
  const act = () => L.act;
  const Icon = (p) => html`<${L.Icon} ...${p} />`;

  /* ---------- menciones: @[Nombre](u:ID) y @[Código](p:ID) ---------- */
  const MENTION = /@\[([^\]]{1,80})\]\(([up]):([a-z0-9]{15})\)/g;
  const URL_RE = /(https?:\/\/[^\s<]+)/g;
  // Texto con menciones y enlaces convertidos en chips (para mostrar, no para editar).
  function Rich({ text }) {
    const out = [];
    const src = String(text || "");
    let last = 0, m;
    const pushText = (t) => {
      let l2 = 0, u;
      URL_RE.lastIndex = 0;
      while ((u = URL_RE.exec(t))) {
        if (u.index > l2) out.push(t.slice(l2, u.index));
        const href = u[1];
        out.push(html`<a class="rich-link" href=${href} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>${href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</a>`);
        l2 = u.index + href.length;
      }
      if (l2 < t.length) out.push(t.slice(l2));
    };
    MENTION.lastIndex = 0;
    while ((m = MENTION.exec(src))) {
      if (m.index > last) pushText(src.slice(last, m.index));
      const [, label, kind, id] = m;
      out.push(kind === "u"
        ? html`<button type="button" class="mention" onClick=${(e) => { e.stopPropagation(); L.openSheet("profile", id); }}>@${label}</button>`
        : html`<a class="mention" href=${"#proyecto/" + id} onClick=${(e) => e.stopPropagation()}>@${label}</a>`);
      last = m.index + m[0].length;
    }
    if (last < src.length) pushText(src.slice(last));
    return html`${out}`;
  }
  const plainText = (t) => String(t || "").replace(MENTION, "@$1");

  // Área de texto que crece sola y sugiere personas y proyectos al escribir @.
  function MentionArea({ value, onInput, onKeyDown, onBlur, onFocus, placeholder, cls, inputRef, autoFocus, disabled }) {
    const ref = useRef(null);
    const [pick, setPick] = useState(null); // { q, start, idx }
    const el = () => (inputRef && inputRef.current) || ref.current;
    const grow = () => { const t = el(); if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } };
    useLayoutEffect(grow, [value]);
    useEffect(() => { if (autoFocus && el()) { el().focus(); const n = el().value.length; el().setSelectionRange(n, n); } }, []);
    const options = () => {
      if (!pick) return [];
      const t = pick.q.toLowerCase();
      const people = q().staff().filter((u) => (u.name || "").toLowerCase().includes(t)).slice(0, 6).map((u) => ({ k: "u", id: u.id, label: u.name, sub: u.cargo || "Persona" }));
      const projects = L.state.proyectos.filter((p) => (p.name + " " + (p.code || "")).toLowerCase().includes(t)).slice(0, 4).map((p) => ({ k: "p", id: p.id, label: p.code || p.name, sub: p.name }));
      return [...people, ...projects];
    };
    const check = (t) => {
      const caret = t.selectionStart;
      const before = t.value.slice(0, caret);
      const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
      setPick(m ? { q: m[2], start: caret - m[2].length - 1, idx: 0 } : null);
    };
    const choose = (o) => {
      const t = el();
      const caret = t.selectionStart;
      const token = `@[${o.label}](${o.k}:${o.id}) `;
      const next = t.value.slice(0, pick.start) + token + t.value.slice(caret);
      onInput(next);
      setPick(null);
      requestAnimationFrame(() => { const p = pick.start + token.length; t.focus(); t.setSelectionRange(p, p); });
    };
    const opts = options();
    return html`<span class="mention-wrap">
      <textarea ref=${inputRef || ref} class=${L.cx("mention-area", cls)} rows="1" value=${value} placeholder=${placeholder} disabled=${disabled}
        onInput=${(e) => { onInput(e.target.value); check(e.target); grow(); }}
        onKeyDown=${(e) => {
          if (pick && opts.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setPick({ ...pick, idx: (pick.idx + 1) % opts.length }); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setPick({ ...pick, idx: (pick.idx - 1 + opts.length) % opts.length }); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(opts[pick.idx]); return; }
            if (e.key === "Escape") { e.preventDefault(); setPick(null); return; }
          }
          if (onKeyDown) onKeyDown(e);
        }}
        onBlur=${(e) => { setTimeout(() => setPick(null), 150); if (onBlur) onBlur(e); }} onFocus=${onFocus} />
      ${pick && opts.length > 0 && html`<span class="mention-pop glass">${opts.map((o, i) => html`<button type="button" key=${o.k + o.id} class=${i === pick.idx ? "on" : ""} onMouseDown=${(e) => { e.preventDefault(); choose(o); }}>
        ${o.k === "u" ? html`<${L.Avatar} id=${o.id} />` : html`<${Icon} name="folder" />`}<span><b>${o.label}</b><small>${o.sub}</small></span></button>`)}</span>`}
    </span>`;
  }

  /* ---------- permisos ---------- */
  const rol = (lib, uid = L.state.me && L.state.me.id) => {
    if (!lib || !uid) return "";
    if (lib.owner === uid) return "owner";
    if ((lib.editores || []).includes(uid)) return "editar";
    if ((lib.lectores || []).includes(uid)) return "ver";
    return "";
  };
  const canEdit = (lib) => ["owner", "editar"].includes(rol(lib));
  const itemsOf = (id) => L.state.libretaItems.filter((i) => i.libreta === id);

  /* ---------- plantillas ---------- */
  const T = (tipo, texto = "", extra = {}) => ({ tipo, texto, ...extra });
  const NOTE_COLORS = [
    { id: "amarillo", c: "#ffe9a3" }, { id: "rosado", c: "#ffd0e0" }, { id: "azul", c: "#cfe0ff" },
    { id: "verde", c: "#cdeed6" }, { id: "naranja", c: "#ffdcb5" }, { id: "blanco", c: "#ffffff" },
  ];
  const colorOf = (id) => (NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[0]).c;
  const TEMPLATES = {
    pagina: [
      { id: "blanco", label: "En blanco", icono: "📄", items: [T("texto")] },
      { id: "reunion", label: "Notas de reunión", icono: "🗒️", items: [T("h1", "Reunión"), T("texto", "Fecha: " + new Date().toLocaleDateString("es-CO")), T("h2", "Asistentes"), T("lista", ""), T("h2", "Temas"), T("lista", ""), T("h2", "Compromisos"), T("check", "")] },
      { id: "pendientes", label: "Pendientes", icono: "✅", items: [T("h1", "Pendientes"), T("check", ""), T("check", ""), T("check", "")] },
      { id: "brief", label: "Brief de cliente", icono: "📐", items: [T("h1", "Brief"), T("h2", "Cliente y contacto"), T("texto"), T("h2", "Necesidades y programa"), T("lista"), T("h2", "Presupuesto y tiempos"), T("texto"), T("h2", "Referentes"), T("texto"), T("h2", "Restricciones (norma, lote, licencias)"), T("lista")] },
      { id: "entrega", label: "Checklist antes de entregar", icono: "📦", items: [T("h1", "Antes de entregar"), T("check", "Planos con la revisión vigente y rótulo actualizado"), T("check", "Renders revisados por Dirección creativa"), T("check", "Archivos en la carpeta de entregas, con nombre del estándar"), T("check", "PDF combinado y revisado página por página"), T("check", "Correo al cliente con lista de lo enviado")] },
    ],
    tablero: [
      { id: "blanco", label: "En blanco", icono: "🧩", items: [] },
      { id: "referentes", label: "Referentes", icono: "🖼️", items: [
        T("marco", "Fachada", { x: 40, y: 40, w: 520, h: 420, z: 1 }), T("marco", "Interiores", { x: 600, y: 40, w: 520, h: 420, z: 1 }),
        T("marco", "Materiales", { x: 40, y: 500, w: 520, h: 420, z: 1 }), T("marco", "Iluminación", { x: 600, y: 500, w: 520, h: 420, z: 1 })] },
      { id: "ideas", label: "Lluvia de ideas", icono: "💡", items: [
        T("texto", "Tema central", { x: 380, y: 60, w: 300, h: 60, z: 2 }),
        T("nota", "Idea", { x: 140, y: 200, w: 200, h: 160, color: "amarillo", z: 3 }), T("nota", "Idea", { x: 430, y: 200, w: 200, h: 160, color: "rosado", z: 3 }),
        T("nota", "Idea", { x: 720, y: 200, w: 200, h: 160, color: "azul", z: 3 })] },
      { id: "moodboard", label: "Moodboard", icono: "🎨", items: [T("marco", "Moodboard", { x: 40, y: 40, w: 1100, h: 700, z: 1 }), T("nota", "Paleta, texturas, sensación", { x: 80, y: 100, w: 240, h: 150, color: "blanco", z: 3 })] },
    ],
  };
  const PERSONAL = [
    T("h1", "Mi libreta"),
    T("texto", "Tu espacio: notas, pendientes propios y lo que necesitas a la mano. Solo lo ves tú."),
    T("widget", "", { widget: "tareas" }), T("widget", "", { widget: "reuniones" }), T("widget", "", { widget: "proyectos" }),
    T("h2", "Notas rápidas"), T("texto", ""),
    T("h2", "Pendientes míos"), T("check", ""),
  ];
  const ICONS = ["📄", "🗒️", "✅", "📐", "📦", "🖼️", "💡", "🎨", "🏛️", "🛋️", "🌿", "📸", "🧱", "🪑", "🔑", "⭐"];

  async function createItems(libId, items) {
    let orden = 1000;
    for (const it of items) {
      await act().save("libreta_items", null, { libreta: libId, by: L.state.me.id, orden, ...it });
      orden += 1000;
    }
  }
  async function crearLibreta({ titulo, tipo, icono, plantilla, personal }) {
    const lib = await act().save("libretas", null, { owner: L.state.me.id, titulo, tipo, icono, personal: !!personal });
    if (!lib) return null;
    const tpl = personal ? { items: PERSONAL } : (TEMPLATES[tipo].find((t) => t.id === plantilla) || TEMPLATES[tipo][0]);
    await createItems(lib.id, tpl.items);
    return lib;
  }
  // La libreta personal se crea la primera vez que se abre.
  let creatingPersonal = null;
  async function personalId() {
    const me = L.state.me.id;
    const found = L.state.libretas.find((l) => l.owner === me && l.personal);
    if (found) return found.id;
    if (!creatingPersonal) creatingPersonal = crearLibreta({ titulo: "Mi libreta", tipo: "pagina", icono: "⭐", personal: true }).finally(() => { creatingPersonal = null; });
    const lib = await creatingPersonal;
    return lib ? lib.id : "";
  }

  /* ---------- lista de libretas ---------- */
  function Libretas() {
    const s = L.useStore();
    const me = s.me.id;
    const mine = s.libretas.filter((l) => l.owner === me && !l.personal).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    const shared = s.libretas.filter((l) => l.owner !== me).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    const personal = s.libretas.find((l) => l.owner === me && l.personal);
    const openPersonal = async () => { const id = await personalId(); if (id) L.go("#libreta/" + id); };
    const card = (l) => {
      const n = itemsOf(l.id).length;
      const people = [...new Set([l.owner, ...(l.editores || []), ...(l.lectores || [])])];
      const r = rol(l);
      return html`<a class="lib-card glass" key=${l.id} href=${"#libreta/" + l.id}>
        <span class="lib-ico">${l.icono || (l.tipo === "tablero" ? "🧩" : "📄")}</span>
        <span class="lib-main"><b>${l.titulo}</b><small>${l.tipo === "tablero" ? "Tablero" : "Página"} · ${n} ${l.tipo === "tablero" ? (n === 1 ? "elemento" : "elementos") : (n === 1 ? "bloque" : "bloques")} · ${L.relTime(l.updated)}</small></span>
        <span class="lib-side">${people.length > 1 && html`<${L.Faces} ids=${people} max=${4} />`}
          ${r !== "owner" ? html`<span class="tag">${r === "editar" ? "Puedes editar" : "Solo ver"} · de ${L.first(q().name(l.owner))}</span>` : people.length > 1 ? html`<span class="tag">Compartida</span>` : html`<span class="tag light">Privada</span>`}</span>
      </a>`;
    };
    return html`
      <${L.PageHead} title="Libretas" sub="Páginas de notas y tableros libres. Son tuyas; las compartes con quien quieras, para ver o para editar.">
        <button type="button" class="btn primary" onClick=${() => L.openSheet("libreta-nueva")}><${Icon} name="plus" size=${12} /> Nueva libreta</button>
      <//>
      <div class="grid">
        <button type="button" class="lib-personal glass span-12" onClick=${openPersonal}>
          <span class="lib-ico">⭐</span><span class="lib-main"><b>Mi libreta</b><small>${personal ? "Tus notas, pendientes propios, tareas de hoy y reuniones en una sola página." : "Ábrela para crearla: tus notas, pendientes propios, tareas de hoy y reuniones."}</small></span><${Icon} name="right" />
        </button>
        <${L.Panel} title="Mis libretas" cls="span-12">
          ${mine.length ? html`<div class="lib-grid">${mine.map(card)}</div>` : html`<p class="note">Crea una página para tus notas o un tablero libre para referentes, ideas o moodboards. Después la compartes si quieres.</p>`}
        <//>
        <${L.Panel} title="Compartidas conmigo" cls="span-12">
          ${shared.length ? html`<div class="lib-grid">${shared.map(card)}</div>` : html`<p class="note">Cuando alguien te invite a una libreta, aparece aquí. Te llega un aviso.</p>`}
        <//>
      </div>`;
  }

  /* ---------- nueva libreta ---------- */
  function NuevaLibreta() {
    const [tipo, setTipo] = useState("pagina");
    const [plantilla, setPlantilla] = useState("blanco");
    const [titulo, setTitulo] = useState("");
    const [icono, setIcono] = useState("");
    const [busy, setBusy] = useState(false);
    const tpls = TEMPLATES[tipo];
    const tpl = tpls.find((t) => t.id === plantilla) || tpls[0];
    const save = async () => {
      if (busy) return;
      setBusy(true);
      const lib = await crearLibreta({ titulo: titulo.trim() || (tpl.id === "blanco" ? (tipo === "tablero" ? "Tablero sin título" : "Página sin título") : tpl.label), tipo, icono: icono || tpl.icono, plantilla });
      setBusy(false);
      if (lib) { L.closeSheet(); L.go("#libreta/" + lib.id); }
    };
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary" disabled=${busy}>${busy ? "Creando…" : "Crear libreta"}</button>`;
    return html`<${L.Sheet} title="Nueva libreta" onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      <div class="fld"><span class="lbl">Tipo</span>
        <div class="lib-types">
          <button type="button" aria-pressed=${tipo === "pagina"} onClick=${() => { setTipo("pagina"); setPlantilla("blanco"); }}><${Icon} name="note" size=${20} /><b>Página</b><small>Notas con títulos, listas, casillas, imágenes y bloques de tus tareas y reuniones.</small></button>
          <button type="button" aria-pressed=${tipo === "tablero"} onClick=${() => { setTipo("tablero"); setPlantilla("blanco"); }}><${Icon} name="board" size=${20} /><b>Tablero libre</b><small>Un lienzo para notas, imágenes, enlaces y marcos donde quieras. Ideal para referentes.</small></button>
        </div></div>
      <div class="fld"><span class="lbl">Plantilla</span><div class="lib-tpls">${tpls.map((t) => html`<button type="button" key=${t.id} aria-pressed=${plantilla === t.id} onClick=${() => setPlantilla(t.id)}><span>${t.icono}</span>${t.label}</button>`)}</div></div>
      <${L.Field} label="Nombre" id="lib-t"><input id="lib-t" value=${titulo} onInput=${(e) => setTitulo(e.target.value)} placeholder=${tpl.id === "blanco" ? "Ej.: Referentes hotel Nogal" : tpl.label} maxlength="120" /><//>
      <div class="fld"><span class="lbl">Ícono</span><div class="lib-icons">${ICONS.map((i) => html`<button type="button" key=${i} aria-pressed=${(icono || tpl.icono) === i} onClick=${() => setIcono(i)}>${i}</button>`)}</div></div>
    <//>`;
  }

  /* ---------- compartir ---------- */
  function Compartir({ id }) {
    const s = L.useStore();
    const lib = s.libretas.find((l) => l.id === id);
    const [map, setMap] = useState(() => {
      const m = {};
      if (lib) { (lib.lectores || []).forEach((u) => { m[u] = "ver"; }); (lib.editores || []).forEach((u) => { m[u] = "editar"; }); }
      return m;
    });
    if (!lib) return null;
    const people = q().staff().filter((u) => u.id !== lib.owner);
    const save = async () => {
      const lectores = Object.keys(map).filter((u) => map[u] === "ver");
      const editores = Object.keys(map).filter((u) => map[u] === "editar");
      if (await act().save("libretas", lib.id, { lectores, editores })) { L.toast(lectores.length + editores.length ? "Listo. Les llega un aviso." : "Ahora la libreta es privada."); L.closeSheet(); }
    };
    const footer = html`<span class="spacer"></span><button type="button" class="btn ghost" onClick=${L.closeSheet}>Cancelar</button><button type="submit" class="btn primary">Guardar</button>`;
    return html`<${L.Sheet} title=${"Compartir «" + lib.titulo + "»"} onClose=${L.closeSheet} onSubmit=${save} footer=${footer}>
      <p class="note">Quien puede <b>ver</b> la encuentra en sus libretas compartidas. Quien puede <b>editar</b> también agrega, cambia y borra lo que hay adentro, pero no la puede borrar ni compartir con otros.</p>
      <div class="share-list">${people.map((u) => html`<div class="share-row" key=${u.id}>
        <${L.Avatar} id=${u.id} /><span class="share-name"><b>${u.name}</b><small>${u.cargo || q().roleLabel(u)}</small></span>
        <${L.Seg} label=${"Acceso de " + u.name} value=${map[u.id] || ""} onChange=${(v) => setMap({ ...map, [u.id]: v })} options=${[{ id: "", label: "Sin acceso" }, { id: "ver", label: "Ver" }, { id: "editar", label: "Editar" }]} />
      </div>`)}</div>
    <//>`;
  }

  /* ---------- vista de una libreta ---------- */
  function LibretaView({ id }) {
    const s = L.useStore();
    const lib = s.libretas.find((l) => l.id === id);
    const [titulo, setTitulo] = useState(lib ? lib.titulo : "");
    const [confirmDel, setConfirmDel] = useState(false);
    useEffect(() => { if (lib && document.activeElement && document.activeElement.id !== "lib-title") setTitulo(lib.titulo); }, [lib && lib.titulo]);
    if (!lib) return html`<div class="glass"><${L.Empty} title="Esta libreta no existe o ya no la tienes compartida"><a class="btn" href="#libretas">Ver libretas</a><//></div>`;
    const r = rol(lib);
    const edit = canEdit(lib);
    const people = [...new Set([lib.owner, ...(lib.editores || []), ...(lib.lectores || [])])];
    const saveTitle = () => { const t = titulo.trim(); if (t && t !== lib.titulo) act().save("libretas", lib.id, { titulo: t }); else setTitulo(lib.titulo); };
    return html`
      <div class=${L.cx("lib-view", lib.tipo === "tablero" && "is-board")}>
        <div class="lib-head">
          <a class="btn icon ghost" href="#libretas" aria-label="Volver a libretas"><${Icon} name="left" /></a>
          <span class="lib-ico big">${lib.icono || (lib.tipo === "tablero" ? "🧩" : "📄")}</span>
          ${edit ? html`<input id="lib-title" class="lib-title" value=${titulo} onInput=${(e) => setTitulo(e.target.value)} onBlur=${saveTitle} onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} aria-label="Nombre de la libreta" maxlength="120" />`
            : html`<h1 class="lib-title">${lib.titulo}</h1>`}
          <span class="spacer"></span>
          ${people.length > 1 && html`<${L.Faces} ids=${people} max=${5} />`}
          ${r !== "owner" && html`<span class="tag">${r === "editar" ? "Puedes editar" : "Solo ver"} · de ${L.first(q().name(lib.owner))}</span>`}
          ${r === "owner" && !lib.personal && html`<button type="button" class="btn" onClick=${() => L.openSheet("libreta-compartir", lib.id)}><${Icon} name="share" /> Compartir</button>`}
          ${r === "owner" && !lib.personal && (confirmDel
            ? html`<button type="button" class="btn danger" onClick=${async () => { if (await act().remove("libretas", lib.id)) { L.toast("Libreta borrada"); L.go("#libretas"); } }}>Confirmar: borrar</button><button type="button" class="btn ghost" onClick=${() => setConfirmDel(false)}>No</button>`
            : html`<button type="button" class="btn icon ghost" aria-label="Borrar libreta" title="Borrar libreta" onClick=${() => setConfirmDel(true)}><${Icon} name="trash" /></button>`)}
        </div>
        ${lib.tipo === "tablero" ? html`<${Tablero} lib=${lib} edit=${edit} />` : html`<${Pagina} lib=${lib} edit=${edit} />`}
      </div>`;
  }

  /* ---------- página de bloques ---------- */
  const BLOCKS = [
    { id: "texto", label: "Texto", hint: "Párrafo normal" },
    { id: "h1", label: "Título", hint: "# al inicio" },
    { id: "h2", label: "Subtítulo", hint: "## al inicio" },
    { id: "lista", label: "Lista", hint: "- al inicio" },
    { id: "numero", label: "Lista numerada", hint: "1. al inicio" },
    { id: "check", label: "Casilla", hint: "[] al inicio" },
    { id: "cita", label: "Destacado", hint: "> al inicio" },
    { id: "separador", label: "Separador", hint: "---" },
    { id: "imagen", label: "Imagen", hint: "Subir o pegar" },
    { id: "enlace", label: "Enlace", hint: "Página web" },
    { id: "widget:tareas", label: "Mis tareas", hint: "Pendientes y atrasadas" },
    { id: "widget:reuniones", label: "Mis reuniones", hint: "Próximos 7 días" },
    { id: "widget:entregas", label: "Próximas entregas", hint: "De mis proyectos" },
    { id: "widget:proyectos", label: "Mis proyectos", hint: "Accesos directos" },
  ];
  const SHORTCUTS = [[/^# $/, "h1"], [/^## $/, "h2"], [/^[-*] $/, "lista"], [/^1[.)] $/, "numero"], [/^\[\] ?$/, "check"], [/^> $/, "cita"], [/^---$/, "separador"]];
  const CONT = { lista: "lista", numero: "numero", check: "check" };

  async function compressImage(file, max = 1800) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 1.5e6) return file;
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
      return blob ? new File([blob], (file.name || "imagen").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch (e) { return file; }
  }
  async function uploadItem(data, file) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null) fd.append(k, v);
    fd.append("imagen", await compressImage(file));
    return act().save("libreta_items", null, fd);
  }
  const pickFile = (accept = "image/*") => new Promise((res) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = accept;
    i.onchange = () => res(i.files && i.files[0] ? i.files[0] : null);
    i.click();
  });

  function Pagina({ lib, edit }) {
    const s = L.useStore();
    const items = s.libretaItems.filter((i) => i.libreta === lib.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const [focusId, setFocusId] = useState("");
    const [menu, setMenu] = useState(null); // { id } menú de tipo de bloque
    const [dragId, setDragId] = useState("");
    const ordenAfter = (it) => {
      const i = items.findIndex((x) => x.id === it.id);
      const next = items[i + 1];
      return next ? ((it.orden || 0) + (next.orden || 0)) / 2 : (it.orden || 0) + 1000;
    };
    const add = async (after, tipo = "texto", extra = {}) => {
      const orden = after ? ordenAfter(after) : (items.length ? (items[items.length - 1].orden || 0) + 1000 : 1000);
      const rec = await act().save("libreta_items", null, { libreta: lib.id, tipo, texto: "", by: L.state.me.id, orden, ...extra });
      if (rec) setFocusId(rec.id);
      return rec;
    };
    const remove = async (it) => {
      const i = items.findIndex((x) => x.id === it.id);
      await act().remove("libreta_items", it.id);
      if (items[i - 1]) setFocusId(items[i - 1].id);
    };
    const setTipo = async (it, val) => {
      setMenu(null);
      if (val === "imagen") {
        const f = await pickFile(); if (!f) return;
        const rec = await uploadItem({ libreta: lib.id, tipo: "imagen", texto: "", by: L.state.me.id, orden: it.orden }, f);
        if (rec && !it.texto) act().remove("libreta_items", it.id);
        return;
      }
      if (val.startsWith("widget:")) { await act().save("libreta_items", it.id, { tipo: "widget", widget: val.slice(7), texto: "" }); return; }
      await act().save("libreta_items", it.id, { tipo: val, texto: val === "separador" ? "" : (it.texto || "").replace(/^\//, "") });
      setFocusId(it.id);
    };
    const drop = async (target) => {
      const it = items.find((x) => x.id === dragId);
      setDragId("");
      if (!it || it.id === target.id) return;
      const rest = items.filter((x) => x.id !== it.id);
      const i = rest.findIndex((x) => x.id === target.id);
      const prev = rest[i - 1];
      const orden = prev ? ((prev.orden || 0) + (target.orden || 0)) / 2 : (target.orden || 0) - 1000;
      await act().save("libreta_items", it.id, { orden });
    };
    // Pegar una imagen en la página la agrega como bloque.
    useEffect(() => {
      if (!edit) return undefined;
      const onPaste = async (e) => {
        const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith("image/"));
        if (!f) return;
        e.preventDefault();
        const last = items[items.length - 1];
        await uploadItem({ libreta: lib.id, tipo: "imagen", texto: "", by: L.state.me.id, orden: last ? (last.orden || 0) + 1000 : 1000 }, f);
      };
      document.addEventListener("paste", onPaste);
      return () => document.removeEventListener("paste", onPaste);
    }, [edit, items.length]);
    let n = 0;
    return html`<div class="page-doc glass">
      ${items.map((it) => {
        n = it.tipo === "numero" ? n + 1 : 0;
        return html`<${Bloque} key=${it.id} it=${it} edit=${edit} num=${n} focus=${focusId === it.id} onFocused=${() => setFocusId("")}
          onEnter=${(rest) => add(it, CONT[it.tipo] || "texto", rest ? { texto: rest } : {})} onRemove=${() => remove(it)} onMenu=${() => setMenu(menu && menu.id === it.id ? null : { id: it.id })}
          menuOpen=${menu && menu.id === it.id} onTipo=${(v) => setTipo(it, v)} onDragStart=${() => setDragId(it.id)} onDrop=${() => drop(it)} dragging=${dragId === it.id} />`;
      })}
      ${edit && html`<button type="button" class="page-add" onClick=${() => add(items[items.length - 1])}><${Icon} name="plus" size=${12} /> Agregar un bloque <span class="muted">· escribe / para elegir el tipo, @ para mencionar</span></button>`}
      ${!items.length && !edit && html`<p class="note">Esta página está vacía.</p>`}
    </div>`;
  }

  function Bloque({ it, edit, num, focus, onFocused, onEnter, onRemove, onMenu, menuOpen, onTipo, onDragStart, onDrop, dragging }) {
    const [val, setVal] = useState(it.texto || "");
    const [editing, setEditing] = useState(false);
    const [over, setOver] = useState(false);
    const ref = useRef(null);
    const timer = useRef(0);
    useEffect(() => { if (!editing) setVal(it.texto || ""); }, [it.texto]);
    useEffect(() => { if (focus && edit) { setEditing(true); onFocused(); } }, [focus]);
    useLayoutEffect(() => { if (editing && ref.current) { ref.current.focus(); const n = ref.current.value.length; ref.current.setSelectionRange(n, n); } }, [editing]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const persist = (v) => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (v !== (it.texto || "")) act().save("libreta_items", it.id, { texto: v }); }, 500); };
    const onInput = (v) => {
      for (const [re, tipo] of SHORTCUTS) if (re.test(v) && it.tipo !== tipo) { setVal(""); onTipo(tipo); return; }
      if (v === "/" ) { onMenu(); }
      setVal(v); persist(v);
    };
    const onKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const t = e.target, caret = t.selectionStart;
        const head = t.value.slice(0, caret), rest = t.value.slice(caret);
        // Enter en un ítem de lista vacío lo vuelve texto normal (como en Notion).
        if (!t.value && CONT[it.tipo]) { onTipo("texto"); return; }
        if (rest) { setVal(head); persist(head); }
        onEnter(rest);
      } else if (e.key === "Backspace" && !e.target.value) {
        e.preventDefault();
        if (it.tipo !== "texto") onTipo("texto"); else onRemove();
      } else if (e.key === "Escape") e.target.blur();
    };
    const blur = () => { clearTimeout(timer.current); if (val !== (it.texto || "")) act().save("libreta_items", it.id, { texto: val }); setEditing(false); };
    const tipo = it.tipo;
    const body = () => {
      if (tipo === "separador") return html`<hr class="blk-sep" />`;
      if (tipo === "widget") return html`<${Widget} kind=${it.widget} />`;
      if (tipo === "imagen") return html`<figure class="blk-img">${it.imagen ? html`<img src=${L.pbFile(it, it.imagen)} alt=${plainText(it.texto) || "Imagen"} loading="lazy" />` : html`<span class="muted">Imagen</span>`}
        ${edit ? html`<input class="blk-cap" value=${val} placeholder="Pie de foto" onInput=${(e) => { setVal(e.target.value); persist(e.target.value); }} />` : it.texto && html`<figcaption>${it.texto}</figcaption>`}</figure>`;
      if (tipo === "enlace") {
        const url = it.url || "";
        return html`<div class="blk-link">${edit ? html`<input value=${url} placeholder="Pega la dirección (https://…)" onChange=${(e) => act().save("libreta_items", it.id, { url: e.target.value.trim() })} />` : ""}
          ${/^https?:\/\//.test(url) && html`<a href=${url} target="_blank" rel="noopener"><${Icon} name="link" /> ${url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}</a>`}</div>`;
      }
      const cls = "blk-text t-" + tipo;
      const text = editing && edit
        ? html`<${MentionArea} inputRef=${ref} cls=${cls} value=${val} onInput=${onInput} onKeyDown=${onKeyDown} onBlur=${blur} placeholder=${tipo === "h1" ? "Título" : tipo === "h2" ? "Subtítulo" : "Escribe, / para elegir el tipo, @ para mencionar"} />`
        : html`<div class=${L.cx(cls, !val && "empty", tipo === "check" && it.hecho && "done")} onClick=${() => edit && setEditing(true)} tabindex=${edit ? 0 : null} onFocus=${() => edit && setEditing(true)}>${val ? html`<${Rich} text=${val} />` : edit ? html`<span class="ph">${tipo === "h1" ? "Título" : tipo === "h2" ? "Subtítulo" : "Escribe algo…"}</span>` : ""}</div>`;
      return html`<div class="blk-row">
        ${tipo === "lista" && html`<span class="blk-bullet">•</span>`}
        ${tipo === "numero" && html`<span class="blk-bullet num">${num}.</span>`}
        ${tipo === "check" && html`<input type="checkbox" class="blk-check" checked=${!!it.hecho} disabled=${!edit} onChange=${(e) => act().save("libreta_items", it.id, { hecho: e.target.checked })} aria-label="Hecho" />`}
        ${text}</div>`;
    };
    return html`<div class=${L.cx("blk", "b-" + tipo, over && "drop-over", dragging && "dragging")}
      onDragOver=${(e) => { if (edit) { e.preventDefault(); setOver(true); } }} onDragLeave=${() => setOver(false)} onDrop=${(e) => { e.preventDefault(); setOver(false); onDrop(); }}>
      ${edit && html`<span class="blk-tools">
        <button type="button" class="blk-handle" draggable="true" onDragStart=${(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }} title="Arrastra para mover; clic para cambiar el tipo" onClick=${onMenu} aria-label="Tipo de bloque y mover"><${Icon} name="drag" /></button>
      </span>`}
      ${body()}
      ${menuOpen && html`<div class="blk-menu glass" role="menu">
        ${BLOCKS.map((b) => html`<button type="button" key=${b.id} onMouseDown=${(e) => { e.preventDefault(); onTipo(b.id); }}><b>${b.label}</b><small>${b.hint}</small></button>`)}
        <div class="sep"></div><button type="button" class="danger" onMouseDown=${(e) => { e.preventDefault(); onMenu(); onRemove(); }}><b>Borrar bloque</b></button>
      </div>`}
    </div>`;
  }

  // Bloques vivos con datos del estudio.
  function Widget({ kind }) {
    const s = L.useStore();
    const me = s.me.id;
    const t0 = L.todayIso();
    if (kind === "tareas") {
      const list = q().myTasks(me).filter((t) => t.status !== "terminado" && (!t.start || t.start <= L.iso(L.addDays(L.today(), 2)))).sort(L.byDue).slice(0, 8);
      return html`<div class="blk-widget"><div class="w-head"><${Icon} name="check" /> Mis tareas</div>
        ${list.length ? html`<div class="rows">${list.map((t) => html`<${L.TaskRow} key=${t.id} task=${t} />`)}</div>` : html`<p class="note">Nada pendiente para estos días.</p>`}</div>`;
    }
    if (kind === "reuniones") {
      const until = L.iso(L.addDays(L.today(), 7));
      const list = q().myEvents(me).filter((e) => e.date >= t0 && e.date <= until).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 6);
      return html`<div class="blk-widget"><div class="w-head"><${Icon} name="meet" /> Mis reuniones de la semana</div>
        ${list.length ? html`<div class="rows">${list.map((e) => html`<${L.EventRow} key=${e.id} ev=${e} />`)}</div>` : html`<p class="note">Sin reuniones en los próximos 7 días.</p>`}</div>`;
    }
    if (kind === "entregas") {
      const mine = new Set(q().myProjects(me).map((p) => p.id));
      const list = s.eventos.filter((e) => e.kind === "entrega" && e.date >= t0 && mine.has(e.project)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
      return html`<div class="blk-widget"><div class="w-head"><${Icon} name="flag" /> Próximas entregas</div>
        ${list.length ? html`<div class="rows">${list.map((e) => html`<${L.EventRow} key=${e.id} ev=${e} />`)}</div>` : html`<p class="note">Sin entregas próximas en tus proyectos.</p>`}</div>`;
    }
    if (kind === "proyectos") {
      const list = q().myProjects(me);
      return html`<div class="blk-widget"><div class="w-head"><${Icon} name="folder" /> Mis proyectos</div>
        ${list.length ? html`<div class="w-projects">${list.map((p) => html`<a key=${p.id} class="w-proj" href=${"#proyecto/" + p.id}><span class="mono">${p.code || ""}</span> ${p.name}</a>`)}</div>` : html`<p class="note">Aún no estás en ningún proyecto.</p>`}</div>`;
    }
    return html`<div class="blk-widget"><p class="note">Bloque no disponible.</p></div>`;
  }

  /* ---------- tablero libre (mini Miro) ---------- */
  const DEF = { nota: { w: 200, h: 160 }, texto: { w: 280, h: 60 }, imagen: { w: 320, h: 240 }, enlace: { w: 280, h: 90 }, marco: { w: 600, h: 420 } };
  function Tablero({ lib, edit }) {
    const s = L.useStore();
    const items = s.libretaItems.filter((i) => i.libreta === lib.id);
    const view = useRef(null);
    const [cam, setCam] = useState(() => { try { return JSON.parse(localStorage.getItem("lap-tablero-" + lib.id)) || { x: 40, y: 40, z: 1 }; } catch (e) { return { x: 40, y: 40, z: 1 }; } });
    const [sel, setSel] = useState("");
    const [editId, setEditId] = useState("");
    const [live, setLive] = useState({}); // posiciones mientras se arrastra
    const [color, setColor] = useState("amarillo");
    const camRef = useRef(cam); camRef.current = cam;
    useEffect(() => { try { localStorage.setItem("lap-tablero-" + lib.id, JSON.stringify(cam)); } catch (e) { /* sin espacio */ } }, [cam]);
    const maxZ = () => items.reduce((m, i) => Math.max(m, i.z || 0), 0);
    const center = () => {
      const r = view.current.getBoundingClientRect(), c = camRef.current;
      return { x: Math.round((r.width / 2 - c.x) / c.z), y: Math.round((r.height / 2 - c.y) / c.z) };
    };
    const create = async (tipo, extra = {}) => {
      const c = center(), d = DEF[tipo];
      const rec = await act().save("libreta_items", null, { libreta: lib.id, tipo, texto: tipo === "marco" ? "Marco" : "", by: L.state.me.id,
        x: c.x - d.w / 2, y: c.y - d.h / 2, w: d.w, h: d.h, z: tipo === "marco" ? 1 : maxZ() + 1, color: tipo === "nota" ? color : "", ...extra });
      if (rec) { setSel(rec.id); if (tipo !== "imagen" && tipo !== "enlace") setEditId(rec.id); }
    };
    const addImage = async (file, at) => {
      const c = at || center();
      const img = await compressImage(file);
      let w = 320, h = 240;
      try { const b = await createImageBitmap(img); const k = Math.min(1, 420 / Math.max(b.width, b.height)); w = Math.round(b.width * k); h = Math.round(b.height * k); } catch (e) { /* tamaño por defecto */ }
      const fd = new FormData();
      Object.entries({ libreta: lib.id, tipo: "imagen", texto: "", by: L.state.me.id, x: c.x - w / 2, y: c.y - h / 2, w, h, z: maxZ() + 1 }).forEach(([k, v]) => fd.append(k, v));
      fd.append("imagen", img);
      const rec = await act().save("libreta_items", null, fd);
      if (rec) setSel(rec.id);
    };
    // Pegar imágenes o enlaces, y soltar archivos sobre el tablero.
    useEffect(() => {
      if (!edit) return undefined;
      const onPaste = async (e) => {
        if (e.target && /textarea|input/i.test(e.target.tagName)) return;
        const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith("image/"));
        if (f) { e.preventDefault(); addImage(f); return; }
        const t = (e.clipboardData && e.clipboardData.getData("text")) || "";
        if (/^https?:\/\/\S+$/.test(t.trim())) { e.preventDefault(); create("enlace", { url: t.trim() }); }
        else if (t.trim()) { e.preventDefault(); create("nota", { texto: t.trim().slice(0, 2000) }); }
      };
      document.addEventListener("paste", onPaste);
      return () => document.removeEventListener("paste", onPaste);
    }, [edit, items.length, color]);
    useEffect(() => {
      const onKey = (e) => {
        if (!edit || !sel || editId) return;
        if (e.target && /textarea|input|select/i.test(e.target.tagName)) return;
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); act().remove("libreta_items", sel); setSel(""); }
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [sel, editId, edit]);
    // Zoom con la rueda, alrededor del mouse.
    const onWheel = (e) => {
      e.preventDefault();
      const r = view.current.getBoundingClientRect();
      const c = camRef.current;
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { setCam({ ...c, x: c.x - e.deltaX }); return; }
      const z = Math.max(0.15, Math.min(3, c.z * Math.exp(-e.deltaY * 0.0015)));
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setCam({ z, x: mx - ((mx - c.x) / c.z) * z, y: my - ((my - c.y) / c.z) * z });
    };
    useEffect(() => {
      const v = view.current;
      v.addEventListener("wheel", onWheel, { passive: false });
      return () => v.removeEventListener("wheel", onWheel);
    }, []);
    // Mover el lienzo arrastrando el fondo.
    const onBgDown = (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      setSel(""); setEditId("");
      const start = { x: e.clientX, y: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      const move = (ev) => setCam({ ...camRef.current, x: start.cx + ev.clientX - start.x, y: start.cy + ev.clientY - start.y });
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    };
    // Mover o cambiar el tamaño de un elemento.
    const startDrag = (e, it, mode) => {
      if (!edit || e.button !== 0) return;
      e.stopPropagation();
      setSel(it.id);
      if (editId === it.id && mode === "move") return;
      const z = camRef.current.z;
      const st = { x: e.clientX, y: e.clientY, ix: it.x || 0, iy: it.y || 0, w: it.w || 200, h: it.h || 150 };
      let moved = false;
      const move = (ev) => {
        const dx = (ev.clientX - st.x) / z, dy = (ev.clientY - st.y) / z;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        setLive((l) => ({ ...l, [it.id]: mode === "move" ? { x: Math.round(st.ix + dx), y: Math.round(st.iy + dy) } : { w: Math.max(60, Math.round(st.w + dx)), h: Math.max(40, Math.round(st.h + dy)) } }));
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        const dx = (ev.clientX - st.x) / z, dy = (ev.clientY - st.y) / z;
        const patch = mode === "move" ? { x: Math.round(st.ix + dx), y: Math.round(st.iy + dy) } : { w: Math.max(60, Math.round(st.w + dx)), h: Math.max(40, Math.round(st.h + dy)) };
        if (moved) {
          if (it.tipo !== "marco" && mode === "move") patch.z = Math.max(it.z || 0, maxZ() + 1);
          act().save("libreta_items", it.id, patch).finally(() => setLive((l) => { const n = { ...l }; delete n[it.id]; return n; }));
        } else setLive((l) => { const n = { ...l }; delete n[it.id]; return n; });
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    };
    const onDropFiles = (e) => {
      if (!edit) return;
      e.preventDefault();
      const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter((f) => f.type.startsWith("image/"));
      const r = view.current.getBoundingClientRect(), c = camRef.current;
      files.forEach((f, i) => addImage(f, { x: Math.round((e.clientX - r.left - c.x) / c.z) + i * 30, y: Math.round((e.clientY - r.top - c.y) / c.z) + i * 30 }));
    };
    const fit = () => {
      if (!items.length) { setCam({ x: 40, y: 40, z: 1 }); return; }
      const r = view.current.getBoundingClientRect();
      const x0 = Math.min(...items.map((i) => i.x || 0)), y0 = Math.min(...items.map((i) => i.y || 0));
      const x1 = Math.max(...items.map((i) => (i.x || 0) + (i.w || 0))), y1 = Math.max(...items.map((i) => (i.y || 0) + (i.h || 0)));
      const z = Math.max(0.15, Math.min(1.5, Math.min((r.width - 80) / (x1 - x0 || 1), (r.height - 80) / (y1 - y0 || 1))));
      setCam({ z, x: 40 - x0 * z + (r.width - 80 - (x1 - x0) * z) / 2, y: 40 - y0 * z + (r.height - 80 - (y1 - y0) * z) / 2 });
    };
    const zoomBy = (k) => { const r = view.current.getBoundingClientRect(), c = camRef.current; const z = Math.max(0.15, Math.min(3, c.z * k)); const mx = r.width / 2, my = r.height / 2; setCam({ z, x: mx - ((mx - c.x) / c.z) * z, y: my - ((my - c.y) / c.z) * z }); };
    const selItem = items.find((i) => i.id === sel);
    const sorted = [...items].sort((a, b) => (a.z || 0) - (b.z || 0));
    return html`<div class="board-wrap">
      <div class="board-tools glass">
        ${edit && html`
          <button type="button" class="btn sm" onClick=${() => create("nota")} title="Nota adhesiva"><span class="swatch" style=${{ background: colorOf(color) }}></span> Nota</button>
          <span class="swatches">${NOTE_COLORS.map((c) => html`<button type="button" key=${c.id} class="swatch" aria-pressed=${color === c.id} title=${c.id} style=${{ background: c.c }} onClick=${() => { setColor(c.id); if (selItem && selItem.tipo === "nota") act().save("libreta_items", selItem.id, { color: c.id }); }}></button>`)}</span>
          <button type="button" class="btn sm" onClick=${() => create("texto")}>Texto</button>
          <button type="button" class="btn sm" onClick=${async () => { const f = await pickFile(); if (f) addImage(f); }}><${Icon} name="image" /> Imagen</button>
          <button type="button" class="btn sm" onClick=${() => create("enlace")}><${Icon} name="link" /> Enlace</button>
          <button type="button" class="btn sm" onClick=${() => create("marco")}>Marco</button>
          ${selItem && html`<span class="sep"></span><button type="button" class="btn sm ghost danger" onClick=${() => { act().remove("libreta_items", selItem.id); setSel(""); }}><${Icon} name="trash" /> Borrar</button>`}`}
        <span class="spacer"></span>
        <button type="button" class="btn sm ghost" onClick=${() => zoomBy(1 / 1.2)} aria-label="Alejar">−</button>
        <span class="mono zoom-pct">${Math.round(cam.z * 100)}%</span>
        <button type="button" class="btn sm ghost" onClick=${() => zoomBy(1.2)} aria-label="Acercar">+</button>
        <button type="button" class="btn sm ghost" onClick=${fit}>Ver todo</button>
      </div>
      <div class="board-view" ref=${view} onPointerDown=${onBgDown} onDragOver=${(e) => edit && e.preventDefault()} onDrop=${onDropFiles}
        style=${{ backgroundSize: `${24 * cam.z}px ${24 * cam.z}px`, backgroundPosition: `${cam.x}px ${cam.y}px` }}>
        <div class="board-world" style=${{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
          ${sorted.map((it) => {
            const p = { ...it, ...(live[it.id] || {}) };
            return html`<${BoardItem} key=${it.id} it=${p} sel=${sel === it.id} editing=${editId === it.id} edit=${edit}
              onDown=${(e) => startDrag(e, it, "move")} onResize=${(e) => startDrag(e, it, "resize")}
              onEdit=${() => edit && setEditId(it.id)} onDone=${() => setEditId("")} />`;
          })}
        </div>
        ${!items.length && html`<div class="board-empty"><b>Tablero vacío</b><span>${edit ? "Agrega notas, imágenes, enlaces o marcos desde la barra. También puedes pegar (Ctrl+V) o soltar imágenes aquí." : "Todavía no hay nada aquí."}</span></div>`}
      </div>
      <p class="board-hint muted">Rueda del mouse: acercar o alejar · Arrastra el fondo para moverte · Doble clic para escribir · Supr para borrar lo seleccionado</p>
    </div>`;
  }

  function BoardItem({ it, sel, editing, edit, onDown, onResize, onEdit, onDone }) {
    const [val, setVal] = useState(it.texto || "");
    useEffect(() => { if (!editing) setVal(it.texto || ""); }, [it.texto, editing]);
    const done = () => { if (val !== (it.texto || "")) act().save("libreta_items", it.id, { texto: val }); onDone(); };
    const style = { left: (it.x || 0) + "px", top: (it.y || 0) + "px", width: (it.w || 200) + "px", height: (it.h || 150) + "px", zIndex: it.z || 0, background: it.tipo === "nota" ? colorOf(it.color) : null };
    const text = editing
      ? html`<${MentionArea} cls="bi-edit" value=${val} onInput=${setVal} onBlur=${done} autoFocus=${true} onKeyDown=${(e) => { if (e.key === "Escape") e.target.blur(); e.stopPropagation(); }} placeholder="Escribe…" />`
      : html`<div class="bi-text">${val ? html`<${Rich} text=${val} />` : edit ? html`<span class="ph">Doble clic para escribir</span>` : ""}</div>`;
    let inner;
    if (it.tipo === "imagen") inner = it.imagen ? html`<img src=${L.pbFile(it, it.imagen, (it.w || 0) <= 480 ? "480x0" : "")} alt="" draggable="false" />` : html`<span class="muted">Imagen</span>`;
    else if (it.tipo === "enlace") inner = html`<div class="bi-link">${edit && (editing || !it.url) ? html`<input value=${it.url || ""} placeholder="https://…" onPointerDown=${(e) => e.stopPropagation()} onChange=${(e) => act().save("libreta_items", it.id, { url: e.target.value.trim() })} onBlur=${onDone} />` : ""}
      ${/^https?:\/\//.test(it.url || "") && html`<a href=${it.url} target="_blank" rel="noopener" onPointerDown=${(e) => e.stopPropagation()}><${Icon} name="link" /><span><b>${(it.url || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</b><small>${(it.url || "").replace(/^https?:\/\/(www\.)?[^/]+/, "").slice(0, 60) || "/"}</small></span></a>`}</div>`;
    else if (it.tipo === "marco") inner = html`<div class="bi-frame-title" onDblClick=${(e) => { e.stopPropagation(); onEdit(); }}>${editing ? html`<input value=${val} onInput=${(e) => setVal(e.target.value)} onBlur=${done} onKeyDown=${(e) => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); e.stopPropagation(); }} autoFocus onPointerDown=${(e) => e.stopPropagation()} />` : val || "Marco"}</div>`;
    else inner = text;
    return html`<div class=${L.cx("bi", "bi-" + it.tipo, sel && "sel", editing && "editing")} style=${style}
      onPointerDown=${onDown} onDblClick=${(e) => { e.stopPropagation(); if (it.tipo !== "imagen") onEdit(); }}>
      ${inner}
      ${edit && sel && html`<span class="bi-resize" onPointerDown=${(e) => { e.stopPropagation(); onResize(e); }} aria-hidden="true"></span>`}
    </div>`;
  }

  L.EXTRA_SHEETS = { ...(L.EXTRA_SHEETS || {}), "libreta-nueva": NuevaLibreta, "libreta-compartir": Compartir };
  Object.assign(L, { Libretas, LibretaView, MentionArea, Rich, plainText, personalLibreta: personalId, compressImage });
})();
