// Pruebas del armado de instrucciones para ChatGPT.
// Ejecutar: node --test tests/prompts.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, defaultPromptOptions } from '../js/prompts.js';
import { PALETTE, defaultBrand } from '../js/brand.js';

const brand = defaultBrand();

test('«Retoque» mantiene la escena y protege el producto con las reglas de la ficha', () => {
  const text = buildPrompt(defaultPromptOptions(), brand, PALETTE);
  assert.match(text, /^Retocá la foto adjunta sin cambiar la escena\./);
  assert.match(text, /los mismos objetos en el mismo lugar/);
  assert.match(text, /Qué NO cambiar \(obligatorio\):/);
  for (const rule of brand.rules) assert.ok(text.includes(`- ${rule.part}: ${rule.text}`), `falta la regla ${rule.part}`);
  assert.match(text, /1080 × 1350 px/);
  assert.ok(!text.includes('cámaras de fotos analógicas'), 'el retoque no debe pedir un escenario');
});

test('la pantalla se pide realista en los tipos que usan la foto', () => {
  for (const type of ['retoque', 'escenario']) {
    const text = buildPrompt({ ...defaultPromptOptions(), type }, brand, PALETTE);
    assert.match(text, /No la hagas más nítida ni le subas los colores o el brillo/, type);
  }
});

test('«Cambiar el escenario» reemplaza todo el fondo', () => {
  const text = buildPrompt({ ...defaultPromptOptions(), type: 'escenario' }, brand, PALETTE);
  assert.match(text, /reemplazá TODO el fondo/);
  assert.match(text, /No conserves nada del fondo original/);
  assert.match(text, /cámaras de fotos analógicas/);
  assert.match(text, /luz cálida de lámpara/);
  assert.match(text, /tercio de arriba/);
  assert.match(text, /#596B53/);
  for (const rule of brand.rules) assert.ok(text.includes(`- ${rule.part}: ${rule.text}`), `falta la regla ${rule.part}`);
});

test('las opciones guardadas como «Mejorar una foto real» pasan a «Cambiar el escenario»', () => {
  const text = buildPrompt({ ...defaultPromptOptions(), type: 'mejorar' }, brand, PALETTE);
  assert.match(text, /reemplazá TODO el fondo/);
});

test('las reglas siguen a la ficha editada', () => {
  const edited = { ...brand, rules: [{ part: 'Cable', text: 'USB-C negro, de 1 metro.' }] };
  const text = buildPrompt(defaultPromptOptions(), edited, PALETTE);
  assert.ok(text.includes('- Cable: USB-C negro, de 1 metro.'));
  assert.ok(!text.includes('Correa:'));
});

test('«Solo el fondo» pide una imagen nueva sin el producto ni fotos adjuntas', () => {
  const text = buildPrompt({ ...defaultPromptOptions(), type: 'fondo', format: '9x16', light: 'dia', scene: 'caja-de-regalo', textSpace: 'ninguno' }, brand, PALETTE);
  assert.match(text, /^Generá una imagen nueva desde cero\. No edites ninguna foto\./);
  assert.match(text, /NO tiene que incluir la esfera/);
  assert.ok(!text.includes('adjunt'), 'no debe hablar de fotos adjuntas');
  assert.ok(!text.includes('Qué NO cambiar'));
  assert.match(text, /1080 × 1920 px/);
  assert.match(text, /luz natural cálida de día/);
  assert.match(text, /caja de regalo abierta/);
  assert.match(text, /lugar vacío en el centro/);
  assert.ok(!text.includes('tercio'), 'sin espacio para texto no debe pedir un tercio libre');
});

test('opciones desconocidas usan la primera opción, sin romperse', () => {
  const text = buildPrompt({ type: 'x', goal: 'x', format: 'x', light: 'x', scene: 'x', textSpace: 'x' }, brand, PALETTE);
  assert.match(text, /^Retocá la foto adjunta/);
  assert.ok(!text.includes('undefined'));
});
