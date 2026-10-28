// Pantalla "Editor": Mis diseños y el editor de un diseño.
// Un diseño tiene capas: imágenes (fondo, esfera, logo) y textos.
// Las fotos de «Mis originales» se usan por referencia: el Editor nunca las modifica.

import { el, icon, toast, hideToast, confirmDialog, saveFile, relativeDate } from '../ui.js';
import { pasteCutout } from './originales.js';
import { PALETTE, CATEGORIES } from '../brand.js';
import { hasTransparency } from '../images.js';
import {
  DESIGN_FORMATS, TEXT_FONTS, formatSize, renderDesign, layerBounds, sourceKey, coverWidth, textWords,
} from '../editor/render.js';
import {
  state, newDesign, saveDesign, duplicateDesign, deleteDesign, addDesignAsset, sourceBlob, designThumbUrl, thumbUrl,
} from '../store.js';

const SNAP = 14;
const images = new Map(); // fuente → ImageBitmap, compartido entre diseños
let session = null; // { design, selectedId } del diseño abierto

// ---------- Mis diseños ----------

export function renderEditor(root, designId) {
  if (designId) {
    const design = session && session.design.id === designId
      ? session.design
      : state.designs.find((d) => d.id === designId);
    if (design) {
      if (!session || session.design.id !== designId) session = { design: structuredClone(design), selectedId: null };
      renderDesignEditor(root);
      return;
    }
  }
  session = null;
  renderDesignList(root);
}

function renderDesignList(root) {
  const designs = state.designs;
  root.append(
    el('header', { class: 'page-head' },
      el('div', {},
        el('span', { class: 'eyebrow eyebrow-sage' }, 'Editor'),
        el('h1', { class: 'display page-title' }, 'Mis ', el('em', {}, 'diseños')),
        el('p', { class: 'hint' }, 'Fondo de ChatGPT + tu esfera real + tus textos. Exportás un PNG listo para Instagram.'))),
    el('section', { class: 'card new-design', 'aria-labelledby': 'new-design-title' },
      el('h2', { id: 'new-design-title', class: 'display card-title' }, 'Nuevo diseño'),
      el('div', { class: 'format-picks' },
        DESIGN_FORMATS.map((format) => el('button', {
          type: 'button', class: 'format-pick', onclick: () => createDesign(format.id),
        },
        el('span', { class: 'format-shape', style: `aspect-ratio: ${format.width} / ${format.height}` }),
        el('span', { class: 'format-name' }, format.label),
        el('span', { class: 'hint tabular' }, `${format.width} × ${format.height}`))))),
    designs.length
      ? el('div', { class: 'designs' }, designs.map(designCard))
      : el('p', { class: 'hint designs-empty' }, 'Todavía no hay diseños. Elegí un formato para empezar.'));
}

function designCard(design) {
  const size = formatSize(design.format);
  const img = el('img', { alt: '' });
  designThumbUrl(design).then((url) => { if (url) img.src = url; });
  return el('article', { class: 'design-card' },
    el('a', { href: `#editor/${design.id}`, class: 'design-open', 'aria-label': `Abrir ${design.name}` },
      el('span', { class: 'design-thumb', style: `aspect-ratio: ${size.width} / ${size.height}` }, img),
      el('span', { class: 'piece-body' },
        el('span', { class: 'piece-title' }, design.name),
        el('span', { class: 'piece-where' }, `${size.label} · ${relativeDate(design.updatedAt)}`))),
    el('div', { class: 'design-actions' },
      el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: async () => { await duplicateDesign(design.id); toast('Diseño duplicado'); } }, 'Duplicar'),
      el('button', {
        type: 'button', class: 'btn-icon btn-icon-danger', 'aria-label': `Eliminar ${design.name}`,
        onclick: async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar este diseño?',
            body: `«${design.name}» se borra del Editor. Tus fotos originales no se tocan.`,
            confirmLabel: 'Eliminar diseño',
            danger: true,
          });
          if (ok) { await deleteDesign(design.id); toast('Diseño eliminado'); }
        },
      }, icon('tacho', 18))));
}

async function createDesign(format) {
  const design = await saveDesign(newDesign(format));
  location.hash = `#editor/${design.id}`;
}

// ---------- Editor de un diseño ----------

function renderDesignEditor(root) {
  const { design } = session;
  const size = formatSize(design.format);
  const canvas = el('canvas', { class: 'stage-canvas', 'aria-label': 'Lienzo del diseño. Tocá un elemento para elegirlo y arrastralo para moverlo.' });
  const stage = el('div', { class: 'canvas-stage', style: `--ratio: ${size.width / size.height}` }, canvas);
  const panel = el('aside', { class: 'editor-panel', 'aria-label': 'Propiedades' });
  const nameInput = el('input', {
    id: 'design-name', class: 'input design-name', value: design.name, 'aria-label': 'Nombre del diseño',
    oninput: (e) => { design.name = e.target.value.trim() || 'Diseño sin título'; changed(); },
  });

  root.append(
    el('div', { class: 'editor-bar' },
      el('a', { href: '#editor', class: 'btn btn-quiet btn-small' }, '← Mis diseños'),
      nameInput,
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => exportDesign(design) }, icon('guardar', 18), 'Exportar PNG')),
    el('div', { class: 'editor' }, el('div', { class: 'stage-wrap' }, stage), panel));

  const ctx = canvas.getContext('2d');
  let guide = false;

  function draw() {
    const width = canvas.clientWidth;
    if (!width) return;
    const ratio = window.devicePixelRatio || 1;
    const scale = (width * ratio) / size.width;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(size.height * scale);
    renderDesign(ctx, design, images, { scale });
    const selected = design.layers.find((l) => l.id === session.selectedId);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (guide) {
      ctx.strokeStyle = 'rgba(191, 159, 115, 0.9)';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(size.width / 2, 0);
      ctx.lineTo(size.width / 2, size.height);
      ctx.stroke();
    }
    if (selected && !selected.hidden) {
      const b = layerBounds(ctx, selected);
      ctx.strokeStyle = '#BF9F73';
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash([12 / scale, 8 / scale]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
  }

  let saveTimer = null;
  function changed({ panel: redrawPanel = false } = {}) {
    draw();
    if (redrawPanel) drawPanel();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(design), 600);
  }

  // Arrastrar con un dedo, agrandar o achicar con dos.
  const pointers = new Map();
  let gesture = null;
  const toDesign = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * size.width, y: ((event.clientY - rect.top) / rect.height) * size.height };
  };
  const startGesture = () => {
    const layer = design.layers.find((l) => l.id === session.selectedId);
    const points = [...pointers.values()];
    if (!layer) { gesture = null; return; }
    if (points.length >= 2) {
      gesture = { type: 'pinch', layer, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), width: layer.width, size: layer.size };
    } else if (points.length === 1) {
      gesture = { type: 'drag', layer, from: points[0], x: layer.x, y: layer.y };
    }
  };
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const point = toDesign(event);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) {
      const hit = [...design.layers].reverse().find((layer) => {
        if (layer.hidden) return false;
        const b = layerBounds(ctx, layer);
        return point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h;
      });
      const id = hit ? hit.id : null;
      if (id !== session.selectedId) { session.selectedId = id; drawPanel(); }
    }
    startGesture();
    draw();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, toDesign(event));
    const points = [...pointers.values()];
    const { layer } = gesture;
    if (gesture.type === 'drag') {
      layer.x = gesture.x + (points[0].x - gesture.from.x);
      layer.y = gesture.y + (points[0].y - gesture.from.y);
      const centerX = layer.type === 'text' ? layer.x + layer.width / 2 : layer.x;
      guide = Math.abs(centerX - size.width / 2) < SNAP;
      if (guide) layer.x = layer.type === 'text' ? size.width / 2 - layer.width / 2 : size.width / 2;
    } else if (points.length >= 2) {
      const factor = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / gesture.distance;
      if (layer.type === 'text') {
        layer.size = clamp(Math.round(gesture.size * factor), 16, 260);
      } else {
        const center = layer.x;
        layer.width = clamp(gesture.width * factor, 40, size.width * 3);
        layer.x = center;
      }
    }
    changed();
  });
  const endPointer = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    guide = false;
    startGesture();
    draw();
    drawPanel();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  new ResizeObserver(() => draw()).observe(canvas);

  // ---------- Panel ----------

  function drawPanel() {
    const selected = design.layers.find((l) => l.id === session.selectedId);
    panel.replaceChildren(
      section('Formato', el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Formato' },
        DESIGN_FORMATS.map((format) => el('button', {
          type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(design.format === format.id),
          onclick: () => {
            if (design.format === format.id) return;
            design.format = format.id;
            persist(design).then(() => redraw());
          },
        }, format.label)))),
      section('Agregar', addButtons()),
      selected ? section(layerTitle(selected), layerControls(selected)) : null,
      section('Capas', layerList()));
  }

  function addButtons() {
    const backgroundInput = el('input', {
      type: 'file', accept: 'image/*', id: 'background-input', class: 'sr-only',
      onchange: async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const source = await addDesignAsset(file);
        const aspect = await loadImage(source);
        if (!aspect) { toast('No se pudo leer la imagen.'); return; }
        const layer = { id: newLayerId(), type: 'image', role: 'fondo', source, aspect, width: coverWidth(aspect, design.format), x: size.width / 2, y: size.height / 2 };
        design.layers.unshift(layer);
        session.selectedId = layer.id;
        changed({ panel: true });
      },
    });
    const hasLogo = Boolean(state.logo);
    return el('div', { class: 'add-grid' },
      backgroundInput,
      el('label', { for: 'background-input', class: 'btn btn-quiet btn-small' }, icon('fotos', 16), 'Fondo'),
      el('button', { type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': 'Agregar esfera', onclick: openSpherePicker }, icon('marca', 16), 'Esfera'),
      el('button', { type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': 'Agregar texto', onclick: addText }, icon('lapiz', 16), 'Texto'),
      el('button', { type: 'button', class: 'btn btn-quiet btn-small', 'aria-label': 'Agregar logo', disabled: !hasLogo, onclick: addLogo }, icon('marca', 16), 'Logo'),
      hasLogo ? null : el('p', { class: 'hint add-hint' }, 'Para usar el logo, subilo en ', el('a', { href: '#marca' }, 'Mi marca'), '.'));
  }

  function addText() {
    const layer = {
      id: newLayerId(), type: 'text', text: 'Hay recuerdos que merecen volver a vivirse.', accents: [4, 5, 6],
      font: 'display', size: 76, color: '#302C26', accentColor: '#596B53', align: 'left',
      x: 90, y: 110, width: size.width - 180,
    };
    design.layers.push(layer);
    session.selectedId = layer.id;
    changed({ panel: true });
    const field = panel.querySelector('#text-content');
    if (field) field.focus({ preventScroll: true });
  }

  async function addLogo() {
    const source = { kind: 'logo' };
    images.delete(sourceKey(source)); // por si se cambió el logo
    const aspect = await loadImage(source);
    if (!aspect) { toast('No se pudo leer el logo.'); return; }
    const layer = { id: newLayerId(), type: 'image', role: 'logo', source, aspect, width: size.width * 0.3, x: size.width / 2, y: size.height - 110 };
    design.layers.push(layer);
    session.selectedId = layer.id;
    changed({ panel: true });
  }

  async function addSphere(photo, { warned = false } = {}) {
    const source = { kind: 'photo', id: photo.id };
    const aspect = await loadImage(source);
    if (!aspect) { toast('No se pudo leer la foto.'); return; }
    const layer = { id: newLayerId(), type: 'image', role: 'esfera', source, aspect, width: size.width * 0.42, x: size.width / 2, y: size.height * 0.62, shadow: true };
    const firstAbove = design.layers.findIndex((l) => l.role !== 'fondo');
    design.layers.splice(firstAbove < 0 ? design.layers.length : firstAbove, 0, layer);
    session.selectedId = layer.id;
    changed({ panel: true });
    const blob = await sourceBlob(source);
    if (!warned && blob && !(await hasTransparency(blob))) {
      toast('Esta foto tiene fondo. Para que la esfera se vea apoyada, usá un recorte sin fondo.');
    }
  }

  function openSpherePicker() {
    const photos = [...state.photos].sort((a, b) => (a.category === 'recorte' ? 0 : 1) - (b.category === 'recorte' ? 0 : 1));
    const close = () => overlay.remove();
    const overlay = el('div', { class: 'overlay overlay-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'picker-title', onclick: (e) => { if (e.target === overlay) close(); } },
      el('div', { class: 'sheet' },
        el('div', { class: 'sheet-head' },
          el('h2', { id: 'picker-title', class: 'display' }, 'Elegí la esfera'),
          el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Cerrar', onclick: close }, icon('cerrar', 20))),
        el('div', { class: 'edit-actions' },
          el('button', {
            type: 'button', class: 'btn btn-quiet btn-small',
            onclick: async () => {
              const photo = await pasteCutout();
              if (!photo) return;
              close();
              await addSphere(photo, { warned: true });
              redraw(); // pegar guarda una foto nueva y redibuja la app: se muestra el diseño actualizado
            },
          }, icon('copiar', 16), 'Pegar recorte'),
          el('span', { class: 'hint' }, 'En Fotos, mantené apretada la esfera, tocá «Copiar» y volvé acá.')),
        photos.length
          ? el('p', { class: 'hint' }, 'Primero aparecen los recortes sin fondo. La foto original no se modifica.')
          : el('p', {}, 'Todavía no hay fotos. ', el('a', { href: '#originales', onclick: close }, 'Cargá un recorte en Mis originales'), '.'),
        el('div', { class: 'picker-grid' },
          photos.map((photo) => {
            const img = el('img', { alt: '' });
            thumbUrl(photo).then((url) => { if (url) img.src = url; });
            const category = CATEGORIES.find((c) => c.id === photo.category);
            return el('button', {
              type: 'button', class: 'picker-item', 'aria-label': `${photo.name}${category ? `, ${category.label}` : ''}`,
              onclick: () => { close(); addSphere(photo); },
            }, el('span', { class: `picker-thumb${photo.category === 'recorte' ? ' picker-cutout' : ''}` }, img),
            el('span', { class: 'picker-name' }, photo.name));
          }))));
    document.body.append(overlay);
  }

  function layerTitle(layer) {
    if (layer.type === 'text') return 'Texto';
    return { fondo: 'Fondo', esfera: 'Esfera', logo: 'Logo' }[layer.role] || 'Imagen';
  }

  function layerControls(layer) {
    if (layer.type === 'text') return textControls(layer);
    const percent = Math.round((layer.width / size.width) * 100);
    return el('div', { class: 'controls' },
      range('Tamaño', 'layer-size', 5, 300, percent, '%', (value) => { const x = layer.x; layer.width = (value / 100) * size.width; layer.x = x; changed(); }),
      el('div', { class: 'edit-actions' },
        el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { layer.x = size.width / 2; changed(); } }, 'Centrar'),
        layer.role === 'fondo'
          ? el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { layer.width = coverWidth(layer.aspect, design.format); layer.x = size.width / 2; layer.y = size.height / 2; changed({ panel: true }); } }, 'Llenar el formato')
          : null,
        layer.role === 'esfera'
          ? el('button', { type: 'button', class: 'chip', 'aria-pressed': String(Boolean(layer.shadow)), onclick: () => { layer.shadow = !layer.shadow; changed({ panel: true }); } }, 'Sombra')
          : null),
      layer.role === 'esfera' && !images.get(sourceKey(layer.source))
        ? el('p', { class: 'hint' }, 'No se encontró la foto: puede que la hayas eliminado de Mis originales.')
        : null);
  }

  function textControls(layer) {
    const chips = el('div', { class: 'chips word-chips', role: 'group', 'aria-label': 'Palabras destacadas' });
    const drawChips = () => {
      const words = textWords(layer.text);
      layer.accents = (layer.accents || []).filter((i) => i < words.length);
      chips.replaceChildren(...words.map((w, i) => el('button', {
        type: 'button', class: 'chip chip-word', 'aria-pressed': String(layer.accents.includes(i)),
        onclick: () => {
          layer.accents = layer.accents.includes(i) ? layer.accents.filter((n) => n !== i) : [...layer.accents, i];
          drawChips();
          changed();
        },
      }, w.word)));
    };
    drawChips();
    const swatches = (label, key) => el('div', { class: 'field' },
      el('span', { class: 'field-label' }, label),
      el('div', { class: 'swatch-row', role: 'radiogroup', 'aria-label': label },
        PALETTE.map((c) => el('button', {
          type: 'button', class: 'mini-swatch', role: 'radio', 'aria-checked': String(layer[key] === c.hex), 'aria-label': c.name,
          style: `background:${c.hex}`, onclick: () => { layer[key] = c.hex; changed({ panel: true }); },
        }))));
    return el('div', { class: 'controls' },
      el('label', { for: 'text-content', class: 'field-label' }, 'Frase'),
      el('textarea', { id: 'text-content', class: 'input', rows: 3, oninput: (e) => { layer.text = e.target.value; drawChips(); changed(); } }, layer.text),
      el('span', { class: 'field-label' }, 'Tocá las palabras que van destacadas'),
      chips,
      el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Tipografía' },
        TEXT_FONTS.map((f) => el('button', {
          type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(layer.font === f.id),
          onclick: () => { layer.font = f.id; changed({ panel: true }); },
        }, f.label))),
      range('Tamaño de letra', 'text-size', 16, 260, layer.size, ' px', (value) => { layer.size = value; changed(); }),
      range('Ancho del texto', 'text-width', 20, 100, Math.round((layer.width / size.width) * 100), '%', (value) => { layer.width = (value / 100) * size.width; changed(); }),
      el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Alineación' },
        [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']].map(([id, label]) => el('button', {
          type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(layer.align === id),
          onclick: () => { layer.align = id; changed({ panel: true }); },
        }, label))),
      swatches('Color del texto', 'color'),
      swatches('Color de las palabras destacadas', 'accentColor'));
  }

  function layerList() {
    const list = [...design.layers].reverse();
    if (!list.length) return el('p', { class: 'hint' }, 'Empezá con un fondo y tu esfera.');
    return el('ul', { class: 'layers' }, list.map((layer) => {
      const index = design.layers.indexOf(layer);
      const name = layer.type === 'text' ? `Texto: ${textWords(layer.text).slice(0, 3).map((w) => w.word).join(' ') || '(vacío)'}` : layerTitle(layer);
      const move = (delta) => {
        const target = index + delta;
        if (target < 0 || target >= design.layers.length) return;
        design.layers.splice(index, 1);
        design.layers.splice(target, 0, layer);
        changed({ panel: true });
      };
      return el('li', { class: `layer${layer.id === session.selectedId ? ' layer-selected' : ''}` },
        el('button', { type: 'button', class: 'layer-name', onclick: () => { session.selectedId = layer.id; draw(); drawPanel(); } }, name),
        el('button', { type: 'button', class: 'layer-btn', 'aria-label': `Subir ${name}`, disabled: index === design.layers.length - 1, onclick: () => move(1) }, '↑'),
        el('button', { type: 'button', class: 'layer-btn', 'aria-label': `Bajar ${name}`, disabled: index === 0, onclick: () => move(-1) }, '↓'),
        el('button', { type: 'button', class: 'layer-btn', 'aria-pressed': String(Boolean(layer.hidden)), 'aria-label': `${layer.hidden ? 'Mostrar' : 'Ocultar'} ${name}`, onclick: () => { layer.hidden = !layer.hidden; changed({ panel: true }); } }, layer.hidden ? 'Ver' : 'Ocultar'),
        el('button', {
          type: 'button', class: 'layer-btn layer-delete', 'aria-label': `Quitar ${name}`,
          onclick: async () => {
            const ok = await confirmDialog({ title: '¿Quitar esta capa?', body: `Se quita «${name}» del diseño. Tus fotos originales no se tocan.`, confirmLabel: 'Quitar', danger: true });
            if (!ok) return;
            design.layers = design.layers.filter((l) => l.id !== layer.id);
            if (session.selectedId === layer.id) session.selectedId = null;
            changed({ panel: true });
          },
        }, icon('tacho', 16)));
    }));
  }

  drawPanel();
  loadAll(design).then(() => { draw(); drawPanel(); });
}

function section(title, content) {
  return el('section', { class: 'panel-section' }, el('h2', { class: 'panel-title' }, title), content);
}

function range(label, id, min, max, value, unit, onInput) {
  const output = el('output', { for: id, class: 'tabular' }, `${value}${unit}`);
  return el('div', { class: 'field' },
    el('div', { class: 'range-head' }, el('label', { for: id, class: 'field-label' }, label), output),
    el('input', {
      id, type: 'range', min: String(min), max: String(max), value: String(Math.round(value)), class: 'range',
      oninput: (e) => { const v = Number(e.target.value); output.textContent = `${v}${unit}`; onInput(v); },
    }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function newLayerId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Carga una imagen en memoria y devuelve su proporción (alto / ancho), o null. */
async function loadImage(source) {
  const key = sourceKey(source);
  if (!images.has(key)) {
    const blob = await sourceBlob(source);
    let bitmap = null;
    if (blob) {
      try { bitmap = await createImageBitmap(blob); } catch { bitmap = null; }
    }
    if (!bitmap) return null;
    images.set(key, bitmap);
  }
  const bitmap = images.get(key);
  return bitmap.height / bitmap.width;
}

async function loadAll(design) {
  await Promise.all([
    document.fonts.load('400 40px Fraunces'),
    document.fonts.load('italic 400 40px Fraunces'),
    document.fonts.load('600 40px Manrope'),
    document.fonts.load('italic 600 40px Manrope'),
  ]).catch(() => {});
  await Promise.all(design.layers.filter((l) => l.source).map((l) => loadImage(l.source)));
}

/** Guarda el diseño con una miniatura nueva para «Mis diseños». */
async function persist(design) {
  try {
    const size = formatSize(design.format);
    const canvas = document.createElement('canvas');
    const scale = 360 / size.width;
    canvas.width = 360;
    canvas.height = Math.round(size.height * scale);
    renderDesign(canvas.getContext('2d'), design, images, { scale });
    const thumb = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    const saved = await saveDesign(design, thumb);
    design.updatedAt = saved.updatedAt;
    if (location.hash === '#editor') redraw(); // se volvió a «Mis diseños» antes de guardar
  } catch (error) {
    toast(error && error.name === 'QuotaExceededError' ? 'No hay más espacio en el iPad para guardar el diseño.' : `No se pudo guardar el diseño: ${error.message}`);
  }
}

/** Arma el PNG en tamaño real y lo muestra antes de guardarlo. */
async function exportDesign(design) {
  const size = formatSize(design.format);
  toast('Preparando la imagen…', { persist: true });
  await loadAll(design);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  renderDesign(canvas.getContext('2d'), design, images);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  hideToast();
  const slug = design.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'diseno';
  const file = new File([blob], `${slug}-${size.width}x${size.height}.png`, { type: 'image/png' });
  const url = URL.createObjectURL(file);
  const close = () => { overlay.remove(); URL.revokeObjectURL(url); };
  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'export-title', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'dialog export-dialog' },
      el('h2', { id: 'export-title' }, 'Tu imagen está lista'),
      el('img', { src: url, alt: 'Vista previa de la imagen exportada', class: 'export-preview' }),
      el('p', { class: 'hint tabular' }, `PNG · ${size.width} × ${size.height} px`),
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'btn btn-quiet', onclick: close }, 'Cerrar'),
        el('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: async () => {
            const result = await saveFile(file);
            if (result === 'cancelled') return;
            close();
            toast(result === 'downloaded' ? 'Imagen descargada' : 'Imagen guardada');
          },
        }, icon('guardar', 18), 'Guardar imagen'))));
  document.body.append(overlay);
}

function redraw() {
  window.dispatchEvent(new Event('aura:redraw'));
}
