/*
 * db.js — Almacenamiento local de la tienda (IndexedDB).
 * Todo vive en el celular: no hay servidor ni internet.
 */
const DB = (() => {
  const NOMBRE = 'tienda-abarrotes';
  const VERSION = 1;
  let db = null;

  const CONFIG_DEFAULT = {
    tienda: 'Mi tienda de abarrotes',
    moneda: '$',
    minimoDefault: 5,
    umbralCompraDefault: 15,
    sonido: true,
    vibrar: true,
    permitirNegativo: true,
    categorias: [
      'Abarrotes', 'Bebidas', 'Botanas', 'Dulces', 'Lácteos',
      'Limpieza', 'Higiene personal', 'Enlatados', 'Pan y galletas', 'Otros'
    ]
  };

  function abrir() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = (ev) => {
        const d = ev.target.result;
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
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------- utilidades internas ---------- */

  function pedir(peticion) {
    return new Promise((resolve, reject) => {
      peticion.onsuccess = () => resolve(peticion.result);
      peticion.onerror = () => reject(peticion.error);
    });
  }

  function cerrarTx(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Operación cancelada'));
    });
  }

  async function store(nombre, modo = 'readonly') {
    const d = await abrir();
    const tx = d.transaction(nombre, modo);
    return { tx, os: tx.objectStore(nombre) };
  }

  function hoy() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function num(v, def = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : def;
  }

  /* ---------- configuración ---------- */

  let cacheConfig = null;

  async function getConfig() {
    if (cacheConfig) return cacheConfig;
    const { os } = await store('config');
    const filas = await pedir(os.getAll());
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

  /* ---------- productos ---------- */

  async function getProducto(codigo) {
    const { os } = await store('productos');
    return pedir(os.get(String(codigo)));
  }

  async function todosProductos() {
    const { os } = await store('productos');
    const lista = await pedir(os.getAll());
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  /** Da de alta un producto nuevo (o reemplaza por completo uno existente). */
  async function guardarProducto(p) {
    const cfg = await getConfig();
    const previo = await getProducto(p.codigo);
    const prod = {
      codigo: String(p.codigo).trim(),
      nombre: (p.nombre || '').trim() || 'Sin nombre',
      categoria: p.categoria || 'Otros',
      costo: num(p.costo),
      precio: num(p.precio),
      stock: num(p.stock),
      minimo: num(p.minimo, cfg.minimoDefault),
      objetivo: num(p.objetivo, 0),
      unidad: p.unidad || 'pieza',
      nota: p.nota || '',
      invertido: previo ? num(previo.invertido) : 0,
      creado: previo ? previo.creado : new Date().toISOString(),
      actualizado: new Date().toISOString()
    };
    const { tx, os } = await store('productos', 'readwrite');
    os.put(prod);
    await cerrarTx(tx);
    return prod;
  }

  async function borrarProducto(codigo) {
    const { tx, os } = await store('productos', 'readwrite');
    os.delete(String(codigo));
    await cerrarTx(tx);
  }

  /* ---------- movimientos ---------- */

  async function registrarMovimiento(mov) {
    const { tx, os } = await store('movimientos', 'readwrite');
    os.add(Object.assign({ fecha: new Date().toISOString(), dia: hoy() }, mov));
    await cerrarTx(tx);
  }

  async function movimientosDe(codigo, limite = 30) {
    const { os } = await store('movimientos');
    const lista = await pedir(os.index('codigo').getAll(String(codigo)));
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).slice(0, limite);
  }

  /* ---------- entradas de mercancía ---------- */

  /**
   * Suma piezas al inventario de un producto ya registrado.
   * Actualiza el último costo, el precio de venta (si se manda) y
   * acumula cuánto dinero se lleva invertido en ese producto.
   */
  async function agregarExistencia(codigo, piezas, costoUnit, precioVenta) {
    const cantidad = num(piezas);
    if (cantidad <= 0) throw new Error('La cantidad debe ser mayor a cero');
    const prod = await getProducto(codigo);
    if (!prod) throw new Error('Ese producto todavía no está registrado');

    const costo = (costoUnit === null || costoUnit === undefined || costoUnit === '')
      ? num(prod.costo) : num(costoUnit);
    prod.stock = num(prod.stock) + cantidad;
    prod.costo = costo;
    if (precioVenta !== null && precioVenta !== undefined && precioVenta !== '') {
      prod.precio = num(precioVenta);
    }
    prod.invertido = num(prod.invertido) + cantidad * costo;
    prod.actualizado = new Date().toISOString();

    const d = await abrir();
    const tx = d.transaction(['productos', 'movimientos'], 'readwrite');
    tx.objectStore('productos').put(prod);
    tx.objectStore('movimientos').add({
      tipo: 'entrada',
      codigo: prod.codigo,
      nombre: prod.nombre,
      cantidad: cantidad,
      costoUnit: costo,
      precioUnit: num(prod.precio),
      total: cantidad * costo,
      fecha: new Date().toISOString(),
      dia: hoy()
    });
    await cerrarTx(tx);
    return prod;
  }

  /** Corrige el stock a un número exacto (conteo físico, mermas, etc.). */
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

  /* ---------- ventas ---------- */

  /**
   * Cobra el carrito: descuenta piezas del inventario y guarda el ticket.
   * items: [{ codigo, nombre, cantidad, precio, costo }]
   */
  async function registrarVenta(items, extra = {}) {
    if (!items.length) throw new Error('No hay productos en la venta');
    const cfg = await getConfig();

    // 1) Leer y validar todo ANTES de escribir.
    const detalle = [];
    const aGuardar = [];
    for (const it of items) {
      const prod = await getProducto(it.codigo);
      if (!prod) throw new Error('Producto no encontrado: ' + it.codigo);
      const cantidad = num(it.cantidad);
      if (!cfg.permitirNegativo && num(prod.stock) < cantidad) {
        throw new Error('No hay suficientes piezas de ' + prod.nombre);
      }
      prod.stock = num(prod.stock) - cantidad;
      prod.actualizado = new Date().toISOString();
      aGuardar.push(prod);
      detalle.push({
        codigo: prod.codigo,
        nombre: prod.nombre,
        categoria: prod.categoria,
        cantidad: cantidad,
        precio: num(it.precio, prod.precio),
        costo: num(it.costo, prod.costo)
      });
    }

    const total = detalle.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const costoTotal = detalle.reduce((s, i) => s + i.cantidad * i.costo, 0);
    const venta = {
      fecha: new Date().toISOString(),
      dia: hoy(),
      items: detalle,
      piezas: detalle.reduce((s, i) => s + i.cantidad, 0),
      total: total,
      costoTotal: costoTotal,
      ganancia: total - costoTotal,
      recibido: num(extra.recibido, 0),
      cambio: num(extra.cambio, 0)
    };

    // 2) Escribir todo en una sola transacción, sin esperas de por medio
    //    (si se intercalan "await" la transacción puede cerrarse a medias).
    const d = await abrir();
    const tx = d.transaction(['productos', 'ventas', 'movimientos'], 'readwrite');
    const osP = tx.objectStore('productos');
    aGuardar.forEach((p) => osP.put(p));

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
          cantidad: -i.cantidad,
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
    // Del más nuevo al más viejo; si dos caen en el mismo milisegundo,
    // manda el número de ticket para que el orden nunca sea ambiguo.
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  }

  async function todasVentas() {
    const { os } = await store('ventas');
    return pedir(os.getAll());
  }

  /** Cancela un ticket y devuelve las piezas al inventario. */
  async function cancelarVenta(id) {
    const d = await abrir();
    const venta = await pedir(d.transaction('ventas').objectStore('ventas').get(id));
    if (!venta) throw new Error('Venta no encontrada');

    const aGuardar = [];
    for (const it of venta.items) {
      const prod = await getProducto(it.codigo);
      if (prod) {
        prod.stock = num(prod.stock) + num(it.cantidad);
        prod.actualizado = new Date().toISOString();
        aGuardar.push(prod);
      }
    }
    const llavesMov = await pedir(
      d.transaction('movimientos').objectStore('movimientos').index('ventaId').getAllKeys(id)
    );

    const tx = d.transaction(['productos', 'ventas', 'movimientos'], 'readwrite');
    const osP = tx.objectStore('productos');
    aGuardar.forEach((p) => osP.put(p));
    tx.objectStore('ventas').delete(id);
    const osM = tx.objectStore('movimientos');
    llavesMov.forEach((k) => osM.delete(k));
    await cerrarTx(tx);
    return venta;
  }

  /** Totales de un día: vendido, costo, ganancia, piezas y tickets. */
  async function resumenDia(dia) {
    const ventas = await ventasDelDia(dia);
    return {
      dia: dia || hoy(),
      tickets: ventas.length,
      piezas: ventas.reduce((s, v) => s + num(v.piezas), 0),
      total: ventas.reduce((s, v) => s + num(v.total), 0),
      costo: ventas.reduce((s, v) => s + num(v.costoTotal), 0),
      ganancia: ventas.reduce((s, v) => s + num(v.ganancia), 0),
      ventas: ventas
    };
  }

  /** Totales por día dentro de un rango (incluye días sin ventas). */
  async function resumenRango(desde, hasta) {
    const todas = await todasVentas();
    const dentro = todas.filter((v) => v.dia >= desde && v.dia <= hasta);
    const porDia = {};
    dentro.forEach((v) => {
      if (!porDia[v.dia]) porDia[v.dia] = { dia: v.dia, tickets: 0, piezas: 0, total: 0, costo: 0, ganancia: 0 };
      const r = porDia[v.dia];
      r.tickets += 1;
      r.piezas += num(v.piezas);
      r.total += num(v.total);
      r.costo += num(v.costoTotal);
      r.ganancia += num(v.ganancia);
    });
    const dias = Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia));
    return {
      desde, hasta, dias, ventas: dentro,
      tickets: dentro.length,
      piezas: dias.reduce((s, d) => s + d.piezas, 0),
      total: dias.reduce((s, d) => s + d.total, 0),
      costo: dias.reduce((s, d) => s + d.costo, 0),
      ganancia: dias.reduce((s, d) => s + d.ganancia, 0)
    };
  }

  /** Productos más vendidos del rango. */
  async function masVendidos(desde, hasta, limite = 20) {
    const r = await resumenRango(desde, hasta);
    const acc = {};
    r.ventas.forEach((v) => v.items.forEach((i) => {
      if (!acc[i.codigo]) acc[i.codigo] = { codigo: i.codigo, nombre: i.nombre, categoria: i.categoria, piezas: 0, total: 0, ganancia: 0 };
      acc[i.codigo].piezas += i.cantidad;
      acc[i.codigo].total += i.cantidad * i.precio;
      acc[i.codigo].ganancia += i.cantidad * (i.precio - i.costo);
    }));
    return Object.values(acc).sort((a, b) => b.piezas - a.piezas).slice(0, limite);
  }

  /* ---------- respaldo ---------- */

  async function exportar() {
    const [productos, ventas, cfg] = await Promise.all([todosProductos(), todasVentas(), getConfig()]);
    const { os } = await store('movimientos');
    const movimientos = await pedir(os.getAll());
    return {
      app: 'inventario-abarrotes',
      version: VERSION,
      fecha: new Date().toISOString(),
      config: cfg, productos, ventas, movimientos
    };
  }

  async function importar(datos, reemplazar) {
    if (!datos || !Array.isArray(datos.productos)) throw new Error('El archivo de respaldo no es válido');
    const d = await abrir();
    const tx = d.transaction(['productos', 'ventas', 'movimientos', 'config'], 'readwrite');
    if (reemplazar) {
      tx.objectStore('productos').clear();
      tx.objectStore('ventas').clear();
      tx.objectStore('movimientos').clear();
    }
    datos.productos.forEach((p) => tx.objectStore('productos').put(p));
    (datos.ventas || []).forEach((v) => tx.objectStore('ventas').put(v));
    (datos.movimientos || []).forEach((m) => tx.objectStore('movimientos').put(m));
    if (datos.config) {
      Object.keys(datos.config).forEach((k) => tx.objectStore('config').put({ k, v: datos.config[k] }));
    }
    await cerrarTx(tx);
    cacheConfig = null;
  }

  async function borrarTodo() {
    const d = await abrir();
    const tx = d.transaction(['productos', 'ventas', 'movimientos'], 'readwrite');
    tx.objectStore('productos').clear();
    tx.objectStore('ventas').clear();
    tx.objectStore('movimientos').clear();
    await cerrarTx(tx);
  }

  return {
    abrir, hoy, CONFIG_DEFAULT,
    getConfig, setConfig,
    getProducto, todosProductos, guardarProducto, borrarProducto,
    agregarExistencia, ajustarExistencia, registrarMovimiento, movimientosDe,
    registrarVenta, ventasDelDia, todasVentas, cancelarVenta,
    resumenDia, resumenRango, masVendidos,
    exportar, importar, borrarTodo
  };
})();
