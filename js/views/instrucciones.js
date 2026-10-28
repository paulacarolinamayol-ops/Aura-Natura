// Pantalla "Instrucciones": arma el texto para pegar en ChatGPT.

import { el, icon, toast, copyText, saveFile } from '../ui.js';
import { PALETTE, CATEGORIES } from '../brand.js';
import { PROMPT_TYPES, GOALS, PROMPT_FORMATS, PROMPT_LIGHTS, SCENES, TEXT_SPACES, buildPrompt } from '../prompts.js';
import { state, savePromptOptions, thumbUrl, originalFile } from '../store.js';

// La foto de referencia se prepara al elegirla, así el menú de compartir del iPad
// se abre en el mismo toque y arrastrarla a ChatGPT entrega el original.
const reference = { id: null, file: null, url: null };

export function renderInstrucciones(root) {
  const options = { ...state.promptOptions };

  const preview = el('pre', { class: 'prompt-text', id: 'prompt-text', tabindex: '0', 'aria-label': 'Instrucción para ChatGPT' });
  const referenceBox = el('div', { class: 'reference' });
  const steps = el('ol', { class: 'steps prompt-steps' });

  const update = (changes) => {
    Object.assign(options, changes);
    savePromptOptions({ ...options });
    draw();
  };

  const optionsCard = el('section', { class: 'card prompt-options', 'aria-label': 'Opciones' });
  function draw() {
    const type = PROMPT_TYPES.find((t) => t.id === options.type) || PROMPT_TYPES[0];
    const uses = (key) => type.uses.includes(key);
    // «Solo el fondo» se pide sin adjuntar fotos: si no, ChatGPT edita la foto en vez de crear la escena.
    const withPhoto = type.id !== 'fondo';
    preview.textContent = buildPrompt(options, state.brand, PALETTE);
    optionsCard.replaceChildren(
      choice('Tipo de instrucción', PROMPT_TYPES, type.id, (id) => update({ type: id }), type.help),
      uses('goal') ? choice('¿Qué querés lograr?', GOALS, options.goal, (id) => update({ goal: id })) : null,
      uses('format') ? choice('Formato', PROMPT_FORMATS, options.format, (id) => update({ format: id })) : null,
      uses('light') ? choice('Luz', PROMPT_LIGHTS, options.light, (id) => update({ light: id })) : null,
      uses('scene') ? choice('Escenario', SCENES, options.scene, (id) => update({ scene: id })) : null,
      uses('textSpace') ? choice('Espacio para texto', TEXT_SPACES, options.textSpace, (id) => update({ textSpace: id })) : null,
      withPhoto ? referencePicker(options, (id) => update({ referenceId: id })) : null);
    if (withPhoto) {
      const photo = pickReference(options);
      if (photo && reference.id !== photo.id) prepareReference(photo.id, referenceBox, options);
      else drawReference(referenceBox, options);
    } else {
      referenceBox.replaceChildren();
    }
    steps.replaceChildren(...(withPhoto
      ? [
        el('li', {}, 'Copiá la instrucción.'),
        el('li', {}, 'Guardá la foto de referencia, o arrastrala a ChatGPT con la pantalla dividida.'),
        el('li', {}, 'En ChatGPT, adjuntá la foto y pegá la instrucción.'),
      ]
      : [
        // En un chat donde ya hubo fotos, ChatGPT las vuelve a usar aunque no se adjunten.
        el('li', {}, 'Abrí un chat nuevo en ChatGPT. Si podés, que sea temporal.'),
        el('li', {}, 'Copiá la instrucción y pegala sin adjuntar ninguna foto.'),
        el('li', {}, 'Guardá la imagen que te dé y usala de fondo en el ', el('a', { href: '#editor' }, 'Editor'), '.'),
      ]));
  }
  draw();

  root.append(
    el('header', { class: 'page-head' },
      el('div', {},
        el('span', { class: 'eyebrow eyebrow-sage' }, 'Instrucciones para ChatGPT'),
        el('h1', { class: 'display page-title' }, 'Tu esfera, ', el('em', {}, 'siempre igual')),
        el('p', { class: 'hint' }, 'Elegí las opciones y copiá la instrucción. Las reglas del producto salen de tu ficha «Lo que la IA no toca».'))),
    el('div', { class: 'prompt-layout' },
      optionsCard,
      el('section', { class: 'card prompt-result', 'aria-labelledby': 'result-title' },
        el('div', { class: 'card-head' },
          el('h2', { id: 'result-title', class: 'display card-title' }, 'Tu instrucción'),
          el('a', { href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener', class: 'btn btn-quiet btn-small' }, 'Abrir ChatGPT')),
        preview,
        el('div', { class: 'edit-actions' },
          el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
            const ok = await copyText(preview.textContent);
            if (ok) toast('Instrucción copiada. Pegala en ChatGPT.');
            else {
              selectText(preview);
              toast('No se pudo copiar solo. Quedó seleccionada: tocá «Copiar».');
            }
          } }, icon('copiar', 18), 'Copiar instrucción')),
        referenceBox,
        steps)));
}

function choice(name, list, current, onPick, help) {
  return el('fieldset', { class: 'field' },
    el('legend', { class: 'field-label' }, name),
    el('div', { class: 'chips', role: 'radiogroup', 'aria-label': name },
      list.map((item) => el('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(item.id === current), onclick: () => onPick(item.id),
      }, item.label))),
    help ? el('p', { class: 'hint field-help' }, help) : null);
}

/** La foto elegida, o una de frente si no hay ninguna elegida. */
function pickReference(options) {
  const photos = state.photos;
  return photos.find((p) => p.id === options.referenceId)
    || photos.find((p) => p.category === 'frente')
    || photos[0]
    || null;
}

function referencePicker(options, onPick) {
  const photos = state.photos;
  const current = pickReference(options);
  if (!photos.length) {
    return el('div', { class: 'field' },
      el('span', { class: 'field-label' }, 'Foto de referencia'),
      el('p', { class: 'hint' }, 'Todavía no hay fotos. ', el('a', { href: '#originales' }, 'Cargá tus fotos reales'), ' para elegir una de referencia.'));
  }
  const ordered = [...photos].sort((a, b) => order(a) - order(b));
  return el('fieldset', { class: 'field' },
    el('legend', { class: 'field-label' }, 'Foto de referencia'),
    el('div', { class: 'ref-strip', role: 'radiogroup', 'aria-label': 'Foto de referencia' },
      ordered.map((photo) => {
        const img = el('img', { alt: '', loading: 'lazy' });
        thumbUrl(photo).then((url) => { if (url) img.src = url; });
        const category = CATEGORIES.find((c) => c.id === photo.category);
        return el('button', {
          type: 'button', class: 'ref-thumb', role: 'radio',
          'aria-checked': String(current && current.id === photo.id),
          'aria-label': `${photo.name}${category && category.id !== 'sin' ? `, ${category.label}` : ''}`,
          onclick: () => onPick(photo.id),
        }, img);
      })));
}

function order(photo) {
  return ['frente', 'uso', 'recorte', 'trasera', 'sin'].indexOf(photo.category);
}

async function prepareReference(id, box, options) {
  if (reference.id === id && reference.file) { drawReference(box, options); return; }
  const photo = state.photos.find((p) => p.id === id);
  if (reference.url) URL.revokeObjectURL(reference.url);
  Object.assign(reference, { id, file: null, url: null });
  if (!photo) { drawReference(box, options); return; }
  const file = await originalFile(photo);
  if (reference.id !== id) return; // se eligió otra mientras cargaba
  reference.file = file;
  reference.url = file ? URL.createObjectURL(file) : null;
  drawReference(box, options);
}

function drawReference(box, options) {
  const photo = pickReference(options);
  if (!photo) { box.replaceChildren(); return; }
  const ready = reference.id === photo.id && reference.file;
  box.replaceChildren(
    el('div', { class: 'reference-image' },
      ready ? el('img', { src: reference.url, alt: `Foto de referencia: ${photo.name}`, draggable: 'true' }) : el('span', { class: 'hint' }, 'Preparando la foto…')),
    el('div', { class: 'reference-info' },
      el('span', { class: 'field-label' }, 'Foto de referencia'),
      el('span', {}, photo.name),
      el('span', { class: 'hint' }, 'Es tu original, sin cambios.'),
      el('button', {
        type: 'button', class: 'btn btn-quiet btn-small', disabled: !ready,
        onclick: async () => {
          const result = await saveFile(reference.file);
          if (result === 'downloaded') toast('Foto descargada');
        },
      }, icon('compartir', 16), 'Guardar foto de referencia')));
}

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
