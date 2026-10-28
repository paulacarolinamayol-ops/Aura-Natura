// Respaldo y restauración.
// El respaldo es un ZIP con: las fotos originales, sus miniaturas, el logo,
// las portadas de la Biblioteca, la ficha de marca y un archivo "manifest.json"
// que describe todo.
//
// Versión 2 agrega la Biblioteca, versión 3 los diseños del Editor y versión 4 las propuestas del Feed.
// Los respaldos de versiones anteriores se pueden restaurar igual.

import * as db from './db.js';
import { createZip, readZip, verifyEntry } from './zip.js';

const FORMAT = 'estudio-aura-respaldo';
const VERSION = 4;

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
- editor: las imágenes propias de los diseños y del Feed (por ejemplo, fondos de ChatGPT) y las miniaturas de los diseños.
- manifest.json: nombres, categorías y ficha de marca. No lo edites.
`;

/** Arma el respaldo completo. Devuelve un File listo para guardar. */
export async function buildBackup(onProgress) {
  const photos = await db.getAll('photos');
  const brand = await db.get('settings', 'brand');
  const logo = await db.get('blobs', 'logo');
  const pieces = await db.getAll('pieces');
  const designs = await db.getAll('designs');
  const feeds = await db.getAll('feeds');
  const entries = [{ name: 'LEEME.txt', data: README }];
  const manifest = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    brand: brand || null,
    logo: null,
    photos: [],
    pieces: [],
    designs: [],
    feeds,
    assets: [],
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

  const assetIds = [...new Set([
    ...designs.flatMap((d) => d.layers.filter((l) => l.source && l.source.kind === 'asset').map((l) => l.source.id)),
    ...feeds.flatMap((f) => f.posts.filter((p) => p.source.kind === 'asset').map((p) => p.source.id)),
  ])];
  for (const id of assetIds) {
    const blob = await db.get('blobs', `asset:${id}`);
    if (!blob) continue;
    const extension = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const path = `editor/imagenes/${id}.${safeName(extension)}`;
    entries.push({ name: path, data: blob });
    manifest.assets.push({ id, path, type: blob.type, name: blob.name || null });
  }
  for (const design of designs) {
    const thumb = await db.get('blobs', `design-thumb:${design.id}`);
    let thumbPath = null;
    if (thumb) {
      thumbPath = `editor/miniaturas/${design.id}.jpg`;
      entries.push({ name: thumbPath, data: thumb });
    }
    manifest.designs.push({ ...design, thumbPath });
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
  const designs = manifest.designs || [];
  const feeds = manifest.feeds || [];
  const assets = manifest.assets || [];
  for (const asset of assets) needed.push(asset.path);
  for (const design of designs) {
    if (design.thumbPath) needed.push(design.thumbPath);
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
    designCount: designs.length,
    feedCount: feeds.length,
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
    const restoredDesigns = [];
    for (const item of designs) {
      const { thumbPath, ...design } = item;
      restoredDesigns.push(design);
      if (thumbPath) blobs.push([`design-thumb:${design.id}`, new Blob([await entries.get(thumbPath).blob.arrayBuffer()], { type: 'image/jpeg' })]);
    }
    for (const asset of assets) {
      const data = await entries.get(asset.path).blob.arrayBuffer();
      blobs.push([`asset:${asset.id}`, new File([data], asset.name || asset.path.split('/').pop(), { type: asset.type })]);
    }
    if (manifest.logo) {
      const data = await entries.get(manifest.logo.path).blob.arrayBuffer();
      blobs.push(['logo', new File([data], manifest.logo.name || 'logo', { type: manifest.logo.type })]);
    }
    const settings = [['lastBackup', manifest.createdAt]];
    if (manifest.brand) settings.push(['brand', manifest.brand]);
    await db.replaceAll({ photos, pieces: restoredPieces, designs: restoredDesigns, feeds, blobs, settings });
  }

  return { summary, apply };
}
