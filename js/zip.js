// Archivos ZIP sin compresión (método "store").
// Las fotos ya vienen comprimidas, así que comprimirlas de nuevo no ahorra espacio.
// Un ZIP común tiene una ventaja: el respaldo se puede abrir en la app Archivos
// del iPad y ver las fotos aunque Estudio Aura no esté instalado.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const MAX_SIZE = 0xffffffff;
const UTF8_FLAG = 0x0800;

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Crea un ZIP a partir de una lista de { name, data } donde data es Blob o texto.
 * Devuelve un Blob. onProgress(hechos, total) es opcional.
 */
export async function createZip(entries, onProgress) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const blob = entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(bytes);
    const name = encoder.encode(entry.name);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, UTF8_FLAG, true);
    record.setUint16(10, 0, true);
    record.setUint16(12, time, true);
    record.setUint16(14, day, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, bytes.length, true);
    record.setUint32(24, bytes.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);

    parts.push(local, name, blob);
    central.push(record, name);
    offset += 30 + name.length + bytes.length;
    if (offset > MAX_SIZE) throw new Error('El respaldo supera los 4 GB, el máximo de este formato.');
    if (onProgress) onProgress(i + 1, entries.length);
  }

  const centralSize = central.reduce((sum, p) => sum + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/**
 * Lee un ZIP sin compresión. Devuelve un Map nombre → { blob, crc }.
 * Los blobs son porciones del archivo original: no se copian a memoria hasta usarlos.
 */
export async function readZip(file) {
  const tailSize = Math.min(file.size, 22 + 0xffff);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let endPos = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { endPos = i; break; }
  }
  if (endPos < 0) throw new Error('El archivo no es un respaldo válido.');

  const count = tail.getUint16(endPos + 10, true);
  const centralSize = tail.getUint32(endPos + 12, true);
  const centralOffset = tail.getUint32(endPos + 16, true);
  const dir = new DataView(await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
  const decoder = new TextDecoder();
  const result = new Map();

  let pos = 0;
  for (let i = 0; i < count; i++) {
    if (dir.getUint32(pos, true) !== 0x02014b50) throw new Error('El respaldo está dañado.');
    const method = dir.getUint16(pos + 10, true);
    const crc = dir.getUint32(pos + 16, true);
    const size = dir.getUint32(pos + 20, true);
    const nameLength = dir.getUint16(pos + 28, true);
    const extraLength = dir.getUint16(pos + 30, true);
    const commentLength = dir.getUint16(pos + 32, true);
    const localOffset = dir.getUint32(pos + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + pos + 46, nameLength));
    if (method !== 0) throw new Error('Este respaldo no fue creado por Estudio Aura.');

    const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
    if (local.getUint32(0, true) !== 0x04034b50) throw new Error('El respaldo está dañado.');
    const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    result.set(name, { blob: file.slice(start, start + size), crc });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

/** Comprueba que el contenido de una entrada no se haya dañado. */
export async function verifyEntry(entry) {
  return crc32(new Uint8Array(await entry.blob.arrayBuffer())) === entry.crc;
}
