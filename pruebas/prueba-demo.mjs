/*
 * Prueba de la versión de prueba (30 minutos para quien abra el enlace).
 *
 * Necesita la llave del dueño, que NO vive en el repositorio:
 *   LLAVE_DUENO=... npm run prueba-demo
 * o dejarla en un archivo .llave (ignorado por git).
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

let LLAVE = process.env.LLAVE_DUENO || '';
if (!LLAVE) {
  try { LLAVE = (await readFile(join(RAIZ, '.llave'), 'utf8')).trim(); } catch {}
}
if (!LLAVE) {
  console.error('Falta la llave del dueño: LLAVE_DUENO=... npm run prueba-demo');
  process.exit(1);
}

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
const URL_APP = 'http://localhost:' + PUERTO + '/index.html';

const navegador = await chromium.launch({ executablePath: await rutaChromium() });
const errores = [];
async function nuevoCelular() {
  const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  return { ctx, page };
}
const irAjustes = async (page) => {
  await page.click('#btnMenu');
  await page.waitForTimeout(250);
  await page.click('.cajon-menu button[data-vista="ajustes"]');
  await page.waitForTimeout(500);
};

/* ============ 1. El celular de la clienta: abre el enlace ============ */
const cliente = await nuevoCelular();
{
  const { page } = cliente;
  await page.goto(URL_APP);
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(1200);

  await page.waitForSelector('#modalCaja h2', { timeout: 5000 });
  const bienvenida = await page.textContent('#modalCaja');
  if (!/30 minutos/.test(bienvenida)) throw new Error('no dio la bienvenida de prueba: ' + bienvenida.slice(0, 80));
  paso('al abrir el enlace, la clienta ve el aviso de prueba de 30 minutos');
  await page.click('#mOk');

  const chip = (await page.textContent('#chipDemo')).trim();
  if (!/⏳/.test(chip)) throw new Error('no se ve el contador: ' + chip);
  igual(await page.evaluate(() => Demo.estado().liberado), false, 'el celular de la clienta está en prueba');
  paso('arriba le aparece el contador: "' + chip + '"');

  // Usa la app con normalidad
  await page.evaluate(async () => {
    await DB.guardarProducto({ codigo: '7501055300013', nombre: 'Coca Cola 600 ml', categoria: 'Bebidas',
      costo: 12, precio: 18, stock: 0, minimo: 6 });
    await DB.agregarExistencia('7501055300013', 24, 12);
  });
  await page.click('.barra-inferior [data-vista="vender"]');
  await page.click('#btnTecleadoVender');
  await page.fill('#mCod', '7501055300013');
  await page.click('#mOk');
  await page.waitForTimeout(300);
  igual(await page.textContent('#carritoTotal'), '$18.00', 'la clienta puede usar la app');
  paso('durante la prueba la app funciona completa');

  // Corre el tiempo
  const antes = await page.evaluate(() => Demo.estado().usadosMs);
  await page.waitForTimeout(11000);
  const despues = await page.evaluate(() => Demo.estado().usadosMs);
  if (!(despues > antes)) throw new Error('el tiempo no corrió');
  paso('el tiempo corre mientras usa la app (' + Math.round(despues / 1000) + ' s)');

  // Se le acaba
  await page.evaluate(async () => {
    const d = Demo.estado();
    d.usadosMs = Demo.limiteMs() - 2000;
    await DB.setConfig('prueba', d);
  });
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  paso('al cumplirse los 30 minutos se bloquea');
  await page.screenshot({ path: '/tmp/prueba-bloqueo.png' });

  await page.reload();
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  paso('sigue bloqueada aunque cierre y vuelva a abrir');

  await page.fill('#pinDemo', 'libre-0000-0000');
  await page.click('#btnDesbloquear');
  await page.waitForTimeout(1500);
  if (!(await page.$('#bloqueoDemo'))) throw new Error('¡se abrió con una llave inventada!');
  paso('con una llave inventada no se abre');

  await page.evaluate(() => localStorage.removeItem('tienda-prueba'));
  await page.reload();
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  paso('borrar el rastro del navegador no le regala otra prueba');

  // El dueño llega con su llave
  await page.fill('#pinDemo', LLAVE);
  await page.click('#btnDesbloquear');
  await page.waitForTimeout(2500);
  if (await page.$('#bloqueoDemo')) throw new Error('la llave correcta no desbloqueó');
  igual(await page.evaluate(() => Demo.estado().liberado), true, 'quedó liberado');
  paso('con la llave correcta queda activada la versión completa');

  await page.reload();
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(800);
  if (await page.$('#bloqueoDemo')) throw new Error('volvió a bloquearse tras recargar');
  igual(await page.evaluate(() => DB.getProducto('7501055300013').then((p) => p.stock)), 24, 'inventario intacto');
  paso('sigue activada al reabrir y el inventario quedó intacto');
  await cliente.ctx.close();
}

/* ============ 2. Otro celular: la llave en el enlace ============ */
{
  const { ctx, page } = await nuevoCelular();
  await page.goto(URL_APP + '?llave=' + encodeURIComponent(LLAVE));
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(2500);
  igual(await page.evaluate(() => Demo.estado().liberado), true, 'el enlace con llave activa el celular');
  igual(await page.evaluate(() => location.search.includes('llave')), false, 'la llave se borra de la dirección');
  igual(await page.evaluate(() => !!document.querySelector('#chipDemo:not(.oculto)')), false, 'sin contador de prueba');
  paso('abriendo el enlace con la llave, el celular del dueño queda activado (y la llave desaparece de la dirección)');
  await ctx.close();
}

/* ============ 3. Celular que ya tenía la tienda cargada ============ */
{
  const { ctx, page } = await nuevoCelular();
  await page.goto(URL_APP);
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(900);
  // Simula una tienda que ya venía usando la app antes de esta versión
  await page.evaluate(async () => {
    await DB.guardarProducto({ codigo: '7501030465102', nombre: 'Sabritas', categoria: 'Botanas',
      costo: 10, precio: 16, stock: 0, minimo: 4 });
    await DB.agregarExistencia('7501030465102', 10, 10);
    await DB.setConfig('prueba', null);
    localStorage.removeItem('tienda-prueba');
  });
  await page.reload();
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(1200);
  igual(await page.evaluate(() => Demo.estado().liberado), true,
    'un celular que ya tenía productos no entra en modo prueba');
  if (await page.$('#bloqueoDemo')) throw new Error('bloqueó el celular de la tienda');
  paso('el celular que ya tenía productos registrados NO entra en prueba: sigue completo');
  await ctx.close();
}

if (errores.length) {
  console.error('  ✗ errores en consola:\n    ' + errores.join('\n    '));
  process.exitCode = 1;
} else {
  console.log('\nLa prueba de 30 minutos funciona y solo la llave del dueño la levanta.');
}
await navegador.close();
servidor.close();
