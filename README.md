# 🛒 Mi Tienda — Inventario, ventas y fiados

App para tu tienda de abarrotes. **Todo se guarda en tu celular**: no necesita
internet, ni cuenta, ni pagar nada. Escaneas el código de barras con la cámara,
suena un pitido y la app lleva sola el inventario, las ventas, los fiados, la
agenda de proveedores y el corte de caja.

**App en línea:** https://disenadorgrafico1.github.io/App-escanerr/

---

## 📱 Cómo ponerla en tu celular

1. Abre el enlace de arriba **en Chrome de tu celular**.
2. Toca el menú de Chrome (⋮) → **Agregar a pantalla principal**.
3. Ábrela desde el icono morado. La primera vez que toques **Escanear**,
   Chrome te pedirá permiso para la cámara: dale **Permitir**.

Después de la primera vez funciona **sin internet**: la app queda guardada
dentro del teléfono.

> La cámara solo funciona con direcciones `https://` (como la de GitHub Pages).
> Si abres el archivo por `http://`, el celular no deja usar la cámara; ahí
> todavía puedes teclear el código a mano.

---

## 🧾 Cómo se usa

### 🏠 Inicio
Un vistazo del negocio: lo vendido hoy, la ganancia, cuánto te deben de fiado,
cuánto tienes invertido, tus pendientes y lo más vendido del día.

### 💵 Abrir y cerrar el día (Caja)
- **Abrir día:** anotas el fondo de caja (el dinero para dar cambio).
- **Cerrar día:** la app te dice cuánto **debe haber** en la caja
  (fondo + ventas en efectivo + abonos de fiados), tú cuentas el dinero y te
  avisa si **sobra, falta o cuadra**. El corte se guarda y se descarga en PDF.

### ➕ Agregar productos
Escanea (o toca **Sin código** / **Teclear**) y escoge cómo se vende:

| Tipo | Para qué sirve |
|---|---|
| **Por pieza** | Lo normal: refrescos, galletas, latas… |
| **Por peso** | Granel: jitomate, frijol, queso. Se vende por kilo. |
| **Paquete + pieza** | Compras la caja y vendes caja **o** pieza suelta. |

**Ejemplo de paquete:** cigarros. Pones que la cajetilla trae **20** piezas, el
costo de la cajetilla y su precio, más el precio del cigarro suelto. La app
calcula sola el costo por cigarro y **lleva el inventario en piezas sueltas**:
si vendes una cajetilla descuenta 20, y cada 20 sueltos que vendas equivalen a
una cajetilla menos. En el inventario lo ves como "3 paq. y 12 pzs".

También defines el **grupo** (Bebidas, Botanas, Limpieza…), **con cuántas
piezas quieres que te avise**, la cantidad ideal en bodega y **quién te lo
surte**.

Si escaneas algo que ya tenías, solo le sumas piezas y acumula tu inversión.

### 🛒 Vender
1. Toca **Escanear** y pasa los productos.
   - Si es de **paquete**, te pregunta: ¿caja completa o pieza suelta?
   - Si es de **peso**, escribes los kilos **o** el monto en dinero y la app
     saca la otra cifra.
   - Si no trae código, toca **Sin código** y aparece la lista para tocar.
2. Escribe con cuánto te paga el cliente: te dice **el cambio**.
3. **Cobrar en efectivo** o **Dar crédito (fiar)**.

### 🤝 Fiados y clientes
Al fiar eliges el cliente (o lo das de alta con nombre y teléfono) y la fecha
en que debe pagar. El fiado:
- descuenta los productos del inventario,
- queda en la lista de **quién te debe**,
- **se agenda solo** en el calendario para su cobro,
- y te avisa cuando se acerca o se vence la fecha.

Puedes registrar **abonos parciales**, marcar **ya pagó todo**, llamar al
cliente con un toque y descargar el **PDF de quién te debe**.

### 📅 Agenda y proveedores
Calendario del mes con:
- 🔵 visitas de proveedor
- 🟠 cobros de fiados

Al **agendar una visita** eliges el proveedor (o lo creas con su teléfono y los
grupos que te surte) y la app arma sola **la lista de lo que hay que pedirle**,
tomando los productos de sus grupos que ya están bajos. Esa lista se descarga
en PDF para llevarla o mandarla por WhatsApp, y se puede recalcular al momento.

### 📦 Mis productos
Inventario **agrupado por grupo**, con búsqueda, filtros y totales: cuántos
productos tienes, cuánto llevas invertido, el valor de venta y cuántos están
por acabarse (en rojo). Al tocar un producto corriges precios, el aviso de
mínimo y la existencia real cuando haces conteo físico.

### 💰 Ventas
Hoy, ayer, 7 días o el mes: vendido, ganancia, tickets, cuánto fue fiado,
**gráfica de ventas por hora** y cada ticket con su detalle (se puede cancelar
y los productos regresan al inventario).

### 📄 Reportes en PDF
- **Lista de compras**: escribes un número (ej. 15) y trae todos los productos
  con 15 piezas o menos, cuánto conviene comprar y cuánto vas a gastar.
- **Ventas del periodo**, día por día y los más vendidos.
- **Ventas por hora**: a qué hora vendes más y cuándo entra más gente.
- **Acumulado semanal** y **acumulado mensual**.
- **Inventario completo** con el valor de todo.
- **Fiados pendientes**: quién debe, cuánto y desde cuándo.
- **Corte de caja** del último día cerrado.

### 🔔 Avisos
La campanita junta todo: productos por acabarse, visitas de proveedor
próximas, cobros por vencer y fiados vencidos. Suena cuando hay algo nuevo
(el celular solo deja sonar después de que tocas la pantalla).

---

## 💾 Muy importante: haz respaldos

Los datos viven **dentro del celular**. Si borras los datos de Chrome o pierdes
el teléfono, se pierden. En **Menú → Ajustes → Respaldo → Descargar respaldo**
bajas un archivo; guárdalo en Google Drive o mándatelo por WhatsApp. Con
**Restaurar respaldo** lo recuperas en cualquier celular.

---

## 🔧 Para quien le mueva al código

PWA sin compilación: HTML, CSS y JavaScript puro.

```
index.html            todas las pantallas
styles.css            estilos (modo claro y oscuro)
js/db.js              datos: productos, ventas, fiados, agenda, cortes (IndexedDB)
js/scanner.js         cámara, códigos de barras, pitidos y campana
js/reportes.js        los 9 PDF
js/nucleo.js          navegación, menú lateral, avisos e Inicio
js/venta.js           vender, tickets y caja
js/inventario.js      alta de productos, inventario y ajustes
js/gestion.js         fiados, clientes, agenda y proveedores
js/app.js             reportes y arranque
vendor/               ZXing y jsPDF incluidos (para trabajar sin internet)
sw.js                 service worker: funciona offline
pruebas/              pruebas automatizadas
```

- **Lectura de códigos**: `BarcodeDetector` (nativo en Chrome de Android) y si
  no existe cae a **ZXing**. Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128,
  Code 39, ITF y Codabar.
- **Existencias**: siempre en unidad base (pieza suelta o kilo). Un paquete de
  N piezas descuenta N unidades, así las cuentas de caja y pieza salen solas.
- **Datos**: IndexedDB. Nada sale del dispositivo.

```bash
npm install
npm test               # 21 pruebas de inventario, ventas, fiados, agenda y corte
npm run prueba-app     # recorre toda la app en Chromium (alta, venta, fiado, corte, PDF)
npm run prueba-camara  # prueba el escáner con una cámara simulada
npm run servir         # servidor local en http://localhost:8080
```

Licencia MIT.
