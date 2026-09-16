/*
 * gestion.js — Fiados (créditos) y clientes, agenda de proveedores y calendario.
 */
(() => {
  const { $, $$, estado, vistas, dinero, esc, cantidad, tarjeta, cuando,
          aviso, abrirModal, cerrarModal, confirmar, ir, refrescar } = App;

  /* ===================== FIADOS ===================== */

  let filtroCredito = 'pendientes';

  vistas.creditos = {
    render: async () => {
      const [creditos, clientes] = await Promise.all([DB.todosCreditos(), DB.todosClientes()]);
      const pendientes = creditos.filter((c) => !c.pagado);
      const vencidos = pendientes.filter((c) => c.fechaPago && c.fechaPago < DB.hoy());
      const porCobrar = pendientes.reduce((s, c) => s + Number(c.saldo), 0);
      const mes = DB.hoy().slice(0, 7);
      const cobradoMes = creditos.reduce((s, c) => s +
        (c.abonos || []).filter((a) => (a.dia || '').startsWith(mes)).reduce((t, a) => t + Number(a.monto), 0), 0);

      $('#resumenCreditos').innerHTML =
        tarjeta('Por cobrar', dinero(porCobrar), porCobrar ? 'ambar' : 'verde', pendientes.length + ' fiado(s)') +
        tarjeta('Vencidos', vencidos.length, vencidos.length ? 'roja' : '') +
        tarjeta('Clientes', clientes.length, 'morada') +
        tarjeta('Cobrado este mes', dinero(cobradoMes), 'verde');

      const cont = $('#listaCreditos');

      if (filtroCredito === 'clientes') {
        cont.innerHTML = clientes.length ? clientes.map((cl) => {
          const suyos = creditos.filter((c) => c.clienteId === cl.id);
          const debe = suyos.filter((c) => !c.pagado).reduce((s, c) => s + Number(c.saldo), 0);
          return '<div class="ticket"><div class="ticket-cab">' +
            '<div><b>' + esc(cl.nombre) + '</b><br><small>' + (cl.telefono ? esc(cl.telefono) : 'sin teléfono') +
            ' · ' + suyos.length + ' fiado(s)</small></div>' +
            '<span class="etiqueta ' + (debe ? 'roja' : 'verde') + '">' + (debe ? 'debe ' + dinero(debe) : 'al corriente') + '</span>' +
            '</div>' +
            '<div class="acciones">' +
              (cl.telefono ? '<a class="btn-sec" style="text-align:center;text-decoration:none" href="tel:' + esc(cl.telefono) + '">📞 Llamar</a>' : '') +
              '<button class="btn-sec" data-editar-cliente="' + cl.id + '">✏️ Editar</button>' +
            '</div></div>';
        }).join('') : '<p class="vacio">Todavía no tienes clientes registrados.</p>';
        cont.querySelectorAll('[data-editar-cliente]').forEach((b) => b.onclick = () =>
          formCliente(clientes.find((c) => c.id === Number(b.dataset.editarCliente))));
        return;
      }

      let lista = pendientes;
      if (filtroCredito === 'vencidos') lista = vencidos;
      if (filtroCredito === 'pagados') lista = creditos.filter((c) => c.pagado);

      if (!lista.length) {
        cont.innerHTML = '<p class="vacio">' + (filtroCredito === 'pagados'
          ? 'Todavía no hay fiados liquidados.'
          : filtroCredito === 'vencidos' ? '¡Nadie te debe vencido!' : 'Nadie tiene fiado pendiente.') + '</p>';
        return;
      }

      cont.innerHTML = lista.map((c) => {
        const vencido = !c.pagado && c.fechaPago && c.fechaPago < DB.hoy();
        const abonado = (c.abonos || []).reduce((s, a) => s + Number(a.monto), 0);
        return '<div class="ticket ' + (c.pagado ? 'pagado' : vencido ? 'vencido' : 'credito') + '">' +
          '<div class="ticket-cab">' +
            '<div><b>' + dinero(c.saldo) + '</b> ' +
            (c.pagado ? '<span class="etiqueta verde">pagado</span>' : vencido ? '<span class="etiqueta roja">vencido</span>' : '') +
            '<br><small>' + esc(c.nombre) + ' · fiado el ' + App.fechaCorta(c.dia) +
            (c.fechaPago ? ' · paga ' + cuando(c.fechaPago) : '') +
            (abonado ? ' · abonado ' + dinero(abonado) : '') + '</small></div>' +
          '</div>' +
          '<ul>' + (c.items || []).map((i) => '<li><span>' + esc(i.nombre) + ' · ' + cantidad(i.cantidad, i.modo) +
            '</span><b>' + dinero(i.cantidad * i.precio) + '</b></li>').join('') + '</ul>' +
          (c.pagado ? '' : '<div class="acciones">' +
            '<button class="btn-principal" data-abonar="' + c.id + '">💵 Abonar</button>' +
            '<button class="btn-sec" data-liquidar="' + c.id + '">✅ Ya pagó todo</button>' +
            (c.telefono ? '<a class="btn-sec" style="text-align:center;text-decoration:none" href="tel:' + esc(c.telefono) + '">📞</a>' : '') +
          '</div>') +
        '</div>';
      }).join('');

      cont.querySelectorAll('[data-abonar]').forEach((b) => b.onclick = () =>
        abonar(lista.find((c) => c.id === Number(b.dataset.abonar))));
      cont.querySelectorAll('[data-liquidar]').forEach((b) => b.onclick = async () => {
        const c = lista.find((x) => x.id === Number(b.dataset.liquidar));
        const ok = await confirmar('Liquidar fiado',
          esc(c.nombre) + ' pagó los ' + dinero(c.saldo) + ' que debía.', 'Sí, ya pagó');
        if (!ok) return;
        await DB.abonarCredito(c.id, c.saldo, 'Liquidado');
        Escaner.pitidoExito();
        await refrescar();
        aviso('Fiado liquidado', 'exito');
      });
    }
  };

  function abonar(credito) {
    abrirModal(
      '<h2>💵 Abono de ' + esc(credito.nombre) + '</h2>' +
      '<p class="sub">Debe ' + dinero(credito.saldo) + '</p>' +
      '<div class="campo"><label>¿Cuánto te dio?</label>' +
      '<input type="number" id="mMonto" inputmode="decimal" step="0.50" value="' + Number(credito.saldo).toFixed(2) + '"></div>' +
      '<p class="resumen-linea" id="mResto"></p>' +
      '<button class="btn-principal" id="mOk">Registrar abono</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );
    const inp = $('#mMonto');
    const pintar = () => {
      const m = parseFloat(inp.value) || 0;
      const resto = Number(credito.saldo) - m;
      $('#mResto').innerHTML = resto > 0.009
        ? 'Le quedarían debiendo <b>' + dinero(resto) + '</b>'
        : '✅ Queda liquidado';
    };
    inp.oninput = pintar;
    pintar();
    setTimeout(() => { inp.focus(); inp.select(); }, 120);
    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = async () => {
      const m = parseFloat(inp.value);
      if (!isFinite(m) || m <= 0) { aviso('Escribe cuánto te dio', 'error'); return; }
      try {
        const c = await DB.abonarCredito(credito.id, m);
        cerrarModal();
        Escaner.pitidoExito();
        await refrescar();
        aviso(c.pagado ? 'Fiado liquidado' : 'Abono registrado, le quedan ' + dinero(c.saldo), 'exito');
      } catch (e) { aviso(e.message, 'error'); }
    };
  }

  function formCliente(cliente) {
    const c = cliente || {};
    abrirModal(
      '<h2>' + (cliente ? '✏️ Editar cliente' : '👤 Nuevo cliente') + '</h2>' +
      '<div class="campo"><label>Nombre</label><input type="text" id="mNombre" value="' + esc(c.nombre || '') + '"></div>' +
      '<div class="campo"><label>Teléfono</label><input type="tel" id="mTel" inputmode="tel" value="' + esc(c.telefono || '') + '"></div>' +
      '<div class="campo"><label>Nota</label><input type="text" id="mNota" value="' + esc(c.nota || '') + '" placeholder="Ej. vecina de la esquina"></div>' +
      '<button class="btn-principal" id="mOk">Guardar</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );
    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = async () => {
      const nombre = $('#mNombre').value.trim();
      if (!nombre) { aviso('Escribe el nombre', 'error'); return; }
      await DB.guardarCliente({ id: c.id, nombre, telefono: $('#mTel').value.trim(), nota: $('#mNota').value.trim(), creado: c.creado });
      cerrarModal();
      await refrescar();
      aviso('Cliente guardado', 'exito');
    };
  }

  function conectarCreditos() {
    $$('#vista-creditos [data-credito]').forEach((b) => b.onclick = () => {
      filtroCredito = b.dataset.credito;
      $$('#vista-creditos [data-credito]').forEach((o) => o.classList.toggle('activo', o === b));
      vistas.creditos.render();
    });
    $('#btnNuevoCliente').onclick = () => formCliente(null);
    $('#btnPDFCreditos').onclick = async () => {
      try {
        const creditos = await DB.creditosPendientes();
        const r = await Reportes.fiados(creditos, estado.cfg);
        await Reportes.guardar(r.doc, r.nombre, false);
      } catch (e) { aviso('No se pudo generar el PDF: ' + e.message, 'error'); }
    };
  }

  /* ===================== AGENDA ===================== */

  let mesVisible = DB.hoy().slice(0, 7);   // YYYY-MM
  let diaElegido = null;

  const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  async function pintarCalendario() {
    const [anio, mes] = mesVisible.split('-').map(Number);
    const primero = new Date(anio, mes - 1, 1);
    const ultimo = new Date(anio, mes, 0);
    const desde = mesVisible + '-01';
    const hasta = mesVisible + '-' + String(ultimo.getDate()).padStart(2, '0');
    const eventos = await DB.eventosRango(desde, hasta);

    $('#calMes').textContent = App.mayusInicial(
      primero.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
    $('#calDias').innerHTML = DIAS.map((d) => '<span>' + d + '</span>').join('');

    let celdas = '';
    for (let i = 0; i < primero.getDay(); i++) celdas += '<button class="cal-celda vacia"></button>';
    for (let d = 1; d <= ultimo.getDate(); d++) {
      const fecha = mesVisible + '-' + String(d).padStart(2, '0');
      const delDia = eventos.filter((e) => e.fecha === fecha && !e.hecho);
      const marcas = delDia.slice(0, 3).map((e) =>
        '<i class="marca ' + (e.tipo === 'cobro' ? 'cobro' : '') + '"></i>').join('');
      const clases = 'cal-celda' + (fecha === DB.hoy() ? ' hoy' : '') + (fecha === diaElegido ? ' sel' : '');
      celdas += '<button class="' + clases + '" data-fecha="' + fecha + '">' + d +
        '<span class="marcas">' + marcas + '</span></button>';
    }
    $('#calRejilla').innerHTML = celdas;
    $$('#calRejilla [data-fecha]').forEach((b) => b.onclick = () => {
      diaElegido = diaElegido === b.dataset.fecha ? null : b.dataset.fecha;
      pintarCalendario();
      pintarListaAgenda();
    });
  }

  async function pintarListaAgenda() {
    const cont = $('#listaAgenda');
    let eventos, titulo;
    if (diaElegido) {
      eventos = (await DB.eventosRango(diaElegido, diaElegido));
      titulo = App.fechaLarga(diaElegido);
    } else {
      eventos = (await DB.eventosPendientes()).slice(0, 25);
      titulo = 'Próximos pendientes';
    }
    $('#tituloDiaAgenda').textContent = titulo;

    if (!eventos.length) {
      cont.innerHTML = '<p class="vacio">' + (diaElegido ? 'Nada agendado ese día.' : 'No tienes pendientes.') + '</p>';
      return;
    }
    cont.innerHTML = eventos.map((e) => {
      const vencido = !e.hecho && e.fecha < DB.hoy();
      return '<div class="evento' + (e.hecho ? ' hecho' : '') + '">' +
        '<i class="punto-tipo ' + (e.tipo === 'cobro' ? 'cobro' : '') + '"></i>' +
        '<div class="cuerpo">' +
          '<b>' + (e.tipo === 'cobro' ? '🤝 ' : '🚚 ') + esc(e.titulo) + '</b>' +
          '<small>' + App.fechaCorta(e.fecha) + (e.hora ? ' · ' + e.hora : '') + ' · ' +
            (vencido ? '<span style="color:var(--rojo)">' + cuando(e.fecha) + '</span>' : cuando(e.fecha)) + '</small>' +
          (e.nota ? '<small>' + esc(e.nota) + '</small>' : '') +
          (e.pedido && e.pedido.length ? '<small>📋 ' + e.pedido.length + ' producto(s) por pedir</small>' : '') +
          '<div class="acciones">' +
            (e.tipo === 'proveedor'
              ? '<button class="btn-sec chico" data-pedido="' + e.id + '">Ver pedido</button>'
              : '<button class="btn-sec chico" data-ircred="1">Ver fiado</button>') +
            (e.hecho ? '' : '<button class="btn-sec chico" data-hecho="' + e.id + '">✓ Hecho</button>') +
            (e.telefono ? '<a class="btn-sec chico" style="text-decoration:none" href="tel:' + esc(e.telefono) + '">📞</a>' : '') +
            '<button class="btn-texto peligro" style="width:auto;padding:7px 10px" data-borrar="' + e.id + '">Borrar</button>' +
          '</div>' +
        '</div></div>';
    }).join('');

    cont.querySelectorAll('[data-hecho]').forEach((b) => b.onclick = async () => {
      await DB.marcarEvento(Number(b.dataset.hecho), true);
      await refrescar();
      aviso('Marcado como hecho', 'exito');
    });
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.onclick = async () => {
      const ok = await confirmar('Borrar del calendario', '¿Quitar este pendiente?', 'Sí, quitar');
      if (!ok) return;
      await DB.borrarEvento(Number(b.dataset.borrar));
      await refrescar();
    });
    cont.querySelectorAll('[data-pedido]').forEach((b) => b.onclick = () => verPedido(Number(b.dataset.pedido)));
    cont.querySelectorAll('[data-ircred]').forEach((b) => b.onclick = () => ir('creditos'));
  }

  /** Lista de lo que hay que pedirle al proveedor en su visita. */
  async function verPedido(eventoId) {
    const ev = await DB.getEvento(eventoId);
    if (!ev) return;
    const sugerido = ev.proveedorId ? await DB.sugerenciaPedido(ev.proveedorId) : [];
    const guardado = ev.pedido && ev.pedido.length ? ev.pedido : sugerido;

    abrirModal(
      '<h2>📋 Pedido para ' + esc(ev.titulo) + '</h2>' +
      '<p class="sub">' + App.fechaLarga(ev.fecha) + (ev.hora ? ' · ' + ev.hora : '') + '</p>' +
      (guardado.length
        ? '<div class="panel"><ul class="lista-simple" id="mPedido">' + guardado.map((i) =>
            '<li><span>' + esc(i.nombre) + '<br><small>quedan ' + i.quedan + '</small></span>' +
            '<b>pedir ' + i.sugerido + '</b></li>').join('') + '</ul></div>'
        : '<p class="vacio">Ahorita no falta nada de este proveedor.</p>') +
      '<button class="btn-sec" id="mRecalcular" style="width:100%">🔄 Recalcular con el inventario de hoy</button>' +
      '<button class="btn-principal" id="mPDF" style="margin-top:8px">📄 Descargar el pedido en PDF</button>' +
      '<button class="btn-texto" id="mCerrar">Cerrar</button>'
    );
    $('#mCerrar').onclick = cerrarModal;
    $('#mRecalcular').onclick = async () => {
      const nuevo = ev.proveedorId ? await DB.sugerenciaPedido(ev.proveedorId) : [];
      ev.pedido = nuevo;
      await DB.guardarEvento(ev);
      cerrarModal();
      verPedido(eventoId);
      aviso('Pedido actualizado', 'exito');
    };
    $('#mPDF').onclick = async () => {
      try {
        const r = await Reportes.pedidoProveedor(ev, guardado, estado.cfg);
        await Reportes.guardar(r.doc, r.nombre, false);
      } catch (e) { aviso('No se pudo generar el PDF: ' + e.message, 'error'); }
    };
  }

  async function formVisita(evento) {
    const e = evento || {};
    const proveedores = estado.proveedores;
    const fecha = e.fecha || diaElegido || DB.sumarDias(DB.hoy(), 1);
    abrirModal(
      '<h2>📅 Visita de proveedor</h2>' +
      '<p class="sub">Agenda el día y te aviso antes, con la lista de lo que falta.</p>' +
      '<div class="campo"><label>Proveedor</label><select id="mProv">' +
        '<option value="nuevo">➕ Proveedor nuevo…</option>' +
        proveedores.map((p) => '<option value="' + p.id + '">' + esc(p.nombre) + '</option>').join('') +
      '</select></div>' +
      '<div id="mNuevoProv">' +
        '<div class="campo"><label>Nombre del proveedor</label><input type="text" id="mProvNombre" placeholder="Ej. Refresquero"></div>' +
        '<div class="campo"><label>Teléfono</label><input type="tel" id="mProvTel" inputmode="tel"></div>' +
        '<div class="campo"><label>¿Qué grupos te surte?</label><div class="chips" id="mProvCats"></div></div>' +
      '</div>' +
      '<div class="rejilla-2">' +
        '<div class="campo"><label>Fecha</label><input type="date" id="mFecha" value="' + fecha + '"></div>' +
        '<div class="campo"><label>Hora</label><input type="time" id="mHora" value="' + (e.hora || '09:00') + '"></div>' +
      '</div>' +
      '<div class="campo"><label>Nota</label><input type="text" id="mNota" value="' + esc(e.nota || '') + '" placeholder="Ej. pedir promoción de six"></div>' +
      '<label class="check"><input type="checkbox" id="mPedidoAuto" checked> Armar la lista de lo que falta</label>' +
      '<button class="btn-principal" id="mOk">Agendar visita</button>' +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );

    const sel = $('#mProv');
    const bloque = $('#mNuevoProv');
    const seleccionadas = [];
    $('#mProvCats').innerHTML = estado.cfg.categorias.map((c) =>
      '<button type="button" class="chip mini" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('');
    $$('#mProvCats [data-cat]').forEach((b) => b.onclick = () => {
      const i = seleccionadas.indexOf(b.dataset.cat);
      if (i >= 0) seleccionadas.splice(i, 1); else seleccionadas.push(b.dataset.cat);
      b.classList.toggle('activo');
    });
    const alternar = () => { bloque.style.display = sel.value === 'nuevo' ? 'block' : 'none'; };
    sel.onchange = alternar;
    if (proveedores.length) sel.value = String(proveedores[0].id);
    alternar();

    $('#mNo').onclick = cerrarModal;
    $('#mOk').onclick = async () => {
      try {
        let prov;
        if (sel.value === 'nuevo') {
          const nombre = $('#mProvNombre').value.trim();
          if (!nombre) { aviso('Escribe el nombre del proveedor', 'error'); return; }
          prov = await DB.guardarProveedor({
            nombre, telefono: $('#mProvTel').value.trim(), categorias: seleccionadas.slice()
          });
        } else {
          prov = await DB.getProveedor(Number(sel.value));
        }
        const pedido = $('#mPedidoAuto').checked ? await DB.sugerenciaPedido(prov.id) : [];
        await DB.guardarEvento({
          id: e.id, tipo: 'proveedor', fecha: $('#mFecha').value, hora: $('#mHora').value,
          titulo: 'Visita ' + prov.nombre, nota: $('#mNota').value.trim(),
          proveedorId: prov.id, telefono: prov.telefono, pedido: pedido
        });
        cerrarModal();
        await refrescar();
        aviso('Visita agendada', 'exito');
      } catch (err) { aviso(err.message, 'error'); }
    };
  }

  function formProveedor(proveedor) {
    const p = proveedor || {};
    const seleccionadas = (p.categorias || []).slice();
    abrirModal(
      '<h2>' + (proveedor ? '✏️ Editar proveedor' : '🚚 Nuevo proveedor') + '</h2>' +
      '<div class="campo"><label>Nombre</label><input type="text" id="mNombre" value="' + esc(p.nombre || '') + '"></div>' +
      '<div class="campo"><label>Teléfono</label><input type="tel" id="mTel" inputmode="tel" value="' + esc(p.telefono || '') + '"></div>' +
      '<div class="campo"><label>¿Qué grupos te surte?</label><div class="chips" id="mCats"></div></div>' +
      '<div class="campo"><label>Nota</label><input type="text" id="mNota" value="' + esc(p.nota || '') + '" placeholder="Ej. pasa los martes"></div>' +
      '<button class="btn-principal" id="mOk">Guardar</button>' +
      (proveedor ? '<button class="btn-texto peligro" id="mBorrar">Eliminar proveedor</button>' : '') +
      '<button class="btn-texto" id="mNo">Cancelar</button>'
    );
    $('#mCats').innerHTML = estado.cfg.categorias.map((c) =>
      '<button type="button" class="chip mini' + (seleccionadas.includes(c) ? ' activo' : '') + '" data-cat="' + esc(c) + '">' +
      esc(c) + '</button>').join('');
    $$('#mCats [data-cat]').forEach((b) => b.onclick = () => {
      const i = seleccionadas.indexOf(b.dataset.cat);
      if (i >= 0) seleccionadas.splice(i, 1); else seleccionadas.push(b.dataset.cat);
      b.classList.toggle('activo');
    });
    $('#mNo').onclick = cerrarModal;
    const borrar = $('#mBorrar');
    if (borrar) borrar.onclick = async () => {
      const ok = await confirmar('Eliminar proveedor', '¿Quitar a ' + p.nombre + '?', 'Sí, quitar');
      if (!ok) return;
      await DB.borrarProveedor(p.id);
      cerrarModal();
      await refrescar();
    };
    $('#mOk').onclick = async () => {
      const nombre = $('#mNombre').value.trim();
      if (!nombre) { aviso('Escribe el nombre', 'error'); return; }
      await DB.guardarProveedor({
        id: p.id, nombre, telefono: $('#mTel').value.trim(),
        categorias: seleccionadas, nota: $('#mNota').value.trim(), creado: p.creado
      });
      cerrarModal();
      await refrescar();
      aviso('Proveedor guardado', 'exito');
    };
  }

  vistas.agenda = {
    render: async () => {
      await pintarCalendario();
      await pintarListaAgenda();
      const provs = estado.proveedores;
      $('#listaProveedores').innerHTML = provs.length
        ? provs.map((p) => '<div class="evento"><i class="punto-tipo"></i><div class="cuerpo">' +
            '<b>' + esc(p.nombre) + '</b>' +
            '<small>' + (p.telefono ? esc(p.telefono) : 'sin teléfono') +
            (p.categorias && p.categorias.length ? ' · ' + esc(p.categorias.join(', ')) : '') + '</small>' +
            '<div class="acciones">' +
              '<button class="btn-sec chico" data-agendar="' + p.id + '">📅 Agendar</button>' +
              '<button class="btn-sec chico" data-editar="' + p.id + '">✏️ Editar</button>' +
              (p.telefono ? '<a class="btn-sec chico" style="text-decoration:none" href="tel:' + esc(p.telefono) + '">📞</a>' : '') +
            '</div></div></div>').join('')
        : '<p class="vacio">Agrega a tus proveedores para llevar sus visitas y pedidos.</p>';
      $$('#listaProveedores [data-editar]').forEach((b) => b.onclick = () =>
        formProveedor(provs.find((p) => p.id === Number(b.dataset.editar))));
      $$('#listaProveedores [data-agendar]').forEach((b) => b.onclick = () =>
        formVisita({ proveedorId: Number(b.dataset.agendar) }));
    }
  };

  function conectarAgenda() {
    $('#calAtras').onclick = () => {
      const [a, m] = mesVisible.split('-').map(Number);
      const d = new Date(a, m - 2, 1);
      mesVisible = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      pintarCalendario();
    };
    $('#calAdelante').onclick = () => {
      const [a, m] = mesVisible.split('-').map(Number);
      const d = new Date(a, m, 1);
      mesVisible = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      pintarCalendario();
    };
    $('#btnNuevaVisita').onclick = () => formVisita(null);
    $('#btnNuevoProveedor').onclick = () => formProveedor(null);
  }

  App.conectarGestion = () => { conectarCreditos(); conectarAgenda(); };
})();
