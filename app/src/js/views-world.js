// La oficina: vista isométrica del estudio en vivo. Cada persona tiene su puesto en la zona de su área;
// se ve quién está conectado, en qué trabaja, quién está en reunión o ausente, y la sala de los agentes.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q, Icon, Empty } = L;
  const { useState, useEffect } = hooks;

  // Proyección isométrica: una baldosa mide 64×32 px en pantalla.
  const TW = 64, TH = 32;
  const P = (x, y, z = 0) => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];
  const pts = (...ps) => ps.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const box = (x, y, w, d, h, z = 0) => ({
    top: pts(P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)),
    left: pts(P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)),
    right: pts(P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)),
  });
  const Box = ({ b, cls }) => html`<g class=${cls}><polygon class="f-left" points=${b.left} /><polygon class="f-right" points=${b.right} /><polygon class="f-top" points=${b.top} /></g>`;
  const short = (t, n = 26) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const minutes = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

  // Reunión que está pasando ahora mismo (hoy, entre su hora y su hora + duración).
  function meetingNow() {
    const now = new Date(), t = L.todayIso(), mins = now.getHours() * 60 + now.getMinutes();
    return L.state.eventos.find((e) => e.date === t && e.time && mins >= minutes(e.time) && mins < minutes(e.time) + (Number(e.duration) || 60)) || null;
  }

  // Distribución: zonas por área, dirección, sala de reuniones y sala de agentes.
  function layout() {
    const staff = q.staff();
    const zoneOf = (u) => (u.role === "director" ? "direccion" : (u.areas || []).find((a) => a !== "direccion") || "otros");
    const by = {};
    for (const u of L.sortPeople ? L.sortPeople(staff) : staff) (by[zoneOf(u)] = by[zoneOf(u)] || []).push(u);
    const COLS = 3, SX = 2.25, SY = 2.7;
    const deskZone = (id, label, people, cols = COLS) => {
      const rows = Math.max(1, Math.ceil(people.length / cols));
      return { id, label, kind: "desks", people, cols, w: 0.7 + cols * SX, d: 1.4 + rows * SY };
    };
    const zones = [
      [deskZone("arquitectura", "Arquitectura", by.arquitectura || []), deskZone("interior", "Diseño Interior", by.interior || [])],
      [deskZone("visualizacion", "Visualización", by.visualizacion || []), deskZone("administracion", "Administración", by.administracion || [])],
      [deskZone("direccion", "Dirección creativa", by.direccion || [], 1), { id: "reuniones", label: "Sala de reuniones", kind: "meeting", w: 6.4, d: 5.2 }],
      [{ id: "agentes", label: "Sala de agentes", kind: "agents", w: 0.8 + (L.visibleAgents ? L.visibleAgents().length : 6) * 1.35, d: 3.2 }, ...(by.otros && by.otros.length ? [deskZone("otros", "Sin área asignada", by.otros)] : [])],
    ];
    let y = 0;
    const placed = [];
    for (const row of zones) {
      let x = 0;
      const depth = Math.max(...row.map((z) => z.d));
      for (const z of row) { placed.push({ ...z, x, y, d: z.kind === "desks" ? depth : z.d }); x += z.w + 1; }
      y += depth + 1;
    }
    // Puestos: posición de cada escritorio dentro de su zona.
    for (const z of placed.filter((z) => z.kind === "desks")) {
      z.desks = z.people.map((u, i) => ({ u, x: z.x + 0.45 + (i % z.cols) * SX, y: z.y + 1.35 + Math.floor(i / z.cols) * SY }));
    }
    return placed;
  }

  const AREA_COLOR = { arquitectura: "var(--a-arquitectura)", interior: "var(--a-interior)", visualizacion: "var(--a-visualizacion)", administracion: "var(--a-administracion)", direccion: "var(--a-direccion)", reuniones: "var(--blue)", agentes: "var(--muted)", otros: "var(--faint)" };

  function Floor({ z }) {
    const c = AREA_COLOR[z.id] || "var(--faint)";
    const lines = [];
    for (let i = 1; i < z.w; i++) lines.push(html`<line key=${"a" + i} x1=${P(z.x + i, z.y)[0]} y1=${P(z.x + i, z.y)[1]} x2=${P(z.x + i, z.y + z.d)[0]} y2=${P(z.x + i, z.y + z.d)[1]} />`);
    for (let j = 1; j < z.d; j++) lines.push(html`<line key=${"b" + j} x1=${P(z.x, z.y + j)[0]} y1=${P(z.x, z.y + j)[1]} x2=${P(z.x + z.w, z.y + j)[0]} y2=${P(z.x + z.w, z.y + j)[1]} />`);
    const wallL = pts(P(z.x, z.y), P(z.x, z.y + z.d), P(z.x, z.y + z.d, 12), P(z.x, z.y, 12));
    const wallR = pts(P(z.x, z.y), P(z.x + z.w, z.y), P(z.x + z.w, z.y, 12), P(z.x, z.y, 12));
    return html`<g class="zone" style=${{ "--zc": c }}>
      <polygon class="zone-floor" points=${pts(P(z.x, z.y), P(z.x + z.w, z.y), P(z.x + z.w, z.y + z.d), P(z.x, z.y + z.d))} />
      <g class="zone-grid">${lines}</g>
      <polygon class="zone-wall l" points=${wallL} /><polygon class="zone-wall r" points=${wallR} />
      <polyline class="zone-rim" points=${pts(P(z.x, z.y + z.d), P(z.x + z.w, z.y + z.d), P(z.x + z.w, z.y))} />
    </g>`;
  }
  function ZoneLabel({ z, extra }) {
    // Pintada en el piso, a lo largo del borde delantero izquierdo de la zona, fuera de los puestos.
    const [x, y] = P(z.x + 0.25, z.y + z.d + 0.42);
    return html`<g class="zone-label" transform=${`translate(${x},${y}) rotate(26.565)`}><text x="0" y="0"><tspan class="zl-dot" style=${{ fill: AREA_COLOR[z.id] }}>● </tspan>${z.label.toUpperCase()}${extra && html`<tspan class="zone-extra">  ·  ${extra}</tspan>`}</text></g>`;
  }

  // Persona: figura propia con la inicial o la foto. Origen en los pies.
  function Person({ u, x, y, state, onOpen, bubble, area }) {
    const [sx, sy] = P(x, y);
    const photo = q.avatar(u);
    const clip = "clip-" + u.id;
    const label = `${u.name}${state === "working" && bubble ? ": trabajando en " + bubble : state === "meeting" ? ": en reunión" : ""}${u.estado ? " · " + u.estado : ""}`;
    return html`<g class=${L.cx("person", state)} transform=${`translate(${sx},${sy})`} role="button" tabindex="0" aria-label=${label} onClick=${onOpen} onKeyDown=${(e) => { if (e.key === "Enter") onOpen(); }}>
      <title>${label}</title>
      <ellipse class="p-shadow" cx="0" cy="0" rx="12" ry="5" />
      <g class="p-body">
        <path class="p-torso" d="M-11 0 v-14 q0 -9 11 -9 q11 0 11 9 v14 z" style=${{ fill: AREA_COLOR[area] || "var(--blue)" }} />
        <circle class="p-head" cx="0" cy="-33" r="10.5" />
        ${photo ? html`<clipPath id=${clip}><circle cx="0" cy="-33" r="10" /></clipPath><image href=${photo} x="-10" y="-43" width="20" height="20" clip-path=${`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />`
          : html`<text class="p-ini" x="0" y="-29.5" text-anchor="middle">${L.initials(u.name)}</text>`}
        ${(state === "online" || state === "working" || state === "meeting") && html`<circle class="p-dot" cx="8" cy="-41" r="3.2" />`}
      </g>
      ${bubble && html`<g class="p-bubble" transform="translate(0,-56)">
        <rect x=${-Math.min(150, bubble.length * 5.6 + 18) / 2} y="-15" width=${Math.min(150, bubble.length * 5.6 + 18)} height="20" rx="10" />
        <path d="M-4 5 L0 10 L4 5 z" /><text x="0" y="-1" text-anchor="middle">${bubble}</text></g>`}
    </g>`;
  }

  function Desk({ dk, info, onOpen }) {
    const { u, x, y } = dk;
    const desk = box(x, y, 1.7, 0.85, 15);
    const mon = box(x + 0.45, y + 0.62, 0.8, 0.08, 13, 15);
    const chair = box(x + 0.6, y - 0.75, 0.5, 0.5, 9);
    const [nx, ny] = P(x + 0.85, y + 0.85);
    return html`<g class=${L.cx("desk", info.state)}>
      ${info.state !== "offline" && info.state !== "absent" && info.state !== "meeting"
        ? html`<${Person} u=${u} x=${x + 0.85} y=${y - 0.35} state=${info.state} bubble=${info.bubble} area=${info.area} onOpen=${onOpen} />`
        : html`<${Box} b=${chair} cls="chair" />`}
      <${Box} b=${desk} cls="desk-box" />
      <${Box} b=${mon} cls=${L.cx("monitor", info.state === "working" && "on")} />
      <g class="nameplate" transform=${`translate(${nx},${ny + 14})`} onClick=${onOpen}>
        <text text-anchor="middle">${L.first(u.name)}</text>
        ${info.note && html`<text y="12" text-anchor="middle" class="np-note">${info.note}</text>`}
      </g>
    </g>`;
  }

  function Oficina() {
    const s = L.useStore();
    const [zoom, setZoom] = useState(1);
    const [, tick] = useState(0);
    useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(id); }, []);
    const zones = layout();
    const meet = meetingNow();
    const inMeeting = new Set(meet ? meet.attendees || [] : []);
    const findings = L.agentFindings ? L.myFindings() : [];
    const counts = L.agentCounts ? L.agentCounts(findings) : {};
    const infoOf = (u, zoneId) => {
      const area = zoneId === "direccion" ? "direccion" : zoneId;
      const off = q.absent(u.id);
      if (off) return { state: "absent", area, note: L.labelOf(L.AUSENCIA_TIPOS, off.tipo).toLowerCase() };
      if (!q.online(u)) return { state: "offline", area, note: "" };
      if (inMeeting.has(u.id)) return { state: "meeting", area, note: "en reunión" };
      const task = u.taskId && q.task(u.taskId);
      if (task) { const p = q.project(task.project); return { state: "working", area, bubble: short((p && p.code ? p.code + " · " : "") + task.title), task }; }
      return { state: "online", area, note: u.estado ? short(u.estado, 22) : "" };
    };
    const openPerson = (u, info) => () => { if (info.task) L.openTask(info.task.id); else L.openSheet("profile", u.id); };

    // Límites del dibujo para el viewBox.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const z of zones) for (const [a, b] of [[z.x, z.y], [z.x + z.w, z.y], [z.x, z.y + z.d], [z.x + z.w, z.y + z.d]]) { const [px, py] = P(a, b); minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    minY -= 110; maxY += 40; minX -= 40; maxX += 40;
    const W = maxX - minX, H = maxY - minY;

    // Objetos con profundidad: se dibujan de atrás hacia adelante.
    const items = [];
    for (const z of zones) {
      if (z.kind === "desks") for (const dk of z.desks) { const info = infoOf(dk.u, z.id); items.push({ depth: dk.x + dk.y, el: html`<${Desk} key=${dk.u.id} dk=${dk} info=${info} onOpen=${openPerson(dk.u, info)} />` }); }
      if (z.kind === "meeting") {
        const tx = z.x + 1.4, ty = z.y + 1.6, tw = 3.6, td = 1.8;
        items.push({ depth: tx + ty + 1, el: html`<${Box} key="table" b=${box(tx, ty, tw, td, 14)} cls="table-box" />` });
        const people = [...inMeeting].map(q.user).filter(Boolean);
        const seats = [];
        for (let i = 0; i < 4; i++) seats.push([tx + 0.5 + i * 0.9, ty - 0.45], [tx + 0.5 + i * 0.9, ty + td + 0.55]);
        seats.push([tx - 0.5, ty + 1], [tx + tw + 0.5, ty + 1]);
        people.slice(0, seats.length).forEach((u, i) => {
          const [px, py] = seats[i];
          const zoneId = u.role === "director" ? "direccion" : (u.areas || []).find((a) => a !== "direccion");
          items.push({ depth: px + py, el: html`<${Person} key=${"m" + u.id} u=${u} x=${px} y=${py} state="meeting" area=${zoneId} onOpen=${() => L.go("#evento/" + meet.id)} />` });
        });
      }
      if (z.kind === "agents" && L.visibleAgents) {
        L.visibleAgents().forEach((a, i) => {
          const ax = z.x + 0.95 + i * 1.35, ay = z.y + 1.7;
          const [sx, sy] = P(ax, ay);
          const c = counts[a.id] || { total: 0, alta: 0 };
          const pad = box(ax - 0.45, ay - 0.45, 0.9, 0.9, 5);
          items.push({ depth: ax + ay, el: html`<g key=${"ag" + a.id} class="agent-spot" role="button" tabindex="0" aria-label=${`${a.name}: ${c.total ? L.plural(c.total, "aviso", "avisos") : "sin avisos"}`} onClick=${() => L.go("#agentes/" + a.id)} onKeyDown=${(e) => { if (e.key === "Enter") L.go("#agentes/" + a.id); }}>
            <title>${a.name} · ${a.job}</title>
            <${Box} b=${pad} cls="pad" />
            <g transform=${`translate(${sx},${sy - 5})`}><${L.AgentShape} agent=${a} mood=${c.alta ? "alert" : "ok"} />
              ${c.total > 0 && html`<g class="p-bubble agent-b" transform="translate(0,-64)"><rect x="-17" y="-15" width="34" height="20" rx="10" class=${c.alta ? "alta" : ""} /><path d="M-4 5 L0 10 L4 5 z" class=${c.alta ? "alta" : ""} /><text x="0" y="-1" text-anchor="middle">${c.total}</text></g>`}
              <text class="agent-name" y="16" text-anchor="middle">${a.name}</text></g>
          </g>` });
        });
      }
    }
    items.sort((a, b) => a.depth - b.depth);

    const staff = q.staff();
    const online = staff.filter((u) => q.online(u) && !q.absent(u.id));
    const working = online.filter((u) => u.taskId && q.task(u.taskId));
    return html`
      <${L.PageHead} title="Oficina" sub=${`${L.plural(online.length, "persona conectada", "personas conectadas")} · ${L.plural(working.length, "trabajando en una tarea", "trabajando en una tarea")}${meet ? " · reunión en curso: " + meet.title : ""}`}>
        <div class="seg" role="group" aria-label="Zoom">
          <button type="button" aria-label="Alejar" onClick=${() => setZoom(Math.max(0.6, +(zoom - 0.2).toFixed(1)))}>−</button>
          <button type="button" onClick=${() => setZoom(1)}>${Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Acercar" onClick=${() => setZoom(Math.min(2, +(zoom + 0.2).toFixed(1)))}>+</button>
        </div>
      <//>
      ${staff.length ? html`<div class="glass office-wrap">
        <svg class="office" viewBox=${`${minX} ${minY} ${W} ${H}`} style=${{ width: zoom * 100 + "%", minWidth: W * 0.62 * zoom + "px" }} role="img" aria-label="Plano de la oficina">
          ${zones.map((z) => html`<${Floor} key=${z.id} z=${z} />`)}
          ${items.map((it) => it.el)}
          ${zones.map((z) => html`<${ZoneLabel} key=${"l" + z.id} z=${z} extra=${z.kind === "meeting" ? (meet ? short(meet.title, 30) : "libre") : z.kind === "agents" ? "revisan el estudio sin usar IA" : ""} />`)}
        </svg>
      </div>
      <div class="office-legend"><span><i class="lg on"></i>Conectado</span><span><i class="lg work"></i>Trabajando en una tarea (clic para abrirla)</span><span><i class="lg off"></i>Puesto vacío: desconectado o ausente</span><span>Los agentes muestran cuántos avisos tienen para ti</span></div>`
      : html`<div class="glass"><${Empty} title="La oficina está vacía" text="Cuando el equipo cree sus cuentas, cada persona aparece en su puesto." /></div>`}`;
  }

  Object.assign(L, { Oficina });
})();
