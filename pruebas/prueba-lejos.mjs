/*
 * Comprueba el comportamiento cuando el producto está LEJOS de la cámara:
 * la app no debe registrar nada y debe pedir que se acerque el código.
 * (Era el problema real: de lejos "adivinaba" números.)
 *   npm run prueba-lejos
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, access } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';


const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8086;
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
let fallas = 0;

/** Abre la app con un video de cámara falso y devuelve la página. */
async function abrirCon(video) {
  const navegador = await chromium.launch({
    executablePath: await rutaChromium(),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--use-file-for-fake-video-capture=' + video, '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, permissions: ['camera'] });
    const page = await ctx.newPage();
  await page.goto('http://localhost:' + PUERTO + '/index.html');
  await page.waitForTimeout(700);
  await page.evaluate(async () => {
    await DB.guardarProducto({ codigo: '7501055300013', nombre: 'Coca Cola 600 ml', categoria: 'Bebidas',
      costo: 12, precio: 18, stock: 0, minimo: 6 });
    await DB.agregarExistencia('7501055300013', 24, 12);
  });
  await page.reload();
  await page.waitForTimeout(700);
  return { navegador, page };
}

/* ---------- 1. El código LEJOS: no debe registrar nada ---------- */
{
  const { navegador, page } = await abrirCon('/tmp/barras-lejos.y4m');
  await page.click('.barra-inferior [data-vista="vender"]');
  await page.click('#btnCamaraVender');
  await page.waitForTimeout(9000);

  const piezas = await page.textContent('#carritoPiezas');
  const pista = await page.textContent('#pistaVender');
  const oculta = await page.evaluate(() => document.querySelector('#pistaVender').classList.contains('oculto'));

  if (piezas !== '0') { console.error('  ✗ registró algo con el código lejos: ' + piezas); fallas++; }
  else paso('con el código lejos no registró nada (carrito vacío)');

  if (oculta || !/[Aa]cerca|[Aa]punta/.test(pista)) {
    console.error('  ✗ no mostró el aviso de acercar el código (decía: "' + pista + '")');
    fallas++;
  } else {
    paso('mostró el aviso en pantalla: "' + pista + '"');
  }
  await page.screenshot({ path: '/tmp/lejos.png' });
  await navegador.close();
}

/* ---------- 2. El mismo código CERCA: sí debe registrarlo ---------- */
{
  const { navegador, page } = await abrirCon('/tmp/barras.y4m');
  await page.click('.barra-inferior [data-vista="vender"]');
  const t0 = Date.now();
  await page.click('#btnCamaraVender');
  try {
    await page.waitForFunction(() => document.querySelector('#carritoPiezas').textContent !== '0', { timeout: 20000 });
    paso('con el código cerca lo registró en ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    const total = await page.textContent('#carritoTotal');
    if (total !== '$18.00') { console.error('  ✗ registró un precio raro: ' + total); fallas++; }
    else paso('registró el producto correcto (' + total + ')');
  } catch {
    console.error('  ✗ con el código cerca no lo leyó');
    fallas++;
  }
  await navegador.close();
}

console.log(fallas ? '\n' + fallas + ' problema(s)' : '\nDe lejos avisa y no registra; de cerca lee bien.');
if (fallas) process.exitCode = 1;
servidor.close();
