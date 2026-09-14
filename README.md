# 🛒 Mi Tienda — Inventario, ventas y fiados

App para tu tienda de abarrotes. **Todo se guarda en tu celular**: no necesita
internet, ni cuenta, ni pagar nada. Escaneas el código de barras con la cámara,
suena un pitido y la app lleva sola el inventario, las ventas, los fiados, la
agenda de proveedores y el corte de caja.

**App en línea:** https://disenadorgrafico1.github.io/App-escanerr/

---

## 📱 Cómo ponerla en tu celular

### Android (Chrome)
1. Abre el enlace de arriba **en Chrome**.
2. Menú **⋮** → **Agregar a pantalla principal** (o el botón *Instalar app*
   que aparece en Ajustes).
3. Ábrela desde el icono morado y dale **Permitir** a la cámara.

### iPhone / iPad (Safari)
1. Abre el enlace **en Safari** (en iPhone solo Safari la instala bien).
2. Toca **Compartir** (el cuadrito con la flecha ↑) → **Agregar a inicio**.
3. Ábrela desde el icono y dale **Permitir** a la cámara.

> **En iPhone es importante instalarla.** Si la dejas solo abierta en Safari y
> pasas varios días sin entrar, el sistema puede borrar los datos guardados.
> Instalada en la pantalla de inicio, no los borra.

Qué cambia en iPhone: no hay lector de códigos del sistema (usa el motor
incluido, un poco más lento pero igual de exacto), no hay vibración al
escanear (el pitido sí) y no hay botón de linterna. Todo lo demás —inventario,
ventas, fiados, agenda, cortes y PDF— funciona igual.

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

### 🎯 Precisión del escáner

De lejos, cualquier lector "adivina" y puede registrar números equivocados.
Para que eso no pase, el escáner:

1. Solo mira **el recuadro del centro**, con margen blanco alrededor (los
   códigos de barras necesitan ese espacio para leerse, incluso si pegas el
   producto a la cámara).
2. Exige que el código **se vea grande** dentro del recuadro. Si está lejos no
   registra nada: aparece en pantalla **"Acerca el código"**.
3. Comprueba el **dígito verificador** (EAN-13, EAN-8, UPC-A). Un número mal
   leído casi nunca pasa esa prueba.
4. Pide leer **el mismo número dos veces seguidas** antes de darlo por bueno.
5. Prueba varios procesados por cuadro (normal, por histograma y en negativo),
   para etiquetas brillosas o con poca luz.
6. Trae apagados los formatos que se prestan a lecturas a medias (ITF de caja
   y Codabar); se encienden en Ajustes si los necesitas.

En **Ajustes → Exigencia del escáner** eliges:

| Modo | Qué hace |
|---|---|
| **Rápido** | Registra en cuanto lee. Más ágil, con más riesgo de error. |
| **Normal** | Código grande en el recuadro y confirmado 2 veces. *Recomendado.* |
| **Estricto** | Código muy cerca y confirmado 3 veces. Para códigos maltratados. |

Medido con pruebas automáticas: de cerca (pegado, normal, con mala luz y a
media distancia) acertó **48 de 48** lecturas; de lejos **no registró ninguna**
y pidió acercar el código; **cero números equivocados en 96 intentos**.

### 🔔 Avisos
La campanita junta todo: productos por acabarse, visitas de proveedor
próximas, cobros por vencer y fiados vencidos. Suena cuando hay algo nuevo
(el celular solo deja sonar después de que tocas la pantalla).

---

## 🔢 Saber qué versión tienes

En **Menú → Ajustes → Versión de la app** aparece la versión instalada y cómo
está el escáner. Ahí mismo está el botón **Buscar actualización**: si hay una
nueva la baja y la app se recarga sola.

## 🔄 ¿Actualizar borra mis datos?

**No.** Actualizar cambia solo el programa (los archivos que están en GitHub).
Tus productos, ventas, fiados, clientes y cortes viven en una base de datos
dentro del celular (IndexedDB) que la actualización no toca; los productos
viejos se adaptan solos al formato nuevo.

Está comprobado con una prueba automática (`npm run prueba-actualizacion`) que
instala la versión anterior, registra productos y ventas, le encima la versión
nueva y verifica que todo siga ahí y se pueda seguir vendiendo.

Lo que sí borra los datos es **borrar los datos del sitio en Chrome**,
desinstalar la app borrando su almacenamiento, o usar el botón
*Borrar todos los datos* de Ajustes. Por eso: respalda.

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
  no existe cae a **ZXing** por API de bajo nivel (`MultiFormatReader` +
  `HybridBinarizer`/`GlobalHistogramBinarizer`), analizando solo la franja
  central con marco blanco. Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128,
  Code 39 y QR; ITF y Codabar opcionales.
- **Filtros antes de registrar**: dígito verificador, tamaño mínimo del código
  en el recuadro y confirmación repetida.
- **Existencias**: siempre en unidad base (pieza suelta o kilo). Un paquete de
  N piezas descuenta N unidades, así las cuentas de caja y pieza salen solas.
- **Datos**: IndexedDB. Nada sale del dispositivo.

```bash
npm install
npm test               # 21 pruebas de inventario, ventas, fiados, agenda y corte
npm run prueba-app     # recorre toda la app en Chromium (alta, venta, fiado, corte, PDF)
npm run prueba-camara  # prueba el escáner con una cámara simulada
npm run prueba-actualizacion  # comprueba que actualizar no borra lo registrado
npm run prueba-precision      # mide aciertos del escáner de cerca y de lejos
npm run prueba-lejos          # cámara simulada: de lejos avisa y no registra
npm run servir         # servidor local en http://localhost:8080
```

Licencia MIT.
