// Revisión de equilibrio del feed. Funciones puras: no tocan la pantalla ni la base de datos.
//
// Una grilla es una lista de celdas en el orden en que se ven en Instagram:
// la primera es la de arriba a la izquierda (la más nueva). Cada celda tiene
// { theme, tone, light, planned }. theme, tone o light pueden faltar (sin definir).

export const COLUMNS = 3;

/** Tono a partir del brillo promedio (0 = negro, 1 = blanco). */
export function toneFromLuminance(luminance) {
  if (luminance > 0.7) return 'claro';
  if (luminance < 0.36) return 'oscuro';
  return 'acento';
}

export function position(index) {
  return { row: Math.floor(index / COLUMNS) + 1, column: (index % COLUMNS) + 1 };
}

export function placeLabel(index) {
  const { row, column } = position(index);
  return `fila ${row}, columna ${column}`;
}

const THEME_NAMES = {
  recuerdos: 'Recuerdos',
  regalo: 'Ideas de regalo',
  'como-funciona': 'Cómo funciona',
  historias: 'Historias reales',
  oferta: 'Oferta',
};
const TONE_PLURAL = { claro: 'claras', oscuro: 'oscuras', acento: 'de acento' };
const LIGHT_NAMES = { dia: 'de día', lampara: 'de lámpara' };

// Peso de cada aviso para «Sugerir orden»: lo más visible en la grilla pesa más.
const WEIGHTS = { theme: 3, tone: 2, offer: 3, light: 1 };

const defined = (value) => value && value !== 'sin';

/** Pares de celdas vecinas: al lado en la misma fila o una arriba de la otra. */
function neighborPairs(count) {
  const pairs = [];
  for (let i = 0; i < count; i++) {
    if (i % COLUMNS < COLUMNS - 1 && i + 1 < count) pairs.push([i, i + 1]);
    if (i + COLUMNS < count) pairs.push([i, i + COLUMNS]);
  }
  return pairs;
}

/** Tríos en línea: una fila completa o tres seguidas en una columna. */
function lineTriples(count) {
  const triples = [];
  for (let i = 0; i < count; i++) {
    if (i % COLUMNS === 0 && i + 2 < count) triples.push({ cells: [i, i + 1, i + 2], where: `en la fila ${position(i).row}` });
    if (i + 2 * COLUMNS < count) {
      const { row, column } = position(i);
      triples.push({ cells: [i, i + COLUMNS, i + 2 * COLUMNS], where: `en la columna ${column} (filas ${row} a ${row + 2})` });
    }
  }
  return triples;
}

/**
 * Devuelve los avisos de la grilla. Cada aviso: { type, cells, message }.
 * Solo se avisa lo que involucra al menos una publicación planeada:
 * lo ya publicado no se puede mover.
 */
export function findIssues(cells, { all = false } = {}) {
  const issues = [];
  const involvesPlanned = (indices) => all || indices.some((i) => cells[i].planned);
  const places = (indices) => {
    const labels = indices.map(placeLabel);
    return `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
  };

  for (const [a, b] of neighborPairs(cells.length)) {
    const theme = cells[a].theme;
    if (defined(theme) && theme === cells[b].theme && involvesPlanned([a, b])) {
      issues.push({ type: 'theme', cells: [a, b], message: `Dos de «${THEME_NAMES[theme] || theme}» juntas: ${places([a, b])}.` });
    }
  }

  for (const { cells: triple, where } of lineTriples(cells.length)) {
    const tone = cells[triple[0]].tone;
    if (defined(tone) && triple.every((i) => cells[i].tone === tone) && involvesPlanned(triple)) {
      issues.push({ type: 'tone', cells: triple, message: `Tres ${TONE_PLURAL[tone] || tone} seguidas ${where}.` });
    }
  }

  const offers = cells.map((cell, i) => (cell.theme === 'oferta' ? i : -1)).filter((i) => i >= 0);
  for (let k = 1; k < offers.length; k++) {
    const pair = [offers[k - 1], offers[k]];
    if (pair[1] - pair[0] < 3 && involvesPlanned(pair)) {
      issues.push({ type: 'offer', cells: pair, message: `Dos ofertas muy cerca: ${places(pair)}. Dejá al menos dos publicaciones entre una y otra.` });
    }
  }

  for (let i = 0; i + 2 < cells.length; i++) {
    const run = [i, i + 1, i + 2];
    const light = cells[i].light;
    if (defined(light) && run.every((j) => cells[j].light === light) && involvesPlanned(run)) {
      issues.push({ type: 'light', cells: run, message: `Tres seguidas con luz ${LIGHT_NAMES[light] || light}: ${places(run)}.` });
    }
  }

  return issues;
}

/** Puntaje de una grilla: cuanto más bajo, más equilibrada. */
export function score(cells) {
  return findIssues(cells, { all: true }).reduce((sum, issue) => sum + WEIGHTS[issue.type], 0);
}

/** Cuántas celdas hay de cada valor de key (por ejemplo, 'theme'). Lo sin definir va en 'sin'. */
export function countBy(cells, key) {
  const counts = {};
  for (const cell of cells) {
    const value = defined(cell[key]) ? cell[key] : 'sin';
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

// Generador de números al azar con semilla: la misma grilla da siempre la misma sugerencia.
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function improve(cells, order, planned) {
  const arrange = (o) => [...o.map((i) => cells[i]), ...cells.slice(planned)];
  let best = score(arrange(order));
  for (;;) {
    let move = null;
    for (let a = 0; a < planned; a++) {
      for (let b = a + 1; b < planned; b++) {
        const next = [...order];
        [next[a], next[b]] = [next[b], next[a]];
        const value = score(arrange(next));
        if (value < best) { best = value; move = next; }
      }
    }
    if (!move) return { order, value: best };
    order = move;
  }
}

/**
 * Busca un orden más equilibrado moviendo solo las planeadas (las primeras `planned` celdas).
 * Devuelve { order, before, after }: order es la lista de índices de las planeadas en su nuevo lugar.
 * Si no encuentra nada mejor, deja el orden como está.
 */
export function suggestOrder(cells, planned, { restarts = planned > 20 ? 4 : 12 } = {}) {
  const identity = [...Array(planned).keys()];
  const before = score(cells);
  let best = improve(cells, identity, planned);
  const random = seededRandom(planned * 7919 + cells.length);
  for (let r = 0; r < restarts && best.value > 0 && planned > 2; r++) {
    const shuffled = [...identity];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const result = improve(cells, shuffled, planned);
    if (result.value < best.value) best = result;
  }
  return best.value < before ? { order: best.order, before, after: best.value } : { order: identity, before, after: before };
}
