// La oficina en pixel art: vista isométrica caminable. Cada persona tiene su muñeco y su puesto.
// Si su muñeco se para del escritorio, queda "fuera del puesto" (almuerzo, una vuelta); al volver
// se ve en qué tarea está trabajando. Los agentes viven en su laboratorio, disponibles para todos.
(() => {
  "use strict";
  const L = LAP;
  const { html, hooks, q } = L;
  const { useEffect, useRef, useState } = hooks;

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
    const TX = RX + 12; // sala de nuevas tecnologías
    const W = TX + 7, D = Math.max(19, 3 + rows.length * 4 + 2);
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
    // Sala de nuevas tecnologías, separada con vidrio (puertas en y = 6 y abajo).
    for (let y = 0; y < D; y++) if (y !== 6 && y !== D - 3) { glass.push([RX + 11, y, "x"]); block(RX + 11, y); }
    const tech = {
      printers: { x: TX, y: 1, w: 3, d: 1 }, laser: { x: TX + 4, y: 1, w: 2, d: 1 },
      vr: { x: TX + 1, y: 5, w: 4, d: 4 }, headset: { x: TX + 5, y: 6 }, poles: [[TX + 1, 5], [TX + 4, 8]],
      racks: { x: TX + 5, y: 11, w: 2, d: 3 }, drone: { x: TX + 1, y: 12, w: 2, d: 1 }, holo: { x: TX + 1, y: D - 5, w: 3, d: 2 },
    };
    block(tech.printers.x, tech.printers.y, 3, 1); block(tech.laser.x, tech.laser.y, 2, 1); block(tech.headset.x, tech.headset.y);
    for (const [x, y] of tech.poles) block(x, y);
    block(tech.racks.x, tech.racks.y, 2, 3); block(tech.drone.x, tech.drone.y, 2, 1); block(tech.holo.x, tech.holo.y, 3, 2);
    // TV de la oficina en la sala de estar: muestra anuncios y ranking al hacerle clic.
    const tv = { x: RX + 6, y: D - 8, w: 3 };
    block(tv.x, tv.y, 3, 1);
    const logoFloor = { x: DX + 1.5, y: D - 3.4, size: 3 };
    const plants = [[DX - 1, 0], [RX + 6, 0], [RX + 10, 3], [RX + 10, D - 2], [RX + 10, 8], [4, 1], [0, D - 1], [DX - 1, D - 1], [RX + 5, 6], [W - 1, D - 1], [W - 1, 3]];
    for (const [x, y] of plants) block(x, y);
    const lamp = { x: RX + 9, y: D - 4 };
    block(lamp.x, lamp.y);
    const chairs = [[meet.x, 1], [meet.x + 2, 1], [meet.x + 4, 1], [meet.x, 4], [meet.x + 2, 4], [meet.x + 4, 4]];
    for (const [x, y] of chairs) block(x, y);
    const stools = [[maq.x, 10], [maq.x + 2, 10], [maq.x + 4, 9]];
    for (const [x, y] of stools) block(x, y);
    const armchairs = [[1, 5], [3, 5]];
    for (const [x, y] of armchairs) block(x, y);
    // Puestos de quien está "En reunión" (sillas de la sala, luego de pie) y "Almuerzo" (cafetería).
    const tableKey = meet.x + meet.y + meet.w + meet.d - 1;
    const meetSpots = [
      ...[0, 2, 4].map((i) => ({ x: meet.x + i + 0.5, y: 1.5, sit: true, view: "front", key: tableKey - 0.5 })),
      ...[0, 2, 4].map((i) => ({ x: meet.x + i + 0.5, y: 4.5, sit: true, view: "back", key: tableKey + 0.5 })),
      ...[1, 3, 5].map((i) => ({ x: meet.x + i + 0.5, y: 5.5, key: tableKey + 0.7 })),
    ];
    const cafeSpots = [0, 1, 2].map((i) => ({ x: bar.x + i + 0.5, y: bar.y + 1.5 })).concat([{ x: coffee.x - 0.5, y: coffee.y + 0.5 }, { x: coffee.x + 0.5, y: coffee.y - 0.5 }, { x: coffee.x + 1.5, y: coffee.y - 0.5 }]);
    // Zonas para hacer zoom (clic en su nombre).
    const zones = {
      direccion: { x0: -0.5, y0: -0.5, x1: 7, y1: 7.5, label: "Dirección" },
      lab: { x0: -0.5, y0: 7.5, x1: 7, y1: D, label: "Laboratorio de agentes" },
      meet: { x0: RX, y0: -0.5, x1: RX + 7, y1: 6.5, label: "Sala de juntas" },
      tech: { x0: RX + 11, y0: -0.5, x1: W + 0.3, y1: D, label: "Nuevas tecnologías" },
      cafe: { x0: RX, y0: D - 9, x1: RX + 11, y1: D, label: "Cafetería" },
    };
    for (const row of rows) zones["row-" + row.id] = { x0: DX - 1.5, y0: row.y - 1.2, x1: DX + 2 * N + 0.5, y1: row.y + 3, label: row.label, row };
    return { W, D, DX, RX, TX, N, rows, desks, seats, blocked, glass, labSpots, meet, maq, shelf, sofa, coffee, bar, plants, lamp, chairs, stools, armchairs, meetSpots, cafeSpots, tableKey, tech, tv, logoFloor, zones };
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
    const v = dk.u && Array.isArray(dk.u.premios) && dk.u.premios.some((p) => ["trofeo", "cuadro", "taza"].includes(p)) ? 3 : (dk.i || 0) % 4;
    if (v === 0) box(ctx, x + 1.55, y + 0.3, 11, 0.12, 0.35, 5, "#c0503f", "#a84434", "#8f3a2c");
    if (v === 1) box(ctx, x + 1.55, y + 0.5, 11, 0.18, 0.18, 3, "#f4f1ea", "#dcd7cf", "#c7c1b8");
    if (v === 2) { box(ctx, x + 1.45, y + 0.3, 11, 0.4, 0.3, 2, "#5c7fb8"); box(ctx, x + 1.45, y + 0.3, 13, 0.4, 0.3, 2, "#e0c46c"); }
    // Nota amarilla en el puesto de quien está ausente.
    if (st === "absent") box(ctx, x + 0.15, y + 0.55, 11, 0.3, 0.25, 3, "#f6e27a", "#e4cc5c", "#d1b94a", null);
    // Premios del muñeco sobre el escritorio.
    const pr = (dk.u && Array.isArray(dk.u.premios)) ? dk.u.premios : [];
    const left = [[0.1, 0.22], [0.1, 0.6]], right = [[1.45, 0.25], [1.68, 0.58]];
    for (const id of ["lampara", "planta", "medalla", "trofeo", "cuadro", "taza"]) {
      if (!pr.includes(id)) continue;
      const slot = (id === "lampara" || id === "planta" || id === "medalla" ? left : right).shift();
      if (!slot) continue;
      const sx = x + slot[0], sy = y + slot[1];
      if (id === "lampara") { box(ctx, sx + 0.1, sy + 0.1, 11, 0.1, 0.1, 9, C.metal); box(ctx, sx, sy, 20, 0.3, 0.3, 3, "#fbe7a8", "#f3d77f", "#e9c968"); }
      else if (id === "planta") { box(ctx, sx + 0.04, sy + 0.04, 11, 0.22, 0.22, 3, C.pot, "#d6cdc3", "#c7bdb2"); box(ctx, sx, sy, 14, 0.3, 0.3, 4, C.leaf, C.leaf2, C.leaf3); }
      else if (id === "trofeo") { box(ctx, sx + 0.06, sy + 0.06, 11, 0.16, 0.16, 1, "#c08f12"); box(ctx, sx, sy, 12, 0.28, 0.28, 4, "#f2c94c", "#d9a925", "#c08f12"); }
      else if (id === "cuadro") { box(ctx, sx, sy, 11, 0.36, 0.07, 5, "#8b5a2b", "#5fb4ff", "#6e4a2e"); }
      else if (id === "medalla") { box(ctx, sx + 0.1, sy, 11, 0.06, 0.06, 6, "#0057ff"); box(ctx, sx + 0.02, sy - 0.02, 15, 0.22, 0.08, 4, "#f2c94c", "#d9a925", "#c08f12"); }
      else if (id === "taza") { box(ctx, sx, sy, 11, 0.17, 0.17, 2, "#ea0029", "#c4001f", "#a3001a"); }
    }
    if (!pr.length || pr.length < 3) { /* deja la decoración normal */ }
    // Cumpleaños: globos sobre el puesto.
    if (dk.u && dk.u.cumple && dk.u.cumple === L.todayIso().slice(5)) {
      const cols = ["#ea0029", "#e8c100", "#0057ff"];
      cols.forEach((c, i) => {
        const [bx, by] = P(x + 1.6 + i * 0.18, y + 0.4 - i * 0.1, 30 + i * 4);
        const [sx0, sy0] = P(x + 1.6, y + 0.45, 11);
        line(ctx, [sx0, sy0], [bx, by], "#6e6268");
        const r = Math.max(2, Math.round(3 * U));
        ctx.fillStyle = INK; ctx.fillRect(bx - r - 1, by - 2 * r - 1, 2 * r + 2, 2 * r + 2);
        ctx.fillStyle = c; ctx.fillRect(bx - r, by - 2 * r, 2 * r, 2 * r);
        ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(bx - r + Math.round(r / 3), by - 2 * r + Math.round(r / 3), Math.max(1, Math.round(r / 2)), Math.max(1, Math.round(r / 2)));
      });
    }
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

  /* ================= sala de nuevas tecnologías ================= */
  function drawPrinters(ctx, t, time) {
    const p = t.printers;
    box(ctx, p.x, p.y + 0.1, 0, p.w, 0.8, 9, C.wood, C.woodSide, C.woodDark);
    for (let i = 0; i < 2; i++) {
      const x = p.x + 0.25 + i * 1.5, y = p.y + 0.2;
      box(ctx, x, y, 9, 0.9, 0.6, 1, "#2d2f36"); // base
      box(ctx, x, y, 10, 0.08, 0.6, 9, "#3d3e48"); box(ctx, x + 0.82, y, 10, 0.08, 0.6, 9, "#3d3e48"); // columnas
      box(ctx, x, y, 19, 0.9, 0.6, 1, "#3d3e48");
      const hz = 11 + (Math.floor(time / 600 + i) % 4); // cabezal que sube y baja
      box(ctx, x + 0.35, y + 0.2, hz + 2, 0.2, 0.2, 1, "#f08c00");
      box(ctx, x + 0.32, y + 0.18, 10, 0.26, 0.26, hz - 10, i ? "#0057ff" : "#ea0029"); // pieza impresa
      box(ctx, x + 0.25, y + 0.45, 20, 0.4, 0.12, 2, "#e8c100", "#c9a400", "#b18f00"); // filamento
    }
  }
  function drawLaser(ctx, t) {
    const l = t.laser;
    box(ctx, l.x + 0.05, l.y + 0.1, 0, l.w - 0.1, 0.85, 10, "#e9e6e1", "#d6d1c9", "#c4beb5");
    box(ctx, l.x + 0.1, l.y + 0.15, 10, l.w - 0.2, 0.75, 3, "rgba(234,0,41,0.55)", "rgba(200,0,35,0.5)", "rgba(170,0,30,0.5)");
    box(ctx, l.x + 1.5, l.y + 0.7, 6, 0.3, 0.06, 2, "#2d2f36", null, null, null);
  }
  function drawVR(ctx, t, time) {
    const v = t.vr;
    fillPoly(ctx, [P(v.x, v.y), P(v.x + v.w, v.y), P(v.x + v.w, v.y + v.d), P(v.x, v.y + v.d)], "#c9d6ea");
    line(ctx, P(v.x + 0.2, v.y + 0.2), P(v.x + v.w - 0.2, v.y + 0.2), "#0057ff"); line(ctx, P(v.x + v.w - 0.2, v.y + 0.2), P(v.x + v.w - 0.2, v.y + v.d - 0.2), "#0057ff");
    line(ctx, P(v.x + v.w - 0.2, v.y + v.d - 0.2), P(v.x + 0.2, v.y + v.d - 0.2), "#0057ff"); line(ctx, P(v.x + 0.2, v.y + v.d - 0.2), P(v.x + 0.2, v.y + 0.2), "#0057ff");
  }
  function drawPole(ctx, x, y, time) {
    box(ctx, x + 0.42, y + 0.42, 0, 0.16, 0.16, 26, C.metal);
    box(ctx, x + 0.36, y + 0.36, 26, 0.28, 0.28, 3, "#2d2f36", "#0057ff", "#2d2f36");
    if (Math.floor(time / 500) % 2) { const [lx, ly] = P(x + 0.5, y + 0.36, 28); ctx.fillStyle = "#5fb4ff"; ctx.fillRect(lx, ly, px(1), px(1)); }
  }
  function drawHeadset(ctx, t) {
    const { x, y } = t.headset;
    box(ctx, x + 0.3, y + 0.3, 0, 0.4, 0.4, 12, "#e9e6e1", "#d6d1c9", "#c4beb5");
    box(ctx, x + 0.22, y + 0.3, 12, 0.56, 0.36, 3, "#2d2f36", "#0057ff", "#1f1f1f");
    box(ctx, x + 0.2, y + 0.42, 13, 0.06, 0.12, 4, "#4a4650");
  }
  function drawRacks(ctx, t, time) {
    const r = t.racks;
    for (let j = 0; j < r.d; j++) {
      box(ctx, r.x + 0.05, r.y + j + 0.05, 0, r.w - 0.1, 0.9, 30, "#23252c", "#2d2f36", "#1a1b20");
      for (let k = 0; k < 6; k++) {
        const on = (Math.floor(time / 300) + k * 3 + j * 5) % 7 !== 0;
        const [lx, ly] = P(r.x + 0.3 + (k % 3) * 0.45, r.y + j + 0.95, 6 + Math.floor(k / 3) * 12);
        ctx.fillStyle = on ? (k % 2 ? "#5fd0a0" : "#5fb4ff") : "#3a3c44"; ctx.fillRect(lx, ly, px(1), px(1));
      }
    }
  }
  function drawDrone(ctx, t, time) {
    const d = t.drone;
    box(ctx, d.x + 0.05, d.y + 0.1, 0, d.w - 0.1, 0.8, 8, C.woodSide, "#b8956b", C.woodDark);
    const hov = 4 + Math.round(Math.sin(time / 300) * 1.5);
    box(ctx, d.x + 0.75, d.y + 0.35, 8 + hov, 0.5, 0.3, 1, "#e9e6e1", "#c4beb5", "#b1aba2");
    for (const [ox, oy] of [[0.55, 0.25], [1.15, 0.25], [0.55, 0.6], [1.15, 0.6]]) box(ctx, d.x + ox, d.y + oy, 9 + hov, 0.18, 0.1, 0.5, "#2d2f36", null, null, null);
  }
  function drawHolo(ctx, t, time) {
    const h = t.holo;
    box(ctx, h.x, h.y, 0, h.w, h.d, 9, "#2d2f36", "#23252c", "#1a1b20");
    box(ctx, h.x + 0.1, h.y + 0.1, 9, h.w - 0.2, h.d - 0.2, 0.5, "#5fb4ff", null, null, null);
    // Edificio en holograma (estructura de alambre azul).
    const cx = h.x + h.w / 2 - 0.4, cy = h.y + h.d / 2 - 0.4, top = 22 + Math.round(Math.sin(time / 500) * 1);
    const col = "rgba(95,180,255,0.9)";
    const c = [[cx, cy], [cx + 0.8, cy], [cx + 0.8, cy + 0.8], [cx, cy + 0.8]];
    for (let i = 0; i < 4; i++) { const [a, b] = c[i], [e, f] = c[(i + 1) % 4]; line(ctx, P(a, b, 10), P(e, f, 10), col); line(ctx, P(a, b, top), P(e, f, top), col); line(ctx, P(a, b, 10), P(a, b, top), col); }
    line(ctx, P(cx, cy, 16), P(cx + 0.8, cy, 16), col); line(ctx, P(cx + 0.8, cy, 16), P(cx + 0.8, cy + 0.8, 16), col);
  }
  function drawTV(ctx, tv, time) {
    box(ctx, tv.x + 1.4, tv.y + 0.4, 0, 0.2, 0.2, 8, C.metal);
    box(ctx, tv.x + 0.9, tv.y + 0.3, 0, 1.2, 0.4, 1, C.metal);
    box(ctx, tv.x, tv.y + 0.45, 8, tv.w, 0.1, 17, "#1f1f1f", "#17213b", "#111");
    // Pantalla: barras del ranking y el símbolo, en los colores de la marca.
    const scr = (a, b, z1, z2, col) => fillPoly(ctx, [P(tv.x + a, tv.y + 0.55, z1), P(tv.x + b, tv.y + 0.55, z1), P(tv.x + b, tv.y + 0.55, z2), P(tv.x + a, tv.y + 0.55, z2)], col);
    scr(0.15, tv.w - 0.15, 9, 24, "#0b1a3d");
    const hs = [0.9, 0.65, 0.5];
    hs.forEach((hh, i) => scr(0.4, 0.4 + hh * 1.6, 20 - i * 3.5, 21.6 - i * 3.5, i === 0 ? "#0057ff" : i === 1 ? "#5fb4ff" : "#9fb9ff"));
    if (Math.floor(time / 900) % 2) scr(tv.w - 0.55, tv.w - 0.35, 11, 12.5, "#ea0029");
  }

  /* ================= marca: símbolo y textos en paredes y piso ================= */
  const SYM = new Path2D("M 871.976562 420.164062 L 882.9375 414.066406 L 882.9375 424.476562 Z M 847.296875 444.886719 L 835.632812 440.378906 L 870.277344 421.105469 L 881.933594 425.691406 Z M 864.363281 464.203125 L 835.628906 453.132812 L 847.414062 446.539062 L 876.214844 457.5625 Z M 860.242188 468.226562 L 864.480469 465.855469 L 876.191406 470.367188 L 860.242188 479.019531 Z M 809.96875 449.359375 L 858.742188 468.300781 L 858.742188 479.191406 L 798.066406 455.980469 Z M 797.050781 454.828125 L 797.050781 444.339844 L 808.152344 448.652344 Z M 863.894531 417.644531 L 809.855469 447.707031 L 798.066406 443.128906 L 863.894531 406.789062 Z M 870.167969 419.453125 L 865.394531 417.578125 L 865.394531 406.605469 L 881.917969 412.917969 Z M 834.621094 441.597656 L 845.59375 445.835938 L 834.621094 451.980469 Z M 811.671875 448.414062 L 864.699219 418.914062 L 868.472656 420.394531 L 833.507812 439.847656 C 833.292969 439.964844 833.179688 440.1875 833.152344 440.425781 C 833.144531 440.453125 833.121094 440.472656 833.121094 440.5 L 833.121094 453.496094 C 833.121094 453.664062 833.222656 453.8125 833.378906 453.871094 L 862.664062 465.152344 L 859.4375 466.960938 Z M 877.226562 469.15625 L 866.179688 464.898438 L 877.226562 458.714844 Z M 883.953125 412.089844 L 864.910156 404.816406 C 864.703125 404.742188 864.476562 404.753906 864.28125 404.859375 L 795.9375 442.589844 C 795.722656 442.707031 795.605469 442.933594 795.578125 443.175781 C 795.574219 443.203125 795.550781 443.21875 795.550781 443.246094 L 795.550781 456.105469 C 795.550781 456.371094 795.691406 456.617188 795.914062 456.75 C 795.941406 456.761719 795.972656 456.761719 795.996094 456.769531 C 796.011719 456.777344 796.015625 456.800781 796.03125 456.804688 L 859.222656 480.980469 C 859.308594 481.015625 859.398438 481.03125 859.492188 481.03125 C 859.546875 481.03125 859.59375 480.992188 859.648438 480.980469 C 859.652344 480.980469 859.65625 480.988281 859.660156 480.988281 C 859.722656 480.988281 859.789062 480.972656 859.851562 480.9375 L 878.339844 470.90625 C 878.578125 470.773438 878.726562 470.523438 878.726562 470.25 L 878.726562 457.4375 C 878.726562 457.167969 878.585938 456.921875 878.355469 456.789062 C 878.332031 456.773438 878.304688 456.777344 878.28125 456.765625 C 878.265625 456.757812 878.261719 456.742188 878.246094 456.734375 L 849.125 445.585938 L 884.054688 426.230469 C 884.289062 426.097656 884.4375 425.84375 884.4375 425.574219 L 884.4375 412.789062 C 884.4375 412.476562 884.242188 412.195312 883.953125 412.089844");
  const SYM_VB = [795.55, 404.77, 88.89, 76.26];
  // Símbolo sobre la pared del fondo (y = 0): x0 = baldosa izquierda, z0 = altura de su borde superior.
  function wallLogo(ctx, x0, z0, widthTiles, color) {
    const s = widthTiles / SYM_VB[2];
    const [X0, Y0] = P(x0, 0, z0);
    const a = 8 * U * s, b = 4 * U * s, d = 8 * U * s;
    ctx.save();
    ctx.setTransform(a, b, 0, d, X0 - a * SYM_VB[0], Y0 - b * SYM_VB[0] - d * SYM_VB[1]);
    ctx.fillStyle = color; ctx.fill(SYM);
    ctx.restore();
  }
  function floorLogo(ctx, x0, y0, sizeTiles, color) {
    const s = sizeTiles / SYM_VB[2];
    const [X0, Y0] = P(x0, y0, 0);
    const a = 8 * U * s, b = 4 * U * s, c = -8 * U * s, d = 4 * U * s;
    ctx.save();
    ctx.setTransform(a, b, c, d, X0 - a * SYM_VB[0] - c * SYM_VB[1], Y0 - b * SYM_VB[0] - d * SYM_VB[1]);
    ctx.fillStyle = color; ctx.fill(SYM);
    ctx.restore();
  }
  // Texto pintado en la pared del fondo; size = alto de la letra en unidades de altura.
  function wallText(ctx, text, x0, z0, size, color, weight = 600, plane = "y") {
    const [X0, Y0] = plane === "y" ? P(x0, 0, z0) : P(0, x0, z0);
    const k = size / 10;
    ctx.save();
    if (plane === "y") ctx.setTransform(U * k, U * k / 2, 0, U * k, X0, Y0);
    else ctx.setTransform(U * k, -U * k / 2, 0, U * k, X0, Y0);
    ctx.fillStyle = color;
    ctx.font = `${weight} 10px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // Elementos complementarios del manual: signos +, círculos y barras // en azul brillante.
  function wallPlus(ctx, x, z, r, color) {
    line(ctx, P(x - r / 8, 0, z), P(x + r / 8, 0, z), color); line(ctx, P(x, 0, z - r), P(x, 0, z + r), color);
  }
  function wallCircle(ctx, x, z, r, color) {
    let prev = null;
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; const pt = P(x + (Math.cos(a) * r) / 8, 0, z + Math.sin(a) * r); if (prev) line(ctx, prev, pt, color); prev = pt; }
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
    zone(m.RX + 11, 0, W, D, "#d3d9e0", "#c7ced7");
    floorLogo(ctx, m.logoFloor.x, m.logoFloor.y, m.logoFloor.size, "rgba(0,87,255,0.55)");
    drawVR(ctx, m.tech, 0);
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
    for (let x = m.RX + 1; x < m.RX + 10; x += 2.2) {
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
    // Marca LAP: símbolo, nombre y frase en la sala de tecnologías; frase del manual en Dirección.
    fillPoly(ctx, onWallY(m.TX + 0.2, W - 0.2, 12, 42), "#eef1f6");
    wallLogo(ctx, m.TX + 0.6, 39, 2.4, "#0057ff");
    wallText(ctx, "LEFT ANGLE", m.TX + 3.3, 35, 4.2, "#1f1f1f", 700);
    wallText(ctx, "PARTNERSHIP", m.TX + 3.3, 30, 4.2, "#1f1f1f", 700);
    wallText(ctx, "// Diseño de vanguardia con perspectiva global.", m.TX + 0.6, 18, 1.8, "#0057ff", 500);
    wallPlus(ctx, m.TX + 6.3, 38, 2, "#0057ff"); wallCircle(ctx, m.TX + 6.1, 26, 3, "#0057ff");
    wallText(ctx, "// Diseño de vanguardia", 0.5, 37, 3, "#0057ff", 600);
    wallText(ctx, "con perspectiva global.", 0.5, 33, 3, "#4d5c78", 500);
    wallLogo(ctx, m.RX + 10.3, 41, 0.9, "#0057ff");
    fillPoly(ctx, onWallX(9.5, 15, 14, 36), INK); fillPoly(ctx, onWallX(9.65, 14.85, 15, 35), "#203040");
    for (let k = 0; k < 7; k++) line(ctx, P(0, 10 + k * 0.7, 18), P(0, 10 + k * 0.7, 18 + ((k * 7) % 13)), "#5fd0a0");
  }

  /* ================= estado de cada persona ================= */
  function personState(u) {
    if (q.absent(u.id)) return "absent";
    if (!q.online(u)) return "offline";
    if (q.presence(u) === "fuera") return "offline";
    if (!q.atDesk(u)) return "away";
    if (u.taskId && q.task(u.taskId)) return "working";
    return "online";
  }

  /* ================= motor: dibujo, movimiento y clics ================= */
  const PRES_TXT = { no_molestar: " · no molestar", reunion: " · en reunión", almuerzo: " · almuerzo", pausa: " · en pausa" };
  // Motores abiertos (oficina y pantalla de la TV): celebran cuando alguien termina una tarea.
  const engines = new Set();
  L.onTaskFinished = (t) => { for (const e of engines) for (const uid of t.assignees || []) e.celebrate(uid); };
  function createEngine(canvas, overlay, opts = {}) {
    const ctx = canvas.getContext("2d");
    let map = null, raf = 0, last = 0, dirty = true, mapKey = "", box0 = { w: 1000, h: 600 }, DPR = 1;
    const actors = new Map(); // uid → { x, y, path, dir, frame, flip, user, state }
    let me = null, data = { findings: {}, meet: null };
    let sparks = [];
    let sendAt = 0, lastSig = "";
    const labels = new Map();
    // Cámara: toda la oficina o un acercamiento (un puesto, un área, una sala). Se mueve suave.
    let cam = null, goal = null, focus = null, showNames = !!opts.showNames, hover = null;

    function setMap(m) { map = m; fit(); }
    function computeGoal() {
      const cw = canvas.width, ch = canvas.height;
      if (!focus) {
        const loW = (map.W + map.D) * (TW / 2) + 16, loH = (map.W + map.D) * (TH / 2) + 46 + 5 + 22;
        const u = Math.min(cw / loW, ch / loH);
        return { U: u, OX: (cw - (map.W + map.D) * (TW / 2) * u) / 2 + map.D * (TW / 2) * u, OY: (ch - loH * u) / 2 + (46 + 16) * u };
      }
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (const [x, y] of [[focus.x0, focus.y0], [focus.x1, focus.y0], [focus.x1, focus.y1], [focus.x0, focus.y1]]) {
        const ix = (x - y) * (TW / 2), iy = (x + y) * (TH / 2);
        minx = Math.min(minx, ix); maxx = Math.max(maxx, ix); miny = Math.min(miny, iy - 44); maxy = Math.max(maxy, iy);
      }
      // Deja espacio a la derecha para el panel del puesto o del área.
      const side = opts.panelWidth ? opts.panelWidth * DPR : 0;
      const u = Math.min((cw - side) * 0.9 / (maxx - minx), ch * 0.88 / (maxy - miny), 8 * DPR);
      return { U: u, OX: (cw - side) / 2 - u * (minx + maxx) / 2, OY: ch / 2 - u * (miny + maxy) / 2 };
    }
    // La oficina completa cabe en el recuadro, centrada; el lienzo tiene la resolución de la pantalla.
    function fit() {
      if (!map) return;
      DPR = window.devicePixelRatio || 1;
      const cw = Math.max(320, box0.w), ch = Math.max(240, box0.h);
      canvas.width = Math.round(cw * DPR); canvas.height = Math.round(ch * DPR);
      canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
      goal = computeGoal();
      if (!cam) cam = { ...goal };
      applyCam();
      overlay.style.width = cw + "px"; overlay.style.height = ch + "px";
      dirty = true;
    }
    function applyCam() {
      U = cam.U; OX = Math.round(cam.OX); OY = Math.round(cam.OY);
      overlay.style.setProperty("--z", U / DPR);
    }
    function stepCam() {
      if (!goal || !cam) return false;
      const dU = goal.U - cam.U, dX = goal.OX - cam.OX, dY = goal.OY - cam.OY;
      if (Math.abs(dU) < 0.002 && Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) { if (cam.U !== goal.U) { cam = { ...goal }; return true; } return false; }
      cam = { U: cam.U + dU * 0.2, OX: cam.OX + dX * 0.2, OY: cam.OY + dY * 0.2 };
      return true;
    }
    const inside = (x, y, r) => !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    const seatOf = (uid) => map && map.seats[uid];
    const isSeatTile = (x, y) => Object.values(map.seats).some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y)
      || map.meetSpots.some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y);
    const free = (x, y) => walkable(map, x, y) || isSeatTile(x, y);

    function syncActors(users) {
      const seen = new Set();
      // Quien está en reunión o almorzando ocupa un lugar fijo de la sala o la cafetería (mismo orden en todos los PC).
      const spotOf = {};
      for (const [pres, list] of [[["reunion"], map.meetSpots], [["almuerzo", "pausa"], map.cafeSpots]]) {
        users.filter((u) => u.role !== "maestro" && u.role !== "pantalla" && pres.includes(q.presence(u)) && personState(u) !== "offline" && personState(u) !== "absent")
          .sort((x, y) => x.id.localeCompare(y.id)).forEach((u, i) => { spotOf[u.id] = list[i % list.length]; });
      }
      for (const u of users) {
        if (u.role === "maestro" || u.role === "pantalla") continue;
        const st = personState(u);
        if (st === "offline" || st === "absent") { actors.delete(u.id); continue; }
        seen.add(u.id);
        const seat = seatOf(u.id), spot = spotOf[u.id];
        const pos = u.pos && typeof u.pos.x === "number" && free(Math.floor(u.pos.x), Math.floor(u.pos.y)) ? u.pos : null;
        let tx, ty, fromPos = false;
        if (q.atDesk(u) && seat) { tx = seat.x; ty = seat.y; }
        else if (spot && (!pos || (Math.abs(pos.x - spot.x) < 0.3 && Math.abs(pos.y - spot.y) < 0.3))) { tx = spot.x; ty = spot.y; }
        else if (pos) { tx = pos.x; ty = pos.y; fromPos = true; }
        else if (seat) { tx = seat.x + 1; ty = seat.y; }
        else { tx = map.DX - 1.5; ty = map.D - 2.5; }
        let a = actors.get(u.id);
        if (!a) { a = { x: tx, y: ty, tx, ty, path: [], dir: "back", frame: 0, flip: false, t: 0 }; actors.set(u.id, a); }
        a.spot = spot && Math.abs(tx - spot.x) < 0.01 && Math.abs(ty - spot.y) < 0.01 ? spot : null;
        const isMe = me && u.id === me.id;
        const key = q.presence(u) + ":" + q.atDesk(u);
        // Mi muñeco camina solo cuando cambia mi estado (desde la burbuja o una reunión que empieza).
        if (isMe && a.key && a.key !== key && !fromPos) {
          const p = findPath(a.x, a.y, Math.floor(tx), Math.floor(ty));
          a.path = p && p.length ? [...p.slice(0, -1), [tx, ty]] : [[tx, ty]];
          a.auto = true; a.tx = tx; a.ty = ty;
        }
        a.key = key;
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
      const pres = q.presence(L.state.me);
      L.act.movePresence({ puesto: atSeat, pos: atSeat ? null : pos });
      if (changedSeat && !a.auto) L.toast(atSeat ? (pres === "disponible" || pres === "no_molestar" ? "De vuelta en tu puesto" : "De vuelta en tu puesto: quedaste Disponible") : "Saliste de tu puesto: el equipo te ve fuera (almuerzo, una vuelta)");
      if (!a.path.length) a.auto = false;
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
      applyCam();
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
      add(m.tableKey, () => drawMeeting(ctx, m.meet));
      for (const [x, y] of m.chairs) { add(x + y + 0.7, () => drawChairSeat(ctx, x + 0.5, y + 0.5)); if (y > m.meet.y) add(m.tableKey + 0.6 + x * 0.001, () => drawChairBack(ctx, x + 0.5, y + 0.5)); }
      add(m.maq.x + m.maq.y + m.maq.w + m.maq.d - 1, () => drawMaqueta(ctx, m.maq));
      for (const [x, y] of m.stools) add(x + y + 1, () => box(ctx, x + 0.3, y + 0.3, 0, 0.4, 0.4, 7, "#5a5560", "#4a4650", "#3e3a44"));
      add(m.shelf.x + m.shelf.y + m.shelf.w, () => drawShelf(ctx, m.shelf));
      add(m.coffee.x + m.coffee.y + 1, () => drawLounge(ctx, m));
      const tc = m.tech;
      add(tc.printers.x + tc.printers.y + 3, () => drawPrinters(ctx, tc, t));
      add(tc.laser.x + tc.laser.y + 2, () => drawLaser(ctx, tc));
      add(tc.headset.x + tc.headset.y + 1, () => drawHeadset(ctx, tc));
      for (const [x, y] of tc.poles) add(x + y + 1, () => drawPole(ctx, x, y, t));
      add(tc.racks.x + tc.racks.y + tc.racks.w + tc.racks.d - 1, () => drawRacks(ctx, tc, t));
      add(tc.drone.x + tc.drone.y + 2, () => drawDrone(ctx, tc, t));
      add(tc.holo.x + tc.holo.y + tc.holo.w + tc.holo.d - 1, () => drawHolo(ctx, tc, t));
      add(m.tv.x + m.tv.y + 2, () => drawTV(ctx, m.tv, t));
      for (const sp of m.labSpots) {
        const c = data.findings[sp.a.id] || { total: 0, alta: 0 };
        add(sp.x + sp.y - 1, () => drawConsole(ctx, sp, c.alta));
        add(sp.x + sp.y + 0.1, () => { const [px, py] = P(sp.x, sp.y); drawRobot(ctx, px, py, sp.a, t, c.alta); });
      }
      for (const [, a] of actors) {
        const seat = seatOf(a.user.id);
        a.seated = a.state !== "away" && !!seat && !a.path.length && Math.hypot(a.x - seat.x, a.y - seat.y) < 0.3;
        const atSpot = a.spot && !a.path.length && Math.hypot(a.x - a.spot.x, a.y - a.spot.y) < 0.3 ? a.spot : null;
        add(atSpot && atSpot.key ? atSpot.key + a.x * 0.001 : a.x + a.y + 0.1, () => {
          const [px, py] = P(a.x, a.y);
          const cfg = L.PIX.withExtra(L.PIX.config(a.user), q.presence(a.user), a.user.premios, t);
          const k = Math.max(1, Math.round(U)), ow = Math.max(1, Math.round(k * 0.4));
          ctx.fillStyle = "rgba(40,30,35,0.22)"; ctx.fillRect(px - 4 * k, py - k, 9 * k, 2 * k);
          if (a.seated) L.PIX.drawFigure(ctx, px - 6 * k, py - 19 * k, cfg, "back", 0, true, false, k, ow);
          else if (atSpot && atSpot.sit) L.PIX.drawFigure(ctx, px - 6 * k, py - 19 * k, cfg, atSpot.view, 0, true, false, k, ow);
          else L.PIX.drawFigure(ctx, px - 6 * k, py - 21 * k, cfg, atSpot ? "front" : a.dir, a.frame, false, atSpot ? false : a.flip, k, ow);
        });
      }
      list.sort((A, B) => A.key - B.key);
      for (const it of list) it.fn();
      // Con zoom: un velo sobre todo lo que no es el área elegida, para verla aislada.
      if (focus) {
        const pts = [];
        for (const [x, y] of [[focus.x0, focus.y0], [focus.x1, focus.y0], [focus.x1, focus.y1], [focus.x0, focus.y1]]) for (const z of [0, 44]) pts.push(P(x, y, z));
        pts.sort((p1, p2) => p1[0] - p2[0] || p1[1] - p2[1]);
        const cross = (o, a2, b2) => (a2[0] - o[0]) * (b2[1] - o[1]) - (a2[1] - o[1]) * (b2[0] - o[0]);
        const lower = [], upper = [];
        for (const p2 of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p2) <= 0) lower.pop(); lower.push(p2); }
        for (const p2 of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p2) <= 0) upper.pop(); upper.push(p2); }
        const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.moveTo(hull[0][0], hull[0][1]); for (const p2 of hull.slice(1)) ctx.lineTo(p2[0], p2[1]); ctx.closePath();
        ctx.fillStyle = document.documentElement.getAttribute("data-theme") === "dark" ? "rgba(10,15,28,0.72)" : "rgba(236,238,242,0.78)";
        ctx.fill("evenodd");
        ctx.restore();
      }
      // Confeti sobre quien terminó una tarea.
      if (sparks.length) {
        const now = performance.now();
        sparks = sparks.filter((p) => now - p.t0 < 2200);
        for (const p of sparks) {
          const dt = (now - p.t0) / 1000;
          const a = actors.get(p.uid); if (!a) continue;
          const [ax, ay] = P(a.x, a.y);
          ctx.fillStyle = p.c;
          ctx.fillRect(Math.round(ax + p.vx * dt * U), Math.round(ay - 24 * U + (p.vy * dt + 30 * dt * dt) * U), Math.max(1, Math.round(U)), Math.max(1, Math.round(U)));
        }
      }
      placeLabels();
    }

    // Textos encima del dibujo. En la vista general casi nada (un punto de color por persona) para que
    // no se llene de texto; con el mouse encima o con zoom se ven nombres, estados y tareas.
    function placeLabels() {
      const want = new Map();
      for (const [id, a] of actors) {
        const [px, py] = P(a.x, a.y);
        const u = a.user, isMe = me && id === me.id;
        const pres = q.presence(u);
        const pr = q.presenceInfo(u);
        const bday = u.cumple && u.cumple === L.todayIso().slice(5);
        const inF = !focus || inside(a.x, a.y, focus);
        const full = (showNames && !focus) || (focus && inF) || (hover && hover.kind === "person" && hover.id === id);
        if (full) {
          const extra = PRES_TXT[pres] || (a.state === "away" ? " · fuera" : "");
          want.set("u" + id, { x: px, y: py - 23 * U, cls: L.cx("o-name", isMe && "me", (a.state === "away" || pres !== "disponible") && "away", pres === "no_molestar" && "dnd", bday && "bday"), text: (isMe ? "Tú" : L.first(u.name)) + extra + (bday ? " · ¡cumpleaños!" : "") });
          const task = a.state === "working" && a.seated ? q.task(u.taskId) : null;
          const p = task && q.project(task.project);
          if (task && (focus || (hover && hover.id === id))) want.set("b" + id, { x: px, y: py - 33 * U, cls: "o-bubble", text: (p && p.code ? p.code + " · " : "") + task.title });
        } else if (!focus || inF) {
          want.set("d" + id, { x: px, y: py - 23 * U, cls: L.cx("o-dot", isMe && "me", bday && "bday"), text: isMe ? "Tú" : "", color: pr.color });
        }
      }
      const showAgents = showNames || (focus && focus.key === "lab");
      for (const sp of map.labSpots) {
        const [px, py] = P(sp.x, sp.y);
        const c = data.findings[sp.a.id] || { total: 0, alta: 0 };
        if (showAgents || (hover && hover.kind === "agent" && hover.id === sp.a.id)) want.set("a" + sp.a.id, { x: px, y: py + 5 * U, cls: "o-agent", text: sp.a.name });
        if (c.total) want.set("c" + sp.a.id, { x: px + 8 * U, y: py - 22 * U, cls: L.cx("o-count", c.alta && "alta"), text: String(c.total) });
      }
      const zl = (key, x, y, text, extraCls) => { if (!focus || focus.key === key) want.set("z" + key, { x, y, cls: L.cx("o-zone", extraCls, focus && focus.key === key && "on"), text, zone: key }); };
      for (const row of map.rows) { if (focus && focus.key !== "row-" + row.id) continue; const [x, y] = P(map.DX - 0.1, row.y + 2.7); want.set("zrow-" + row.id, { x, y: y + 4 * U, cls: L.cx("o-zone o-row", focus && focus.key === "row-" + row.id && "on"), text: row.label, left: true, zone: "row-" + row.id }); }
      { const [x, y] = P(0, 3.5, 43); zl("direccion", x, y, "Dirección"); }
      { const [x, y] = P(0, 12.3, 43); zl("lab", x, y, "Laboratorio de agentes"); }
      { const [x, y] = P(map.meet.x + 2.5, 0, 43); zl("meet", x, y, data.meet ? "Reunión: " + data.meet.title : "Sala de juntas"); }
      { const [x, y] = P(map.TX + 3.5, 0, 46); zl("tech", x, y, "Nuevas tecnologías"); }
      { const [x, y] = P(map.bar.x + 1.5, map.bar.y + 0.5); zl("cafe", x, y - 18 * U, "Cafetería"); }
      if (!focus) { const [x, y] = P(map.tv.x + 1.5, map.tv.y + 0.5, 27); want.set("tv", { x, y, cls: "o-zone o-tv", text: "Anuncios y ranking", zone: "tv" }); }
      for (const [k, v] of want) {
        let el = labels.get(k);
        if (!el) { el = document.createElement("div"); overlay.appendChild(el); labels.set(k, el); }
        if (el.className !== v.cls) el.className = v.cls;
        if (el.textContent !== v.text) el.textContent = v.text;
        if (v.zone) el.dataset.zone = v.zone;
        if (v.color !== undefined) el.style.setProperty("--pc", v.color);
        el.style.transform = `translate(${v.x / DPR}px, ${v.y / DPR}px) translate(${v.left ? "0" : "-50%"}, -100%)`;
      }
      for (const [k, el] of labels) if (!want.has(k)) { el.remove(); labels.delete(k); }
    }

    let lastTick = 0;
    function loop(ts) {
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
      last = ts;
      const moving = step(dt);
      if (stepCam()) dirty = true;
      // Quieto se redibuja poco (los robots respiran); en movimiento, cada cuadro.
      if (moving || dirty || sparks.length || ts - lastTick > 140) { draw(ts); dirty = false; lastTick = ts; }
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
      if (opts.readOnly) return;
      const hit = pick(ev);
      if (hit.kind === "person") {
        const u = hit.a.user;
        const working = hit.a.seated && u.taskId && q.task(u.taskId);
        if (me && hit.id === me.id) {
          if (working) L.openTask(u.taskId);
          else if (!hit.a.seated) goToDesk();
          else L.toast("Marca en una tarea «Estoy trabajando en esto» y aparecerá en tu puesto.");
        } else if (opts.onPerson) {
          const r = canvas.getBoundingClientRect();
          const [px, py] = P(hit.a.x, hit.a.y);
          opts.onPerson(u, px / DPR, (py - 22 * U) / DPR, !!working, r);
        } else if (working) L.openTask(u.taskId);
        else L.openSheet("profile", u.id);
        return;
      }
      if (opts.onPerson) opts.onPerson(null);
      if (onTV(ev) && opts.onTV) { opts.onTV(); return; }
      if (hit.kind === "agent") { L.go("#agentes/" + hit.a.id); return; }
      const dk = hit.kind === "floor" && deskAt(hit.x, hit.y);
      if (dk && opts.onDesk) { opts.onDesk(dk.u); return; }
      if (free(hit.x, hit.y)) walkMeTo(hit.x, hit.y);
    }
    function deskAt(x, y) { return map.desks.find((dk) => dk.u && y === dk.y && (x === dk.x || x === dk.x + 1)) || null; }
    function onTV(ev) {
      const r = canvas.getBoundingClientRect();
      const mx = (ev.clientX - r.left) * DPR, my = (ev.clientY - r.top) * DPR;
      const [ax, ay] = P(map.tv.x, map.tv.y + 0.55, 26), [bx, by] = P(map.tv.x + map.tv.w, map.tv.y + 0.55, 6);
      return mx >= Math.min(ax, bx) && mx <= Math.max(ax, bx) && my >= Math.min(ay, by) - 4 * U && my <= Math.max(ay, by);
    }
    function onMove(ev) {
      const hit = pick(ev);
      const h = hit.kind === "person" ? { kind: "person", id: hit.id } : hit.kind === "agent" ? { kind: "agent", id: hit.a.id } : null;
      if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; dirty = true; }
      const tv = onTV(ev);
      canvas.style.cursor = tv || hit.kind !== "floor" || free(hit.x, hit.y) || deskAt(hit.x, hit.y) ? "pointer" : "default";
    }
    function onLeave() { if (hover) { hover = null; dirty = true; } }
    function onZoneClick(ev) {
      const el = ev.target.closest && ev.target.closest("[data-zone]");
      if (!el) return;
      ev.stopPropagation();
      if (el.dataset.zone === "tv") { if (opts.onTV) opts.onTV(); return; }
      if (opts.onZone) opts.onZone(el.dataset.zone);
    }
    // Flechas o WASD: arriba, abajo, izquierda y derecha tal como se ven en la pantalla.
    const KEYS = { arrowup: [-1, -1], w: [-1, -1], arrowdown: [1, 1], s: [1, 1], arrowleft: [-1, 1], a: [-1, 1], arrowright: [1, -1], d: [1, -1] };
    function onKey(ev) {
      if (opts.readOnly) return;
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
    canvas.addEventListener("mouseleave", onLeave);
    overlay.addEventListener("click", onZoneClick);
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(loop);

    const api = {
      update(next) {
        me = L.state.me;
        const key = JSON.stringify(q.staff().map((u) => [u.id, u.role, u.areas]));
        if (!map || key !== mapKey) { mapKey = key; setMap(buildMap()); actors.clear(); }
        data = next;
        syncActors(L.state.users);
      },
      resize(w, h) { if (Math.abs(w - box0.w) < 2 && Math.abs(h - box0.h) < 2) return; box0 = { w, h }; fit(); },
      goToDesk,
      celebrate(uid) {
        if (!actors.has(uid)) return;
        const cols = ["#0057ff", "#ea0029", "#e8c100", "#1f9d55", "#7c4dff", "#f08c00"];
        const t0 = performance.now();
        for (let i = 0; i < 28; i++) sparks.push({ uid, t0, c: cols[i % cols.length], vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 30 - 8 });
      },
      // Acercamiento: null = toda la oficina; "row-arquitectura", "tech", "lab"…; o el puesto de una persona.
      setFocus(key) {
        if (!map) return;
        if (!key) focus = null;
        else if (key.startsWith("desk:")) {
          const seat = map.seats[key.slice(5)];
          if (!seat) return;
          const dk = seat.desk;
          focus = { key, x0: dk.x - 2.5, y0: dk.y - 1.6, x1: dk.x + 4, y1: dk.y + 3.2 };
        } else if (map.zones[key]) focus = { key, ...map.zones[key] };
        goal = computeGoal(); dirty = true;
      },
      setShowNames(on) { showNames = !!on; dirty = true; },
      zone: (key) => map && map.zones[key],
      destroy() { engines.delete(api); cancelAnimationFrame(raf); canvas.removeEventListener("click", onClick); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); overlay.removeEventListener("click", onZoneClick); window.removeEventListener("keydown", onKey); },
    };
    engines.add(api);
    return api;
  }

  /* ================= vista ================= */
  // Panel del puesto de una persona (al hacer zoom): estado, en qué trabaja y sus premios.
  function DeskPanel({ u, onClose }) {
    L.useStore();
    const isMe = u.id === L.state.me.id;
    const pr = q.presenceInfo(u);
    const task = u.taskId && q.task(u.taskId);
    const p = task && q.project(task.project);
    const r = L.ranking ? L.ranking().find((x) => x.u.id === u.id) : null;
    const prem = (L.PREMIOS || []).filter((x) => (u.premios || []).includes(x.id));
    const gracias = L.graciasPara ? L.graciasPara(u.id).length : 0;
    return html`<aside class="o-panel glass">
      <button type="button" class="o-close" aria-label="Volver a toda la oficina" onClick=${onClose}>×</button>
      <div class="o-panel-head"><${L.Avatar} id=${u.id} cls="xl" dot /><div><b>${isMe ? "Tu puesto" : u.name}</b><small><${L.PresDot} id=${pr.id} /> ${q.online(u) ? pr.label : "No está conectado"}</small></div></div>
      ${task ? html`<button type="button" class="o-task" onClick=${() => L.openTask(task.id)}><small>Trabajando en</small><b>${task.title}</b>${p && html`<small>${p.code || p.name}</small>`}</button>` : html`<p class="muted">Sin tarea marcada ahora.</p>`}
      <div class="o-stats"><span><b>${r ? r.total : 0}</b>pts esta semana</span><span><b>${gracias}</b>agradecimientos</span><span><b>${prem.length}</b>premios</span></div>
      <span class="lbl">Premios</span>
      ${prem.length ? html`<div class="o-prem">${prem.map((x) => html`<div key=${x.id}><${L.PremioIcon} id=${x.id} on=${true} /><span>${x.label}</span></div>`)}</div>` : html`<p class="muted">${isMe ? "Aún no tienes premios: entregas a tiempo, pausas activas y agradecimientos los desbloquean." : "Aún no tiene premios."}</p>`}
      <div class="inline wrap">${!isMe && html`<button type="button" class="btn sm" onClick=${() => L.openSheet("toque", u.id)}>Tocar el hombro</button><button type="button" class="btn sm" onClick=${() => L.openSheet("gracias", u.id)}>Dar las gracias</button>`}
        ${isMe && html`<a class="btn sm" href="#semana">Ver cómo ganar más</a>`}</div>
    </aside>`;
  }
  // Panel de un área: en qué está trabajando cada persona.
  function AreaPanel({ zone, onClose, onDesk }) {
    L.useStore();
    const row = zone.row;
    const INFO = {
      tech: "Impresoras 3D, realidad virtual, cortadora láser, granja de render, dron y mesa holográfica.",
      lab: "Los agentes revisan el estudio con reglas fijas. Clic en uno para ver lo que encontró.",
      meet: "Quien está «En reunión» se sienta aquí.", cafe: "Almuerzo y pausas activas.", direccion: "La oficina de Dirección creativa.",
    };
    const people = row ? row.people : [];
    return html`<aside class="o-panel glass">
      <button type="button" class="o-close" aria-label="Volver a toda la oficina" onClick=${onClose}>×</button>
      <h3>${zone.label}</h3>
      ${row ? html`<div class="o-people">${people.length ? people.map((u0) => { const u = q.user(u0.id) || u0; const pr = q.presenceInfo(u); const t = u.taskId && q.task(u.taskId); const on = q.online(u) && !q.absent(u.id); return html`
        <button type="button" key=${u.id} class=${L.cx("o-person", !on && "off")} onClick=${() => onDesk(u)}>
          <${L.Avatar} id=${u.id} dot /><span><b>${u.name}</b><small>${!on ? (q.absent(u.id) ? "Ausente" : "Desconectado") : pr.id !== "disponible" ? pr.label + (t ? " · " + t.title : "") : t ? t.title : "Sin tarea marcada"}</small></span></button>`; }) : html`<p class="muted">Nadie en esta área todavía.</p>`}</div>`
        : html`<p class="muted">${INFO[zone.key] || ""}</p>`}
    </aside>`;
  }
  // Pantalla grande con anuncios y ranking (clic en la TV de la oficina o en la pantalla de la TV).
  function BoardModal({ onClose }) {
    L.useStore();
    const anuncios = L.anunciosActivos ? L.anunciosActivos() : [];
    return html`<div class="board-modal" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="board glass" role="dialog" aria-label="Anuncios y ranking">
        <button type="button" class="o-close" aria-label="Cerrar" onClick=${onClose}>×</button>
        <section><h2><span class="sl">//</span>Anuncios</h2>
          ${anuncios.length ? anuncios.map((a) => html`<div key=${a.id} class=${L.cx("board-anuncio", a.importante && "imp")}><p>${a.texto}</p><small>${L.first(q.name(a.by))} · hasta el ${L.fmtShort(a.hasta)}</small></div>`) : html`<p class="muted">No hay anuncios vigentes.</p>`}
        </section>
        <section><h2><span class="sl">//</span>Ranking de la semana</h2>${L.Ranking && html`<${L.Ranking} big=${true} />`}
          <p class="hint">Entrega a tiempo 3 pts · agradecimiento recibido 2 · pausa activa asistida 1 · descanso del Pomodoro 1.</p></section>
      </div>
    </div>`;
  }

  function Oficina() {
    const s = L.useStore();
    const cv = useRef(null), ov = useRef(null), wrap = useRef(null), eng = useRef(null);
    // Menú al hacer clic en otra persona: tocar el hombro, ver su tarea o su perfil.
    const [menu, setMenu] = useState(null);
    const [view, setView] = useState(null); // { kind: "desk", u } | { kind: "zone", key }
    const [names, setNames] = useState(false);
    const [board, setBoard] = useState(false);
    const meetNow = () => {
      const now = new Date(), t = L.todayIso(), mins = now.getHours() * 60 + now.getMinutes();
      const mm = (h) => { const [a, b] = String(h || "").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
      return s.eventos.find((e) => e.date === t && e.time && mins >= mm(e.time) && mins < mm(e.time) + (Number(e.duration) || 60)) || null;
    };
    const openDesk = (u) => { setMenu(null); setView({ kind: "desk", u }); eng.current && eng.current.setFocus("desk:" + u.id); };
    const openZone = (key) => { setMenu(null); setView({ kind: "zone", key }); eng.current && eng.current.setFocus(key); };
    const closeView = () => { setView(null); eng.current && eng.current.setFocus(null); };
    useEffect(() => {
      eng.current = createEngine(cv.current, ov.current, {
        panelWidth: 300,
        onPerson: (u, x, y, working) => setMenu(u ? { u, x, y, working } : null),
        onDesk: (u) => openDesk(u),
        onZone: (key) => openZone(key),
        onTV: () => setBoard(true),
      });
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
      const esc = (e) => { if (e.key === "Escape" && !L.state.sheet) { setBoard(false); closeView(); } };
      window.addEventListener("keydown", esc);
      setTimeout(size, 0);
      return () => { ro.disconnect(); window.removeEventListener("resize", size); window.removeEventListener("keydown", esc); eng.current && eng.current.destroy(); };
    }, []);
    useEffect(() => {
      if (!eng.current) return;
      const findings = L.agentCounts ? L.agentCounts(L.myFindings()) : {};
      eng.current.update({ findings, meet: meetNow() });
    });
    useEffect(() => { if (eng.current) eng.current.setShowNames(names); }, [names]);
    const staff = q.staff();
    const online = staff.filter((u) => q.online(u) && !q.absent(u.id));
    const away = online.filter((u) => !q.atDesk(u));
    const hasDoll = !!(s.me.muneco && s.me.muneco.ropa);
    const zone = view && view.kind === "zone" && eng.current ? { key: view.key, ...eng.current.zone(view.key) } : null;
    return html`
      <${L.PageHead} title="Oficina" sub=${`${L.plural(online.length, "persona conectada", "personas conectadas")}${away.length ? ` · ${away.length} fuera del puesto` : ""} · clic en el nombre de un área o en un puesto para acercarte`}>
        ${view ? html`<button type="button" class="btn primary" onClick=${closeView}>Ver toda la oficina</button>` : html`<button type="button" class=${L.cx("btn", names && "on")} aria-pressed=${names} onClick=${() => setNames(!names)}>${names ? "Ocultar nombres" : "Mostrar nombres"}</button>`}
        <button type="button" class="btn" onClick=${() => setBoard(true)}>Ranking y anuncios</button>
        <button type="button" class="btn" onClick=${() => openDesk(s.me)}>Mi puesto</button>
        <button type="button" class="btn ghost" onClick=${() => L.go("#pantalla")} title="Para una TV del estudio: oficina grande, entregas y quién está">Pantalla TV</button>
        <button type="button" class="btn" onClick=${() => L.openSheet("muneco")}>${hasDoll ? "Mi muñeco" : "Crear mi muñeco"}</button>
      <//>
      ${!hasDoll && html`<div class="banner glass"><p><strong>Arma tu muñeco.</strong> Elige peinado, color de pelo, piel y un color de ropa que nadie más tenga. Mientras tanto apareces con ropa gris.</p><button type="button" class="btn sm primary" onClick=${() => L.openSheet("muneco")}>Crear mi muñeco</button></div>`}
      <div class="glass office-wrap pix" ref=${wrap}>
        <div class="office-stage">
          <canvas ref=${cv} class="office-canvas" aria-label="Oficina del estudio. Usa las flechas para caminar."></canvas>
          <div ref=${ov} class="office-overlay"></div>
          ${menu && html`<div class="o-menu glass" role="menu" style=${{ left: menu.x + "px", top: menu.y + "px" }} onMouseLeave=${() => setMenu(null)}>
            <div class="o-menu-head"><b>${menu.u.name}</b><small><${L.PresDot} id=${q.presence(menu.u)} /> ${q.presenceInfo(menu.u).label}</small></div>
            <button type="button" role="menuitem" onClick=${() => openDesk(menu.u)}>Ver su puesto y premios</button>
            <button type="button" role="menuitem" onClick=${() => { setMenu(null); L.openSheet("toque", menu.u.id); }}>Tocar el hombro</button>
            <button type="button" role="menuitem" onClick=${() => { setMenu(null); L.openSheet("gracias", menu.u.id); }}>Dar las gracias</button>
            ${menu.working && html`<button type="button" role="menuitem" onClick=${() => { setMenu(null); L.openTask(menu.u.taskId); }}>Ver en qué trabaja</button>`}
            <button type="button" role="menuitem" onClick=${() => { setMenu(null); L.openSheet("profile", menu.u.id); }}>Ver perfil</button>
          </div>`}
          ${view && view.kind === "desk" && html`<${DeskPanel} u=${q.user(view.u.id) || view.u} onClose=${closeView} />`}
          ${zone && html`<${AreaPanel} zone=${zone} onClose=${closeView} onDesk=${openDesk} />`}
        </div>
      </div>
      ${board && html`<${BoardModal} onClose=${() => setBoard(false)} />`}
      <div class="office-legend"><span>Pasa el mouse sobre alguien para ver su nombre y tarea</span><span>Clic en el nombre de un área o sala: acercarse</span><span>Clic en un puesto o persona: su puesto y premios</span><span>Clic en la TV de la sala de estar: anuncios y ranking</span><span>Esc: volver a toda la oficina</span></div>`;
  }

  Object.assign(L, { Oficina, createOfficeEngine: createEngine, BoardModal });
})();
