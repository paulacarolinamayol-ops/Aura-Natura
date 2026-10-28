// Pantalla "Mis originales": galería de fotos reales del producto.

import { el, icon, toast, hideToast, confirmDialog, saveFile, formatBytes, readClipboardImage } from '../ui.js';
import { CATEGORIES, LIGHTS } from '../brand.js';
import { state, addPhotos, updatePhoto, deletePhoto, thumbUrl, originalFile } from '../store.js';
import { hasTransparency } from '../images.js';

const NO_TRANSPARENCY = 'Este recorte llegó con fondo: el iPad lo convirtió a JPG. Probá copiarlo en Fotos y tocar «Pegar recorte», o cargarlo desde Archivos.';

const view = {
  filter: 'todas',
  selectedId: null,
  selectedFile: null, // el original de la foto abierta, preparado para compartir al instante
};

export function renderOriginales(root) {
  const photos = state.photos;
  const visible = view.filter === 'todas' ? photos : photos.filter((p) => p.category === view.filter);
  if (view.selectedId && !photos.some((p) => p.id === view.selectedId)) view.selectedId = null;

  const input = el('input', {
    type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'photo-input',
    onchange: (event) => importFiles([...event.target.files], event.target),
  });

  const header = el('header', { class: 'page-head' },
    el('div', {},
      el('h1', { class: 'display page-title' }, 'Mis ', el('em', {}, 'originales')),
      el('p', { class: 'hint' }, photos.length === 1 ? '1 foto real · se guarda sin cambios' : `${photos.length} fotos reales · se guardan sin cambios`)),
    input,
    el('div', { class: 'edit-actions' },
      el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => pasteCutout() }, icon('copiar', 18), 'Pegar recorte'),
      el('label', { for: 'photo-input', class: 'btn btn-primary' }, icon('mas', 18), 'Agregar fotos')));

  const filters = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por categoría' },
    [{ id: 'todas', label: 'Todas' }, ...CATEGORIES].map((cat) => {
      const count = cat.id === 'todas' ? photos.length : photos.filter((p) => p.category === cat.id).length;
      if (cat.id === 'sin' && count === 0) return null;
      return el('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(view.filter === cat.id),
        onclick: () => { view.filter = cat.id; redraw(); },
      }, cat.label, el('span', { class: 'chip-count' }, String(count)));
    }));

  const gallery = visible.length
    ? el('div', { class: 'gallery' }, visible.map(photoTile))
    : emptyState(photos.length === 0);

  const layout = el('div', { class: 'originales' },
    el('div', { class: 'originales-main' }, header, filters, gallery));
  const selected = photos.find((p) => p.id === view.selectedId);
  if (selected) layout.append(detailPanel(selected));
  root.append(layout);
}

function emptyState(nothingYet) {
  const category = CATEGORIES.find((c) => c.id === view.filter);
  return el('div', { class: 'empty' },
    el('div', { class: 'empty-orb', 'aria-hidden': 'true' }),
    el('h2', { class: 'display' }, nothingYet ? 'Empezá por tus fotos reales' : `No hay fotos en «${category ? category.label : ''}»`),
    el('p', { class: 'hint' }, nothingYet
      ? 'Cargá las fotos de la esfera desde Fotos o Archivos. Se guardan tal cual, sin comprimir ni recortar.'
      : 'Las fotos que agregues mientras este filtro está activo quedan en esta categoría.'),
    el('label', { for: 'photo-input', class: 'btn btn-dark' }, icon('mas', 18), 'Agregar fotos'));
}

function photoTile(photo) {
  const img = el('img', { alt: '', loading: 'lazy' });
  thumbUrl(photo).then((url) => { if (url) img.src = url; });
  img.addEventListener('error', () => { img.replaceWith(el('span', { class: 'tile-fallback' }, photo.fileName)); });
  const category = CATEGORIES.find((c) => c.id === photo.category);
  return el('button', {
    type: 'button',
    class: `tile${photo.category === 'recorte' ? ' tile-cutout' : ''}`,
    'aria-pressed': String(view.selectedId === photo.id),
    'aria-label': `Abrir ${photo.name}`,
    onclick: () => openPhoto(photo.id),
  },
  img,
  el('span', { class: 'tile-badge' }, icon('candado', 12), 'Original'),
  category && category.id !== 'sin' ? el('span', { class: 'tile-cat' }, category.label) : null);
}

async function openPhoto(id) {
  view.selectedId = id;
  view.selectedFile = null;
  redraw();
  const photo = state.photos.find((p) => p.id === id);
  if (photo) view.selectedFile = await originalFile(photo);
}

function detailPanel(photo) {
  const image = el('img', { alt: photo.name });
  thumbUrl(photo).then((url) => { if (url) image.src = url; });

  const meta = [
    photo.width && photo.height ? `${photo.width} × ${photo.height}` : 'Medidas no disponibles',
    (photo.type || '').replace('image/', '').toUpperCase() || null,
    formatBytes(photo.size),
  ].filter(Boolean).join(' · ');

  const categorySelect = el('select', { id: 'photo-category', class: 'input', onchange: (e) => updatePhoto(photo.id, { category: e.target.value }) },
    CATEGORIES.map((c) => el('option', { value: c.id }, c.label)));
  categorySelect.value = photo.category;

  const lightSelect = el('select', { id: 'photo-light', class: 'input', onchange: (e) => updatePhoto(photo.id, { light: e.target.value }) },
    LIGHTS.map((l) => el('option', { value: l.id }, l.label)));
  lightSelect.value = photo.light;

  // En el iPad vertical el panel flota sobre la galería: tocar afuera lo cierra.
  const close = () => { view.selectedId = null; redraw(); };
  return el('aside', { class: 'detail', 'aria-label': 'Foto seleccionada', onclick: (event) => { if (event.target === event.currentTarget) close(); } },
    el('div', { class: 'detail-card' },
      el('div', { class: 'detail-top' },
        el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Cerrar', onclick: close }, icon('cerrar', 20))),
      el('div', { class: `detail-image${photo.category === 'recorte' ? ' is-cutout' : ''}` }, image),
      el('label', { for: 'photo-name', class: 'field-label' }, 'Nombre'),
      el('input', { id: 'photo-name', class: 'input', value: photo.name, onchange: (e) => updatePhoto(photo.id, { name: e.target.value.trim() || photo.name }) }),
      el('span', { class: 'hint tabular' }, meta),
      el('div', { class: 'field-pair' },
        el('div', {}, el('label', { for: 'photo-category', class: 'field-label' }, 'Categoría'), categorySelect),
        el('div', {}, el('label', { for: 'photo-light', class: 'field-label' }, 'Luz'), lightSelect)),
      el('div', { class: 'notice' }, icon('escudo', 16),
        el('span', {}, 'Protegida: la app nunca modifica esta foto. Lo que guardes o compartas es el archivo original.')),
      el('div', { class: 'detail-actions' },
        el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => shareOriginal(photo) }, icon('compartir', 18), 'Guardar copia'),
        el('button', { type: 'button', class: 'btn-icon btn-icon-danger', 'aria-label': 'Eliminar foto', onclick: () => removePhoto(photo) }, icon('tacho', 20)))));
}

async function shareOriginal(photo) {
  // El archivo se prepara al abrir la foto, así el menú de compartir del iPad
  // se abre en el mismo toque.
  const file = view.selectedFile && view.selectedId === photo.id ? view.selectedFile : await originalFile(photo);
  if (!file) { toast('No se encontró el archivo original.'); return; }
  const result = await saveFile(file);
  if (result === 'downloaded') toast('Copia descargada');
}

async function removePhoto(photo) {
  const usedIn = state.designs.filter((d) => d.layers.some((l) => l.source && l.source.kind === 'photo' && l.source.id === photo.id)).length;
  const ok = await confirmDialog({
    title: '¿Eliminar esta foto?',
    body: `«${photo.name}» se borra de Estudio Aura. Si no está en un respaldo ni en tu galería, no se puede recuperar.${usedIn ? ` Se usa en ${usedIn === 1 ? '1 diseño' : `${usedIn} diseños`}: ahí va a quedar un espacio vacío.` : ''}`,
    confirmLabel: 'Eliminar foto',
    danger: true,
  });
  if (!ok) return;
  await deletePhoto(photo.id);
  view.selectedId = null;
  toast('Foto eliminada');
}

async function importFiles(files, input) {
  input.value = '';
  if (!files.length) return;
  const category = CATEGORIES.some((c) => c.id === view.filter) ? view.filter : 'sin';
  toast(`Guardando 0 de ${files.length}…`, { persist: true });
  const { saved, errors, photos } = await addPhotos(files, category, (doneCount, total) => {
    toast(`Guardando ${doneCount} de ${total}…`, { persist: true });
  });
  hideToast();
  if (category === 'recorte' && !(await allTransparent(photos, files))) {
    toast(NO_TRANSPARENCY);
    return;
  }
  if (errors.length) {
    const quota = errors.some((e) => e.error && e.error.name === 'QuotaExceededError');
    toast(quota
      ? `Se guardaron ${saved}. No hay más espacio en el iPad para ${errors.length}.`
      : `Se guardaron ${saved}. No se pudieron guardar ${errors.length}.`);
  } else {
    toast(saved === 1 ? 'Foto guardada' : `${saved} fotos guardadas`);
  }
}

async function allTransparent(photos, files) {
  for (const photo of photos) {
    const file = files.find((f) => f.name === photo.fileName) || null;
    if (file && !(await hasTransparency(file))) return false;
  }
  return true;
}

/** Pega un recorte copiado (por ejemplo, desde la app Fotos) en «Recortes sin fondo». */
export async function pasteCutout() {
  let file;
  try {
    file = await readClipboardImage();
  } catch (error) {
    toast(error && error.name === 'NotAllowedError' ? 'El iPad no dejó pegar. Tocá «Permitir» o «Pegar» cuando aparezca.' : error.message);
    return null;
  }
  if (!file) {
    toast('No hay una imagen copiada. En Fotos, mantené apretada la esfera y tocá «Copiar».');
    return null;
  }
  view.filter = 'recorte';
  const { photos } = await addPhotos([file], 'recorte');
  const photo = photos[0] || null;
  if (!photo) { toast('No se pudo guardar el recorte.'); return null; }
  toast((await hasTransparency(file)) ? 'Recorte pegado, sin fondo' : NO_TRANSPARENCY);
  return photo;
}

function redraw() {
  window.dispatchEvent(new Event('aura:redraw'));
}
