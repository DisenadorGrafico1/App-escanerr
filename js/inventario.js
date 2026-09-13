/*
 * inventario.js — Pantallas de Agregar productos, Mis productos y Ajustes.
 */
(() => {
  const { $, $$, estado, vistas, dinero, esc, cantidad, tarjeta, nivel,
          aviso, abrirModal, cerrarModal, confirmar, ir, refrescar } = App;

  let tipoActual = 'pieza';

  /* ===================== formulario de alta / entrada ===================== */

  const ETIQUETAS = {
    pieza: { costo: 'Costo por pieza', precio: 'Precio por pieza', entrada: 'Piezas que estás agregando',
             ayuda: 'Se vende de una en una.' },
    peso:  { costo: 'Costo por kilo', precio: 'Precio por kilo', entrada: 'Kilos que estás agregando',
             ayuda: 'Se pesa al vender: jitomate, frijol, queso…' },
    paquete: { costo: 'Costo por pieza suelta', precio: 'Precio por pieza suelta', entrada: 'Paquetes que estás agregando',
             ayuda: 'Compras la caja y puedes vender la caja completa o piezas sueltas.' }
  };

  function aplicarTipo(tipo) {
    tipoActual = tipo;
    $$('#segTipo button').forEach((b) => b.classList.toggle('activo', b.dataset.tipo === tipo));
    $('#bloquePaquete').hidden = tipo !== 'paquete';
    $('#etqCosto').textContent = ETIQUETAS[tipo].costo;
    $('#etqPrecio').textContent = ETIQUETAS[tipo].precio;
    $('#etqEntrada').textContent = ETIQUETAS[tipo].entrada;
    $('#ayudaTipo').textContent = ETIQUETAS[tipo].ayuda;
    $('#fPiezas').step = tipo === 'peso' ? '0.001' : '1';
    $('#atajosCantidad').style.display = tipo === 'peso' ? 'none' : 'flex';
    actualizarResumenEntrada();
  }

  function llenarSelectCategorias(select, valor) {
    const cats = estado.cfg.categorias;
    select.innerHTML = cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    if (valor && !cats.includes(valor)) {
      select.insertAdjacentHTML('afterbegin', '<option value="' + esc(valor) + '">' + esc(valor) + '</option>');
    }
    select.value = valor || cats[0] || 'Otros';
  }

  function llenarSelectProveedores(valor) {
    const sel = $('#fProveedor');
    sel.innerHTML = '<option value="">Sin definir</option>' +
      estado.proveedores.map((p) => '<option value="' + p.id + '">' + esc(p.nombre) + '</option>').join('');
    sel.value = valor ? String(valor) : '';
  }

  async function cargarFormulario(codigo, opciones = {}) {
    // Se pausa la cámara: si sigue leyendo el mismo código, el formulario
    // se reiniciaría solo mientras el tendero está escribiendo.
    if (Escaner.estaActivo()) {
      await Escaner.detener();
      App.pintarBotonesCamara();
    }
    const prod = await DB.getProducto(codigo);
    $('#fCodigo').value = codigo;
    llenarSelectCategorias($('#fCategoria'), prod ? prod.categoria : (opciones.categoria || ''));
    llenarSelectProveedores(prod ? prod.proveedorId : null);
    $('#fPiezas').value = opciones.piezas !== undefined ? opciones.piezas : 1;

    if (prod) {
      $('#tituloPanelProducto').textContent = prod.nombre;
      $('#etiquetaEstado').textContent = 'Ya registrado · ' + DB.existenciaTexto(prod);
      $('#etiquetaEstado').className = 'etiqueta';
      $('#fNombre').value = prod.nombre;
      $('#fCosto').value = prod.costo || '';
      $('#fPrecio').value = prod.precio || '';
      $('#fMinimo').value = prod.minimo;
      $('#fObjetivo').value = prod.objetivo || '';
      $('#fPiezasPaquete').value = prod.piezasPorPaquete > 1 ? prod.piezasPorPaquete : '';
      $('#fCostoPaquete').value = prod.costoPaquete || '';
      $('#fPrecioPaquete').value = prod.precioPaquete || '';
      aplicarTipo(prod.tipoVenta || 'pieza');
      $('#btnGuardarEntrada').textContent = '➕ Sumar al inventario';
    } else {
      $('#tituloPanelProducto').textContent = opciones.sinCodigo ? 'Producto sin código' : 'Producto nuevo';
      $('#etiquetaEstado').textContent = 'Nuevo · ' + codigo;
      $('#etiquetaEstado').className = 'etiqueta nuevo';
      $('#fNombre').value = '';
      $('#fCosto').value = '';
      $('#fPrecio').value = '';
      $('#fMinimo').value = estado.cfg.minimoDefault;
      $('#fObjetivo').value = '';
      $('#fPiezasPaquete').value = '';
      $('#fCostoPaquete').value = '';
      $('#fPrecioPaquete').value = '';
      aplicarTipo(opciones.tipo || 'pieza');
      $('#btnGuardarEntrada').textContent = '💾 Registrar producto';
      setTimeout(() => $('#fNombre').focus(), 150);
    }
    $('#panelProducto').dataset.sinCodigo = prod ? !!prod.sinCodigo : !!opciones.sinCodigo;
    // El panel aparece ya lleno: así nadie alcanza a escribir sobre datos viejos.
    $('#panelProducto').hidden = false;
    actualizarResumenEntrada();
    $('#panelProducto').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  App.cargarFormulario = cargarFormulario;

  function actualizarResumenEntrada() {
    const cant = parseFloat($('#fPiezas').value) || 0;
    const esPaquete = tipoActual === 'paquete';
    const n = esPaquete ? (parseFloat($('#fPiezasPaquete').value) || 1) : 1;
    const costoUnidad = esPaquete
      ? (parseFloat($('#fCostoPaquete').value) || 0)
      : (parseFloat($('#fCosto').value) || 0);
    const precioUnidad = esPaquete
      ? (parseFloat($('#fPrecioPaquete').value) || 0)
      : (parseFloat($('#fPrecio').value) || 0);
    const inv = cant * costoUnidad;
    const gan = cant * (precioUnidad - costoUnidad);
    const unidad = tipoActual === 'peso' ? 'kilo(s)' : esPaquete ? 'paquete(s)' : 'pieza(s)';
    $('#resumenEntrada').innerHTML = cant
      ? 'Vas a invertir <b>' + dinero(inv) + '</b> en ' + cant + ' ' + unidad +
        (esPaquete ? ' (' + Math.round(cant * n) + ' piezas sueltas)' : '') +
        (precioUnidad ? ' · ganancia esperada <b>' + dinero(gan) + '</b>' : '')
      : 'Escribe cuánto estás agregando.';
  }

  /** Al capturar el costo del paquete se calcula solo el costo por pieza. */
  function recalcularPorPieza() {
    const n = parseFloat($('#fPiezasPaquete').value) || 0;
    const costoPaq = parseFloat($('#fCostoPaquete').value) || 0;
    if (n > 0 && costoPaq > 0) $('#fCosto').value = Math.round((costoPaq / n) * 10000) / 10000;
    actualizarResumenEntrada();
  }

  async function guardarEntrada(e) {
    e.preventDefault();
    const codigo = $('#fCodigo').value;
    const nombre = $('#fNombre').value.trim();
    if (!nombre) { aviso('Ponle nombre al producto', 'error'); return; }

    const cant = parseFloat($('#fPiezas').value) || 0;
    const esPaquete = tipoActual === 'paquete';
    const piezasPaquete = esPaquete ? Math.max(1, Math.round(parseFloat($('#fPiezasPaquete').value) || 1)) : 1;
    if (esPaquete && piezasPaquete <= 1) {
      aviso('Escribe cuántas piezas trae el paquete', 'error');
      return;
    }
    const costo = $('#fCosto').value === '' ? null : parseFloat($('#fCosto').value);
    const precio = $('#fPrecio').value === '' ? null : parseFloat($('#fPrecio').value);
    const costoPaquete = parseFloat($('#fCostoPaquete').value) || 0;
    const precioPaquete = parseFloat($('#fPrecioPaquete').value) || 0;

    try {
      const previo = await DB.getProducto(codigo);
      await DB.guardarProducto({
        codigo: codigo,
        nombre: nombre,
        categoria: $('#fCategoria').value,
        tipoVenta: tipoActual,
        unidad: tipoActual === 'peso' ? 'kg' : 'pieza',
        sinCodigo: $('#panelProducto').dataset.sinCodigo === 'true',
        piezasPorPaquete: piezasPaquete,
        costo: costo !== null ? costo : (previo ? previo.costo : 0),
        precio: precio !== null ? precio : (previo ? previo.precio : 0),
        costoPaquete: costoPaquete,
        precioPaquete: precioPaquete,
        stock: previo ? previo.stock : 0,
        minimo: parseFloat($('#fMinimo').value) || estado.cfg.minimoDefault,
        objetivo: parseFloat($('#fObjetivo').value) || 0,
        proveedorId: $('#fProveedor').value ? Number($('#fProveedor').value) : null
      });

      if (cant > 0) {
        const modo = tipoActual === 'paquete' ? 'paquete' : tipoActual === 'peso' ? 'peso' : 'pieza';
        const costoEntrada = esPaquete ? costoPaquete : costo;
        const precioEntrada = esPaquete ? precioPaquete : precio;
        await DB.agregarExistencia(codigo, cant, costoEntrada, precioEntrada, modo);
        const costoReal = (costoEntrada !== null && costoEntrada !== undefined ? costoEntrada : 0);
        estado.sesion.piezas += cant;
        estado.sesion.invertido += cant * costoReal;
        estado.sesion.items.unshift({ nombre, cant, modo, total: cant * costoReal });
        pintarSesion();
        aviso('+' + cant + ' ' + (modo === 'peso' ? 'kg' : modo === 'paquete' ? 'paquete(s)' : 'pieza(s)') + ' de ' + nombre, 'exito');
      } else {
        aviso(previo ? 'Producto actualizado' : 'Producto registrado', 'exito');
      }

      Escaner.pitido();
      $('#panelProducto').hidden = true;
      Escaner.limpiarUltimo();
      await refrescar(false);
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  function pintarSesion() {
    if (!estado.sesion.items.length) return;
    $('#panelSesion').hidden = false;
    $('#sesionPiezas').textContent = Math.round(estado.sesion.piezas * 100) / 100;
    $('#sesionInvertido').textContent = dinero(estado.sesion.invertido);
    $('#sesionLista').innerHTML = estado.sesion.items.slice(0, 12)
      .map((i) => '<li><span>' + esc(i.nombre) + ' × ' + i.cant + (i.modo === 'paquete' ? ' paq.' : i.modo === 'peso' ? ' kg' : '') +
        '</span><b>' + dinero(i.total) + '</b></li>').join('');
  }

  async function nuevoSinCodigo() {
    const codigo = await DB.siguienteCodigoInterno();
    await cargarFormulario(codigo, { sinCodigo: true, tipo: 'pieza' });
    aviso('Se le asignó el código interno ' + codigo);
  }

  vistas.agregar = {
    render: async () => { App.pintarBotonesCamara(); pintarSesion(); },
    salir: () => { Escaner.detener().then(App.pintarBotonesCamara); }
  };

  function conectarAgregar() {
    $('#btnCamaraAgregar').onclick = () => App.alternarCamara($('#videoAgregar'), (c) => cargarFormulario(c));
    $('#btnLuzAgregar').onclick = () => Escaner.alternarLinterna();
    $('#btnSinCodigoAgregar').onclick = nuevoSinCodigo;
    $('#btnTecleadoAgregar').onclick = () => App.pedirCodigo('Escribir código', (c) => cargarFormulario(c));
    $('#btnCancelarEntrada').onclick = () => { $('#panelProducto').hidden = true; };
    $('#formProducto').addEventListener('submit', guardarEntrada);
    $$('#segTipo button').forEach((b) => b.onclick = () => aplicarTipo(b.dataset.tipo));
    ['#fPiezas', '#fCosto', '#fPrecio', '#fPrecioPaquete'].forEach((sel) =>
      $(sel).addEventListener('input', actualizarResumenEntrada));
    ['#fPiezasPaquete', '#fCostoPaquete'].forEach((sel) =>
      $(sel).addEventListener('input', recalcularPorPieza));
    $$('#formProducto .paso').forEach((b) => b.onclick = () => {
      const inp = $('#fPiezas');
      const paso = tipoActual === 'peso' ? 0.5 : 1;
      inp.value = Math.max(0, Math.round(((parseFloat(inp.value) || 0) + Number(b.dataset.paso) * paso) * 1000) / 1000);
      actualizarResumenEntrada();
    });
    $$('#formProducto [data-sumar]').forEach((b) => b.onclick = () => {
      const inp = $('#fPiezas');
      inp.value = (parseFloat(inp.value) || 0) + Number(b.dataset.sumar);
      actualizarResumenEntrada();
    });
    $('#btnNuevaCategoria').onclick = () => nuevaCategoria((nombre) => llenarSelectCategorias($('#fCategoria'), nombre));
  }

  function nuevaCategoria(alGuardar) {
    abrirModal('<h2>Nuevo grupo</h2><p class="sub">Ej. Cremería, Verdura, Cigarros…</p>' +
      '<input type="text" id="mCat" placeholder="Nombre del grupo">' +
      '<button class="btn-principal" id="mOk" style="margin-top:10px">Guardar</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>');
    setTimeout(() => $('#mCat').focus(), 120);
    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = async () => {
      const nombre = $('#mCat').value.trim();
      if (!nombre) return;
      if (!estado.cfg.categorias.includes(nombre)) {
        estado.cfg.categorias = estado.cfg.categorias.concat([nombre]).sort((a, b) => a.localeCompare(b, 'es'));
        await DB.setConfig('categorias', estado.cfg.categorias);
      }
      cerrarModal();
      if (alGuardar) alGuardar(nombre);
      aviso('Grupo agregado', 'exito');
    };
  }

  /* ===================== inventario ===================== */

  let grupoActivo = '';

  function productosFiltrados() {
    const texto = $('#buscarInventario').value.trim().toLowerCase();
    const soloBajos = $('#soloBajos').checked;
    let lista = estado.productos.filter((p) => {
      if (grupoActivo && p.categoria !== grupoActivo) return false;
      if (soloBajos && Number(p.stock) > (Number(p.minimo) || 0)) return false;
      if (!texto) return true;
      return p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto);
    });
    const orden = $('#ordenInventario').value;
    if (orden === 'stock') lista.sort((a, b) => Number(a.stock) - Number(b.stock));
    else if (orden === 'valor') lista.sort((a, b) => (b.stock * b.costo) - (a.stock * a.costo));
    else if (orden === 'categoria') lista.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
    else lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return lista;
  }

  function pintarChipsGrupos() {
    const usados = {};
    estado.productos.forEach((p) => { usados[p.categoria || 'Otros'] = (usados[p.categoria || 'Otros'] || 0) + 1; });
    const cats = Object.keys(usados).sort((a, b) => a.localeCompare(b, 'es'));
    $('#chipsGrupos').innerHTML =
      '<button class="chip mini' + (grupoActivo ? '' : ' activo') + '" data-grupo="">Todos (' + estado.productos.length + ')</button>' +
      cats.map((c) => '<button class="chip mini' + (grupoActivo === c ? ' activo' : '') + '" data-grupo="' + esc(c) + '">' +
        esc(c) + ' (' + usados[c] + ')</button>').join('');
    $$('#chipsGrupos [data-grupo]').forEach((b) => b.onclick = () => {
      grupoActivo = b.dataset.grupo;
      vistas.inventario.render();
    });
  }

  function filaProducto(p) {
    const valor = Number(p.stock) * Number(p.costo);
    const extra = p.tipoVenta === 'paquete'
      ? ' · paquete de ' + p.piezasPorPaquete
      : p.tipoVenta === 'peso' ? ' · por ' + (p.unidad || 'kg') : '';
    return '<button class="producto ' + nivel(p) + '" data-codigo="' + esc(p.codigo) + '">' +
      '<div class="info"><b>' + esc(p.nombre) + '</b>' +
        '<small>' + esc(p.categoria || 'Sin grupo') + ' · ' + esc(p.codigo) + extra + '</small>' +
        '<small>Costo ' + dinero(p.costo) + ' · Venta ' + dinero(p.precio) + ' · Invertido ' + dinero(valor) + '</small>' +
      '</div>' +
      '<div class="stock"><b>' + DB.existenciaTexto(p) + '</b><small>mín ' + Number(p.minimo) + '</small></div>' +
    '</button>';
  }

  vistas.inventario = {
    render: async () => {
      const todos = estado.productos;
      const inversion = todos.reduce((s, p) => s + Number(p.stock) * Number(p.costo), 0);
      const venta = todos.reduce((s, p) => s + Number(p.stock) * Number(p.precio), 0);
      const bajos = todos.filter((p) => Number(p.stock) <= (Number(p.minimo) || 0)).length;

      $('#resumenInventario').innerHTML =
        tarjeta('Productos', todos.length, 'morada') +
        tarjeta('Invertido', dinero(inversion), 'verde') +
        tarjeta('Valor de venta', dinero(venta), '') +
        tarjeta('Por acabarse', bajos, bajos ? 'roja' : '');

      pintarChipsGrupos();
      const lista = productosFiltrados();
      const cont = $('#listaInventario');
      if (!lista.length) {
        cont.innerHTML = '<p class="vacio">' + (todos.length
          ? 'Ningún producto coincide con la búsqueda.'
          : 'Todavía no tienes productos. Ve a <b>Agregar</b> y escanea el primero.') + '</p>';
        return;
      }

      // Cuando no hay un grupo elegido, la lista se muestra agrupada.
      if (!grupoActivo && $('#ordenInventario').value !== 'stock' && $('#ordenInventario').value !== 'valor') {
        const grupos = {};
        lista.forEach((p) => {
          const g = p.categoria || 'Sin grupo';
          (grupos[g] = grupos[g] || []).push(p);
        });
        cont.innerHTML = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es')).map((g) => {
          const items = grupos[g];
          const inv = items.reduce((s, p) => s + Number(p.stock) * Number(p.costo), 0);
          return '<div class="grupo-titulo"><span>' + esc(g) + ' · ' + items.length + '</span><span>' + dinero(inv) + '</span></div>' +
            items.map(filaProducto).join('');
        }).join('');
      } else {
        cont.innerHTML = lista.map(filaProducto).join('');
      }
      cont.querySelectorAll('.producto').forEach((b) => b.onclick = () => detalleProducto(b.dataset.codigo));
    }
  };

  async function detalleProducto(codigo) {
    const p = await DB.getProducto(codigo);
    if (!p) return;
    const movs = await DB.movimientosDe(codigo, 8);
    const esPaquete = p.tipoVenta === 'paquete';
    abrirModal(
      '<h2>' + esc(p.nombre) + '</h2>' +
      '<p class="sub">' + esc(p.codigo) + ' · ' + esc(p.categoria || 'Sin grupo') +
        (esPaquete ? ' · paquete de ' + p.piezasPorPaquete : p.tipoVenta === 'peso' ? ' · a granel' : '') + '</p>' +
      '<div class="tarjetas">' +
        tarjeta('Existencia', DB.existenciaTexto(p), nivel(p) === 'bajo' ? 'roja' : 'morada') +
        tarjeta('Invertido', dinero(Number(p.stock) * Number(p.costo)), 'verde') +
      '</div>' +
      '<div class="panel">' +
        '<div class="rejilla-2">' +
          '<div class="campo"><label>Costo ' + (p.tipoVenta === 'peso' ? 'por kilo' : 'por pieza') + '</label>' +
            '<input type="number" step="0.01" id="dCosto" value="' + Number(p.costo) + '"></div>' +
          '<div class="campo"><label>Precio ' + (p.tipoVenta === 'peso' ? 'por kilo' : 'por pieza') + '</label>' +
            '<input type="number" step="0.01" id="dPrecio" value="' + Number(p.precio) + '"></div>' +
        '</div>' +
        (esPaquete ? '<div class="rejilla-2">' +
          '<div class="campo"><label>Costo del paquete</label><input type="number" step="0.01" id="dCostoPaq" value="' + Number(p.costoPaquete) + '"></div>' +
          '<div class="campo"><label>Precio del paquete</label><input type="number" step="0.01" id="dPrecioPaq" value="' + Number(p.precioPaquete) + '"></div>' +
          '</div>' : '') +
        '<div class="campo"><label>Avisarme con menos de</label><input type="number" step="1" id="dMinimo" value="' + Number(p.minimo) + '"></div>' +
        '<div class="campo destacado"><label>Corregir existencia (conteo real, en ' +
          (p.tipoVenta === 'peso' ? 'kilos' : 'piezas sueltas') + ')</label>' +
          '<input type="number" step="0.001" id="dStock" value="' + Number(p.stock) + '"></div>' +
        '<button class="btn-principal" id="dGuardar">Guardar cambios</button>' +
      '</div>' +
      (movs.length ? '<div class="panel suave"><h3>Últimos movimientos</h3><ul class="lista-simple">' +
        movs.map((m) => '<li><span>' + (m.tipo === 'venta' ? '🛒' : m.tipo === 'entrada' ? '📥' : '✏️') + ' ' +
          App.fechaCorta(m.dia) + ' ' + App.hora(m.fecha) + '</span><b>' +
          (m.cantidad > 0 ? '+' : '') + (Math.round(m.cantidad * 1000) / 1000) + '</b></li>').join('') +
        '</ul></div>' : '') +
      '<button class="btn-sec" id="dEditar" style="width:100%">✏️ Editar todo / sumar existencia</button>' +
      '<button class="btn-texto peligro" id="dBorrar">Eliminar producto</button>' +
      '<button class="btn-texto" id="dCerrar">Cerrar</button>'
    );
    $('#dCerrar').onclick = cerrarModal;
    $('#dEditar').onclick = async () => { cerrarModal(); await ir('agregar'); cargarFormulario(p.codigo, { piezas: 0 }); };
    $('#dGuardar').onclick = async () => {
      const nuevoStock = parseFloat($('#dStock').value) || 0;
      await DB.guardarProducto({
        codigo: p.codigo, nombre: p.nombre, categoria: p.categoria,
        tipoVenta: p.tipoVenta, unidad: p.unidad, sinCodigo: p.sinCodigo,
        piezasPorPaquete: p.piezasPorPaquete,
        costo: parseFloat($('#dCosto').value) || 0,
        precio: parseFloat($('#dPrecio').value) || 0,
        costoPaquete: esPaquete ? (parseFloat($('#dCostoPaq').value) || 0) : p.costoPaquete,
        precioPaquete: esPaquete ? (parseFloat($('#dPrecioPaq').value) || 0) : p.precioPaquete,
        stock: p.stock,
        minimo: parseFloat($('#dMinimo').value) || 0,
        objetivo: p.objetivo, proveedorId: p.proveedorId
      });
      if (nuevoStock !== Number(p.stock)) await DB.ajustarExistencia(p.codigo, nuevoStock, 'Corrección desde inventario');
      cerrarModal();
      await refrescar();
      aviso('Producto actualizado', 'exito');
    };
    $('#dBorrar').onclick = async () => {
      const ok = await confirmar('Eliminar producto',
        'Se borrará ' + p.nombre + ' del inventario. Las ventas ya hechas no se modifican.', 'Sí, eliminar');
      if (!ok) return;
      await DB.borrarProducto(p.codigo);
      cerrarModal();
      await refrescar();
      aviso('Producto eliminado');
    };
  }

  function conectarInventario() {
    ['#buscarInventario', '#ordenInventario', '#soloBajos'].forEach((sel) =>
      $(sel).addEventListener('input', () => vistas.inventario.render()));
  }

  /* ===================== ajustes ===================== */

  vistas.ajustes = {
    render: async () => {
      const cfg = estado.cfg;
      $('#cfgTienda').value = cfg.tienda;
      $('#cfgMoneda').value = cfg.moneda;
      $('#cfgMinimo').value = cfg.minimoDefault;
      $('#cfgDiasCredito').value = cfg.diasCreditoDefault;
      $('#cfgAvisarVisita').value = cfg.avisarVisitaDias;
      $('#cfgSonido').checked = cfg.sonido !== false;
      $('#cfgVibrar').checked = cfg.vibrar !== false;
      $('#cfgNegativo').checked = cfg.permitirNegativo !== false;
      pintarCategorias();
    }
  };

  function pintarCategorias() {
    $('#listaCategorias').innerHTML = estado.cfg.categorias.map((c) =>
      '<button class="chip-borrar" data-cat="' + esc(c) + '">' + esc(c) + ' ✕</button>').join('');
    $$('#listaCategorias [data-cat]').forEach((b) => b.onclick = async () => {
      const cat = b.dataset.cat;
      const usados = estado.productos.filter((p) => p.categoria === cat).length;
      const ok = await confirmar('Quitar grupo',
        usados ? 'Hay ' + usados + ' producto(s) en "' + cat + '". Seguirán existiendo, pero sin ese grupo en la lista.'
               : 'Se quitará "' + cat + '" de la lista.', 'Quitar');
      if (!ok) return;
      estado.cfg.categorias = estado.cfg.categorias.filter((c) => c !== cat);
      await DB.setConfig('categorias', estado.cfg.categorias);
      pintarCategorias();
    });
  }

  async function guardarCfg(clave, valor) {
    estado.cfg[clave] = valor;
    await DB.setConfig(clave, valor);
    Escaner.configurar(estado.cfg);
  }

  function conectarAjustes() {
    $('#cfgTienda').addEventListener('change', (e) => {
      guardarCfg('tienda', e.target.value.trim() || 'Mi tienda').then(() => {
        $('#nombreTienda').textContent = estado.cfg.tienda;
        $('#cajonTienda').textContent = estado.cfg.tienda;
      });
    });
    $('#cfgMoneda').addEventListener('change', (e) => guardarCfg('moneda', e.target.value.trim() || '$'));
    $('#cfgMinimo').addEventListener('change', (e) => guardarCfg('minimoDefault', parseFloat(e.target.value) || 0));
    $('#cfgDiasCredito').addEventListener('change', (e) => guardarCfg('diasCreditoDefault', parseFloat(e.target.value) || 7));
    $('#cfgAvisarVisita').addEventListener('change', (e) => guardarCfg('avisarVisitaDias', parseFloat(e.target.value) || 2));
    $('#cfgSonido').addEventListener('change', (e) => guardarCfg('sonido', e.target.checked));
    $('#cfgVibrar').addEventListener('change', (e) => guardarCfg('vibrar', e.target.checked));
    $('#cfgNegativo').addEventListener('change', (e) => guardarCfg('permitirNegativo', e.target.checked));
    $('#btnAgregarCategoria').onclick = async () => {
      const nombre = $('#nuevaCategoria').value.trim();
      if (!nombre) return;
      if (!estado.cfg.categorias.includes(nombre)) {
        estado.cfg.categorias = estado.cfg.categorias.concat([nombre]).sort((a, b) => a.localeCompare(b, 'es'));
        await DB.setConfig('categorias', estado.cfg.categorias);
      }
      $('#nuevaCategoria').value = '';
      pintarCategorias();
      aviso('Grupo agregado', 'exito');
    };

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
        await refrescar();
        aviso('Respaldo restaurado', 'exito');
      } catch (err) {
        aviso('Archivo inválido: ' + err.message, 'error');
      } finally { e.target.value = ''; }
    });
    $('#btnBorrarTodo').onclick = async () => {
      const ok = await confirmar('Borrar todo',
        'Se eliminan productos, ventas, fiados y agenda. Esto no se puede deshacer.', 'Sí, borrar todo');
      if (!ok) return;
      await DB.borrarTodo();
      estado.carrito = [];
      estado.sesion = { piezas: 0, invertido: 0, items: [] };
      await refrescar();
      aviso('Datos borrados');
    };
  }

  App.conectarInventario = () => { conectarAgregar(); conectarInventario(); conectarAjustes(); };
  App.nuevaCategoria = nuevaCategoria;
})();
