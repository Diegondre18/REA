// Dibujo de los muñecos en pixel art, sin dependencias: lo usan la app y la burbuja de escritorio.
(() => {
  "use strict";
  const GENEROS = [{ id: "hombre", label: "Hombre" }, { id: "mujer", label: "Mujer" }];
  const PEINADOS = {
    hombre: [{ id: "corto", label: "Corto" }, { id: "rapado", label: "Rapado" }, { id: "rizado", label: "Rizado" }, { id: "largo", label: "Largo" }],
    mujer: [{ id: "largo", label: "Largo" }, { id: "coleta", label: "Coleta" }, { id: "bob", label: "Melena corta" }, { id: "rizado", label: "Rizado" }],
  };
  const PELO = [
    { id: "#2b2220", label: "Negro" }, { id: "#5a3825", label: "Castaño" }, { id: "#8a5a35", label: "Castaño claro" }, { id: "#d9b25f", label: "Rubio" },
    { id: "#b4532a", label: "Pelirrojo" }, { id: "#9a9a9a", label: "Gris" }, { id: "#d97aa6", label: "Rosado" }, { id: "#4b6fd1", label: "Azul" },
  ];
  const PIEL = [{ id: "#f3d5b5", label: "Muy clara" }, { id: "#e2b48c", label: "Clara" }, { id: "#c68e62", label: "Media" }, { id: "#9b6a43", label: "Morena" }, { id: "#6e4a2e", label: "Oscura" }];
  const ROPA = [
    { id: "#0057ff", label: "Azul LAP" }, { id: "#ea0029", label: "Rojo" }, { id: "#1f9d55", label: "Verde" }, { id: "#f08c00", label: "Naranja" },
    { id: "#7c4dff", label: "Morado" }, { id: "#0e9aa7", label: "Turquesa" }, { id: "#e8c100", label: "Amarillo" }, { id: "#e0569b", label: "Rosado" },
    { id: "#8b5a2b", label: "Café" }, { id: "#2d2f36", label: "Negro" }, { id: "#e9e6e1", label: "Blanco" }, { id: "#8a8f98", label: "Gris" },
    { id: "#1f3a68", label: "Azul oscuro" }, { id: "#6b7a2f", label: "Verde oliva" }, { id: "#7a1f3d", label: "Vino" }, { id: "#5fb4ff", label: "Celeste" },
  ];
  const OUT = "#1e1512", EYE = "#1e1512", PANTS = "#d6c4ac", PANTS_S = "#b8a48e", SHOES = "#f2f0ec", SOLE = "#c4bfb8", SHIRT = "#eeeae4";

  const hex = (c) => { const v = String(c).startsWith("rgb") ? c.match(/\d+/g).map(Number) : null; if (v) return v; const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (c, k) => { const [r, g, b] = hex(c); const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v * (1 - k) : v + (255 - v) * -k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

  // Muñeco por defecto para quien aún no arma el suyo: pelo y piel según su id, ropa gris neutra.
  function defaults(u) {
    const id = (u && u.id) || "x";
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { genero: h % 2 ? "mujer" : "hombre", peinado: h % 2 ? "largo" : "corto", pelo: PELO[h % 5].id, piel: PIEL[(h >>> 3) % PIEL.length].id, ropa: "#b9b4ae", generico: true };
  }
  function config(u) {
    const m = u && u.muneco;
    if (m && typeof m === "object" && m.ropa) return { ...defaults(u), ...m, generico: false };
    return defaults(u);
  }

  // Muñeco en pixel art de 27×56, dibujado a partir de la referencia del estudio (vista de frente y de
  // espaldas, seis peinados). Cada letra es una parte; los colores de pelo, piel y buzo se cambian
  // según el muñeco de cada persona. O contorno · H/L/h pelo · S/s piel · E ojos · m boca · K/k audífonos
  // al cuello · C/c buzo · T/t camiseta · P/p/q pantalón · F/f tenis · r moño.
  const SPRITES = {"front":{"rizado":["..........OOOOO............",".......OOOHHHLHOOOO........","......OHLLHHHHLhHLLO.......",".....OOHHHhhHHhHHHLHO......","...OOHLHHhHLLLhhLLHhhO.....","...OLLhHhHLHHLhHLHHhHO.....","...OhHhHhLLHhHhhHLHHhHO....","...OHHHHhHHhHhhHhhHHHhO....","...OHHhHHHHhSHhShhHHHhO....","...OhhhHhHhSSShSSShHhHO....","....OhHHhShhhSSShhhShHO....","....OHhhSSSSSSSSSSSShHO....","....OHhSSSEESSSSEESShO.....",".....OhSSSEESSSSEESShO.....",".....OhsSSEESSsSEESShO.....","......OsSSSSSSsSSSSSO......",".......OSSSSSmmSSSSO.......",".......OOsSSSSSSSSsOO......","......OKkOOsSSSSsOOkKO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"corto":["...........................","...........................",".........OOOOOOOO..........",".......OOHHHHLLHHOO........","......OHHLLHHHHHHHHO.......",".....OHHHHHHHHHHHHHHO......",".....OHhHHHHHLHHHHhHO......","....OHHhHHHHHHHHHHhHHO.....","....OHhhHHhHHHHhHHhhHO.....","....OhhSShhSSSShSShhhO.....","....OhSShShhhSSShhhSShO....","....OhSSSSSSSSSSSSSSShO....","...OSsSSSSEESSSSEESSSsSO...","...OSsSSSSEESSSSEESSSsSO...","....OhsSSSEESSsSEESSShO....","......OsSSSSSSsSSSSSO......",".......OSSSSSmmSSSSO.......",".......OOsSSSSSSSSsOO......","......OKkOOsSSSSsOOkKO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"rapado":["...........................","...........................","...........................","........OOOOOOOOOO.........","......OOhHhhHhhHhhOO.......",".....OhHhHhhHhhHhHhhO......",".....OhSSSSSSSSSSSShO......","....OSSSSSSSSSSSSSSSSO.....","....OSSSSSSSSSSSSSSSSO.....","....OSSSSSSSSSSSSSSSSO.....","....OSSShShhhSSShhhSSSO....","....OSSSSSSSSSSSSSSSSSO....","...OSsSSSSEESSSSEESSSsSO...","...OSsSSSSEESSSSEESSSsSO...","....OSsSSSEESSsSEESSSSO....","......OsSSSSSSsSSSSSO......",".......OSSSSSmmSSSSO.......",".......OOsSSSSSSSSsOO......","......OKkOOsSSSSsOOkKO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"largo":["...........................","........OOOOOOOOO..........","......OOHHHLLHHHHOO........",".....OHHLLHHHHHHHHHO.......","....OHHHHHHHHHHHHHHHO......","....OHHHHHHHLHHHHHHHHO.....","...OHHhHHHHHHHHHHHHhHO.....","...OHHhHHHHHHHHHHHHhHHO....","...OHhhHHHHhHHHHHHHhhHO....","...OHhhSShhSSSShSShhhHO....","...OHhSShShhhSSShhhSShHO...","...OHhSSSSSSSSSSSSSSShHO...","...OHhSSSSEESSSSEESSShHO...","...OHhSSSSEESSSSEESSShHO...","...OHhsSSSEESSsSEESSShHO...","..OHHhOsSSSSSSsSSSSSOhHHO..","..OHHhOOSSSSSmmSSSSOOhHHO..","..OHHhOOOsSSSSSSSSsOOhHHO..","..OHHhOKkOOsSSSSsOOkOhHHO..","..OHHhOKKkOOsssOOkKKOhHHO..","..OHHhOKKKkOSSSOkKKKOhHHO..","..OHHhOkKKOOOOOOOKKkOhHHO..","..OHHhOkkOCCCCCCCOkkOhHHO..","..OHHhOOOCCCCCCCCCOOOhHHO..","..OHHhOcCCCCcCCCcCCCOhHHO..","..OHHhOOCCcCCCcCCCcCOhHHO..","..OOOOcOCCCCcCCCCCcC.OOOO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"bob":["...........................","........OOOOOOOOO..........","......OOHHHLLHHHHOO........",".....OHHLLHHHHHHHHHO.......","....OHHHHHHHHHHHHHHHO......","....OHHHHHHHLHHHHHHHHO.....","...OHHHHHHHHHHHHHHHHHO.....","...OHHhHHHHHHHHHHHHHhHO....","...OHhHHHHHHHHHHHHHHhHO....","...OHhhHHHHHHHHHHHHHhhO....","...OHhSShShhhSSShhhSShHO...","...OHhSSSSSSSSSSSSSSShHO...","...OHhSSSSEESSSSEESSShHO...","...OHhSSSSEESSSSEESSShHO...","...OHhsSSSEESSsSEESSShHO...","...OHhOsSSSSSSsSSSSSOhHO...","...OHhOOSSSSSmmSSSSOOhHO...","...OHhOOOsSSSSSSSSsOOhHO...","...OOOOKkOOsSSSSsOOkOOO....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"coleta":["...........................","...........................",".........OOOOOOOO..........",".......OOHHHHLLHHOOO.......","......OHHLLHHHHHHHHOrO.....",".....OHHHHHHHHHHHHHHOrrO...",".....OHhHHHHHLHHHHhHOHHO...","....OHHhHHHHHHHHHHhHOHHHO..","....OHhhHHhHHHHhHHhhOHhHO..","....OhhSSSSSSSSSShhhOHhHO..","....OhSShShhhSSShhhSShOHhO.","....OhSSSSSSSSSSSSSSShOHhO.","...OSsSSSSEESSSSEESSSsOHhO.","...OSsSSSSEESSSSEESSSsOhO..","....OhsSSSEESSsSEESSShOO...","......OsSSSSSSsSSSSSOOHhO..",".......OSSSSSmmSSSSO.OHhO..",".......OOsSSSSSSSSsOOOHhO..","......OKkOOsSSSSsOOkKOOO...",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"]},"back":{"rizado":["..........OOOOO............",".......OOOHHHLHOOOO........","......OHLLHHHHLhHLLO.......",".....OOHHHhhHHhHHHLHO......","...OOHLHHhHLLLhhLLHhhO.....","...OLLhHhHLHHLhHLHHhHO.....","...OhHhHhLLHhHhhHLHHhHO....","...OHHHHhHHhHhhHhhHHHhO....","...OHHhHHHLHHhHHLhHHHhO....","...OhhHHhHHHhHHHhHHhHHO....","....OhHHhLHHhHLHHhHHhO.....","....OHhhHHhHHHHhHHHhhO.....","....OhHhHhHHhHHhHhHhO......",".....OhhHhhHhhHhhHhhO......",".....OhhhhhhhhhhhhhhO......","......OOhhhhhhhhhhOO.......",".......OOsSSSSSSsOO........",".......OOSSSSSSSSOO........","......OKkOOsSSSSsOOkKO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"corto":["...........................","...........................",".........OOOOOOOO..........",".......OOHHHHLLHHOO........","......OHHLLHHHHHHHHO.......",".....OHHHHHHHHHHHHHHO......",".....OHhHHHHHLHHHHhHO......","....OHHhHHHHHHHHHHhHHO.....","....OHhhHHhHHHHhHHhhHO.....","....OhHhHHhHHHHhHHhHhO.....","....OHhhHHHhHHHhHHhhHO.....","...OSOhHhHHHhHHHhHhOSO.....","...OSOhhhHhhHhhHhhhOSO.....","....OOhhhhhhhhhhhhhOO......",".....OOhhhhhhhhhhhOO.......","......OOsSSSSSSSsOO........",".......OOsSSSSSSsOO........",".......OOSSSSSSSSOO........","......OKkOOsSSSSsOOkKO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"rapado":["...........................","...........................",".........OOOOOOOO..........",".......OOhhhhhhhhOO........","......OhhhhhhhhhhhhO.......",".....OhhhhhhhhhhhhhhO......",".....OhhhhhhhhhhhhhhO......","....OhhhhhhhhhhhhhhhhO.....","....OhhhhhhhhhhhhhhhhO.....","....OhhhhhhhhhhhhhhhhO.....","....OhhhhhhhhhhhhhhhhO.....","...OSOhhhhhhhhhhhhhOSO.....","...OSOhhhhhhhhhhhhhOSO.....","....OOhhhhhhhhhhhhhOO......",".....OOhhhhhhhhhhhOO.......","......OOsSSSSSSSsOO........",".......OOsSSSSSSsOO........",".......OOSSSSSSSSOO........","......OKkOOsSSSSsOOkKO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"largo":["...........................","...........................",".........OOOOOOOO..........",".......OOHHHHLLHHOO........","......OHHLLHHHHHHHHO.......",".....OHHHHHHHHHHHHHHO......",".....OHhHHHHHLHHHHhHO......","....OHHhHHHHHHHHHHhHHO.....","....OHhhHHhHHHHhHHhhHO.....","....OhHhHHhHHHHhHHhHhO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHO.....","...OHhHHhHHhHHhHHhHHHOO....","...OHhHHhHHhHHhHHhHHHOCO...","...OHhHHhHHhHHhHHhHHHOcO...","...OHhHHhHHhHHhHHhHHHOcO...","..OOHhHHhHHhHHhHHhHHHOCcO..","..OOOOOOOOOOOOOOOOOOOOCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"bob":["...........................","...........................",".........OOOOOOOO..........",".......OOHHHHLLHHOO........","......OHHLLHHHHHHHHO.......",".....OHHHHHHHHHHHHHHO......",".....OHhHHHHHLHHHHhHO......","....OHHhHHHHHHHHHHhHHO.....","....OHhhHHhHHHHhHHhhHO.....","....OhHhHHhHHHHhHHhHhO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OHHhHHHhHHHhHHHhHHO.....","...OOOOOOOOOOOOOOOOOOO.....",".....OKKKkOOsssOOkKKKO.....",".....OkKKKkOSSSOkKKKkO.....","....OOkkKKOOOOOOOKKkkOO....","...OCCOkkOCCCCCCCOkkOCCO...","...OCCCOOCCCCCCCCCOOCCcO...","...OCCCcCCCCcCCCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"],"coleta":["...........................","...........................",".........OOOOOOOO..........",".......OOHHHHLLHHOO........","......OHHLLHHHHHHHHO.......",".....OHHHHHHHHHHHHHHO......",".....OHhHHHHHLHHHHhHO......","....OHHhHHHHHHHHHHhHHO.....","....OHhhHHhHHHHhHHhhHO.....","....OhHhHHhHHHHhHHhHhO.....","....OHhhHHHhHHHhHHhhHO.....","...OSOhHhHHHhHHHhHhOSO.....","...OSOhhhHhhHhhHhhhOSO.....","....OOhhhhhhhhhhhhhOO......",".....OOhhhOrrrOhhhOO.......","......OOsSOHhHOSsOO........",".......OOsOHhHOSsOO........",".......OOSOHhHOSSOO........","......OKkOOHhHOSsOOkKO.....",".....OKKKkOHhHOOOkKKKO.....",".....OkKKKOHhHOOkKKKkO.....","....OOkkKKOHhHOOOKKkkOO....","...OCCOkkOOHhHOCCOkkOCCO...","...OCCCOOCOHhHOCCCOOCCcO...","...OCCCcCCOOOOOCcCCCCCcO...","..OCCCcOCCcCCCcCCCcCOCCcO..","..OCCCcOCCCCcCCCCCcCOCCcO..","..OCcCcOCcCCCCcCCcCCOCcCO..","..OCCCcOCCCCcCCCCcCCOCCcO..","..OCcCcOCCcCCCcCCCCcOcCcO..",".OCCCCcOCCCCCcCCCcCCOCCcCO.",".OCcCCcOCcCCCCCcCCCCOCCccO.",".OCCCccOCCCcCCCCcCcCOcCccO.",".OCcCccOCCCCCcCCCCCCOCcccO.",".OCCcccOCcCCCCCCcCCCOccccO.",".OOccccOCCCCCCCCCCCCOcccOO.","..OsSsOOCCCCCCCCCCCOOsSsO..","..OSSSOTTTTTTTTTTTTTOSSSO..","..OsSsOtTTTTTTTTTTTtOsSsO..","...OOOOOPPPPPPPPPPPOOOO....","......OPPPPPPPPPPPPPO......","......OPPPPPpOpPPPPPO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPPPPpPOPPPPPpO......","......OPpPPpPOPpPPPpO......","......OPpPPpPOPpPPppO......","......OppPPppOppPPppO......",".....OppPPPppOppPPPpO......",".....OpPPPPPpOpPPPPPO......",".....OqqqqqqqOqqqqqqO......","......OFFFFFOOOFFFFFO......",".....OFFFFFFO.OFFFFFFO.....",".....OFFFFFfO.OfFFFFFO.....",".....OfffffO...OfffffO.....","......OOOOO.....OOOOO......"]}};

  const GW = 27, GH = 56;
  // Accesorios dibujados encima, en la misma cuadrícula: { fila: [[columna, "letras"]] }.
  const OVER = {
    audifonos: { 1: [[8, "OOOOOOOOOOO"]], 2: [[7, "OkKKKKKKKKKkO"]], 3: [[6, "Ok"], [19, "kO"]], 4: [[5, "Ok"], [20, "kO"]], 5: [[4, "Ok"], [21, "kO"]], 6: [[3, "Ok"], [22, "kO"]], 7: [[3, "Ok"], [22, "kO"]], 8: [[2, "Ok"], [22, "kO"]],
      9: [[1, "OOO"], [22, "OOO"]], 10: [[1, "OkKO"], [22, "OKkO"]], 11: [[1, "OKrO"], [22, "OrKO"]], 12: [[1, "OKrO"], [22, "OrKO"]], 13: [[1, "OkKO"], [22, "OKkO"]], 14: [[1, "OOO"], [23, "OOO"]] },
    taza: { 31: [[21, "OOOOO"]], 32: [[21, "OTTTO"]], 33: [[21, "OTtTOO"]], 34: [[21, "OTTTOtO"]], 35: [[21, "OTtTOO"]], 36: [[21, "OOOOO"]] },
    libreta: { 24: [[22, "OOO"]], 25: [[21, "OTTtO"]], 26: [[21, "OTTtO"]], 27: [[21, "OTCtO"]], 28: [[21, "OTCtO"]], 29: [[21, "OTTtO"]], 30: [[21, "OTTtO"]], 31: [[21, "OTCtO"]], 32: [[21, "OTTtO"]], 33: [[21, "OTTtO"]], 34: [[21, "OTTtO"]], 35: [[22, "OTO"]] },
    gorra: { 1: [[8, "OOOOOOOOO"]], 2: [[6, "OOgggggggggOO"]], 3: [[5, "OggGgggggggggO"]], 4: [[4, "OggggggggggggggO"]], 5: [[4, "OggggggggggggggOOOOO"]], 6: [[4, "OOOOOOOOOOOOOOOGGGGGO"]], 7: [[19, "OOOOOO"]] },
    estira: { 2: [[1, "OSSO"], [22, "OSSO"]], 3: [[1, "OSSO"], [22, "OSSO"]], 4: [[1, "OCCO"], [22, "OCCO"]], 5: [[1, "OCcO"], [22, "OcCO"]], 6: [[1, "OCcO"], [22, "OcCO"]], 7: [[1, "OCcO"], [22, "OcCO"]],
      8: [[2, "OCcO"], [21, "OcCO"]], 9: [[2, "OCcO"], [21, "OcCO"]], 10: [[2, "OCcO"], [21, "OcCO"]], 11: [[3, "OCcO"], [20, "OcCO"]], 12: [[3, "OCcO"], [20, "OcCO"]], 13: [[3, "OCcO"], [20, "OcCO"]], 14: [[3, "OCcO"], [20, "OcCO"]],
      15: [[3, "OCcO"], [20, "OcCO"]], 16: [[3, "OCcO"], [20, "OcCO"]], 17: [[3, "OCcO"], [20, "OcCO"]], 18: [[3, "OCcO"], [20, "OcCO"]], 19: [[3, "OCcO"], [20, "OcCO"]], 20: [[3, "OCcO"], [20, "OcCO"]], 21: [[3, "OCCO"], [20, "OCCO"]] },
  };
  // Plantilla final (filas de letras) según el muñeco, la vista, el paso al caminar y si está sentado.
  const cache = new Map();
  function grid(cfg, view, frame, seated) {
    const style = SPRITES.front[cfg.peinado] ? cfg.peinado : "corto";
    const v = view === "back" ? "back" : "front";
    const key = [v, style, frame, seated, cfg.extra || "", cfg.gorra ? 1 : 0, cfg.pose || "", cfg.blink ? 1 : 0, cfg.look || 0, cfg.genero].join("|");
    if (cache.has(key)) return cache.get(key);
    const base = SPRITES[v][style];
    const g = base.map((r) => r.split(""));
    const set = (y, x, ch) => { if (y >= 0 && y < GH && x >= 0 && x < GW) g[y][x] = ch; };
    // Caminar: una pierna sube un pixel.
    if (frame === 1 || frame === 3) {
      const [a, b] = frame === 1 ? [0, 13] : [13, GW];
      for (let y = 40; y < GH; y++) for (let x = a; x < b; x++) g[y][x] = y + 1 < GH ? base[y + 1][x] : ".";
    }
    if (seated) for (let y = 40; y < GH; y++) for (let x = 0; x < GW; x++) g[y][x] = ".";
    if (v === "front") {
      // Mirada hacia un lado (burbuja) y parpadeo.
      if (cfg.look) {
        const eyes = [];
        g.forEach((r, y) => r.forEach((ch, x) => { if (ch === "E") eyes.push([y, x]); }));
        for (const [y, x] of eyes) g[y][x] = "S";
        for (const [y, x] of eyes) set(y, x + cfg.look, "E");
      }
      if (cfg.blink) g.forEach((r, y) => r.forEach((ch, x) => { if (ch === "E" && y < 14) r[x] = "S"; }));
      // Muñeca: rubor y pestañas.
      if (cfg.genero === "mujer") {
        set(15, 9, "b"); set(15, 18, "b");
        const top = [];
        g.forEach((r, y) => r.forEach((ch, x) => { if (ch === "E" && y === 12) top.push(x); }));
        if (top.length) { set(11, Math.min(...top) - 1, "O"); set(11, Math.max(...top) + 1, "O"); }
      }
    }
    // Estirándose: se borran los brazos de los lados y suben por encima de la cabeza.
    if (cfg.pose === "estira") {
      for (let y = 22; y < 40; y++) { for (let x = 0; x < 7; x++) g[y][x] = "."; for (let x = 21; x < GW; x++) g[y][x] = "."; }
      for (let y = 22; y < 36; y++) { g[y][7] = "O"; g[y][20] = "O"; }
    }
    // No molestar: los audífonos pasan del cuello a las orejas.
    if (cfg.extra === "audifonos") g.forEach((r) => r.forEach((ch, x) => { if (ch === "K") r[x] = "C"; else if (ch === "k") r[x] = "c"; }));
    const over = (name) => { const o = OVER[name]; if (!o) return; for (const y in o) for (const [x, s] of o[y]) for (let i = 0; i < s.length; i++) if (s[i] !== " ") set(+y, x + i, s[i]); };
    if (cfg.pose === "estira") over("estira");
    if (cfg.gorra && cfg.extra !== "audifonos") over("gorra");
    if (cfg.extra === "audifonos") over("audifonos");
    else if (v === "front" && (cfg.extra === "taza" || cfg.extra === "libreta") && cfg.pose !== "estira") over(cfg.extra);
    const out = g.map((r) => r.join(""));
    if (cache.size > 400) cache.clear();
    cache.set(key, out);
    return out;
  }
  function colors(cfg) {
    const s = cfg.piel, c = cfg.ropa, h = cfg.pelo;
    return {
      O: OUT, H: h, L: shade(h, -0.3), h: shade(h, 0.38), S: s, s: shade(s, 0.16), E: EYE, m: shade(s, 0.32), b: "#f0a39d",
      K: "#4a4644", k: "#2c2827", C: c, c: shade(c, 0.28), T: SHIRT, t: "#cdc8c0", P: PANTS, p: PANTS_S, q: "#988a7a",
      F: SHOES, f: SOLE, r: "#ea0029", g: "#ea0029", G: "#b8001f",
    };
  }
  // Compatibilidad: devuelve las celdas pintadas como piezas.
  function parts(cfg, view, frame, seated) {
    const out = [], col = colors(cfg);
    grid(cfg, view, frame, seated).forEach((r, y) => { for (let x = 0; x < GW; x++) if (r[x] !== ".") out.push([x, y, 1, 1, col[r[x]] || OUT, true]); });
    return out;
  }
  // Accesorio que lleva cada estado.
  const EXTRA = { no_molestar: "audifonos", almuerzo: "taza", reunion: "libreta" };
  // Accesorio del estado, gorra si la ganó y, en pausa, alterna estirarse (t = tiempo en ms).
  const withExtra = (cfg, presencia, premios, t) => {
    const out = { ...cfg };
    if (EXTRA[presencia]) out.extra = EXTRA[presencia];
    if (Array.isArray(premios) && premios.includes("gorra")) out.gorra = true;
    if (presencia === "pausa" && t !== undefined && Math.floor(t / 900) % 2 === 0) out.pose = "estira";
    return out;
  };
  // Dibuja el muñeco en la caja de siempre (12×21 pixeles de tamaño k; los pies abajo).
  // El contorno ya viene en el dibujo; ow se mantiene por compatibilidad.
  function drawFigure(ctx, x, y, cfg, view = "front", frame = 0, seated = false, flip = false, k = 1, ow = 1) {
    const u = (k * 21) / GH, ox = x + (12 * k - GW * u) / 2;
    paint(ctx, grid(cfg, view, frame, seated), colors(cfg), ox, y, u, flip, GH);
  }
  // Pinta filas de letras con rectángulos (une las celdas iguales seguidas).
  function paint(ctx, rows, col, x, y, u, flip, maxRows) {
    for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
      const row = rows[r];
      const y1 = Math.round(y + r * u), y2 = Math.round(y + (r + 1) * u);
      if (y2 <= y1) continue;
      let c0 = 0;
      while (c0 < GW) {
        const ch = row[c0];
        let c1 = c0 + 1;
        while (c1 < GW && row[c1] === ch) c1++;
        if (ch !== ".") {
          const a = flip ? GW - c1 : c0, b = flip ? GW - c0 : c1;
          const x1 = Math.round(x + a * u), x2 = Math.round(x + b * u);
          if (x2 > x1) { ctx.fillStyle = col[ch] || OUT; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); }
        }
        c0 = c1;
      }
    }
  }
  // Solo la cabeza (la burbuja que se asoma por el borde de la pantalla). px = tamaño de cada pixel.
  function drawHead(ctx, x, y, cfg, px = 3, flip = false) {
    paint(ctx, grid(cfg, "front", 0, true), colors(cfg), x, y, px, flip, 18);
  }

  // Estados de cada persona: los usa la app, la oficina y la burbuja.
  const PRESENCIAS = [
    { id: "disponible", label: "Disponible", color: "#22a06b" },
    { id: "no_molestar", label: "No molestar", color: "#e5484d", hint: "Sin globitos ni sonido. Lo urgente pasa igual." },
    { id: "reunion", label: "En reunión", color: "#7c4dff", hint: "Tu muñeco va a la sala de juntas." },
    { id: "almuerzo", label: "Almuerzo", color: "#f08c00", hint: "Tu muñeco va a la cafetería." },
    { id: "pausa", label: "En pausa", color: "#0e9aa7", hint: "Pausa activa o descanso. Sin globitos ni sonido salvo lo urgente." },
    { id: "fuera", label: "Fuera", color: "#8a8f98", hint: "No apareces en la oficina." },
  ];
  window.PIXCORE = { PRESENCIAS, drawHead, grid, GW, GH, GENEROS, PEINADOS, PELO, PIEL, ROPA, OUT, shade, defaults, config, parts, drawFigure, withExtra, EXTRA };
})();
