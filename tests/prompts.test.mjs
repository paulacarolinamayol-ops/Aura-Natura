// Pruebas del armado de instrucciones para ChatGPT.
// Ejecutar: node --test tests/prompts.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, defaultPromptOptions } from '../js/prompts.js';
import { PALETTE, defaultBrand } from '../js/brand.js';

const brand = defaultBrand();

test('«Mejorar una foto real» protege el producto con las reglas de la ficha', () => {
  const text = buildPrompt(defaultPromptOptions(), brand, PALETTE);
  assert.match(text, /^Editá la foto adjunta\./);
  assert.match(text, /Qué NO cambiar \(obligatorio\):/);
  for (const rule of brand.rules) assert.ok(text.includes(`- ${rule.part}: ${rule.text}`), `falta la regla ${rule.part}`);
  assert.match(text, /luz cálida de lámpara/);
  assert.match(text, /cámaras de fotos analógicas/);
  assert.match(text, /tercio de arriba/);
  assert.match(text, /1080 × 1350 px/);
  assert.match(text, /#596B53/);
});

test('las reglas siguen a la ficha editada', () => {
  const edited = { ...brand, rules: [{ part: 'Cable', text: 'USB-C negro, de 1 metro.' }] };
  const text = buildPrompt(defaultPromptOptions(), edited, PALETTE);
  assert.ok(text.includes('- Cable: USB-C negro, de 1 metro.'));
  assert.ok(!text.includes('Correa:'));
});

test('«Solo el fondo» pide la escena sin el producto', () => {
  const text = buildPrompt({ ...defaultPromptOptions(), type: 'fondo', format: '9x16', light: 'dia', scene: 'caja-de-regalo', textSpace: 'ninguno' }, brand, PALETTE);
  assert.match(text, /NO tiene que incluir la esfera/);
  assert.ok(!text.includes('Editá la foto adjunta'));
  assert.ok(!text.includes('Qué NO cambiar'));
  assert.match(text, /1080 × 1920 px/);
  assert.match(text, /luz natural cálida de día/);
  assert.match(text, /caja de regalo abierta/);
  assert.match(text, /lugar vacío en el centro/);
  assert.ok(!text.includes('tercio'), 'sin espacio para texto no debe pedir un tercio libre');
});

test('opciones desconocidas usan la primera opción, sin romperse', () => {
  const text = buildPrompt({ type: 'mejorar', goal: 'x', format: 'x', light: 'x', scene: 'x', textSpace: 'x' }, brand, PALETTE);
  assert.match(text, /Editá la foto adjunta/);
  assert.ok(!text.includes('undefined'));
});
