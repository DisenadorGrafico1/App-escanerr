/*
 * Prueba de extremo a extremo de la app en un navegador real (Chromium).
 * Recorre: alta de productos (pieza, paquete y granel), venta, fiado,
 * agenda de proveedor, corte de caja y generación de todos los PDF.
 *   npm run prueba-app
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, access, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';


const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURAS = process.env.CAPTURAS || '';
const PUERTO = 8093;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const servidor = createServer(async (req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  try {
    const archivo = join(RAIZ, normalize(ruta));
    const datos = await readFile(archivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] || 'application/octet-stream' });
    res.end(datos);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => servidor.listen(PUERTO, r));

async function rutaChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return undefined;
  try {
    const dirs = (await readdir(base)).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      const ruta = join(base, d, 'chrome-linux', 'chrome');
      try { await access(ruta); return ruta; } catch {}
    }
  } catch {}
  return undefined;
}

const navegador = await chromium.launch({ executablePath: await rutaChromium() });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });

const paso = (t) => console.log('  ✓ ' + t);
const igual = (a, b, msg) => { if (a !== b) throw new Error(msg + ' (fue ' + a + ', se esperaba ' + b + ')'); };
const capturar = async (nombre, full) => {
  if (!CAPTURAS) return;
  await mkdir(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, nombre + '.png'), fullPage: !!full });
};
const irA = async (vista) => {
  await page.click('#btnMenu');
  await page.waitForTimeout(220);
  await page.click('.cajon-menu button[data-vista="' + vista + '"]');
  await page.waitForTimeout(320);
};

await page.goto('http://localhost:' + PUERTO + '/index.html');
await page.waitForSelector('#vista-inicio.activa');
await page.waitForTimeout(500);
paso('la app abre en Inicio');
await capturar('inicio-vacio');

/* ---------- alta de un producto normal ---------- */
await page.click('.barra-inferior [data-vista="agregar"]');
const altaPorCodigo = async (codigo, datos) => {
  await page.click('#btnTecleadoAgregar');
  await page.fill('#mCod', codigo);
  await page.click('#mOk');
  await page.waitForSelector('#panelProducto:not([hidden])');
  await page.fill('#fNombre', datos.nombre);
  await page.selectOption('#fCategoria', datos.categoria);
  if (datos.tipo) { await page.click('#segTipo button[data-tipo="' + datos.tipo + '"]'); }
  if (datos.piezasPaquete) {
    await page.fill('#fPiezasPaquete', String(datos.piezasPaquete));
    await page.fill('#fCostoPaquete', String(datos.costoPaquete));
    await page.fill('#fPrecioPaquete', String(datos.precioPaquete));
  }
  if (datos.costo !== undefined) await page.fill('#fCosto', String(datos.costo));
  await page.fill('#fPrecio', String(datos.precio));
  await page.fill('#fPiezas', String(datos.cantidad));
  if (datos.minimo !== undefined) await page.fill('#fMinimo', String(datos.minimo));
  await page.click('#btnGuardarEntrada');
  await page.waitForTimeout(350);
};

await altaPorCodigo('7501055300013', { nombre: 'Coca Cola 600 ml', categoria: 'Bebidas', costo: 12, precio: 18, cantidad: 24, minimo: 6 });
let p = await page.evaluate(() => DB.getProducto('7501055300013'));
igual(p.stock, 24, 'stock del producto por pieza');
paso('alta de producto por pieza (24 piezas, $288 invertidos)');

/* ---------- alta de un paquete (cigarros) ---------- */
await altaPorCodigo('7501234567890', {
  nombre: 'Cigarros Marlboro', categoria: 'Cigarros', tipo: 'paquete',
  piezasPaquete: 20, costoPaquete: 60, precioPaquete: 85, precio: 5, cantidad: 5, minimo: 40
});
p = await page.evaluate(() => DB.getProducto('7501234567890'));
igual(p.stock, 100, 'el paquete se guarda en piezas sueltas');
igual(p.costo, 3, 'costo por cigarro calculado solo');
paso('alta de paquete: 5 cajetillas = 100 cigarros, costo por pieza $3');
await capturar('agregar-paquete');

/* ---------- alta sin código, a granel ---------- */
await page.click('#btnSinCodigoAgregar');
await page.waitForSelector('#panelProducto:not([hidden])');
const codigoInterno = await page.inputValue('#fCodigo');
igual(codigoInterno, 'SC-0001', 'código interno asignado');
await page.fill('#fNombre', 'Jitomate');
await page.selectOption('#fCategoria', 'Frutas y verduras');
await page.click('#segTipo button[data-tipo="peso"]');
await page.fill('#fCosto', '18');
await page.fill('#fPrecio', '28');
await page.fill('#fPiezas', '10');
await page.fill('#fMinimo', '3');
await page.click('#btnGuardarEntrada');
await page.waitForTimeout(350);
p = await page.evaluate(() => DB.getProducto('SC-0001'));
igual(p.stock, 10, 'kilos de jitomate');
igual(p.tipoVenta, 'peso', 'tipo de venta por peso');
paso('alta sin código de barras y a granel (10 kg de jitomate)');

/* ---------- abrir el día ---------- */
await irA('caja');
await page.fill('#cajaFondo', '500');
await page.click('#btnAbrirDia');
await page.waitForTimeout(400);
igual(await page.evaluate(async () => (await DB.jornadaAbierta()).fondoInicial), 500, 'fondo inicial');
paso('día abierto con $500 de fondo');
await capturar('caja-abierta', true);

/* ---------- vender: pieza + paquete + suelto + granel ---------- */
await page.click('.barra-inferior [data-vista="vender"]');
const tecleaVenta = async (codigo) => {
  await page.click('#btnTecleadoVender');
  await page.fill('#mCod', codigo);
  await page.click('#mOk');
  await page.waitForTimeout(250);
};
await tecleaVenta('7501055300013');            // 1 coca
await tecleaVenta('7501234567890');            // cigarros → elegir
await page.click('#mPaquete');                 // cajetilla completa
await page.waitForTimeout(200);
await tecleaVenta('7501234567890');
await page.click('#mPieza');                   // un cigarro suelto
await page.waitForTimeout(200);
await tecleaVenta('SC-0001');                  // jitomate → pedir peso
await page.fill('#mPeso', '1.5');
await page.dispatchEvent('#mPeso', 'input');
await page.click('#mOk');
await page.waitForTimeout(250);

const total = await page.textContent('#carritoTotal');
igual(total, '$150.00', 'total del carrito (18 + 85 + 5 + 42)');
paso('carrito con pieza, paquete, pieza suelta y 1.5 kg = ' + total);
await capturar('vender-carrito', true);

await page.fill('#pagaCon', '200');
await page.waitForTimeout(150);
igual(await page.textContent('#cambio'), '$50.00', 'cambio');
await page.click('#btnCobrar');
await page.waitForTimeout(500);
await page.click('#mSeguir');
await page.waitForTimeout(300);

p = await page.evaluate(() => DB.getProducto('7501234567890'));
igual(p.stock, 79, 'cigarros: 100 − 20 (caja) − 1 (suelto)');
p = await page.evaluate(() => DB.getProducto('SC-0001'));
igual(p.stock, 8.5, 'jitomate: 10 − 1.5 kg');
paso('la venta descontó bien caja, pieza suelta y kilos');

/* ---------- fiar a un cliente ---------- */
await tecleaVenta('7501055300013');
await tecleaVenta('7501055300013');
await page.click('#btnFiar');
await page.waitForSelector('#mCliente');
await page.selectOption('#mCliente', 'nuevo');
await page.fill('#mNombre', 'Doña Mary');
await page.fill('#mTel', '5512345678');
await page.click('#mOk');
await page.waitForTimeout(500);
await page.click('#mCerrar2');
await page.waitForTimeout(300);
const credito = await page.evaluate(async () => (await DB.creditosPendientes())[0]);
igual(credito.total, 36, 'monto fiado');
igual(credito.nombre, 'Doña Mary', 'cliente del fiado');
paso('fiado de $36 a Doña Mary, agendado para su cobro');

const eventoCobro = await page.evaluate(async () =>
  (await DB.eventosPendientes()).find((e) => e.tipo === 'cobro'));
igual(eventoCobro.telefono, '5512345678', 'el cobro quedó en la agenda con teléfono');
paso('el cobro entró solo al calendario');

/* ---------- abonar ---------- */
await irA('creditos');
await capturar('creditos', true);
await page.click('[data-abonar]');
await page.fill('#mMonto', '20');
await page.dispatchEvent('#mMonto', 'input');
await page.click('#mOk');
await page.waitForTimeout(450);
igual(await page.evaluate(async () => (await DB.creditosPendientes())[0].saldo), 16, 'saldo tras abonar $20');
paso('abono parcial registrado, quedan $16');

/* ---------- agenda de proveedor ---------- */
await irA('agenda');
await page.click('#btnNuevaVisita');
await page.waitForSelector('#mProv');
await page.selectOption('#mProv', 'nuevo');
await page.fill('#mProvNombre', 'Refresquero');
await page.fill('#mProvTel', '5599887766');
await page.click('#mProvCats [data-cat="Bebidas"]');
await page.click('#mOk');
await page.waitForTimeout(500);
const visita = await page.evaluate(async () =>
  (await DB.eventosPendientes()).find((e) => e.tipo === 'proveedor'));
igual(visita.titulo, 'Visita Refresquero', 'visita agendada');
paso('visita de proveedor agendada con su lista de pedido');
await capturar('agenda', true);

/* ---------- cerrar el día ---------- */
await irA('caja');
await page.waitForTimeout(300);
const esperado = await page.inputValue('#cajaContado');
igual(esperado, '670.00', 'esperado en caja: 500 fondo + 150 venta + 20 abono');
await page.click('#btnCerrarDia');
await page.click('#mOk');
await page.waitForTimeout(600);
const corte = await page.evaluate(async () => (await DB.jornadasRecientes(1))[0]);
igual(corte.abierta, false, 'día cerrado');
igual(corte.diferencia, 0, 'la caja cuadra');
igual(corte.totalCredito, 36, 'fiado del día separado del efectivo');
paso('corte de caja: $670 esperados, cuadra, $36 a crédito aparte');
await capturar('corte', true);
await page.click('#mCerrar');

/* ---------- reportes ---------- */
await irA('reportes');
await page.waitForTimeout(300);
await capturar('reportes', true);
const pdfs = await page.evaluate(async () => {
  const cfg = await DB.getConfig();
  const productos = await DB.todosProductos();
  const desde = DB.sumarDias(DB.hoy(), -6), hasta = DB.hoy();
  const resumen = await DB.resumenRango(desde, hasta);
  const out = {};
  const tam = (r) => Math.round(r.doc.output('blob').size / 1024) + ' KB';
  out.compras = tam(await Reportes.listaCompras(productos, cfg, { umbral: 15, categoria: '' }));
  out.inventario = tam(await Reportes.inventario(productos, cfg, {}));
  out.ventas = tam(await Reportes.ventas(resumen, cfg, { productos: await DB.masVendidos(desde, hasta, 10) }));
  out.horas = tam(await Reportes.porHora(await DB.ventasPorHora(desde, hasta), cfg, desde, hasta));
  out.semanal = tam(await Reportes.acumulado(resumen, cfg, 'semana'));
  out.mensual = tam(await Reportes.acumulado(resumen, cfg, 'mes'));
  out.fiados = tam(await Reportes.fiados(await DB.creditosPendientes(), cfg));
  out.corte = tam(await Reportes.corteCaja((await DB.jornadasRecientes(1))[0], cfg));
  const ev = (await DB.eventosPendientes()).find((e) => e.tipo === 'proveedor');
  out.pedido = tam(await Reportes.pedidoProveedor(ev, ev.pedido || [], cfg));
  return out;
});
Object.entries(pdfs).forEach(([k, v]) => {
  if (!v || v === '0 KB') throw new Error('PDF vacío: ' + k);
});
paso('los 9 PDF se generan: ' + Object.entries(pdfs).map(([k, v]) => k + ' ' + v).join(', '));

/* ---------- inventario e inicio ---------- */
await page.click('.barra-inferior [data-vista="inventario"]');
await page.waitForTimeout(350);
await capturar('inventario', true);
await page.click('.barra-inferior [data-vista="inicio"]');
await page.waitForTimeout(350);
await capturar('inicio', true);

const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
if (ancho > 412) throw new Error('la pantalla se desborda a lo ancho: ' + ancho + 'px');
paso('ningún desbordamiento horizontal (412px)');

if (errores.length) {
  console.error('  ✗ errores en consola:\n    ' + errores.join('\n    '));
  process.exitCode = 1;
} else {
  console.log('\nTodo el flujo de la app funciona correctamente.');
}
await navegador.close();
servidor.close();
