/*
 * Comprueba que actualizar la app NO borra lo que ya está registrado.
 *
 * Simula un celular con la versión 1 instalada: registra productos, ventas y
 * ajustes; después sirve la versión 2 en la misma dirección (misma base de
 * datos del navegador) y verifica que todo siga ahí y funcione.
 *   npm run prueba-actualizacion
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, access, rm, mkdir, cp } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPORAL = process.env.TMPDIR_PRUEBA || '/tmp/prueba-actualizacion';
const SERVIDO = join(TEMPORAL, 'servido');
const VERSION_VIEJA = process.env.VERSION_VIEJA || '0f3a622';   // primera versión publicada
const PUERTO = 8090;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const paso = (t) => console.log('  ✓ ' + t);
const igual = (a, b, msg) => { if (a !== b) throw new Error(msg + ' (fue ' + JSON.stringify(a) + ', se esperaba ' + JSON.stringify(b) + ')'); };

/* 1. Dejar en la carpeta servida la versión vieja */
await rm(TEMPORAL, { recursive: true, force: true });
await mkdir(SERVIDO, { recursive: true });
execFileSync('bash', ['-c',
  'cd ' + JSON.stringify(RAIZ) + ' && git archive ' + VERSION_VIEJA + ' | tar -x -C ' + JSON.stringify(SERVIDO)]);

const servidor = createServer(async (req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  try {
    const datos = await readFile(join(SERVIDO, normalize(ruta)));
    res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream',
      'cache-control': 'no-store' });
    res.end(datos);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => servidor.listen(PUERTO, r));

async function rutaChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return undefined;
  try {
    for (const d of (await readdir(base)).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      const ruta = join(base, d, 'chrome-linux', 'chrome');
      try { await access(ruta); return ruta; } catch {}
    }
  } catch {}
  return undefined;
}

const navegador = await chromium.launch({ executablePath: await rutaChromium() });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 } });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });

/* 2. Usar la app vieja como la usaría la tienda */
await page.goto('http://localhost:' + PUERTO + '/index.html');
await page.waitForTimeout(600);
const versionVieja = await page.evaluate(() => indexedDB.databases().then((d) => d[0].version));
igual(versionVieja, 1, 'la app vieja usa la base versión 1');
paso('versión 1 abierta (base de datos versión 1)');

await page.evaluate(async () => {
  await DB.setConfig('tienda', 'Abarrotes Molina');
  await DB.guardarProducto({ codigo: '7501055300013', nombre: 'Coca Cola 600 ml', categoria: 'Bebidas', costo: 12, precio: 18, stock: 0, minimo: 6 });
  await DB.guardarProducto({ codigo: '7501030465102', nombre: 'Sabritas', categoria: 'Botanas', costo: 10, precio: 16, stock: 0, minimo: 4 });
  await DB.agregarExistencia('7501055300013', 24, 12);
  await DB.agregarExistencia('7501030465102', 10, 10);
  await DB.registrarVenta([{ codigo: '7501055300013', nombre: 'Coca Cola 600 ml', cantidad: 3, precio: 18, costo: 12 }], { recibido: 100, cambio: 46 });
});
const antes = await page.evaluate(async () => ({
  productos: (await DB.todosProductos()).length,
  stockCoca: (await DB.getProducto('7501055300013')).stock,
  invertido: (await DB.getProducto('7501055300013')).invertido,
  ventas: (await DB.todasVentas()).length,
  vendidoHoy: (await DB.resumenDia(DB.hoy())).total,
  tienda: (await DB.getConfig()).tienda
}));
igual(antes.productos, 2, 'productos registrados con la versión vieja');
igual(antes.stockCoca, 21, 'existencia tras la venta');
igual(antes.vendidoHoy, 54, 'venta del día');
paso('la tienda registró 2 productos, una venta de $54 y su nombre');

/* Una tienda de verdad lleva días usando la app: se envejecen los productos
   para que la versión nueva la reconozca y no le pida clave de acceso. */
await page.evaluate(() => new Promise((listo, falla) => {
  const req = indexedDB.open('tienda-abarrotes');
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('productos', 'readwrite');
    const os = tx.objectStore('productos');
    const todos = os.getAll();
    todos.onsuccess = () => todos.result.forEach((p) => {
      p.creado = '2026-09-01T10:00:00.000Z';
      os.put(p);
    });
    tx.oncomplete = () => listo();
    tx.onerror = () => falla(tx.error);
  };
  req.onerror = () => falla(req.error);
}));

/* 3. Publicar la versión nueva en la misma dirección */
await rm(SERVIDO, { recursive: true, force: true });
await mkdir(SERVIDO, { recursive: true });
for (const carpeta of ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'js', 'vendor', 'icons']) {
  await cp(join(RAIZ, carpeta), join(SERVIDO, carpeta), { recursive: true });
}
paso('se publicó la versión 2 en la misma dirección');

/* 4. Actualizar, como en el celular.
      Chrome revisa solo si hay versión nueva del service worker al abrir la
      app; aquí se dispara esa misma revisión a mano para no depender de su
      calendario interno. (Desde la versión 2 la app además la pide sola al
      arrancar: ver prepararActualizaciones en js/app.js.) */
await page.reload();
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const registro = await navigator.serviceWorker.getRegistration();
  await registro.update();
});
await page.waitForTimeout(2000);
await page.reload();
await page.waitForSelector('#vista-inicio.activa', { timeout: 15000 });
await page.waitForTimeout(900);

const versionNueva = await page.evaluate(() => indexedDB.databases().then((d) => d[0].version));
igual(versionNueva, 2, 'la app nueva migró la base a la versión 2');

const despues = await page.evaluate(async () => {
  const coca = await DB.getProducto('7501055300013');
  return {
    productos: (await DB.todosProductos()).length,
    stockCoca: coca.stock,
    invertido: coca.invertido,
    nombreCoca: coca.nombre,
    tipoVenta: coca.tipoVenta,
    piezasPorPaquete: coca.piezasPorPaquete,
    ventas: (await DB.todasVentas()).length,
    vendidoHoy: (await DB.resumenDia(DB.hoy())).total,
    tienda: (await DB.getConfig()).tienda,
    movimientos: (await DB.movimientosDe('7501055300013')).length
  };
});

igual(despues.productos, antes.productos, 'los productos siguen ahí');
igual(despues.stockCoca, antes.stockCoca, 'la existencia no se movió');
igual(despues.invertido, antes.invertido, 'lo invertido se conserva');
igual(despues.ventas, antes.ventas, 'las ventas siguen ahí');
igual(despues.vendidoHoy, antes.vendidoHoy, 'las cuentas del día se conservan');
igual(despues.tienda, 'Abarrotes Molina', 'el nombre de la tienda se conserva');
igual(despues.movimientos, 2, 'el historial de movimientos se conserva');
paso('tras actualizar: mismos productos, existencias, ventas, historial y ajustes');

igual(despues.tipoVenta, 'pieza', 'los productos viejos quedan como "por pieza"');
igual(despues.piezasPorPaquete, 1, 'y con paquete de 1 pieza');
paso('los productos viejos se adaptaron solos al formato nuevo');

/* 5. Y la app nueva sigue funcionando con esos datos */
await page.click('.barra-inferior [data-vista="vender"]');
await page.click('#btnTecleadoVender');
await page.fill('#mCod', '7501055300013');
await page.click('#mOk');
await page.waitForTimeout(300);
igual(await page.textContent('#carritoTotal'), '$18.00', 'se puede vender un producto viejo');
await page.click('#btnCobrar');
await page.waitForTimeout(400);
const solo = await page.$('#mSolo');
if (solo) { await solo.click(); await page.waitForTimeout(500); }
const seguir = await page.$('#mSeguir');
if (seguir) await seguir.click();
igual(await page.evaluate(() => DB.getProducto('7501055300013').then((p) => p.stock)), 20,
  'la venta nueva descuenta sobre la existencia vieja');
paso('se puede seguir vendiendo lo registrado antes');

if (errores.length) {
  console.error('  ✗ errores en consola:\n    ' + errores.join('\n    '));
  process.exitCode = 1;
} else {
  console.log('\nActualizar la app NO borra nada de lo registrado.');
}
await navegador.close();
servidor.close();
await rm(TEMPORAL, { recursive: true, force: true });
