/*
 * nucleo.js — Lo común a todas las pantallas: navegación, menú lateral,
 * avisos, ventanas emergentes y la pantalla de Inicio.
 */
const App = (() => {
  /* Se sube en cada publicación: sirve para saber qué trae el celular. */
  const VERSION = '2.2';
  const FECHA_VERSION = '13 sep 2026';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const estado = {
    cfg: null,
    productos: [],
    proveedores: [],
    carrito: [],
    sesion: { piezas: 0, invertido: 0, items: [] },
    jornada: null,
    alertas: { bajos: [], visitas: [], cobros: [], vencidos: [], total: 0 },
    vista: 'inicio'
  };

  const vistas = {};   // cada módulo registra las suyas

  /* ===================== formato ===================== */

  function dinero(n) {
    const v = (isFinite(n) ? Number(n) : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (estado.cfg ? estado.cfg.moneda : '$') + v;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Cantidad con su unidad: "3 pzs", "1.250 kg", "2 paq." */
  function cantidad(valor, modo, prod) {
    const n = Number(valor);
    if (modo === 'peso') return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' ' + ((prod && prod.unidad) || 'kg');
    if (modo === 'paquete') return n + ' paq.';
    return n + ' pzs';
  }

  function hora(iso) {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  /** "Domingo 13 de septiembre": mayúscula solo en la primera letra. */
  function mayusInicial(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function fechaLarga(dia) {
    return mayusInicial(new Date(dia + 'T12:00:00').toLocaleDateString('es-MX',
      { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  function fechaCorta(dia) {
    return new Date(dia + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }

  /** "hoy", "mañana", "hace 3 días"… para que se lea natural. */
  function cuando(dia) {
    const hoy = DB.hoy();
    if (dia === hoy) return 'hoy';
    if (dia === DB.sumarDias(hoy, 1)) return 'mañana';
    if (dia === DB.sumarDias(hoy, -1)) return 'ayer';
    const dif = Math.round((new Date(dia + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000);
    return dif > 0 ? 'en ' + dif + ' días' : 'hace ' + Math.abs(dif) + ' días';
  }

  function tarjeta(titulo, valor, clase, nota) {
    return '<div class="tarjeta-dato ' + (clase || '') + '"><span>' + titulo + '</span><b>' + valor + '</b>' +
      (nota ? '<small>' + nota + '</small>' : '') + '</div>';
  }

  function nivel(p) {
    const stock = Number(p.stock), min = Number(p.minimo) || 0;
    if (stock <= min) return 'bajo';
    if (stock <= min * 2) return 'medio';
    return '';
  }

  /* ===================== avisos y ventanas ===================== */

  let avisoTimer = null;
  function aviso(texto, tipo) {
    const el = $('#aviso');
    el.textContent = texto;
    el.className = 'aviso ver' + (tipo ? ' ' + tipo : '');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.className = 'aviso'; }, 2800);
  }

  function abrirModal(html) {
    $('#modalCaja').innerHTML = html;
    $('#modal').classList.remove('oculto');
  }

  function cerrarModal() {
    $('#modal').classList.add('oculto');
    $('#modalCaja').innerHTML = '';
  }

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

  /** Pide un número (cantidad, abono, peso…) con teclado numérico. */
  function pedirNumero(titulo, subtitulo, valorInicial, etiqueta) {
    return new Promise((resolve) => {
      abrirModal(
        '<h2>' + esc(titulo) + '</h2>' + (subtitulo ? '<p class="sub">' + esc(subtitulo) + '</p>' : '') +
        '<div class="campo"><label>' + esc(etiqueta || 'Cantidad') + '</label>' +
        '<input type="number" id="mNum" inputmode="decimal" step="0.001" value="' + (valorInicial || '') + '"></div>' +
        '<button class="btn-principal" id="mOk">Aceptar</button>' +
        '<button class="btn-texto" id="mNo">Cancelar</button>'
      );
      const inp = $('#mNum');
      setTimeout(() => { inp.focus(); inp.select(); }, 120);
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#mOk').click(); } };
      $('#mNo').onclick = () => { cerrarModal(); resolve(null); };
      $('#mOk').onclick = () => {
        const v = parseFloat(inp.value);
        cerrarModal();
        resolve(isFinite(v) ? v : null);
      };
    });
  }

  /* ===================== navegación ===================== */

  const TITULOS = {
    inicio: 'Inicio', vender: 'Nueva venta', agregar: 'Agregar productos',
    inventario: 'Mis productos', ventas: 'Ventas y tickets', creditos: 'Fiados y clientes',
    agenda: 'Agenda y proveedores', caja: 'Caja del día', reportes: 'Reportes', ajustes: 'Ajustes'
  };

  function cerrarCajon() {
    $('#cajon').classList.remove('abierto');
    $('#velo').classList.add('oculto');
  }

  function abrirCajon() {
    $('#cajon').classList.add('abierto');
    $('#velo').classList.remove('oculto');
  }

  async function ir(nombre) {
    const anterior = vistas[estado.vista];
    if (anterior && anterior.salir) anterior.salir();
    estado.vista = nombre;
    $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + nombre));
    $$('.barra-inferior .tab').forEach((t) => t.classList.toggle('activa', t.dataset.vista === nombre));
    $$('.cajon-menu button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === nombre));
    $('#tituloVista').textContent = TITULOS[nombre] || '';
    cerrarCajon();
    window.scrollTo({ top: 0 });
    const vista = vistas[nombre];
    if (vista && vista.render) await vista.render();
  }

  /** Recarga productos, jornada y avisos, y repinta la pantalla actual. */
  async function refrescar(repintar = true) {
    estado.productos = await DB.todosProductos();
    estado.proveedores = await DB.todosProveedores();
    estado.jornada = await DB.jornadaAbierta();
    estado.alertas = await DB.alertas();
    pintarAlertas();
    if (repintar) {
      const vista = vistas[estado.vista];
      if (vista && vista.render) await vista.render();
    }
  }

  /* ===================== alertas ===================== */

  function pintarAlertas() {
    const a = estado.alertas;
    const globo = $('#globoAlertas');
    globo.textContent = a.total;
    globo.classList.toggle('oculto', !a.total);
    $('#puntoInventario').classList.toggle('oculto', !a.bajos.length);

    const pastilla = (id, n) => {
      const el = $(id);
      if (!el) return;
      el.textContent = n;
      el.classList.toggle('oculto', !n);
    };
    pastilla('#pastillaInventario', a.bajos.length);
    pastilla('#pastillaCreditos', a.cobros.length);
    pastilla('#pastillaAgenda', a.visitas.length);

    const jornada = estado.jornada;
    $('#cajonEstado').textContent = jornada
      ? 'Día abierto desde ' + hora(jornada.apertura)
      : 'Día cerrado';
  }

  function panelAlertas() {
    const a = estado.alertas;
    let html = '<h2>🔔 Tus avisos</h2>';
    if (!a.total) {
      html += '<p class="sub">Todo en orden: no hay productos por acabarse, ni visitas ni cobros próximos.</p>';
    } else {
      html += '<p class="sub">Esto es lo que necesita tu atención.</p>';
    }

    if (a.vencidos.length) {
      html += '<div class="panel"><h3>⚠️ Fiados vencidos</h3><ul class="lista-simple">' +
        a.vencidos.map((c) => '<li><span>' + esc(c.nombre) + '<br><small>venció ' + cuando(c.fechaPago) + '</small></span>' +
          '<b style="color:var(--rojo)">' + dinero(c.saldo) + '</b></li>').join('') + '</ul></div>';
    }
    if (a.cobros.length) {
      html += '<div class="panel"><h3>🤝 Cobros próximos</h3><ul class="lista-simple">' +
        a.cobros.map((c) => '<li><span>' + esc(c.nombre) + '<br><small>' + cuando(c.fechaPago) + '</small></span>' +
          '<b>' + dinero(c.saldo) + '</b></li>').join('') + '</ul>' +
        '<button class="btn-sec" data-ira="creditos">Ver fiados</button></div>';
    }
    if (a.visitas.length) {
      html += '<div class="panel"><h3>📅 Visitas de proveedor</h3><ul class="lista-simple">' +
        a.visitas.map((e) => '<li><span>' + esc(e.titulo) + '<br><small>' + cuando(e.fecha) +
          (e.hora ? ' · ' + e.hora : '') + '</small></span></li>').join('') + '</ul>' +
        '<button class="btn-sec" data-ira="agenda">Ver agenda</button></div>';
    }
    if (a.bajos.length) {
      html += '<div class="panel"><h3>📦 Se están acabando (' + a.bajos.length + ')</h3><ul class="lista-simple">' +
        a.bajos.slice(0, 12).map((p) => '<li><span>' + esc(p.nombre) + '<br><small>' + esc(p.categoria || '') + '</small></span>' +
          '<b style="color:var(--rojo)">' + DB.existenciaTexto(p) + '</b></li>').join('') + '</ul>' +
        (a.bajos.length > 12 ? '<p class="ayuda">y ' + (a.bajos.length - 12) + ' más…</p>' : '') +
        '<button class="btn-sec" data-ira="reportes">Hacer lista de compras</button></div>';
    }
    html += '<button class="btn-texto" id="mCerrar">Cerrar</button>';
    abrirModal(html);
    $('#mCerrar').onclick = cerrarModal;
    $$('#modalCaja [data-ira]').forEach((b) => b.onclick = () => { cerrarModal(); ir(b.dataset.ira); });
  }

  /* ===================== pantalla de inicio ===================== */

  vistas.inicio = {
    render: async () => {
      const cfg = estado.cfg;
      const hoy = DB.hoy();
      const [resumen, top] = await Promise.all([DB.resumenDia(hoy), DB.masVendidos(hoy, hoy, 5)]);
      const creditos = await DB.creditosPendientes();
      const porCobrar = creditos.reduce((s, c) => s + Number(c.saldo), 0);
      const inversion = estado.productos.reduce((s, p) => s + Number(p.stock) * Number(p.costo), 0);

      const h = new Date().getHours();
      $('#saludoTexto').textContent = (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
      $('#saludoFecha').textContent = fechaLarga(hoy);

      $('#tarjetasInicio').innerHTML =
        tarjeta('Vendido hoy', dinero(resumen.total), 'morada', resumen.tickets + ' ticket(s)') +
        tarjeta('Ganancia de hoy', dinero(resumen.ganancia), 'verde') +
        tarjeta('Por cobrar (fiado)', dinero(porCobrar), porCobrar ? 'ambar' : '', creditos.length + ' cliente(s)') +
        tarjeta('Invertido en tienda', dinero(inversion), '', estado.productos.length + ' productos');

      const j = estado.jornada;
      $('#avisoJornada').innerHTML = j
        ? '<div class="panel suave"><div class="panel-titulo"><h2>🟢 Día abierto</h2>' +
          '<span class="etiqueta verde">desde ' + hora(j.apertura) + '</span></div>' +
          '<p class="ayuda">Fondo de caja: ' + dinero(j.fondoInicial) + '. Cuando termines, haz el corte.</p>' +
          '<button class="btn-sec" data-ira="caja">Hacer corte del día</button></div>'
        : '<div class="panel suave"><div class="panel-titulo"><h2>Empieza tu día</h2></div>' +
          '<p class="ayuda">Abre la caja para que las ventas de hoy queden separadas y puedas hacer tu corte.</p>' +
          '<button class="btn-principal" data-ira="caja">💵 Abrir día de venta</button></div>';

      const a = estado.alertas;
      const pendientes = [];
      if (a.vencidos.length) pendientes.push(['⚠️', a.vencidos.length + ' fiado(s) vencido(s)', 'creditos']);
      if (a.cobros.length) pendientes.push(['🤝', a.cobros.length + ' cobro(s) por vencer', 'creditos']);
      if (a.visitas.length) pendientes.push(['📅', a.visitas.length + ' visita(s) de proveedor', 'agenda']);
      if (a.bajos.length) pendientes.push(['📦', a.bajos.length + ' producto(s) por acabarse', 'inventario']);
      $('#panelPendientes').innerHTML = pendientes.length
        ? '<div class="panel-titulo"><h2>Pendientes</h2><span class="etiqueta roja">' + a.total + '</span></div>' +
          pendientes.map(([ico, txt, ira]) =>
            '<button class="producto" data-ira="' + ira + '"><div class="info"><b>' + ico + ' ' + txt + '</b></div>' +
            '<div class="stock"><b>›</b></div></button>').join('')
        : '<div class="panel-titulo"><h2>Pendientes</h2></div><p class="vacio">Nada pendiente. ¡Bien!</p>';

      $('#panelTopDia').innerHTML = top.length
        ? '<div class="panel-titulo"><h2>Lo más vendido hoy</h2></div><ul class="lista-simple">' +
          top.map((p) => '<li><span>' + esc(p.nombre) + '</span><b>' + dinero(p.total) + '</b></li>').join('') + '</ul>'
        : '';

      $$('#vista-inicio [data-ira]').forEach((b) => b.onclick = () => ir(b.dataset.ira));
    }
  };

  /* ===================== arranque común ===================== */

  function conectarNavegacion() {
    $('#btnMenu').onclick = abrirCajon;
    $('#tabMenu').onclick = abrirCajon;
    $('#velo').onclick = cerrarCajon;
    $$('.cajon-menu button').forEach((b) => b.onclick = () => ir(b.dataset.vista));
    $$('.barra-inferior .tab[data-vista]').forEach((b) => b.onclick = () => ir(b.dataset.vista));
    $('#btnAlertas').onclick = panelAlertas;
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrarModal(); });
    $$('#vista-inicio .accion').forEach((b) => b.onclick = () => ir(b.dataset.ir));
  }

  return {
    VERSION, FECHA_VERSION,
    $, $$, estado, vistas, dinero, esc, cantidad, hora, fechaLarga, fechaCorta, cuando,
    tarjeta, nivel, mayusInicial, aviso, abrirModal, cerrarModal, confirmar, pedirNumero,
    ir, refrescar, pintarAlertas, panelAlertas, conectarNavegacion, cerrarCajon
  };
})();
