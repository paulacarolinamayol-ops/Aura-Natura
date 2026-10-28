// Estado de la app: lo que está guardado en el iPad, cargado en memoria.

import * as db from './db.js';
import { defaultBrand } from './brand.js';
import { describeImage } from './images.js';
import { defaultPromptOptions } from './prompts.js';

const listeners = new Set();
const thumbUrls = new Map();
const coverUrls = new Map();

export const state = {
  photos: [],
  pieces: [],
  promptOptions: defaultPromptOptions(),
  brand: defaultBrand(),
  logo: null,
  logoUrl: null,
  lastBackup: null,
  persisted: null,
  usage: null,
  quota: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function byNewest(a, b) {
  return b.addedAt.localeCompare(a.addedAt);
}

export async function load() {
  state.photos = (await db.getAll('photos')).sort(byNewest);
  state.pieces = sortPieces(await db.getAll('pieces'));
  state.brand = (await db.get('settings', 'brand')) || defaultBrand();
  state.lastBackup = (await db.get('settings', 'lastBackup')) || null;
  state.promptOptions = { ...defaultPromptOptions(), ...((await db.get('settings', 'promptOptions')) || {}) };
  await loadLogo();
  await refreshStorage();
  notify();
}

async function loadLogo() {
  if (state.logoUrl) URL.revokeObjectURL(state.logoUrl);
  state.logo = (await db.get('blobs', 'logo')) || null;
  state.logoUrl = state.logo ? URL.createObjectURL(state.logo) : null;
}

export async function refreshStorage() {
  if (!navigator.storage) return;
  try {
    if (navigator.storage.persisted) state.persisted = await navigator.storage.persisted();
    if (navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      state.usage = usage;
      state.quota = quota;
    }
  } catch {
    // Algunos navegadores no informan el espacio. La app funciona igual.
  }
}

/** Pide al navegador que no borre los datos aunque falte espacio. */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    state.persisted = await navigator.storage.persist();
  } catch {
    state.persisted = false;
  }
  notify();
  return state.persisted;
}

export async function thumbUrl(photo) {
  if (thumbUrls.has(photo.id)) return thumbUrls.get(photo.id);
  const blob = (await db.get('blobs', `thumb:${photo.id}`)) || (await db.get('blobs', `orig:${photo.id}`));
  const url = blob ? URL.createObjectURL(blob) : null;
  thumbUrls.set(photo.id, url);
  return url;
}

function forgetThumb(id) {
  const url = thumbUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  thumbUrls.delete(id);
}

/** El archivo original tal como se cargó, listo para compartir o descargar. */
export async function originalFile(photo) {
  const blob = await db.get('blobs', `orig:${photo.id}`);
  if (!blob) return null;
  return new File([blob], photo.fileName, { type: photo.type || blob.type, lastModified: photo.lastModified || Date.now() });
}

/**
 * Guarda fotos nuevas. onProgress(hechas, total). Devuelve cuántas se guardaron
 * y los errores, si hubo.
 */
export async function addPhotos(files, category, onProgress) {
  const errors = [];
  let saved = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const info = await describeImage(file);
      const photo = {
        id: newId(),
        name: file.name.replace(/\.[^.]+$/, '') || 'Foto',
        fileName: file.name || `foto-${i + 1}`,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        width: info ? info.width : null,
        height: info ? info.height : null,
        category: category || 'sin',
        light: 'sin',
        addedAt: new Date().toISOString(),
      };
      await db.savePhoto(photo, file, info ? info.thumb : null);
      state.photos.unshift(photo);
      saved++;
    } catch (error) {
      errors.push({ file: file.name, error });
    }
    if (onProgress) onProgress(i + 1, files.length);
  }
  if (saved && state.persisted !== true) await requestPersistence();
  await refreshStorage();
  notify();
  return { saved, errors };
}

export async function updatePhoto(id, changes) {
  const photo = state.photos.find((p) => p.id === id);
  if (!photo) return;
  Object.assign(photo, changes);
  await db.put('photos', photo);
  notify();
}

export async function deletePhoto(id) {
  await db.deletePhoto(id);
  forgetThumb(id);
  state.photos = state.photos.filter((p) => p.id !== id);
  await refreshStorage();
  notify();
}

export async function saveBrand(brand) {
  state.brand = brand;
  await db.put('settings', brand, 'brand');
  notify();
}

export async function setLogo(file) {
  await db.put('blobs', file, 'logo');
  await loadLogo();
  await refreshStorage();
  notify();
}

export async function removeLogo() {
  await db.remove('blobs', 'logo');
  await loadLogo();
  notify();
}

/** Recuerda las últimas opciones de Instrucciones. No redibuja la pantalla. */
export async function savePromptOptions(options) {
  state.promptOptions = options;
  await db.put('settings', options, 'promptOptions');
}

export async function markBackup() {
  state.lastBackup = new Date().toISOString();
  await db.put('settings', state.lastBackup, 'lastBackup');
  notify();
}

/** Después de restaurar: vuelve a leer todo desde la base de datos. */
export async function reload() {
  for (const id of [...thumbUrls.keys()]) forgetThumb(id);
  for (const id of [...coverUrls.keys()]) forgetCover(id);
  await load();
}

// Biblioteca

function sortPieces(pieces) {
  return pieces.sort((a, b) => (b.publishedOn || '').localeCompare(a.publishedOn || '') || b.addedAt.localeCompare(a.addedAt));
}

export async function coverUrl(piece) {
  if (coverUrls.has(piece.id)) return coverUrls.get(piece.id);
  const blob = await db.get('blobs', `cover:${piece.id}`);
  const url = blob ? URL.createObjectURL(blob) : null;
  coverUrls.set(piece.id, url);
  return url;
}

function forgetCover(id) {
  const url = coverUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  coverUrls.delete(id);
}

/** Crea o actualiza una pieza. cover es opcional: si no viene, se mantiene la anterior. */
export async function savePiece(data, cover) {
  const existing = data.id ? state.pieces.find((p) => p.id === data.id) : null;
  const piece = existing
    ? { ...existing, ...data, updatedAt: new Date().toISOString() }
    : { favorite: false, ...data, id: newId(), addedAt: new Date().toISOString() };
  await db.savePiece(piece, cover);
  if (cover) forgetCover(piece.id);
  state.pieces = sortPieces([...state.pieces.filter((p) => p.id !== piece.id), piece]);
  await refreshStorage();
  notify();
  return piece;
}

export async function toggleFavorite(id) {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece) return;
  piece.favorite = !piece.favorite;
  await db.put('pieces', piece);
  notify();
}

export async function deletePiece(id) {
  await db.deletePiece(id);
  forgetCover(id);
  state.pieces = state.pieces.filter((p) => p.id !== id);
  await refreshStorage();
  notify();
}
