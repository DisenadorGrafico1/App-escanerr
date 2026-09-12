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
    /No hay suficientes/
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

prueba('respaldo: exportar y volver a importar', async () => {
  const respaldo = await DB.exportar();
  assert.equal(respaldo.productos.length, 2);
  await DB.borrarTodo();
  assert.equal((await DB.todosProductos()).length, 0);
  await DB.importar(respaldo, true);
  const productos = await DB.todosProductos();
  assert.equal(productos.length, 2);
  assert.equal((await DB.getProducto('7501055300011')).stock, 33);
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
