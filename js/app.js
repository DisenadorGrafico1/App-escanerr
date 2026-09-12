/*
 * app.js — Pantallas y flujo de la aplicación.
 */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const estado = {
    cfg: null,
    productos: [],
    carrito: [],
    sesion: { piezas: 0, invertido: 0, items: [] },
    vista: 'vender'
  };

  /* ===================== utilidades ===================== */

  function dinero(n) {
    const v = (isFinite(n) ? Number(n) : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (estado.cfg ? estado.cfg.moneda : '$') + v;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let avisoTimer = null;
  function aviso(texto, tipo) {
    const el = $('#aviso');
    el.textContent = texto;
    el.className = 'aviso ver' + (tipo ? ' ' + tipo : '');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.className = 'aviso'; }, 2600);
  }

  function abrirModal(html) {
    $('#modalCaja').innerHTML = html;
    $('#modal').classList.remove('oculto');
  }
  function cerrarModal() {
    $('#modal').classList.add('oculto');
    $('#modalCaja').innerHTML = '';
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrarModal(); });

  function confirmar(titulo, texto, textoOk) {
    return new Promise((resolve) => {
      abrirModal(
        '<h2>' + esc(titulo) + '</h2><p class="sub">' + esc(texto) + '</p>' +
        '<button class="btn-principal" id="mOk">' + esc(textoOk || 'Sí, continuar') + '</button>' +
        '<button class="btn-texto" id="mNo">Cancelar</button>'
      );
      $('#mOk').onclick = () => { cerrarModal(); resolve(true); };
      $('#mNo').onclick = () => { cerrarModal(); resolve(false); };
    });
  }

  function fechaCorta(iso) {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  function diaMas(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function nivel(p) {
    const stock = Number(p.stock), min = Number(p.minimo) || 0;
    if (stock <= min) return 'bajo';
    if (stock <= min * 2) return 'medio';
    return '';
  }

  async function recargarProductos() {
    estado.productos = await DB.todosProductos();
    actualizarAlertas();
  }

  /* ===================== navegación ===================== */

  function mostrarVista(nombre) {
    estado.vista = nombre;
    $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + nombre));
    $$('.barra-inferior .tab').forEach((t) => t.classList.toggle('activa', t.dataset.vista === nombre));
    // Al cambiar de pantalla siempre se apaga la cámara: así el botón
    // "Escanear" de la pantalla nueva siempre la enciende donde debe.
    Escaner.limpiarUltimo();
    Escaner.detener().then(pintarBotonesCamara);
    const subtitulos = {
      vender: 'Escanea y cobra', agregar: 'Alta y entrada de mercancía',
      inventario: 'Lo que tienes en tienda', ventas: 'Cuentas del día', mas: 'Reportes y ajustes'
    };
    $('#subtitulo').textContent = subtitulos[nombre] || '';
    if (nombre === 'inventario') pintarInventario();
    if (nombre === 'ventas') pintarVentas();
    if (nombre === 'mas') pintarMas();
    window.scrollTo({ top: 0 });
  }

  $$('.barra-inferior .tab').forEach((t) => {
    t.addEventListener('click', () => mostrarVista(t.dataset.vista));
  });

  /* ===================== cámara ===================== */

  function pintarBotonesCamara() {
    const activo = Escaner.estaActivo();
    const enVender = estado.vista === 'vender';
    $('#btnCamaraVender').textContent = (activo && enVender) ? '⏸ Pausar' : '▶ Escanear';
    $('#btnCamaraAgregar').textContent = (activo && !enVender) ? '⏸ Pausar' : '▶ Escanear';
    $('#avisoVender').classList.toggle('oculto', activo && enVender);
    $('#avisoAgregar').classList.toggle('oculto', activo && !enVender);
    $('#videoVender').parentElement.classList.toggle('escaneando', activo && enVender);
    $('#videoAgregar').parentElement.classList.toggle('escaneando', activo && !enVender);
    $('#btnLuzVender').hidden = !(activo && enVender && Escaner.soportaLinterna());
    $('#btnLuzAgregar').hidden = !(activo && !enVender && Escaner.soportaLinterna());
  }

  async function alternarCamara(video, callback) {
    try {
      if (Escaner.estaActivo()) {
        await Escaner.detener();
      } else {
        Escaner.configurar(estado.cfg);
        await Escaner.iniciar(video, callback);
      }
    } catch (e) {
      aviso(mensajeCamara(e), 'error');
    }
    pintarBotonesCamara();
  }

  function mensajeCamara(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError') return 'Debes permitir el uso de la cámara en el navegador';
    if (n === 'NotFoundError') return 'No se encontró ninguna cámara en el celular';
    if (n === 'NotReadableError') return 'Otra app está usando la cámara; ciérrala e intenta de nuevo';
    return (e && e.message) || 'No se pudo abrir la cámara';
  }

  $('#btnCamaraVender').onclick = () => alternarCamara($('#videoVender'), alCodigoVenta);
  $('#btnCamaraAgregar').onclick = () => alternarCamara($('#videoAgregar'), alCodigoEntrada);
  $('#btnLuzVender').onclick = () => Escaner.alternarLinterna();
  $('#btnLuzAgregar').onclick = () => Escaner.alternarLinterna();

  /* ===================== VENDER ===================== */

  async function alCodigoVenta(codigo) {
    const prod = await DB.getProducto(codigo);
    if (!prod) {
      Escaner.pitidoError();
      const ok = await confirmar('Producto no registrado',
        'El código ' + codigo + ' no está en tu inventario. ¿Lo quieres dar de alta ahora?', 'Registrar producto');
      if (ok) { mostrarVista('agregar'); cargarFormulario(codigo); }
      return;
    }
    if (Number(prod.stock) <= 0 && !estado.cfg.permitirNegativo) {
      Escaner.pitidoError();
      aviso('No queda existencia de ' + prod.nombre, 'error');
      return;
    }
    const enCarrito = estado.carrito.find((i) => i.codigo === prod.codigo);
    if (enCarrito) {
      enCarrito.cantidad += 1;
    } else {
      estado.carrito.push({
        codigo: prod.codigo, nombre: prod.nombre, cantidad: 1,
        precio: Number(prod.precio), costo: Number(prod.costo), stock: Number(prod.stock)
      });
    }
    pintarCarrito();
  }

  function pintarCarrito() {
    const cont = $('#carrito');
    if (!estado.carrito.length) {
      cont.innerHTML = '<p class="vacio">Escanea productos para empezar a vender.</p>';
    } else {
      cont.innerHTML = estado.carrito.map((i, idx) => (
        '<div class="renglon">' +
          '<div class="info"><b>' + esc(i.nombre) + '</b>' +
            '<small>' + esc(i.codigo) + ' · ' + dinero(i.precio) + ' c/u' +
            (i.cantidad > i.stock ? ' · ⚠️ solo hay ' + i.stock : '') + '</small></div>' +
          '<div class="mini-contador">' +
            '<button data-menos="' + idx + '">−</button>' +
            '<span>' + i.cantidad + '</span>' +
            '<button data-mas="' + idx + '">+</button>' +
          '</div>' +
          '<div class="precio">' + dinero(i.cantidad * i.precio) + '</div>' +
        '</div>'
      )).join('');
      cont.querySelectorAll('[data-mas]').forEach((b) => b.onclick = () => {
        estado.carrito[+b.dataset.mas].cantidad += 1; pintarCarrito();
      });
      cont.querySelectorAll('[data-menos]').forEach((b) => b.onclick = () => {
        const i = estado.carrito[+b.dataset.menos];
        i.cantidad -= 1;
        if (i.cantidad <= 0) estado.carrito.splice(+b.dataset.menos, 1);
        pintarCarrito();
      });
    }
    const piezas = estado.carrito.reduce((s, i) => s + i.cantidad, 0);
    const total = estado.carrito.reduce((s, i) => s + i.cantidad * i.precio, 0);
    $('#carritoPiezas').textContent = piezas;
    $('#carritoTotal').textContent = dinero(total);
    $('#btnCobrar').disabled = !estado.carrito.length;
    calcularCambio();
  }

  function calcularCambio() {
    const total = estado.carrito.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const paga = parseFloat($('#pagaCon').value);
    $('#cambio').textContent = (isFinite(paga) && paga >= total) ? dinero(paga - total) : dinero(0);
  }
  $('#pagaCon').addEventListener('input', calcularCambio);

  $('#btnVaciarCarrito').onclick = () => {
    estado.carrito = [];
    $('#pagaCon').value = '';
    Escaner.limpiarUltimo();
    pintarCarrito();
  };

  $('#btnAgregarManualVender').onclick = () => {
    const c = $('#codigoManualVender').value.trim();
    if (!c) return;
    $('#codigoManualVender').value = '';
    Escaner.limpiarUltimo();
    alCodigoVenta(c);
  };
  $('#codigoManualVender').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btnAgregarManualVender').click(); }
  });

  $('#btnCobrar').onclick = async () => {
    if (!estado.carrito.length) return;
    const total = estado.carrito.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const paga = parseFloat($('#pagaCon').value);
    const recibido = isFinite(paga) ? paga : 0;
    const cambio = recibido >= total ? recibido - total : 0;
    try {
      const venta = await DB.registrarVenta(estado.carrito, { recibido, cambio });
      Escaner.pitidoExito();
      estado.carrito = [];
      $('#pagaCon').value = '';
      pintarCarrito();
      await recargarProductos();
      const resumen = await DB.resumenDia(DB.hoy());
      abrirModal(
        '<h2>✅ Venta registrada</h2>' +
        '<p class="sub">Ticket #' + venta.id + ' · ' + fechaCorta(venta.fecha) + '</p>' +
        '<div class="panel"><div class="totalizador">' +
          '<div><span>Piezas</span><b>' + venta.piezas + '</b></div>' +
          '<div><span>Ganancia</span><b>' + dinero(venta.ganancia) + '</b></div>' +
          '<div class="grande"><span>Total</span><b>' + dinero(venta.total) + '</b></div>' +
        '</div>' +
        (cambio > 0 ? '<div class="totalizador"><div><span>Recibí</span><b>' + dinero(recibido) +
          '</b></div><div class="grande"><span>Cambio</span><b>' + dinero(cambio) + '</b></div></div>' : '') +
        '</div>' +
        '<div class="panel suave"><h3>Llevas hoy</h3><div class="totalizador">' +
          '<div><span>Ventas</span><b>' + dinero(resumen.total) + '</b></div>' +
          '<div><span>Tickets</span><b>' + resumen.tickets + '</b></div>' +
          '<div><span>Ganancia</span><b>' + dinero(resumen.ganancia) + '</b></div>' +
        '</div></div>' +
        '<button class="btn-principal" id="mSeguir">Seguir vendiendo</button>'
      );
      $('#mSeguir').onclick = cerrarModal;
    } catch (e) {
      Escaner.pitidoError();
      aviso(e.message, 'error');
    }
  };

  /* ===================== AGREGAR / ENTRADA ===================== */

  function llenarSelectCategorias(select, valor) {
    const cats = estado.cfg.categorias;
    select.innerHTML = cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    if (valor && !cats.includes(valor)) {
      select.insertAdjacentHTML('afterbegin', '<option value="' + esc(valor) + '">' + esc(valor) + '</option>');
    }
    select.value = valor || cats[0] || 'Otros';
  }

  async function alCodigoEntrada(codigo) { cargarFormulario(codigo); }

  async function cargarFormulario(codigo) {
    const prod = await DB.getProducto(codigo);
    $('#panelProducto').hidden = false;
    $('#fCodigo').value = codigo;
    llenarSelectCategorias($('#fCategoria'), prod ? prod.categoria : '');
    $('#fPiezas').value = 1;

    if (prod) {
      $('#tituloPanelProducto').textContent = prod.nombre;
      $('#etiquetaEstado').textContent = 'Ya registrado · quedan ' + Number(prod.stock);
      $('#etiquetaEstado').className = 'etiqueta';
      $('#fNombre').value = prod.nombre;
      $('#fCosto').value = prod.costo || '';
      $('#fPrecio').value = prod.precio || '';
      $('#fMinimo').value = prod.minimo;
      $('#fObjetivo').value = prod.objetivo || '';
      $('#btnGuardarEntrada').textContent = '➕ Sumar piezas al inventario';
    } else {
      $('#tituloPanelProducto').textContent = 'Producto nuevo';
      $('#etiquetaEstado').textContent = 'Nuevo · código ' + codigo;
      $('#etiquetaEstado').className = 'etiqueta nuevo';
      $('#fNombre').value = '';
      $('#fCosto').value = '';
      $('#fPrecio').value = '';
      $('#fMinimo').value = estado.cfg.minimoDefault;
      $('#fObjetivo').value = '';
      $('#btnGuardarEntrada').textContent = '💾 Registrar producto';
      setTimeout(() => $('#fNombre').focus(), 120);
    }
    actualizarResumenEntrada();
    $('#panelProducto').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function actualizarResumenEntrada() {
    const piezas = parseFloat($('#fPiezas').value) || 0;
    const costo = parseFloat($('#fCosto').value) || 0;
    const precio = parseFloat($('#fPrecio').value) || 0;
    const inv = piezas * costo;
    const gan = piezas * (precio - costo);
    $('#resumenEntrada').innerHTML = piezas
      ? 'Vas a invertir <b>' + dinero(inv) + '</b> en ' + piezas + ' pieza(s)'
        + (precio ? ' · ganancia esperada <b>' + dinero(gan) + '</b>' : '')
      : 'Escribe cuántas piezas estás agregando.';
  }

  ['#fPiezas', '#fCosto', '#fPrecio'].forEach((sel) => {
    $(sel).addEventListener('input', actualizarResumenEntrada);
  });

  $$('#formProducto .paso').forEach((b) => b.onclick = () => {
    const inp = $('#fPiezas');
    inp.value = Math.max(0, (parseFloat(inp.value) || 0) + Number(b.dataset.paso));
    actualizarResumenEntrada();
  });
  $$('#formProducto [data-sumar]').forEach((b) => b.onclick = () => {
    const inp = $('#fPiezas');
    inp.value = (parseFloat(inp.value) || 0) + Number(b.dataset.sumar);
    actualizarResumenEntrada();
  });

  $('#btnNuevaCategoria').onclick = () => {
    abrirModal('<h2>Nueva categoría</h2><p class="sub">Ej. Cremería, Verdura, Cigarros…</p>' +
      '<input type="text" id="mCat" placeholder="Nombre de la categoría">' +
      '<button class="btn-principal" id="mOk" style="margin-top:10px">Guardar</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>');
    $('#mCat').focus();
    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = async () => {
      const nombre = $('#mCat').value.trim();
      if (!nombre) return;
      if (!estado.cfg.categorias.includes(nombre)) {
        estado.cfg.categorias = estado.cfg.categorias.concat([nombre]).sort((a, b) => a.localeCompare(b, 'es'));
        await DB.setConfig('categorias', estado.cfg.categorias);
      }
      llenarSelectCategorias($('#fCategoria'), nombre);
      cerrarModal();
      aviso('Categoría agregada', 'exito');
    };
  };

  $('#btnBuscarManualAgregar').onclick = () => {
    const c = $('#codigoManualAgregar').value.trim();
    if (!c) return;
    $('#codigoManualAgregar').value = '';
    Escaner.limpiarUltimo();
    cargarFormulario(c);
  };
  $('#codigoManualAgregar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btnBuscarManualAgregar').click(); }
  });

  $('#btnCancelarEntrada').onclick = () => { $('#panelProducto').hidden = true; };

  $('#formProducto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = $('#fCodigo').value;
    const piezas = parseFloat($('#fPiezas').value) || 0;
    const costo = $('#fCosto').value === '' ? null : parseFloat($('#fCosto').value);
    const precio = $('#fPrecio').value === '' ? null : parseFloat($('#fPrecio').value);
    const nombre = $('#fNombre').value.trim();
    if (!nombre) { aviso('Ponle nombre al producto', 'error'); return; }

    try {
      const previo = await DB.getProducto(codigo);
      await DB.guardarProducto({
        codigo: codigo,
        nombre: nombre,
        categoria: $('#fCategoria').value,
        costo: costo !== null ? costo : (previo ? previo.costo : 0),
        precio: precio !== null ? precio : (previo ? previo.precio : 0),
        stock: previo ? previo.stock : 0,
        minimo: parseFloat($('#fMinimo').value) || estado.cfg.minimoDefault,
        objetivo: parseFloat($('#fObjetivo').value) || 0,
        unidad: previo ? previo.unidad : 'pieza'
      });

      if (piezas > 0) {
        await DB.agregarExistencia(codigo, piezas, costo, precio);
        const costoReal = costo !== null ? costo : (previo ? Number(previo.costo) : 0);
        estado.sesion.piezas += piezas;
        estado.sesion.invertido += piezas * costoReal;
        estado.sesion.items.unshift({ nombre: nombre, piezas: piezas, total: piezas * costoReal });
        pintarSesion();
        aviso('+' + piezas + ' piezas de ' + nombre, 'exito');
      } else {
        aviso(previo ? 'Producto actualizado' : 'Producto registrado', 'exito');
      }

      Escaner.pitido();
      await recargarProductos();
      const actualizado = await DB.getProducto(codigo);
      $('#etiquetaEstado').textContent = 'Ya registrado · quedan ' + Number(actualizado.stock);
      $('#etiquetaEstado').className = 'etiqueta';
      $('#panelProducto').hidden = true;
      Escaner.limpiarUltimo();
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  function pintarSesion() {
    if (!estado.sesion.items.length) return;
    $('#panelSesion').hidden = false;
    $('#sesionPiezas').textContent = estado.sesion.piezas;
    $('#sesionInvertido').textContent = dinero(estado.sesion.invertido);
    $('#sesionLista').innerHTML = estado.sesion.items.slice(0, 12)
      .map((i) => '<li><span>' + esc(i.nombre) + ' × ' + i.piezas + '</span><b>' + dinero(i.total) + '</b></li>')
      .join('');
  }

  /* ===================== INVENTARIO ===================== */

  function productosFiltrados() {
    const texto = $('#buscarInventario').value.trim().toLowerCase();
    const cat = $('#filtroCategoria').value;
    const soloBajos = $('#soloBajos').checked;
    let lista = estado.productos.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      if (soloBajos && Number(p.stock) > (Number(p.minimo) || 0)) return false;
      if (!texto) return true;
      return p.nombre.toLowerCase().includes(texto) || p.codigo.includes(texto);
    });
    const orden = $('#ordenInventario').value;
    if (orden === 'stock') lista.sort((a, b) => Number(a.stock) - Number(b.stock));
    else if (orden === 'valor') lista.sort((a, b) => (b.stock * b.costo) - (a.stock * a.costo));
    else if (orden === 'categoria') lista.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
    else lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return lista;
  }

  function pintarInventario() {
    llenarFiltroCategorias();
    const todos = estado.productos;
    const piezas = todos.reduce((s, p) => s + Number(p.stock), 0);
    const inversion = todos.reduce((s, p) => s + Number(p.stock) * Number(p.costo), 0);
    const venta = todos.reduce((s, p) => s + Number(p.stock) * Number(p.precio), 0);
    const bajos = todos.filter((p) => Number(p.stock) <= (Number(p.minimo) || 0)).length;

    $('#resumenInventario').innerHTML =
      tarjeta('Productos', todos.length, '') +
      tarjeta('Piezas en tienda', piezas, '') +
      tarjeta('Invertido', dinero(inversion), 'acento') +
      tarjeta('Por acabarse', bajos, bajos ? 'alerta' : '');

    const lista = productosFiltrados();
    const cont = $('#listaInventario');
    if (!lista.length) {
      cont.innerHTML = '<p class="vacio">' + (todos.length
        ? 'Ningún producto coincide con la búsqueda.'
        : 'Todavía no tienes productos. Ve a <b>Agregar</b> y escanea el primero.') + '</p>';
      return;
    }
    cont.innerHTML = lista.map((p) => (
      '<button class="producto ' + nivel(p) + '" data-codigo="' + esc(p.codigo) + '">' +
        '<div class="info"><b>' + esc(p.nombre) + '</b>' +
          '<small>' + esc(p.categoria || 'Sin categoría') + ' · ' + esc(p.codigo) + '</small>' +
          '<small>Costo ' + dinero(p.costo) + ' · Venta ' + dinero(p.precio) +
            ' · Invertido ' + dinero(Number(p.stock) * Number(p.costo)) + '</small>' +
        '</div>' +
        '<div class="stock"><b>' + Number(p.stock) + '</b><small>mín ' + Number(p.minimo) + '</small></div>' +
      '</button>'
    )).join('');
    cont.querySelectorAll('.producto').forEach((b) => {
      b.onclick = () => abrirDetalle(b.dataset.codigo);
    });
  }

  function tarjeta(titulo, valor, clase) {
    return '<div class="tarjeta-dato ' + (clase || '') + '"><span>' + titulo + '</span><b>' + valor + '</b></div>';
  }

  function llenarFiltroCategorias() {
    const usadas = Array.from(new Set(estado.productos.map((p) => p.categoria).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
    [['#filtroCategoria', 'Todas las categorías'], ['#categoriaPDF', 'Todas']].forEach(([sel, etiqueta]) => {
      const el = $(sel);
      if (!el) return;
      const actual = el.value;
      el.innerHTML = '<option value="">' + etiqueta + '</option>' +
        usadas.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
      if (usadas.includes(actual)) el.value = actual;
    });
  }

  ['#buscarInventario', '#filtroCategoria', '#ordenInventario', '#soloBajos'].forEach((sel) => {
    $(sel).addEventListener('input', pintarInventario);
  });

  async function abrirDetalle(codigo) {
    const p = await DB.getProducto(codigo);
    if (!p) return;
    const movs = await DB.movimientosDe(codigo, 8);
    abrirModal(
      '<h2>' + esc(p.nombre) + '</h2>' +
      '<p class="sub">' + esc(p.codigo) + ' · ' + esc(p.categoria || 'Sin categoría') + '</p>' +
      '<div class="tarjetas-resumen">' +
        tarjeta('Piezas', Number(p.stock), nivel(p) === 'bajo' ? 'alerta' : '') +
        tarjeta('Invertido hoy', dinero(Number(p.stock) * Number(p.costo)), 'acento') +
      '</div>' +
      '<div class="panel">' +
        '<div class="campo"><label>Nombre</label><input type="text" id="dNombre" value="' + esc(p.nombre) + '"></div>' +
        '<div class="campo"><label>Categoría</label><select id="dCategoria"></select></div>' +
        '<div class="rejilla-2">' +
          '<div class="campo"><label>Costo</label><input type="number" step="0.01" id="dCosto" value="' + Number(p.costo) + '"></div>' +
          '<div class="campo"><label>Precio venta</label><input type="number" step="0.01" id="dPrecio" value="' + Number(p.precio) + '"></div>' +
        '</div>' +
        '<div class="rejilla-2">' +
          '<div class="campo"><label>Avisar con menos de</label><input type="number" step="1" id="dMinimo" value="' + Number(p.minimo) + '"></div>' +
          '<div class="campo"><label>Cantidad ideal</label><input type="number" step="1" id="dObjetivo" value="' + (Number(p.objetivo) || '') + '"></div>' +
        '</div>' +
        '<div class="campo destacado"><label>Corregir existencia (conteo real)</label>' +
          '<input type="number" step="1" id="dStock" value="' + Number(p.stock) + '"></div>' +
        '<button class="btn-principal" id="dGuardar">Guardar cambios</button>' +
      '</div>' +
      (movs.length ? '<div class="panel suave"><h3>Últimos movimientos</h3><ul class="lista-simple">' +
        movs.map((m) => '<li><span>' + (m.tipo === 'venta' ? '🛒' : m.tipo === 'entrada' ? '📥' : '✏️') + ' ' +
          m.dia + ' ' + fechaCorta(m.fecha) + '</span><b>' + (m.cantidad > 0 ? '+' : '') + m.cantidad + '</b></li>').join('') +
        '</ul></div>' : '') +
      '<button class="btn-texto peligro" id="dBorrar">Eliminar producto</button>' +
      '<button class="btn-texto" id="dCerrar">Cerrar</button>'
    );
    llenarSelectCategorias($('#dCategoria'), p.categoria);
    $('#dCerrar').onclick = cerrarModal;
    $('#dGuardar').onclick = async () => {
      const nuevoStock = parseFloat($('#dStock').value) || 0;
      await DB.guardarProducto({
        codigo: p.codigo,
        nombre: $('#dNombre').value.trim() || p.nombre,
        categoria: $('#dCategoria').value,
        costo: parseFloat($('#dCosto').value) || 0,
        precio: parseFloat($('#dPrecio').value) || 0,
        stock: p.stock,
        minimo: parseFloat($('#dMinimo').value) || 0,
        objetivo: parseFloat($('#dObjetivo').value) || 0,
        unidad: p.unidad
      });
      if (nuevoStock !== Number(p.stock)) await DB.ajustarExistencia(p.codigo, nuevoStock, 'Corrección desde inventario');
      await recargarProductos();
      pintarInventario();
      cerrarModal();
      aviso('Producto actualizado', 'exito');
    };
    $('#dBorrar').onclick = async () => {
      const ok = await confirmar('Eliminar producto', 'Se borrará ' + p.nombre + ' del inventario. Las ventas ya hechas no se modifican.', 'Sí, eliminar');
      if (!ok) return;
      await DB.borrarProducto(p.codigo);
      await recargarProductos();
      pintarInventario();
      aviso('Producto eliminado');
    };
  }

  /* ===================== VENTAS ===================== */

  function rangoActual() {
    return { desde: $('#ventasDesde').value || DB.hoy(), hasta: $('#ventasHasta').value || DB.hoy() };
  }

  async function pintarVentas() {
    const { desde, hasta } = rangoActual();
    const r = await DB.resumenRango(desde, hasta);

    $('#resumenVentas').innerHTML =
      tarjeta('Vendido', dinero(r.total), 'acento') +
      tarjeta('Ganancia', dinero(r.ganancia), '') +
      tarjeta('Tickets', r.tickets, '') +
      tarjeta('Piezas', r.piezas, '');

    const multiDia = desde !== hasta;
    $('#panelDias').hidden = !multiDia || !r.dias.length;
    if (multiDia) {
      $('#listaDias').innerHTML = r.dias.map((d) =>
        '<div class="dia-fila"><span>' + d.dia + ' · ' + d.tickets + ' tickets</span>' +
        '<b>' + dinero(d.total) + '</b></div>').join('') || '<p class="vacio">Sin ventas.</p>';
    }

    const ventas = r.ventas.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
    $('#conteoTickets').textContent = ventas.length + ' ticket(s)';
    const cont = $('#listaVentas');
    if (!ventas.length) {
      cont.innerHTML = '<p class="vacio">No hay ventas en estas fechas.</p>';
      return;
    }
    cont.innerHTML = ventas.map((v) => (
      '<div class="ticket">' +
        '<div class="ticket-cab">' +
          '<div><b>' + dinero(v.total) + '</b><br><small>#' + v.id + ' · ' + v.dia + ' ' + fechaCorta(v.fecha) +
          ' · ganancia ' + dinero(v.ganancia) + '</small></div>' +
          '<button class="chip-borrar" data-cancelar="' + v.id + '">Cancelar</button>' +
        '</div>' +
        '<ul>' + v.items.map((i) => '<li><span>' + esc(i.nombre) + ' × ' + i.cantidad + '</span>' +
          '<b>' + dinero(i.cantidad * i.precio) + '</b></li>').join('') + '</ul>' +
      '</div>'
    )).join('');
    cont.querySelectorAll('[data-cancelar]').forEach((b) => b.onclick = async () => {
      const ok = await confirmar('Cancelar venta', 'Las piezas regresan al inventario y el ticket se borra de las cuentas del día.', 'Sí, cancelar venta');
      if (!ok) return;
      await DB.cancelarVenta(Number(b.dataset.cancelar));
      await recargarProductos();
      pintarVentas();
      aviso('Venta cancelada');
    });
  }

  $$('#vista-ventas [data-rango]').forEach((b) => b.onclick = () => {
    const r = b.dataset.rango;
    if (r === 'hoy') { $('#ventasDesde').value = DB.hoy(); $('#ventasHasta').value = DB.hoy(); }
    if (r === 'ayer') { $('#ventasDesde').value = diaMas(-1); $('#ventasHasta').value = diaMas(-1); }
    if (r === 'semana') { $('#ventasDesde').value = diaMas(-6); $('#ventasHasta').value = DB.hoy(); }
    if (r === 'mes') { $('#ventasDesde').value = DB.hoy().slice(0, 8) + '01'; $('#ventasHasta').value = DB.hoy(); }
    $$('#vista-ventas [data-rango]').forEach((o) => o.classList.toggle('activo', o === b));
    pintarVentas();
  });
  $('#ventasDesde').addEventListener('change', pintarVentas);
  $('#ventasHasta').addEventListener('change', pintarVentas);

  /* ===================== ALERTAS ===================== */

  function productosBajos() {
    return estado.productos
      .filter((p) => Number(p.stock) <= (Number(p.minimo) || 0))
      .sort((a, b) => Number(a.stock) - Number(b.stock));
  }

  function actualizarAlertas() {
    const bajos = productosBajos();
    const globo = $('#globoAlertas');
    globo.textContent = bajos.length;
    globo.classList.toggle('oculto', !bajos.length);
    $('#puntoInventario').classList.toggle('oculto', !bajos.length);
  }

  $('#btnAlertas').onclick = () => {
    const bajos = productosBajos();
    abrirModal(
      '<h2>🔔 Productos por acabarse</h2>' +
      '<p class="sub">' + (bajos.length ? 'Ya llegaron a su mínimo: conviene pedirlos al proveedor.' : 'Todo tiene existencia suficiente.') + '</p>' +
      (bajos.length ? '<div class="panel"><ul class="lista-simple">' + bajos.map((p) =>
        '<li><span>' + esc(p.nombre) + '<br><small style="color:var(--texto-suave)">' + esc(p.categoria || '') + '</small></span>' +
        '<b style="color:var(--rojo)">' + Number(p.stock) + '</b></li>').join('') + '</ul></div>' +
        '<button class="btn-principal" id="mPDF">Descargar lista en PDF</button>' : '') +
      '<button class="btn-texto" id="mCerrar">Cerrar</button>'
    );
    $('#mCerrar').onclick = cerrarModal;
    const btn = $('#mPDF');
    if (btn) btn.onclick = () => { cerrarModal(); mostrarVista('mas'); };
  };

  /* ===================== MÁS: PDF, AJUSTES, RESPALDO ===================== */

  function pintarMas() {
    llenarFiltroCategorias();
    $('#cfgTienda').value = estado.cfg.tienda;
    $('#cfgMoneda').value = estado.cfg.moneda;
    $('#cfgMinimo').value = estado.cfg.minimoDefault;
    $('#cfgSonido').checked = estado.cfg.sonido !== false;
    $('#cfgVibrar').checked = estado.cfg.vibrar !== false;
    $('#cfgNegativo').checked = estado.cfg.permitirNegativo !== false;
    pintarCategorias();
    actualizarVistaPreviaPDF();
  }

  function actualizarVistaPreviaPDF() {
    const umbral = parseFloat($('#umbralPDF').value);
    const cat = $('#categoriaPDF').value;
    if (!isFinite(umbral)) { $('#vistaPreviaPDF').textContent = ''; return; }
    let lista = estado.productos.filter((p) => Number(p.stock) <= umbral);
    if (cat) lista = lista.filter((p) => p.categoria === cat);
    const costo = lista.reduce((s, p) => {
      const objetivo = Number(p.objetivo) > 0 ? Number(p.objetivo) : umbral;
      return s + Math.max(0, Math.ceil(objetivo - Number(p.stock))) * Number(p.costo);
    }, 0);
    $('#vistaPreviaPDF').innerHTML = 'Entrarían <b>' + lista.length + '</b> producto(s) · inversión estimada <b>' + dinero(costo) + '</b>';
  }
  $('#umbralPDF').addEventListener('input', actualizarVistaPreviaPDF);
  $('#categoriaPDF').addEventListener('change', actualizarVistaPreviaPDF);

  async function generarCompras(compartir) {
    const umbral = parseFloat($('#umbralPDF').value);
    if (!isFinite(umbral)) { aviso('Escribe el número de piezas', 'error'); return; }
    try {
      aviso('Generando PDF…');
      const r = await Reportes.listaCompras(estado.productos, estado.cfg,
        { umbral: umbral, categoria: $('#categoriaPDF').value });
      const res = await Reportes.guardar(r.doc, r.nombre, compartir);
      if (res !== 'cancelado') aviso(r.lista.length + ' producto(s) en el PDF', 'exito');
    } catch (e) { aviso('No se pudo generar el PDF: ' + e.message, 'error'); }
  }
  $('#btnPDFCompras').onclick = () => generarCompras(false);
  $('#btnCompartirCompras').onclick = () => generarCompras(true);

  $('#btnPDFInventario').onclick = async () => {
    try {
      aviso('Generando PDF…');
      const r = await Reportes.inventario(estado.productos, estado.cfg, { categoria: $('#categoriaPDF').value });
      await Reportes.guardar(r.doc, r.nombre, false);
    } catch (e) { aviso('No se pudo generar el PDF: ' + e.message, 'error'); }
  };

  $('#btnPDFVentas').onclick = async () => {
    try {
      aviso('Generando PDF…');
      const { desde, hasta } = rangoActual();
      const resumen = await DB.resumenRango(desde, hasta);
      const productos = await DB.masVendidos(desde, hasta, 15);
      const r = await Reportes.ventas(resumen, estado.cfg, { productos: productos });
      await Reportes.guardar(r.doc, r.nombre, false);
    } catch (e) { aviso('No se pudo generar el PDF: ' + e.message, 'error'); }
  };

  /* ---- ajustes ---- */
  async function guardarCfg(clave, valor) {
    estado.cfg[clave] = valor;
    await DB.setConfig(clave, valor);
    Escaner.configurar(estado.cfg);
  }
  $('#cfgTienda').addEventListener('change', (e) => {
    guardarCfg('tienda', e.target.value.trim() || 'Mi tienda');
    $('#nombreTienda').textContent = estado.cfg.tienda;
  });
  $('#cfgMoneda').addEventListener('change', (e) => guardarCfg('moneda', e.target.value.trim() || '$').then(pintarCarrito));
  $('#cfgMinimo').addEventListener('change', (e) => guardarCfg('minimoDefault', parseFloat(e.target.value) || 0));
  $('#cfgSonido').addEventListener('change', (e) => guardarCfg('sonido', e.target.checked));
  $('#cfgVibrar').addEventListener('change', (e) => guardarCfg('vibrar', e.target.checked));
  $('#cfgNegativo').addEventListener('change', (e) => guardarCfg('permitirNegativo', e.target.checked));

  function pintarCategorias() {
    $('#listaCategorias').innerHTML = estado.cfg.categorias.map((c) =>
      '<button class="chip-borrar" data-cat="' + esc(c) + '">' + esc(c) + ' ✕</button>').join('');
    $$('#listaCategorias [data-cat]').forEach((b) => b.onclick = async () => {
      const cat = b.dataset.cat;
      const usados = estado.productos.filter((p) => p.categoria === cat).length;
      const ok = await confirmar('Quitar categoría',
        usados ? 'Hay ' + usados + ' producto(s) en "' + cat + '". Seguirán existiendo, pero sin esa categoría en la lista.'
               : 'Se quitará "' + cat + '" de la lista.', 'Quitar');
      if (!ok) return;
      estado.cfg.categorias = estado.cfg.categorias.filter((c) => c !== cat);
      await DB.setConfig('categorias', estado.cfg.categorias);
      pintarCategorias();
    });
  }

  $('#btnAgregarCategoria').onclick = async () => {
    const nombre = $('#nuevaCategoria').value.trim();
    if (!nombre) return;
    if (!estado.cfg.categorias.includes(nombre)) {
      estado.cfg.categorias = estado.cfg.categorias.concat([nombre]).sort((a, b) => a.localeCompare(b, 'es'));
      await DB.setConfig('categorias', estado.cfg.categorias);
    }
    $('#nuevaCategoria').value = '';
    pintarCategorias();
    aviso('Categoría agregada', 'exito');
  };

  /* ---- respaldo ---- */
  $('#btnExportar').onclick = async () => {
    const datos = await DB.exportar();
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'respaldo-tienda-' + DB.hoy() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    aviso('Respaldo descargado', 'exito');
  };

  $('#btnImportar').onclick = () => $('#archivoImportar').click();
  $('#archivoImportar').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      const ok = await confirmar('Restaurar respaldo',
        'Se reemplazarán los datos actuales por los del archivo (' + (datos.productos || []).length + ' productos).', 'Restaurar');
      if (!ok) return;
      await DB.importar(datos, true);
      estado.cfg = await DB.getConfig();
      await recargarProductos();
      aviso('Respaldo restaurado', 'exito');
      pintarMas();
    } catch (err) {
      aviso('Archivo inválido: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  $('#btnBorrarTodo').onclick = async () => {
    const ok = await confirmar('Borrar todo', 'Se eliminan productos, ventas y movimientos. Esto no se puede deshacer.', 'Sí, borrar todo');
    if (!ok) return;
    await DB.borrarTodo();
    estado.carrito = [];
    estado.sesion = { piezas: 0, invertido: 0, items: [] };
    await recargarProductos();
    pintarCarrito();
    aviso('Datos borrados');
  };

  /* ===================== instalación (PWA) ===================== */

  let eventoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h2>📲 Instalar en el celular</h2>' +
      '<p class="ayuda">Agrégala a tu pantalla de inicio para abrirla como una app normal, sin internet.</p>' +
      '<button class="btn-principal" id="btnInstalar">Instalar app</button>';
    $('#vista-mas').prepend(panel);
    $('#btnInstalar').onclick = async () => {
      eventoInstalar.prompt();
      await eventoInstalar.userChoice;
      panel.remove();
      eventoInstalar = null;
    };
  });

  /* ===================== arranque ===================== */

  async function iniciar() {
    await DB.abrir();
    estado.cfg = await DB.getConfig();
    Escaner.configurar(estado.cfg);
    $('#nombreTienda').textContent = estado.cfg.tienda;
    $('#ventasDesde').value = DB.hoy();
    $('#ventasHasta').value = DB.hoy();
    $('#umbralPDF').value = estado.cfg.umbralCompraDefault;
    await recargarProductos();
    pintarCarrito();
    mostrarVista('vender');

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Escaner.estaActivo()) Escaner.detener().then(pintarBotonesCamara);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (!window.isSecureContext) {
      aviso('Abre la app con https:// para poder usar la cámara', 'error');
    }
  }

  iniciar().catch((e) => aviso('Error al iniciar: ' + e.message, 'error'));
})();
