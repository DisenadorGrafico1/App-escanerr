/*
 * reportes.js — Genera los PDF (lista de compras, inventario y ventas).
 * jsPDF y su plugin de tablas viven en vendor/, así que también
 * funcionan sin internet.
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

  const VERDE = [22, 128, 92];
  const ROJO = [190, 45, 45];

  function dinero(n, moneda) {
    const v = (isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (moneda || '$') + v;
  }

  function fechaLarga(iso) {
    const d = iso ? new Date(iso + 'T12:00:00') : new Date();
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function encabezado(doc, cfg, titulo, subtitulo) {
    const ancho = doc.internal.pageSize.getWidth();
    doc.setFillColor.apply(doc, VERDE);
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
      doc.text('Inventario de abarrotes', 14, alto - 8);
    }
  }

  function nuevoDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  /* ---------------- Lista de compras para el proveedor ---------------- */

  /**
   * Productos con existencia MENOR O IGUAL al umbral (ej. "menos de 15").
   * Es la lista que te llevas con el proveedor.
   */
  async function listaCompras(productos, cfg, opciones) {
    await prepararPDF();
    const umbral = Number(opciones.umbral);
    const categoria = opciones.categoria || '';
    const moneda = cfg.moneda || '$';

    let lista = productos.filter((p) => Number(p.stock) <= umbral);
    if (categoria) lista = lista.filter((p) => p.categoria === categoria);
    lista.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es')
      || Number(a.stock) - Number(b.stock));

    const doc = nuevoDoc();
    const sub = 'Productos con ' + umbral + ' piezas o menos'
      + (categoria ? ' · Categoría: ' + categoria : ' · Todas las categorías');
    let y = encabezado(doc, cfg, 'Lista de compras para proveedor', sub);

    if (!lista.length) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('¡Todo bien! Ningún producto está por debajo de ' + umbral + ' piezas.', 14, y + 8);
      pieDePagina(doc);
      return { doc, lista, nombre: 'lista-compras.pdf' };
    }

    const filas = lista.map((p) => {
      const objetivo = Number(p.objetivo) > 0 ? Number(p.objetivo) : umbral;
      const sugerido = Math.max(0, Math.ceil(objetivo - Number(p.stock)));
      return [
        p.codigo,
        p.nombre,
        p.categoria || '-',
        String(Number(p.stock)),
        String(Number(p.minimo) || 0),
        String(sugerido),
        dinero(Number(p.costo), moneda),
        dinero(sugerido * Number(p.costo), moneda)
      ];
    });

    const totalCompra = filas.reduce((s, f, i) => {
      const objetivo = Number(lista[i].objetivo) > 0 ? Number(lista[i].objetivo) : umbral;
      const sugerido = Math.max(0, Math.ceil(objetivo - Number(lista[i].stock)));
      return s + sugerido * Number(lista[i].costo);
    }, 0);
    const piezasSugeridas = filas.reduce((s, f) => s + Number(f[5]), 0);

    doc.autoTable({
      startY: y + 4,
      head: [['Código', 'Producto', 'Categoría', 'Quedan', 'Mínimo', 'Comprar', 'Costo', 'Subtotal']],
      body: filas,
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 248, 246] },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 48 },
        2: { cellWidth: 25 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'center', cellWidth: 17, fontStyle: 'bold' },
        6: { halign: 'right', cellWidth: 18 },
        7: { halign: 'right', cellWidth: 20 }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const p = lista[data.row.index];
          if (Number(p.stock) <= Number(p.minimo)) {
            data.cell.styles.textColor = ROJO;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      foot: [['', '', 'TOTALES', '', '', String(piezasSugeridas), '', dinero(totalCompra, moneda)]],
      footStyles: { fillColor: [230, 238, 234], textColor: 30, fontStyle: 'bold' }
    });

    const yFin = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Productos a reabastecer: ' + lista.length
      + '  ·  Piezas sugeridas: ' + piezasSugeridas
      + '  ·  Inversión estimada: ' + dinero(totalCompra, moneda), 14, yFin);
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text('"Comprar" se calcula con la cantidad ideal de cada producto; si no la definiste, se usa el umbral de ' + umbral + '.', 14, yFin + 5);

    pieDePagina(doc);
    return { doc, lista, nombre: 'lista-compras-' + DB.hoy() + '.pdf' };
  }

  /* ---------------- Inventario completo ---------------- */

  async function inventario(productos, cfg, opciones = {}) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    let lista = productos.slice();
    if (opciones.categoria) lista = lista.filter((p) => p.categoria === opciones.categoria);
    if (opciones.soloConStock) lista = lista.filter((p) => Number(p.stock) > 0);
    lista.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es')
      || a.nombre.localeCompare(b.nombre, 'es'));

    const doc = nuevoDoc();
    const y = encabezado(doc, cfg, 'Inventario completo',
      (opciones.categoria ? 'Categoría: ' + opciones.categoria : 'Todas las categorías')
      + ' · ' + lista.length + ' productos');

    const filas = lista.map((p) => [
      p.codigo, p.nombre, p.categoria || '-',
      String(Number(p.stock)),
      dinero(Number(p.costo), moneda),
      dinero(Number(p.precio), moneda),
      dinero(Number(p.stock) * Number(p.costo), moneda),
      dinero(Number(p.stock) * Number(p.precio), moneda)
    ]);

    const inversion = lista.reduce((s, p) => s + Number(p.stock) * Number(p.costo), 0);
    const venta = lista.reduce((s, p) => s + Number(p.stock) * Number(p.precio), 0);
    const piezas = lista.reduce((s, p) => s + Number(p.stock), 0);

    doc.autoTable({
      startY: y + 4,
      head: [['Código', 'Producto', 'Categoría', 'Piezas', 'Costo', 'Precio', 'Invertido', 'Valor venta']],
      body: filas,
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: VERDE, textColor: 255 },
      alternateRowStyles: { fillColor: [244, 248, 246] },
      columnStyles: {
        0: { cellWidth: 26 }, 1: { cellWidth: 46 }, 2: { cellWidth: 24 },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'right', cellWidth: 17 }, 5: { halign: 'right', cellWidth: 17 },
        6: { halign: 'right', cellWidth: 21 }, 7: { halign: 'right', cellWidth: 21 }
      },
      foot: [['', '', 'TOTALES', String(piezas), '', '', dinero(inversion, moneda), dinero(venta, moneda)]],
      footStyles: { fillColor: [230, 238, 234], textColor: 30, fontStyle: 'bold' }
    });

    const yFin = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.text('Ganancia potencial si se vende todo: ' + dinero(venta - inversion, moneda), 14, yFin);
    pieDePagina(doc);
    return { doc, lista, nombre: 'inventario-' + DB.hoy() + '.pdf' };
  }

  /* ---------------- Reporte de ventas ---------------- */

  async function ventas(resumen, cfg, opciones = {}) {
    await prepararPDF();
    const moneda = cfg.moneda || '$';
    const doc = nuevoDoc();
    const mismoDia = resumen.desde === resumen.hasta;
    const sub = mismoDia ? fechaLarga(resumen.desde)
      : 'Del ' + fechaLarga(resumen.desde) + ' al ' + fechaLarga(resumen.hasta);
    let y = encabezado(doc, cfg, 'Reporte de ventas', sub);

    doc.autoTable({
      startY: y + 4,
      head: [['Día', 'Tickets', 'Piezas', 'Vendido', 'Costo', 'Ganancia']],
      body: resumen.dias.map((d) => [
        d.dia, String(d.tickets), String(d.piezas),
        dinero(d.total, moneda), dinero(d.costo, moneda), dinero(d.ganancia, moneda)
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: VERDE, textColor: 255 },
      columnStyles: {
        1: { halign: 'center' }, 2: { halign: 'center' },
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }
      },
      foot: [['TOTAL', String(resumen.tickets), String(resumen.piezas),
        dinero(resumen.total, moneda), dinero(resumen.costo, moneda), dinero(resumen.ganancia, moneda)]],
      footStyles: { fillColor: [230, 238, 234], textColor: 30, fontStyle: 'bold' }
    });

    if (opciones.productos && opciones.productos.length) {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Producto más vendido', 'Categoría', 'Piezas', 'Vendido', 'Ganancia']],
        body: opciones.productos.map((p) => [
          p.nombre, p.categoria || '-', String(p.piezas),
          dinero(p.total, moneda), dinero(p.ganancia, moneda)
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60], textColor: 255 },
        columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      });
    }

    pieDePagina(doc);
    return { doc, nombre: 'ventas-' + resumen.desde + (mismoDia ? '' : '_a_' + resumen.hasta) + '.pdf' };
  }

  /* ---------------- Guardar / compartir ---------------- */

  /** Descarga el PDF; si el celular lo permite, ofrece compartirlo. */
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

  return { listaCompras, inventario, ventas, guardar, dinero };
})();
