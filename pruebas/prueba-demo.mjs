/*
 * Prueba de la puerta de acceso: la app pide clave y la clave de prueba
 * abre 30 minutos de uso.
 *
 * Necesita las claves, que NO viven en el repositorio:
 *   LLAVE_DUENO=... CLAVE_PRUEBA=... npm run prueba-demo
 * o dejarlas en un archivo .llave (ignorado por git): llave del dueño en la
 * primera línea, clave de prueba en la tercera.
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
let PRUEBA = process.env.CLAVE_PRUEBA || '';
if (!LLAVE || !PRUEBA) {
  try {
    const lineas = (await readFile(join(RAIZ, '.llave'), 'utf8')).split('\n').map((l) => l.trim());
    LLAVE = LLAVE || lineas[0];
    PRUEBA = PRUEBA || lineas[3];
  } catch {}
}
if (!LLAVE || !PRUEBA) {
  console.error('Faltan las claves: LLAVE_DUENO=... CLAVE_PRUEBA=... npm run prueba-demo');
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
const escribirClave = async (page, clave) => {
  await page.fill('#pinDemo', clave);
  await page.click('#btnDesbloquear');
  await page.waitForTimeout(2500);
};

/* ============ 1. La clienta abre el enlace ============ */
const cliente = await nuevoCelular();
{
  const { page } = cliente;
  await page.goto(URL_APP);
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  const puerta = await page.textContent('#bloqueoDemo');
  if (!/Escribe tu clave/.test(puerta)) throw new Error('no pidió clave: ' + puerta.slice(0, 80));
  paso('al abrir el enlace pide la clave antes de dejar usar nada');
  await page.screenshot({ path: '/tmp/puerta.png' });

  await escribirClave(page, 'lo-que-sea');
  if (!(await page.$('#bloqueoDemo'))) throw new Error('entró con una clave inventada');
  igual((await page.textContent('#errorPin')).trim(), 'Esa clave no es correcta.', 'avisa de clave incorrecta');
  paso('con una clave inventada no entra');

  await escribirClave(page, PRUEBA);
  if (await page.$('#bloqueoDemo')) throw new Error('la clave de prueba no abrió la app');
  await page.waitForTimeout(500);
  const bienvenida = await page.textContent('#modalCaja');
  if (!/30 minutos/.test(bienvenida)) throw new Error('no dio la bienvenida: ' + bienvenida.slice(0, 60));
  await page.click('#mOk');
  const chip = (await page.textContent('#chipDemo')).trim();
  if (!/⏳/.test(chip)) throw new Error('no se ve el contador: ' + chip);
  paso('con la clave de prueba entra y arrancan los 30 minutos ("' + chip + '")');

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
  igual(await page.textContent('#carritoTotal'), '$18.00', 'la app funciona durante la prueba');
  paso('durante la prueba la app funciona completa');

  const antes = await page.evaluate(() => Demo.estado().usadosMs);
  await page.waitForTimeout(11000);
  if (!((await page.evaluate(() => Demo.estado().usadosMs)) > antes)) throw new Error('el tiempo no corrió');
  paso('el tiempo corre mientras la usa');

  await page.reload();
  await page.waitForTimeout(1200);
  if (await page.$('#bloqueoDemo')) throw new Error('volvió a pedir clave dentro de la prueba');
  paso('si cierra y vuelve a abrir, sigue dentro de su prueba (no pide clave otra vez)');

  await page.evaluate(async () => {
    const d = Demo.estado();
    d.usadosMs = Demo.limiteMs() - 2000;
    await DB.setConfig('acceso', d);
  });
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  const agotada = await page.textContent('#bloqueoDemo');
  if (!/Se terminó tu prueba/.test(agotada)) throw new Error('no avisó del fin de la prueba');
  paso('al cumplirse los 30 minutos se cierra y avisa');
  await page.screenshot({ path: '/tmp/prueba-bloqueo.png' });

  await escribirClave(page, PRUEBA);
  if (!(await page.$('#bloqueoDemo'))) throw new Error('la clave de prueba volvió a abrir la app');
  if (!/ya se usó/.test(await page.textContent('#errorPin'))) throw new Error('no avisó que la prueba ya se usó');
  paso('la clave de prueba ya no sirve en ese celular ("ya se usó")');

  await page.evaluate(() => localStorage.removeItem('tienda-acceso'));
  await page.reload();
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  await escribirClave(page, PRUEBA);
  if (!(await page.$('#bloqueoDemo'))) throw new Error('borrando el rastro consiguió otra prueba');
  paso('borrar el rastro del navegador no le da otra prueba');

  await escribirClave(page, LLAVE);
  if (await page.$('#bloqueoDemo')) throw new Error('la llave del dueño no activó');
  igual(await page.evaluate(() => Demo.estado().liberado), true, 'quedó activado');
  paso('con tu llave queda activada la versión completa');

  await page.reload();
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(900);
  if (await page.$('#bloqueoDemo')) throw new Error('volvió a pedir clave');
  igual(await page.evaluate(() => DB.getProducto('7501055300013').then((p) => p.stock)), 24, 'inventario intacto');
  paso('ya no pide clave al abrir y el inventario quedó intacto');
  await cliente.ctx.close();
}

/* ============ 2. Claves en el enlace ============ */
{
  const { ctx, page } = await nuevoCelular();
  await page.goto(URL_APP + '?llave=' + encodeURIComponent(LLAVE));
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(2500);
  igual(await page.evaluate(() => Demo.estado().liberado), true, 'el enlace con tu llave activa el celular');
  igual(await page.evaluate(() => location.search.includes('llave')), false, 'la llave se borra de la dirección');
  paso('tu enlace con llave activa el celular sin pedir nada');
  await ctx.close();
}
{
  const { ctx, page } = await nuevoCelular();
  await page.goto(URL_APP + '?clave=' + encodeURIComponent(PRUEBA));
  await page.waitForTimeout(2500);
  igual(await page.evaluate(() => Demo.estado().pruebaActivada), true, 'el enlace con la clave de prueba abre la prueba');
  if (await page.$('#bloqueoDemo')) throw new Error('siguió pidiendo clave');
  paso('también puedes mandar el enlace con la clave de prueba ya puesta');
  await ctx.close();
}

/* ============ 3. Un cliente que ya usó la prueba no se cuela ============ */
{
  const { ctx, page } = await nuevoCelular();
  await page.goto(URL_APP + '?clave=' + encodeURIComponent(PRUEBA));
  await page.waitForTimeout(2000);
  // Registra productos durante su prueba (con fecha de hoy) y borra el rastro
  await page.evaluate(async () => {
    await DB.guardarProducto({ codigo: '7501030465102', nombre: 'Sabritas', categoria: 'Botanas',
      costo: 10, precio: 16, stock: 0, minimo: 4 });
    await DB.agregarExistencia('7501030465102', 10, 10);
    await DB.setConfig('acceso', null);
    localStorage.removeItem('tienda-acceso');
  });
  await page.reload();
  await page.waitForSelector('#bloqueoDemo', { timeout: 15000 });
  paso('un cliente que registró productos en su prueba no se cuela: le vuelve a pedir clave');
  await ctx.close();
}

/* ============ 4. Celular que ya tenía la tienda cargada ============ */
{
  const { ctx, page } = await nuevoCelular();
  await page.goto(URL_APP + '?llave=' + encodeURIComponent(LLAVE));
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    // Producto registrado ANTES de que existiera la clave (tienda de siempre)
    await DB.guardarProducto({ codigo: '7501030465102', nombre: 'Sabritas', categoria: 'Botanas',
      costo: 10, precio: 16, stock: 0, minimo: 4 });
    const p = await DB.getProducto('7501030465102');
    p.creado = '2026-09-10T10:00:00.000Z';
    await DB.guardarProducto(p);
    await DB.setConfig('acceso', null);
    localStorage.removeItem('tienda-acceso');
  });
  await page.reload();
  await page.waitForSelector('#vista-inicio.activa');
  await page.waitForTimeout(1500);
  igual(await page.evaluate(() => Demo.estado().liberado), true, 'un celular con productos viejos no pide clave');
  if (await page.$('#bloqueoDemo')) throw new Error('le pidió clave a la tienda');
  paso('el celular de la tienda (productos de antes) NO queda encerrado: entra directo');
  await ctx.close();
}

if (errores.length) {
  console.error('  ✗ errores en consola:\n    ' + errores.join('\n    '));
  process.exitCode = 1;
} else {
  console.log('\nLa app pide clave, la de prueba da 30 minutos y solo tu llave la abre sin límite.');
}
await navegador.close();
servidor.close();
