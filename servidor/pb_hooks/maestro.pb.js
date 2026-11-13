/// <reference path="../pb_data/types.d.ts" />
// Comando de consola para crear o recuperar el perfil maestro (soporte, por si algo falla):
//   pocketbase maestro correo contraseña "Nombre"
// Solo lo puede usar quien tiene acceso al PC o NAS del servidor. Ver crear-perfil-maestro.bat.
$app.rootCmd.addCommand(new Command({
  use: "maestro [correo] [contraseña] [nombre]",
  short: "Crea o recupera el perfil maestro de LAP Cerebro",
  run: (cmd, args) => {
    if (args.length < 2) {
      console.log("Uso: pocketbase maestro correo contraseña \"Nombre\"");
      return;
    }
    const email = String(args[0]).trim().toLowerCase();
    const password = String(args[1]);
    const name = args.length > 2 ? String(args.slice(2).join(" ")).trim() : "Perfil maestro";
    if (password.length < 10) {
      console.log("La contraseña del perfil maestro necesita al menos 10 caracteres.");
      return;
    }
    let rec;
    try {
      rec = $app.findAuthRecordByEmail("users", email);
    } catch (e) {
      rec = new Record($app.findCollectionByNameOrId("users"));
      rec.set("email", email);
    }
    rec.set("name", name);
    rec.set("role", "maestro");
    rec.set("verified", true);
    rec.set("emailVisibility", true);
    rec.setPassword(password);
    $app.save(rec);
    console.log("Listo: " + email + " es el perfil maestro. Entra con ese correo desde la app.");
  },
}));

// Cambia la contraseña de cualquier persona sin tocar su rol (por si alguien la olvida):
//   pocketbase clave correo contraseña-nueva
$app.rootCmd.addCommand(new Command({
  use: "clave [correo] [contraseña]",
  short: "Cambia la contraseña de una persona de LAP Cerebro",
  run: (cmd, args) => {
    if (args.length < 2) { console.log("Uso: pocketbase clave correo contraseña-nueva"); return; }
    const email = String(args[0]).trim().toLowerCase();
    const password = String(args[1]);
    if (password.length < 8) { console.log("La contraseña necesita al menos 8 caracteres."); return; }
    let rec;
    try { rec = $app.findAuthRecordByEmail("users", email); } catch (e) {
      console.log("No existe nadie con el correo " + email + " en este servidor.");
      return;
    }
    rec.setPassword(password);
    $app.save(rec);
    console.log("Listo: " + email + " ya puede entrar con la contraseña nueva.");
  },
}));

// Resumen de la base: sirve para comprobar que el servidor tiene los datos del estudio.
//   pocketbase resumen
$app.rootCmd.addCommand(new Command({
  use: "resumen",
  short: "Cuenta personas y proyectos de la base",
  run: () => {
    const count = (name) => { try { return $app.countRecords(name); } catch (e) { return 0; } };
    const correos = [];
    try {
      const recs = $app.findRecordsByFilter("users", "role = 'director' || role = 'maestro'", "", 10, 0);
      for (const r of recs) correos.push(r.getString("email") + " (" + r.getString("role") + ")");
    } catch (e) { /* sin datos */ }
    console.log("Resumen: " + count("users") + " personas, " + count("proyectos") + " proyectos, " + count("tareas") + " tareas. Dirección y maestro: " + (correos.join(", ") || "ninguno"));
  },
}));
