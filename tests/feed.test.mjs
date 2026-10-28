import test from 'node:test';
import assert from 'node:assert/strict';
import { findIssues, suggestOrder, countBy, toneFromLuminance, placeLabel, score } from '../js/feed/analysis.js';

const cell = (theme, tone, light = 'sin', planned = true) => ({ theme, tone, light, planned });

test('tono según el brillo', () => {
  assert.equal(toneFromLuminance(0.9), 'claro');
  assert.equal(toneFromLuminance(0.2), 'oscuro');
  assert.equal(toneFromLuminance(0.5), 'acento');
});

test('posición en la grilla', () => {
  assert.equal(placeLabel(0), 'fila 1, columna 1');
  assert.equal(placeLabel(4), 'fila 2, columna 2');
});

test('avisa el mismo tema junto en fila y en columna, no en diagonal ni entre filas', () => {
  const cells = [
    cell('recuerdos', 'claro'), cell('recuerdos', 'oscuro'), cell('regalo', 'acento'),
    cell('oferta', 'claro'), cell('historias', 'oscuro'), cell('recuerdos', 'acento'),
  ];
  const themes = findIssues(cells).filter((i) => i.type === 'theme');
  assert.deepEqual(themes.map((i) => i.cells), [[0, 1]]);
  assert.match(themes[0].message, /Recuerdos.*fila 1, columna 1 y fila 1, columna 2/);
  // La 2 (fin de fila 1) y la 3 (inicio de fila 2) no están juntas en la grilla.
  const wrap = [cell('a', 'claro'), cell('b', 'oscuro'), cell('c', 'claro'), cell('c', 'oscuro')];
  assert.equal(findIssues(wrap).filter((i) => i.type === 'theme').length, 0);
  const column = [cell('x', 'claro'), cell('a', 'oscuro'), cell('b', 'claro'), cell('x', 'oscuro')];
  assert.deepEqual(findIssues(column).filter((i) => i.type === 'theme').map((i) => i.cells), [[0, 3]]);
});

test('avisa tres del mismo tono en una fila o columna', () => {
  const row = [cell('a', 'oscuro'), cell('b', 'oscuro'), cell('c', 'oscuro')];
  assert.match(findIssues(row).find((i) => i.type === 'tone').message, /Tres oscuras seguidas en la fila 1/);
  const column = [
    cell('a', 'claro'), cell('b', 'oscuro'), cell('c', 'acento'),
    cell('d', 'claro'), cell('e', 'acento'), cell('f', 'oscuro'),
    cell('g', 'claro'), cell('h', 'oscuro'), cell('i', 'acento'),
  ];
  const tones = findIssues(column).filter((i) => i.type === 'tone');
  assert.deepEqual(tones.map((i) => i.cells), [[0, 3, 6]]);
  assert.match(tones[0].message, /columna 1 \(filas 1 a 3\)/);
});

test('avisa ofertas a menos de tres lugares', () => {
  const close = [cell('oferta', 'claro'), cell('a', 'oscuro'), cell('oferta', 'acento')];
  assert.equal(findIssues(close).filter((i) => i.type === 'offer').length, 1);
  const far = [cell('oferta', 'claro'), cell('a', 'oscuro'), cell('b', 'acento'), cell('oferta', 'claro')];
  assert.equal(findIssues(far).filter((i) => i.type === 'offer').length, 0);
});

test('avisa tres seguidas con la misma luz, pero no si está sin definir', () => {
  const lamps = [cell('a', 'claro', 'lampara'), cell('b', 'oscuro', 'lampara'), cell('c', 'acento', 'lampara')];
  assert.match(findIssues(lamps).find((i) => i.type === 'light').message, /luz de lámpara/);
  const unknown = [cell('a', 'claro'), cell('b', 'oscuro'), cell('c', 'acento')];
  assert.equal(findIssues(unknown).filter((i) => i.type === 'light').length, 0);
});

test('no avisa lo que es solo entre publicaciones ya publicadas', () => {
  const cells = [
    cell('a', 'claro'), cell('b', 'oscuro'), cell('c', 'acento'),
    cell('oferta', 'claro', 'sin', false), cell('oferta', 'claro', 'sin', false), cell('d', 'claro', 'sin', false),
  ];
  assert.equal(findIssues(cells).length, 0);
  assert.ok(findIssues(cells, { all: true }).length > 0);
});

test('cuenta por tema, con lo sin definir aparte', () => {
  assert.deepEqual(countBy([cell('oferta'), cell('oferta'), cell(null)], 'theme'), { oferta: 2, sin: 1 });
});

test('sugerir orden mejora la grilla y solo mueve las planeadas', () => {
  const cells = [
    cell('oferta', 'oscuro'), cell('oferta', 'oscuro'), cell('recuerdos', 'oscuro'),
    cell('recuerdos', 'claro'), cell('regalo', 'claro'), cell('regalo', 'claro'),
    cell('historias', 'acento', 'sin', false), cell('como-funciona', 'claro', 'sin', false), cell('recuerdos', 'acento', 'sin', false),
  ];
  const { order, before, after } = suggestOrder(cells, 6);
  assert.ok(after < before);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5]);
  const arranged = [...order.map((i) => cells[i]), ...cells.slice(6)];
  assert.equal(score(arranged), after);
  assert.deepEqual(suggestOrder(cells, 6), { order, before, after }, 'siempre da la misma sugerencia');
});

test('sugerir orden deja todo igual si ya está equilibrado', () => {
  const cells = [cell('recuerdos', 'claro'), cell('regalo', 'oscuro'), cell('historias', 'acento')];
  assert.deepEqual(suggestOrder(cells, 3), { order: [0, 1, 2], before: 0, after: 0 });
});
