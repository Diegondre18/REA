// La oficina en pixel art: vista isométrica caminable. Cada persona tiene su muñeco y su puesto.
// Si su muñeco se para del escritorio, queda "fuera del puesto" (almuerzo, una vuelta); al volver
// se ve en qué tarea está trabajando. Los agentes viven en su laboratorio, disponibles para todos.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q } = L;
  const { useEffect, useRef } = hooks;

  /* ================= geometría isométrica (pixeles reales, sin suavizado) ================= */
  const TW = 16, TH = 8;
  // U = pixeles de pantalla por cada pixel del dibujo base: se dibuja a la resolución real de la
  // pantalla, así los muebles quedan nítidos y los muñecos conservan sus pixeles.
  let OX = 0, OY = 0, U = 3;
  const P = (x, y, z = 0) => [Math.round(OX + (x - y) * (TW / 2) * U), Math.round(OY + ((x + y) * (TH / 2) - z) * U)];
  const px = (n) => Math.max(1, Math.round(n * U));

  // Relleno de polígonos convexos por filas: bordes nítidos, sin antialias.
  function fillPoly(ctx, pts, color) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    ctx.fillStyle = color;
    for (let y = Math.ceil(minY); y < maxY; y++) {
      const cy = y + 0.5;
      let xl = Infinity, xr = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((cy >= y1 && cy < y2) || (cy >= y2 && cy < y1)) {
          const x = x1 + ((cy - y1) * (x2 - x1)) / (y2 - y1);
          if (x < xl) xl = x; if (x > xr) xr = x;
        }
      }
      if (xl <= xr) { const a = Math.round(xl), b = Math.round(xr); if (b > a) ctx.fillRect(a, y, b - a, 1); }
    }
  }
  function line(ctx, [x0, y0], [x1, y1], color) {
    ctx.fillStyle = color;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 2000; i++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  const INK = "#3a2f36";
  const sh = (c, k) => L.PIX.shade(c, k);
  // Caja con tres caras visibles y contorno oscuro.
  function box(ctx, x, y, z, w, d, h, top, left, right, outline = INK) {
    const t = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
    const lf = [P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)];
    const rt = [P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)];
    const solid = top[0] === "#";
    fillPoly(ctx, lf, left || (solid ? sh(top, 0.18) : top)); fillPoly(ctx, rt, right || (solid ? sh(top, 0.3) : top)); fillPoly(ctx, t, top);
    if (outline) {
      line(ctx, t[0], t[1], outline); line(ctx, t[1], t[2], outline); line(ctx, t[2], t[3], outline); line(ctx, t[3], t[0], outline);
      line(ctx, lf[3], lf[2], outline); line(ctx, rt[2], rt[3], outline);
      line(ctx, t[3], lf[3], outline); line(ctx, t[2], lf[2], outline); line(ctx, t[1], rt[3], outline);
    }
  }
  // Rectángulo pintado sobre la pared del fondo (y = 0) o la izquierda (x = 0).
  const onWallY = (a, b, z1, z2) => [P(a, 0, z1), P(b, 0, z1), P(b, 0, z2), P(a, 0, z2)];
  const onWallX = (a, b, z1, z2) => [P(0, a, z1), P(0, b, z1), P(0, b, z2), P(0, a, z2)];

  /* ================= paleta ================= */
  const C = {
    floor: "#d6cdc6", floorLine: "#cbc1ba", wood: "#e3c9a3", woodSide: "#c9a77d", woodDark: "#a98760",
    wallY: "#a4979b", wallX: "#8d8086", cap: "#5d5158", edge: "#6e6268", metal: "#4a4650", screen: "#2b2d3a", glow: "#86c5ff",
    leaf: "#6aa34a", leaf2: "#4f8a36", leaf3: "#3b6e2a", pot: "#ebe4dc", glass: "rgba(176,208,226,0.38)", frame: "#6d6470",
    sofa: "#e6ddd2", rug: "#c9b9a8", lab: "#c3ccd2", labLine: "#b6c0c7", dirFloor: "#cdb79c", dirLine: "#c2ab8f", paper: "#f4f1ea", win: "#9fb6c8",
  };
  const AREA_HEX = { arquitectura: "#8a7f73", interior: "#c08a3e", visualizacion: "#0057ff", administracion: "#4f8a6a", otros: "#9a9a9a" };

  /* ================= mapa del estudio ================= */
  const ROWS = [["arquitectura", "Arquitectura"], ["interior", "Diseño Interior"], ["visualizacion", "Visualización"], ["administracion", "Administración"]];
  function buildMap() {
    const staff = L.sortPeople ? L.sortPeople(q.staff()) : q.staff();
    const zoneOf = (u) => (u.role === "director" ? "direccion" : (u.areas || []).find((a) => a !== "direccion") || "otros");
    const by = {};
    for (const u of staff) (by[zoneOf(u)] = by[zoneOf(u)] || []).push(u);
    const rows = ROWS.map(([id, label]) => ({ id, label, people: by[id] || [] }));
    if (by.otros && by.otros.length) rows.push({ id: "otros", label: "Sin área", people: by.otros });
    const N = Math.max(3, ...rows.map((r) => r.people.length));
    const DX = 8, RX = DX + 2 * N + 1;
    const W = RX + 11, D = Math.max(19, 3 + rows.length * 4 + 2);
    const blocked = new Set();
    const block = (x, y, w = 1, d = 1) => { for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) blocked.add((x + i) + "," + (y + j)); };
    const seats = {}; // uid → { x, y, desk }
    const desks = [];

    // Escritorios por área, en filas.
    rows.forEach((row, k) => {
      const y = 2 + k * 4;
      for (let i = 0; i < N; i++) {
        const x = DX + 2 * i, u = row.people[i] || null;
        const dk = { x, y, u, area: row.id, i };
        desks.push(dk);
        block(x, y, 2, 1);
        if (u) seats[u.id] = { x: x + 0.5, y: y + 1.5, desk: dk };
      }
      row.y = y;
    });
    // Dirección: oficina de vidrio arriba a la izquierda.
    const dirs = by.direccion || [];
    const dirDesk = { x: 1, y: 2, u: dirs[0] || null, area: "direccion", i: 0, boss: true };
    desks.push(dirDesk); block(1, 2, 2, 1);
    if (dirDesk.u) seats[dirDesk.u.id] = { x: 1.5, y: 3.5, desk: dirDesk };
    // Paredes de vidrio (ocupan su baldosa; con puerta).
    const glass = [];
    for (let y = 0; y <= 6; y++) if (y !== 4) { glass.push([6, y, "x"]); block(6, y); }
    for (let x = 0; x <= 5; x++) if (x !== 3) { glass.push([x, 7, "y"]); block(x, 7); }
    glass.push([6, 7, "c"]); block(6, 7);
    for (let y = 8; y < D; y++) if (y !== 12) { glass.push([6, y, "x"]); block(6, y); }
    // Laboratorio de agentes: consolas en dos columnas.
    const labSpots = (L.AGENTS || []).map((a, i) => ({ a, x: 1.5 + (i % 2) * 2.6, y: 10.5 + Math.floor(i / 2) * 2.7 }));
    for (const sp of labSpots) block(Math.floor(sp.x), Math.floor(sp.y - 1));
    // Sala de juntas, maqueta, biblioteca y cafetería a la derecha.
    const meet = { x: RX + 1, y: 2, w: 5, d: 2 };
    block(meet.x, meet.y, meet.w, meet.d);
    const maq = { x: RX + 1, y: 8, w: 4, d: 2 };
    block(maq.x, maq.y, maq.w, maq.d);
    const shelf = { x: RX + 7, y: 0, w: 3, d: 1 };
    block(shelf.x, shelf.y, shelf.w, shelf.d);
    const sofa = { x: RX + 6, y: D - 4, w: 3, d: 1 };
    block(sofa.x, sofa.y, sofa.w, sofa.d);
    const coffee = { x: RX + 6, y: D - 6, w: 2, d: 1 };
    block(coffee.x, coffee.y, coffee.w, coffee.d);
    const bar = { x: RX + 1, y: D - 5, w: 3, d: 1 };
    block(bar.x, bar.y, bar.w, bar.d);
    const plants = [[DX - 1, 0], [RX, 0], [RX + 10, 3], [RX + 10, D - 2], [W - 1, 8], [4, 1], [0, D - 1], [DX - 1, D - 1], [RX + 5, 6]];
    for (const [x, y] of plants) block(x, y);
    const lamp = { x: RX + 9, y: D - 4 };
    block(lamp.x, lamp.y);
    const chairs = [[meet.x, 1], [meet.x + 2, 1], [meet.x + 4, 1], [meet.x, 4], [meet.x + 2, 4], [meet.x + 4, 4]];
    for (const [x, y] of chairs) block(x, y);
    const stools = [[maq.x, 10], [maq.x + 2, 10], [maq.x + 4, 9]];
    for (const [x, y] of stools) block(x, y);
    const armchairs = [[1, 5], [3, 5]];
    for (const [x, y] of armchairs) block(x, y);
    return { W, D, DX, RX, N, rows, desks, seats, blocked, glass, labSpots, meet, maq, shelf, sofa, coffee, bar, plants, lamp, chairs, stools, armchairs };
  }
  const walkable = (m, x, y) => x >= 0 && y >= 0 && x < m.W && y < m.D && !m.blocked.has(x + "," + y);

  /* ================= muebles ================= */
  function drawPlant(ctx, x, y, tall) {
    box(ctx, x + 0.3, y + 0.3, 0, 0.4, 0.4, 5, C.pot, "#d6cdc3", "#c7bdb2");
    const [cx, cy] = P(x + 0.5, y + 0.5, tall ? 14 : 9);
    // Hojas en "medio pixel": más detalle sin perder el estilo.
    const b = Math.ceil(U / 2) + 1;
    const blob = (dx, dy, r, col) => {
      ctx.fillStyle = col;
      const R2 = r * 2;
      for (let i = -R2; i <= R2; i++) for (let j = -R2; j <= R2; j++) if (i * i + j * j <= R2 * R2 + 2) ctx.fillRect(cx + Math.round((dx + i / 2) * U), cy + Math.round((dy + j / 2) * U), b, b);
    };
    blob(0, 0, tall ? 5 : 4, INK);
    if (tall) blob(-1, -6, 4, INK);
    blob(0, 0, tall ? 4 : 3, C.leaf2); blob(-2, -2, 2, C.leaf); blob(2, 1, 2, C.leaf3); blob(1, -3, 1, C.leaf);
    if (tall) { blob(-1, -6, 3, C.leaf2); blob(1, -7, 2, C.leaf); blob(-3, -5, 1, C.leaf3); }
  }
  function drawDesk(ctx, dk, st) {
    const { x, y } = dk;
    const top = dk.boss ? "#d8b48a" : C.wood;
    box(ctx, x + 0.08, y + 0.15, 0, 0.12, 0.7, 9, C.metal);
    box(ctx, x + 1.35, y + 0.15, 0, 0.55, 0.7, 9, C.woodSide, C.woodSide, C.woodDark);
    box(ctx, x, y + 0.1, 9, 2, 0.85, 2, top, C.woodSide, C.woodDark);
    // Monitor: la pantalla mira a la silla; se ilumina si la persona trabaja en una tarea.
    const scr = st === "working" ? C.glow : st === "online" ? "#4a5a7a" : C.screen;
    box(ctx, x + 0.75, y + 0.35, 11, 0.12, 0.12, 2, C.metal);
    box(ctx, x + 0.45, y + 0.3, 13, 0.75, 0.12, 6, "#3d3e48", scr, "#2f3039");
    box(ctx, x + 0.5, y + 0.6, 11, 0.6, 0.18, 1, "#d9d9de", "#bdbdc4", "#a9a9b0", null);
    const v = (dk.i || 0) % 4;
    if (v === 0) box(ctx, x + 1.55, y + 0.3, 11, 0.12, 0.35, 5, "#c0503f", "#a84434", "#8f3a2c");
    if (v === 1) box(ctx, x + 1.55, y + 0.5, 11, 0.18, 0.18, 3, "#f4f1ea", "#dcd7cf", "#c7c1b8");
    if (v === 2) { box(ctx, x + 1.45, y + 0.3, 11, 0.4, 0.3, 2, "#5c7fb8"); box(ctx, x + 1.45, y + 0.3, 13, 0.4, 0.3, 2, "#e0c46c"); }
    // Nota amarilla en el puesto de quien está ausente.
    if (st === "absent") box(ctx, x + 0.15, y + 0.55, 11, 0.3, 0.25, 3, "#f6e27a", "#e4cc5c", "#d1b94a", null);
  }
  function drawChairSeat(ctx, sx, sy) { box(ctx, sx - 0.05, sy - 0.05, 0, 0.1, 0.1, 4, C.metal); box(ctx, sx - 0.22, sy - 0.22, 4, 0.44, 0.44, 2, "#5a5560", "#4a4650", "#3e3a44"); }
  function drawChairBack(ctx, sx, sy) { box(ctx, sx - 0.22, sy + 0.18, 6, 0.44, 0.08, 7, "#5a5560", "#4a4650", "#3e3a44"); }
  function drawArmchair(ctx, x, y) { box(ctx, x + 0.15, y + 0.15, 0, 0.7, 0.7, 5, "#b9a99a", "#a59585", "#94857a"); box(ctx, x + 0.15, y + 0.15, 5, 0.7, 0.18, 6, "#b9a99a", "#a59585", "#94857a"); }
  function drawGlass(ctx, x, y, dir) {
    const t = 0.12;
    const [bx, by, w, d] = dir === "x" ? [x + 0.44, y, t, 1] : dir === "y" ? [x, y + 0.44, 1, t] : [x + 0.44, y + 0.44, t, t];
    box(ctx, bx, by, 0, w, d, 30, "rgba(200,225,238,0.6)", C.glass, C.glass, C.frame);
    box(ctx, bx, by, 30, w, d, 2, C.frame, C.frame, C.frame, null);
  }
  function drawShelf(ctx, s) {
    box(ctx, s.x, s.y + 0.1, 0, s.w, 0.8, 34, C.woodSide, "#b8956b", C.woodDark);
    const books = ["#c0503f", "#e0c46c", "#5c7fb8", "#f4f1ea", "#6aa34a", "#8b5a2b", "#2d2f36", "#d97aa6"];
    for (let lvl = 0; lvl < 4; lvl++) {
      const z = 3 + lvl * 8;
      let bx = s.x + 0.1, n = 0;
      while (bx < s.x + s.w - 0.25) {
        const bw = 0.12 + ((lvl * 7 + n * 3) % 3) * 0.05, hh = 5 + ((lvl + n) % 3);
        if ((lvl + n) % 6 !== 5) box(ctx, bx, s.y + 0.75, z, bw, 0.15, hh, books[(lvl * 3 + n) % books.length], null, null, null);
        bx += bw + 0.02; n++;
      }
      line(ctx, P(s.x, s.y + 0.9, z - 1), P(s.x + s.w, s.y + 0.9, z - 1), C.woodDark);
    }
  }
  function drawMeeting(ctx, m) {
    box(ctx, m.x + 0.3, m.y + 0.3, 0, 0.2, 0.2, 9, C.metal); box(ctx, m.x + m.w - 0.5, m.y + m.d - 0.5, 0, 0.2, 0.2, 9, C.metal);
    box(ctx, m.x, m.y, 9, m.w, m.d, 2, C.wood, C.woodSide, C.woodDark);
    box(ctx, m.x + 2, m.y + 0.6, 11, 1, 0.7, 1, C.paper, "#ddd8cf", "#c9c3b9");
    box(ctx, m.x + 2.3, m.y + 0.75, 12, 0.4, 0.4, 2, "#3d3e48");
  }
  function drawMaqueta(ctx, m) {
    box(ctx, m.x, m.y, 0, m.w, m.d, 10, "#efebe4", "#d9d3c9", "#c6bfb4");
    box(ctx, m.x + 0.4, m.y + 0.3, 10, 2.6, 1.3, 1, C.paper, "#e6e1d8", "#d6d0c6", "#9aa4b0");
    box(ctx, m.x + 1, m.y + 0.5, 11, 1, 0.8, 16, "#fbfaf7", "#e4e0d8", "#d1ccc2");
    box(ctx, m.x + 1, m.y + 0.5, 27, 0.6, 0.8, 7, "#fbfaf7", "#e4e0d8", "#d1ccc2");
    box(ctx, m.x + 2.1, m.y + 0.6, 11, 0.6, 0.6, 9, "#fbfaf7", "#e4e0d8", "#d1ccc2");
    box(ctx, m.x + 3.2, m.y + 0.4, 11, 0.12, 1.2, 1, "#9fb6c8", null, null, null);
  }
  function drawLounge(ctx, mp) {
    const { sofa, coffee, bar, lamp } = mp;
    fillPoly(ctx, [P(sofa.x - 0.5, coffee.y - 0.5), P(sofa.x + 3.5, coffee.y - 0.5), P(sofa.x + 3.5, sofa.y + 0.5), P(sofa.x - 0.5, sofa.y + 0.5)], C.rug);
    box(ctx, coffee.x, coffee.y + 0.1, 0, coffee.w, 0.8, 6, C.woodDark, "#8e6f4c", "#7a5e40");
    box(ctx, coffee.x + 0.4, coffee.y + 0.3, 6, 0.6, 0.4, 2, C.paper);
    box(ctx, sofa.x, sofa.y, 0, sofa.w, 1, 6, C.sofa, "#d3c8bb", "#c1b5a7");
    box(ctx, sofa.x, sofa.y + 0.7, 6, sofa.w, 0.3, 8, C.sofa, "#d3c8bb", "#c1b5a7");
    box(ctx, sofa.x - 0.1, sofa.y, 6, 0.25, 1, 4, C.sofa); box(ctx, sofa.x + sofa.w - 0.15, sofa.y, 6, 0.25, 1, 4, C.sofa);
    box(ctx, bar.x, bar.y, 0, bar.w, 1, 11, "#5d5158", "#4f444b", "#43393f");
    box(ctx, bar.x, bar.y, 11, bar.w, 1, 1, "#e8e2da");
    box(ctx, bar.x + 0.3, bar.y + 0.2, 12, 0.5, 0.5, 6, "#2d2f36", "#3a3c44", "#26282d");
    box(ctx, bar.x + 1.3, bar.y + 0.4, 12, 0.2, 0.2, 2, "#f4f1ea"); box(ctx, bar.x + 1.7, bar.y + 0.3, 12, 0.2, 0.2, 2, "#c0503f");
    box(ctx, lamp.x + 0.45, lamp.y + 0.45, 0, 0.1, 0.1, 22, C.metal);
    box(ctx, lamp.x + 0.25, lamp.y + 0.25, 22, 0.5, 0.5, 5, "#fbe7a8", "#f3d77f", "#e9c968");
  }
  function drawConsole(ctx, sp, alert) {
    const x = Math.floor(sp.x), y = Math.floor(sp.y - 1);
    box(ctx, x + 0.1, y + 0.2, 0, 0.8, 0.6, 8, "#4b5563", "#3d4652", "#333b45");
    box(ctx, x + 0.15, y + 0.25, 8, 0.7, 0.12, 9, "#2f3640", sh(sp.a.color, -0.35), "#262c34");
    box(ctx, x + 0.2, y + 0.55, 8, 0.6, 0.2, 1, alert ? "#ff6b7d" : "#9be7b0", null, null, null);
  }
  // Robot del laboratorio: pixel art propio, con el color de cada agente.
  function drawRobot(ctx, sx, sy, a, t, alert) {
    const bob = Math.round(Math.sin(t / 380 + a.color.length) * 1);
    const k = Math.max(1, Math.round(U)), ow = Math.max(1, Math.round(k * 0.4));
    const x = sx - 6 * k, y = sy - (19 - bob) * k, c = a.color, cS = sh(c, 0.25);
    const R = [[5, 0, 1, 3, c], [4, -1, 3, 1, alert ? "#ff3b55" : "#ffe27a"], [1, 3, 10, 7, c], [2, 4, 8, 4, "#f2f5f8"], [4, 5, 1, 2, INK], [7, 5, 1, 2, INK], [10, 4, 1, 5, cS], [2, 10, 8, 5, cS], [3, 11, 6, 3, c], [0, 11, 1, 4, cS], [11, 11, 1, 4, cS], [3, 15, 2, 3, "#3b3f4a"], [7, 15, 2, 3, "#3b3f4a"]];
    ctx.fillStyle = INK;
    for (const [rx, ry, w, h] of R) ctx.fillRect(x + rx * k - ow, y + ry * k - ow, w * k + 2 * ow, h * k + 2 * ow);
    for (const [rx, ry, w, h, col] of R) { ctx.fillStyle = col; ctx.fillRect(x + rx * k, y + ry * k, w * k, h * k); }
  }

  /* ================= fondo: piso y paredes ================= */
  function drawBackground(ctx, m) {
    const { W, D } = m;
    fillPoly(ctx, [P(0, D, 0), P(W, D, 0), P(W, D, -5), P(0, D, -5)], "#7b6f75");
    fillPoly(ctx, [P(W, 0, 0), P(W, D, 0), P(W, D, -5), P(W, 0, -5)], "#685d63");
    fillPoly(ctx, [P(0, 0), P(W, 0), P(W, D), P(0, D)], C.floor);
    for (let i = 1; i < W; i++) line(ctx, P(i, 0), P(i, D), C.floorLine);
    for (let j = 1; j < D; j++) line(ctx, P(0, j), P(W, j), C.floorLine);
    const zone = (x0, y0, x1, y1, col, lc) => { fillPoly(ctx, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], col); for (let j = y0 + 1; j < y1; j++) line(ctx, P(x0, j), P(x1, j), lc); };
    zone(0, 0, 7, 7, C.dirFloor, C.dirLine);
    zone(0, 8, 7, D, C.lab, C.labLine);
    for (let i = 1; i < 7; i++) line(ctx, P(i, 8), P(i, D), C.labLine);
    // Franja de color de cada área frente a su fila de escritorios.
    for (const row of m.rows) fillPoly(ctx, [P(m.DX - 0.3, row.y + 2.55), P(m.DX + 2 * m.N + 0.3, row.y + 2.55), P(m.DX + 2 * m.N + 0.3, row.y + 2.8), P(m.DX - 0.3, row.y + 2.8)], AREA_HEX[row.id] || "#999");
    const H = 46;
    fillPoly(ctx, [P(0, 0, 0), P(W, 0, 0), P(W, 0, H), P(0, 0, H)], C.wallY);
    fillPoly(ctx, [P(0, 0, 0), P(0, D, 0), P(0, D, H), P(0, 0, H)], C.wallX);
    fillPoly(ctx, [P(-0.4, -0.4, H), P(W, -0.4, H), P(W, 0, H), P(0, 0, H)], C.cap);
    fillPoly(ctx, [P(-0.4, -0.4, H), P(0, 0, H), P(0, D, H), P(-0.4, D, H)], C.cap);
    line(ctx, P(0, 0, 0), P(0, 0, H), C.edge);
    for (let a = 0.25; a < 7; a += 0.5) line(ctx, P(0, a, 2), P(0, a, H - 2), "#7e6f66");
    for (let x = m.RX + 1; x < W - 1.5; x += 2.2) {
      fillPoly(ctx, onWallY(x, x + 1.9, 8, H - 6), C.win);
      line(ctx, P(x, 0, 8), P(x + 1.9, 0, 8), C.frame); line(ctx, P(x, 0, H - 6), P(x + 1.9, 0, H - 6), C.frame);
      line(ctx, P(x + 0.95, 0, 8), P(x + 0.95, 0, H - 6), "#c4d3de"); line(ctx, P(x + 0.3, 0, 30), P(x + 0.7, 0, 34), "#d6e3ec");
    }
    for (let x = m.DX; x < m.DX + 2 * m.N - 1.5; x += 3) {
      fillPoly(ctx, onWallY(x + 0.3, x + 2.2, 18, 34), INK); fillPoly(ctx, onWallY(x + 0.4, x + 2.1, 19, 33), C.paper);
      for (let k = 0; k < 4; k++) line(ctx, P(x + 0.6 + k * 0.35, 0, 21 + k * 2), P(x + 0.6 + k * 0.35, 0, 30), "#8e9aa6");
      line(ctx, P(x + 0.6, 0, 21), P(x + 1.9, 0, 21), "#8e9aa6");
      const [lx, ly] = P(x + 1.25, 0, 40); ctx.fillStyle = INK; ctx.fillRect(lx - px(1), ly - px(1), px(3), px(2)); ctx.fillStyle = "#ffe9a6"; ctx.fillRect(lx, ly + px(1), px(1), px(2));
    }
    fillPoly(ctx, onWallX(1.2, 4.6, 18, 34), INK); fillPoly(ctx, onWallX(1.3, 4.5, 19, 33), C.paper);
    for (let k = 0; k < 5; k++) line(ctx, P(0, 1.6 + k * 0.6, 21), P(0, 1.6 + k * 0.6, 22 + k * 2), "#8e9aa6");
    fillPoly(ctx, onWallX(9.5, 15, 14, 36), INK); fillPoly(ctx, onWallX(9.65, 14.85, 15, 35), "#203040");
    for (let k = 0; k < 7; k++) line(ctx, P(0, 10 + k * 0.7, 18), P(0, 10 + k * 0.7, 18 + ((k * 7) % 13)), "#5fd0a0");
  }

  /* ================= estado de cada persona ================= */
  function personState(u) {
    if (q.absent(u.id)) return "absent";
    if (!q.online(u)) return "offline";
    if (!q.atDesk(u)) return "away";
    if (u.taskId && q.task(u.taskId)) return "working";
    return "online";
  }

  /* ================= motor: dibujo, movimiento y clics ================= */
  function createEngine(canvas, overlay) {
    const ctx = canvas.getContext("2d");
    let map = null, raf = 0, last = 0, dirty = true, mapKey = "", box0 = { w: 1000, h: 600 }, DPR = 1;
    const actors = new Map(); // uid → { x, y, path, dir, frame, flip, user, state }
    let me = null, data = { findings: {}, meet: null };
    let sendAt = 0, lastSig = "";
    const labels = new Map();

    function setMap(m) { map = m; fit(); }
    // La oficina completa cabe en el recuadro, centrada; el lienzo tiene la resolución de la pantalla.
    function fit() {
      if (!map) return;
      DPR = window.devicePixelRatio || 1;
      const cw = Math.max(320, box0.w), ch = Math.max(240, box0.h);
      canvas.width = Math.round(cw * DPR); canvas.height = Math.round(ch * DPR);
      canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
      const loW = (map.W + map.D) * (TW / 2) + 16, loH = (map.W + map.D) * (TH / 2) + 46 + 5 + 22;
      U = Math.min(canvas.width / loW, canvas.height / loH);
      OX = Math.round((canvas.width - (map.W + map.D) * (TW / 2) * U) / 2 + map.D * (TW / 2) * U);
      OY = Math.round((canvas.height - loH * U) / 2 + (46 + 16) * U);
      overlay.style.setProperty("--z", U / DPR);
      overlay.style.width = cw + "px"; overlay.style.height = ch + "px";
      dirty = true;
    }
    const seatOf = (uid) => map && map.seats[uid];
    const isSeatTile = (x, y) => Object.values(map.seats).some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y);
    const free = (x, y) => walkable(map, x, y) || isSeatTile(x, y);

    function syncActors(users) {
      const seen = new Set();
      for (const u of users) {
        if (u.role === "maestro") continue;
        const st = personState(u);
        if (st === "offline" || st === "absent") { actors.delete(u.id); continue; }
        seen.add(u.id);
        const seat = seatOf(u.id);
        let tx, ty;
        if (q.atDesk(u) && seat) { tx = seat.x; ty = seat.y; }
        else if (u.pos && typeof u.pos.x === "number" && free(Math.floor(u.pos.x), Math.floor(u.pos.y))) { tx = u.pos.x; ty = u.pos.y; }
        else if (seat) { tx = seat.x + 1; ty = seat.y; }
        else { tx = map.DX - 1.5; ty = map.D - 2.5; }
        let a = actors.get(u.id);
        if (!a) { a = { x: tx, y: ty, tx, ty, path: [], dir: "back", frame: 0, flip: false, t: 0 }; actors.set(u.id, a); }
        const isMe = me && u.id === me.id;
        if (!isMe && (Math.abs(a.tx - tx) > 0.01 || Math.abs(a.ty - ty) > 0.01)) {
          // Los demás caminan hasta donde dice el servidor (o aparecen si el salto es grande).
          if (Math.hypot(a.x - tx, a.y - ty) > 8) { a.x = tx; a.y = ty; a.path = []; }
          else { const p = findPath(a.x, a.y, Math.floor(tx), Math.floor(ty)); a.path = p && p.length ? [...p.slice(0, -1), [tx, ty]] : [[tx, ty]]; }
          a.tx = tx; a.ty = ty;
        }
        a.user = u; a.state = st;
      }
      for (const id of [...actors.keys()]) if (!seen.has(id)) actors.delete(id);
      dirty = true;
    }

    // Camino más corto por baldosas (8 direcciones, sin cortar esquinas).
    function findPath(sx, sy, gx, gy) {
      const start = [Math.floor(sx), Math.floor(sy)];
      const k = (x, y) => x + "," + y;
      const ok = (x, y) => free(x, y) || (x === start[0] && y === start[1]);
      if (!ok(gx, gy)) return null;
      const prev = new Map([[k(...start), null]]);
      const queue = [start];
      while (queue.length) {
        const [x, y] = queue.shift();
        if (x === gx && y === gy) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (prev.has(k(nx, ny)) || !ok(nx, ny)) continue;
          if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue;
          prev.set(k(nx, ny), [x, y]); queue.push([nx, ny]);
        }
      }
      if (!prev.has(k(gx, gy))) return null;
      const out = [];
      let cur = [gx, gy];
      while (cur && !(cur[0] === start[0] && cur[1] === start[1])) { out.unshift([cur[0] + 0.5, cur[1] + 0.5]); cur = prev.get(k(...cur)); }
      return out;
    }
    function walkMeTo(gx, gy) {
      const a = me && actors.get(me.id);
      if (!a) return;
      const path = findPath(a.x, a.y, gx, gy);
      if (path) { a.path = path; dirty = true; }
    }
    function goToDesk() { const s = seatOf(me && me.id); if (s) walkMeTo(Math.floor(s.x), Math.floor(s.y)); }

    // Presencia: en su puesto o fuera; la posición viaja al servidor sin saturarlo.
    function report(a, force) {
      const seat = seatOf(me.id);
      const atSeat = !!seat && !a.path.length && Math.hypot(a.x - seat.x, a.y - seat.y) < 0.35;
      const pos = { x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10 };
      const sig = atSeat + ":" + pos.x + ":" + pos.y;
      if (sig === lastSig) return;
      const changedSeat = atSeat !== q.atDesk(L.state.me);
      const now = performance.now();
      if (!changedSeat && !force && now - sendAt < 700) return;
      sendAt = now; lastSig = sig;
      L.act.movePresence({ puesto: atSeat, pos: atSeat ? null : pos });
      if (changedSeat) L.toast(atSeat ? "De vuelta en tu puesto" : "Saliste de tu puesto: el equipo te ve fuera (almuerzo, una vuelta)");
    }

    function step(dt) {
      let moving = false;
      for (const [id, a] of actors) {
        if (!a.path.length) { a.frame = 0; continue; }
        moving = true;
        const [tx, ty] = a.path[0];
        const dx = tx - a.x, dy = ty - a.y, dist = Math.hypot(dx, dy);
        const speed = 3.4 * dt;
        if (dist <= speed) { a.x = tx; a.y = ty; a.path.shift(); }
        else { a.x += (dx / dist) * speed; a.y += (dy / dist) * speed; }
        const sx = dx - dy, sy = dx + dy;
        if (Math.abs(sy) > 0.01) a.dir = sy > 0 ? "front" : "back";
        if (Math.abs(sx) > 0.01) a.flip = a.dir === "front" ? sx < 0 : sx > 0;
        a.t += dt; a.frame = Math.floor(a.t * 8) % 4;
        if (me && id === me.id) report(a, !a.path.length);
      }
      return moving;
    }

    function draw(t) {
      const m = map;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      drawBackground(ctx, m);
      const list = [];
      const add = (key, fn) => list.push({ key, fn });
      for (const dk of m.desks) {
        const st = dk.u ? (actors.get(dk.u.id) ? actors.get(dk.u.id).state : personState(dk.u)) : "empty";
        add(dk.x + dk.y + 1.5, () => drawDesk(ctx, dk, st));
        const sx = dk.x + 0.5, sy = dk.y + 1.5;
        add(sx + sy - 0.2, () => drawChairSeat(ctx, sx, sy));
        add(sx + sy + 0.25, () => drawChairBack(ctx, sx, sy));
      }
      for (const [x, y, dir] of m.glass) add(x + y + 0.8, () => drawGlass(ctx, x, y, dir));
      for (const [x, y] of m.plants) add(x + y + 1, () => drawPlant(ctx, x, y, (x + y) % 3 === 0));
      for (const [x, y] of m.armchairs) add(x + y + 1, () => drawArmchair(ctx, x, y));
      add(m.meet.x + m.meet.y + m.meet.w + m.meet.d - 1, () => drawMeeting(ctx, m.meet));
      for (const [x, y] of m.chairs) { add(x + y + 0.7, () => drawChairSeat(ctx, x + 0.5, y + 0.5)); if (y > m.meet.y) add(x + y + 1.1, () => drawChairBack(ctx, x + 0.5, y + 0.5)); }
      add(m.maq.x + m.maq.y + m.maq.w + m.maq.d - 1, () => drawMaqueta(ctx, m.maq));
      for (const [x, y] of m.stools) add(x + y + 1, () => box(ctx, x + 0.3, y + 0.3, 0, 0.4, 0.4, 7, "#5a5560", "#4a4650", "#3e3a44"));
      add(m.shelf.x + m.shelf.y + m.shelf.w, () => drawShelf(ctx, m.shelf));
      add(m.coffee.x + m.coffee.y + 1, () => drawLounge(ctx, m));
      for (const sp of m.labSpots) {
        const c = data.findings[sp.a.id] || { total: 0, alta: 0 };
        add(sp.x + sp.y - 1, () => drawConsole(ctx, sp, c.alta));
        add(sp.x + sp.y + 0.1, () => { const [px, py] = P(sp.x, sp.y); drawRobot(ctx, px, py, sp.a, t, c.alta); });
      }
      for (const [, a] of actors) {
        const seat = seatOf(a.user.id);
        a.seated = a.state !== "away" && !!seat && !a.path.length && Math.hypot(a.x - seat.x, a.y - seat.y) < 0.3;
        add(a.x + a.y + 0.1, () => {
          const [px, py] = P(a.x, a.y);
          const cfg = L.PIX.config(a.user);
          const k = Math.max(1, Math.round(U)), ow = Math.max(1, Math.round(k * 0.4));
          ctx.fillStyle = "rgba(40,30,35,0.22)"; ctx.fillRect(px - 4 * k, py - k, 9 * k, 2 * k);
          if (a.seated) L.PIX.drawFigure(ctx, px - 6 * k, py - 19 * k, cfg, "back", 0, true, false, k, ow);
          else L.PIX.drawFigure(ctx, px - 6 * k, py - 21 * k, cfg, a.dir, a.frame, false, a.flip, k, ow);
        });
      }
      list.sort((A, B) => A.key - B.key);
      for (const it of list) it.fn();
      placeLabels();
    }

    // Nombres y burbujas como texto nítido encima del dibujo.
    function placeLabels() {
      const want = new Map();
      for (const [id, a] of actors) {
        const [px, py] = P(a.x, a.y);
        const u = a.user, isMe = me && id === me.id;
        const task = a.state === "working" && a.seated ? q.task(u.taskId) : null;
        const p = task && q.project(task.project);
        want.set("u" + id, { x: px, y: py - 23 * U, cls: L.cx("o-name", isMe && "me", a.state === "away" && "away"), text: (isMe ? "Tú" : L.first(u.name)) + (a.state === "away" ? " · fuera" : "") });
        if (task) want.set("b" + id, { x: px, y: py - 33 * U, cls: "o-bubble", text: (p && p.code ? p.code + " · " : "") + task.title });
      }
      for (const sp of map.labSpots) {
        const [px, py] = P(sp.x, sp.y);
        const c = data.findings[sp.a.id] || { total: 0, alta: 0 };
        want.set("a" + sp.a.id, { x: px, y: py + 5 * U, cls: "o-agent", text: sp.a.name });
        if (c.total) want.set("c" + sp.a.id, { x: px + 8 * U, y: py - 22 * U, cls: L.cx("o-count", c.alta && "alta"), text: String(c.total) });
      }
      const zl = (id, x, y, text) => want.set("z" + id, { x, y, cls: "o-zone", text });
      for (const row of map.rows) { const [x, y] = P(map.DX - 0.1, row.y + 2.7); want.set("z" + row.id, { x, y: y + 4 * U, cls: "o-zone o-row", text: row.label, left: true }); }
      { const [x, y] = P(0, 3.5, 43); zl("dir", x, y, "Dirección"); }
      { const [x, y] = P(0, 12.3, 43); zl("lab", x, y, "Laboratorio de agentes"); }
      { const [x, y] = P(map.meet.x + 2.5, map.meet.y + 1); zl("meet", x, y - 22 * U, data.meet ? "Reunión: " + data.meet.title : "Sala de juntas"); }
      { const [x, y] = P(map.maq.x + 2, map.maq.y + 1); zl("maq", x, y - 34 * U, "Maquetas"); }
      { const [x, y] = P(map.bar.x + 1.5, map.bar.y + 0.5); zl("cafe", x, y - 18 * U, "Cafetería"); }
      for (const [k, v] of want) {
        let el = labels.get(k);
        if (!el) { el = document.createElement("div"); overlay.appendChild(el); labels.set(k, el); }
        if (el.className !== v.cls) el.className = v.cls;
        if (el.textContent !== v.text) el.textContent = v.text;
        el.style.transform = `translate(${v.x / DPR}px, ${v.y / DPR}px) translate(${v.left ? "0" : "-50%"}, -100%)`;
      }
      for (const [k, el] of labels) if (!want.has(k)) { el.remove(); labels.delete(k); }
    }

    let lastTick = 0;
    function loop(ts) {
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
      last = ts;
      const moving = step(dt);
      // Quieto se redibuja poco (los robots respiran); en movimiento, cada cuadro.
      if (moving || dirty || ts - lastTick > 140) { draw(ts); dirty = false; lastTick = ts; }
      raf = requestAnimationFrame(loop);
    }

    function pick(ev) {
      const r = canvas.getBoundingClientRect();
      const mx = (ev.clientX - r.left) * DPR, my = (ev.clientY - r.top) * DPR;
      for (const [id, a] of [...actors].reverse()) {
        const [px, py] = P(a.x, a.y);
        if (mx >= px - 7 * U && mx <= px + 7 * U && my >= py - 23 * U && my <= py + U) return { kind: "person", id, a };
      }
      for (const sp of map.labSpots) {
        const [px, py] = P(sp.x, sp.y);
        if (mx >= px - 8 * U && mx <= px + 8 * U && my >= py - 22 * U && my <= py + 2 * U) return { kind: "agent", a: sp.a };
      }
      const rx = (mx - OX) / U, ry = (my - OY) / U;
      return { kind: "floor", x: Math.floor((ry / (TH / 2) + rx / (TW / 2)) / 2), y: Math.floor((ry / (TH / 2) - rx / (TW / 2)) / 2) };
    }
    // Clic: en una persona abre su tarea o su perfil; en un agente, su página; en el piso, camina hasta ahí.
    function onClick(ev) {
      const hit = pick(ev);
      if (hit.kind === "person") {
        const u = hit.a.user;
        const working = hit.a.seated && u.taskId && q.task(u.taskId);
        if (me && hit.id === me.id) {
          if (working) L.openTask(u.taskId);
          else if (!hit.a.seated) goToDesk();
          else L.toast("Marca en una tarea «Estoy trabajando en esto» y aparecerá en tu puesto.");
        } else if (working) L.openTask(u.taskId);
        else L.openSheet("profile", u.id);
        return;
      }
      if (hit.kind === "agent") { L.go("#agentes/" + hit.a.id); return; }
      if (free(hit.x, hit.y)) walkMeTo(hit.x, hit.y);
    }
    function onMove(ev) {
      const hit = pick(ev);
      canvas.style.cursor = hit.kind !== "floor" || free(hit.x, hit.y) ? "pointer" : "default";
    }
    // Flechas o WASD: arriba, abajo, izquierda y derecha tal como se ven en la pantalla.
    const KEYS = { arrowup: [-1, -1], w: [-1, -1], arrowdown: [1, 1], s: [1, 1], arrowleft: [-1, 1], a: [-1, 1], arrowright: [1, -1], d: [1, -1] };
    function onKey(ev) {
      if (!me || L.state.sheet || (ev.target && ev.target.closest && ev.target.closest("input, textarea, select, [contenteditable]"))) return;
      const k = KEYS[String(ev.key).toLowerCase()];
      if (!k) return;
      ev.preventDefault();
      const a = actors.get(me.id);
      if (!a || a.path.length > 1) return;
      const cx = Math.floor(a.x), cy = Math.floor(a.y);
      for (const [dx, dy] of [k, [k[0], 0], [0, k[1]]]) {
        const nx = cx + dx, ny = cy + dy;
        if (free(nx, ny) && (!(dx && dy) || (free(cx + dx, cy) && free(cx, cy + dy)))) { a.path = [[nx + 0.5, ny + 0.5]]; return; }
      }
    }
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(loop);

    return {
      update(next) {
        me = L.state.me;
        const key = JSON.stringify(q.staff().map((u) => [u.id, u.role, u.areas]));
        if (!map || key !== mapKey) { mapKey = key; setMap(buildMap()); actors.clear(); }
        data = next;
        syncActors(L.state.users);
      },
      resize(w, h) { if (Math.abs(w - box0.w) < 2 && Math.abs(h - box0.h) < 2) return; box0 = { w, h }; fit(); },
      goToDesk,
      destroy() { cancelAnimationFrame(raf); canvas.removeEventListener("click", onClick); canvas.removeEventListener("mousemove", onMove); window.removeEventListener("keydown", onKey); },
    };
  }

  /* ================= vista ================= */
  function Oficina() {
    const s = L.useStore();
    const cv = useRef(null), ov = useRef(null), wrap = useRef(null), eng = useRef(null);
    const meetNow = () => {
      const now = new Date(), t = L.todayIso(), mins = now.getHours() * 60 + now.getMinutes();
      const mm = (h) => { const [a, b] = String(h || "").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
      return s.eventos.find((e) => e.date === t && e.time && mins >= mm(e.time) && mins < mm(e.time) + (Number(e.duration) || 60)) || null;
    };
    useEffect(() => {
      eng.current = createEngine(cv.current, ov.current);
      // El recuadro ocupa el alto disponible de la ventana; la oficina se ajusta y no se desplaza.
      const size = () => {
        const el = wrap.current; if (!el || !eng.current) return;
        const top = el.getBoundingClientRect().top;
        const h = Math.max(320, window.innerHeight - top - 56);
        el.style.height = h + "px";
        eng.current.resize(el.clientWidth - 16, h - 16);
      };
      const ro = new ResizeObserver(size);
      ro.observe(wrap.current);
      window.addEventListener("resize", size);
      setTimeout(size, 0);
      return () => { ro.disconnect(); window.removeEventListener("resize", size); eng.current && eng.current.destroy(); };
    }, []);
    useEffect(() => {
      if (!eng.current) return;
      const findings = L.agentCounts ? L.agentCounts(L.myFindings()) : {};
      eng.current.update({ findings, meet: meetNow() });
    });
    const staff = q.staff();
    const online = staff.filter((u) => q.online(u) && !q.absent(u.id));
    const away = online.filter((u) => !q.atDesk(u));
    const hasDoll = !!(s.me.muneco && s.me.muneco.ropa);
    return html`
      <${L.PageHead} title="Oficina" sub=${`${L.plural(online.length, "persona conectada", "personas conectadas")}${away.length ? ` · ${away.length} fuera del puesto` : ""} · camina con las flechas o con clic en el piso`}>
        <button type="button" class="btn" onClick=${() => eng.current && eng.current.goToDesk()}>Volver a mi puesto</button>
        <button type="button" class="btn" onClick=${() => L.openSheet("muneco")}>${hasDoll ? "Mi muñeco" : "Crear mi muñeco"}</button>
      <//>
      ${!hasDoll && html`<div class="banner glass"><p><strong>Arma tu muñeco.</strong> Elige peinado, color de pelo, piel y un color de ropa que nadie más tenga. Mientras tanto apareces con ropa gris.</p><button type="button" class="btn sm primary" onClick=${() => L.openSheet("muneco")}>Crear mi muñeco</button></div>`}
      <div class="glass office-wrap pix" ref=${wrap}>
        <div class="office-stage">
          <canvas ref=${cv} class="office-canvas" aria-label="Oficina del estudio. Usa las flechas para caminar."></canvas>
          <div ref=${ov} class="office-overlay" aria-hidden="true"></div>
        </div>
      </div>
      <div class="office-legend"><span>Clic en tu muñeco sentado: abre tu tarea</span><span>Clic en otra persona: su tarea o su perfil</span><span>Fuera del puesto = almuerzo o una vuelta; el equipo lo ve en Equipo</span><span>Clic en un agente del laboratorio: lo que encontró</span></div>`;
  }

  Object.assign(L, { Oficina });
})();
