// Base de datos local del navegador (IndexedDB).
// - photos: datos de cada foto (nombre, categoría, medidas…)
// - blobs: los archivos en sí (originales, miniaturas y logo)
// - settings: marca, fecha del último respaldo y otras preferencias

const DB_NAME = 'estudio-aura';
const DB_VERSION = 1;
const STORES = ['photos', 'blobs', 'settings'];

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Cerrá las otras pestañas de Estudio Aura y volvé a intentar.'));
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar.'));
  });
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(store, key) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  return done(tx);
}

/** Guarda una foto con su original y su miniatura en una sola operación: o se guarda todo o nada. */
export async function savePhoto(photo, original, thumb) {
  const db = await open();
  const tx = db.transaction(['photos', 'blobs'], 'readwrite');
  tx.objectStore('photos').put(photo);
  tx.objectStore('blobs').put(original, `orig:${photo.id}`);
  if (thumb) tx.objectStore('blobs').put(thumb, `thumb:${photo.id}`);
  return done(tx);
}

export async function deletePhoto(id) {
  const db = await open();
  const tx = db.transaction(['photos', 'blobs'], 'readwrite');
  tx.objectStore('photos').delete(id);
  tx.objectStore('blobs').delete(`orig:${id}`);
  tx.objectStore('blobs').delete(`thumb:${id}`);
  return done(tx);
}

export async function remove(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

/**
 * Reemplaza todo el contenido en una sola operación (se usa al restaurar).
 * Si algo falla a mitad de camino, no se borra nada.
 */
export async function replaceAll({ photos, blobs, settings }) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  for (const photo of photos) tx.objectStore('photos').put(photo);
  for (const [key, blob] of blobs) tx.objectStore('blobs').put(blob, key);
  for (const [key, value] of settings) tx.objectStore('settings').put(value, key);
  return done(tx);
}
