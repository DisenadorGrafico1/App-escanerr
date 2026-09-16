/*
 * demo.js — Versión de prueba para quien abra el enlace.
 *
 * Cualquier persona que abra la app desde el enlace público la puede usar
 * 30 MINUTOS DE USO. Al terminarse, se bloquea con una pantalla que invita a
 * pedir la versión completa.
 *
 * El dueño desbloquea su propio celular con su llave, una sola vez, y ese
 * dispositivo queda con la versión completa para siempre. La llave se puede
 * escribir en la pantalla de bloqueo o venir en el enlace (?llave=...).
 *
 * Cómo se guarda la llave: aquí NO está la llave, solo su huella calculada
 * con PBKDF2-SHA256 y 150 000 vueltas. Aunque este código es público, de la
 * huella no se puede sacar la llave.
 *
 * Alcance honesto: es un candado de cortesía. Alguien técnico podría borrar
 * los datos del navegador y empezar otra prueba. Para enseñar la app a un
 * cliente cumple de sobra.
 */
const Demo = (() => {
  const MINUTOS = 30;                 // duración de la prueba
  const ITERACIONES = 150000;
  const SAL = '5a4df265f7be5bf7316a95e841a0a77e';
  const HUELLA = '171e8521aa0c1195ceb405b987b77779ea6a03bd65d608a79d830731b27c7dcd';

  const CLAVE_LOCAL = 'tienda-prueba';
  const TIC = 5000;                   // cada cuánto se suma tiempo
  const GUARDADO = 15000;             // cada cuánto se guarda

  let estado = null;
  let temporizador = null;
  let ultimoVisto = 0;
  let desdeGuardado = 0;
  let alCambiar = null;

  /* ===================== guardado ===================== */

  function vacio() {
    return {
      liberado: false,       // este celular ya tiene la versión completa
      usadosMs: 0,
      bloqueado: false,
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
    await DB.setConfig('prueba', estado);
    escribirLocal();
    desdeGuardado = 0;
  }

  /* ===================== la llave del dueño ===================== */

  function aHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function huellaDe(llave) {
    if (!(window.crypto && crypto.subtle && window.isSecureContext)) return null;
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(String(llave).trim()), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(SAL), iterations: ITERACIONES, hash: 'SHA-256' }, base, 256);
    return aHex(bits);
  }

  async function llaveCorrecta(llave) {
    if (!llave) return false;
    const h = await huellaDe(llave);
    return h !== null && h === HUELLA;
  }

  /** Libera este celular: versión completa para siempre. */
  async function liberar() {
    estado.liberado = true;
    estado.bloqueado = false;
    await guardar();
    detenerReloj();
    const caja = document.getElementById('bloqueoDemo');
    if (caja) caja.remove();
    if (alCambiar) alCambiar(estado);
  }

  /** Vuelve a poner este celular en modo prueba (para probar el flujo). */
  async function volverAPrueba() {
    estado = Object.assign(vacio(), { revisadoInicial: true, bienvenida: true, desde: new Date().toISOString() });
    await guardar();
    arrancarReloj();
    if (alCambiar) alCambiar(estado);
  }

  /* ===================== tiempo ===================== */

  function limiteMs() { return MINUTOS * 60000; }
  function restanteMs() { return Math.max(0, limiteMs() - Number(estado.usadosMs || 0)); }

  function textoRestante() {
    const ms = restanteMs();
    const min = Math.floor(ms / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    return min > 0 ? min + ' min' : seg + ' s';
  }

  function correrTiempo() {
    if (!estado || estado.liberado || estado.bloqueado) return;
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

    if (estado.usadosMs >= limiteMs()) { bloquear(); return; }
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

  /* ===================== pantallas ===================== */

  function bloquear() {
    estado.bloqueado = true;
    detenerReloj();
    guardar();
    pintarBloqueo();
    if (alCambiar) alCambiar(estado);
  }

  function pintarBloqueo() {
    if (document.getElementById('bloqueoDemo')) return;
    const caja = document.createElement('div');
    caja.id = 'bloqueoDemo';
    caja.className = 'bloqueo';
    caja.innerHTML =
      '<div class="bloqueo-caja">' +
        '<div class="bloqueo-icono">⏳</div>' +
        '<h2>Se terminó la prueba</h2>' +
        '<p>Probaste la app durante <b>' + MINUTOS + ' minutos</b>. Todo lo que registraste sigue guardado.</p>' +
        '<p class="nota">Para seguir usándola sin límite, pide la versión completa a quien te compartió la app.</p>' +
        '<div class="campo"><label>¿Tienes la llave? Escríbela para activar este celular</label>' +
        '<input type="password" id="pinDemo" placeholder="llave de activación" autocomplete="off"></div>' +
        '<button class="btn-principal" id="btnDesbloquear">Activar versión completa</button>' +
        '<p class="nota" id="errorPin"></p>' +
      '</div>';
    document.body.appendChild(caja);

    const intentar = async () => {
      const boton = document.getElementById('btnDesbloquear');
      const error = document.getElementById('errorPin');
      boton.disabled = true;
      error.textContent = 'Comprobando…';
      if (await llaveCorrecta(document.getElementById('pinDemo').value)) {
        await liberar();
        App.aviso('¡Listo! Este celular ya tiene la versión completa', 'exito');
      } else {
        error.textContent = 'Esa llave no es correcta.';
        document.getElementById('pinDemo').value = '';
        boton.disabled = false;
      }
    };
    document.getElementById('btnDesbloquear').onclick = intentar;
    document.getElementById('pinDemo').onkeydown = (e) => { if (e.key === 'Enter') intentar(); };
  }

  function pintarBienvenida() {
    App.abrirModal(
      '<h2>👋 Estás probando la app</h2>' +
      '<p class="sub">Tienes <b>' + MINUTOS + ' minutos</b> para conocerla. El tiempo solo corre mientras la usas.</p>' +
      '<div class="panel"><ul class="lista-simple">' +
        '<li><span>Escanea productos con la cámara</span><b>📷</b></li>' +
        '<li><span>Cobra y lleva las cuentas del día</span><b>💵</b></li>' +
        '<li><span>Apunta fiados y visitas de proveedor</span><b>🤝</b></li>' +
        '<li><span>Saca tu lista de compras en PDF</span><b>📄</b></li>' +
      '</ul></div>' +
      '<p class="ayuda">Arriba, junto a la campana, verás cuánto tiempo te queda.</p>' +
      '<button class="btn-principal" id="mOk">Empezar a probar</button>'
    );
    const boton = document.getElementById('mOk');
    if (boton) boton.onclick = App.cerrarModal;
    estado.bienvenida = true;
    guardar();
  }

  /* ===================== arranque ===================== */

  /** Llave en el enlace: ...?llave=xxxx (para el celular del dueño). */
  async function revisarLlaveEnElEnlace() {
    let llave = null;
    try {
      const url = new URL(location.href);
      llave = url.searchParams.get('llave');
      if (llave) {
        url.searchParams.delete('llave');
        history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
      }
    } catch (e) {}
    if (llave && await llaveCorrecta(llave)) {
      await liberar();
      return true;
    }
    return false;
  }

  async function cargar(callback) {
    alCambiar = callback || null;
    const cfg = await DB.getConfig();
    estado = Object.assign(vacio(), cfg.prueba || {});

    // Si borraron una de las dos copias, manda la que tiene más uso.
    const local = leerLocal();
    if (local && !estado.liberado) {
      estado.usadosMs = Math.max(Number(estado.usadosMs || 0), Number(local.usadosMs || 0));
      if (local.bloqueado) estado.bloqueado = true;
      if (local.liberado) estado.liberado = true;
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

    await revisarLlaveEnElEnlace();

    if (estado.liberado) {
      if (alCambiar) alCambiar(estado);
      return estado;
    }

    if (estado.bloqueado || estado.usadosMs >= limiteMs()) {
      estado.bloqueado = true;
      await guardar();
      pintarBloqueo();
    } else {
      if (!estado.bienvenida) setTimeout(pintarBienvenida, 600);
      arrancarReloj();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') guardar();
      else ultimoVisto = Date.now();
    });
    window.addEventListener('pagehide', () => { if (!estado.liberado) guardar(); });

    if (alCambiar) alCambiar(estado);
    return estado;
  }

  return {
    cargar, liberar, volverAPrueba, llaveCorrecta, bloquear,
    restanteMs, textoRestante, limiteMs, minutos: () => MINUTOS,
    estado: () => estado
  };
})();
