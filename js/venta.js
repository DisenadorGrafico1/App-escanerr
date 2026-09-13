/*
 * venta.js — Pantallas de Vender, Ventas/tickets y Caja (abrir y cerrar el día).
 */
(() => {
  const { $, $$, estado, vistas, dinero, esc, cantidad, hora, fechaLarga, tarjeta,
          aviso, abrirModal, cerrarModal, confirmar, pedirNumero, ir, refrescar } = App;

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

  function mensajeCamara(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError') return 'Debes permitir el uso de la cámara en el navegador';
    if (n === 'NotFoundError') return 'No se encontró ninguna cámara en el celular';
    if (n === 'NotReadableError') return 'Otra app está usando la cámara; ciérrala e intenta de nuevo';
    return (e && e.message) || 'No se pudo abrir la cámara';
  }

  async function alternarCamara(video, callback) {
    try {
      if (Escaner.estaActivo()) await Escaner.detener();
      else { Escaner.configurar(estado.cfg); await Escaner.iniciar(video, callback); }
    } catch (e) { aviso(mensajeCamara(e), 'error'); }
    pintarBotonesCamara();
  }

  App.pintarBotonesCamara = pintarBotonesCamara;
  App.alternarCamara = alternarCamara;

  /* ===================== elegir productos sin código ===================== */

  /** Rejilla para tocar productos que no traen código de barras o van a granel. */
  function elegirSinCodigo(alElegir) {
    const lista = estado.productos.filter((p) => p.sinCodigo || p.tipoVenta === 'peso');
    let html = '<h2>🍅 Productos sin código</h2>' +
      '<p class="sub">Fruta, verdura, granel y todo lo que no trae código de barras.</p>' +
      '<input type="search" id="mBuscar" placeholder="🔎 Buscar">';
    if (!lista.length) {
      html += '<p class="vacio">Todavía no tienes productos sin código. Regístralos en <b>Agregar</b> con el botón "Producto sin código".</p>';
    } else {
      html += '<div class="rejilla-productos" id="mRejilla"></div>';
    }
    html += '<button class="btn-texto" id="mCerrar">Cerrar</button>';
    abrirModal(html);
    $('#mCerrar').onclick = cerrarModal;

    const pintar = (filtro) => {
      const cont = $('#mRejilla');
      if (!cont) return;
      const f = (filtro || '').toLowerCase();
      const visibles = lista.filter((p) => !f || p.nombre.toLowerCase().includes(f));
      cont.innerHTML = visibles.map((p) =>
        '<button class="prod-boton" data-codigo="' + esc(p.codigo) + '">' +
          '<b>' + esc(p.nombre) + '</b>' +
          '<small>' + esc(p.categoria || '') + ' · quedan ' + DB.existenciaTexto(p) + '</small>' +
          '<span class="precio">' + dinero(p.precio) + (p.tipoVenta === 'peso' ? ' / ' + (p.unidad || 'kg') : '') + '</span>' +
        '</button>').join('') || '<p class="vacio">Nada con ese nombre.</p>';
      cont.querySelectorAll('[data-codigo]').forEach((b) => b.onclick = () => {
        cerrarModal();
        alElegir(b.dataset.codigo);
      });
    };
    pintar('');
    const buscar = $('#mBuscar');
    if (buscar) buscar.oninput = () => pintar(buscar.value);
  }

  function pedirCodigo(titulo, alAceptar) {
    abrirModal('<h2>' + esc(titulo) + '</h2><p class="sub">Escribe el código de barras tal como viene impreso.</p>' +
      '<input type="text" id="mCod" inputmode="numeric" placeholder="Ej. 7501055300013">' +
      '<button class="btn-principal" id="mOk" style="margin-top:10px">Aceptar</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>');
    const inp = $('#mCod');
    setTimeout(() => inp.focus(), 120);
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#mOk').click(); } };
    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = () => {
      const v = inp.value.trim();
      cerrarModal();
      if (v) { Escaner.limpiarUltimo(); alAceptar(v); }
    };
  }
  App.pedirCodigo = pedirCodigo;
  App.elegirSinCodigo = elegirSinCodigo;

  /* ===================== carrito ===================== */

  function precioDe(prod, modo) {
    if (modo === 'paquete') {
      return Number(prod.precioPaquete) || Number(prod.precio) * Number(prod.piezasPorPaquete || 1);
    }
    return Number(prod.precio);
  }

  function costoDe(prod, modo) {
    if (modo === 'paquete') {
      return Number(prod.costoPaquete) || Number(prod.costo) * Number(prod.piezasPorPaquete || 1);
    }
    return Number(prod.costo);
  }

  function agregarAlCarrito(prod, modo, cant) {
    const existente = estado.carrito.find((i) => i.codigo === prod.codigo && i.modo === modo);
    if (existente && modo !== 'peso') {
      existente.cantidad += cant;
    } else if (existente && modo === 'peso') {
      existente.cantidad = cant;
    } else {
      estado.carrito.push({
        codigo: prod.codigo, nombre: prod.nombre, modo: modo, cantidad: cant,
        precio: precioDe(prod, modo), costo: costoDe(prod, modo),
        unidad: prod.unidad, stock: Number(prod.stock),
        factor: DB.factor(prod, modo), tipoVenta: prod.tipoVenta
      });
    }
    pintarCarrito();
  }

  async function alCodigoVenta(codigo) {
    const prod = await DB.getProducto(codigo);
    if (!prod) {
      Escaner.pitidoError();
      const ok = await confirmar('Producto no registrado',
        'El código ' + codigo + ' no está en tu inventario. ¿Lo damos de alta ahora?', 'Registrar producto');
      if (ok) { await ir('agregar'); App.cargarFormulario(codigo); }
      return;
    }
    if (Number(prod.stock) <= 0 && !estado.cfg.permitirNegativo) {
      Escaner.pitidoError();
      aviso('No queda existencia de ' + prod.nombre, 'error');
      return;
    }

    if (prod.tipoVenta === 'peso') {
      pedirPeso(prod);
    } else if (prod.tipoVenta === 'paquete') {
      elegirPaqueteOPieza(prod);
    } else {
      agregarAlCarrito(prod, 'pieza', 1);
    }
  }

  /** Para lo que se vende a granel: se captura kilos o el monto en dinero. */
  function pedirPeso(prod) {
    const unidad = prod.unidad || 'kg';
    abrirModal(
      '<h2>' + esc(prod.nombre) + '</h2>' +
      '<p class="sub">' + dinero(prod.precio) + ' por ' + unidad + ' · quedan ' + DB.existenciaTexto(prod) + '</p>' +
      '<div class="campo"><label>¿Cuánto pesó? (' + unidad + ')</label>' +
      '<input type="number" id="mPeso" inputmode="decimal" step="0.001" placeholder="Ej. 1.250"></div>' +
      '<div class="campo"><label>…o cuánto va a llevar en dinero</label>' +
      '<input type="number" id="mMonto" inputmode="decimal" step="0.50" placeholder="Ej. 50"></div>' +
      '<p class="resumen-linea" id="mResumen"></p>' +
      '<button class="btn-principal" id="mOk">Agregar a la venta</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );
    const peso = $('#mPeso'), monto = $('#mMonto'), resumen = $('#mResumen');
    setTimeout(() => peso.focus(), 120);
    const precio = Number(prod.precio) || 0;
    const pintar = (kg) => {
      resumen.innerHTML = kg > 0
        ? '<b>' + kg.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' ' + unidad + '</b> = <b>' + dinero(kg * precio) + '</b>'
        : '';
    };
    peso.oninput = () => {
      const kg = parseFloat(peso.value) || 0;
      monto.value = kg > 0 ? (kg * precio).toFixed(2) : '';
      pintar(kg);
    };
    monto.oninput = () => {
      const m = parseFloat(monto.value) || 0;
      const kg = precio > 0 ? m / precio : 0;
      peso.value = kg > 0 ? kg.toFixed(3) : '';
      pintar(kg);
    };
    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = () => {
      const kg = parseFloat(peso.value);
      if (!isFinite(kg) || kg <= 0) { aviso('Escribe el peso o el monto', 'error'); return; }
      cerrarModal();
      agregarAlCarrito(prod, 'peso', kg);
    };
  }

  /** Paquete completo o pieza suelta (cajetilla de cigarros, six de refrescos…). */
  function elegirPaqueteOPieza(prod) {
    const n = Number(prod.piezasPorPaquete) || 1;
    abrirModal(
      '<h2>' + esc(prod.nombre) + '</h2>' +
      '<p class="sub">Quedan ' + DB.existenciaTexto(prod) + ' · cada paquete trae ' + n + ' piezas</p>' +
      '<button class="btn-principal grande" id="mPaquete">📦 Paquete completo · ' + dinero(precioDe(prod, 'paquete')) + '</button>' +
      '<button class="btn-ambar grande" id="mPieza">☝️ Una pieza · ' + dinero(prod.precio) + '</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );
    $('#mNo').onclick = cerrarModal;
    $('#mPaquete').onclick = () => { cerrarModal(); agregarAlCarrito(prod, 'paquete', 1); };
    $('#mPieza').onclick = () => { cerrarModal(); agregarAlCarrito(prod, 'pieza', 1); };
  }

  function totalCarrito() {
    return estado.carrito.reduce((s, i) => s + i.cantidad * i.precio, 0);
  }

  function pintarCarrito() {
    const cont = $('#carrito');
    if (!estado.carrito.length) {
      cont.innerHTML = '<p class="vacio">Escanea o elige productos para empezar.</p>';
    } else {
      cont.innerHTML = estado.carrito.map((i, idx) => {
        const unidades = i.cantidad * (i.factor || 1);
        const falta = i.modo !== 'peso' && unidades > i.stock;
        return '<div class="renglon">' +
          '<div class="info"><b>' + esc(i.nombre) + '</b><small>' +
            dinero(i.precio) + ' / ' + (i.modo === 'paquete' ? 'paquete' : i.modo === 'peso' ? (i.unidad || 'kg') : 'pieza') +
            (falta ? ' · ⚠️ solo hay ' + i.stock : '') + '</small></div>' +
          '<div class="mini-contador">' +
            '<button data-menos="' + idx + '">−</button>' +
            '<span data-editar="' + idx + '">' + cantidad(i.cantidad, i.modo, i) + '</span>' +
            '<button data-mas="' + idx + '">+</button>' +
          '</div>' +
          '<div class="precio">' + dinero(i.cantidad * i.precio) + '</div>' +
        '</div>';
      }).join('');

      cont.querySelectorAll('[data-mas]').forEach((b) => b.onclick = () => {
        const i = estado.carrito[+b.dataset.mas];
        i.cantidad += (i.modo === 'peso' ? 0.1 : 1);
        i.cantidad = Math.round(i.cantidad * 1000) / 1000;
        pintarCarrito();
      });
      cont.querySelectorAll('[data-menos]').forEach((b) => b.onclick = () => {
        const idx = +b.dataset.menos;
        const i = estado.carrito[idx];
        i.cantidad -= (i.modo === 'peso' ? 0.1 : 1);
        i.cantidad = Math.round(i.cantidad * 1000) / 1000;
        if (i.cantidad <= 0) estado.carrito.splice(idx, 1);
        pintarCarrito();
      });
      cont.querySelectorAll('[data-editar]').forEach((s) => s.onclick = async () => {
        const i = estado.carrito[+s.dataset.editar];
        const v = await pedirNumero('Cantidad de ' + i.nombre, '', i.cantidad,
          i.modo === 'peso' ? (i.unidad || 'kg') : i.modo === 'paquete' ? 'Paquetes' : 'Piezas');
        if (v === null) return;
        if (v <= 0) estado.carrito.splice(estado.carrito.indexOf(i), 1);
        else i.cantidad = v;
        pintarCarrito();
      });
    }

    const piezas = estado.carrito.reduce((s, i) => s + (i.modo === 'peso' ? 1 : i.cantidad), 0);
    $('#carritoPiezas').textContent = Math.round(piezas * 100) / 100;
    $('#carritoTotal').textContent = dinero(totalCarrito());
    $('#btnCobrar').disabled = !estado.carrito.length;
    $('#btnFiar').disabled = !estado.carrito.length;
    calcularCambio();
  }

  function calcularCambio() {
    const total = totalCarrito();
    const paga = parseFloat($('#pagaCon').value);
    $('#cambio').textContent = (isFinite(paga) && paga >= total) ? dinero(paga - total) : dinero(0);
  }

  function limpiarCarrito() {
    estado.carrito = [];
    $('#pagaCon').value = '';
    Escaner.limpiarUltimo();
    pintarCarrito();
  }

  /* ===================== cobrar ===================== */

  async function cobrar() {
    if (!estado.carrito.length) return;
    if (!estado.jornada) {
      const abrir = await new Promise((resolve) => {
        abrirModal('<h2>El día no está abierto</h2>' +
          '<p class="sub">Si abres el día, esta venta entra en el corte de hoy y sabrás cuánto debe haber en la caja.</p>' +
          '<button class="btn-principal" id="mAbrir">Abrir el día y cobrar</button>' +
          '<button class="btn-sec" id="mSolo" style="margin-top:8px;width:100%">Solo cobrar</button>' +
          '<button class="btn-texto" id="mNo">Cancelar</button>');
        $('#mAbrir').onclick = () => { cerrarModal(); resolve('abrir'); };
        $('#mSolo').onclick = () => { cerrarModal(); resolve('solo'); };
        $('#mNo').onclick = () => { cerrarModal(); resolve(null); };
      });
      if (!abrir) return;
      if (abrir === 'abrir') {
        estado.jornada = await DB.abrirDia(0, 'Abierto al cobrar');
        App.pintarAlertas();
      }
    }

    const total = totalCarrito();
    const paga = parseFloat($('#pagaCon').value);
    const recibido = isFinite(paga) ? paga : 0;
    const cambio = recibido >= total ? recibido - total : 0;
    try {
      const venta = await DB.registrarVenta(estado.carrito, { recibido, cambio, tipoPago: 'efectivo' });
      Escaner.pitidoExito();
      limpiarCarrito();
      await refrescar(false);
      mostrarTicket(venta, cambio, recibido);
    } catch (e) {
      Escaner.pitidoError();
      aviso(e.message, 'error');
    }
  }

  async function mostrarTicket(venta, cambio, recibido) {
    const resumen = await DB.resumenDia(DB.hoy());
    abrirModal(
      '<h2>✅ Venta registrada</h2>' +
      '<p class="sub">Ticket #' + venta.id + ' · ' + hora(venta.fecha) + '</p>' +
      '<div class="panel"><div class="totalizador">' +
        '<div><span>Artículos</span><b>' + Math.round(venta.piezas * 100) / 100 + '</b></div>' +
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
  }

  /* ===================== fiar (venta a crédito) ===================== */

  async function fiar() {
    if (!estado.carrito.length) return;
    const clientes = await DB.todosClientes();
    const total = totalCarrito();
    const fechaPago = DB.sumarDias(DB.hoy(), Number(estado.cfg.diasCreditoDefault) || 7);

    abrirModal(
      '<h2>🤝 Dar crédito</h2>' +
      '<p class="sub">Total a fiar: <b>' + dinero(total) + '</b>. Los productos salen del inventario y queda agendado el cobro.</p>' +
      '<div class="campo"><label>Cliente</label><select id="mCliente">' +
        '<option value="nuevo">➕ Cliente nuevo…</option>' +
        clientes.map((c) => '<option value="' + c.id + '">' + esc(c.nombre) + (c.telefono ? ' · ' + esc(c.telefono) : '') + '</option>').join('') +
      '</select></div>' +
      '<div id="mNuevoCliente">' +
        '<div class="campo"><label>Nombre</label><input type="text" id="mNombre" placeholder="Ej. Doña Mary"></div>' +
        '<div class="campo"><label>Teléfono (para recordarle)</label><input type="tel" id="mTel" inputmode="tel" placeholder="10 dígitos"></div>' +
      '</div>' +
      '<div class="campo"><label>¿Cuándo debe pagar?</label><input type="date" id="mFecha" value="' + fechaPago + '"></div>' +
      '<button class="btn-ambar grande" id="mOk">Registrar el fiado</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );

    const sel = $('#mCliente');
    const bloque = $('#mNuevoCliente');
    const alternar = () => { bloque.style.display = sel.value === 'nuevo' ? 'block' : 'none'; };
    sel.onchange = alternar;
    if (clientes.length) { sel.value = String(clientes[0].id); }
    alternar();

    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = async () => {
      try {
        let cliente;
        if (sel.value === 'nuevo') {
          const nombre = $('#mNombre').value.trim();
          if (!nombre) { aviso('Escribe el nombre del cliente', 'error'); return; }
          cliente = await DB.guardarCliente({ nombre, telefono: $('#mTel').value.trim() });
        } else {
          cliente = await DB.getCliente(Number(sel.value));
        }
        const fecha = $('#mFecha').value || fechaPago;
        const venta = await DB.registrarVenta(estado.carrito,
          { tipoPago: 'credito', clienteId: cliente.id, recibido: 0, cambio: 0 });
        const credito = await DB.crearCredito(venta, cliente, fecha);
        Escaner.pitidoExito();
        limpiarCarrito();
        cerrarModal();
        await refrescar(false);
        abrirModal(
          '<h2>🤝 Fiado registrado</h2>' +
          '<p class="sub">' + esc(cliente.nombre) + (cliente.telefono ? ' · ' + esc(cliente.telefono) : '') + '</p>' +
          '<div class="panel"><div class="totalizador">' +
            '<div><span>Debe</span><b>' + dinero(credito.total) + '</b></div>' +
            '<div class="grande"><span>Paga el</span><b style="font-size:18px">' + App.fechaCorta(fecha) + '</b></div>' +
          '</div>' +
          '<p class="ayuda">Ya quedó anotado en tu agenda y te avisaré cuando se acerque la fecha.</p></div>' +
          '<button class="btn-principal" id="mVer">Ver fiados</button>' +
          '<button class="btn-texto" id="mCerrar2">Seguir vendiendo</button>'
        );
        $('#mVer').onclick = () => { cerrarModal(); ir('creditos'); };
        $('#mCerrar2').onclick = cerrarModal;
      } catch (e) {
        aviso(e.message, 'error');
      }
    };
  }

  /* ===================== vista Vender ===================== */

  vistas.vender = {
    render: async () => { pintarCarrito(); pintarBotonesCamara(); },
    salir: () => { Escaner.detener().then(pintarBotonesCamara); }
  };

  function conectarVender() {
    $('#btnCamaraVender').onclick = () => alternarCamara($('#videoVender'), alCodigoVenta);
    $('#btnLuzVender').onclick = () => Escaner.alternarLinterna();
    $('#btnVaciarCarrito').onclick = limpiarCarrito;
    $('#pagaCon').addEventListener('input', calcularCambio);
    $('#btnCobrar').onclick = cobrar;
    $('#btnFiar').onclick = fiar;
    $('#btnSinCodigoVender').onclick = () => elegirSinCodigo(alCodigoVenta);
    $('#btnTecleadoVender').onclick = () => pedirCodigo('Escribir código', alCodigoVenta);
  }

  /* ===================== vista Ventas ===================== */

  function rangoVentas() {
    return { desde: $('#ventasDesde').value || DB.hoy(), hasta: $('#ventasHasta').value || DB.hoy() };
  }
  App.rangoVentas = rangoVentas;

  vistas.ventas = {
    render: async () => {
      const { desde, hasta } = rangoVentas();
      const r = await DB.resumenRango(desde, hasta);
      const porHora = await DB.ventasPorHora(desde, hasta);

      $('#resumenVentas').innerHTML =
        tarjeta('Vendido', dinero(r.total), 'morada') +
        tarjeta('Ganancia', dinero(r.ganancia), 'verde') +
        tarjeta('Tickets', r.tickets, '') +
        tarjeta('Fiado', dinero(r.credito), r.credito ? 'ambar' : '');

      // gráfica sencilla de barras por hora
      const conVentas = porHora.conVentas;
      $('#panelHoras').hidden = !conVentas.length;
      if (conVentas.length) {
        const desdeH = Math.max(0, Math.min.apply(null, conVentas.map((h) => h.hora)) - 1);
        const hastaH = Math.min(23, Math.max.apply(null, conVentas.map((h) => h.hora)) + 1);
        const max = Math.max.apply(null, porHora.horas.map((h) => h.total)) || 1;
        let barras = '';
        for (let h = desdeH; h <= hastaH; h++) {
          const dato = porHora.horas[h];
          const alto = Math.round((dato.total / max) * 100);
          barras += '<div class="barra' + (porHora.masGente && porHora.masGente.hora === h ? ' pico' : '') + '" ' +
            'title="' + h + ':00 · ' + dinero(dato.total) + '">' +
            '<div class="relleno" style="height:' + alto + '%"></div><span>' + h + '</span></div>';
        }
        $('#graficaHoras').innerHTML = barras;
        $('#resumenHoras').innerHTML = porHora.masGente
          ? 'Más clientes entre las <b>' + porHora.masGente.hora + ':00 y ' + (porHora.masGente.hora + 1) + ':00</b> (' +
            porHora.masGente.tickets + ' ventas) · más dinero a las <b>' + porHora.mejor.hora + ':00</b> (' +
            dinero(porHora.mejor.total) + ')'
          : '';
      }

      const multiDia = desde !== hasta;
      $('#panelDias').hidden = !multiDia || !r.dias.length;
      if (multiDia) {
        $('#listaDias').innerHTML = r.dias.map((d) =>
          '<div class="dia-fila"><span>' + App.fechaCorta(d.dia) + ' · ' + d.tickets + ' tickets</span>' +
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
        '<div class="ticket' + (v.tipoPago === 'credito' ? ' credito' : '') + '">' +
          '<div class="ticket-cab">' +
            '<div><b>' + dinero(v.total) + '</b>' +
            (v.tipoPago === 'credito' ? ' <span class="etiqueta nuevo">fiado</span>' : '') +
            '<br><small>#' + v.id + ' · ' + App.fechaCorta(v.dia) + ' ' + hora(v.fecha) +
            ' · ganancia ' + dinero(v.ganancia) + '</small></div>' +
            '<button class="chip-borrar" data-cancelar="' + v.id + '">Cancelar</button>' +
          '</div>' +
          '<ul>' + v.items.map((i) => '<li><span>' + esc(i.nombre) + ' · ' + cantidad(i.cantidad, i.modo, i) + '</span>' +
            '<b>' + dinero(i.cantidad * i.precio) + '</b></li>').join('') + '</ul>' +
        '</div>'
      )).join('');
      cont.querySelectorAll('[data-cancelar]').forEach((b) => b.onclick = async () => {
        const ok = await confirmar('Cancelar venta',
          'Los productos regresan al inventario y el ticket se borra de las cuentas del día.', 'Sí, cancelar');
        if (!ok) return;
        await DB.cancelarVenta(Number(b.dataset.cancelar));
        await refrescar();
        aviso('Venta cancelada');
      });
    }
  };

  function conectarVentas() {
    $('#ventasDesde').value = DB.hoy();
    $('#ventasHasta').value = DB.hoy();
    $$('#vista-ventas [data-rango]').forEach((b) => b.onclick = () => {
      const r = b.dataset.rango;
      if (r === 'hoy') { $('#ventasDesde').value = DB.hoy(); $('#ventasHasta').value = DB.hoy(); }
      if (r === 'ayer') { $('#ventasDesde').value = DB.sumarDias(DB.hoy(), -1); $('#ventasHasta').value = DB.sumarDias(DB.hoy(), -1); }
      if (r === 'semana') { $('#ventasDesde').value = DB.sumarDias(DB.hoy(), -6); $('#ventasHasta').value = DB.hoy(); }
      if (r === 'mes') { $('#ventasDesde').value = DB.hoy().slice(0, 8) + '01'; $('#ventasHasta').value = DB.hoy(); }
      $$('#vista-ventas [data-rango]').forEach((o) => o.classList.toggle('activo', o === b));
      vistas.ventas.render();
    });
    $('#ventasDesde').addEventListener('change', () => vistas.ventas.render());
    $('#ventasHasta').addEventListener('change', () => vistas.ventas.render());
  }

  /* ===================== vista Caja (abrir y cerrar el día) ===================== */

  vistas.caja = {
    render: async () => {
      const j = estado.jornada;
      const cont = $('#panelCaja');

      if (!j) {
        cont.innerHTML =
          '<div class="panel-titulo"><h2>💵 Abrir el día</h2><span class="etiqueta">cerrado</span></div>' +
          '<p class="ayuda">Anota con cuánto dinero empiezas en la caja (el fondo para dar cambio). Al final del día haces el corte y sabrás si cuadra.</p>' +
          '<div class="campo"><label>Fondo inicial de caja</label>' +
          '<input type="number" id="cajaFondo" inputmode="decimal" step="0.50" placeholder="Ej. 500"></div>' +
          '<button class="btn-principal grande" id="btnAbrirDia">🟢 Abrir día de venta</button>';
        $('#btnAbrirDia').onclick = async () => {
          const fondo = parseFloat($('#cajaFondo').value) || 0;
          await DB.abrirDia(fondo, '');
          await refrescar();
          aviso('Día abierto. ¡A vender!', 'exito');
        };
      } else {
        const ventas = await DB.ventasDeJornada(j.id);
        const efectivo = ventas.filter((v) => v.tipoPago !== 'credito').reduce((s, v) => s + Number(v.total), 0);
        const credito = ventas.filter((v) => v.tipoPago === 'credito').reduce((s, v) => s + Number(v.total), 0);
        const abonos = (await DB.abonosDelDia(j.dia)).reduce((s, a) => s + Number(a.monto), 0);
        const ganancia = ventas.reduce((s, v) => s + Number(v.ganancia), 0);
        const esperado = Number(j.fondoInicial) + efectivo + abonos;

        cont.innerHTML =
          '<div class="panel-titulo"><h2>🟢 Día abierto</h2><span class="etiqueta verde">desde ' + hora(j.apertura) + '</span></div>' +
          '<div class="tarjetas">' +
            tarjeta('Fondo inicial', dinero(j.fondoInicial), '') +
            tarjeta('Ventas en efectivo', dinero(efectivo), 'verde', ventas.length + ' ticket(s)') +
            tarjeta('Fiado del día', dinero(credito), credito ? 'ambar' : '') +
            tarjeta('Abonos recibidos', dinero(abonos), '') +
            tarjeta('Debe haber en caja', dinero(esperado), 'morada', 'fondo + efectivo + abonos') +
            tarjeta('Ganancia del día', dinero(ganancia), 'verde') +
          '</div>' +
          '<div class="campo destacado"><label>¿Cuánto dinero contaste en la caja?</label>' +
          '<input type="number" id="cajaContado" inputmode="decimal" step="0.50" value="' + esperado.toFixed(2) + '"></div>' +
          '<p class="resumen-linea" id="cajaDiferencia"></p>' +
          '<div class="campo"><label>Nota del corte (opcional)</label>' +
          '<input type="text" id="cajaNota" placeholder="Ej. saqué 200 para el gas"></div>' +
          '<button class="btn-principal grande" id="btnCerrarDia">🔒 Hacer corte y cerrar el día</button>';

        const pintarDif = () => {
          const contado = parseFloat($('#cajaContado').value);
          if (!isFinite(contado)) { $('#cajaDiferencia').textContent = ''; return; }
          const dif = contado - esperado;
          $('#cajaDiferencia').innerHTML = Math.abs(dif) < 0.01
            ? '✅ La caja cuadra exactamente.'
            : (dif > 0 ? '🔵 Sobran <b>' + dinero(dif) + '</b>' : '🔴 Faltan <b>' + dinero(-dif) + '</b>');
        };
        $('#cajaContado').oninput = pintarDif;
        pintarDif();

        $('#btnCerrarDia').onclick = async () => {
          const contado = parseFloat($('#cajaContado').value);
          const ok = await confirmar('Cerrar el día',
            'Se guardará el corte y ya no podrás agregar ventas a este día.', 'Sí, cerrar el día');
          if (!ok) return;
          const corte = await DB.cerrarDia(isFinite(contado) ? contado : esperado, $('#cajaNota').value.trim());
          await refrescar(false);
          Escaner.pitidoExito();
          mostrarCorte(corte);
          vistas.caja.render();
        };
      }

      const cortes = (await DB.jornadasRecientes(15)).filter((c) => !c.abierta);
      $('#listaCortes').innerHTML = cortes.length
        ? cortes.map((c) => (
          '<div class="ticket"><div class="ticket-cab">' +
            '<div><b>' + dinero(c.totalVendido || 0) + '</b><br><small>' + App.fechaCorta(c.dia) + ' · ' +
            (c.tickets || 0) + ' tickets · ganancia ' + dinero(c.ganancia || 0) + '</small></div>' +
            '<span class="etiqueta ' + (Math.abs(c.diferencia || 0) < 0.01 ? 'verde' : 'roja') + '">' +
            (Math.abs(c.diferencia || 0) < 0.01 ? 'cuadró' : (c.diferencia > 0 ? 'sobró ' : 'faltó ') + dinero(Math.abs(c.diferencia))) +
            '</span>' +
          '</div></div>')).join('')
        : '<p class="vacio">Todavía no has cerrado ningún día.</p>';
    }
  };

  function mostrarCorte(c) {
    abrirModal(
      '<h2>🔒 Corte del día</h2><p class="sub">' + fechaLarga(c.dia) + '</p>' +
      '<div class="panel"><ul class="lista-simple">' +
        '<li><span>Fondo inicial</span><b>' + dinero(c.fondoInicial) + '</b></li>' +
        '<li><span>Ventas en efectivo</span><b>' + dinero(c.totalEfectivo) + '</b></li>' +
        '<li><span>Abonos de fiados</span><b>' + dinero(c.totalAbonos) + '</b></li>' +
        '<li><span>Vendido a crédito</span><b>' + dinero(c.totalCredito) + '</b></li>' +
        '<li><span>Debía haber en caja</span><b>' + dinero(c.esperadoEnCaja) + '</b></li>' +
        '<li><span>Contaste</span><b>' + dinero(c.efectivoContado) + '</b></li>' +
        '<li><span>Diferencia</span><b style="color:' + (Math.abs(c.diferencia) < 0.01 ? 'var(--verde)' : 'var(--rojo)') + '">' +
          dinero(c.diferencia) + '</b></li>' +
        '<li><span>Ganancia del día</span><b style="color:var(--verde)">' + dinero(c.ganancia) + '</b></li>' +
      '</ul></div>' +
      '<button class="btn-sec" id="mPDF" style="width:100%">📄 Descargar el corte en PDF</button>' +
      '<button class="btn-texto" id="mCerrar">Listo</button>'
    );
    $('#mCerrar').onclick = cerrarModal;
    $('#mPDF').onclick = async () => {
      try {
        const r = await Reportes.corteCaja(c, estado.cfg);
        await Reportes.guardar(r.doc, r.nombre, false);
      } catch (e) { aviso('No se pudo generar el PDF: ' + e.message, 'error'); }
    };
  }

  App.conectarVenta = () => { conectarVender(); conectarVentas(); };
  App.pintarCarrito = pintarCarrito;
  App.alCodigoVenta = alCodigoVenta;
})();
