// Pantalla "Biblioteca": todo lo que ya se publicó, con portada y datos.

import { el, icon, toast, hideToast, confirmDialog } from '../ui.js';
import { FUNNEL, FORMATS, CHANNELS } from '../brand.js';
import { state, savePiece, deletePiece, toggleFavorite, coverUrl } from '../store.js';
import { makeCover } from '../images.js';

const view = {
  funnel: 'todas',
  format: 'todos',
  favorites: false,
  search: '',
};

const label = (list, id) => (list.find((item) => item.id === id) || {}).label || '';

export function renderBiblioteca(root) {
  const pieces = state.pieces;

  const header = el('header', { class: 'page-head' },
    el('div', {},
      el('span', { class: 'eyebrow eyebrow-sage' }, 'Biblioteca'),
      el('h1', { class: 'display page-title' }, 'Todo lo que ', el('em', {}, 'ya publicamos')),
      el('p', { class: 'hint' }, 'Lo que está en Instagram, TikTok y Meta, con su portada y sus datos. La ★ marca tus favoritos.')),
    el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEditor(null) }, icon('mas', 18), 'Agregar pieza'));

  root.append(header);
  if (!pieces.length) {
    root.append(emptyLibrary());
    return;
  }

  const search = el('input', {
    id: 'library-search', class: 'input search-input', type: 'search', placeholder: 'Buscar por título o descripción',
    value: view.search, 'aria-label': 'Buscar en la Biblioteca',
    oninput: (event) => { view.search = event.target.value; drawGrid(); },
  });

  const filters = el('div', { class: 'filter-bar' },
    el('div', { class: 'search-box' }, icon('buscar', 18), search),
    chipGroup('Etapa del cliente', [{ id: 'todas', label: 'Todas' }, ...FUNNEL], view.funnel, (id) => { view.funnel = id; }, (id) => pieces.filter((p) => id === 'todas' || p.funnel === id).length),
    chipGroup('Formato', [{ id: 'todos', label: 'Todos' }, ...FORMATS], view.format, (id) => { view.format = id; }, (id) => pieces.filter((p) => id === 'todos' || p.format === id).length),
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(view.favorites), onclick: () => { view.favorites = !view.favorites; redraw(); } },
      icon('estrella', 14, { filled: view.favorites }), 'Favoritos'));

  const grid = el('div', { class: 'library', id: 'library-grid' });
  root.append(filters, grid);

  function drawGrid() {
    const list = state.pieces.filter(matches);
    grid.replaceChildren(...(list.length
      ? list.map(pieceCard)
      : [el('p', { class: 'hint library-none' }, 'No hay piezas con estos filtros.')]));
  }
  drawGrid();
}

function matches(piece) {
  if (view.funnel !== 'todas' && piece.funnel !== view.funnel) return false;
  if (view.format !== 'todos' && piece.format !== view.format) return false;
  if (view.favorites && !piece.favorite) return false;
  const query = view.search.trim().toLowerCase();
  if (query && !`${piece.title} ${piece.description || ''}`.toLowerCase().includes(query)) return false;
  return true;
}

function chipGroup(name, options, current, set, count) {
  return el('div', { class: 'chips', role: 'group', 'aria-label': name },
    options.map((option) => el('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(current === option.id),
      onclick: () => { set(option.id); redraw(); },
    }, option.label, el('span', { class: 'chip-count' }, String(count(option.id))))));
}

function emptyLibrary() {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty-orb', 'aria-hidden': 'true' }),
    el('h2', { class: 'display' }, 'Tu Biblioteca está vacía'),
    el('p', { class: 'hint' }, 'Agregá lo que ya publicaste: una portada (imagen o el video mismo), un título y en qué etapa del cliente está. Solo se guarda la portada, no el video.'),
    el('button', { type: 'button', class: 'btn btn-dark', onclick: () => openEditor(null) }, icon('mas', 18), 'Agregar pieza'));
}

function publishedLine(piece) {
  const channels = (piece.channels || []).map((id) => label(CHANNELS, id)).filter(Boolean);
  const where = channels.length > 1 ? `${channels.slice(0, -1).join(', ')} y ${channels.at(-1)}` : channels[0];
  const date = piece.publishedOn
    ? new Date(`${piece.publishedOn}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: piece.publishedOn.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' })
    : null;
  if (where && date) return `En ${where} desde el ${date}`;
  if (where) return `En ${where}`;
  if (date) return `Publicado el ${date}`;
  return 'Sin publicar todavía';
}

function pieceCard(piece) {
  const img = el('img', { alt: '', loading: 'lazy' });
  coverUrl(piece).then((url) => { if (url) img.src = url; else img.replaceWith(el('span', { class: 'tile-fallback' }, 'Sin portada')); });
  const subtitle = [label(FORMATS, piece.format), piece.description].filter(Boolean).join(' · ');

  return el('article', { class: 'piece' },
    el('button', { type: 'button', class: 'piece-open', 'aria-label': `Editar ${piece.title}`, onclick: () => openEditor(piece) },
      el('span', { class: 'piece-cover' },
        img,
        piece.funnel ? el('span', { class: `funnel-badge funnel-${piece.funnel}` }, label(FUNNEL, piece.funnel)) : null),
      el('span', { class: 'piece-body' },
        el('span', { class: 'piece-title' }, piece.title),
        subtitle ? el('span', { class: 'piece-sub' }, subtitle) : null,
        el('span', { class: 'piece-where' }, publishedLine(piece)))),
    el('button', {
      type: 'button',
      class: 'piece-star',
      'aria-pressed': String(Boolean(piece.favorite)),
      'aria-label': piece.favorite ? `Quitar ${piece.title} de favoritos` : `Marcar ${piece.title} como favorito`,
      onclick: () => toggleFavorite(piece.id),
    }, icon('estrella', 18, { filled: piece.favorite })),
    piece.link ? el('a', { class: 'piece-link', href: piece.link, target: '_blank', rel: 'noopener', 'aria-label': `Abrir la publicación de ${piece.title}` }, icon('enlace', 16)) : null);
}

/** Formulario para crear o editar una pieza, en una ventana sobre la pantalla. */
function openEditor(piece) {
  const draft = piece
    ? { ...piece, channels: [...(piece.channels || [])] }
    : { title: '', description: '', format: 'video', funnel: 'tofu', channels: ['instagram'], publishedOn: today(), link: '', notes: '', favorite: false };
  let newCover = null;
  let previewUrl = null;
  let preparingCover = false;
  const previous = document.activeElement;

  const coverBox = el('div', { class: 'cover-preview' });
  const showCover = (url) => {
    coverBox.replaceChildren(url
      ? el('img', { src: url, alt: 'Portada' })
      : el('span', { class: 'hint' }, 'Sin portada'));
  };
  if (piece) coverUrl(piece).then(showCover); else showCover(null);

  const coverInput = el('input', {
    type: 'file', accept: 'image/*,video/*', id: 'cover-input', class: 'sr-only',
    onchange: async (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      toast(file.type.startsWith('video/') ? 'Tomando un cuadro del video…' : 'Preparando la portada…', { persist: true });
      preparingCover = true;
      try {
        newCover = await makeCover(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(newCover);
        showCover(previewUrl);
        if (!titleInput.value.trim()) {
          titleInput.value = file.name.replace(/\.[^.]+$/, '');
          draft.title = titleInput.value;
        }
        hideToast();
      } catch (error) {
        toast(error.message);
      } finally {
        preparingCover = false;
      }
    },
  });

  const titleInput = el('input', { id: 'piece-title', class: 'input', value: draft.title, oninput: (e) => { draft.title = e.target.value; } });
  const descriptionInput = el('input', { id: 'piece-description', class: 'input', value: draft.description || '', placeholder: 'Por ejemplo: Regalo Día de la Madre', oninput: (e) => { draft.description = e.target.value; } });
  const dateInput = el('input', { id: 'piece-date', class: 'input', type: 'date', value: draft.publishedOn || '', oninput: (e) => { draft.publishedOn = e.target.value; } });
  const linkInput = el('input', { id: 'piece-link', class: 'input', type: 'url', inputmode: 'url', value: draft.link || '', placeholder: 'https://www.instagram.com/p/…', oninput: (e) => { draft.link = e.target.value.trim(); } });
  const notesInput = el('textarea', { id: 'piece-notes', class: 'input', rows: 3, placeholder: 'Resultados, ideas para repetir, qué cambiarías…', oninput: (e) => { draft.notes = e.target.value; } }, draft.notes || '');

  const single = (name, options, key, helpFor) => {
    const help = helpFor ? el('p', { class: 'hint field-help' }) : null;
    const group = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': name });
    const draw = () => {
      group.replaceChildren(...options.map((option) => el('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(draft[key] === option.id),
        onclick: () => { draft[key] = option.id; draw(); },
      }, option.label)));
      if (help) help.textContent = helpFor(draft[key]);
    };
    draw();
    return el('fieldset', { class: 'field' }, el('legend', { class: 'field-label' }, name), group, help);
  };

  const channelsGroup = el('div', { class: 'chips', role: 'group', 'aria-label': 'Dónde está publicada' });
  const drawChannels = () => {
    channelsGroup.replaceChildren(...CHANNELS.map((channel) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(draft.channels.includes(channel.id)),
      onclick: () => {
        draft.channels = draft.channels.includes(channel.id) ? draft.channels.filter((id) => id !== channel.id) : [...draft.channels, channel.id];
        drawChannels();
      },
    }, channel.label)));
  };
  drawChannels();

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (previous && previous.focus) previous.focus();
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };

  const save = async (event) => {
    event.preventDefault();
    if (preparingCover) {
      toast('Esperá un momento: la portada se está preparando.');
      return;
    }
    draft.title = draft.title.trim();
    if (!draft.title) {
      toast('Poné un título para la pieza.');
      titleInput.focus();
      return;
    }
    if (!piece && !newCover) {
      toast('Elegí una portada: una imagen o el video.');
      return;
    }
    if (draft.link && !/^https?:\/\//i.test(draft.link)) draft.link = `https://${draft.link}`;
    try {
      await savePiece({ ...draft, description: (draft.description || '').trim(), notes: (draft.notes || '').trim() }, newCover);
      close();
      toast(piece ? 'Pieza actualizada' : 'Pieza agregada a la Biblioteca');
    } catch (error) {
      toast(error && error.name === 'QuotaExceededError' ? 'No hay más espacio en el iPad.' : `No se pudo guardar: ${error.message}`);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: '¿Eliminar esta pieza?',
      body: `«${piece.title}» se borra de la Biblioteca. La publicación en redes no se toca.`,
      confirmLabel: 'Eliminar pieza',
      danger: true,
    });
    if (!ok) return;
    await deletePiece(piece.id);
    close();
    toast('Pieza eliminada');
  };

  // Sin la validación del navegador: los mensajes los da la app, y un link sin «https://» se completa solo.
  const form = el('form', { class: 'sheet', 'aria-labelledby': 'sheet-title', novalidate: true, onsubmit: save },
    el('div', { class: 'sheet-head' },
      el('h2', { id: 'sheet-title', class: 'display' }, piece ? 'Editar pieza' : 'Nueva pieza'),
      el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Cerrar sin guardar', onclick: close }, icon('cerrar', 20))),
    el('div', { class: 'sheet-body' },
      el('div', { class: 'sheet-cover' },
        coverBox,
        coverInput,
        el('label', { for: 'cover-input', class: 'btn btn-quiet btn-small' }, piece ? 'Cambiar portada' : 'Elegir portada'),
        el('p', { class: 'hint' }, 'Imagen o video. De un video se toma un cuadro: el video no se guarda.')),
      el('div', { class: 'sheet-fields' },
        el('div', { class: 'field' }, el('label', { for: 'piece-title', class: 'field-label' }, 'Título'), titleInput),
        el('div', { class: 'field' }, el('label', { for: 'piece-description', class: 'field-label' }, 'Descripción corta'), descriptionInput),
        single('Formato', FORMATS, 'format'),
        single('Etapa del cliente', FUNNEL, 'funnel', (id) => (FUNNEL.find((f) => f.id === id) || {}).help || ''),
        el('fieldset', { class: 'field' }, el('legend', { class: 'field-label' }, 'Dónde está publicada'), channelsGroup),
        el('div', { class: 'field-pair' },
          el('div', { class: 'field' }, el('label', { for: 'piece-date', class: 'field-label' }, 'Fecha de publicación'), dateInput),
          el('div', { class: 'field' }, el('label', { for: 'piece-link', class: 'field-label' }, 'Link (opcional)'), linkInput)),
        el('div', { class: 'field' }, el('label', { for: 'piece-notes', class: 'field-label' }, 'Notas (opcional)'), notesInput))),
    el('div', { class: 'sheet-actions' },
      piece ? el('button', { type: 'button', class: 'btn btn-quiet btn-danger-text', onclick: remove }, icon('tacho', 18), 'Eliminar') : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-quiet', onclick: close }, 'Cancelar'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')));

  const overlay = el('div', { class: 'overlay overlay-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' }, form);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  titleInput.focus({ preventScroll: true });
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function redraw() {
  window.dispatchEvent(new Event('aura:redraw'));
}
