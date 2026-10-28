// Estudio Aura: estructura general, menú y navegación entre pantallas.

import { el, icon, formatBytes, relativeDate, daysSince } from './ui.js';
import { state, load, subscribe } from './store.js';
import { renderMarca } from './views/marca.js';
import { renderOriginales } from './views/originales.js';
import { renderBiblioteca } from './views/biblioteca.js';
import { renderRespaldo } from './views/respaldo.js';

const SCREENS = {
  marca: { label: 'Mi marca', icon: 'marca', render: renderMarca },
  originales: { label: 'Mis originales', icon: 'fotos', render: renderOriginales },
  biblioteca: { label: 'Biblioteca', icon: 'biblioteca', render: renderBiblioteca },
  respaldo: { label: 'Respaldo', icon: 'respaldo', render: renderRespaldo },
};

// Lo que todavía no existe se muestra con su etapa y sin enlace.
const UPCOMING = [
  { label: 'Instrucciones', icon: 'instrucciones', stage: 'Etapa 3' },
  { label: 'Editor', icon: 'editor', stage: 'Etapa 4' },
  { label: 'Feed', icon: 'feed', stage: 'Etapa 5' },
];

const REMINDER_DAYS = 7;

function currentScreen() {
  const name = location.hash.slice(1);
  return SCREENS[name] ? name : 'marca';
}

function render() {
  const app = document.getElementById('app');
  const screen = currentScreen();
  const main = el('main', { class: 'main', id: 'main', tabindex: '-1' });
  const reminder = backupReminder();
  if (reminder) main.append(reminder);
  SCREENS[screen].render(main);

  const scroll = document.querySelector('.main') ? document.querySelector('.main').scrollTop : 0;
  app.replaceChildren(sidebar(screen), main);
  if (screen === lastScreen) main.scrollTop = scroll;
  lastScreen = screen;
}

let lastScreen = null;

function sidebar(screen) {
  return el('nav', { class: 'sidebar', 'aria-label': 'Secciones' },
    el('div', { class: 'brandmark' },
      el('span', { class: 'wordmark wordmark-light' }, 'AURA NATURA'),
      el('span', { class: 'brandmark-studio' }, 'Estudio')),
    el('div', { class: 'nav-list' },
      Object.entries(SCREENS).map(([id, item]) => el('a', {
        href: `#${id}`,
        class: 'nav-item',
        'aria-current': id === screen ? 'page' : null,
      }, icon(item.icon), el('span', {}, item.label))),
      el('div', { class: 'nav-divider', role: 'presentation' }),
      UPCOMING.map((item) => el('span', { class: 'nav-item nav-item-upcoming', 'aria-disabled': 'true' },
        icon(item.icon), el('span', { class: 'nav-label' }, item.label), el('span', { class: 'stage' }, item.stage)))),
    statusCard());
}

function statusCard() {
  const count = state.photos.length;
  const last = relativeDate(state.lastBackup);
  const ok = state.persisted === true;
  return el('div', { class: 'status-card' },
    el('div', { class: 'status-title' },
      el('span', { class: `dot ${ok ? 'dot-ok' : 'dot-warn'}` }),
      ok ? 'Datos guardados' : 'Datos en este iPad'),
    el('span', { class: 'status-text' },
      last ? `Último respaldo ${last}.` : 'Sin respaldos todavía.',
      ` ${count} ${count === 1 ? 'foto' : 'fotos'} · ${state.pieces.length} ${state.pieces.length === 1 ? 'pieza' : 'piezas'}`,
      state.usage != null ? ` · ${formatBytes(state.usage)}` : ''),
    el('a', { href: '#respaldo', class: 'btn btn-outline-gold' }, 'Hacer respaldo'));
}

function backupReminder() {
  const hasContent = state.photos.length > 0 || state.pieces.length > 0 || state.logo;
  if (!hasContent || daysSince(state.lastBackup) < REMINDER_DAYS || currentScreen() === 'respaldo') return null;
  return el('div', { class: 'reminder', role: 'status' },
    icon('aviso', 18),
    el('span', {}, state.lastBackup
      ? `Pasaron más de ${REMINDER_DAYS} días desde tu último respaldo.`
      : 'Todavía no hiciste un respaldo de tus fotos.'),
    el('a', { href: '#respaldo', class: 'btn btn-dark btn-small' }, 'Hacer respaldo'));
}

async function start() {
  try {
    await load();
  } catch (error) {
    document.getElementById('app').replaceChildren(el('div', { class: 'fatal' },
      el('h1', { class: 'display' }, 'No se pudieron abrir tus datos'),
      el('p', {}, error.message || String(error)),
      el('p', { class: 'hint' }, 'Si estás en una ventana privada de Safari, abrí la app en una ventana normal.')));
    return;
  }
  subscribe(render);
  window.addEventListener('aura:redraw', render);
  window.addEventListener('hashchange', () => {
    render();
    document.getElementById('main').focus({ preventScroll: true });
  });
  render();

  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sin service worker la app funciona igual, pero no sin internet.
    });
  }
}

start();
