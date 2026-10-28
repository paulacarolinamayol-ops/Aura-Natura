// Prueba de punta a punta de la Etapa 1 en un navegador automático (Chromium).
// Reproduce las pruebas que se hacen a mano en el iPad.
// Ejecutar: node tests/e2e.cjs   (necesita Playwright y Python 3)

const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const PORT = 8765;
const URL_BASE = `http://localhost:${PORT}/`;
const photos = ['esfera-frente.jpg', 'esfera-trasera.png', 'lámpara año nuevo.jpg'].map((f) => path.join(FIXTURES, f));
// Playwright omite archivos con tildes si se pasan por ruta; se pasan con su contenido.
const photoPayloads = photos.map((file) => ({
  name: path.basename(file),
  mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
  buffer: fs.readFileSync(file),
}));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (error) {
    results.push(`  ✗ ${name}\n    ${error.message.split('\n').join('\n    ')}`);
    throw error;
  }
}

function startServer() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  return new Promise((resolve) => setTimeout(() => resolve(server), 800));
}

async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `la página se desplaza ${overflow}px hacia el costado`);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const downloads = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aura-'));
  let failed = false;

  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL_BASE.slice(0, -1) });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await step('Abre en «Mi marca» con la paleta y las tipografías', async () => {
      await page.goto(URL_BASE);
      await page.getByRole('heading', { name: 'Paleta' }).waitFor();
      assert.equal(await page.locator('.swatch').count(), 6);
      const fontsOk = await page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('16px Fraunces') && document.fonts.check('16px Manrope');
      });
      assert.ok(fontsOk, 'las tipografías no cargaron');
      await noHorizontalScroll(page);
    });

    await step('Prueba 6: copiar un color copia el código correcto', async () => {
      await page.getByRole('button', { name: 'Copiar Salvia, #596B53' }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '#596B53');
      await page.getByText('Salvia copiado: #596B53').waitFor();
    });

    await step('Editar la ficha del producto y guardarla', async () => {
      await page.getByRole('button', { name: 'Editar ficha' }).click();
      await page.locator('#rule-text-4').fill('Cable de carga USB-C negro, de 1 metro.');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByText('Cable de carga USB-C negro, de 1 metro.').waitFor();
    });

    await step('Subir el logo', async () => {
      await page.locator('#logo-input').setInputFiles(path.join(FIXTURES, 'logo.png'));
      await page.getByRole('img', { name: 'Logo de Aura Natura' }).waitFor();
    });

    await step('Prueba 2: cargar fotos, cerrar y volver a abrir: siguen ahí', async () => {
      await page.getByRole('link', { name: 'Mis originales' }).click();
      await page.getByText('Empezá por tus fotos reales').waitFor();
      await page.getByRole('button', { name: /^Frente/ }).click();
      await page.locator('#photo-input').setInputFiles(photoPayloads);
      await page.getByText('3 fotos guardadas').waitFor();
      await page.reload();
      await page.locator('.tile').first().waitFor();
      assert.equal(await page.locator('.tile').count(), 3);
      await page.getByText('3 fotos reales · se guardan sin cambios').waitFor();
      await noHorizontalScroll(page);
    });

    await step('Clasificar una foto y filtrar por categoría', async () => {
      await page.getByRole('button', { name: 'Abrir esfera-trasera' }).click();
      await page.locator('#photo-category').selectOption('trasera');
      await page.locator('#photo-light').selectOption('dia');
      await page.getByRole('button', { name: /^Trasera/ }).click();
      assert.equal(await page.locator('.tile').count(), 1);
      await page.getByRole('button', { name: /^Todas/ }).click();
      assert.equal(await page.locator('.tile').count(), 3);
    });

    await step('Prueba 3: la copia guardada es idéntica al original', async () => {
      // Chromium en Linux renombra las descargas con tildes como «download»; Safari no.
      // Por eso el nombre se comprueba con una foto sin tildes.
      await page.getByRole('button', { name: 'Abrir esfera-frente' }).click();
      await page.waitForTimeout(300);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Guardar copia' }).click(),
      ]);
      assert.equal(download.suggestedFilename(), 'esfera-frente.jpg');
      const saved = fs.readFileSync(await download.path());
      assert.ok(saved.equals(fs.readFileSync(photos[0])), 'el archivo descargado no es igual al original');
    });

    await step('Prueba 4: eliminar pide confirmación y cancelar no borra', async () => {
      await page.getByRole('button', { name: 'Eliminar foto' }).click();
      await page.getByRole('alertdialog').waitFor();
      await page.getByRole('button', { name: 'Cancelar' }).click();
      assert.equal(await page.locator('.tile').count(), 3);
      await page.getByRole('button', { name: 'Eliminar foto' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar foto' }).click();
      await page.getByText('Foto eliminada').waitFor();
      assert.equal(await page.locator('.tile').count(), 2);
    });

    await step('Etapa 2: agregar piezas a la Biblioteca (portada de imagen y de video)', async () => {
      await page.getByRole('link', { name: 'Biblioteca' }).click();
      await page.getByText('Tu Biblioteca está vacía').waitFor();

      await page.getByRole('button', { name: 'Agregar pieza' }).first().click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByText('Poné un título para la pieza.').waitFor();
      await page.locator('#cover-input').setInputFiles(path.join(FIXTURES, 'esfera-frente.jpg'));
      await page.locator('.cover-preview img').waitFor();
      await page.locator('#piece-title').fill('Un regalo que se siente');
      await page.locator('#piece-description').fill('Regalo Día de la Madre');
      await page.getByRole('radio', { name: 'Estático' }).click();
      await page.getByRole('radio', { name: 'MOFU' }).click();
      await page.getByText('Consideración: gente que te está evaluando').waitFor();
      await page.getByRole('button', { name: 'Meta Ads' }).click();
      await page.locator('#piece-date').fill('2026-10-19');
      await page.locator('#piece-link').fill('www.instagram.com/p/ejemplo');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByText('Pieza agregada a la Biblioteca').waitFor();
      await page.getByText('En Instagram y Meta Ads desde el 19 oct').waitFor();
      assert.equal(await page.getByRole('link', { name: 'Abrir la publicación de Un regalo que se siente' }).getAttribute('href'), 'https://www.instagram.com/p/ejemplo');

      await page.getByRole('button', { name: 'Agregar pieza' }).click();
      await page.locator('#cover-input').setInputFiles(path.join(FIXTURES, 'reel.webm'));
      await page.locator('.cover-preview img').waitFor();
      assert.equal(await page.locator('#piece-title').inputValue(), 'reel', 'el título no se completó con el nombre del video');
      await page.locator('#piece-title').fill('El abrazo de los tuyos');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByText('Pieza agregada a la Biblioteca').waitFor();
      assert.equal(await page.locator('.piece').count(), 2);
      const coverWidth = await page.locator('.piece').filter({ hasText: 'El abrazo de los tuyos' }).locator('img').evaluate((img) => img.complete && img.naturalWidth);
      assert.ok(coverWidth > 0, 'la portada del video no se ve');
      await noHorizontalScroll(page);
    });

    await step('Biblioteca: filtros, búsqueda, favoritos, editar y eliminar', async () => {
      await page.getByRole('group', { name: 'Etapa del cliente' }).getByRole('button', { name: /^MOFU/ }).click();
      assert.equal(await page.locator('.piece').count(), 1);
      await page.getByRole('group', { name: 'Etapa del cliente' }).getByRole('button', { name: /^Todas/ }).click();
      await page.getByRole('group', { name: 'Formato' }).getByRole('button', { name: /^Video/ }).click();
      assert.equal(await page.locator('.piece').count(), 1);
      await page.getByRole('group', { name: 'Formato' }).getByRole('button', { name: /^Todos/ }).click();

      await page.locator('#library-search').fill('madre');
      assert.equal(await page.locator('.piece').count(), 1);
      await page.locator('#library-search').fill('');

      await page.getByRole('button', { name: 'Marcar El abrazo de los tuyos como favorito' }).click();
      await page.getByRole('button', { name: /^Favoritos/ }).click();
      assert.equal(await page.locator('.piece').count(), 1);
      await page.getByRole('button', { name: /^Favoritos/ }).click();

      await page.getByRole('button', { name: 'Editar El abrazo de los tuyos' }).click();
      await page.getByRole('radio', { name: 'BOFU' }).click();
      await page.locator('#piece-description').fill('Video · Orgullo');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByText('Pieza actualizada').waitFor();

      await page.reload();
      await page.locator('.piece').first().waitFor();
      assert.equal(await page.locator('.piece').count(), 2);
      await page.locator('.piece', { hasText: 'El abrazo de los tuyos' }).locator('.funnel-bofu').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Quitar El abrazo de los tuyos de favoritos' }).count(), 1);

      await page.getByRole('button', { name: 'Agregar pieza' }).click();
      await page.locator('#cover-input').setInputFiles(path.join(FIXTURES, 'esfera-trasera.png'));
      await page.locator('.cover-preview img').waitFor();
      await page.locator('#piece-title').fill('Para borrar');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByText('Pieza agregada a la Biblioteca').waitFor();
      await page.getByRole('button', { name: 'Editar Para borrar' }).click();
      await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar pieza' }).click();
      await page.getByText('Pieza eliminada').waitFor();
      assert.equal(await page.locator('.piece').count(), 2);
    });

    let backupPath;
    await step('Aviso de respaldo pendiente y respaldo descargado', async () => {
      await page.getByText('Todavía no hiciste un respaldo de tus fotos.').waitFor();
      await page.getByRole('link', { name: 'Hacer respaldo' }).first().click();
      await page.getByRole('button', { name: 'Preparar respaldo' }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Guardar respaldo' }).click(),
      ]);
      assert.match(download.suggestedFilename(), /^Estudio-Aura-respaldo-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
      backupPath = path.join(downloads, download.suggestedFilename());
      await download.saveAs(backupPath);
      await page.getByText('Último respaldo: hoy.').waitFor();
    });

    await step('Funciona sin internet una vez abierta', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await context.setOffline(true);
      await page.reload();
      await page.getByRole('heading', { name: 'Respaldo', exact: true }).waitFor();
      const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Fraunces'); });
      assert.ok(fontsOk, 'sin internet no cargan las tipografías');
      await context.setOffline(false);
    });

    assert.deepEqual(errors, [], `errores en la página: ${errors.join(', ')}`);
    await context.close();

    await step('Prueba 5: en una app recién instalada, restaurar devuelve todo igual', async () => {
      const fresh = await browser.newContext({ viewport: { width: 820, height: 1180 } });
      const p = await fresh.newPage();
      await p.goto(`${URL_BASE}#respaldo`);
      await p.getByText('Todavía no hiciste ningún respaldo.').waitFor();
      await p.locator('#restore-input').setInputFiles(backupPath);
      await p.getByRole('alertdialog').getByText(/2 fotos, 2 piezas de la Biblioteca, logo y ficha de marca/).waitFor();
      await p.getByRole('button', { name: 'Restaurar' }).click();
      await p.getByText('Respaldo restaurado: 2 fotos y 2 piezas').waitFor();

      await p.getByRole('link', { name: 'Mis originales' }).click();
      await p.getByText('2 fotos reales · se guardan sin cambios').waitFor();
      assert.equal(await p.locator('.tile').count(), 2);
      await p.getByRole('button', { name: /^Trasera/ }).click();
      assert.equal(await p.locator('.tile').count(), 1);
      await p.getByRole('button', { name: 'Abrir esfera-trasera' }).click();
      assert.equal(await p.locator('#photo-light').inputValue(), 'dia');
      await p.waitForTimeout(300);
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Guardar copia' }).click()]);
      assert.ok(fs.readFileSync(await download.path()).equals(fs.readFileSync(photos[1])), 'la foto restaurada no es idéntica');
      await noHorizontalScroll(p);

      await p.getByRole('link', { name: 'Mi marca' }).click();
      await p.getByText('Cable de carga USB-C negro, de 1 metro.').waitFor();
      await p.getByRole('img', { name: 'Logo de Aura Natura' }).waitFor();

      await p.getByRole('link', { name: 'Biblioteca' }).click();
      await p.locator('.piece', { hasText: 'Un regalo que se siente' }).getByText('En Instagram y Meta Ads desde el 19 oct').waitFor();
      await p.locator('.piece', { hasText: 'El abrazo de los tuyos' }).locator('.funnel-bofu').waitFor();
      assert.equal(await p.getByRole('button', { name: 'Quitar El abrazo de los tuyos de favoritos' }).count(), 1);
      await fresh.close();
    });

    await step('Actualizar desde la Etapa 1 conserva las fotos guardadas', async () => {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${URL_BASE}manifest.webmanifest`);
      await p.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('estudio-aura', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('photos', { keyPath: 'id' });
          db.createObjectStore('blobs');
          db.createObjectStore('settings');
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['photos', 'blobs'], 'readwrite');
          tx.objectStore('photos').put({ id: 'vieja', name: 'Foto de la etapa 1', fileName: 'vieja.jpg', type: 'image/jpeg', size: 3, category: 'frente', light: 'sin', addedAt: '2026-10-20T10:00:00.000Z' });
          tx.objectStore('blobs').put(new Blob(['abc'], { type: 'image/jpeg' }), 'orig:vieja');
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }));
      await p.goto(`${URL_BASE}#originales`);
      await p.getByText('1 foto real · se guarda sin cambios').waitFor();
      await p.getByRole('link', { name: 'Biblioteca' }).click();
      await p.getByText('Tu Biblioteca está vacía').waitFor();
      await ctx.close();
    });

    await step('Un archivo que no es respaldo se rechaza sin borrar nada', async () => {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${URL_BASE}#respaldo`);
      await p.locator('#restore-input').setInputFiles(path.join(FIXTURES, 'logo.png'));
      await p.getByText('El archivo no es un respaldo válido.').waitFor();
      await ctx.close();
    });

    await step('En pantalla de celular no hay desplazamiento lateral', async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      for (const screen of ['marca', 'originales', 'biblioteca', 'respaldo']) {
        await p.goto(`${URL_BASE}#${screen}`);
        await p.locator('.main').waitFor();
        await noHorizontalScroll(p);
      }
      await ctx.close();
    });
  } catch {
    failed = true;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) await p.screenshot({ path: path.join(downloads, 'fallo.png') }).catch(() => {});
    }
    console.log(`Captura del fallo: ${path.join(downloads, 'fallo.png')}`);
  } finally {
    await browser.close();
    server.kill();
    console.log(results.join('\n'));
    console.log(failed ? '\nHay pruebas que fallaron.' : `\nTodas las pruebas pasaron (${results.length}).`);
    process.exit(failed ? 1 : 0);
  }
})();
