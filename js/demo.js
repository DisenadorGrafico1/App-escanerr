/*
 * demo.js — Modo demostración: la app funciona X minutos y luego se bloquea.
 *
 * Pensado para prestarle el celular a un cliente y que la pruebe. Al terminar
 * el tiempo aparece una pantalla de bloqueo; el dueño la quita con su PIN.
 *
 * Detalles importantes:
 *  - Cuenta MINUTOS DE USO: el reloj solo corre con la app abierta y a la vista.
 *  - Si alguien mueve la hora del celular hacia atrás, no gana tiempo.
 *  - El PIN lo elige el dueño y aquí solo se guarda su huella (SHA-256), así
 *    que ni leyendo el código del repositorio se puede sacar.
 *  - Es un candado de cortesía para una demostración, no una protección
 *    contra alguien técnico: borrando los datos del navegador se reinicia.
 */
const Demo = (() => {
  const CLAVE_LOCAL = 'tienda-demo';
  const TIC = 5000;          // cada cuánto se suma tiempo (ms)
  const GUARDADO = 15000;    // cada cuánto se guarda en la base (ms)

  let estado = null;         // copia en memoria de la configuración
  let temporizador = null;
  let ultimoVisto = 0;
  let desdeGuardado = 0;
  let alCambiar = null;      // avisa a la app para repintar el contador

  /* ---------- guardado ---------- */

  function vacio() {
    return { activo: false, minutos: 30, usadosMs: 0, iniciado: null, sal: '', pin: '', bloqueado: false };
  }

  function leerLocal() {
    try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || 'null'); } catch (e) { return null; }
  }

  function escribirLocal() {
    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify({
        usadosMs: estado.usadosMs, iniciado: estado.iniciado, bloqueado: estado.bloqueado
      }));
    } catch (e) {}
  }

  async function guardar() {
    await DB.setConfig('demo', estado);
    escribirLocal();
    desdeGuardado = 0;
  }

  /* ---------- PIN ---------- */

  async function huella(pin, sal) {
    const texto = sal + '|' + String(pin).trim();
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      const datos = new TextEncoder().encode(texto);
      const buf = await crypto.subtle.digest('SHA-256', datos);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Respaldo sencillo por si el navegador no trae criptografía disponible.
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
    return 'simple-' + h.toString(16);
  }

  function nuevaSal() {
    const a = new Uint8Array(8);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; });
    return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function pinCorrecto(pin) {
    if (!estado || !estado.pin) return false;
    return (await huella(pin, estado.sal)) === estado.pin;
  }

  /* ---------- tiempo ---------- */

  function limiteMs() { return Math.max(1, Number(estado.minutos) || 30) * 60000; }
  function restanteMs() { return Math.max(0, limiteMs() - Number(estado.usadosMs || 0)); }

  function textoRestante() {
    const ms = restanteMs();
    const min = Math.floor(ms / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    return min > 0 ? min + ' min' : seg + ' s';
  }

  function correrTiempo() {
    if (!estado.activo || estado.bloqueado) return;
    const ahora = Date.now();
    const visible = document.visibilityState !== 'hidden';
    const delta = ahora - ultimoVisto;
    ultimoVisto = ahora;

    // Solo cuenta si la app está a la vista; si movieron el reloj hacia
    // atrás (delta negativo) no se regala tiempo, se cobra el tic completo.
    if (visible) {
      estado.usadosMs += (delta > 0 && delta < TIC * 3) ? delta : TIC;
      desdeGuardado += TIC;
    }

    if (estado.usadosMs >= limiteMs()) {
      bloquear();
      return;
    }
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

  /* ---------- pantalla de bloqueo ---------- */

  function bloquear() {
    estado.bloqueado = true;
    detenerReloj();
    guardar();
    pintarBloqueo();
    if (alCambiar) alCambiar(estado);
  }

  function minutosTexto() {
    const m = Number(estado.minutos) || 30;
    return m === 1 ? 'un minuto' : m + ' minutos';
  }

  function pintarBloqueo() {
    if (document.getElementById('bloqueoDemo')) return;
    const tienda = (App.estado.cfg && App.estado.cfg.tienda) || 'Mi Tienda';
    const caja = document.createElement('div');
    caja.id = 'bloqueoDemo';
    caja.className = 'bloqueo';
    caja.innerHTML =
      '<div class="bloqueo-caja">' +
        '<div class="bloqueo-icono">⏳</div>' +
        '<h2>Se terminó la prueba</h2>' +
        '<p>Probaste <b>' + App.esc(tienda) + '</b> durante ' + minutosTexto() +
          '. Todo lo que registraste sigue guardado.</p>' +
        '<p class="nota">Para seguir usándola, pide la versión completa al dueño de la app.</p>' +
        '<div class="campo"><label>¿Eres el dueño? Escribe tu PIN para desbloquear</label>' +
        '<input type="password" id="pinDemo" inputmode="numeric" placeholder="PIN"></div>' +
        '<button class="btn-principal" id="btnDesbloquear">Desbloquear</button>' +
        '<p class="nota" id="errorPin"></p>' +
      '</div>';
    document.body.appendChild(caja);

    const intentar = async () => {
      const pin = document.getElementById('pinDemo').value;
      if (await pinCorrecto(pin)) {
        await terminar();
        caja.remove();
        App.aviso('Prueba terminada: la app quedó desbloqueada', 'exito');
      } else {
        document.getElementById('errorPin').textContent = 'Ese PIN no es correcto.';
        document.getElementById('pinDemo').value = '';
      }
    };
    document.getElementById('btnDesbloquear').onclick = intentar;
    document.getElementById('pinDemo').onkeydown = (e) => { if (e.key === 'Enter') intentar(); };
  }

  /* ---------- API ---------- */

  /** Enciende la prueba: minutos y PIN los pone el dueño. */
  async function iniciar(minutos, pin) {
    const m = Math.max(1, Math.round(Number(minutos) || 30));
    if (!pin || String(pin).trim().length < 4) throw new Error('El PIN debe tener al menos 4 caracteres');
    const sal = nuevaSal();
    estado = {
      activo: true, minutos: m, usadosMs: 0,
      iniciado: new Date().toISOString(),
      sal: sal, pin: await huella(pin, sal), bloqueado: false
    };
    await guardar();
    arrancarReloj();
    if (alCambiar) alCambiar(estado);
    return estado;
  }

  /** Apaga la prueba (ya con el PIN comprobado). */
  async function terminar() {
    estado = vacio();
    await guardar();
    try { localStorage.removeItem(CLAVE_LOCAL); } catch (e) {}
    detenerReloj();
    const caja = document.getElementById('bloqueoDemo');
    if (caja) caja.remove();
    if (alCambiar) alCambiar(estado);
  }

  /** Suma tiempo a una prueba en curso (por si el cliente pide más rato). */
  async function agregarMinutos(minutos) {
    if (!estado.activo) return;
    estado.minutos = Math.max(1, Number(estado.minutos) + Math.round(Number(minutos) || 0));
    estado.bloqueado = false;
    await guardar();
    const caja = document.getElementById('bloqueoDemo');
    if (caja) caja.remove();
    arrancarReloj();
    if (alCambiar) alCambiar(estado);
  }

  async function cargar(callback) {
    alCambiar = callback || null;
    const cfg = await DB.getConfig();
    estado = Object.assign(vacio(), cfg.demo || {});

    // Si alguien borró una de las dos copias, manda la que tiene más uso.
    const local = leerLocal();
    if (local && estado.activo) {
      estado.usadosMs = Math.max(Number(estado.usadosMs || 0), Number(local.usadosMs || 0));
      if (local.bloqueado) estado.bloqueado = true;
    }

    if (estado.activo) {
      if (estado.bloqueado || estado.usadosMs >= limiteMs()) {
        estado.bloqueado = true;
        await guardar();
        pintarBloqueo();
      } else {
        arrancarReloj();
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { guardar(); }
      else { ultimoVisto = Date.now(); }
    });
    window.addEventListener('pagehide', () => { if (estado.activo) guardar(); });

    return estado;
  }

  return {
    cargar, iniciar, terminar, agregarMinutos, pinCorrecto, bloquear,
    restanteMs, textoRestante, limiteMs,
    estado: () => estado
  };
})();
