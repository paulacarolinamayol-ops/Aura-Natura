// Prueba del formato de respaldo: lo que se guarda es exactamente lo que se recupera.
// Ejecutar: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, readZip, verifyEntry, crc32 } from '../js/zip.js';

test('crc32 coincide con el valor de referencia', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('un ZIP creado se lee igual, con nombres con tildes y eñes', async () => {
  const photo = new Uint8Array(5000).map((_, i) => (i * 31) % 256);
  const zip = await createZip([
    { name: 'LEEME.txt', data: 'hola' },
    { name: 'originales/001-lámpara año nuevo.jpg', data: new Blob([photo]) },
  ]);
  const entries = await readZip(zip);
  assert.deepEqual([...entries.keys()], ['LEEME.txt', 'originales/001-lámpara año nuevo.jpg']);
  assert.equal(await entries.get('LEEME.txt').blob.text(), 'hola');
  const back = new Uint8Array(await entries.get('originales/001-lámpara año nuevo.jpg').blob.arrayBuffer());
  assert.deepEqual(back, photo);
  assert.ok(await verifyEntry(entries.get('originales/001-lámpara año nuevo.jpg')));
});

test('detecta un archivo dañado', async () => {
  const zip = await createZip([{ name: 'a.bin', data: new Blob([new Uint8Array(100).fill(7)]) }]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  bytes[30 + 'a.bin'.length + 10] ^= 0xff; // cambia un byte del contenido
  const entries = await readZip(new Blob([bytes]));
  assert.equal(await verifyEntry(entries.get('a.bin')), false);
});

test('rechaza un archivo que no es ZIP', async () => {
  await assert.rejects(readZip(new Blob(['no soy un zip'])), /no es un respaldo válido/);
});
