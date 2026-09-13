/*
 * db.js — Todos los datos de la tienda, guardados dentro del celular (IndexedDB).
 *
 * Guarda: productos (por pieza, por peso o por paquete), ventas, créditos de
 * clientes, proveedores, agenda de visitas y cortes del día.
 */
const DB = (() => {
  const NOMBRE = 'tienda-abarrotes';
  const VERSION = 2;
  let db = null;

  const CONFIG_DEFAULT = {
    tienda: 'Mi tienda de abarrotes',
    moneda: '$',
    minimoDefault: 5,
    umbralCompraDefault: 15,
    sonido: true,
    vibrar: true,
    permitirNegativo: true,
    precisionEscaner: 'normal',
    leerITF: false,
    diasCreditoDefault: 7,
    avisarVisitaDias: 2,
    categorias: [
      'Abarrotes', 'Bebidas', 'Botanas', 'Cigarros', 'Dulces', 'Lácteos',
      'Limpieza', 'Higiene personal', 'Enlatados', 'Pan y galletas',
      'Frutas y verduras', 'Cremería', 'Otros'
    ]
  };

  /* ===================== apertura y utilidades ===================== */

  function abrir() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = (ev) => {
        const d = ev.target.result;
        const tx = ev.target.transaction;

        if (!d.objectStoreNames.contains('productos')) {
          const s = d.createObjectStore('productos', { keyPath: 'codigo' });
          s.createIndex('categoria', 'categoria', { unique: false });
          s.createIndex('nombre', 'nombre', { unique: false });
        }
        if (!d.objectStoreNames.contains('ventas')) {
          const s = d.createObjectStore('ventas', { keyPath: 'id', autoIncrement: true });
          s.createIndex('dia', 'dia', { unique: false });
        }
        if (!d.objectStoreNames.contains('movimientos')) {
          const s = d.createObjectStore('movimientos', { keyPath: 'id', autoIncrement: true });
          s.createIndex('dia', 'dia', { unique: false });
          s.createIndex('codigo', 'codigo', { unique: false });
          s.createIndex('ventaId', 'ventaId', { unique: false });
        }
        if (!d.objectStoreNames.contains('config')) {
          d.createObjectStore('config', { keyPath: 'k' });
        }

        /* ---- versión 2 ---- */
        if (!d.objectStoreNames.contains('clientes')) {
          const s = d.createObjectStore('clientes', { keyPath: 'id', autoIncrement: true });
          s.createIndex('nombre', 'nombre', { unique: false });
        }
        if (!d.objectStoreNames.contains('creditos')) {
          const s = d.createObjectStore('creditos', { keyPath: 'id', autoIncrement: true });
          s.createIndex('clienteId', 'clienteId', { unique: false });
          s.createIndex('pagado', 'pagadoTxt', { unique: false });
          s.createIndex('fechaPago', 'fechaPago', { unique: false });
        }
        if (!d.objectStoreNames.contains('proveedores')) {
          const s = d.createObjectStore('proveedores', { keyPath: 'id', autoIncrement: true });
          s.createIndex('nombre', 'nombre', { unique: false });
        }
        if (!d.objectStoreNames.contains('agenda')) {
          const s = d.createObjectStore('agenda', { keyPath: 'id', autoIncrement: true });
          s.createIndex('fecha', 'fecha', { unique: false });
          s.createIndex('tipo', 'tipo', { unique: false });
        }
        if (!d.objectStoreNames.contains('jornadas')) {
          const s = d.createObjectStore('jornadas', { keyPath: 'id', autoIncrement: true });
          s.createIndex('dia', 'dia', { unique: false });
        }

        // Los productos que ya existían pasan a ser "por pieza".
        if (ev.oldVersion >= 1 && tx) {
          const osP = tx.objectStore('productos');
          osP.openCursor().onsuccess = (e) => {
            const cur = e.target.result;
            if (!cur) return;
            const p = cur.value;
            if (!p.tipoVenta) {
              p.tipoVenta = 'pieza';
              p.unidad = p.unidad || 'pieza';
              p.piezasPorPaquete = 1;
              p.sinCodigo = false;
              cur.update(p);
            }
            cur.continue();
          };
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function pedir(peticion) {
    return new Promise((resolve, reject) => {
      peticion.onsuccess = () => resolve(peticion.result);
      peticion.onerror = () => reject(peticion.error || new Error('No se pudo leer el dato'));
    });
  }

  function cerrarTx(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar'));
      tx.onabort = () => reject(tx.error || new Error('Operación cancelada'));
    });
  }

  async function store(nombre, modo = 'readonly') {
    const d = await abrir();
    const tx = d.transaction(nombre, modo);
    return { tx, os: tx.objectStore(nombre) };
  }

  async function leerTodo(nombre) {
    const { os } = await store(nombre);
    return pedir(os.getAll());
  }

  async function guardarEn(nombre, registro) {
    const { tx, os } = await store(nombre, 'readwrite');
    // put inserta si no existe y actualiza si ya existía, en cualquier almacén
    // (en los de id automático, sin id genera uno nuevo).
    const req = os.put(registro);
    let id = null;
    req.onsuccess = () => { id = req.result; };
    await cerrarTx(tx);
    return Object.assign({}, registro, { id: registro.id || id });
  }

  async function borrarEn(nombre, id) {
    const { tx, os } = await store(nombre, 'readwrite');
    os.delete(id);
    await cerrarTx(tx);
  }

  function p2(n) { return String(n).padStart(2, '0'); }

  function hoy() {
    const d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function diaDe(fecha) {
    const d = new Date(fecha);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function sumarDias(dia, n) {
    const d = new Date(dia + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return diaDe(d);
  }

  function num(v, def = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : def;
  }

  /* ===================== configuración ===================== */

  let cacheConfig = null;

  async function getConfig() {
    if (cacheConfig) return cacheConfig;
    const filas = await leerTodo('config');
    const cfg = Object.assign({}, CONFIG_DEFAULT);
    filas.forEach((f) => { cfg[f.k] = f.v; });
    cacheConfig = cfg;
    return cfg;
  }

  async function setConfig(clave, valor) {
    const { tx, os } = await store('config', 'readwrite');
    os.put({ k: clave, v: valor });
    await cerrarTx(tx);
    if (cacheConfig) cacheConfig[clave] = valor;
    return valor;
  }

  /* ===================== productos ===================== */

  /**
   * Un producto puede venderse de tres formas:
   *  - 'pieza'   : normal, de una en una.
   *  - 'peso'    : a granel; el stock se lleva en kilos.
   *  - 'paquete' : se compra por caja y se vende por caja O por pieza suelta.
   *                El stock siempre se guarda en PIEZAS sueltas, así las
   *                cuentas salen solas: vender una caja resta N piezas y
   *                cada N piezas sueltas vendidas equivalen a una caja.
   */
  async function getProducto(codigo) {
    const { os } = await store('productos');
    return pedir(os.get(String(codigo)));
  }

  async function todosProductos() {
    const lista = await leerTodo('productos');
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  /** Código interno para lo que no trae código de barras (fruta, granel…). */
  async function siguienteCodigoInterno() {
    const lista = await todosProductos();
    let max = 0;
    lista.forEach((p) => {
      const m = /^SC-(\d+)$/.exec(p.codigo);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'SC-' + String(max + 1).padStart(4, '0');
  }

  async function guardarProducto(p) {
    const cfg = await getConfig();
    const previo = await getProducto(p.codigo);
    const tipoVenta = p.tipoVenta || (previo && previo.tipoVenta) || 'pieza';
    const piezasPorPaquete = tipoVenta === 'paquete'
      ? Math.max(1, Math.round(num(p.piezasPorPaquete, previo ? previo.piezasPorPaquete : 1))) : 1;

    const prod = {
      codigo: String(p.codigo).trim(),
      nombre: (p.nombre || '').trim() || 'Sin nombre',
      categoria: p.categoria || 'Otros',
      tipoVenta: tipoVenta,
      unidad: tipoVenta === 'peso' ? (p.unidad || 'kg') : 'pieza',
      sinCodigo: p.sinCodigo !== undefined ? !!p.sinCodigo : !!(previo && previo.sinCodigo),
      piezasPorPaquete: piezasPorPaquete,
      // Precios y costos siempre en UNIDAD BASE (pieza suelta o kilo).
      costo: num(p.costo, previo ? previo.costo : 0),
      precio: num(p.precio, previo ? previo.precio : 0),
      // Para paquetes se guarda además el precio/costo de la caja completa.
      costoPaquete: num(p.costoPaquete, previo ? previo.costoPaquete : 0),
      precioPaquete: num(p.precioPaquete, previo ? previo.precioPaquete : 0),
      stock: num(p.stock, previo ? previo.stock : 0),
      minimo: num(p.minimo, previo ? previo.minimo : cfg.minimoDefault),
      objetivo: num(p.objetivo, previo ? previo.objetivo : 0),
      proveedorId: p.proveedorId !== undefined ? p.proveedorId : (previo ? previo.proveedorId : null),
      nota: p.nota !== undefined ? p.nota : (previo ? previo.nota : ''),
      invertido: previo ? num(previo.invertido) : 0,
      creado: previo ? previo.creado : new Date().toISOString(),
      actualizado: new Date().toISOString()
    };
    return guardarEn('productos', prod).then(() => prod);
  }

  async function borrarProducto(codigo) {
    const { tx, os } = await store('productos', 'readwrite');
    os.delete(String(codigo));
    await cerrarTx(tx);
  }

  /** Cuántas unidades base representa una cantidad vendida/comprada. */
  function factor(prod, modo) {
    if (!prod) return 1;
    if (prod.tipoVenta === 'paquete' && modo === 'paquete') return num(prod.piezasPorPaquete, 1);
    return 1;
  }

  /** Texto amigable de la existencia: "3 cajas y 5 pzs" o "2.450 kg". */
  function existenciaTexto(p) {
    const s = num(p.stock);
    if (p.tipoVenta === 'peso') return s.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' ' + (p.unidad || 'kg');
    if (p.tipoVenta === 'paquete') {
      const n = Math.max(1, num(p.piezasPorPaquete, 1));
      const cajas = Math.floor(s / n);
      const sueltas = Math.round(s - cajas * n);
      if (cajas && sueltas) return cajas + ' paq. y ' + sueltas + ' pzs';
      if (cajas) return cajas + ' paq.';
      return sueltas + ' pzs';
    }
    return s + ' pzs';
  }

  /* ===================== entradas de mercancía ===================== */

  /**
   * Suma existencia. cantidad va en la unidad indicada por `modo`
   * ('pieza' | 'paquete' | 'peso'); internamente se convierte a unidad base.
   */
  async function agregarExistencia(codigo, cantidad, costoUnit, precioVenta, modo) {
    const cant = num(cantidad);
    if (cant <= 0) throw new Error('La cantidad debe ser mayor a cero');
    const prod = await getProducto(codigo);
    if (!prod) throw new Error('Ese producto todavía no está registrado');

    const f = factor(prod, modo);
    const unidades = cant * f;
    // El costo que escribe el tendero es por la unidad que está metiendo.
    const costoIngresado = (costoUnit === null || costoUnit === undefined || costoUnit === '')
      ? (modo === 'paquete' ? num(prod.costoPaquete) || num(prod.costo) * f : num(prod.costo))
      : num(costoUnit);
    const costoBase = costoIngresado / f;

    prod.stock = num(prod.stock) + unidades;
    prod.costo = costoBase;
    if (modo === 'paquete') prod.costoPaquete = costoIngresado;
    if (precioVenta !== null && precioVenta !== undefined && precioVenta !== '') {
      if (modo === 'paquete') {
        prod.precioPaquete = num(precioVenta);
        if (!prod.precio) prod.precio = num(precioVenta) / f;
      } else {
        prod.precio = num(precioVenta);
      }
    }
    prod.invertido = num(prod.invertido) + unidades * costoBase;
    prod.actualizado = new Date().toISOString();

    const d = await abrir();
    const tx = d.transaction(['productos', 'movimientos'], 'readwrite');
    tx.objectStore('productos').put(prod);
    tx.objectStore('movimientos').add({
      tipo: 'entrada',
      codigo: prod.codigo,
      nombre: prod.nombre,
      cantidad: unidades,
      modo: modo || 'pieza',
      cantidadMostrada: cant,
      costoUnit: costoBase,
      precioUnit: num(prod.precio),
      total: unidades * costoBase,
      fecha: new Date().toISOString(),
      dia: hoy()
    });
    await cerrarTx(tx);
    return prod;
  }

  async function ajustarExistencia(codigo, nuevoStock, motivo) {
    const prod = await getProducto(codigo);
    if (!prod) throw new Error('Producto no encontrado');
    const anterior = num(prod.stock);
    prod.stock = num(nuevoStock);
    prod.actualizado = new Date().toISOString();

    const d = await abrir();
    const tx = d.transaction(['productos', 'movimientos'], 'readwrite');
    tx.objectStore('productos').put(prod);
    tx.objectStore('movimientos').add({
      tipo: 'ajuste',
      codigo: prod.codigo,
      nombre: prod.nombre,
      cantidad: prod.stock - anterior,
      costoUnit: num(prod.costo),
      total: 0,
      nota: motivo || 'Ajuste manual',
      fecha: new Date().toISOString(),
      dia: hoy()
    });
    await cerrarTx(tx);
    return prod;
  }

  async function movimientosDe(codigo, limite = 30) {
    const { os } = await store('movimientos');
    const lista = await pedir(os.index('codigo').getAll(String(codigo)));
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).slice(0, limite);
  }

  /* ===================== jornada (abrir y cerrar el día) ===================== */

  async function jornadaAbierta() {
    const lista = await leerTodo('jornadas');
    return lista.filter((j) => j.abierta).sort((a, b) => b.id - a.id)[0] || null;
  }

  async function abrirDia(fondoInicial, nota) {
    const ya = await jornadaAbierta();
    if (ya) return ya;
    const jornada = {
      dia: hoy(),
      apertura: new Date().toISOString(),
      fondoInicial: num(fondoInicial),
      nota: nota || '',
      abierta: true,
      cierre: null,
      efectivoContado: 0,
      diferencia: 0
    };
    return guardarEn('jornadas', jornada);
  }

  /** Cierra el día y deja el corte de caja calculado. */
  async function cerrarDia(efectivoContado, nota) {
    const jornada = await jornadaAbierta();
    if (!jornada) throw new Error('No hay un día abierto');
    const ventas = await ventasDeJornada(jornada.id);
    const efectivo = ventas.filter((v) => v.tipoPago !== 'credito');
    const credito = ventas.filter((v) => v.tipoPago === 'credito');
    const abonos = await abonosDelDia(jornada.dia);

    jornada.cierre = new Date().toISOString();
    jornada.abierta = false;
    jornada.tickets = ventas.length;
    jornada.totalVendido = ventas.reduce((s, v) => s + num(v.total), 0);
    jornada.totalEfectivo = efectivo.reduce((s, v) => s + num(v.total), 0);
    jornada.totalCredito = credito.reduce((s, v) => s + num(v.total), 0);
    jornada.totalAbonos = abonos.reduce((s, a) => s + num(a.monto), 0);
    jornada.ganancia = ventas.reduce((s, v) => s + num(v.ganancia), 0);
    jornada.esperadoEnCaja = num(jornada.fondoInicial) + jornada.totalEfectivo + jornada.totalAbonos;
    jornada.efectivoContado = num(efectivoContado, jornada.esperadoEnCaja);
    jornada.diferencia = jornada.efectivoContado - jornada.esperadoEnCaja;
    jornada.notaCierre = nota || '';
    await guardarEn('jornadas', jornada);
    return jornada;
  }

  async function ventasDeJornada(jornadaId) {
    const lista = await leerTodo('ventas');
    return lista.filter((v) => v.jornadaId === jornadaId);
  }

  async function jornadasRecientes(limite = 30) {
    const lista = await leerTodo('jornadas');
    return lista.sort((a, b) => b.id - a.id).slice(0, limite);
  }

  /* ===================== ventas ===================== */

  /**
   * Cobra el carrito. items: [{ codigo, nombre, cantidad, modo, precio, costo }]
   * extra: { recibido, cambio, tipoPago:'efectivo'|'credito', clienteId, fechaPago }
   */
  async function registrarVenta(items, extra = {}) {
    if (!items.length) throw new Error('No hay productos en la venta');
    const cfg = await getConfig();
    const jornada = await jornadaAbierta();

    const detalle = [];
    // Un mismo producto puede venir en varios renglones (una caja y una pieza
    // suelta, por ejemplo): se lee UNA vez y se le van restando todos.
    const porProducto = new Map();
    for (const it of items) {
      const clave = String(it.codigo);
      if (!porProducto.has(clave)) {
        const prod = await getProducto(clave);
        if (!prod) throw new Error('Producto no encontrado: ' + it.codigo);
        porProducto.set(clave, prod);
      }
      const prod = porProducto.get(clave);
      const cantidad = num(it.cantidad);
      const modo = it.modo || (prod.tipoVenta === 'peso' ? 'peso' : 'pieza');
      const unidades = cantidad * factor(prod, modo);
      if (!cfg.permitirNegativo && num(prod.stock) < unidades) {
        throw new Error('No hay suficiente ' + prod.nombre);
      }
      prod.stock = num(prod.stock) - unidades;
      prod.actualizado = new Date().toISOString();
      detalle.push({
        codigo: prod.codigo,
        nombre: prod.nombre,
        categoria: prod.categoria,
        modo: modo,
        cantidad: cantidad,
        unidades: unidades,
        precio: num(it.precio, prod.precio),
        costo: num(it.costo, prod.costo * factor(prod, modo))
      });
    }

    const ahora = new Date();
    const total = detalle.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const costoTotal = detalle.reduce((s, i) => s + i.cantidad * i.costo, 0);
    const venta = {
      fecha: ahora.toISOString(),
      dia: hoy(),
      hora: ahora.getHours(),
      jornadaId: jornada ? jornada.id : null,
      tipoPago: extra.tipoPago === 'credito' ? 'credito' : 'efectivo',
      clienteId: extra.clienteId || null,
      items: detalle,
      piezas: detalle.reduce((s, i) => s + (i.modo === 'peso' ? 1 : i.unidades), 0),
      total: total,
      costoTotal: costoTotal,
      ganancia: total - costoTotal,
      recibido: num(extra.recibido, 0),
      cambio: num(extra.cambio, 0)
    };

    const d = await abrir();
    const tx = d.transaction(['productos', 'ventas', 'movimientos'], 'readwrite');
    const osP = tx.objectStore('productos');
    porProducto.forEach((p) => osP.put(p));
    let ventaId = null;
    const req = tx.objectStore('ventas').add(venta);
    req.onsuccess = () => {
      ventaId = req.result;
      const osM = tx.objectStore('movimientos');
      detalle.forEach((i) => {
        osM.add({
          tipo: 'venta',
          ventaId: ventaId,
          codigo: i.codigo,
          nombre: i.nombre,
          cantidad: -i.unidades,
          modo: i.modo,
          cantidadMostrada: i.cantidad,
          costoUnit: i.costo,
          precioUnit: i.precio,
          total: i.cantidad * i.precio,
          fecha: venta.fecha,
          dia: venta.dia
        });
      });
    };
    await cerrarTx(tx);
    venta.id = ventaId;
    return venta;
  }

  async function ventasDelDia(dia) {
    const { os } = await store('ventas');
    const lista = await pedir(os.index('dia').getAll(dia || hoy()));
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  }

  async function todasVentas() { return leerTodo('ventas'); }

  async function cancelarVenta(id) {
    const d = await abrir();
    const venta = await pedir(d.transaction('ventas').objectStore('ventas').get(id));
    if (!venta) throw new Error('Venta no encontrada');

    const porProducto = new Map();
    for (const it of venta.items) {
      const clave = String(it.codigo);
      if (!porProducto.has(clave)) {
        const prod = await getProducto(clave);
        if (!prod) continue;
        porProducto.set(clave, prod);
      }
      const prod = porProducto.get(clave);
      prod.stock = num(prod.stock) + num(it.unidades !== undefined ? it.unidades : it.cantidad);
      prod.actualizado = new Date().toISOString();
    }
    const llavesMov = await pedir(
      d.transaction('movimientos').objectStore('movimientos').index('ventaId').getAllKeys(id)
    );

    const tx = d.transaction(['productos', 'ventas', 'movimientos'], 'readwrite');
    const osP = tx.objectStore('productos');
    porProducto.forEach((p) => osP.put(p));
    tx.objectStore('ventas').delete(id);
    const osM = tx.objectStore('movimientos');
    llavesMov.forEach((k) => osM.delete(k));
    await cerrarTx(tx);
    return venta;
  }

  async function resumenDia(dia) {
    const ventas = await ventasDelDia(dia);
    return {
      dia: dia || hoy(),
      tickets: ventas.length,
      piezas: ventas.reduce((s, v) => s + num(v.piezas), 0),
      total: ventas.reduce((s, v) => s + num(v.total), 0),
      efectivo: ventas.filter((v) => v.tipoPago !== 'credito').reduce((s, v) => s + num(v.total), 0),
      credito: ventas.filter((v) => v.tipoPago === 'credito').reduce((s, v) => s + num(v.total), 0),
      costo: ventas.reduce((s, v) => s + num(v.costoTotal), 0),
      ganancia: ventas.reduce((s, v) => s + num(v.ganancia), 0),
      ventas: ventas
    };
  }

  async function resumenRango(desde, hasta) {
    const todas = await todasVentas();
    const dentro = todas.filter((v) => v.dia >= desde && v.dia <= hasta);
    const porDia = {};
    dentro.forEach((v) => {
      if (!porDia[v.dia]) porDia[v.dia] = { dia: v.dia, tickets: 0, piezas: 0, total: 0, costo: 0, ganancia: 0, credito: 0 };
      const r = porDia[v.dia];
      r.tickets += 1;
      r.piezas += num(v.piezas);
      r.total += num(v.total);
      r.costo += num(v.costoTotal);
      r.ganancia += num(v.ganancia);
      if (v.tipoPago === 'credito') r.credito += num(v.total);
    });
    const dias = Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia));
    return {
      desde, hasta, dias, ventas: dentro,
      tickets: dentro.length,
      piezas: dias.reduce((s, d) => s + d.piezas, 0),
      total: dias.reduce((s, d) => s + d.total, 0),
      costo: dias.reduce((s, d) => s + d.costo, 0),
      ganancia: dias.reduce((s, d) => s + d.ganancia, 0),
      credito: dias.reduce((s, d) => s + d.credito, 0)
    };
  }

  /** Ventas agrupadas por hora del día: sirve para saber a qué hora hay más gente. */
  async function ventasPorHora(desde, hasta) {
    const r = await resumenRango(desde, hasta);
    const horas = [];
    for (let h = 0; h < 24; h++) horas.push({ hora: h, tickets: 0, total: 0, piezas: 0, ganancia: 0 });
    r.ventas.forEach((v) => {
      const h = v.hora !== undefined ? v.hora : new Date(v.fecha).getHours();
      horas[h].tickets += 1;
      horas[h].total += num(v.total);
      horas[h].piezas += num(v.piezas);
      horas[h].ganancia += num(v.ganancia);
    });
    const conVentas = horas.filter((h) => h.tickets > 0);
    const mejor = conVentas.slice().sort((a, b) => b.total - a.total)[0] || null;
    const masGente = conVentas.slice().sort((a, b) => b.tickets - a.tickets)[0] || null;
    return { horas, conVentas, mejor, masGente, total: r.total, tickets: r.tickets };
  }

  async function masVendidos(desde, hasta, limite = 20) {
    const r = await resumenRango(desde, hasta);
    const acc = {};
    r.ventas.forEach((v) => v.items.forEach((i) => {
      if (!acc[i.codigo]) acc[i.codigo] = { codigo: i.codigo, nombre: i.nombre, categoria: i.categoria, piezas: 0, total: 0, ganancia: 0 };
      acc[i.codigo].piezas += num(i.unidades !== undefined ? i.unidades : i.cantidad);
      acc[i.codigo].total += i.cantidad * i.precio;
      acc[i.codigo].ganancia += i.cantidad * (i.precio - i.costo);
    }));
    return Object.values(acc).sort((a, b) => b.piezas - a.piezas).slice(0, limite);
  }

  /* ===================== clientes y créditos (fiado) ===================== */

  async function todosClientes() {
    const lista = await leerTodo('clientes');
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function guardarCliente(c) {
    const cliente = {
      nombre: (c.nombre || '').trim() || 'Cliente',
      telefono: (c.telefono || '').trim(),
      nota: c.nota || '',
      creado: c.creado || new Date().toISOString()
    };
    if (c.id) cliente.id = c.id;
    return guardarEn('clientes', cliente);
  }

  async function getCliente(id) {
    const { os } = await store('clientes');
    return pedir(os.get(id));
  }

  /** Registra la venta a crédito y la deja agendada para su cobro. */
  async function crearCredito(venta, cliente, fechaPago) {
    const cfg = await getConfig();
    const fechaTexto = new Date(hoy() + 'T12:00:00')
      .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    const credito = {
      ventaId: venta.id,
      clienteId: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono || '',
      fecha: new Date().toISOString(),
      dia: hoy(),
      items: venta.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, modo: i.modo, precio: i.precio })),
      total: num(venta.total),
      abonos: [],
      saldo: num(venta.total),
      fechaPago: fechaPago,
      pagado: false,
      pagadoTxt: 'no'
    };
    const guardado = await guardarEn('creditos', credito);
    await guardarEvento({
      tipo: 'cobro',
      fecha: fechaPago,
      titulo: 'Cobrar a ' + cliente.nombre,
      nota: 'Fiado del ' + fechaTexto + ' por ' + (cfg.moneda || '$') + num(venta.total).toFixed(2),
      creditoId: guardado.id,
      clienteId: cliente.id,
      telefono: cliente.telefono || ''
    });
    return guardado;
  }

  async function todosCreditos() {
    const lista = await leerTodo('creditos');
    return lista.sort((a, b) => (a.pagado === b.pagado)
      ? (a.fechaPago || '').localeCompare(b.fechaPago || '')
      : (a.pagado ? 1 : -1));
  }

  async function creditosPendientes() {
    return (await todosCreditos()).filter((c) => !c.pagado);
  }

  async function abonarCredito(id, monto, nota) {
    const { os } = await store('creditos');
    const credito = await pedir(os.get(id));
    if (!credito) throw new Error('Crédito no encontrado');
    const cantidad = num(monto);
    if (cantidad <= 0) throw new Error('El abono debe ser mayor a cero');
    credito.abonos = (credito.abonos || []).concat([{
      fecha: new Date().toISOString(), dia: hoy(), monto: cantidad, nota: nota || ''
    }]);
    const pagadoTotal = credito.abonos.reduce((s, a) => s + num(a.monto), 0);
    credito.saldo = Math.max(0, num(credito.total) - pagadoTotal);
    credito.pagado = credito.saldo <= 0.009;
    credito.pagadoTxt = credito.pagado ? 'si' : 'no';
    if (credito.pagado) credito.fechaLiquidado = hoy();
    await guardarEn('creditos', credito);
    if (credito.pagado) await cerrarEventosDeCredito(credito.id);
    return credito;
  }

  async function abonosDelDia(dia) {
    const creditos = await leerTodo('creditos');
    const lista = [];
    creditos.forEach((c) => (c.abonos || []).forEach((a) => {
      if (a.dia === (dia || hoy())) lista.push(Object.assign({ nombre: c.nombre, creditoId: c.id }, a));
    }));
    return lista;
  }

  async function borrarCredito(id) {
    await cerrarEventosDeCredito(id, true);
    return borrarEn('creditos', id);
  }

  /* ===================== proveedores ===================== */

  async function todosProveedores() {
    const lista = await leerTodo('proveedores');
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function guardarProveedor(p) {
    const prov = {
      nombre: (p.nombre || '').trim() || 'Proveedor',
      telefono: (p.telefono || '').trim(),
      categorias: p.categorias || [],
      diaVisita: p.diaVisita || '',
      nota: p.nota || '',
      creado: p.creado || new Date().toISOString()
    };
    if (p.id) prov.id = p.id;
    return guardarEn('proveedores', prov);
  }

  async function getProveedor(id) {
    const { os } = await store('proveedores');
    return pedir(os.get(id));
  }

  async function borrarProveedor(id) { return borrarEn('proveedores', id); }

  /* ===================== agenda ===================== */

  /**
   * Eventos del calendario: visitas de proveedor ('proveedor') y
   * cobros de fiado ('cobro'). Los cobros se crean solos al fiar.
   */
  async function guardarEvento(ev) {
    const evento = {
      tipo: ev.tipo || 'proveedor',
      fecha: ev.fecha,
      hora: ev.hora || '',
      titulo: (ev.titulo || '').trim() || 'Evento',
      nota: ev.nota || '',
      proveedorId: ev.proveedorId || null,
      creditoId: ev.creditoId || null,
      clienteId: ev.clienteId || null,
      telefono: ev.telefono || '',
      pedido: ev.pedido || [],
      hecho: !!ev.hecho,
      creado: ev.creado || new Date().toISOString()
    };
    if (ev.id) evento.id = ev.id;
    return guardarEn('agenda', evento);
  }

  async function getEvento(id) {
    const { os } = await store('agenda');
    return pedir(os.get(id));
  }

  async function eventosRango(desde, hasta) {
    const lista = await leerTodo('agenda');
    return lista
      .filter((e) => e.fecha >= desde && e.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || ''));
  }

  async function eventosPendientes() {
    const lista = await leerTodo('agenda');
    return lista.filter((e) => !e.hecho).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  async function marcarEvento(id, hecho) {
    const ev = await getEvento(id);
    if (!ev) return null;
    ev.hecho = !!hecho;
    return guardarEn('agenda', ev);
  }

  async function borrarEvento(id) { return borrarEn('agenda', id); }

  async function cerrarEventosDeCredito(creditoId, borrar) {
    const lista = await leerTodo('agenda');
    const suyos = lista.filter((e) => e.creditoId === creditoId);
    for (const e of suyos) {
      if (borrar) await borrarEn('agenda', e.id);
      else { e.hecho = true; await guardarEn('agenda', e); }
    }
  }

  /** Lo que falta comprarle a un proveedor, según su categoría y el mínimo. */
  async function sugerenciaPedido(proveedorId) {
    const [productos, prov] = await Promise.all([todosProductos(), getProveedor(proveedorId)]);
    const cats = (prov && prov.categorias) || [];
    return productos.filter((p) => {
      if (num(p.stock) > num(p.minimo)) return false;
      if (p.proveedorId && p.proveedorId === proveedorId) return true;
      if (!cats.length) return !p.proveedorId;
      return cats.includes(p.categoria);
    }).map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      quedan: num(p.stock),
      sugerido: Math.max(1, Math.ceil((num(p.objetivo) > 0 ? num(p.objetivo) : num(p.minimo) * 2) - num(p.stock)))
    }));
  }

  /* ===================== alertas ===================== */

  /** Todo lo que la tienda debe avisar hoy: poco producto, visitas y cobros. */
  async function alertas() {
    const cfg = await getConfig();
    const [productos, eventos, creditos] = await Promise.all([
      todosProductos(), eventosPendientes(), creditosPendientes()
    ]);
    const limite = sumarDias(hoy(), num(cfg.avisarVisitaDias, 2));

    const bajos = productos
      .filter((p) => num(p.stock) <= num(p.minimo))
      .sort((a, b) => num(a.stock) - num(b.stock));
    const visitas = eventos.filter((e) => e.tipo === 'proveedor' && e.fecha <= limite);
    const cobros = creditos.filter((c) => c.fechaPago && c.fechaPago <= limite);
    const vencidos = creditos.filter((c) => c.fechaPago && c.fechaPago < hoy());

    return {
      bajos, visitas, cobros, vencidos,
      total: bajos.length + visitas.length + cobros.length
    };
  }

  /* ===================== respaldo ===================== */

  async function exportar() {
    const [cfg, productos, ventas, movimientos, clientes, creditos, proveedores, agenda, jornadas] =
      await Promise.all([
        getConfig(), todosProductos(), leerTodo('ventas'), leerTodo('movimientos'),
        leerTodo('clientes'), leerTodo('creditos'), leerTodo('proveedores'),
        leerTodo('agenda'), leerTodo('jornadas')
      ]);
    return {
      app: 'inventario-abarrotes', version: VERSION, fecha: new Date().toISOString(),
      config: cfg, productos, ventas, movimientos, clientes, creditos, proveedores, agenda, jornadas
    };
  }

  async function importar(datos, reemplazar) {
    if (!datos || !Array.isArray(datos.productos)) throw new Error('El archivo de respaldo no es válido');
    const almacenes = ['productos', 'ventas', 'movimientos', 'clientes', 'creditos', 'proveedores', 'agenda', 'jornadas', 'config'];
    const d = await abrir();
    const tx = d.transaction(almacenes, 'readwrite');
    if (reemplazar) {
      almacenes.filter((a) => a !== 'config').forEach((a) => tx.objectStore(a).clear());
    }
    const copiar = (nombre) => (datos[nombre] || []).forEach((r) => tx.objectStore(nombre).put(r));
    ['productos', 'ventas', 'movimientos', 'clientes', 'creditos', 'proveedores', 'agenda', 'jornadas'].forEach(copiar);
    if (datos.config) {
      Object.keys(datos.config).forEach((k) => tx.objectStore('config').put({ k, v: datos.config[k] }));
    }
    await cerrarTx(tx);
    cacheConfig = null;
  }

  async function borrarTodo() {
    const almacenes = ['productos', 'ventas', 'movimientos', 'clientes', 'creditos', 'proveedores', 'agenda', 'jornadas'];
    const d = await abrir();
    const tx = d.transaction(almacenes, 'readwrite');
    almacenes.forEach((a) => tx.objectStore(a).clear());
    await cerrarTx(tx);
  }

  return {
    abrir, hoy, diaDe, sumarDias, CONFIG_DEFAULT, factor, existenciaTexto,
    getConfig, setConfig,
    getProducto, todosProductos, guardarProducto, borrarProducto, siguienteCodigoInterno,
    agregarExistencia, ajustarExistencia, movimientosDe,
    jornadaAbierta, abrirDia, cerrarDia, ventasDeJornada, jornadasRecientes,
    registrarVenta, ventasDelDia, todasVentas, cancelarVenta,
    resumenDia, resumenRango, ventasPorHora, masVendidos,
    todosClientes, guardarCliente, getCliente,
    crearCredito, todosCreditos, creditosPendientes, abonarCredito, abonosDelDia, borrarCredito,
    todosProveedores, guardarProveedor, getProveedor, borrarProveedor, sugerenciaPedido,
    guardarEvento, getEvento, eventosRango, eventosPendientes, marcarEvento, borrarEvento,
    alertas, exportar, importar, borrarTodo
  };
})();
