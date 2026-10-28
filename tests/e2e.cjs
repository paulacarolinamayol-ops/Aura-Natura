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
      await page.getByRole('button', { name: 'Guardar' }).click();
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
      await p.getByRole('alertdialog').getByText(/2 fotos, logo y ficha de marca/).waitFor();
      await p.getByRole('button', { name: 'Restaurar' }).click();
      await p.getByText('Respaldo restaurado: 2 fotos').waitFor();

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
      await fresh.close();
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
      for (const screen of ['marca', 'originales', 'respaldo']) {
        await p.goto(`${URL_BASE}#${screen}`);
        await p.locator('.main').waitFor();
        await noHorizontalScroll(p);
      }
      await ctx.close();
    });
  } catch {
    failed = true;
  } finally {
    await browser.close();
    server.kill();
    console.log(results.join('\n'));
    console.log(failed ? '\nHay pruebas que fallaron.' : `\nTodas las pruebas pasaron (${results.length}).`);
    process.exit(failed ? 1 : 0);
  }
})();
