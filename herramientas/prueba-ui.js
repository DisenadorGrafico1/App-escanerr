/*
 * prueba-ui.js — Solo en la VERSIÓN DE PRUEBA.
 * Enciende la puerta de acceso y pinta el contador de tiempo restante.
 */
(async () => {
  // Ojo: db.js, nucleo.js y demo.js declaran sus objetos con const, así que
  // NO existen como window.App / window.DB; hay que mirarlos por su nombre.
  const listo = () => typeof App !== 'undefined' && typeof DB !== 'undefined' &&
    typeof Demo !== 'undefined' && App.estado && App.estado.cfg;
  for (let i = 0; i < 200 && !listo(); i++) await new Promise((r) => setTimeout(r, 60));
  if (!listo()) return;

  let chip = document.getElementById('chipDemo');
  if (!chip) {
    chip = document.createElement('span');
    chip.id = 'chipDemo';
    chip.className = 'chip-demo oculto';
    const campana = document.getElementById('btnAlertas');
    if (campana && campana.parentElement) campana.parentElement.insertBefore(chip, campana);
  }

  function pintarChip() {
    const d = Demo.estado();
    if (!d || d.liberado || !d.pruebaActivada) { chip.classList.add('oculto'); return; }
    chip.classList.remove('oculto');
    chip.textContent = '⏳ ' + Demo.textoRestante();
    chip.classList.toggle('poco', Demo.restanteMs() < 5 * 60000);
  }

  await Demo.cargar(pintarChip);
  pintarChip();
})();
