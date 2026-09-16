/*
 * demo.js — Puerta de acceso con clave y prueba de 30 minutos.
 *
 * Cómo funciona:
 *  - Al abrir el enlace, la app pide una CLAVE. Sin clave no se entra.
 *  - Con la clave de prueba se abren 30 MINUTOS DE USO. Al terminarse, la
 *    app vuelve a pedir clave y avisa que esa prueba ya se usó en ese celular.
 *  - Con la llave del dueño, el celular queda con la versión completa para
 *    siempre (también sirve poniéndola en el enlace: ?llave=...).
 *
 * Las claves NO están aquí: solo sus huellas, calculadas con PBKDF2-SHA256 y
 * 150 000 vueltas. Aunque este código es público, de la huella no se saca la
 * clave.
 *
 * Alcance honesto: es un candado de cortesía. Alguien técnico podría borrar
 * los datos del navegador y pedir otra prueba. Para enseñar la app a un
 * cliente cumple de sobra.
 */
const Demo = (() => {
  const MINUTOS = 30;
  const ITERACIONES = 150000;
  const SAL = '5a4df265f7be5bf7316a95e841a0a77e';
  const HUELLA_DUENO  = '171e8521aa0c1195ceb405b987b77779ea6a03bd65d608a79d830731b27c7dcd';
  const HUELLA_PRUEBA = '2458ff3a6d0ed82cc581bdaa99fa1bfd2c07bd9999786eff9296d4da30ba3261';

  const CLAVE_LOCAL = 'tienda-acceso';
  const TIC = 5000;
  const GUARDADO = 15000;

  let estado = null;
  let temporizador = null;
  let ultimoVisto = 0;
  let desdeGuardado = 0;
  let alCambiar = null;

  /* ===================== guardado ===================== */

  function vacio() {
    return {
      liberado: false,        // versión completa en este celular
      pruebaActivada: false,  // ya se usó la clave de prueba aquí
      usadosMs: 0,
      revisadoInicial: false,
      bienvenida: false,
      desde: null
    };
  }

  function leerLocal() {
    try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || 'null'); } catch (e) { return null; }
  }

  function escribirLocal() {
    try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(estado)); } catch (e) {}
  }

  async function guardar() {
    await DB.setConfig('acceso', estado);
    escribirLocal();
    desdeGuardado = 0;
  }

  /* ===================== claves ===================== */

  function aHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function huellaDe(clave) {
    if (!(window.crypto && crypto.subtle && window.isSecureContext)) return null;
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(String(clave).trim().toLowerCase()),
      'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(SAL), iterations: ITERACIONES, hash: 'SHA-256' }, base, 256);
    return aHex(bits);
  }

  /** Devuelve 'dueno', 'prueba' o null. Una sola vuelta de cálculo. */
  async function tipoDeClave(clave) {
    if (!clave) return null;
    const h = await huellaDe(clave);
    if (h === null) return null;
    if (h === HUELLA_DUENO) return 'dueno';
    if (h === HUELLA_PRUEBA) return 'prueba';
    return null;
  }

  async function llaveCorrecta(clave) { return (await tipoDeClave(clave)) === 'dueno'; }

  /* ===================== tiempo ===================== */

  function limiteMs() { return MINUTOS * 60000; }
  function restanteMs() { return Math.max(0, limiteMs() - Number(estado.usadosMs || 0)); }
  function pruebaAgotada() { return estado.pruebaActivada && restanteMs() <= 0; }

  function textoRestante() {
    const ms = restanteMs();
    const min = Math.floor(ms / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    return min > 0 ? min + ' min' : seg + ' s';
  }

  function correrTiempo() {
    if (!estado || estado.liberado || !estado.pruebaActivada) return;
    const ahora = Date.now();
    const visible = document.visibilityState !== 'hidden';
    const delta = ahora - ultimoVisto;
    ultimoVisto = ahora;

    // Solo corre con la app a la vista. Si mueven el reloj hacia atrás
    // (delta negativo) no se regala tiempo: se cobra el tic completo.
    if (visible) {
      estado.usadosMs += (delta > 0 && delta < TIC * 3) ? delta : TIC;
      desdeGuardado += TIC;
    }

    if (restanteMs() <= 0) { cerrarPorTiempo(); return; }
    if (desdeGuardado >= GUARDADO) guardar();
    if (alCambiar) alCambiar(estado);
  }

  function arrancarReloj() {
    detenerReloj();
    ultimoVisto = Date.now();
    temporizador = setInterval(correrTiempo, TIC);
  }

  function detenerReloj() {
    if (temporizador) { clearInterval(temporizador); temporizador = null; }
  }

  function cerrarPorTiempo() {
    detenerReloj();
    estado.usadosMs = limiteMs();
    guardar();
    pintarPuerta('agotada');
    if (alCambiar) alCambiar(estado);
  }

  /* ===================== puerta de acceso ===================== */

  const TEXTOS = {
    entrar: {
      icono: '🔒',
      titulo: 'Escribe tu clave',
      cuerpo: 'Esta app funciona con clave. Escribe la que te dieron para entrar.',
      boton: 'Entrar'
    },
    agotada: {
      icono: '⏳',
      titulo: 'Se terminó tu prueba',
      cuerpo: 'Usaste los <b>' + MINUTOS + ' minutos</b> de prueba. Lo que registraste sigue guardado en este celular.',
      boton: 'Entrar con otra clave'
    }
  };

  function pintarPuerta(modo) {
    const t = TEXTOS[modo] || TEXTOS.entrar;
    let caja = document.getElementById('bloqueoDemo');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'bloqueoDemo';
      caja.className = 'bloqueo';
      document.body.appendChild(caja);
    }
    caja.innerHTML =
      '<div class="bloqueo-caja">' +
        '<div class="bloqueo-icono">' + t.icono + '</div>' +
        '<h2>' + t.titulo + '</h2>' +
        '<p>' + t.cuerpo + '</p>' +
        (modo === 'agotada'
          ? '<p class="nota">Para seguir usándola sin límite, pide la clave completa a quien te compartió la app.</p>'
          : '<p class="nota">Con la clave de prueba tienes ' + MINUTOS + ' minutos para conocerla.</p>') +
        '<div class="campo"><label>Clave</label>' +
        '<input type="password" id="pinDemo" placeholder="clave de acceso" autocomplete="off"></div>' +
        '<button class="btn-principal" id="btnDesbloquear">' + t.boton + '</button>' +
        '<p class="nota" id="errorPin"></p>' +
      '</div>';

    const intentar = async () => {
      const boton = document.getElementById('btnDesbloquear');
      const error = document.getElementById('errorPin');
      const campo = document.getElementById('pinDemo');
      boton.disabled = true;
      error.textContent = 'Comprobando…';

      const tipo = await tipoDeClave(campo.value);
      if (tipo === 'dueno') {
        await liberar();
        App.aviso('¡Listo! Este celular tiene la versión completa', 'exito');
        return;
      }
      if (tipo === 'prueba') {
        if (estado.pruebaActivada) {
          error.innerHTML = 'Esa prueba <b>ya se usó</b> en este celular.';
          campo.value = '';
          boton.disabled = false;
          return;
        }
        await empezarPrueba();
        return;
      }
      error.textContent = 'Esa clave no es correcta.';
      campo.value = '';
      boton.disabled = false;
    };

    document.getElementById('btnDesbloquear').onclick = intentar;
    document.getElementById('pinDemo').onkeydown = (e) => { if (e.key === 'Enter') intentar(); };
    setTimeout(() => { const c = document.getElementById('pinDemo'); if (c) c.focus(); }, 200);
  }

  function cerrarPuerta() {
    const caja = document.getElementById('bloqueoDemo');
    if (caja) caja.remove();
  }

  /* ===================== acciones ===================== */

  /** Versión completa en este celular, para siempre. */
  async function liberar() {
    estado.liberado = true;
    await guardar();
    detenerReloj();
    cerrarPuerta();
    if (alCambiar) alCambiar(estado);
  }

  /** Arranca los 30 minutos de prueba en este celular. */
  async function empezarPrueba() {
    estado.pruebaActivada = true;
    estado.usadosMs = 0;
    estado.desde = new Date().toISOString();
    await guardar();
    cerrarPuerta();
    arrancarReloj();
    if (!estado.bienvenida) pintarBienvenida();
    if (alCambiar) alCambiar(estado);
  }

  /** Vuelve a pedir clave en este celular (para probar el flujo). */
  async function volverAPrueba() {
    estado = Object.assign(vacio(), { revisadoInicial: true, desde: new Date().toISOString() });
    await guardar();
    detenerReloj();
    pintarPuerta('entrar');
    if (alCambiar) alCambiar(estado);
  }

  function pintarBienvenida() {
    App.abrirModal(
      '<h2>👋 Bienvenida a la prueba</h2>' +
      '<p class="sub">Tienes <b>' + MINUTOS + ' minutos</b> para conocerla. El tiempo solo corre mientras la usas.</p>' +
      '<div class="panel"><ul class="lista-simple">' +
        '<li><span>Escanea productos con la cámara</span><b>📷</b></li>' +
        '<li><span>Cobra y lleva las cuentas del día</span><b>💵</b></li>' +
        '<li><span>Apunta fiados y visitas de proveedor</span><b>🤝</b></li>' +
        '<li><span>Saca tu lista de compras en PDF</span><b>📄</b></li>' +
      '</ul></div>' +
      '<p class="ayuda">Arriba, junto a la campana, verás cuánto tiempo te queda.</p>' +
      '<button class="btn-principal" id="mOk">Empezar</button>'
    );
    const boton = document.getElementById('mOk');
    if (boton) boton.onclick = App.cerrarModal;
    estado.bienvenida = true;
    guardar();
  }

  /* ===================== arranque ===================== */

  /** Clave en el enlace: ...?llave=xxxx (sirve para las dos claves). */
  async function revisarClaveEnElEnlace() {
    let clave = null;
    try {
      const url = new URL(location.href);
      clave = url.searchParams.get('llave') || url.searchParams.get('clave');
      if (clave) {
        url.searchParams.delete('llave');
        url.searchParams.delete('clave');
        history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
      }
    } catch (e) {}
    if (!clave) return false;
    const tipo = await tipoDeClave(clave);
    if (tipo === 'dueno') { await liberar(); return true; }
    if (tipo === 'prueba' && !estado.pruebaActivada) { await empezarPrueba(); return true; }
    return false;
  }

  async function cargar(callback) {
    alCambiar = callback || null;
    const cfg = await DB.getConfig();
    estado = Object.assign(vacio(), cfg.acceso || {});

    // Si borraron una de las dos copias, manda la que tenga más avance.
    const local = leerLocal();
    if (local && !estado.liberado) {
      estado.usadosMs = Math.max(Number(estado.usadosMs || 0), Number(local.usadosMs || 0));
      if (local.liberado) estado.liberado = true;
      if (local.pruebaActivada) estado.pruebaActivada = true;
    }

    // Primera vez con esta versión: si el celular ya tenía productos, es de
    // la tienda (no de un cliente nuevo) y se queda con la versión completa.
    if (!estado.revisadoInicial) {
      const productos = await DB.todosProductos();
      estado.revisadoInicial = true;
      estado.desde = new Date().toISOString();
      if (productos.length > 0) estado.liberado = true;
      await guardar();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') guardar();
      else ultimoVisto = Date.now();
    });
    window.addEventListener('pagehide', () => { if (!estado.liberado) guardar(); });

    if (await revisarClaveEnElEnlace()) return estado;

    if (estado.liberado) {
      if (alCambiar) alCambiar(estado);
      return estado;
    }

    if (!estado.pruebaActivada) pintarPuerta('entrar');
    else if (pruebaAgotada()) pintarPuerta('agotada');
    else arrancarReloj();

    if (alCambiar) alCambiar(estado);
    return estado;
  }

  return {
    cargar, liberar, volverAPrueba, empezarPrueba, llaveCorrecta, tipoDeClave,
    restanteMs, textoRestante, limiteMs, pruebaAgotada, minutos: () => MINUTOS,
    estado: () => estado
  };
})();
