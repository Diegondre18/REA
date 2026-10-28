// Puente con 3ds Max. Dentro de 3ds Max usa WebView2 (window.chrome.webview).
// Abierto en un navegador normal usa una escena de ejemplo, para poder disenar y probar la interfaz.
const US = '\x1f';  // separa argumentos
const RS = '\x1e';  // separa campos de una operacion

const Bridge = (() => {
  const host = window.chrome && window.chrome.webview;
  const pending = new Map();
  const listeners = [];
  let seq = 0;

  if (host) {
    host.addEventListener('message', ev => {
      const d = ev.data;
      if (d && d.event) { listeners.forEach(fn => fn(d.event)); return; }
      const p = d && pending.get(String(d.id));
      if (!p) return;
      pending.delete(String(d.id));
      if (d.ok) p.resolve(d.result); else p.reject(new Error(d.error || 'Error en 3ds Max'));
    });
  }

  function call(cmd, ...args) {
    const id = String(++seq);
    const flat = args.map(a => (a === null || a === undefined) ? '' : String(a));
    if (!host) return Mock.call(cmd, flat);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      host.postMessage([id, cmd, ...flat].join(US));
    });
  }

  return { call, isHost: !!host, onEvent: fn => listeners.push(fn) };
})();

// ---------------------------------------------------------------- escena de ejemplo (solo navegador)
const Mock = (() => {
  const scene = {
    version: 'mock', file: 'Casa_Playa_v12.max', filePath: 'D:\\Proyectos\\CasaPlaya\\', renderer: 'CoronaRenderer',
    cameras: [
      { name: 'CAM_Salon', locked: false, cls: 'Physical' },
      { name: 'CAM_Cocina', locked: true, cls: 'Physical' },
      { name: 'CAM_Exterior_Dia', locked: false, cls: 'Physical' },
      { name: 'CAM_Exterior_Noche', locked: false, cls: 'Physical' },
    ],
    activeCamera: 'CAM_Salon',
    layers: [
      { name: '0', on: true }, { name: 'Arquitectura', on: true }, { name: 'Mobiliario', on: true },
      { name: 'Vegetacion', on: true }, { name: 'Luces_Noche', on: false }, { name: 'Personas', on: false },
    ],
    elements: [
      { index: 0, name: 'CShading_LightMix', enabled: true, cls: 'CShading_LightMix' },
      { index: 1, name: 'CMasking_ID', enabled: true, cls: 'CMasking_ID' },
      { index: 2, name: 'CShading_Reflect', enabled: false, cls: 'CShading_Reflect' },
    ],
    elementClasses: ['CESSENTIAL_Direct', 'CESSENTIAL_Reflect', 'CMasking_ID', 'CMasking_Mask', 'CShading_Albedo', 'CShading_LightMix', 'CShading_Reflect', 'CTexmap'],
    res: { w: 1920, h: 1080 },
    suns: [{ name: 'CoronaSun001', on: true }],
    envMaps: ['CoronaSky_Dia', 'HDRI_Atardecer.exr', 'HDRI_Noche.hdr'],
    activeEnv: 'CoronaSky_Dia',
    corona: { isCorona: true, passLimit: 0, noiseLimit: 3.0, timeLimit: 0 },
    selection: ['Sofa_01', 'Mesa_Centro'],
    outputFile: 'D:\\Proyectos\\CasaPlaya\\render\\Casa_Playa.exr',
    defaultFolder: 'D:\\Proyectos\\CasaPlaya\\render',
  };
  const wait = v => new Promise(r => setTimeout(() => r(v), 60));
  const camByName = n => scene.cameras.find(c => c.name === n);

  function call(cmd, a) {
    switch (cmd) {
      case 'ping': return wait('mock');
      case 'getScene': return wait(JSON.parse(JSON.stringify(scene)));
      case 'loadData': return wait(localStorage.getItem('reasm-mock') || '');
      case 'saveData': localStorage.setItem('reasm-mock', a[0]); return wait(true);
      case 'apply': {
        const missing = [];
        a.forEach(op => {
          const f = op.split(RS);
          if (f[0] === 'cam') { if (camByName(f[1])) scene.activeCamera = f[1]; else missing.push('Camara: ' + f[1]); }
          if (f[0] === 'res') scene.res = { w: +f[1], h: +f[2] };
          if (f[0] === 'layer') { const l = scene.layers.find(x => x.name === f[1]); if (l) l.on = f[2] === '1'; else missing.push('Capa: ' + f[1]); }
        });
        return wait(missing);
      }
      case 'batchBegin': case 'batchEnd': return wait(true);
      case 'render': return new Promise(r => setTimeout(() => r({ file: a[0] + '\\' + a[1] + a[2], aborted: false }), 700));
      case 'setOutput': scene.outputFile = a[0] + '\\' + a[1] + a[2]; return wait(scene.outputFile);
      case 'camCreate': { const n = a[0] || ('REA_Cam_' + String(scene.cameras.length + 1).padStart(3, '0')); scene.cameras.push({ name: n, locked: false, cls: 'Physical' }); scene.activeCamera = n; return wait(n); }
      case 'cam': {
        const c = camByName(a[1]); if (!c) return wait(false);
        if (a[0] === 'view') scene.activeCamera = c.name;
        if (a[0] === 'lock') c.locked = !c.locked;
        if (a[0] === 'rename') c.name = a[2];
        if (a[0] === 'delete') scene.cameras = scene.cameras.filter(x => x !== c);
        return wait(true);
      }
      case 'elem': {
        const i = +a[1];
        if (a[0] === 'toggle') scene.elements[i].enabled = !scene.elements[i].enabled;
        if (a[0] === 'remove') scene.elements.splice(i, 1);
        if (a[0] === 'add') scene.elements.push({ index: 0, name: a[2], enabled: true, cls: a[2] });
        scene.elements.forEach((e, k) => e.index = k);
        return wait(true);
      }
      case 'browseFolder': return wait(scene.defaultFolder);
      case 'selection': return wait(scene.selection.slice());
      case 'openRenderSetup': return wait(true);
    }
    return Promise.reject(new Error('Comando desconocido: ' + cmd));
  }
  return { call };
})();
