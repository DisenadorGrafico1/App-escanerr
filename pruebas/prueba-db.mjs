/*
 * Pruebas de la lógica de inventario y ventas (js/db.js).
 * Ejecutar:  npm test
 * Usa fake-indexeddb para simular el almacenamiento del celular.
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(join(aqui, '..', 'js', 'db.js'), 'utf8');
const DB = new Function(fuente + '\nreturn DB;')();

let pasadas = 0;
const casos = [];
const prueba = (nombre, fn) => casos.push([nombre, fn]);

prueba('da de alta un producto con su categoría', async () => {
  const p = await DB.guardarProducto({
    codigo: '7501055300011', nombre: 'Coca Cola 600ml', categoria: 'Bebidas',
    costo: 12, precio: 18, stock: 0, minimo: 6
  });
  assert.equal(p.nombre, 'Coca Cola 600ml');
  assert.equal(p.categoria, 'Bebidas');
  assert.equal(p.stock, 0);
});

prueba('volver a guardar un producto lo actualiza, no lo duplica', async () => {
  await DB.guardarProducto({
    codigo: '7501055300011', nombre: 'Coca Cola 600 ml', categoria: 'Bebidas',
    costo: 12, precio: 19, stock: 0, minimo: 6
  });
  const p = await DB.getProducto('7501055300011');
  assert.equal(p.precio, 19, 'se actualizó el precio');
  assert.equal(p.nombre, 'Coca Cola 600 ml');
  assert.equal((await DB.todosProductos()).length, 1, 'sigue habiendo un solo producto');
  await DB.guardarProducto({
    codigo: '7501055300011', nombre: 'Coca Cola 600ml', categoria: 'Bebidas',
    costo: 12, precio: 18, stock: 0, minimo: 6
  });
});

prueba('sumar piezas acumula existencia e inversión', async () => {
  await DB.agregarExistencia('7501055300011', 24, 12);
  await DB.agregarExistencia('7501055300011', 12, 13);
  const p = await DB.getProducto('7501055300011');
  assert.equal(p.stock, 36, 'debe sumar 24 + 12 piezas');
  assert.equal(p.costo, 13, 'guarda el último costo pagado');
  assert.equal(p.invertido, 24 * 12 + 12 * 13, 'acumula el dinero invertido');
});

prueba('rechaza cantidades inválidas', async () => {
  await assert.rejects(() => DB.agregarExistencia('7501055300011', 0, 10));
  await assert.rejects(() => DB.agregarExistencia('codigo-que-no-existe', 5, 10));
});

prueba('vender descuenta piezas y calcula la ganancia', async () => {
  await DB.guardarProducto({
    codigo: '7501030465102', nombre: 'Sabritas', categoria: 'Botanas',
    costo: 10, precio: 16, stock: 0, minimo: 4
  });
  await DB.agregarExistencia('7501030465102', 10, 10);

  const venta = await DB.registrarVenta([
    { codigo: '7501055300011', nombre: 'Coca Cola 600ml', cantidad: 3, precio: 18, costo: 13 },
    { codigo: '7501030465102', nombre: 'Sabritas', cantidad: 2, precio: 16, costo: 10 }
  ], { recibido: 100, cambio: 14 });

  assert.equal(venta.total, 3 * 18 + 2 * 16);
  assert.equal(venta.costoTotal, 3 * 13 + 2 * 10);
  assert.equal(venta.ganancia, venta.total - venta.costoTotal);
  assert.equal(venta.piezas, 5);
  assert.equal((await DB.getProducto('7501055300011')).stock, 33);
  assert.equal((await DB.getProducto('7501030465102')).stock, 8);
});

prueba('las cuentas del día suman todas las ventas', async () => {
  await DB.registrarVenta([{ codigo: '7501030465102', nombre: 'Sabritas', cantidad: 1, precio: 16, costo: 10 }]);
  const r = await DB.resumenDia(DB.hoy());
  assert.equal(r.tickets, 2);
  assert.equal(r.total, 86 + 16);
  assert.equal(r.piezas, 6);
  assert.equal(r.ganancia, r.total - r.costo);
});

prueba('cancelar una venta regresa las piezas al inventario', async () => {
  const ventas = await DB.ventasDelDia(DB.hoy());
  const ultima = ventas[0];   // ventasDelDia entrega el ticket más reciente primero
  const antes = (await DB.getProducto('7501030465102')).stock;
  await DB.cancelarVenta(ultima.id);
  assert.equal((await DB.getProducto('7501030465102')).stock, antes + 1);
  const r = await DB.resumenDia(DB.hoy());
  assert.equal(r.tickets, 1);
});

prueba('no deja vender sin existencia cuando está configurado así', async () => {
  await DB.setConfig('permitirNegativo', false);
  await assert.rejects(
    () => DB.registrarVenta([{ codigo: '7501030465102', nombre: 'Sabritas', cantidad: 999, precio: 16, costo: 10 }]),
    /No hay suficiente/
  );
  assert.equal((await DB.getProducto('7501030465102')).stock, 8, 'el stock no se movió');
  await DB.setConfig('permitirNegativo', true);
});

prueba('corregir la existencia por conteo físico', async () => {
  await DB.ajustarExistencia('7501030465102', 5, 'Conteo del sábado');
  assert.equal((await DB.getProducto('7501030465102')).stock, 5);
  const movs = await DB.movimientosDe('7501030465102');
  assert.equal(movs[0].tipo, 'ajuste');
  assert.equal(movs[0].cantidad, -3);
});

prueba('detecta los productos por acabarse (para el PDF)', async () => {
  const productos = await DB.todosProductos();
  const umbral = 15;
  const bajos = productos.filter((p) => Number(p.stock) <= umbral);
  assert.equal(bajos.length, 1, 'solo Sabritas (5) está en 15 o menos');
  assert.equal(bajos[0].nombre, 'Sabritas');
  const conMinimo = productos.filter((p) => Number(p.stock) <= Number(p.minimo));
  assert.equal(conMinimo.length, 0, 'Sabritas (5) todavía está arriba de su mínimo (4)');
});

prueba('resumen por rango de fechas', async () => {
  const r = await DB.resumenRango('2000-01-01', DB.hoy());
  assert.equal(r.tickets, 1);
  assert.ok(r.total > 0);
  assert.equal(r.dias.length, 1);
  const top = await DB.masVendidos('2000-01-01', DB.hoy(), 5);
  assert.equal(top[0].nombre, 'Coca Cola 600ml');
  assert.equal(top[0].piezas, 3);
});


prueba('paquetes: comprar por caja y vender por caja o por pieza', async () => {
  await DB.guardarProducto({
    codigo: '7501234567890', nombre: 'Cigarros Marlboro', categoria: 'Cigarros',
    tipoVenta: 'paquete', piezasPorPaquete: 20,
    costo: 3, precio: 5, costoPaquete: 60, precioPaquete: 85, stock: 0, minimo: 40
  });
  // 5 cajetillas de 20 cigarros = 100 piezas
  await DB.agregarExistencia('7501234567890', 5, 60, 85, 'paquete');
  let p = await DB.getProducto('7501234567890');
  assert.equal(p.stock, 100, 'el stock se guarda en piezas sueltas');
  assert.equal(p.costo, 3, 'el costo por pieza sale del costo de la caja');
  assert.equal(p.invertido, 300);
  assert.equal(DB.existenciaTexto(p), '5 paq.');

  // vender una cajetilla completa
  await DB.registrarVenta([{ codigo: '7501234567890', cantidad: 1, modo: 'paquete', precio: 85, costo: 60 }]);
  p = await DB.getProducto('7501234567890');
  assert.equal(p.stock, 80, 'vender una caja resta 20 piezas');

  // vender 20 cigarros sueltos equivale a otra cajetilla
  await DB.registrarVenta([{ codigo: '7501234567890', cantidad: 20, modo: 'pieza', precio: 5, costo: 3 }]);
  p = await DB.getProducto('7501234567890');
  assert.equal(p.stock, 60, '20 sueltos descuentan una caja completa');
  assert.equal(DB.existenciaTexto(p), '3 paq.');

  // y con sueltos de por medio se ve el desglose
  await DB.registrarVenta([{ codigo: '7501234567890', cantidad: 3, modo: 'pieza', precio: 5, costo: 3 }]);
  p = await DB.getProducto('7501234567890');
  assert.equal(DB.existenciaTexto(p), '2 paq. y 17 pzs');
});

prueba('un mismo producto en varios renglones del ticket', async () => {
  // Caja completa + una pieza suelta en la MISMA venta: debe restar las dos.
  const antes = (await DB.getProducto('7501234567890')).stock;
  const venta = await DB.registrarVenta([
    { codigo: '7501234567890', cantidad: 1, modo: 'paquete', precio: 85, costo: 60 },
    { codigo: '7501234567890', cantidad: 1, modo: 'pieza', precio: 5, costo: 3 }
  ]);
  assert.equal(venta.total, 90);
  assert.equal((await DB.getProducto('7501234567890')).stock, antes - 21,
    'debe restar 20 de la caja y 1 del suelto');
  // y al cancelar, devolver las dos
  await DB.cancelarVenta(venta.id);
  assert.equal((await DB.getProducto('7501234567890')).stock, antes,
    'cancelar devuelve las dos líneas');
});

prueba('productos sin código de barras y venta por peso', async () => {
  const codigo = await DB.siguienteCodigoInterno();
  assert.equal(codigo, 'SC-0001');
  await DB.guardarProducto({
    codigo, nombre: 'Jitomate', categoria: 'Frutas y verduras',
    tipoVenta: 'peso', unidad: 'kg', sinCodigo: true,
    costo: 18, precio: 28, stock: 0, minimo: 3
  });
  await DB.agregarExistencia(codigo, 10, 18, 28, 'peso');
  let p = await DB.getProducto(codigo);
  assert.equal(p.stock, 10);
  assert.equal(DB.existenciaTexto(p), '10 kg');

  // venta de 1.250 kg
  const venta = await DB.registrarVenta([{ codigo, cantidad: 1.25, modo: 'peso', precio: 28, costo: 18 }]);
  assert.equal(venta.total, 35);
  assert.equal(Math.round(venta.ganancia * 100) / 100, 12.5);
  p = await DB.getProducto(codigo);
  assert.equal(p.stock, 8.75);
});

prueba('abrir y cerrar el día deja el corte de caja', async () => {
  const jornada = await DB.abrirDia(500, 'Fondo del lunes');
  assert.equal(jornada.abierta, true);
  assert.equal(jornada.fondoInicial, 500);
  assert.ok((await DB.jornadaAbierta()).id === jornada.id);

  await DB.registrarVenta([{ codigo: '7501055300011', cantidad: 2, precio: 18, costo: 13 }]);
  const cierre = await DB.cerrarDia(536, 'Corte del lunes');
  assert.equal(cierre.abierta, false);
  assert.equal(cierre.totalEfectivo, 36);
  assert.equal(cierre.esperadoEnCaja, 536, 'fondo inicial + ventas en efectivo');
  assert.equal(cierre.diferencia, 0);
  assert.equal(await DB.jornadaAbierta(), null);
});

prueba('fiar a un cliente crea el crédito y lo agenda para cobro', async () => {
  const cliente = await DB.guardarCliente({ nombre: 'Doña Mary', telefono: '5512345678' });
  const venta = await DB.registrarVenta(
    [{ codigo: '7501055300011', cantidad: 3, precio: 18, costo: 13 }],
    { tipoPago: 'credito', clienteId: cliente.id }
  );
  assert.equal(venta.tipoPago, 'credito');
  const fechaPago = DB.sumarDias(DB.hoy(), 7);
  const credito = await DB.crearCredito(venta, cliente, fechaPago);
  assert.equal(credito.saldo, 54);
  assert.equal(credito.pagado, false);

  const agenda = await DB.eventosRango(DB.hoy(), DB.sumarDias(DB.hoy(), 30));
  const cobro = agenda.find((e) => e.tipo === 'cobro' && e.creditoId === credito.id);
  assert.ok(cobro, 'el cobro quedó en el calendario');
  assert.equal(cobro.fecha, fechaPago);
  assert.equal(cobro.telefono, '5512345678');

  // abono parcial y luego liquidación
  let c = await DB.abonarCredito(credito.id, 20);
  assert.equal(c.saldo, 34);
  assert.equal(c.pagado, false);
  c = await DB.abonarCredito(credito.id, 34);
  assert.equal(c.saldo, 0);
  assert.equal(c.pagado, true);
  assert.equal((await DB.creditosPendientes()).length, 0);
  const agenda2 = await DB.eventosRango(DB.hoy(), DB.sumarDias(DB.hoy(), 30));
  assert.equal(agenda2.find((e) => e.creditoId === credito.id).hecho, true, 'el cobro se marca hecho al liquidar');
});

prueba('agenda de proveedores con sugerencia de pedido', async () => {
  const prov = await DB.guardarProveedor({
    nombre: 'Refresquero', telefono: '5599887766', categorias: ['Bebidas']
  });
  const fecha = DB.sumarDias(DB.hoy(), 1);
  await DB.guardarEvento({
    tipo: 'proveedor', fecha, hora: '09:00', titulo: 'Visita Refresquero', proveedorId: prov.id
  });
  const eventos = await DB.eventosRango(DB.hoy(), DB.sumarDias(DB.hoy(), 7));
  assert.ok(eventos.some((e) => e.titulo === 'Visita Refresquero'));

  // Coca Cola quedó en 28 piezas con mínimo 6: no debe sugerirse todavía
  let sugerido = await DB.sugerenciaPedido(prov.id);
  assert.equal(sugerido.length, 0);
  await DB.ajustarExistencia('7501055300011', 2, 'Se acabaron');
  sugerido = await DB.sugerenciaPedido(prov.id);
  assert.equal(sugerido.length, 1);
  assert.equal(sugerido[0].nombre, 'Coca Cola 600ml');
  assert.ok(sugerido[0].sugerido > 0);
});

prueba('las alertas juntan poco producto, visitas y cobros', async () => {
  const a = await DB.alertas();
  assert.ok(a.bajos.length >= 1, 'hay productos por acabarse');
  assert.equal(a.visitas.length, 1, 'la visita de mañana entra en alertas');
  assert.ok(a.total >= 2);
});

prueba('reporte de ventas por hora', async () => {
  const r = await DB.ventasPorHora(DB.hoy(), DB.hoy());
  assert.equal(r.horas.length, 24);
  assert.ok(r.tickets > 0);
  assert.ok(r.masGente, 'identifica el horario con más clientes');
  assert.equal(r.conVentas.reduce((s, h) => s + h.tickets, 0), r.tickets);
});

prueba('respaldo: exportar y volver a importar', async () => {
  const respaldo = await DB.exportar();
  assert.equal(respaldo.productos.length, 4);
  assert.ok(respaldo.clientes.length >= 1);
  assert.ok(respaldo.creditos.length >= 1);
  assert.ok(respaldo.agenda.length >= 1);
  assert.ok(respaldo.jornadas.length >= 1);
  await DB.borrarTodo();
  assert.equal((await DB.todosProductos()).length, 0);
  await DB.importar(respaldo, true);
  const productos = await DB.todosProductos();
  assert.equal(productos.length, 4);
  assert.equal((await DB.getProducto('7501055300011')).stock, 2);
  assert.equal((await DB.todosClientes()).length, 1);
  assert.ok((await DB.eventosRango('2000-01-01', '2099-01-01')).length >= 1);
  await assert.rejects(() => DB.importar({ nada: true }, true));
});

prueba('las categorías se guardan en la configuración', async () => {
  const cfg = await DB.getConfig();
  assert.ok(cfg.categorias.includes('Abarrotes'));
  await DB.setConfig('categorias', cfg.categorias.concat(['Cremería']));
  assert.ok((await DB.getConfig()).categorias.includes('Cremería'));
});

const ejecutar = async () => {
  for (const [nombre, fn] of casos) {
    try {
      await fn();
      pasadas++;
      console.log('  ✓ ' + nombre);
    } catch (e) {
      console.error('  ✗ ' + nombre + '\n    ' + e.message);
      process.exitCode = 1;
    }
  }
  console.log('\n' + pasadas + '/' + casos.length + ' pruebas pasaron');
};
ejecutar();
