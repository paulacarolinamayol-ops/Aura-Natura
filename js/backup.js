// Respaldo y restauración.
// El respaldo es un ZIP con: las fotos originales, sus miniaturas, el logo,
// las portadas de la Biblioteca, la ficha de marca y un archivo "manifest.json"
// que describe todo.
//
// Versión 2 agrega la Biblioteca. Un respaldo de versión 1 se puede restaurar igual.

import * as db from './db.js';
import { createZip, readZip, verifyEntry } from './zip.js';

const FORMAT = 'estudio-aura-respaldo';
const VERSION = 2;

function safeName(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'archivo';
}

function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `Estudio-Aura-respaldo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.zip`;
}

const README = `Respaldo de Estudio Aura

Para recuperar todo: abrí Estudio Aura, entrá en "Respaldo" y elegí "Restaurar desde un archivo".

Carpetas:
- originales: tus fotos tal como las cargaste, sin cambios.
- miniaturas: versiones chicas que usa la galería.
- logo: tu logo.
- portadas: las portadas de la Biblioteca.
- manifest.json: nombres, categorías y ficha de marca. No lo edites.
`;

/** Arma el respaldo completo. Devuelve un File listo para guardar. */
export async function buildBackup(onProgress) {
  const photos = await db.getAll('photos');
  const brand = await db.get('settings', 'brand');
  const logo = await db.get('blobs', 'logo');
  const pieces = await db.getAll('pieces');
  const entries = [{ name: 'LEEME.txt', data: README }];
  const manifest = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    brand: brand || null,
    logo: null,
    photos: [],
    pieces: [],
  };

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const original = await db.get('blobs', `orig:${photo.id}`);
    if (!original) continue;
    const prefix = String(i + 1).padStart(3, '0');
    const originalPath = `originales/${prefix}-${safeName(photo.fileName)}`;
    entries.push({ name: originalPath, data: original });
    const thumb = await db.get('blobs', `thumb:${photo.id}`);
    let thumbPath = null;
    if (thumb) {
      thumbPath = `miniaturas/${prefix}.jpg`;
      entries.push({ name: thumbPath, data: thumb });
    }
    manifest.photos.push({ ...photo, originalPath, thumbPath });
  }

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const cover = await db.get('blobs', `cover:${piece.id}`);
    let coverPath = null;
    if (cover) {
      coverPath = `portadas/${String(i + 1).padStart(3, '0')}.jpg`;
      entries.push({ name: coverPath, data: cover });
    }
    manifest.pieces.push({ ...piece, coverPath });
  }

  if (logo) {
    const extension = (logo.name && logo.name.includes('.')) ? logo.name.split('.').pop() : (logo.type.split('/')[1] || 'png');
    const path = `logo/logo.${safeName(extension)}`;
    entries.push({ name: path, data: logo });
    manifest.logo = { path, type: logo.type, name: logo.name || null };
  }

  entries.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  const zip = await createZip(entries, onProgress);
  return new File([zip], backupFileName(), { type: 'application/zip' });
}

/**
 * Lee un respaldo y comprueba que esté completo y sano, sin tocar lo que hay guardado.
 * Devuelve un resumen y una función apply() que hace el reemplazo.
 */
export async function inspectBackup(file, onProgress) {
  const entries = await readZip(file);
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry) throw new Error('Este archivo no es un respaldo de Estudio Aura.');
  const manifest = JSON.parse(await manifestEntry.blob.text());
  if (manifest.format !== FORMAT) throw new Error('Este archivo no es un respaldo de Estudio Aura.');
  if (manifest.version > VERSION) throw new Error('Este respaldo fue creado con una versión más nueva de la app. Actualizá la app y volvé a intentar.');

  const needed = [];
  for (const photo of manifest.photos) {
    needed.push(photo.originalPath);
    if (photo.thumbPath) needed.push(photo.thumbPath);
  }
  const pieces = manifest.pieces || [];
  for (const piece of pieces) {
    if (piece.coverPath) needed.push(piece.coverPath);
  }
  if (manifest.logo) needed.push(manifest.logo.path);

  for (let i = 0; i < needed.length; i++) {
    const entry = entries.get(needed[i]);
    if (!entry) throw new Error(`Falta un archivo dentro del respaldo (${needed[i]}). No se cambió nada.`);
    if (!(await verifyEntry(entry))) throw new Error(`Un archivo del respaldo está dañado (${needed[i]}). No se cambió nada.`);
    if (onProgress) onProgress(i + 1, needed.length);
  }

  const summary = {
    createdAt: manifest.createdAt,
    photoCount: manifest.photos.length,
    pieceCount: pieces.length,
    hasLogo: Boolean(manifest.logo),
    hasBrand: Boolean(manifest.brand),
  };

  async function apply() {
    const photos = [];
    const blobs = [];
    for (const item of manifest.photos) {
      const { originalPath, thumbPath, ...photo } = item;
      photos.push(photo);
      const original = entries.get(originalPath).blob;
      blobs.push([`orig:${photo.id}`, new Blob([await original.arrayBuffer()], { type: photo.type })]);
      if (thumbPath) blobs.push([`thumb:${photo.id}`, new Blob([await entries.get(thumbPath).blob.arrayBuffer()], { type: 'image/jpeg' })]);
    }
    const restoredPieces = [];
    for (const item of pieces) {
      const { coverPath, ...piece } = item;
      restoredPieces.push(piece);
      if (coverPath) blobs.push([`cover:${piece.id}`, new Blob([await entries.get(coverPath).blob.arrayBuffer()], { type: 'image/jpeg' })]);
    }
    if (manifest.logo) {
      const data = await entries.get(manifest.logo.path).blob.arrayBuffer();
      blobs.push(['logo', new File([data], manifest.logo.name || 'logo', { type: manifest.logo.type })]);
    }
    const settings = [['lastBackup', manifest.createdAt]];
    if (manifest.brand) settings.push(['brand', manifest.brand]);
    await db.replaceAll({ photos, pieces: restoredPieces, blobs, settings });
  }

  return { summary, apply };
}
