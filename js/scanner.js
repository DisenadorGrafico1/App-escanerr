/*
 * scanner.js — Lectura de códigos de barras con la cámara del celular
 * y el pitido de confirmación.
 *
 * Usa BarcodeDetector (nativo de Android/Chrome) cuando existe, y si no,
 * cae en ZXing, que viene incluido en la carpeta vendor/ para que la app
 * funcione sin internet.
 */
const Escaner = (() => {
  let video = null;
  let stream = null;
  let detector = null;        // BarcodeDetector nativo
  let lectorZX = null;        // ZXing
  let corriendo = false;
  let rafId = null;
  let onCodigo = null;
  let ultimoCodigo = '';
  let ultimoMomento = 0;
  let espera = 1300;          // ms para volver a aceptar el MISMO código
  let audioCtx = null;
  let cfgSonido = true;
  let cfgVibrar = true;

  const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'];

  /* ---------- pitido ---------- */

  function tono(frecuencia, duracion, volumen) {
    if (!cfgSonido) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gan = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = frecuencia;
      gan.gain.setValueAtTime(volumen, audioCtx.currentTime);
      gan.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duracion / 1000);
      osc.connect(gan).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duracion / 1000);
    } catch (e) { /* si el navegador bloquea el audio, seguimos sin sonido */ }
  }

  function vibrar(patron) {
    if (cfgVibrar && navigator.vibrate) { try { navigator.vibrate(patron); } catch (e) {} }
  }

  /** Pitido de "leí bien el código". */
  function pitido() { tono(2200, 110, 0.25); vibrar(45); }
  /** Sonido grave de error (producto no registrado, sin existencia, etc.). */
  function pitidoError() { tono(320, 260, 0.3); vibrar([60, 60, 60]); }
  /** Doble tono al cobrar una venta. */
  function pitidoExito() {
    tono(1400, 90, 0.22);
    setTimeout(() => tono(2100, 140, 0.22), 110);
    vibrar([40, 50, 80]);
  }

  /** Campanita de aviso: producto por acabarse, visita o cobro pendiente. */
  function campana() {
    tono(880, 160, 0.22);
    setTimeout(() => tono(1175, 160, 0.22), 170);
    setTimeout(() => tono(1568, 260, 0.2), 340);
    vibrar([80, 60, 80]);
  }

  /** Despierta el audio dentro de un gesto del usuario (iOS lo exige). */
  function prepararAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }

  function configurar(cfg) {
    cfgSonido = cfg.sonido !== false;
    cfgVibrar = cfg.vibrar !== false;
  }

  /* ---------- cámara ---------- */

  function cargarScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function soporteNativo() {
    if (!('BarcodeDetector' in window)) return false;
    try {
      const disponibles = await window.BarcodeDetector.getSupportedFormats();
      return FORMATOS.some((f) => disponibles.includes(f));
    } catch (e) { return false; }
  }

  function entregar(texto) {
    const codigo = String(texto || '').trim();
    if (!codigo) return;
    const ahora = Date.now();
    if (codigo === ultimoCodigo && ahora - ultimoMomento < espera) return;
    ultimoCodigo = codigo;
    ultimoMomento = ahora;
    pitido();
    if (onCodigo) onCodigo(codigo);
  }

  async function bucleNativo() {
    if (!corriendo) return;
    try {
      if (video.readyState >= 2) {
        const codigos = await detector.detect(video);
        if (codigos && codigos.length) entregar(codigos[0].rawValue);
      }
    } catch (e) { /* un cuadro fallido no detiene el escaneo */ }
    rafId = requestAnimationFrame(bucleNativo);
  }

  async function iniciarZXing() {
    await cargarScript('vendor/zxing.min.js');
    // Ojo: ZXing necesita conectar él mismo el stream al <video>; si se lo
    // pasamos ya conectado se queda esperando un evento que nunca vuelve.
    const hints = new Map();
    const F = ZXing.BarcodeFormat;
    // Solo los formatos de tienda: así lee más rápido.
    // (TRY_HARDER queda fuera a propósito: en esta versión impide la lectura continua.)
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.CODABAR, F.QR_CODE
    ]);
    lectorZX = new ZXing.BrowserMultiFormatReader(hints, 200);
    lectorZX.decodeFromStream(stream, video, (resultado) => {
      if (resultado) entregar(resultado.getText());
    });
  }

  /**
   * Enciende la cámara y empieza a leer.
   * @param {HTMLVideoElement} elVideo
   * @param {(codigo:string)=>void} callback
   */
  async function iniciar(elVideo, callback, opciones = {}) {
    if (corriendo) await detener();
    video = elVideo;
    onCodigo = callback;
    espera = opciones.espera || 1300;
    ultimoCodigo = '';
    prepararAudio();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Este navegador no permite usar la cámara. Abre la app en Chrome y con https://');
    }

    const nativo = await soporteNativo();

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    corriendo = true;

    if (nativo) {
      video.srcObject = stream;
      await video.play().catch(() => {});
      detector = new window.BarcodeDetector({ formats: FORMATOS });
      bucleNativo();
    } else {
      await iniciarZXing();
    }
    return true;
  }

  async function detener() {
    corriendo = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (lectorZX) { try { lectorZX.reset(); } catch (e) {} lectorZX = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) { try { video.srcObject = null; } catch (e) {} }
    detector = null;
  }

  function estaActivo() { return corriendo; }

  /* ---------- linterna ---------- */

  function soportaLinterna() {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return false;
    return !!track.getCapabilities().torch;
  }

  let linternaEncendida = false;
  async function alternarLinterna() {
    if (!soportaLinterna()) return false;
    const track = stream.getVideoTracks()[0];
    linternaEncendida = !linternaEncendida;
    await track.applyConstraints({ advanced: [{ torch: linternaEncendida }] });
    return linternaEncendida;
  }

  /** Reinicia el filtro anti-repetición (útil al cambiar de pantalla). */
  function limpiarUltimo() { ultimoCodigo = ''; ultimoMomento = 0; }

  return {
    iniciar, detener, estaActivo, configurar, prepararAudio,
    pitido, pitidoError, pitidoExito, campana,
    soportaLinterna, alternarLinterna, limpiarUltimo
  };
})();
