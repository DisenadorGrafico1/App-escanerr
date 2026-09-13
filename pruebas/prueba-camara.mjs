/*
 * Prueba del escáner con una cámara simulada.
 * Requiere Playwright + Chromium y el video de prueba:
 *   npm install && python3 pruebas/generar-codigo-barras.py && node pruebas/prueba-camara.mjs
 *
 * Chromium recibe un video con un código de barras EAN-13 real y la prueba
 * comprueba el flujo completo: alta → sumar piezas → vender → descontar.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, access, readdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = '/tmp/barras.y4m';
const PUERTO = 8098;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

try { await access(VIDEO); } catch {
  console.error('Falta ' + VIDEO + '. Ejecuta antes: python3 pruebas/generar-codigo-barras.py');
  process.exit(1);
}

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

/* Busca un Chromium ya instalado (útil cuando la versión de Playwright
   no coincide con la del navegador descargado). */
async function rutaChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return undefined;
  try {
    const dirs = (await readdir(base)).filter((d) => d.startsWith('chromium-')).sort();
    for (const d of dirs.reverse()) {
      const ruta = join(base, d, 'chrome-linux', 'chrome');
      try { await access(ruta); return ruta; } catch {}
    }
  } catch {}
  return undefined;
}

const navegador = await chromium.launch({
  executablePath: await rutaChromium(),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
         '--use-file-for-fake-video-capture=' + VIDEO, '--autoplay-policy=no-user-gesture-required']
});
const ctx = await navegador.newContext({ viewport: { width: 412, height: 880 }, permissions: ['camera'] });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

const CODIGO = '7501055300013';
const paso = (txt) => console.log('  ✓ ' + txt);

await page.goto('http://localhost:' + PUERTO + '/index.html');
await page.waitForTimeout(500);

// 1. Alta escaneando un código desconocido
await page.click('.barra-inferior [data-vista="agregar"]');
await page.click('#btnCamaraAgregar');
await page.waitForSelector('#panelProducto:not([hidden])', { timeout: 25000 });
paso('la cámara leyó un código nuevo y abrió el alta');
await page.fill('#fNombre', 'Coca Cola 600 ml');
await page.selectOption('#fCategoria', 'Bebidas');
await page.fill('#fCosto', '12'); await page.fill('#fPrecio', '18');
await page.fill('#fPiezas', '24'); await page.fill('#fMinimo', '6');
await page.click('#btnGuardarEntrada');
await page.waitForTimeout(400);
let p = await page.evaluate((c) => DB.getProducto(c), CODIGO);
if (p.stock !== 24 || p.invertido !== 288) throw new Error('alta incorrecta: ' + JSON.stringify(p));
paso('alta con 24 piezas y $288 invertidos');

// 2. Volver a escanear el mismo producto suma piezas
await page.click('#btnCamaraAgregar');
await page.waitForSelector('#panelProducto:not([hidden])', { timeout: 25000 });
await page.fill('#fPiezas', '12');
await page.click('#btnGuardarEntrada');
await page.waitForTimeout(400);
p = await page.evaluate((c) => DB.getProducto(c), CODIGO);
if (p.stock !== 36 || p.invertido !== 432) throw new Error('no acumuló: ' + JSON.stringify(p));
paso('re-escaneo acumuló 36 piezas y $432 invertidos');

// 3. Vender escaneando
await page.click('.barra-inferior [data-vista="vender"]');
await page.click('#btnCamaraVender');
await page.waitForFunction(() => document.querySelector('#carritoPiezas').textContent !== '0', { timeout: 25000 });
paso('el escaneo agregó el producto al carrito');
await page.waitForTimeout(4000);
// Se pausa la cámara para que no entre otra lectura mientras se cuenta.
await page.click('#btnCamaraVender');
await page.waitForTimeout(500);
const piezas = Number(await page.textContent('#carritoPiezas'));
if (piezas < 2 || piezas > 6) throw new Error('el filtro anti-duplicados falló: ' + piezas);
paso('lecturas repetidas espaciadas correctamente (' + piezas + ' en ~4s)');
await page.click('#btnCobrar');
await page.waitForTimeout(400);
// La app pregunta si quiere abrir el día; aquí solo cobramos.
const soloCobrar = await page.$('#mSolo');
if (soloCobrar) { await soloCobrar.click(); await page.waitForTimeout(500); }
const seguir = await page.$('#mSeguir');
if (seguir) await seguir.click();
await page.waitForTimeout(300);
p = await page.evaluate((c) => DB.getProducto(c), CODIGO);
if (p.stock !== 36 - piezas) throw new Error('no descontó bien: ' + p.stock);
paso('la venta descontó ' + piezas + ' piezas (quedan ' + p.stock + ')');
const dia = await page.evaluate(() => DB.resumenDia(DB.hoy()));
if (dia.total !== piezas * 18 || dia.ganancia !== piezas * 6) throw new Error('cuentas del día mal: ' + JSON.stringify(dia));
paso('cuentas del día: $' + dia.total + ' vendido, $' + dia.ganancia + ' de ganancia');

if (errores.length) { console.error('  ✗ errores en consola: ' + errores.join(' | ')); process.exitCode = 1; }
else console.log('\nEscáner y ventas funcionando correctamente.');
await navegador.close();
servidor.close();
