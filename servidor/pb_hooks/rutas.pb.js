/// <reference path="../pb_data/types.d.ts" />
// Cambios de estado del plan de entregables. Van por aquí (y no por la API normal) para que
// la validación de vistos buenos y el paso a los cronogramas personales ocurran juntos o no ocurran.
routerAdd("POST", "/api/lap/planes/{id}/enviar", (e) => require(`${__hooks}/lib.js`).enviarPlan(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/planes/{id}/retirar", (e) => require(`${__hooks}/lib.js`).retirarPlan(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/planes/{id}/aprobar", (e) => require(`${__hooks}/lib.js`).aprobarPlan(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/planes/{id}/nueva-version", (e) => require(`${__hooks}/lib.js`).nuevaVersion(e), $apis.requireAuth("users"));
