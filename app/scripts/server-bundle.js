// Prepara app/server-bundle con lo que el instalador lleva del servidor: reglas (pb_migrations, pb_hooks).
// El ejecutable de PocketBase lo descarga GitHub Actions en esta misma carpeta antes de armar el instalador.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "..", "servidor");
const out = path.join(root, "server-bundle");
fs.mkdirSync(out, { recursive: true });
for (const dir of ["pb_migrations", "pb_hooks"]) {
  fs.rmSync(path.join(out, dir), { recursive: true, force: true });
  fs.cpSync(path.join(src, dir), path.join(out, dir), { recursive: true });
}
console.log("servidor empaquetado en", out);
