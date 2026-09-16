/*
 * en-linea.js — Solo para la VERSIÓN DE PRUEBA.
 *
 * Esta versión funciona únicamente con internet:
 *  - No se guarda en el celular (no hay service worker) y borra cualquier
 *    copia que hubiera quedado de otra versión.
 *  - Comprueba la conexión al abrir y cada 20 segundos. Si se cae, tapa la
 *    app con un aviso y pausa el reloj de la prueba hasta que vuelva.
 */
(() => {
  const CADA = 20000;        // cada cuánto se comprueba la conexión
  const ESPERA = 6000;       // cuánto se espera al servidor antes de rendirse
  const FALLOS_PARA_AVISAR = 2;

  let fallos = 0;
  let tapado = false;

  /* Nada de copias guardadas: esta versión siempre viene del servidor. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((lista) => lista.forEach((r) => r.unregister()))
      .catch(() => {});
    if (window.caches && caches.keys) {
      caches.keys().then((claves) => claves.forEach((c) => caches.delete(c))).catch(() => {});
    }
  }

  function tapar() {
    if (tapado) return;
    tapado = true;
    if (typeof Demo !== 'undefined' && Demo.pausarPorRed) Demo.pausarPorRed(true);
    let caja = document.getElementById('sinLinea');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'sinLinea';
      caja.className = 'bloqueo';
      caja.innerHTML =
        '<div class="bloqueo-caja">' +
          '<div class="bloqueo-icono">📶</div>' +
          '<h2>Necesitas internet</h2>' +
          '<p>Esta es la <b>versión de prueba</b> y funciona solo en línea.</p>' +
          '<p class="nota">Conéctate a WiFi o a tus datos y la app sigue sola. ' +
          'Mientras tanto, el tiempo de tu prueba está pausado.</p>' +
          '<p class="nota" id="sinLineaEstado">Reintentando…</p>' +
        '</div>';
      document.body.appendChild(caja);
    }
    caja.hidden = false;
  }

  function destapar() {
    if (!tapado) return;
    tapado = false;
    fallos = 0;
    if (typeof Demo !== 'undefined' && Demo.pausarPorRed) Demo.pausarPorRed(false);
    const caja = document.getElementById('sinLinea');
    if (caja) caja.remove();
  }

  async function hayInternet() {
    if (navigator.onLine === false) return false;
    try {
      const control = new AbortController();
      const tiempo = setTimeout(() => control.abort(), ESPERA);
      const resp = await fetch('latido.txt?t=' + Date.now(), { cache: 'no-store', signal: control.signal });
      clearTimeout(tiempo);
      return resp && resp.ok;
    } catch (e) {
      return false;
    }
  }

  async function revisar() {
    if (await hayInternet()) {
      destapar();
    } else {
      fallos++;
      if (fallos >= FALLOS_PARA_AVISAR) tapar();
    }
  }

  window.addEventListener('offline', () => { fallos = FALLOS_PARA_AVISAR; tapar(); });
  window.addEventListener('online', () => { fallos = 0; revisar(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });

  revisar();
  setInterval(revisar, CADA);
})();
