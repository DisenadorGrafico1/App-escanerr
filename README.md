# 🛒 Mi Tienda — Inventario y Ventas con escáner

App para tu tienda de abarrotes. **Todo se guarda en tu celular**: no necesita
internet, ni cuenta, ni pagar nada. Escaneas el código de barras con la cámara,
suena un pitido y la app lleva solita el inventario, las ventas y las cuentas
del día.

---

## 📱 Cómo ponerla en tu celular

1. El repositorio debe ser **público** (Pages es gratis solo en repos públicos).
2. En GitHub entra a este repositorio → pestaña **Settings** → **Pages**.
3. En *Source* escoge **Deploy from a branch**, la rama donde está el código
   (`claude/grocery-inventory-app-is6fos`, o `main` si ya la combinaste) y la
   carpeta **/ (root)**. Guarda.
4. Espera 1 o 2 minutos. GitHub te dará una dirección como:
   `https://disenadorgrafico1.github.io/App-escanerr/`

A partir de ahí, cada cambio que se suba al repositorio se publica solo.
5. Abre esa dirección **en Chrome de tu celular**.
6. Toca el menú de Chrome (⋮) → **Agregar a pantalla principal**.

Listo: queda como una app normal. Ábrela desde el icono verde, aunque no
tengas datos ni WiFi.

> La cámara solo funciona con direcciones `https://` (como la de GitHub Pages).
> Si abres el archivo directamente desde la galería o por `http://`, el celular
> no deja usar la cámara; ahí todavía puedes escribir el código a mano.

---

## 🧾 Cómo se usa

### ➕ Agregar productos (pantalla "Agregar")
1. Toca **Escanear** y apunta al código de barras. Suena el pitido.
2. Si es un producto nuevo, escribes: **nombre**, **categoría** (Bebidas,
   Botanas, Limpieza…), **costo** (lo que te cuesta) y **precio de venta**.
3. Pones **cuántas piezas** estás metiendo (hay botones +5, +10, +12, +24).
4. Toca **Agregar al inventario**.

Si escaneas un producto que ya tenías, la app lo reconoce y solo le **suma las
piezas nuevas**, actualiza el costo y va acumulando cuánto llevas invertido.
Abajo ves el total de piezas y dinero que metiste en esa sesión.

También defines **con cuántas piezas quieres que te avise** ("avisarme cuando
queden menos de…") y la **cantidad ideal** que te gusta tener en bodega.

### 🛒 Vender (pantalla "Vender")
1. Toca **Escanear** y pasa los productos del cliente, uno por uno.
   Cada pitido agrega una pieza; si pasas dos veces el mismo, suma 2.
2. Puedes corregir cantidades con los botones **−** y **+**.
3. Escribe con cuánto te paga el cliente y la app te dice **el cambio**.
4. Toca **Cobrar venta**: se descuentan las piezas del inventario y se guarda
   el ticket del día.

Si escaneas algo que no está registrado, la app te avisa con un sonido grave y
te ofrece darlo de alta al momento.

### 📦 Inventario
Ves **cuántas piezas tienes de cada producto**, cuánto dinero tienes invertido
y cuáles están por acabarse (en rojo). Puedes buscar por nombre o código,
filtrar por categoría y ordenar por "menos existencia".

Al tocar un producto puedes corregirlo todo: nombre, categoría, costo, precio,
el aviso de mínimo y **corregir la existencia** cuando haces conteo físico.

### 💰 Ventas
Escoge **Hoy**, **Ayer**, **7 días** o **Este mes** y verás cuánto vendiste,
cuánta ganancia hiciste, cuántos tickets y cuántas piezas. Abajo aparece cada
ticket con su detalle; si te equivocaste, lo cancelas y las piezas regresan al
inventario.

### 📄 PDF para el proveedor (pantalla "Más")
Escribes un número —por ejemplo **15**— y la app arma un PDF con **todos los
productos donde ya quedan 15 piezas o menos**, con:

- cuántas piezas quedan y cuál es el mínimo,
- **cuántas conviene comprar**,
- el costo de cada una y **cuánto vas a gastar en total**.

Puedes filtrar por categoría (por ejemplo, solo "Bebidas" para el refresquero).
El botón **Compartir** lo manda directo por WhatsApp. También hay PDF del
**inventario completo** y de las **ventas del periodo**.

### 🔔 Alertas
La campanita de arriba muestra cuántos productos llegaron a su mínimo. Tócala
para ver la lista.

---

## 💾 Muy importante: haz respaldos

Los datos viven **dentro del celular**. Si borras el navegador o pierdes el
teléfono, se pierden. En **Más → Respaldo → Descargar respaldo** bajas un
archivo; guárdalo en Google Drive o mándatelo por WhatsApp. Con **Restaurar
respaldo** lo recuperas en cualquier celular.

---

## 🔧 Para quien le mueva al código

Es una PWA sin compilación: HTML, CSS y JavaScript puro.

```
index.html                 pantallas
styles.css                 estilos (modo claro y oscuro)
js/db.js                   datos: productos, ventas, movimientos (IndexedDB)
js/scanner.js              cámara, códigos de barras y pitidos
js/reportes.js             PDF (lista de compras, inventario, ventas)
js/app.js                  interfaz y flujo
vendor/                    ZXing y jsPDF incluidos (para trabajar sin internet)
sw.js                      service worker: funciona offline
pruebas/                   pruebas automatizadas
```

- **Lectura de códigos**: usa `BarcodeDetector` (nativo en Chrome de Android) y
  si no existe, cae a **ZXing**. Formatos: EAN-13, EAN-8, UPC-A, UPC-E,
  Code 128, Code 39, ITF y Codabar.
- **Datos**: IndexedDB. Nada sale del dispositivo.

```bash
npm install
npm test              # 12 pruebas de inventario, ventas y respaldo
npm run prueba-camara # prueba el escáner con una cámara simulada (Playwright)
npm run servir        # servidor local en http://localhost:8080
```

Licencia MIT.
