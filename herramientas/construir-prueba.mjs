/*
 * construir-prueba.mjs — Arma la VERSIÓN DE PRUEBA a partir de la app real.
 *
 *   npm run construir-prueba
 *
 * La copia queda en app-de-prueba/ y se diferencia en tres cosas:
 *   1. Pide clave al abrir y da 30 minutos de uso (herramientas/demo.js).
 *   2. Solo funciona en línea: no se guarda en el celular y si se cae el
 *      internet tapa la app (herramientas/en-linea.js).
 *   3. No se puede instalar: se le quita el manifiesto y las marcas de iOS.
 *
 * Se regenera desde la app real, así que las dos nunca se desincronizan.
 */
import { readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'app-de-prueba');

await rm(DESTINO, { recursive: true, force: true });
await mkdir(DESTINO, { recursive: true });

/* ---------- lo que se copia tal cual ---------- */
for (const carpeta of ['styles.css', 'js', 'vendor', 'icons']) {
  await cp(join(RAIZ, carpeta), join(DESTINO, carpeta), { recursive: true });
}
await cp(join(RAIZ, 'herramientas', 'demo.js'), join(DESTINO, 'js', 'demo.js'));
await cp(join(RAIZ, 'herramientas', 'en-linea.js'), join(DESTINO, 'js', 'en-linea.js'));
await cp(join(RAIZ, 'herramientas', 'prueba-ui.js'), join(DESTINO, 'js', 'prueba-ui.js'));

/* Archivito que se pide cada rato para saber si hay internet. */
await writeFile(join(DESTINO, 'latido.txt'), 'ok\n');

/* ---------- la portada, con sus diferencias ---------- */
let html = await readFile(join(RAIZ, 'index.html'), 'utf8');

const quitar = [
  /\n\s*<link rel="manifest"[^>]*>/g,
  /\n\s*<meta name="mobile-web-app-capable"[^>]*>/g,
  /\n\s*<meta name="apple-mobile-web-app-capable"[^>]*>/g,
  /\n\s*<meta name="apple-mobile-web-app-status-bar-style"[^>]*>/g,
  /\n\s*<meta name="apple-mobile-web-app-title"[^>]*>/g,
  /\n\s*<link rel="apple-touch-icon"[^>]*>/g
];
quitar.forEach((re) => { html = html.replace(re, ''); });

html = html.replace('<title>Mi Tienda · Inventario y Ventas</title>',
  '<title>Prueba · Mi Tienda</title>');
html = html.replace(/<meta name="description" content="[^"]*">/,
  '<meta name="description" content="Versión de prueba de Mi Tienda: 30 minutos con clave de acceso. Requiere internet.">');

// La puerta de acceso se carga antes que la app; la red y el contador, después.
html = html.replace('<script src="js/db.js"></script>',
  '<script src="js/db.js"></script>\n<script src="js/demo.js"></script>');
html = html.replace('<script src="js/app.js"></script>',
  '<script src="js/app.js"></script>\n<script src="js/en-linea.js"></script>\n<script src="js/prueba-ui.js"></script>');

// El pie del menú deja claro que es la versión de prueba.
html = html.replace('<p class="cajon-pie" id="cajonPie">Funciona sin internet</p>',
  '<p class="cajon-pie" id="cajonPie">Versión de prueba · requiere internet</p>');

if (html.includes('rel="manifest"') || html.includes('js/sw.js')) {
  throw new Error('La copia de prueba quedó instalable: revisa construir-prueba.mjs');
}
await writeFile(join(DESTINO, 'index.html'), html);

/* ---------- ajustes dentro de la copia ---------- */
// 1. Sin service worker: la versión de prueba nunca se guarda en el celular.
const rutaApp = join(DESTINO, 'js', 'app.js');
let app = await readFile(rutaApp, 'utf8');
app = app.replace("    if ('serviceWorker' in navigator) prepararActualizaciones();",
  '    // Versión de prueba: no se guarda en el celular, siempre viene del servidor.');
await writeFile(rutaApp, app);

// 2. El atajo de "ya tenía productos" no aplica aquí: siempre se pide clave.
const rutaDemo = join(DESTINO, 'js', 'demo.js');
let demo = await readFile(rutaDemo, 'utf8');
demo = demo.replace('if (productos.some((p) => p.creado && p.creado < ANTES_DE)) estado.liberado = true;',
  '// En la versión de prueba siempre se pide clave, tenga lo que tenga el celular.');
await writeFile(rutaDemo, demo);

/* Y el pie de Ajustes, para no confundir versiones. */
const rutaNucleo = join(DESTINO, 'js', 'nucleo.js');
let nucleo = await readFile(rutaNucleo, 'utf8');
nucleo = nucleo.replace(/const VERSION = '([\d.]+)';/, "const VERSION = '$1-prueba';");
await writeFile(rutaNucleo, nucleo);

console.log('Versión de prueba lista en app-de-prueba/');
console.log('  · pide clave y da 30 minutos');
console.log('  · no se instala ni se guarda en el celular');
console.log('  · sin internet se tapa y el reloj se pausa');
