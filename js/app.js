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

    await refrescar(false);
    await ir('inicio');

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
