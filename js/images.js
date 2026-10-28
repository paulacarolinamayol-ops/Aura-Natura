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
