/*
 * Mide la precisión del escáner sin necesitar cámara: dibuja códigos EAN-13
 * reales en un lienzo, de cerca y de lejos, nítidos y borrosos, y comprueba
 * dos cosas:
 *   1. Que de cerca los lea bien.
 *   2. Que NUNCA registre un número equivocado (prefiere no leer).
 *   npm run prueba-precision
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, access } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8087;
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

const navegador = await chromium.launch({ executablePath: await rutaChromium() });
const page = await (await navegador.newContext()).newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto('http://localhost:' + PUERTO + '/index.html');
await page.waitForTimeout(700);

/* Dibuja un EAN-13 de verdad en un lienzo y lo pasa por el motor. */
const resultados = await page.evaluate(async () => {
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R = L.map((p) => p.split('').map((c) => (c === '0' ? '1' : '0')).join(''));
  const PAR = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  const bits = (codigo) => {
    const d = codigo.split('').map(Number);
    let b = '101';
    PAR[d[0]].split('').forEach((par, i) => { b += (par === 'L' ? L : G)[d[i + 1]]; });
    b += '01010';
    for (let i = 7; i < 13; i++) b += R[d[i]];
    return b + '101';
  };

  /**
   * @param fraccion  qué tanto del recuadro ocupa el código (1 = pegado, 0.2 = lejos)
   * @param desenfoque  píxeles de borrosidad (la cámara de lejos se desenfoca)
   * @param ruido  cuánto ruido de sensor se le añade
   */
  const dibujar = (codigo, fraccion, desenfoque, ruido) => {
    const ANCHO = 900, ALTO = 320;
    const c = document.createElement('canvas');
    c.width = ANCHO; c.height = ALTO;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, ANCHO, ALTO);
    const patron = bits(codigo);
    const anchoCodigo = ANCHO * fraccion;
    const modulo = anchoCodigo / patron.length;
    const x0 = (ANCHO - anchoCodigo) / 2;
    if (desenfoque) ctx.filter = 'blur(' + desenfoque + 'px)';
    ctx.fillStyle = '#000';
    patron.split('').forEach((bit, i) => {
      if (bit === '1') ctx.fillRect(x0 + i * modulo, ALTO * 0.15, modulo, ALTO * 0.7);
    });
    ctx.filter = 'none';
    if (ruido) {
      const img = ctx.getImageData(0, 0, ANCHO, ALTO);
      for (let i = 0; i < img.data.length; i += 4) {
        const r = (Math.random() - 0.5) * ruido * 2;
        img.data[i] = Math.max(0, Math.min(255, img.data[i] + r));
        img.data[i + 1] = img.data[i];
        img.data[i + 2] = img.data[i];
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  };

  const CODIGO = '7501055300013';
  const casos = [
    { nombre: 'pegado y nítido',        fraccion: 0.95, desenfoque: 0,   ruido: 0 },
    { nombre: 'cerca normal',           fraccion: 0.75, desenfoque: 0.6, ruido: 6 },
    { nombre: 'cerca con mala luz',     fraccion: 0.65, desenfoque: 1.2, ruido: 22 },
    { nombre: 'a media distancia',      fraccion: 0.45, desenfoque: 1.0, ruido: 12 },
    { nombre: 'lejos pero nítido',      fraccion: 0.30, desenfoque: 0,   ruido: 0 },
    { nombre: 'lejos',                  fraccion: 0.28, desenfoque: 1.4, ruido: 18 },
    { nombre: 'muy lejos',              fraccion: 0.18, desenfoque: 1.8, ruido: 24 },
    { nombre: 'lejísimos',              fraccion: 0.10, desenfoque: 2.2, ruido: 28 }
  ];

  const salida = [];
  for (const caso of casos) {
    let leidos = 0, correctos = 0, equivocados = 0, aceptados = 0, anchoProm = 0;
    const REPETICIONES = 12;
    for (let i = 0; i < REPETICIONES; i++) {
      const lienzo = dibujar(CODIGO, caso.fraccion, caso.desenfoque, caso.ruido);
      const r = await Escaner._leerLienzo(lienzo);
      if (r) {
        leidos++;
        anchoProm += r.ancho;
        if (r.texto === CODIGO) correctos++; else equivocados++;
        // ¿lo aceptaría la app? (validez + qué tan grande se ve)
        if (Escaner.textoValido(r.texto, r.formato) && r.ancho >= Escaner.ajustes.minAncho) aceptados++;
      }
    }
    salida.push(Object.assign({}, caso, {
      repeticiones: REPETICIONES, leidos, correctos, equivocados, aceptados,
      anchoProm: leidos ? Math.round((anchoProm / leidos) * 100) / 100 : 0
    }));
  }
  return { casos: salida, minAncho: Escaner.ajustes.minAncho, codigo: CODIGO };
});

console.log('  Umbral de cercanía exigido: el código debe ocupar ' +
  Math.round(resultados.minAncho * 100) + '% del recuadro\n');
console.log('  ' + 'Caso'.padEnd(22) + 'Tamaño  Leídos  Correctos  Equivocados  Aceptados');
let fallas = 0;
for (const c of resultados.casos) {
  console.log('  ' + c.nombre.padEnd(22) +
    String(Math.round(c.fraccion * 100) + '%').padEnd(8) +
    String(c.leidos + '/' + c.repeticiones).padEnd(8) +
    String(c.correctos).padEnd(11) +
    String(c.equivocados).padEnd(13) +
    String(c.aceptados));
  if (c.equivocados > 0) { console.error('    ✗ leyó un número equivocado'); fallas++; }
}
console.log('');

const cerca = resultados.casos[0];
const normal = resultados.casos[1];
const nitidoLejos = resultados.casos.find((c) => c.nombre === 'lejos pero nítido');
const lejos = resultados.casos.filter((c) => c.fraccion <= 0.30);

// Este caso sí se alcanza a leer, y aun así debe rechazarse por lejanía:
// es justo el que provocaba números equivocados en la tienda.
if (!(nitidoLejos.leidos > 0)) {
  console.log('  · nota: ni siquiera se leyó el código lejano nítido');
} else if (nitidoLejos.aceptados > 0) {
  console.error('  ✗ un código lejano se registró (debería pedir acercarlo)');
} else {
  console.log('  ✓ el filtro de distancia rechazó ' + nitidoLejos.leidos +
    ' lectura(s) de un código lejano, aunque se alcanzaban a leer');
}

if (cerca.aceptados !== cerca.repeticiones) { console.error('  ✗ de cerca debería aceptarlos todos'); fallas++; }
else console.log('  ✓ pegado y nítido: aceptó las ' + cerca.repeticiones + ' lecturas, todas correctas');

if (normal.aceptados < normal.repeticiones * 0.8) { console.error('  ✗ a distancia normal debería leer casi siempre'); fallas++; }
else console.log('  ✓ cerca con algo de ruido: aceptó ' + normal.aceptados + '/' + normal.repeticiones);

const aceptadosLejos = lejos.reduce((s, c) => s + c.aceptados, 0);
if (aceptadosLejos > 0) { console.error('  ✗ de lejos NO debería registrar nada (registró ' + aceptadosLejos + ')'); fallas++; }
else console.log('  ✓ de lejos no registra nada: pide acercar el código');

const totalEquivocados = resultados.casos.reduce((s, c) => s + c.equivocados, 0);
if (!totalEquivocados) console.log('  ✓ ningún número equivocado en ' +
  resultados.casos.reduce((s, c) => s + c.repeticiones, 0) + ' intentos');

/* Reglas de validación del número leído */
const validacion = await page.evaluate(() => ({
  ean13Bueno: Escaner.textoValido('7501055300013', 'EAN_13'),
  ean13Malo: Escaner.textoValido('7501055300011', 'EAN_13'),
  ean8Bueno: Escaner.textoValido('96385074', 'EAN_8'),
  ean8Malo: Escaner.textoValido('96385075', 'EAN_8'),
  upcaBueno: Escaner.textoValido('036000291452', 'UPC_A'),
  upcaMalo: Escaner.textoValido('036000291453', 'UPC_A'),
  itfCorto: Escaner.textoValido('123456', 'ITF'),
  itfImpar: Escaner.textoValido('123456789', 'ITF'),
  code128: Escaner.textoValido('ABC-123', 'CODE_128')
}));
const esperado = { ean13Bueno: true, ean13Malo: false, ean8Bueno: true, ean8Malo: false,
  upcaBueno: true, upcaMalo: false, itfCorto: false, itfImpar: false, code128: true };
for (const k of Object.keys(esperado)) {
  if (validacion[k] !== esperado[k]) { console.error('  ✗ validación ' + k); fallas++; }
}
if (!fallas) console.log('  ✓ el dígito verificador rechaza los números alterados');

console.log(fallas ? '\n' + fallas + ' problema(s) de precisión' : '\nEl escáner solo registra lo que ve bien y de cerca.');
if (fallas) process.exitCode = 1;
await navegador.close();
servidor.close();
