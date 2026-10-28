// Pantalla "Feed": propuestas de grilla para Instagram, antes de publicar.
// Arriba van las publicaciones planeadas (se arrastran para ordenarlas) y abajo,
// fijas, las piezas de la Biblioteca que ya están en Instagram.
// Las imágenes se usan por referencia: el Feed nunca modifica diseños ni fotos.

import { el, icon, toast, confirmDialog, relativeDate } from '../ui.js';
import { FEED_THEMES, TONES, LIGHTS } from '../brand.js';
import { averageLuminance } from '../images.js';
import { findIssues, countBy, suggestOrder, toneFromLuminance, placeLabel } from '../feed/analysis.js';
import {
  state, newFeed, newPostId, saveFeed, duplicateFeed, deleteFeed, addDesignAsset,
  designThumbUrl, thumbUrl, assetUrl, coverUrl,
} from '../store.js';

const PUBLISHED_SHOWN = 9;
const DRAG_START = 8;
let session = null; // { feed, undo, highlight } de la propuesta abierta
let picked = []; // propuestas elegidas para comparar
const pieceTones = new Map(); // tono calculado de cada portada publicada
let ignoreTapUntil = 0; // después de arrastrar, el toque que suelta no abre la ficha

const themeOf = (id) => FEED_THEMES.find((t) => t.id === id);
const labelOf = (list, id) => (list.find((item) => item.id === id) || {}).label || '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function renderFeed(root, detail) {
  if (detail && detail.startsWith('comparar/')) {
    const [, a, b] = detail.split('/');
    const feeds = [a, b].map((id) => state.feeds.find((f) => f.id === id));
    if (feeds.every(Boolean)) {
      session = null;
      renderCompare(root, feeds);
      return;
    }
  }
  if (detail) {
    const feed = session && session.feed.id === detail ? session.feed : state.feeds.find((f) => f.id === detail);
    if (feed) {
      if (!session || session.feed.id !== detail) session = { feed: structuredClone(feed), undo: null, highlight: null };
      renderBoard(root);
      return;
    }
  }
  session = null;
  renderList(root);
}

// ---------- Celdas: lo planeado más lo ya publicado ----------

function publishedPieces() {
  return state.pieces
    .filter((p) => (p.channels || []).includes('instagram') && p.format !== 'historia')
    .slice(0, PUBLISHED_SHOWN);
}

/** Las celdas de la grilla en el orden de Instagram, listas para la revisión. */
function cellsOf(feed) {
  const planned = feed.posts.map((post) => ({ ...post, planned: true }));
  const published = publishedPieces().map((piece) => {
    const tags = (feed.published || {})[piece.id] || {};
    return {
      id: piece.id,
      source: { kind: 'piece', id: piece.id },
      label: piece.title,
      theme: tags.theme || null,
      tone: tags.tone || pieceTones.get(piece.id) || null,
      light: tags.light || 'sin',
      planned: false,
    };
  });
  return [...planned, ...published];
}

async function sourceUrl(source) {
  if (source.kind === 'design') {
    const design = state.designs.find((d) => d.id === source.id);
    return design ? designThumbUrl(design) : null;
  }
  if (source.kind === 'photo') {
    const photo = state.photos.find((p) => p.id === source.id);
    return photo ? thumbUrl(photo) : null;
  }
  if (source.kind === 'asset') return assetUrl(source.id);
  const piece = state.pieces.find((p) => p.id === source.id);
  return piece ? coverUrl(piece) : null;
}

async function toneOf(source) {
  const url = await sourceUrl(source);
  if (!url) return null;
  try {
    const luminance = await averageLuminance(await (await fetch(url)).blob());
    return luminance == null ? null : toneFromLuminance(luminance);
  } catch {
    return null;
  }
}

/** Calcula el tono de las portadas publicadas que todavía no lo tienen. Devuelve true si hubo cambios. */
async function loadPieceTones() {
  let changed = false;
  for (const piece of publishedPieces()) {
    if (pieceTones.has(piece.id)) continue;
    pieceTones.set(piece.id, await toneOf({ kind: 'piece', id: piece.id }));
    changed = true;
  }
  return changed;
}

function thumb(cell) {
  const img = el('img', { alt: '', draggable: false });
  sourceUrl(cell.source).then((url) => {
    if (url) img.src = url;
    else img.replaceWith(el('span', { class: 'tile-fallback' }, 'No se encontró la imagen'));
  });
  return img;
}

// ---------- Propuestas ----------

function renderList(root) {
  picked = picked.filter((id) => state.feeds.some((f) => f.id === id));
  root.append(
    el('header', { class: 'page-head' },
      el('div', {},
        el('span', { class: 'eyebrow eyebrow-sage' }, 'Feed'),
        el('h1', { class: 'display page-title' }, 'Tu grilla, ', el('em', {}, 'antes de publicar')),
        el('p', { class: 'hint' }, 'Armá propuestas con tus diseños y fotos, ordenalas arrastrando y compará cuál queda más equilibrada.')),
      el('button', { type: 'button', class: 'btn btn-primary', onclick: createFeed }, icon('mas', 18), 'Nueva propuesta')));

  if (!state.feeds.length) {
    root.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-orb', 'aria-hidden': 'true' }),
      el('h2', { class: 'display' }, 'Todavía no hay propuestas'),
      el('p', { class: 'hint' }, 'Una propuesta es un orden posible para tus próximas publicaciones. Abajo se ven las que ya están en Instagram (las de la Biblioteca), para que veas cómo queda todo junto.'),
      el('button', { type: 'button', class: 'btn btn-dark', onclick: createFeed }, icon('mas', 18), 'Nueva propuesta')));
    return;
  }

  if (picked.length === 2) {
    const [a, b] = picked.map((id) => state.feeds.find((f) => f.id === id));
    root.append(el('div', { class: 'compare-bar', role: 'status' },
      el('span', {}, `Elegiste «${a.name}» y «${b.name}».`),
      el('a', { href: `#feed/comparar/${a.id}/${b.id}`, class: 'btn btn-dark btn-small' }, 'Comparar lado a lado')));
  } else if (state.feeds.length > 1) {
    root.append(el('p', { class: 'hint' }, 'Para comparar, tocá «Comparar» en dos propuestas.'));
  }
  root.append(el('div', { class: 'feeds' }, state.feeds.map(feedCard)));
}

function miniGrid(feed, { issues = [] } = {}) {
  const cells = cellsOf(feed);
  const marked = new Set(issues.flatMap((i) => i.cells));
  return el('div', { class: 'feed-grid feed-grid-mini', 'aria-hidden': 'true' },
    cells.map((cell, index) => el('span', {
      class: `feed-tile${cell.planned ? '' : ' is-published'}${marked.has(index) ? ' has-issue' : ''}`,
    }, thumb(cell))));
}

function feedCard(feed) {
  const issues = findIssues(cellsOf(feed));
  const isPicked = picked.includes(feed.id);
  return el('article', { class: 'feed-card' },
    el('a', { href: `#feed/${feed.id}`, class: 'feed-open', 'aria-label': `Abrir ${feed.name}` },
      miniGrid(feed),
      el('span', { class: 'piece-body' },
        el('span', { class: 'piece-title' }, feed.name),
        el('span', { class: 'piece-where' },
          `${plural(feed.posts.length, 'planeada', 'planeadas')} · ${issues.length ? plural(issues.length, 'aviso', 'avisos') : 'sin avisos'} · ${relativeDate(feed.updatedAt)}`))),
    el('div', { class: 'design-actions' },
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(isPicked),
        onclick: () => {
          picked = isPicked ? picked.filter((id) => id !== feed.id) : [...picked, feed.id].slice(-2);
          redraw();
        },
      }, 'Comparar'),
      el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: async () => { await duplicateFeed(feed.id); toast('Propuesta duplicada'); } }, 'Duplicar'),
      el('button', {
        type: 'button', class: 'btn-icon btn-icon-danger', 'aria-label': `Eliminar ${feed.name}`,
        onclick: async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar esta propuesta?',
            body: `«${feed.name}» se borra del Feed. Tus diseños, fotos y la Biblioteca no se tocan.`,
            confirmLabel: 'Eliminar propuesta',
            danger: true,
          });
          if (ok) { await deleteFeed(feed.id); toast('Propuesta eliminada'); }
        },
      }, icon('tacho', 18))));
}

async function createFeed() {
  const feed = await saveFeed(newFeed(`Propuesta ${state.feeds.length + 1}`));
  location.hash = `#feed/${feed.id}`;
}

// ---------- Comparar ----------

function renderCompare(root, feeds) {
  root.append(
    el('div', { class: 'editor-bar' },
      el('a', { href: '#feed', class: 'btn btn-quiet btn-small' }, '← Propuestas'),
      el('h1', { class: 'display compare-title' }, 'Comparar propuestas')),
    el('div', { class: 'compare' }, feeds.map((feed) => {
      const cells = cellsOf(feed);
      const issues = findIssues(cells);
      return el('section', { class: 'compare-col', 'aria-label': feed.name },
        el('div', { class: 'compare-head' },
          el('h2', { class: 'display card-title' }, feed.name),
          el('a', { href: `#feed/${feed.id}`, class: 'btn btn-quiet btn-small' }, 'Abrir')),
        miniGrid(feed, { issues }),
        el('p', { class: `compare-score${issues.length ? '' : ' is-ok'}` },
          issues.length ? plural(issues.length, 'aviso', 'avisos') : 'Sin avisos: está equilibrada'),
        issues.length ? el('ul', { class: 'issue-list' }, issues.map((i) => el('li', {}, i.message))) : null,
        counts(cells.filter((c) => c.planned)));
    })));
  loadPieceTones().then((changed) => { if (changed) redraw(); });
}

// ---------- Tablero de una propuesta ----------

function renderBoard(root) {
  const { feed } = session;
  const grid = el('div', { class: 'feed-grid', id: 'feed-grid', 'aria-label': 'Grilla de Instagram. Arriba a la izquierda, lo más nuevo.' });
  const panel = el('aside', { class: 'feed-panel', 'aria-label': 'Revisión de la propuesta' });
  const nameInput = el('input', {
    id: 'feed-name', class: 'input design-name', value: feed.name, 'aria-label': 'Nombre de la propuesta',
    oninput: (e) => { feed.name = e.target.value.trim() || 'Propuesta sin título'; persistSoon(); },
  });

  root.append(
    el('div', { class: 'editor-bar' },
      el('a', { href: '#feed', class: 'btn btn-quiet btn-small' }, '← Propuestas'),
      nameInput,
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openAddSheet(changed) }, icon('mas', 18), 'Agregar publicaciones')),
    el('div', { class: 'feed-board' }, el('div', { class: 'feed-phone' }, grid), panel));

  function changed() {
    drawGrid();
    drawPanel();
    persist();
  }

  function drawGrid() {
    const cells = cellsOf(feed);
    const issues = findIssues(cells);
    const marked = new Set(issues.flatMap((i) => i.cells));
    const highlighted = new Set(session.highlight || []);
    grid.replaceChildren(...cells.map((cell, index) => {
      const theme = themeOf(cell.theme);
      const classes = ['feed-tile', cell.planned ? 'is-planned' : 'is-published'];
      if (marked.has(index)) classes.push('has-issue');
      if (highlighted.has(index)) classes.push('is-highlighted');
      const name = `${cell.planned ? `Publicación ${feed.posts.length - index}` : 'Ya publicada'}: ${cell.label || 'sin nombre'}, ${placeLabel(index)}${theme ? `, ${theme.label}` : ''}`;
      const tile = el('button', {
        type: 'button', class: classes.join(' '), 'data-index': String(index), 'aria-label': name,
        onclick: () => {
          if (Date.now() < ignoreTapUntil) return;
          if (cell.planned) openPost(index); else openPublished(cell);
        },
      },
      thumb(cell),
      cell.planned ? el('span', { class: 'feed-order' }, String(feed.posts.length - index)) : el('span', { class: 'feed-published' }, 'Publicada'),
      el('span', { class: 'feed-tags' },
        theme ? el('span', { class: 'feed-theme', style: `--theme: ${theme.color}` }, theme.label) : el('span', { class: 'feed-theme feed-theme-none' }, 'Sin tema'),
        cell.tone ? el('span', { class: `feed-tone tone-${cell.tone}`, title: labelOf(TONES, cell.tone) }) : null,
        cell.light === 'lampara' ? el('span', { class: 'feed-light' }, 'Lámpara') : null,
        cell.light === 'dia' ? el('span', { class: 'feed-light' }, 'Día') : null));
      if (cell.planned) tile.addEventListener('pointerdown', (event) => startDrag(event, tile, index));
      return tile;
    }));
    if (!cells.length) {
      grid.replaceChildren(el('p', { class: 'hint feed-grid-empty' }, 'Agregá tus primeras publicaciones: diseños del Editor, fotos de Mis originales o una imagen suelta.'));
    }
  }

  // Arrastrar una planeada y soltarla en otro lugar de lo planeado.
  function startDrag(event, tile, from) {
    if (event.button > 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    let target = from;
    tile.setPointerCapture(event.pointerId);
    const plannedTiles = () => [...grid.querySelectorAll('.is-planned')];
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_START) return;
        const rect = tile.getBoundingClientRect();
        ghost = el('div', { class: 'feed-ghost', style: `width:${rect.width}px; height:${rect.height}px` }, tile.querySelector('img') ? tile.querySelector('img').cloneNode() : null);
        document.body.append(ghost);
        tile.classList.add('is-dragging');
      }
      ghost.style.transform = `translate(${e.clientX - ghost.offsetWidth / 2}px, ${e.clientY - ghost.offsetHeight / 2}px)`;
      let best = null;
      for (const other of plannedTiles()) {
        const r = other.getBoundingClientRect();
        const distance = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (!best || distance < best.distance) best = { distance, index: Number(other.dataset.index) };
      }
      target = best ? best.index : from;
      for (const other of plannedTiles()) other.classList.toggle('is-target', Number(other.dataset.index) === target && target !== from);
    };
    const end = (e) => {
      tile.removeEventListener('pointermove', move);
      tile.removeEventListener('pointerup', end);
      tile.removeEventListener('pointercancel', end);
      if (!ghost) return;
      ghost.remove();
      ignoreTapUntil = Date.now() + 400;
      if (e.type === 'pointerup' && target !== from) {
        const [post] = feed.posts.splice(from, 1);
        feed.posts.splice(target, 0, post);
        session.undo = null;
        session.highlight = null;
        changed();
      } else {
        drawGrid();
      }
    };
    tile.addEventListener('pointermove', move);
    tile.addEventListener('pointerup', end);
    tile.addEventListener('pointercancel', end);
  }

  function drawPanel() {
    const cells = cellsOf(feed);
    const issues = findIssues(cells);
    const plannedCells = cells.filter((c) => c.planned);
    panel.replaceChildren(
      el('section', { class: 'panel-section' },
        el('h2', { class: 'panel-title' }, 'Revisión'),
        !plannedCells.length
          ? el('p', { class: 'hint' }, 'Cuando agregues publicaciones, acá aparecen los avisos de equilibrio.')
          : issues.length
            ? el('ul', { class: 'issue-list' }, issues.map((issue) => el('li', {},
              el('button', {
                type: 'button', class: 'issue', 'aria-pressed': String(sameCells(session.highlight, issue.cells)),
                onclick: () => { session.highlight = sameCells(session.highlight, issue.cells) ? null : issue.cells; drawGrid(); drawPanel(); },
              }, icon('aviso', 16), el('span', {}, issue.message)))))
            : el('p', { class: 'issue-ok' }, icon('check', 18), 'Está equilibrada: no hay temas juntos, ni tres tonos o luces iguales seguidos, y las ofertas están separadas.'),
        el('div', { class: 'edit-actions' },
          el('button', { type: 'button', class: 'btn btn-quiet btn-small', disabled: plannedCells.length < 2, onclick: suggest }, 'Sugerir orden'),
          session.undo ? el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: undo }, 'Deshacer') : null),
        el('p', { class: 'hint' }, 'Sugerir orden solo mueve las planeadas. Lo ya publicado queda fijo.')),
      el('section', { class: 'panel-section' },
        el('h2', { class: 'panel-title' }, 'En esta propuesta'),
        counts(plannedCells)),
      el('section', { class: 'panel-section' },
        el('h2', { class: 'panel-title' }, 'Cómo leer la grilla'),
        el('p', { class: 'hint' }, 'Arriba a la izquierda va lo más nuevo, como en Instagram. El número dice en qué orden se publica: la 1 va primero. Las piezas de la Biblioteca publicadas en Instagram aparecen abajo, más claras, y no se mueven. Tocá una publicación para ponerle tema, tono y luz; mantenela apretada y arrastrala para moverla.')));
  }

  function suggest() {
    const cells = cellsOf(feed);
    const result = suggestOrder(cells, feed.posts.length);
    if (result.after >= result.before) {
      toast(result.before === 0 ? 'Ya está equilibrada.' : 'No encontré un orden más equilibrado moviendo solo las planeadas.');
      return;
    }
    session.undo = feed.posts.map((p) => p.id);
    feed.posts = result.order.map((i) => feed.posts[i]);
    session.highlight = null;
    const left = findIssues(cellsOf(feed)).length;
    toast(left ? `Orden sugerido: ${plural(left, 'aviso queda', 'avisos quedan')}.` : 'Orden sugerido: sin avisos.');
    changed();
  }

  function undo() {
    const byId = new Map(feed.posts.map((p) => [p.id, p]));
    feed.posts = session.undo.map((id) => byId.get(id)).filter(Boolean);
    session.undo = null;
    changed();
  }

  // Ficha de una publicación planeada: tema, tono, luz, nota y lugar.
  function openPost(index) {
    const post = feed.posts[index];
    const previous = document.activeElement;
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      changed();
      if (previous && previous.isConnected && previous.focus) previous.focus();
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const body = el('div', { class: 'sheet-fields' });
    const draw = () => {
      const i = feed.posts.indexOf(post);
      body.replaceChildren(
        el('p', { class: 'hint' }, `Se publica en el lugar ${feed.posts.length - i} de ${feed.posts.length} · ${placeLabel(i)}`),
        tagFields(post, draw, { autoTone: post.autoTone }),
        el('div', { class: 'field' },
          el('label', { for: 'post-note', class: 'field-label' }, 'Nota (opcional)'),
          el('textarea', { id: 'post-note', class: 'input', rows: 2, placeholder: 'Idea para el texto, fecha, recordatorio…', oninput: (e) => { post.note = e.target.value; persistSoon(); } }, post.note || '')),
        el('div', { class: 'edit-actions' },
          el('button', { type: 'button', class: 'btn btn-quiet btn-small', disabled: i === feed.posts.length - 1, onclick: () => movePost(post, 1) }, 'Publicar antes'),
          el('button', { type: 'button', class: 'btn btn-quiet btn-small', disabled: i === 0, onclick: () => movePost(post, -1) }, 'Publicar después')));
    };
    const movePost = (p, delta) => {
      const i = feed.posts.indexOf(p);
      feed.posts.splice(i, 1);
      feed.posts.splice(i + delta, 0, p);
      session.undo = null;
      session.highlight = null;
      draw();
    };
    const remove = async () => {
      const ok = await confirmDialog({
        title: '¿Quitar esta publicación?',
        body: 'Se quita de esta propuesta. El diseño o la foto no se borran.',
        confirmLabel: 'Quitar',
        danger: true,
      });
      if (!ok) return;
      feed.posts = feed.posts.filter((p) => p !== post);
      session.undo = null;
      session.highlight = null;
      close();
    };
    draw();
    const overlay = sheet('post-title', post.label || 'Publicación', thumb({ source: post.source }), body,
      el('div', { class: 'sheet-actions' },
        el('button', { type: 'button', class: 'btn btn-quiet btn-danger-text', onclick: remove }, icon('tacho', 18), 'Quitar'),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: close }, 'Listo')),
      close);
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.chip').focus({ preventScroll: true });
  }

  // Ficha de una pieza ya publicada: solo etiquetas, para que la revisión la tenga en cuenta.
  function openPublished(cell) {
    feed.published = feed.published || {};
    const tags = { theme: null, light: 'sin', ...(feed.published[cell.id] || {}) };
    const previous = document.activeElement;
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      feed.published[cell.id] = { theme: tags.theme, tone: tags.tone || null, light: tags.light };
      changed();
      if (previous && previous.isConnected && previous.focus) previous.focus();
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const body = el('div', { class: 'sheet-fields' });
    const draw = () => body.replaceChildren(
      el('p', { class: 'hint' }, 'Ya está publicada: no se mueve. Sus etiquetas se guardan en esta propuesta y sirven para revisar lo que va arriba.'),
      tagFields(tags, draw, { autoTone: pieceTones.get(cell.id) }));
    draw();
    const overlay = sheet('post-title', cell.label, thumb(cell), body,
      el('div', { class: 'sheet-actions' },
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: close }, 'Listo')),
      close);
    document.addEventListener('keydown', onKey);
  }

  let saveTimer = null;
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
  }
  async function persist() {
    clearTimeout(saveTimer);
    try {
      const saved = await saveFeed(feed);
      feed.updatedAt = saved.updatedAt;
      if (location.hash === '#feed') redraw(); // se volvió a la lista antes de guardar
    } catch (error) {
      toast(error && error.name === 'QuotaExceededError' ? 'No hay más espacio en el iPad para guardar la propuesta.' : `No se pudo guardar la propuesta: ${error.message}`);
    }
  }

  drawGrid();
  drawPanel();
  loadPieceTones().then((changedTones) => { if (changedTones) { drawGrid(); drawPanel(); } });
}

function sameCells(a, b) {
  return Boolean(a && b) && a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Elecciones de tema, tono y luz. target se modifica en el lugar. */
function tagFields(target, redrawFields, { autoTone }) {
  const group = (name, options, key, current) => el('fieldset', { class: 'field' },
    el('legend', { class: 'field-label' }, name),
    el('div', { class: 'chips', role: 'radiogroup', 'aria-label': name },
      options.map((option) => el('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(current === option.id),
        onclick: () => { target[key] = option.id; redrawFields(); },
      }, option.dot ? el('span', { class: 'theme-dot', style: `background:${option.dot}` }) : null, option.label))));
  return el('div', { class: 'sheet-fields' },
    group('Tema', [...FEED_THEMES.map((t) => ({ id: t.id, label: t.label, dot: t.color })), { id: null, label: 'Sin tema' }], 'theme', target.theme || null),
    group('Tono', TONES, 'tone', target.tone || autoTone || null),
    autoTone ? el('p', { class: 'hint field-help' }, `Según el brillo de la imagen, es ${labelOf(TONES, autoTone).toLowerCase()}. Cambialo si no coincide con lo que ves.`) : null,
    group('Luz', [...LIGHTS.filter((l) => l.id !== 'sin'), LIGHTS.find((l) => l.id === 'sin')], 'light', target.light || 'sin'));
}

function counts(cells) {
  if (!cells.length) return el('p', { class: 'hint' }, 'Sin publicaciones planeadas.');
  const themes = countBy(cells, 'theme');
  const tones = countBy(cells, 'tone');
  return el('div', { class: 'feed-counts' },
    el('ul', { class: 'count-list', 'aria-label': 'Por tema' },
      [...FEED_THEMES, { id: 'sin', label: 'Sin tema', funnel: '' }].filter((t) => t.id !== 'sin' || themes.sin).map((t) => el('li', {},
        el('span', { class: 'theme-dot', style: t.color ? `background:${t.color}` : '' }),
        el('span', { class: 'count-name' }, t.label, t.funnel ? el('small', {}, ` ${t.funnel}`) : null),
        el('span', { class: 'tabular' }, String(themes[t.id] || 0))))),
    el('ul', { class: 'count-list count-tones', 'aria-label': 'Por tono' },
      TONES.map((t) => el('li', {},
        el('span', { class: `feed-tone tone-${t.id}` }),
        el('span', { class: 'count-name' }, t.label),
        el('span', { class: 'tabular' }, String(tones[t.id] || 0))))));
}

function sheet(titleId, title, preview, body, actions, close) {
  const overlay = el('div', {
    class: 'overlay overlay-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
    onclick: (e) => { if (e.target === overlay) close(); },
  },
  el('div', { class: 'sheet' },
    el('div', { class: 'sheet-head' },
      el('h2', { id: titleId, class: 'display' }, title),
      el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Cerrar', onclick: close }, icon('cerrar', 20))),
    el('div', { class: 'sheet-body' }, el('div', { class: 'feed-tile feed-preview' }, preview), body),
    actions));
  document.body.append(overlay);
  return overlay;
}

// ---------- Agregar publicaciones ----------

function openAddSheet(onAdded) {
  const { feed } = session;
  let tab = state.designs.length ? 'design' : 'photo';
  let chosen = []; // [{ source, label, light }] en el orden en que se tocaron
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (event) => { if (event.key === 'Escape') close(); };

  const add = async (items) => {
    if (!items.length) return;
    toast('Agregando…', { persist: true });
    const posts = [];
    for (const item of items) {
      const autoTone = await toneOf(item.source);
      posts.push({ id: newPostId(), source: item.source, label: item.label, theme: null, tone: autoTone, autoTone, light: item.light || 'sin', note: '' });
    }
    // Lo primero que se elige se publica primero: queda más abajo en la grilla.
    feed.posts.unshift(...posts.reverse());
    session.undo = null;
    session.highlight = null;
    close();
    toast(`${plural(items.length, 'publicación agregada', 'publicaciones agregadas')}. Tocalas para ponerles tema.`);
    onAdded();
  };

  const fileInput = el('input', {
    type: 'file', accept: 'image/*', multiple: true, id: 'feed-file', class: 'sr-only',
    onchange: async (event) => {
      const files = [...event.target.files];
      event.target.value = '';
      const items = [];
      for (const file of files) {
        items.push({ source: await addDesignAsset(file), label: file.name.replace(/\.[^.]+$/, '') || 'Imagen suelta' });
      }
      add(items);
    },
  });

  const content = el('div', { class: 'sheet-fields' });
  const confirm = el('button', { type: 'button', class: 'btn btn-primary', onclick: () => add(chosen) });
  const draw = () => {
    const options = tab === 'design'
      ? state.designs.map((d) => ({ source: { kind: 'design', id: d.id }, label: d.name, light: 'sin' }))
      : state.photos.map((p) => ({ source: { kind: 'photo', id: p.id }, label: p.name, light: p.light }));
    const key = (item) => `${item.source.kind}:${item.source.id}`;
    const used = new Set(feed.posts.map(key));
    content.replaceChildren(
      el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'De dónde' },
        [['design', 'Diseños'], ['photo', 'Mis originales'], ['file', 'Imagen suelta']].map(([id, label]) => el('button', {
          type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(tab === id),
          onclick: () => { tab = id; draw(); },
        }, label))),
      tab === 'file'
        ? el('div', { class: 'field' },
          el('p', { class: 'hint' }, 'Una imagen que no está en la app, por ejemplo una captura o algo hecho en otra aplicación. Se guarda una copia para esta propuesta.'),
          fileInput,
          el('label', { for: 'feed-file', class: 'btn btn-quiet' }, icon('fotos', 18), 'Elegir imágenes'))
        : options.length
          ? el('div', { class: 'picker-grid' }, options.map((item) => {
            const order = chosen.findIndex((c) => key(c) === key(item));
            return el('button', {
              type: 'button', class: 'picker-item', 'aria-pressed': String(order >= 0), 'aria-label': item.label,
              onclick: () => {
                chosen = order >= 0 ? chosen.filter((c) => key(c) !== key(item)) : [...chosen, item];
                draw();
              },
            },
            el('span', { class: 'picker-thumb feed-pick' }, thumb(item), order >= 0 ? el('span', { class: 'feed-order' }, String(order + 1)) : null),
            el('span', { class: 'picker-name' }, item.label, used.has(key(item)) ? el('small', {}, ' · ya está') : null));
          }))
          : el('p', { class: 'hint' }, tab === 'design'
            ? ['Todavía no hay diseños. ', el('a', { href: '#editor', onclick: close }, 'Armá uno en el Editor'), '.']
            : ['Todavía no hay fotos. ', el('a', { href: '#originales', onclick: close }, 'Cargalas en Mis originales'), '.']),
      tab !== 'file' ? el('p', { class: 'hint' }, 'Tocalas en el orden en que las vas a publicar.') : null);
    confirm.disabled = !chosen.length;
    confirm.textContent = chosen.length ? `Agregar ${chosen.length}` : 'Agregar';
  };
  draw();

  const overlay = el('div', {
    class: 'overlay overlay-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'add-title',
    onclick: (e) => { if (e.target === overlay) close(); },
  },
  el('div', { class: 'sheet' },
    el('div', { class: 'sheet-head' },
      el('h2', { id: 'add-title', class: 'display' }, 'Agregar publicaciones'),
      el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Cerrar', onclick: close }, icon('cerrar', 20))),
    content,
    el('div', { class: 'sheet-actions' },
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-quiet', onclick: close }, 'Cancelar'),
      confirm)));
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
}

function redraw() {
  window.dispatchEvent(new Event('aura:redraw'));
}
