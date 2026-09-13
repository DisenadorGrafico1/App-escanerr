/*
 * reportes.js — Todos los PDF: lista de compras, inventario, ventas,
 * ventas por hora, acumulados, fiados, corte de caja y pedido a proveedor.
 * jsPDF vive en vendor/, así que también funciona sin internet.
 */
const Reportes = (() => {
  let listo = false;

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

  async function prepararPDF() {
    if (listo) return;
    await cargarScript('vendor/jspdf.umd.min.js');
    await cargarScript('vendor/jspdf.plugin.autotable.min.js');
    listo = true;
  }

  const MORADO = [91, 44, 145];
  const VERDE = [15, 157, 88];
  const ROJO = [198, 40, 40];
  const GRIS = [235, 232, 243];

  function dinero(n, moneda) {
    const v = (isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (moneda || '$') + v;
  }

  function fechaLarga(dia) {
    const d = dia ? new Date(dia + 'T12:00:00') : new Date();
    const t = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function nuevoDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  function encabezado(doc, cfg, titulo, subtitulo) {
    const ancho = doc.internal.pageSize.getWidth();
    doc.setFillColor.apply(doc, MORADO);
    doc.rect(0, 0, ancho, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(cfg.tienda || 'Mi tienda', 14, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(titulo, 14, 19);
    doc.setFontSize(8);
    doc.text('Generado: ' + new Date().toLocaleString('es-MX'), ancho - 14, 19, { align: 'right' });
    doc.setTextColor(40, 40, 40);
    if (subtitulo) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(subtitulo, 14, 35);
    }
    return subtitulo ? 40 : 32;
  }

  function pieDePagina(doc) {
    const paginas = doc.internal.getNumberOfPages();
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('Página ' + i + ' de ' + paginas, ancho - 14, alto - 8, { align: 'right' });
      doc.text('Mi Tienda · inventario y ventas', 14, alto - 8);
    }
  }

  function tabla(doc, opciones) {
    doc.autoTable(Object.assign({
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: MORADO, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 245, 252] },
      footStyles: { fillColor: GRIS, textColor: 30, fontStyle: 'bold' }
    }, opciones));
  }

  /* ---------------- lista de compras ---------------- */

  async function listaCompras(productos, cfg, opciones) {
    await prepararPDF();
    const umbral = Number(opciones.umbral);
    const categoria = opciones.categoria || '';
    const moneda = cfg.moneda || '$';

    let lista = productos.filter((p) => Number(p.stock) <= umbral);
    if (categoria) lista = lista.filter((p) => p.categoria === categoria);
    lista.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || Number(a.stock) - Number(b.stock));

    const doc = nuevoDoc();
    const sub = 'Productos con ' + umbral + ' o menos' + (categoria ? ' · Grupo: ' + categoria : ' · Todos los grupos');
    const y = encabezado(doc, cfg, 'Lista de compras para proveedor', sub);

    if (!lista.length) {
      doc.setFontSize(11);
      doc.text('¡Todo bien! Ningún producto está por debajo de ' + umbral + '.', 14, y + 8);
      pieDePagina(doc);
      return { doc, lista, nombre: 'lista-compras.pdf' };
    }

    const calc = lista.map((p) => {
      const objetivo = Number(p.objetivo) > 0 ? Number(p.objetivo) : umbral;
      const sugerido = Math.max(0, Math.ceil(objetivo - Number(p.stock)));
      return { p, sugerido, subtotal: sugerido * Number(p.costo) };
    });
    const totalCompra = calc.reduce((s, c) => s + c.subtotal, 0);
    const piezas = calc.reduce((s, c) => s + c.sugerido, 0);

    tabla(doc, {
      startY: y + 4,
      head: [['Código', 'Producto', 'Grupo', 'Quedan', 'Mínimo', 'Comprar', 'Costo', 'Subtotal']],
      body: calc.map(({ p, sugerido, subtotal }) => [
        p.codigo, p.nombre, p.categoria || '-', DB.existenciaTexto(p), String(Number(p.minimo) || 0),
        String(sugerido), dinero(Number(p.costo), moneda), dinero(subtotal, moneda)
      ]),
      columnStyles: {
        0: { cellWidth: 26 }, 1: { cellWidth: 46 }, 2: { cellWidth: 24 },
        3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'center', cellWidth: 14 },
        5: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
        6: { halign: 'right', cellWidth: 17 }, 7: { halign: 'right', cellWidth: 20 }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const p = calc[data.row.index].p;
          if (Number(p.stock) <= Number(p.minimo)) {
            data.cell.styles.textColor = ROJO;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      foot: [['', '', 'TOTALES', '', '', String(piezas), '', dinero(totalCompra, moneda)]]
    });

    const yFin = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.text('Productos a reabastecer: ' + lista.length + '  ·  Piezas sugeridas: ' + piezas +
      '  ·  Inversión estimada: ' + dinero(totalCompra, moneda), 14, yFin);
    pieDePagina(doc);
    return { doc, lista, nombre: 'lista-compras-' + DB.hoy() + '.pdf' };
  }

  /* ---------------- inventario ---------------- */

  async function inventario(productos, cfg, opciones = {}) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    let lista = productos.slice();
    if (opciones.categoria) lista = lista.filter((p) => p.categoria === opciones.categoria);
    lista.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));

    const doc = nuevoDoc();
    const y = encabezado(doc, cfg, 'Inventario completo',
      (opciones.categoria ? 'Grupo: ' + opciones.categoria : 'Todos los grupos') + ' · ' + lista.length + ' productos');

    const inversion = lista.reduce((s, p) => s + Number(p.stock) * Number(p.costo), 0);
    const venta = lista.reduce((s, p) => s + Number(p.stock) * Number(p.precio), 0);

    tabla(doc, {
      startY: y + 4,
      head: [['Código', 'Producto', 'Grupo', 'Existencia', 'Costo', 'Precio', 'Invertido', 'Valor venta']],
      body: lista.map((p) => [
        p.codigo, p.nombre, p.categoria || '-', DB.existenciaTexto(p),
        dinero(Number(p.costo), moneda), dinero(Number(p.precio), moneda),
        dinero(Number(p.stock) * Number(p.costo), moneda),
        dinero(Number(p.stock) * Number(p.precio), moneda)
      ]),
      columnStyles: {
        0: { cellWidth: 26 }, 1: { cellWidth: 44 }, 2: { cellWidth: 22 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 16 }, 5: { halign: 'right', cellWidth: 16 },
        6: { halign: 'right', cellWidth: 20 }, 7: { halign: 'right', cellWidth: 20 }
      },
      foot: [['', '', 'TOTALES', '', '', '', dinero(inversion, moneda), dinero(venta, moneda)]]
    });

    const yFin = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.text('Ganancia potencial si se vende todo: ' + dinero(venta - inversion, moneda), 14, yFin);
    pieDePagina(doc);
    return { doc, lista, nombre: 'inventario-' + DB.hoy() + '.pdf' };
  }

  /* ---------------- ventas del periodo ---------------- */

  async function ventas(resumen, cfg, opciones = {}) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    const doc = nuevoDoc();
    const mismoDia = resumen.desde === resumen.hasta;
    const sub = mismoDia ? fechaLarga(resumen.desde)
      : 'Del ' + fechaLarga(resumen.desde) + ' al ' + fechaLarga(resumen.hasta);
    const y = encabezado(doc, cfg, 'Reporte de ventas', sub);

    tabla(doc, {
      startY: y + 4,
      head: [['Día', 'Tickets', 'Artículos', 'Vendido', 'Fiado', 'Costo', 'Ganancia']],
      body: resumen.dias.map((d) => [
        d.dia, String(d.tickets), String(Math.round(d.piezas * 100) / 100),
        dinero(d.total, moneda), dinero(d.credito, moneda), dinero(d.costo, moneda), dinero(d.ganancia, moneda)
      ]),
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      foot: [['TOTAL', String(resumen.tickets), String(Math.round(resumen.piezas * 100) / 100),
        dinero(resumen.total, moneda), dinero(resumen.credito, moneda), dinero(resumen.costo, moneda), dinero(resumen.ganancia, moneda)]]
    });

    if (opciones.productos && opciones.productos.length) {
      tabla(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Producto más vendido', 'Grupo', 'Cantidad', 'Vendido', 'Ganancia']],
        body: opciones.productos.map((p) => [
          p.nombre, p.categoria || '-', String(Math.round(p.piezas * 100) / 100),
          dinero(p.total, moneda), dinero(p.ganancia, moneda)
        ]),
        headStyles: { fillColor: [60, 60, 60], textColor: 255 },
        columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      });
    }
    pieDePagina(doc);
    return { doc, nombre: 'ventas-' + resumen.desde + (mismoDia ? '' : '_a_' + resumen.hasta) + '.pdf' };
  }

  /* ---------------- ventas por hora ---------------- */

  async function porHora(datos, cfg, desde, hasta) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    const doc = nuevoDoc();
    const sub = desde === hasta ? fechaLarga(desde) : 'Del ' + fechaLarga(desde) + ' al ' + fechaLarga(hasta);
    let y = encabezado(doc, cfg, 'Ventas por hora · ¿cuándo hay más clientes?', sub);

    if (!datos.conVentas.length) {
      doc.setFontSize(11);
      doc.text('No hay ventas en este periodo.', 14, y + 8);
      pieDePagina(doc);
      return { doc, nombre: 'ventas-por-hora.pdf' };
    }

    // Gráfica de barras dibujada a mano.
    const max = Math.max.apply(null, datos.horas.map((h) => h.total)) || 1;
    const x0 = 16, ancho = 170, altoMax = 42;
    const primera = Math.min.apply(null, datos.conVentas.map((h) => h.hora));
    const ultima = Math.max.apply(null, datos.conVentas.map((h) => h.hora));
    const n = ultima - primera + 1;
    const anchoBarra = Math.min(12, ancho / n - 2);
    doc.setFontSize(7);
    for (let i = 0; i < n; i++) {
      const h = datos.horas[primera + i];
      const alto = (h.total / max) * altoMax;
      const x = x0 + i * (ancho / n);
      const esPico = datos.masGente && datos.masGente.hora === h.hora;
      doc.setFillColor.apply(doc, esPico ? [217, 119, 6] : MORADO);
      doc.rect(x, y + altoMax - alto + 4, anchoBarra, Math.max(0.6, alto), 'F');
      doc.setTextColor(110, 110, 110);
      doc.text(String(h.hora), x + anchoBarra / 2, y + altoMax + 9, { align: 'center' });
    }
    doc.setTextColor(40, 40, 40);
    y += altoMax + 16;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Más clientes: ' + datos.masGente.hora + ':00 a ' + (datos.masGente.hora + 1) + ':00 (' +
      datos.masGente.tickets + ' ventas)', 14, y);
    doc.text('Más dinero: ' + datos.mejor.hora + ':00 a ' + (datos.mejor.hora + 1) + ':00 (' +
      dinero(datos.mejor.total, moneda) + ')', 14, y + 6);
    doc.setFont('helvetica', 'normal');

    tabla(doc, {
      startY: y + 11,
      head: [['Horario', 'Ventas (tickets)', 'Artículos', 'Dinero', 'Ganancia', '% del día']],
      body: datos.conVentas.map((h) => [
        h.hora + ':00 a ' + (h.hora + 1) + ':00', String(h.tickets), String(Math.round(h.piezas * 100) / 100),
        dinero(h.total, moneda), dinero(h.ganancia, moneda),
        (datos.total ? Math.round((h.total / datos.total) * 100) : 0) + '%'
      ]),
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
      foot: [['TOTAL', String(datos.tickets), '', dinero(datos.total, moneda), '', '100%']]
    });
    pieDePagina(doc);
    return { doc, nombre: 'ventas-por-hora-' + desde + '.pdf' };
  }

  /* ---------------- acumulados semanal y mensual ---------------- */

  function claveSemana(dia) {
    const d = new Date(dia + 'T12:00:00');
    const jueves = new Date(d);
    jueves.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const primero = new Date(jueves.getFullYear(), 0, 4);
    const semana = 1 + Math.round(((jueves - primero) / 86400000 - 3 + ((primero.getDay() + 6) % 7)) / 7);
    return jueves.getFullYear() + '-S' + String(semana).padStart(2, '0');
  }

  async function acumulado(resumen, cfg, periodo) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    const esSemana = periodo === 'semana';
    const grupos = {};
    resumen.dias.forEach((d) => {
      const clave = esSemana ? claveSemana(d.dia) : d.dia.slice(0, 7);
      if (!grupos[clave]) grupos[clave] = { clave, dias: 0, tickets: 0, total: 0, costo: 0, ganancia: 0, credito: 0, desde: d.dia, hasta: d.dia };
      const g = grupos[clave];
      g.dias += 1;
      g.tickets += d.tickets;
      g.total += d.total;
      g.costo += d.costo;
      g.ganancia += d.ganancia;
      g.credito += d.credito;
      if (d.dia < g.desde) g.desde = d.dia;
      if (d.dia > g.hasta) g.hasta = d.dia;
    });
    const filas = Object.values(grupos).sort((a, b) => a.clave.localeCompare(b.clave));

    const doc = nuevoDoc();
    const y = encabezado(doc, cfg,
      esSemana ? 'Acumulado semanal' : 'Acumulado mensual',
      'Del ' + fechaLarga(resumen.desde) + ' al ' + fechaLarga(resumen.hasta));

    tabla(doc, {
      startY: y + 4,
      head: [[esSemana ? 'Semana' : 'Mes', 'Del', 'Al', 'Días', 'Tickets', 'Vendido', 'Ganancia', 'Promedio diario']],
      body: filas.map((g) => [
        g.clave, g.desde, g.hasta, String(g.dias), String(g.tickets),
        dinero(g.total, moneda), dinero(g.ganancia, moneda), dinero(g.total / g.dias, moneda)
      ]),
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      foot: [['TOTAL', resumen.desde, resumen.hasta, String(resumen.dias.length), String(resumen.tickets),
        dinero(resumen.total, moneda), dinero(resumen.ganancia, moneda),
        dinero(resumen.dias.length ? resumen.total / resumen.dias.length : 0, moneda)]]
    });

    const yFin = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    const mejor = filas.slice().sort((a, b) => b.total - a.total)[0];
    if (mejor) doc.text('Mejor ' + (esSemana ? 'semana' : 'mes') + ': ' + mejor.clave + ' con ' + dinero(mejor.total, moneda), 14, yFin);
    pieDePagina(doc);
    return { doc, nombre: 'acumulado-' + periodo + '-' + resumen.desde + '.pdf' };
  }

  /* ---------------- fiados ---------------- */

  async function fiados(creditos, cfg) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    const doc = nuevoDoc();
    const total = creditos.reduce((s, c) => s + Number(c.saldo), 0);
    const y = encabezado(doc, cfg, 'Fiados pendientes de cobro',
      creditos.length + ' fiado(s) · ' + dinero(total, moneda) + ' por cobrar');

    if (!creditos.length) {
      doc.setFontSize(11);
      doc.text('¡Nadie te debe! No hay fiados pendientes.', 14, y + 8);
      pieDePagina(doc);
      return { doc, nombre: 'fiados.pdf' };
    }

    const hoy = DB.hoy();
    tabla(doc, {
      startY: y + 4,
      head: [['Cliente', 'Teléfono', 'Fiado el', 'Debe pagar', 'Total', 'Abonado', 'Debe']],
      body: creditos.map((c) => [
        c.nombre, c.telefono || '-', c.dia, c.fechaPago || '-',
        dinero(c.total, moneda),
        dinero(Number(c.total) - Number(c.saldo), moneda),
        dinero(c.saldo, moneda)
      ]),
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const c = creditos[data.row.index];
          if (c.fechaPago && c.fechaPago < hoy) {
            data.cell.styles.textColor = ROJO;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      foot: [['TOTAL', '', '', '', '', '', dinero(total, moneda)]]
    });
    const yFin = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text('Las fechas en rojo ya se vencieron.', 14, yFin);
    pieDePagina(doc);
    return { doc, nombre: 'fiados-' + DB.hoy() + '.pdf' };
  }

  /* ---------------- corte de caja ---------------- */

  async function corteCaja(jornada, cfg) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    const doc = nuevoDoc();
    const y = encabezado(doc, cfg, 'Corte de caja', fechaLarga(jornada.dia));

    const cuadra = Math.abs(Number(jornada.diferencia)) < 0.01;
    tabla(doc, {
      startY: y + 4,
      head: [['Concepto', 'Monto']],
      body: [
        ['Fondo inicial de caja', dinero(jornada.fondoInicial, moneda)],
        ['Ventas en efectivo', dinero(jornada.totalEfectivo, moneda)],
        ['Abonos de fiados cobrados', dinero(jornada.totalAbonos, moneda)],
        ['Vendido a crédito (no entró dinero)', dinero(jornada.totalCredito, moneda)],
        ['Debía haber en caja', dinero(jornada.esperadoEnCaja, moneda)],
        ['Efectivo contado', dinero(jornada.efectivoContado, moneda)],
        [cuadra ? 'Diferencia (cuadró)' : (jornada.diferencia > 0 ? 'Diferencia (sobró)' : 'Diferencia (faltó)'),
          dinero(jornada.diferencia, moneda)],
        ['Tickets del día', String(jornada.tickets || 0)],
        ['Total vendido', dinero(jornada.totalVendido, moneda)],
        ['Ganancia del día', dinero(jornada.ganancia, moneda)]
      ],
      columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 6) {
          data.cell.styles.textColor = cuadra ? VERDE : ROJO;
        }
      }
    });

    let yFin = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(9);
    doc.text('Abrió: ' + new Date(jornada.apertura).toLocaleString('es-MX'), 14, yFin);
    if (jornada.cierre) doc.text('Cerró: ' + new Date(jornada.cierre).toLocaleString('es-MX'), 14, yFin + 5);
    if (jornada.notaCierre) doc.text('Nota: ' + jornada.notaCierre, 14, yFin + 10);
    yFin += 22;
    doc.setDrawColor(160, 160, 160);
    doc.line(20, yFin + 10, 85, yFin + 10);
    doc.line(110, yFin + 10, 175, yFin + 10);
    doc.setFontSize(8);
    doc.text('Entrega', 42, yFin + 15);
    doc.text('Recibe', 137, yFin + 15);
    pieDePagina(doc);
    return { doc, nombre: 'corte-caja-' + jornada.dia + '.pdf' };
  }

  /* ---------------- pedido a proveedor ---------------- */

  async function pedidoProveedor(evento, pedido, cfg) {
    await prepararPDF();
    const doc = nuevoDoc();
    const y = encabezado(doc, cfg, 'Pedido a proveedor',
      evento.titulo + ' · ' + fechaLarga(evento.fecha) + (evento.hora ? ' ' + evento.hora : ''));

    if (!pedido.length) {
      doc.setFontSize(11);
      doc.text('No hay productos por pedir a este proveedor.', 14, y + 8);
      pieDePagina(doc);
      return { doc, nombre: 'pedido.pdf' };
    }

    tabla(doc, {
      startY: y + 4,
      head: [['Producto', 'Código', 'Quedan', 'Pedir', 'Recibido ✓']],
      body: pedido.map((i) => [i.nombre, i.codigo, String(i.quedan), String(i.sugerido), '']),
      columnStyles: {
        0: { cellWidth: 70 }, 1: { cellWidth: 32 },
        2: { halign: 'center', cellWidth: 20 }, 3: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
        4: { cellWidth: 30 }
      }
    });
    if (evento.nota) {
      doc.setFontSize(9);
      doc.text('Nota: ' + evento.nota, 14, doc.lastAutoTable.finalY + 8);
    }
    pieDePagina(doc);
    return { doc, nombre: 'pedido-' + evento.fecha + '.pdf' };
  }

  /* ---------------- guardar / compartir ---------------- */

  async function guardar(doc, nombre, compartir) {
    if (compartir && navigator.canShare) {
      try {
        const blob = doc.output('blob');
        const archivo = new File([blob], nombre, { type: 'application/pdf' });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], title: nombre });
          return 'compartido';
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
      }
    }
    doc.save(nombre);
    return 'descargado';
  }

  return { listaCompras, inventario, ventas, porHora, acumulado, fiados, corteCaja, pedidoProveedor, guardar, dinero };
})();
