/*
 * Prueba del modo demostración (prueba de X minutos y luego bloqueo).
 *   npm run prueba-demo
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, access } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8082;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const servidor = createServer(async (req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  try {
    const datos = await readFile(join(RAIZ, normalize(ruta)));
    res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
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

const paso = (t) => console.log('  ✓ ' + t);
const igual = (a, b, msg) => { if (a !== b) throw new Error(msg + ' (fue ' + JSON.stringify(a) + ', se esperaba ' + JSON.stringify(b) + ')'); };

const navegador = await chromium.launch({ executablePath: await rutaChromium() });
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 } });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });

const irAjustes = async () => {
  await page.click('#btnMenu');
  await page.waitForTimeout(250);
  await page.click('.cajon-menu button[data-vista="ajustes"]');
  await page.waitForTimeout(400);
};

await page.goto('http://localhost:' + PUERTO + '/index.html');
await page.waitForSelector('#vista-inicio.activa');
await page.waitForTimeout(700);

/* Datos de la tienda antes de prestar el celular */
await page.evaluate(async () => {
  await DB.guardarProducto({ codigo: '7501055300013', nombre: 'Coca Cola 600 ml', categoria: 'Bebidas',
    costo: 12, precio: 18, stock: 0, minimo: 6 });
  await DB.agregarExistencia('7501055300013', 24, 12);
});
paso('la tienda tenía 24 piezas registradas antes de la demostración');

/* 1. Encender el modo demostración */
await irAjustes();
await page.fill('#demoMinutos', '1');
await page.fill('#demoPin', '2468');
await page.click('#btnIniciarDemo');
await page.waitForSelector('#mOk');
await page.click('#mOk');
await page.waitForTimeout(400);
igual(await page.evaluate(() => Demo.estado().activo), true, 'la prueba quedó activa');
const chip = await page.textContent('#chipDemo');
if (!/⏳/.test(chip)) throw new Error('no se ve el contador arriba: ' + chip);
paso('prueba de 1 minuto activada, con contador a la vista: "' + chip.trim() + '"');

/* 2. El tiempo corre con la app abierta */
const usados0 = await page.evaluate(() => Demo.estado().usadosMs);
await page.waitForTimeout(12000);
const usados1 = await page.evaluate(() => Demo.estado().usadosMs);
if (!(usados1 > usados0 && usados1 >= 9000)) {
  throw new Error('el tiempo no corrió: ' + usados0 + ' → ' + usados1);
}
paso('el tiempo de uso corre solo (' + Math.round(usados1 / 1000) + ' s en 12 s de uso)');

/* 3. El cliente usa la app normalmente durante la prueba */
await page.click('.barra-inferior [data-vista="vender"]');
await page.click('#btnTecleadoVender');
await page.fill('#mCod', '7501055300013');
await page.click('#mOk');
await page.waitForTimeout(300);
igual(await page.textContent('#carritoTotal'), '$18.00', 'el cliente puede usar la app durante la prueba');
paso('durante la prueba la app funciona normal');

/* 4. Se acaba el tiempo → bloqueo */
await page.evaluate(async () => {
  const d = Demo.estado();
  d.usadosMs = Demo.limiteMs() - 2000;          // faltando 2 segundos
  await DB.setConfig('demo', d);
});
await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
paso('al agotarse el tiempo apareció la pantalla de bloqueo');
await page.screenshot({ path: '/tmp/demo-bloqueo.png' });

/* 5. Sigue bloqueada aunque se cierre y se vuelva a abrir */
await page.reload();
await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
paso('sigue bloqueada al cerrar y volver a abrir la app');

/* 6. Un PIN equivocado no abre */
await page.fill('#pinDemo', '1111');
await page.click('#btnDesbloquear');
await page.waitForTimeout(500);
if (!(await page.$('#bloqueoDemo'))) throw new Error('¡se desbloqueó con un PIN equivocado!');
igual((await page.textContent('#errorPin')).trim(), 'Ese PIN no es correcto.', 'avisa del PIN equivocado');
paso('con el PIN equivocado no se desbloquea');

/* 7. Borrar una de las dos copias no reinicia la prueba */
await page.evaluate(() => localStorage.removeItem('tienda-demo'));
await page.reload();
await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
paso('borrar el rastro del navegador no reinicia la prueba (hay dos copias)');

/* 8. El PIN correcto la desbloquea y los datos siguen ahí */
await page.fill('#pinDemo', '2468');
await page.click('#btnDesbloquear');
await page.waitForTimeout(800);
if (await page.$('#bloqueoDemo')) throw new Error('el PIN correcto no desbloqueó');
paso('con el PIN correcto se desbloquea');

const prod = await page.evaluate(() => DB.getProducto('7501055300013'));
igual(prod.stock, 24, 'el inventario siguió intacto');
igual(await page.evaluate(() => Demo.estado().activo), false, 'el modo prueba quedó apagado');
paso('el inventario quedó intacto (24 piezas) y la app quedó libre');

/* 9. Ya desbloqueada, se puede volver a usar */
await page.click('.barra-inferior [data-vista="vender"]');
await page.waitForTimeout(300);
igual(await page.evaluate(() => !!document.querySelector('#vista-vender.activa')), true, 'la app responde');
paso('la app volvió a funcionar con normalidad');

if (errores.length) {
  console.error('  ✗ errores en consola:\n    ' + errores.join('\n    '));
  process.exitCode = 1;
} else {
  console.log('\nEl modo demostración bloquea a tiempo y solo el PIN del dueño lo abre.');
}
await navegador.close();
servidor.close();
