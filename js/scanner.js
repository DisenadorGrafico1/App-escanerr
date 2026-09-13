/*
 * scanner.js — Motor de lectura de códigos de barras.
 *
 * Cómo evita equivocarse (que era el problema de leer "de lejos"):
 *  1. Solo mira el recuadro del centro (no toda la imagen): más resolución
 *     útil y menos cosas que confundan.
 *  2. Exige que el código se vea GRANDE dentro del recuadro. Si está lejos
 *     no lo registra: avisa "acerca el código".
 *  3. Verifica el dígito verificador del código (EAN-13, EAN-8, UPC-A).
 *     Un número mal leído casi nunca pasa esta prueba.
 *  4. Pide leer el MISMO código dos veces seguidas antes de darlo por bueno.
 *  5. Desactiva por defecto los formatos que se prestan a lecturas parciales
 *     (ITF de caja y Codabar); se pueden encender en Ajustes.
 *  6. Prueba varios binarizados por cuadro (normal, por histograma y en
 *     negativo) para leer bien con poca luz o etiquetas brillosas.
 */
const Escaner = (() => {
  let video = null;
  let stream = null;
  let pista = null;               // callback para los mensajes de ayuda
  let onCodigo = null;
  let corriendo = false;
  let temporizador = null;
  let ocupado = false;

  let detectorNativo = null;      // BarcodeDetector del navegador
  let lectorZX = null;            // MultiFormatReader de ZXing
  let lienzo = null, ctx = null;

  let audioCtx = null;
  let cfgSonido = true;
  let cfgVibrar = true;

  /* Ajustes de precisión (se pueden cambiar desde la app). */
  const ajustes = {
    minAncho: 0.32,        // el código debe ocupar al menos este % del recuadro
    confirmaciones: 2,     // lecturas iguales seguidas para aceptar
    ventana: 1200,         // ms para juntar esas lecturas
    espera: 1300,          // ms antes de volver a aceptar el MISMO código
    itf: false,            // códigos de caja (ITF) y Codabar
    cadencia: 90           // ms entre cuadros analizados
  };

  const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
  const FORMATOS_NATIVOS_ITF = FORMATOS_NATIVOS.concat(['itf', 'codabar']);

  /* ===================== sonidos ===================== */

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

  function pitido() { tono(2200, 110, 0.25); vibrar(45); }
  function pitidoError() { tono(320, 260, 0.3); vibrar([60, 60, 60]); }
  function pitidoExito() {
    tono(1400, 90, 0.22);
    setTimeout(() => tono(2100, 140, 0.22), 110);
    vibrar([40, 50, 80]);
  }
  function campana() {
    tono(880, 160, 0.22);
    setTimeout(() => tono(1175, 160, 0.22), 170);
    setTimeout(() => tono(1568, 260, 0.2), 340);
    vibrar([80, 60, 80]);
  }

  function prepararAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }

  function configurar(cfg) {
    cfgSonido = cfg.sonido !== false;
    cfgVibrar = cfg.vibrar !== false;
    ajustes.itf = !!cfg.leerITF;
    if (cfg.precisionEscaner === 'estricto') {
      ajustes.minAncho = 0.45;
      ajustes.confirmaciones = 3;
    } else if (cfg.precisionEscaner === 'rapido') {
      ajustes.minAncho = 0.22;
      ajustes.confirmaciones = 1;
    } else {
      ajustes.minAncho = 0.32;
      ajustes.confirmaciones = 2;
    }
    if (lectorZX) aplicarHints();
  }

  /* ===================== validación del número leído ===================== */

  /**
   * Comprueba el dígito verificador. Los códigos de producto lo traen para
   * detectar justo esto: números mal leídos.
   */
  function digitoVerificadorOk(codigo) {
    const d = codigo.split('').map(Number);
    if (d.some(isNaN)) return false;
    if (codigo.length === 13 || codigo.length === 12 || codigo.length === 8) {
      const base = codigo.length === 12 ? '0' + codigo : codigo;   // UPC-A = EAN-13 con cero
      const n = base.split('').map(Number);
      const control = n.pop();
      let suma = 0;
      // De derecha a izquierda: 3, 1, 3, 1…
      for (let i = n.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
        suma += n[i] * peso;
      }
      return ((10 - (suma % 10)) % 10) === control;
    }
    return true;   // otros formatos traen su propia verificación interna
  }

  /** Reglas de aceptación de un texto leído según su formato. */
  function textoValido(texto, formato) {
    const t = String(texto || '').trim();
    if (!t) return false;
    const f = String(formato || '').toLowerCase();

    if (/^(ean_13|ean-13|ean13|ean_8|ean-8|ean8|upc_a|upc-a|upca|upc_e|upc-e|upce)$/.test(f)) {
      if (!/^\d+$/.test(t)) return false;
      if (f.indexOf('upc_e') === 0 || f.indexOf('upc-e') === 0 || f === 'upce') return t.length === 8;
      return digitoVerificadorOk(t);
    }
    if (/^(itf|i2of5|interleaved)/.test(f)) {
      // ITF se puede leer a medias: se exige longitud par y razonable.
      return /^\d+$/.test(t) && t.length >= 8 && t.length % 2 === 0;
    }
    if (/^(code_39|code-39|code39)$/.test(f)) return t.length >= 4;
    if (/^(codabar)$/.test(f)) return t.length >= 6;
    // Code 128 y QR ya traen verificación propia.
    return t.length >= 3;
  }

  /* ===================== cámara ===================== */

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
      return FORMATOS_NATIVOS.some((f) => disponibles.includes(f));
    } catch (e) { return false; }
  }

  /** Enfoque, exposición y balance automáticos continuos si el celular puede. */
  async function afinarCamara(track) {
    if (!track || !track.getCapabilities) return;
    try {
      const caps = track.getCapabilities();
      const avanzado = [];
      const tiene = (prop, valor) => caps[prop] && caps[prop].indexOf && caps[prop].indexOf(valor) >= 0;
      if (tiene('focusMode', 'continuous')) avanzado.push({ focusMode: 'continuous' });
      if (tiene('exposureMode', 'continuous')) avanzado.push({ exposureMode: 'continuous' });
      if (tiene('whiteBalanceMode', 'continuous')) avanzado.push({ whiteBalanceMode: 'continuous' });
      if (avanzado.length) await track.applyConstraints({ advanced: avanzado });
    } catch (e) { /* cada celular expone lo suyo; si no se puede, seguimos */ }
  }

  function aplicarHints() {
    if (!lectorZX) return;
    const F = ZXing.BarcodeFormat;
    const formatos = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE];
    if (ajustes.itf) { formatos.push(F.ITF); formatos.push(F.CODABAR); }
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formatos);
    lectorZX.setHints(hints);
  }

  async function prepararZXing() {
    await cargarScript('vendor/zxing.min.js');
    lectorZX = new ZXing.MultiFormatReader();
    aplicarHints();
  }

  /* ===================== lectura por cuadros ===================== */

  /**
   * Copia la franja central de la imagen a un lienzo, dejando un marco blanco
   * alrededor. Ese marco importa: los códigos de barras necesitan espacio en
   * blanco a los lados para leerse, y si el producto se pega mucho a la
   * cámara el código llega hasta la orilla y no se podría leer.
   */
  const MARGEN = 0.12;

  function prepararLienzo(fuente, sx, sy, sw, sh) {
    if (!sw || !sh) return null;
    const marcoX = Math.round(sw * MARGEN);
    const marcoY = Math.round(sh * MARGEN);
    const total = sw + marcoX * 2;
    const altoTotal = sh + marcoY * 2;
    if (lienzo.width !== total || lienzo.height !== altoTotal) {
      lienzo.width = total;
      lienzo.height = altoTotal;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, total, altoTotal);
    ctx.drawImage(fuente, sx, sy, sw, sh, marcoX, marcoY, sw, sh);
    // El ancho útil es el de la imagen, sin contar el marco: así el cálculo
    // de "qué tan cerca está" no cambia por el marco.
    return { ancho: sw, alto: sh };
  }

  /** Recorta la franja central: es donde el usuario pone el código. */
  function dibujarRecorte() {
    const ancho = video.videoWidth, alto = video.videoHeight;
    if (!ancho || !alto) return null;
    const rx = Math.round(ancho * 0.06);
    const ry = Math.round(alto * 0.28);
    const rw = ancho - rx * 2;
    const rh = Math.round(alto * 0.44);
    return prepararLienzo(video, rx, ry, rw, rh);
  }

  function anchoDePuntos(puntos, anchoRecorte) {
    if (!puntos || !puntos.length) return null;   // no se pudo medir
    let min = Infinity, max = -Infinity;
    puntos.forEach((p) => {
      const x = typeof p.getX === 'function' ? p.getX() : p.x;
      if (x < min) min = x;
      if (x > max) max = x;
    });
    if (!isFinite(min) || !isFinite(max)) return null;
    return (max - min) / anchoRecorte;
  }

  /** Intenta decodificar el recorte con ZXing, probando varios binarizados. */
  function leerConZXing(medidas) {
    const fuente = new ZXing.HTMLCanvasElementLuminanceSource(lienzo);
    const intentos = [
      () => new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente)),
      () => new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(fuente)),
      () => new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente.invert()))
    ];
    for (const armar of intentos) {
      try {
        const resultado = lectorZX.decode(armar());
        if (resultado) {
          return {
            texto: resultado.getText(),
            formato: ZXing.BarcodeFormat[resultado.getBarcodeFormat()],
            ancho: anchoDePuntos(resultado.getResultPoints(), medidas.ancho)
          };
        }
      } catch (e) {
        // NotFoundException es lo normal cuando no hay código en el cuadro
      } finally {
        try { lectorZX.reset(); } catch (e) {}
      }
    }
    return null;
  }

  let lienzoChico = null, ctxChico = null;

  /**
   * Respaldo para cuando el navegador no informa el tamaño del código:
   * se reduce la imagen a un tercio y se vuelve a intentar. Un código
   * cercano aguanta la reducción; uno lejano ya no se lee. Así el filtro
   * de cercanía funciona igual, aunque no haya medidas.
   */
  async function aguantaReduccion(texto) {
    try {
      if (!lienzoChico) {
        lienzoChico = document.createElement('canvas');
        ctxChico = lienzoChico.getContext('2d', { willReadFrequently: true });
      }
      lienzoChico.width = Math.max(40, Math.round(lienzo.width / 3));
      lienzoChico.height = Math.max(40, Math.round(lienzo.height / 3));
      ctxChico.drawImage(lienzo, 0, 0, lienzoChico.width, lienzoChico.height);
      if (detectorNativo) {
        const codigos = await detectorNativo.detect(lienzoChico);
        return !!(codigos && codigos.some((c) => c.rawValue === texto));
      }
      const fuente = new ZXing.HTMLCanvasElementLuminanceSource(lienzoChico);
      const resultado = lectorZX.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente)));
      try { lectorZX.reset(); } catch (e) {}
      return !!resultado && resultado.getText() === texto;
    } catch (e) {
      try { if (lectorZX) lectorZX.reset(); } catch (e2) {}
      return false;
    }
  }

  async function leerConNativo(medidas) {
    const codigos = await detectorNativo.detect(lienzo);
    if (!codigos || !codigos.length) return null;
    // Si hay varios, se queda con el más grande (el que el usuario apuntó).
    const c = codigos.slice().sort((a, b) =>
      (b.boundingBox ? b.boundingBox.width : 0) - (a.boundingBox ? a.boundingBox.width : 0))[0];
    return {
      texto: c.rawValue,
      formato: c.format,
      ancho: c.boundingBox ? c.boundingBox.width / medidas.ancho : anchoDePuntos(c.cornerPoints, medidas.ancho)
    };
  }

  /* ===================== confirmación y avisos ===================== */

  let candidato = '';
  let vecesCandidato = 0;
  let momentoCandidato = 0;
  let ultimoEmitido = '';
  let momentoEmitido = 0;
  let sinLectura = 0;
  let pistaActual = null;

  function decirPista(texto) {
    if (texto === pistaActual) return;
    pistaActual = texto;
    if (pista) pista(texto);
  }

  function reiniciarCandidato() {
    candidato = '';
    vecesCandidato = 0;
    momentoCandidato = 0;
  }

  async function procesar(lectura) {
    const ahora = Date.now();

    if (!lectura) {
      sinLectura++;
      if (sinLectura > 18) decirPista('Acerca el código al recuadro');
      else if (sinLectura > 8) decirPista('Apunta al código de barras');
      if (ahora - momentoCandidato > ajustes.ventana) reiniciarCandidato();
      return;
    }

    sinLectura = 0;

    // 1) ¿El número tiene sentido para su formato?
    if (!textoValido(lectura.texto, lectura.formato)) {
      decirPista('No se lee bien: acerca el código');
      reiniciarCandidato();
      return;
    }

    // 2) ¿Está lo bastante cerca? De lejos es cuando se equivoca.
    if (lectura.ancho === null || lectura.ancho === undefined) {
      // El navegador no dijo el tamaño: se comprueba reduciendo la imagen.
      const cerca = await aguantaReduccion(lectura.texto);
      if (!cerca) {
        decirPista('Acerca el código: se ve muy chico');
        reiniciarCandidato();
        return;
      }
    } else if (lectura.ancho < ajustes.minAncho) {
      decirPista('Acerca el código: se ve muy chico');
      reiniciarCandidato();
      return;
    }

    // 3) ¿Ya lo habíamos leído hace un momento? (evita duplicados)
    if (lectura.texto === ultimoEmitido && ahora - momentoEmitido < ajustes.espera) return;

    // 4) Confirmación: el mismo número varias veces seguidas.
    if (lectura.texto === candidato && ahora - momentoCandidato < ajustes.ventana) {
      vecesCandidato++;
    } else {
      candidato = lectura.texto;
      vecesCandidato = 1;
    }
    momentoCandidato = ahora;

    if (vecesCandidato < ajustes.confirmaciones) {
      decirPista('Leyendo… sostén firme');
      return;
    }

    ultimoEmitido = lectura.texto;
    momentoEmitido = ahora;
    reiniciarCandidato();
    decirPista(null);
    pitido();
    if (onCodigo) onCodigo(lectura.texto, lectura);
  }

  async function bucle() {
    if (!corriendo) return;
    if (!ocupado && video.readyState >= 2) {
      ocupado = true;
      try {
        const medidas = dibujarRecorte();
        if (medidas) {
          const lectura = detectorNativo ? await leerConNativo(medidas) : leerConZXing(medidas);
          await procesar(lectura);
        }
      } catch (e) {
        // un cuadro fallido no detiene el escaneo
      } finally {
        ocupado = false;
      }
    }
    temporizador = setTimeout(() => requestAnimationFrame(bucle), ajustes.cadencia);
  }

  /* ===================== arranque y paro ===================== */

  async function iniciar(elVideo, callback, opciones = {}) {
    if (corriendo) await detener();
    video = elVideo;
    onCodigo = callback;
    pista = opciones.onPista || null;
    prepararAudio();
    reiniciarCandidato();
    ultimoEmitido = '';
    sinLectura = 0;
    pistaActual = undefined;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Este navegador no permite usar la cámara. Abre la app en Chrome y con https://');
    }

    if (!lienzo) {
      lienzo = document.createElement('canvas');
      ctx = lienzo.getContext('2d', { willReadFrequently: true });
    }

    const nativo = await soporteNativo();
    if (nativo) {
      detectorNativo = new window.BarcodeDetector({
        formats: ajustes.itf ? FORMATOS_NATIVOS_ITF : FORMATOS_NATIVOS
      });
    } else {
      detectorNativo = null;
      await prepararZXing();
    }

    // Más resolución = códigos chicos que sí se leen.
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    await afinarCamara(stream.getVideoTracks()[0]);

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play().catch(() => {});

    corriendo = true;
    decirPista('Apunta al código de barras');
    bucle();
    return true;
  }

  async function detener() {
    corriendo = false;
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) { try { video.srcObject = null; } catch (e) {} }
    detectorNativo = null;
    ocupado = false;
    decirPista(null);
    pista = null;
  }

  function estaActivo() { return corriendo; }

  /* ===================== linterna ===================== */

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

  function limpiarUltimo() {
    ultimoEmitido = '';
    momentoEmitido = 0;
    reiniciarCandidato();
  }

  /* Para las pruebas: analiza una imagen como si viniera de la cámara. */
  async function _leerLienzo(imagen) {
    if (!lectorZX) await prepararZXing();
    if (!lienzo) {
      lienzo = document.createElement('canvas');
      ctx = lienzo.getContext('2d', { willReadFrequently: true });
    }
    const medidas = prepararLienzo(imagen, 0, 0, imagen.width, imagen.height);
    return medidas ? leerConZXing(medidas) : null;
  }

  return {
    iniciar, detener, estaActivo, configurar, prepararAudio,
    pitido, pitidoError, pitidoExito, campana,
    soportaLinterna, alternarLinterna, limpiarUltimo,
    textoValido, digitoVerificadorOk, ajustes, _leerLienzo
  };
})();
