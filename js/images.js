// Lectura de fotos: medidas y miniatura para la galería.
// El original nunca se modifica: la miniatura es un archivo aparte.

const THUMB_SIZE = 640;

/**
 * Devuelve { width, height, thumb } o null si el navegador no puede leer la imagen
 * (por ejemplo, un HEIC en una computadora). En ese caso el original se guarda igual.
 */
export async function describeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, THUMB_SIZE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#E8DDCC';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const thumb = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return { width, height, thumb };
}

const COVER_SIZE = 1080;

function drawScaled(source, width, height, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#E8DDCC';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

/** Toma un cuadro del video, cerca del primer segundo, como portada. */
async function videoFrame(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('No se pudo leer el video. Probá con una captura de pantalla de la portada.'));
      video.src = url;
    });
    const time = Math.min(1, (video.duration || 0) / 2);
    if (time > 0) {
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = time;
      });
    }
    return await drawScaled(video, video.videoWidth, video.videoHeight, COVER_SIZE);
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Portada para la Biblioteca: una imagen JPG de hasta 1080 px.
 * Acepta una imagen o un video (en ese caso usa un cuadro del video).
 * El archivo elegido no se guarda: solo la portada.
 */
export async function makeCover(file) {
  if (file.type.startsWith('video/')) return videoFrame(file);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se pudo leer la imagen.');
  }
  try {
    return await drawScaled(bitmap, bitmap.width, bitmap.height, COVER_SIZE);
  } finally {
    bitmap.close();
  }
}

/** true si la imagen tiene partes transparentes (por ejemplo, un recorte sin fondo). */
export async function hasTransparency(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return false;
  }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const { data } = context.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}
