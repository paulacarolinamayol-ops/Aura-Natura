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

    await step('Etapa 3: armar, copiar y recordar la instrucción para ChatGPT', async () => {
      await page.getByRole('link', { name: 'Instrucciones' }).click();
      const prompt = page.locator('#prompt-text');
      await prompt.waitFor();
      assert.match(await prompt.textContent(), /^Retocá la foto adjunta/);
      assert.ok((await prompt.textContent()).includes('- Cable: Cable de carga USB-C negro, de 1 metro.'), 'la instrucción no usa la ficha editada');
      assert.equal(await page.getByRole('radiogroup', { name: 'Escenario' }).count(), 0, 'el retoque no debe ofrecer escenario');

      await page.getByRole('radio', { name: 'Solo el fondo' }).click();
      assert.match(await prompt.textContent(), /NO tiene que incluir la esfera/);
      assert.equal(await page.getByRole('radiogroup', { name: 'Foto de referencia' }).count(), 0, '«Solo el fondo» no debe ofrecer foto');
      await page.getByText('Abrí un chat nuevo en ChatGPT. Si podés, que sea temporal.').waitFor();
      await page.getByRole('radio', { name: 'Historia o reel 9:16' }).click();
      assert.match(await prompt.textContent(), /1080 × 1920 px/);
      await page.getByRole('radio', { name: 'Cambiar el escenario' }).click();
      await page.getByRole('radio', { name: 'Caja de regalo' }).click();
      assert.match(await prompt.textContent(), /caja de regalo abierta/);

      await page.getByRole('button', { name: 'Copiar instrucción' }).click();
      await page.getByText('Instrucción copiada. Pegala en ChatGPT.').waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await prompt.textContent());

      await page.getByRole('radio', { name: 'esfera-trasera, Trasera' }).click();
      await page.getByRole('img', { name: 'Foto de referencia: esfera-trasera' }).waitFor();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Guardar foto de referencia' }).click(),
      ]);
      assert.ok(fs.readFileSync(await download.path()).equals(fs.readFileSync(photos[1])), 'la foto de referencia no es el original');

      await page.reload();
      await page.locator('#prompt-text').waitFor();
      assert.equal(await page.getByRole('radio', { name: 'Historia o reel 9:16' }).getAttribute('aria-checked'), 'true');
      assert.equal(await page.getByRole('radio', { name: 'Caja de regalo' }).getAttribute('aria-checked'), 'true');
      await page.getByRole('img', { name: 'Foto de referencia: esfera-trasera' }).waitFor();
      await noHorizontalScroll(page);
    });

    await step('Etapa 4: armar un diseño con fondo, esfera recortada y texto, y exportar el PNG', async () => {
      await page.getByRole('link', { name: 'Mis originales' }).click();
      await page.getByRole('button', { name: /^Recortes sin fondo/ }).click();
      await page.locator('#photo-input').setInputFiles(path.join(FIXTURES, 'esfera-recorte.png'));
      await page.getByText('Foto guardada').waitFor();

      await page.getByRole('link', { name: 'Editor' }).click();
      await page.getByText('Todavía no hay diseños.').waitFor();
      await page.getByRole('button', { name: /Publicación 4:5/ }).click();
      await page.locator('#design-name').fill('Mesa de luz');
      await page.locator('#background-input').setInputFiles(path.join(FIXTURES, 'esfera-frente.jpg'));
      await page.getByRole('heading', { name: 'Fondo', exact: true }).waitFor();

      await page.getByRole('button', { name: 'Agregar esfera' }).click();
      await page.getByRole('button', { name: 'esfera-trasera, Trasera' }).click();
      await page.getByText('Esta foto tiene fondo.', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Agregar esfera' }).click();
      await page.getByRole('button', { name: 'esfera-recorte, Recortes sin fondo' }).click();
      await page.getByRole('button', { name: 'Sombra' }).waitFor();

      const canvas = page.locator('.stage-canvas');
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.62);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7, { steps: 5 });
      await page.mouse.up();

      await page.getByRole('button', { name: 'Agregar texto' }).click();
      await page.locator('#text-content').fill('Tus recuerdos siempre cerca');
      await page.getByRole('button', { name: 'cerca', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'cerca', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.locator('#text-size').fill('90');

      // Al pasar a historia y volver, el fondo tiene que seguir cubriendo todo el formato.
      await page.getByRole('radio', { name: 'Historia 9:16' }).click();
      await page.getByRole('radio', { name: 'Historia 9:16', checked: true }).waitFor();
      const topLeft = await page.locator('.stage-canvas').evaluate((c) => Array.from(c.getContext('2d').getImageData(2, 2, 1, 1).data));
      assert.notDeepEqual(topLeft.slice(0, 3), [232, 221, 204], 'el fondo no cubre el formato nuevo');
      await page.getByRole('radio', { name: 'Publicación 4:5' }).click();
      await page.getByRole('radio', { name: 'Publicación 4:5', checked: true }).waitFor();

      const layers = page.locator('.layers .layer');
      assert.equal(await layers.count(), 4, 'deberían ser 4 capas: texto, esfera de prueba, esfera recortada y fondo');
      await page.getByRole('button', { name: 'Quitar Esfera' }).last().click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Quitar' }).click();
      assert.equal(await layers.count(), 3);

      await page.getByRole('button', { name: 'Exportar PNG' }).click();
      await page.getByRole('img', { name: 'Vista previa de la imagen exportada' }).waitFor();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Guardar imagen' }).click(),
      ]);
      assert.equal(download.suggestedFilename(), 'mesa-de-luz-1080x1350.png');
      const png = fs.readFileSync(await download.path());
      assert.equal(png.readUInt32BE(16), 1080, 'el PNG no tiene 1080 de ancho');
      assert.equal(png.readUInt32BE(20), 1350, 'el PNG no tiene 1350 de alto');
      await noHorizontalScroll(page);
    });

    await step('Mis diseños: se guarda, se reabre, se duplica y se elimina', async () => {
      await page.waitForTimeout(900); // guardado automático
      await page.reload();
      await page.locator('#design-name').waitFor();
      assert.equal(await page.locator('#design-name').inputValue(), 'Mesa de luz');
      assert.equal(await page.locator('.layers .layer').count(), 3);
      await page.getByRole('link', { name: '← Mis diseños' }).click();
      await page.getByRole('link', { name: 'Abrir Mesa de luz' }).waitFor();
      await page.getByRole('button', { name: 'Duplicar' }).click();
      await page.getByRole('link', { name: 'Abrir Mesa de luz (copia)' }).waitFor();
      await page.getByRole('button', { name: 'Eliminar Mesa de luz (copia)' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.design-card').count(), 2);
      await page.getByRole('button', { name: 'Eliminar Mesa de luz (copia)' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar diseño' }).click();
      await page.getByText('Diseño eliminado').waitFor();
      assert.equal(await page.locator('.design-card').count(), 1);
    });

    await step('Etapa 5: armar una propuesta del Feed, etiquetar, revisar y ordenar', async () => {
      await page.getByRole('link', { name: 'Feed' }).click();
      await page.getByText('Todavía no hay propuestas').waitFor();
      await page.getByRole('button', { name: 'Nueva propuesta' }).first().click();
      await page.locator('#feed-name').waitFor();
      await page.locator('#feed-name').fill('Noviembre');
      // Las 2 piezas de la Biblioteca están en Instagram: se ven abajo, fijas.
      assert.equal(await page.locator('.feed-tile.is-published').count(), 2);

      await page.getByRole('button', { name: 'Agregar publicaciones' }).click();
      const sheet = page.getByRole('dialog');
      await sheet.getByRole('button', { name: 'Mesa de luz' }).click();
      await sheet.getByRole('radio', { name: 'Mis originales' }).click();
      for (const name of ['esfera-recorte', 'esfera-trasera', 'lámpara año nuevo']) await sheet.getByRole('button', { name, exact: true }).click();
      await sheet.getByRole('button', { name: 'Agregar 4' }).click();
      await page.getByText('4 publicaciones agregadas').waitFor();
      assert.equal(await page.locator('.feed-tile.is-planned').count(), 4);
      // Lo primero que se eligió se publica primero: queda abajo de lo planeado.
      assert.match(await page.locator('.feed-tile').nth(3).getAttribute('aria-label'), /^Publicación 1: Mesa de luz, fila 2, columna 1/);

      const tag = async (number, theme) => {
        await page.getByRole('button', { name: new RegExp(`^Publicación ${number}:`) }).click();
        await page.getByRole('dialog').getByRole('radio', { name: theme }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Listo' }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      };
      await tag(1, 'Oferta');
      await tag(2, 'Oferta');
      await tag(3, 'Recuerdos');
      await tag(4, 'Recuerdos');
      await page.getByText(/^Dos ofertas muy cerca: fila 1, columna 3 y fila 2, columna 1/).waitFor();
      await page.getByText(/^Dos de «Recuerdos» juntas: fila 1, columna 1 y fila 1, columna 2/).waitFor();
      const issuesBefore = await page.locator('.issue').count();

      await page.getByRole('button', { name: 'Sugerir orden' }).click();
      await page.getByText(/^Orden sugerido/).waitFor();
      assert.ok(await page.locator('.issue').count() < issuesBefore, 'sugerir orden no mejoró la grilla');
      await page.getByRole('button', { name: 'Deshacer' }).click();
      assert.equal(await page.locator('.issue').count(), issuesBefore);

      // Arrastrar la de arriba a la izquierda hasta el último lugar planeado.
      const first = await page.locator('.feed-tile').nth(0).boundingBox();
      const last = await page.locator('.feed-tile').nth(3).boundingBox();
      const firstLabel = (await page.locator('.feed-tile').nth(0).getAttribute('aria-label')).split(':')[1].split(',')[0];
      await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
      await page.mouse.down();
      await page.mouse.move(first.x + 40, first.y + 60, { steps: 4 });
      await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.match(await page.locator('.feed-tile').nth(3).getAttribute('aria-label'), new RegExp(`^Publicación 1:${firstLabel},`));
      assert.equal(await page.getByRole('dialog').count(), 0, 'soltar no tiene que abrir la ficha');
      await noHorizontalScroll(page);

      await page.waitForTimeout(300);
      await page.reload();
      await page.locator('#feed-name').waitFor();
      assert.equal(await page.locator('#feed-name').inputValue(), 'Noviembre');
      assert.equal(await page.locator('.feed-tile.is-planned').count(), 4);
      assert.equal(await page.locator('.feed-theme', { hasText: 'Oferta' }).count(), 2);
    });

    await step('Feed: duplicar, comparar lado a lado y eliminar una propuesta', async () => {
      await page.getByRole('link', { name: '← Propuestas' }).click();
      await page.getByRole('button', { name: 'Duplicar' }).click();
      await page.getByRole('link', { name: 'Abrir Noviembre (copia)' }).waitFor();
      for (const card of await page.locator('.feed-card').all()) await card.getByRole('button', { name: 'Comparar' }).click();
      await page.getByRole('link', { name: 'Comparar lado a lado' }).click();
      await page.getByRole('heading', { name: 'Comparar propuestas' }).waitFor();
      assert.equal(await page.locator('.compare-col').count(), 2);
      assert.equal(await page.locator('.compare-col').nth(0).locator('.feed-tile').count(), 6);
      await page.getByRole('link', { name: '← Propuestas' }).click();
      await page.getByRole('button', { name: 'Eliminar Noviembre (copia)' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar propuesta' }).click();
      await page.getByText('Propuesta eliminada').waitFor();
      assert.equal(await page.locator('.feed-card').count(), 1);
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
      await p.getByRole('alertdialog').getByText(/3 fotos, 2 piezas de la Biblioteca, 1 diseño, 1 propuesta del Feed, logo y ficha de marca/).waitFor();
      await p.getByRole('button', { name: 'Restaurar' }).click();
      await p.getByText('Respaldo restaurado: 3 fotos, 2 piezas, 1 diseño y 1 propuesta del Feed').waitFor();

      await p.getByRole('link', { name: 'Mis originales' }).click();
      await p.getByText('3 fotos reales · se guardan sin cambios').waitFor();
      assert.equal(await p.locator('.tile').count(), 3);
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

      await p.getByRole('link', { name: 'Editor' }).click();
      await p.getByRole('link', { name: 'Abrir Mesa de luz' }).click();
      await p.locator('#design-name').waitFor();
      assert.equal(await p.locator('.layers .layer').count(), 3);
      await p.getByRole('button', { name: 'Exportar PNG' }).click();
      await p.getByRole('img', { name: 'Vista previa de la imagen exportada' }).waitFor();
      const restoredOk = await p.getByRole('img', { name: 'Vista previa de la imagen exportada' }).evaluate((img) => new Promise((resolve) => {
        const check = () => resolve(img.naturalWidth === 1080 && img.naturalHeight === 1350);
        if (img.complete) check(); else img.onload = check;
      }));
      assert.ok(restoredOk, 'el diseño restaurado no exporta bien');
      await p.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await p.getByRole('link', { name: 'Feed' }).click();
      await p.getByRole('link', { name: 'Abrir Noviembre' }).click();
      assert.equal(await p.locator('.feed-tile.is-planned').count(), 4);
      assert.equal(await p.locator('.feed-theme', { hasText: 'Oferta' }).count(), 2);
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

    await step('Recortes: pegar uno copiado y avisar si una imagen llega con fondo', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL_BASE.slice(0, -1) });
      const p = await ctx.newPage();
      await p.goto(`${URL_BASE}#originales`);
      await p.getByRole('button', { name: /^Recortes sin fondo/ }).click();
      await p.locator('#photo-input').setInputFiles(path.join(FIXTURES, 'esfera-frente.jpg'));
      await p.getByText('Este recorte llegó con fondo', { exact: false }).waitFor();

      await p.evaluate(async () => {
        const blob = await (await fetch('tests/fixtures/esfera-recorte.png')).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      });
      await p.getByRole('button', { name: 'Pegar recorte' }).click();
      await p.getByText('Recorte pegado, sin fondo').waitFor();
      assert.equal(await p.locator('.tile').count(), 2);

      await p.getByRole('link', { name: 'Editor' }).click();
      await p.getByRole('button', { name: /Cuadrado 1:1/ }).click();
      await p.getByRole('button', { name: 'Agregar esfera' }).click();
      await p.getByRole('button', { name: 'Pegar recorte' }).click();
      await p.getByRole('button', { name: 'Sombra' }).waitFor();
      assert.equal(await p.locator('.layers .layer').count(), 1);
      await ctx.close();
    });

    await step('En pantalla de celular no hay desplazamiento lateral', async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      for (const screen of ['marca', 'originales', 'biblioteca', 'instrucciones', 'editor', 'feed', 'respaldo']) {
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
