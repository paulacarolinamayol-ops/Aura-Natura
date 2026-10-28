// Pantalla "Mi marca": paleta, tipografías, logo, ficha del producto y voz.

import { el, icon, toast, confirmDialog, copyText } from '../ui.js';
import { PALETTE, FONTS } from '../brand.js';
import { state, saveBrand, setLogo, removeLogo, thumbUrl } from '../store.js';

let editing = null; // 'rules' | 'voice' | null

export function renderMarca(root) {
  const hero = el('section', { class: 'hero' },
    el('div', { class: 'hero-photo', id: 'hero-photo' }),
    el('div', { class: 'hero-card' },
      el('span', { class: 'eyebrow eyebrow-gold' }, 'Mi marca'),
      el('h1', { class: 'display' }, 'La luz de un ', el('em', {}, 'recuerdo')),
      el('p', {}, 'Tu identidad en un solo lugar. Todo lo que diseñes parte de acá.')));
  fillHeroPhoto(hero.querySelector('#hero-photo'));

  root.append(
    hero,
    el('div', { class: 'brand-grid' },
      paletteCard(),
      typeCard(),
      rulesCard(),
      logoCard(),
      voiceCard()));
}

async function fillHeroPhoto(box) {
  const photo = state.photos.find((p) => p.category === 'uso') || state.photos[0];
  if (!photo) {
    box.append(el('div', { class: 'hero-orb', 'aria-hidden': 'true' }, el('span', { class: 'hero-orb-glass' }), el('span', { class: 'hero-orb-base' })));
    return;
  }
  const url = await thumbUrl(photo);
  if (url) box.append(el('img', { src: url, alt: photo.name }));
}

function paletteCard() {
  return el('section', { class: 'card card-palette', 'aria-labelledby': 'palette-title' },
    el('div', { class: 'card-head' },
      el('h2', { id: 'palette-title', class: 'display card-title' }, 'Paleta'),
      el('span', { class: 'hint' }, 'Tocá un color para copiar su código')),
    el('div', { class: 'swatches' },
      PALETTE.map((color) => el('button', {
        type: 'button',
        class: 'swatch',
        'aria-label': `Copiar ${color.name}, ${color.hex}`,
        onclick: async () => {
          const ok = await copyText(color.hex);
          toast(ok ? `${color.name} copiado: ${color.hex}` : `No se pudo copiar. El código es ${color.hex}`);
        },
      },
      el('span', { class: 'swatch-chip', style: `background:${color.hex}` }),
      el('span', { class: 'swatch-name' }, color.name),
      el('span', { class: 'swatch-hex' }, color.hex),
      el('span', { class: 'swatch-use' }, color.use)))));
}

function typeCard() {
  return el('section', { class: 'card card-type', 'aria-labelledby': 'type-title' },
    el('h2', { id: 'type-title', class: 'display card-title' }, 'Tipografía'),
    el('div', { class: 'type-specimen' },
      el('span', { class: 'type-big', 'aria-hidden': 'true' }, 'A', el('em', {}, 'a')),
      el('div', { class: 'type-list' },
        FONTS.map((font) => el('div', { class: 'type-row' },
          el('span', { style: `font-family:${font.family}; font-size: 17px` }, font.name),
          el('span', { class: 'hint' }, font.role))),
        el('span', { class: 'hint' }, 'Gratuitas · licencia SIL OFL 1.1'))));
}

function rulesCard() {
  const isEditing = editing === 'rules';
  const card = el('section', { class: 'card card-rules', 'aria-labelledby': 'rules-title' });
  const head = el('div', { class: 'card-head' },
    el('h2', { id: 'rules-title', class: 'display card-title' }, 'Lo que la IA no toca'));
  card.append(head);

  if (!isEditing) {
    head.append(el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => startEditing('rules') }, icon('lapiz', 16), 'Editar ficha'));
    card.append(
      el('p', { class: 'hint' }, 'Así es el producto real. Estas reglas van a armar las instrucciones para ChatGPT en la Etapa 2.'),
      el('ul', { class: 'rules' },
        state.brand.rules.map((rule) => el('li', {},
          icon('check', 16),
          el('span', {}, el('b', {}, `${rule.part}: `), rule.text)))));
    return card;
  }

  const draft = state.brand.rules.map((rule) => ({ ...rule }));
  const list = el('div', { class: 'edit-list' });
  const drawList = () => {
    list.replaceChildren(...draft.map((rule, index) => el('div', { class: 'edit-row' },
      el('label', { class: 'sr-only', for: `rule-part-${index}` }, 'Parte'),
      el('input', { id: `rule-part-${index}`, class: 'input input-part', value: rule.part, placeholder: 'Parte', oninput: (e) => { rule.part = e.target.value; } }),
      el('label', { class: 'sr-only', for: `rule-text-${index}` }, 'Cómo es'),
      el('textarea', { id: `rule-text-${index}`, class: 'input', rows: 2, placeholder: 'Cómo es en la realidad', oninput: (e) => { rule.text = e.target.value; } }, rule.text),
      el('button', { type: 'button', class: 'btn-icon', 'aria-label': `Quitar ${rule.part || 'esta regla'}`, onclick: () => { draft.splice(index, 1); drawList(); } }, icon('cerrar', 18)))));
  };
  drawList();
  card.append(list, el('div', { class: 'edit-actions' },
    el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { draft.push({ part: '', text: '' }); drawList(); list.querySelector('.edit-row:last-child input').focus(); } }, icon('mas', 16), 'Agregar regla'),
    el('span', { class: 'spacer' }),
    el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => stopEditing() }, 'Cancelar'),
    el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
      const rules = draft.map((r) => ({ part: r.part.trim(), text: r.text.trim() })).filter((r) => r.part || r.text);
      editing = null;
      await saveBrand({ ...state.brand, rules });
      toast('Ficha guardada');
    } }, 'Guardar')));
  return card;
}

function voiceCard() {
  const isEditing = editing === 'voice';
  const card = el('section', { class: 'card card-voice', 'aria-labelledby': 'voice-title' });
  const head = el('div', { class: 'card-head' },
    el('h2', { id: 'voice-title', class: 'display card-title' }, 'Voz de marca'));
  card.append(head);

  if (!isEditing) {
    head.append(el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => startEditing('voice') }, icon('lapiz', 16), 'Editar voz'));
    card.append(el('div', { class: 'voice' },
      el('div', { class: 'voice-col voice-yes' }, el('b', {}, 'Así sí'), el('ul', {}, state.brand.voiceYes.map((t) => el('li', {}, t)))),
      el('div', { class: 'voice-col voice-no' }, el('b', {}, 'Así no'), el('ul', {}, state.brand.voiceNo.map((t) => el('li', {}, t))))));
    return card;
  }

  const yes = el('textarea', { id: 'voice-yes', class: 'input', rows: 5 }, state.brand.voiceYes.join('\n'));
  const no = el('textarea', { id: 'voice-no', class: 'input', rows: 5 }, state.brand.voiceNo.join('\n'));
  const lines = (text) => text.split('\n').map((t) => t.trim()).filter(Boolean);
  card.append(
    el('p', { class: 'hint' }, 'Un ejemplo por línea.'),
    el('div', { class: 'voice' },
      el('div', { class: 'voice-col' }, el('label', { for: 'voice-yes' }, el('b', {}, 'Así sí')), yes),
      el('div', { class: 'voice-col' }, el('label', { for: 'voice-no' }, el('b', {}, 'Así no')), no)),
    el('div', { class: 'edit-actions' },
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => stopEditing() }, 'Cancelar'),
      el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
        editing = null;
        await saveBrand({ ...state.brand, voiceYes: lines(yes.value), voiceNo: lines(no.value) });
        toast('Voz guardada');
      } }, 'Guardar')));
  return card;
}

function logoCard() {
  const input = el('input', { type: 'file', accept: 'image/png,image/svg+xml,image/jpeg,image/webp', class: 'sr-only', id: 'logo-input', onchange: async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      await setLogo(file);
      toast('Logo guardado');
    } catch (error) {
      toast(`No se pudo guardar el logo: ${error.message}`);
    }
  } });

  if (!state.logoUrl) {
    return el('section', { class: 'card card-logo card-dashed', 'aria-labelledby': 'logo-title' },
      el('h2', { id: 'logo-title', class: 'wordmark' }, 'AURA NATURA'),
      el('p', { class: 'hint' }, 'Todavía no cargaste tu logo. Ideal: PNG con fondo transparente o SVG.'),
      input,
      el('label', { for: 'logo-input', class: 'btn btn-dark' }, 'Subir logo'));
  }

  return el('section', { class: 'card card-logo', 'aria-labelledby': 'logo-title' },
    el('h2', { id: 'logo-title', class: 'display card-title' }, 'Logo'),
    el('div', { class: 'logo-preview' }, el('img', { src: state.logoUrl, alt: 'Logo de Aura Natura' })),
    input,
    el('div', { class: 'edit-actions' },
      el('label', { for: 'logo-input', class: 'btn btn-quiet btn-small' }, 'Reemplazar'),
      el('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: async () => {
        const ok = await confirmDialog({
          title: '¿Quitar el logo?',
          body: 'Se borra de la app. Si lo tenés guardado en otro lado, lo podés volver a subir.',
          confirmLabel: 'Quitar logo',
          danger: true,
        });
        if (ok) { await removeLogo(); toast('Logo quitado'); }
      } }, 'Quitar')));
}

function startEditing(section) {
  editing = section;
  window.dispatchEvent(new Event('aura:redraw'));
}

function stopEditing() {
  editing = null;
  window.dispatchEvent(new Event('aura:redraw'));
}
