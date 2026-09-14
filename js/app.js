/*
 * app.js — Pantalla de Reportes y arranque de la aplicación.
 */
(() => {
  const { $, $$, estado, vistas, dinero, esc, aviso, ir, refrescar } = App;

  /* ===================== REPORTES ===================== */

  function rangoReportes() {
    return { desde: $('#repDesde').value || DB.hoy(), hasta: $('#repHasta').value || DB.hoy() };
  }

  function llenarCategoriasPDF() {
    const usadas = Array.from(new Set(estado.productos.map((p) => p.categoria).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
    const el = $('#categoriaPDF');
    const actual = el.value;
    el.innerHTML = '<option value="">Todos</option>' +
      usadas.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    if (usadas.includes(actual)) el.value = actual;
  }

  function vistaPreviaCompras() {
    const umbral = parseFloat($('#umbralPDF').value);
    if (!isFinite(umbral)) { $('#vistaPreviaPDF').textContent = ''; return; }
    const cat = $('#categoriaPDF').value;
    let lista = estado.productos.filter((p) => Number(p.stock) <= umbral);
    if (cat) lista = lista.filter((p) => p.categoria === cat);
    const costo = lista.reduce((s, p) => {
      const objetivo = Number(p.objetivo) > 0 ? Number(p.objetivo) : umbral;
      return s + Math.max(0, Math.ceil(objetivo - Number(p.stock))) * Number(p.costo);
    }, 0);
    $('#vistaPreviaPDF').innerHTML = 'Entrarían <b>' + lista.length + '</b> producto(s) · inversión estimada <b>' +
      dinero(costo) + '</b>';
  }

  vistas.reportes = {
    render: async () => { llenarCategoriasPDF(); vistaPreviaCompras(); }
  };

  /** Envuelve la generación de un PDF para avisar bonito si algo falla. */
  async function generar(etiqueta, fn, compartir) {
    try {
      aviso('Generando ' + etiqueta + '…');
      const r = await fn();
      if (!r) return;
      const res = await Reportes.guardar(r.doc, r.nombre, !!compartir);
      if (res !== 'cancelado') aviso('Listo: ' + r.nombre, 'exito');
    } catch (e) {
      aviso('No se pudo generar el PDF: ' + e.message, 'error');
    }
  }

  function conectarReportes() {
    $('#repDesde').value = DB.sumarDias(DB.hoy(), -6);
    $('#repHasta').value = DB.hoy();

    $('#umbralPDF').addEventListener('input', vistaPreviaCompras);
    $('#categoriaPDF').addEventListener('change', vistaPreviaCompras);

    $$('#vista-reportes [data-rep]').forEach((b) => b.onclick = () => {
      const r = b.dataset.rep;
      const hoy = DB.hoy();
      if (r === 'hoy') { $('#repDesde').value = hoy; $('#repHasta').value = hoy; }
      if (r === 'semana') { $('#repDesde').value = DB.sumarDias(hoy, -6); $('#repHasta').value = hoy; }
      if (r === 'mes') { $('#repDesde').value = hoy.slice(0, 8) + '01'; $('#repHasta').value = hoy; }
      if (r === 'mespasado') {
        const [a, m] = hoy.split('-').map(Number);
        const ini = new Date(a, m - 2, 1), fin = new Date(a, m - 1, 0);
        $('#repDesde').value = DB.diaDe(ini);
        $('#repHasta').value = DB.diaDe(fin);
      }
      $$('#vista-reportes [data-rep]').forEach((o) => o.classList.toggle('activo', o === b));
    });

    $('#btnPDFCompras').onclick = () => generar('la lista de compras', async () => {
      const umbral = parseFloat($('#umbralPDF').value);
      if (!isFinite(umbral)) { aviso('Escribe el número de piezas', 'error'); return null; }
      return Reportes.listaCompras(estado.productos, estado.cfg,
        { umbral, categoria: $('#categoriaPDF').value });
    });
    $('#btnCompartirCompras').onclick = () => generar('la lista de compras', async () => {
      const umbral = parseFloat($('#umbralPDF').value);
      if (!isFinite(umbral)) { aviso('Escribe el número de piezas', 'error'); return null; }
      return Reportes.listaCompras(estado.productos, estado.cfg,
        { umbral, categoria: $('#categoriaPDF').value });
    }, true);

    $('#btnPDFInventario').onclick = () => generar('el inventario', () =>
      Reportes.inventario(estado.productos, estado.cfg, { categoria: $('#categoriaPDF').value }));

    $('#btnPDFVentas').onclick = () => generar('el reporte de ventas', async () => {
      const { desde, hasta } = rangoReportes();
      const resumen = await DB.resumenRango(desde, hasta);
      const productos = await DB.masVendidos(desde, hasta, 15);
      return Reportes.ventas(resumen, estado.cfg, { productos });
    });

    $('#btnPDFHoras').onclick = () => generar('el reporte por hora', async () => {
      const { desde, hasta } = rangoReportes();
      const datos = await DB.ventasPorHora(desde, hasta);
      return Reportes.porHora(datos, estado.cfg, desde, hasta);
    });

    $('#btnPDFSemanal').onclick = () => generar('el acumulado semanal', async () => {
      const { desde, hasta } = rangoReportes();
      return Reportes.acumulado(await DB.resumenRango(desde, hasta), estado.cfg, 'semana');
    });

    $('#btnPDFMensual').onclick = () => generar('el acumulado mensual', async () => {
      const { desde, hasta } = rangoReportes();
      return Reportes.acumulado(await DB.resumenRango(desde, hasta), estado.cfg, 'mes');
    });

    $('#btnPDFFiados').onclick = () => generar('el reporte de fiados', async () =>
      Reportes.fiados(await DB.creditosPendientes(), estado.cfg));

    $('#btnPDFCorte').onclick = () => generar('el corte de caja', async () => {
      const cortes = (await DB.jornadasRecientes(10)).filter((j) => !j.abierta);
      if (!cortes.length) { aviso('Todavía no has cerrado ningún día', 'error'); return null; }
      return Reportes.corteCaja(cortes[0], estado.cfg);
    });
  }

  /* ===================== avisos con sonido ===================== */

  let yaSono = false;

  /** El navegador solo deja sonar después de que el usuario toca algo. */
  function prepararSonidoDeAvisos() {
    const alPrimerToque = () => {
      Escaner.prepararAudio();
      if (!yaSono && estado.alertas.total > 0 && estado.cfg.sonido !== false) {
        yaSono = true;
        Escaner.campana();
        aviso('Tienes ' + estado.alertas.total + ' aviso(s): toca la campana 🔔');
      }
      document.removeEventListener('pointerdown', alPrimerToque);
    };
    document.addEventListener('pointerdown', alPrimerToque);
  }

  /** Cada media hora revisa si ya venció un cobro o se acerca una visita. */
  function revisarAvisosPeriodicamente() {
    setInterval(async () => {
      const antes = estado.alertas.total;
      estado.alertas = await DB.alertas();
      App.pintarAlertas();
      if (estado.alertas.total > antes && estado.cfg.sonido !== false) {
        Escaner.campana();
        aviso('Tienes avisos nuevos 🔔');
      }
    }, 30 * 60 * 1000);
  }

  /* ===================== instalación en el celular ===================== */

  const esIPhone = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function yaInstalada() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
  }

  let eventoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    pintarInstalar();
  });

  /** Explica cómo instalarla según el celular (Android e iPhone son distintos). */
  function pintarInstalar() {
    const cont = $('#panelInstalar');
    if (!cont) return;

    if (yaInstalada()) {
      cont.innerHTML = '<h2>📲 Instalación</h2>' +
        '<p class="ayuda">✅ Ya está instalada en este celular: se abre desde su icono y funciona sin internet.</p>';
      return;
    }

    if (esIPhone) {
      cont.innerHTML = '<h2>📲 Instalar en tu iPhone</h2>' +
        '<p class="ayuda">Hazlo desde <b>Safari</b> (en iPhone solo Safari la instala bien):</p>' +
        '<ul class="lista-simple">' +
          '<li><span>1. Toca <b>Compartir</b> (el cuadrito con la flecha ↑, abajo)</span></li>' +
          '<li><span>2. Baja y toca <b>Agregar a inicio</b></span></li>' +
          '<li><span>3. Toca <b>Agregar</b> y ábrela desde su icono</span></li>' +
        '</ul>' +
        '<p class="ayuda" style="margin-top:10px">⚠️ En iPhone es <b>importante</b> abrirla siempre desde el icono: si la usas dentro de Safari y pasas varios días sin entrar, el sistema puede borrar los datos guardados. Instalada, no.</p>';
      return;
    }

    if (eventoInstalar) {
      cont.innerHTML = '<h2>📲 Instalar en el celular</h2>' +
        '<p class="ayuda">Queda con su icono y abre sin internet, como cualquier app.</p>' +
        '<button class="btn-principal" id="btnInstalarApp">Instalar app</button>';
      $('#btnInstalarApp').onclick = async () => {
        eventoInstalar.prompt();
        await eventoInstalar.userChoice;
        eventoInstalar = null;
        pintarInstalar();
      };
      return;
    }

    cont.innerHTML = '<h2>📲 Instalar en el celular</h2>' +
      '<p class="ayuda">Desde <b>Chrome</b>: menú <b>⋮</b> → <b>Agregar a pantalla principal</b>. ' +
      'Queda con su icono y abre sin internet.</p>';
  }

  /* ===================== protección de los datos ===================== */

  /**
   * Le pide al sistema que marque los datos como "persistentes": así el
   * navegador no los borra para hacer espacio, ni por dejar de usar la app
   * unos días. Los navegadores lo conceden sobre todo si la app está
   * instalada en la pantalla de inicio.
   */
  async function protegerDatos(pedirlo) {
    if (!navigator.storage || !navigator.storage.persist) return null;
    try {
      let protegido = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (!protegido && pedirlo !== false) protegido = await navigator.storage.persist();
      return protegido;
    } catch (e) { return null; }
  }

  function tamanoLegible(bytes) {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? Math.round(bytes / 1024) + ' KB' : (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  /** Muestra en Ajustes si los datos están a salvo y cuánto espacio usan. */
  async function pintarAlmacen() {
    const el = $('#estadoAlmacen');
    const boton = $('#btnProteger');
    if (!el) return;

    const protegido = await protegerDatos(false);
    let uso = '';
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (e && e.usage) uso = ' · ocupan ' + tamanoLegible(e.usage);
      }
    } catch (e) {}

    if (protegido === true) {
      el.innerHTML = '🔒 <b>Datos protegidos</b>: el sistema no los va a borrar solo' + uso + '.';
      if (boton) boton.hidden = true;
    } else if (protegido === false) {
      el.innerHTML = '⚠️ <b>Datos sin proteger</b>: si el celular se queda sin espacio, o pasas ' +
        'muchos días sin abrir la app, el sistema podría borrarlos' + uso + '. ' +
        'Instálala en la pantalla de inicio y toca el botón de abajo.';
      if (boton) boton.hidden = false;
    } else {
      el.innerHTML = 'Este navegador no informa el estado del almacenamiento' + uso +
        '. Respalda seguido para no depender de eso.';
      if (boton) boton.hidden = true;
    }
  }
  App.pintarAlmacen = pintarAlmacen;

  /* ===================== versión y actualizaciones ===================== */

  /** Deja a la vista qué versión trae el celular: sirve para no adivinar. */
  function pintarVersion() {
    const modo = (estado.cfg && estado.cfg.precisionEscaner) || 'normal';
    const exigencia = Math.round(Escaner.ajustes.minAncho * 100);
    const v = 'v' + App.VERSION;
    const el = (sel, texto) => { const e = $(sel); if (e) e.textContent = texto; };
    el('#versionApp', v);
    el('#versionEscaner', modo + ' · ' + exigencia + '%');
    el('#cajonPie', 'Funciona sin internet · ' + v);
    el('#pieVersion', 'Inventario de abarrotes · ' + v + ' · ' + App.FECHA_VERSION);
  }
  App.pintarVersion = pintarVersion;
  App.pintarInstalar = pintarInstalar;

  async function buscarActualizacion() {
    const estadoEl = $('#estadoActualizacion');
    if (!('serviceWorker' in navigator)) {
      estadoEl.textContent = 'Este navegador no guarda la app para usarla sin internet.';
      return;
    }
    estadoEl.textContent = 'Buscando…';
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      if (!registro) { estadoEl.textContent = 'Abre la app desde su icono para poder actualizarla.'; return; }
      await registro.update();
      await new Promise((r) => setTimeout(r, 2500));
      if (registro.installing || registro.waiting) {
        estadoEl.textContent = 'Descargando la versión nueva… en un momento se recarga sola.';
      } else {
        estadoEl.textContent = 'Ya tienes la última versión (v' + App.VERSION + ').';
      }
    } catch (e) {
      estadoEl.textContent = 'No se pudo revisar: ' + e.message;
    }
  }

  /* ===================== actualizaciones ===================== */

  /**
   * Registra el service worker y busca versiones nuevas al abrir la app.
   * Sin este "update()" el navegador puede tardar días en darse cuenta de
   * que hay una versión nueva, porque sirve todo desde su copia guardada.
   *
   * Importante: actualizar cambia SOLO el programa. Los productos, ventas,
   * fiados y ajustes viven en la base de datos del celular y no se tocan.
   */
  function prepararActualizaciones() {
    navigator.serviceWorker.register('sw.js').then((registro) => {
      registro.update().catch(() => {});
      // Y cada media hora, por si la tienda deja la app abierta todo el día.
      setInterval(() => registro.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});

    // La primera vez que se instala también avisa "controllerchange", y eso
    // no es una actualización: solo cuenta si ya había una versión mandando.
    let habiaVersion = !!navigator.serviceWorker.controller;
    let yaAvise = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaVersion) { habiaVersion = true; return; }
      if (yaAvise) return;
      yaAvise = true;
      const ocupado = estado.carrito.length > 0 || !$('#modal').classList.contains('oculto');
      if (ocupado) {
        // En media venta no se recarga sola: se avisa y ya.
        aviso('Hay una versión nueva lista: ciérrala y ábrela cuando termines');
      } else {
        aviso('Actualizando la app…', 'exito');
        setTimeout(() => location.reload(), 900);
      }
    });
  }

  /* ===================== arranque ===================== */

  async function iniciar() {
    await DB.abrir();
    estado.cfg = await DB.getConfig();
    Escaner.configurar(estado.cfg);
    $('#nombreTienda').textContent = estado.cfg.tienda;
    $('#cajonTienda').textContent = estado.cfg.tienda;
    $('#umbralPDF').value = estado.cfg.umbralCompraDefault;

    App.conectarNavegacion();
    App.conectarVenta();
    App.conectarInventario();
    App.conectarGestion();
    conectarReportes();
    $('#btnBuscarActualizacion').onclick = buscarActualizacion;
    $('#btnProteger').onclick = async () => {
      const ok = await protegerDatos(true);
      await pintarAlmacen();
      App.aviso(ok ? 'Datos protegidos en este celular' : 'El sistema no lo concedió: instala la app desde su icono',
        ok ? 'exito' : 'error');
    };
    pintarVersion();
    pintarInstalar();

    await refrescar(false);
    await ir('inicio');
    protegerDatos(true);   // se pide al arrancar; el sistema decide

    prepararSonidoDeAvisos();
    revisarAvisosPeriodicamente();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Escaner.estaActivo()) Escaner.detener().then(App.pintarBotonesCamara);
    });

    if ('serviceWorker' in navigator) prepararActualizaciones();

    if (!window.isSecureContext) aviso('Abre la app con https:// para poder usar la cámara', 'error');
  }

  iniciar().catch((e) => aviso('Error al iniciar: ' + e.message, 'error'));
})();
