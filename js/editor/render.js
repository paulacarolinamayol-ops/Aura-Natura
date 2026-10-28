// Dibujo de un diseño del Editor.
// La misma función dibuja en pantalla y en el PNG exportado, así lo que se ve es lo que se exporta.
// Todas las medidas están en píxeles del formato final (1080 de ancho).

export const DESIGN_FORMATS = [
  { id: '4x5', label: 'Publicación 4:5', width: 1080, height: 1350 },
  { id: '9x16', label: 'Historia 9:16', width: 1080, height: 1920 },
  { id: '1x1', label: 'Cuadrado 1:1', width: 1080, height: 1080 },
];

export const TEXT_FONTS = [
  { id: 'display', label: 'Fraunces', family: 'Fraunces', weight: 400 },
  { id: 'body', label: 'Manrope', family: 'Manrope', weight: 600 },
];

export function formatSize(formatId) {
  return DESIGN_FORMATS.find((f) => f.id === formatId) || DESIGN_FORMATS[0];
}

const LINE_HEIGHT = 1.08;

function fontFor(layer, accent) {
  const font = TEXT_FONTS.find((f) => f.id === layer.font) || TEXT_FONTS[0];
  return `${accent ? 'italic ' : ''}${font.weight} ${layer.size}px ${font.family}, Georgia, serif`;
}

/** Palabras del texto, conservando los saltos de línea que escribió la persona. */
export function textWords(text) {
  const words = [];
  for (const [lineIndex, line] of String(text || '').split('\n').entries()) {
    line.split(/\s+/).filter(Boolean).forEach((word, i) => words.push({ word, newLine: lineIndex > 0 && i === 0 }));
  }
  return words;
}

/**
 * Reparte el texto en renglones dentro del ancho de la caja.
 * Devuelve { lines: [[{ word, accent, width }]], height }.
 */
export function layoutText(ctx, layer) {
  const accents = new Set(layer.accents || []);
  const words = textWords(layer.text).map((w, i) => {
    ctx.font = fontFor(layer, accents.has(i));
    return { ...w, accent: accents.has(i), width: ctx.measureText(w.word).width };
  });
  ctx.font = fontFor(layer, false);
  const space = ctx.measureText(' ').width;
  const lines = [];
  let line = [];
  let lineWidth = 0;
  for (const word of words) {
    const extra = line.length ? space + word.width : word.width;
    if (line.length && (word.newLine || lineWidth + extra > layer.width)) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    lineWidth += line.length ? space + word.width : word.width;
    line.push(word);
  }
  if (line.length) lines.push(line);
  return { lines, space, height: Math.max(1, lines.length) * layer.size * LINE_HEIGHT };
}

/** Rectángulo que ocupa una capa: { x, y, w, h } (arriba a la izquierda). */
export function layerBounds(ctx, layer) {
  if (layer.type === 'text') {
    const { height } = layoutText(ctx, layer);
    return { x: layer.x, y: layer.y, w: layer.width, h: height };
  }
  const h = layer.width * (layer.aspect || 1);
  return { x: layer.x - layer.width / 2, y: layer.y - h / 2, w: layer.width, h };
}

function drawShadow(ctx, bounds) {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h * 0.985;
  const rx = bounds.w * 0.58;
  const ry = bounds.w * 0.09;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gradient.addColorStop(0, 'rgba(40, 25, 10, 0.55)');
  gradient.addColorStop(0.55, 'rgba(40, 25, 10, 0.22)');
  gradient.addColorStop(1, 'rgba(40, 25, 10, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawText(ctx, layer) {
  const { lines, space } = layoutText(ctx, layer);
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, index) => {
    const lineWidth = line.reduce((sum, w, i) => sum + w.width + (i ? space : 0), 0);
    let x = layer.x;
    if (layer.align === 'center') x += (layer.width - lineWidth) / 2;
    if (layer.align === 'right') x += layer.width - lineWidth;
    const baseline = layer.y + layer.size * (index * LINE_HEIGHT + 0.88);
    for (const word of line) {
      ctx.font = fontFor(layer, word.accent);
      ctx.fillStyle = word.accent ? layer.accentColor : layer.color;
      ctx.fillText(word.word, x, baseline);
      x += word.width + space;
    }
  });
}

/**
 * Dibuja el diseño.
 * images: Map clave de fuente → imagen dibujable (ImageBitmap). Si falta, se dibuja un aviso.
 * scale: tamaño en pantalla respecto del formato final.
 */
export function renderDesign(ctx, design, images, { scale = 1, background = '#E8DDCC' } = {}) {
  const size = formatSize(design.format);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size.width, size.height);
  for (const layer of design.layers) {
    if (layer.hidden) continue;
    if (layer.type === 'text') {
      drawText(ctx, layer);
      continue;
    }
    const bounds = layerBounds(ctx, layer);
    if (layer.shadow) drawShadow(ctx, bounds);
    const image = images.get(sourceKey(layer.source));
    if (image) {
      ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h);
    } else {
      ctx.fillStyle = 'rgba(48, 44, 38, 0.12)';
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
  }
  ctx.restore();
}

/** Clave única de la imagen que usa una capa. */
export function sourceKey(source) {
  if (!source) return '';
  if (source.kind === 'logo') return 'logo';
  return `${source.kind}:${source.id}`;
}

/** Ancho que hace que una imagen cubra todo el formato. */
export function coverWidth(aspect, formatId) {
  const size = formatSize(formatId);
  return Math.max(size.width, size.height / aspect);
}
