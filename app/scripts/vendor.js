// Copia a src/vendor lo que la interfaz carga sin internet: el SDK de PocketBase y las tipografías.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "src", "vendor");
fs.mkdirSync(path.join(out, "fonts"), { recursive: true });

const copy = (from, to) => fs.copyFileSync(path.join(root, "node_modules", from), path.join(out, to));
copy("pocketbase/dist/pocketbase.iife.js", "pocketbase.iife.js");
for (const w of [300, 400, 500, 600]) copy(`@fontsource/hanken-grotesk/files/hanken-grotesk-latin-${w}-normal.woff2`, `fonts/hanken-grotesk-${w}.woff2`);
for (const w of [400, 500]) copy(`@fontsource/geist-mono/files/geist-mono-latin-${w}-normal.woff2`, `fonts/geist-mono-${w}.woff2`);
copy("@fontsource/hanken-grotesk/LICENSE", "fonts/OFL-hanken-grotesk.txt");
copy("@fontsource/geist-mono/LICENSE", "fonts/OFL-geist-mono.txt");
console.log("vendor listo en", out);
