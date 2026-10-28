// Pantalla "Respaldo": crear y restaurar respaldos, y estado del almacenamiento.

import { el, icon, toast, hideToast, confirmDialog, saveFile, formatBytes, relativeDate } from '../ui.js';
import { state, markBackup, reload, requestPersistence, refreshStorage } from '../store.js';
import { buildBackup, inspectBackup } from '../backup.js';

let readyBackup = null; // File preparado, a la espera del toque para guardarlo

export function renderRespaldo(root) {
  root.append(
    el('header', { class: 'page-head' },
      el('div', {},
        el('h1', { class: 'display page-title' }, 'Respaldo'),
        el('p', { class: 'hint' }, 'Tus datos viven solo en este iPad. Un respaldo es la forma de no perderlos.'))),
    el('div', { class: 'backup-grid' }, backupCard(), restoreCard(), storageCard(), installCard()));
}

function backupCard() {
  const last = relativeDate(state.lastBackup);
  const card = el('section', { class: 'card card-feature', 'aria-labelledby': 'backup-title' },
    el('span', { class: 'card-icon' }, icon('respaldo', 22)),
    el('h2', { id: 'backup-title', class: 'display card-title' }, 'Hacer un respaldo'),
    el('p', {}, last ? `Último respaldo: ${last}.` : 'Todavía no hiciste ningún respaldo.'),
    el('p', { class: 'hint' }, `Incluye ${plural(state.photos.length, 'foto original', 'fotos originales')}, ${plural(state.pieces.length, 'pieza', 'piezas')} de la Biblioteca, ${plural(state.designs.length, 'diseño', 'diseños')}, ${plural(state.feeds.length, 'propuesta', 'propuestas')} del Feed, tu logo y la ficha de marca. Guardalo en Archivos o en iCloud Drive.`));

  if (readyBackup) {
    card.append(
      el('p', { class: 'ready' }, icon('check', 16), `Listo: ${readyBackup.name} (${formatBytes(readyBackup.size)})`),
      el('div', { class: 'edit-actions' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
          const result = await saveFile(readyBackup);
          if (result === 'cancelled') return;
          readyBackup = null;
          await markBackup();
          toast(result === 'downloaded' ? 'Respaldo descargado' : 'Respaldo guardado');
        } }, icon('guardar', 18), 'Guardar respaldo'),
        el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { readyBackup = null; redraw(); } }, 'Cancelar')));
  } else {
    card.append(el('button', { type: 'button', class: 'btn btn-primary', onclick: prepareBackup }, 'Preparar respaldo'));
  }
  return card;
}

async function prepareBackup() {
  toast('Preparando respaldo…', { persist: true });
  try {
    readyBackup = await buildBackup((doneCount, total) => toast(`Preparando respaldo: ${doneCount} de ${total} archivos…`, { persist: true }));
    hideToast();
    redraw();
  } catch (error) {
    toast(`No se pudo preparar el respaldo: ${error.message}`);
  }
}

function restoreCard() {
  const input = el('input', { type: 'file', accept: '.zip,application/zip', class: 'sr-only', id: 'restore-input', onchange: async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) await restoreFrom(file);
  } });
  return el('section', { class: 'card card-feature', 'aria-labelledby': 'restore-title' },
    el('span', { class: 'card-icon' }, icon('restaurar', 22)),
    el('h2', { id: 'restore-title', class: 'display card-title' }, 'Restaurar desde un archivo'),
    el('p', {}, 'Recupera todo lo que había en un respaldo.'),
    el('p', { class: 'hint' }, 'Primero se revisa que el archivo esté completo. Lo que hay ahora en la app se reemplaza solo si confirmás.'),
    input,
    el('label', { for: 'restore-input', class: 'btn btn-quiet' }, 'Elegir respaldo'));
}

async function restoreFrom(file) {
  toast('Revisando el respaldo…', { persist: true });
  let inspected;
  try {
    inspected = await inspectBackup(file, (doneCount, total) => toast(`Revisando el respaldo: ${doneCount} de ${total} archivos…`, { persist: true }));
  } catch (error) {
    toast(error.message || 'No se pudo leer el archivo.');
    return;
  }
  hideToast();
  const { summary } = inspected;
  const created = new Date(summary.createdAt).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ok = await confirmDialog({
    title: '¿Restaurar este respaldo?',
    body: el('div', {},
      el('p', {}, `Respaldo del ${created}: ${plural(summary.photoCount, 'foto', 'fotos')}, ${plural(summary.pieceCount, 'pieza', 'piezas')} de la Biblioteca, ${plural(summary.designCount || 0, 'diseño', 'diseños')}, ${plural(summary.feedCount || 0, 'propuesta', 'propuestas')} del Feed${summary.hasLogo ? ', logo' : ''}${summary.hasBrand ? ' y ficha de marca' : ''}.`),
      el('p', {}, `Lo que hay ahora en la app (${plural(state.photos.length, 'foto', 'fotos')}, ${plural(state.pieces.length, 'pieza', 'piezas')}, ${plural(state.designs.length, 'diseño', 'diseños')} y ${plural(state.feeds.length, 'propuesta', 'propuestas')} del Feed) se reemplaza por el contenido del respaldo.`)),
    confirmLabel: 'Restaurar',
  });
  if (!ok) return;
  toast('Restaurando…', { persist: true });
  try {
    await inspected.apply();
    await reload();
    toast(`Respaldo restaurado: ${plural(summary.photoCount, 'foto', 'fotos')}, ${plural(summary.pieceCount, 'pieza', 'piezas')}, ${plural(summary.designCount || 0, 'diseño', 'diseños')} y ${plural(summary.feedCount || 0, 'propuesta', 'propuestas')} del Feed`);
  } catch (error) {
    toast(error && error.name === 'QuotaExceededError'
      ? 'No hay espacio suficiente en el iPad. No se cambió nada.'
      : `No se pudo restaurar: ${error.message}. No se cambió nada.`);
  }
}

function storageCard() {
  const persistedText = state.persisted === true
    ? 'El iPad guarda tus datos de forma permanente.'
    : state.persisted === false
      ? 'El iPad todavía no confirmó que va a guardar tus datos de forma permanente. Instalar la app en la pantalla de inicio ayuda.'
      : 'Este navegador no informa si los datos son permanentes.';
  const card = el('section', { class: 'card', 'aria-labelledby': 'storage-title' },
    el('div', { class: 'card-head' },
      el('h2', { id: 'storage-title', class: 'display card-title' }, 'Almacenamiento')),
    el('div', { class: 'status-row' },
      el('span', { class: `dot ${state.persisted ? 'dot-ok' : 'dot-warn'}` }),
      el('span', {}, persistedText)),
    state.usage != null
      ? el('p', { class: 'tabular' }, `En uso: ${formatBytes(state.usage)}${state.quota ? ` de ${formatBytes(state.quota)} disponibles para la app` : ''}.`)
      : null);
  if (state.persisted === false) {
    card.append(el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: async () => {
      const granted = await requestPersistence();
      await refreshStorage();
      toast(granted ? 'Listo: los datos quedan guardados de forma permanente.' : 'El iPad no lo permitió todavía. Instalá la app en la pantalla de inicio y volvé a intentar.');
    } }, 'Pedir almacenamiento permanente'));
  }
  return card;
}

function installCard() {
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return el('section', { class: 'card', 'aria-labelledby': 'install-title' },
    el('div', { class: 'card-head' },
      el('h2', { id: 'install-title', class: 'display card-title' }, 'Instalación')),
    installed
      ? el('div', { class: 'status-row' }, el('span', { class: 'dot dot-ok' }), el('span', {}, 'Estás usando la app instalada. Funciona sin internet.'))
      : el('div', {},
        el('div', { class: 'status-row' }, el('span', { class: 'dot dot-warn' }), el('span', {}, 'Estás usando la app desde el navegador.')),
        el('ol', { class: 'steps' },
          el('li', {}, 'En Safari, tocá el botón Compartir.'),
          el('li', {}, 'Elegí «Agregar a pantalla de inicio».'),
          el('li', {}, 'Abrí Estudio Aura desde su ícono. Sin instalarla, el iPad puede borrar los datos si pasan varios días sin usarla.'))));
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function redraw() {
  window.dispatchEvent(new Event('aura:redraw'));
}
