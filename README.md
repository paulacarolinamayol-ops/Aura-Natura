# Estudio Aura

Aplicación de contenido de **Aura Natura**. Funciona en el navegador del iPad, se instala en la pantalla de inicio y guarda todo en el propio iPad, sin servicios pagos ni cuentas.

**Abrir la app:** https://paulacarolinamayol-ops.github.io/Aura-Natura/

## Qué hace hoy

- **Mi marca**: paleta (tocá un color para copiar su código), tipografías Fraunces y Manrope, logo, ficha del producto («Lo que la IA no toca») y voz de marca. La ficha y la voz se pueden editar.
- **Mis originales**: fotos reales de la esfera, clasificadas en *Frente*, *Trasera*, *En uso* y *Recortes sin fondo*, con tipo de luz (día o lámpara). Las fotos se guardan **sin cambios**: la app no las comprime, no las recorta y no las edita. Para la galería usa una miniatura aparte.
- **Biblioteca** (Etapa 2): todo lo que ya se publicó, como tarjetas con portada, título, descripción, formato (Video, Estático, Carrusel, Historia), etapa del cliente (TOFU, MOFU, BOFU), dónde está publicada, fecha, link y notas. Filtros, búsqueda y favoritos (★). De un video se toma un cuadro como portada: el video no se guarda.
- **Instrucciones** (Etapa 3): arma, en español, el texto para pegar en ChatGPT. Se elige el tipo (*Mejorar una foto real* o *Solo el fondo*), el objetivo, el formato, la luz, el escenario, el espacio para texto y una foto de referencia de *Mis originales*. Las reglas de «Qué NO cambiar» salen de la ficha del producto. La app recuerda las últimas opciones. Botones para copiar la instrucción y guardar la foto de referencia (el original), y un enlace para abrir ChatGPT. La app no se conecta con ChatGPT: copiar y pegar se hace a mano.
- **Respaldo**: crea un archivo ZIP con todas las fotos originales, las portadas de la Biblioteca, el logo y la ficha, y permite restaurarlo. Los respaldos de la Etapa 1 se pueden restaurar igual. Muestra el estado del almacenamiento y avisa si pasaron más de 7 días sin respaldo.
- **Sin internet**: después de abrirla una vez, funciona sin conexión.

*Editor* (Etapa 4) y *Feed* (Etapa 5) aparecen en el menú con su número de etapa y todavía no funcionan.

## Cómo instalarla en el iPad

1. Abrí el enlace de la app en **Safari**.
2. Tocá **Compartir** y elegí **Agregar a pantalla de inicio**.
3. Abrí *Estudio Aura* desde el ícono.

Usarla instalada es importante: si se usa solo desde una pestaña de Safari, el iPad puede borrar los datos después de varios días sin abrirla.

## Pruebas de la Etapa 1 (en el iPad)

1. Instalala y abrila con el wifi apagado: tiene que abrir igual.
2. Cargá tu logo y 10 fotos reales. Cerrá la app por completo, volvé a abrirla: todo sigue ahí.
3. Abrí una foto, tocá **Guardar copia** y compará con la original: mismo tamaño y misma calidad.
4. Tocá eliminar en una foto: tiene que pedir confirmación, y si cancelás, la foto sigue.
5. Hacé un respaldo y guardalo en Archivos. Borrá la app de la pantalla de inicio, instalala de nuevo y restaurá el respaldo: todo vuelve.
6. Copiá un código de color y pegalo en Notas: es el correcto.

## Pruebas de la Etapa 2 (en el iPad)

1. Después de actualizar, tus fotos y tu logo de la Etapa 1 siguen ahí.
2. Agregá una pieza con una imagen como portada y otra eligiendo un video: las dos muestran su portada.
3. Completá formato, etapa, dónde está publicada, fecha y link. La tarjeta dice, por ejemplo, «En Instagram y Meta Ads desde el 19 oct» y el ícono de link abre la publicación.
4. Probá los filtros (TOFU/MOFU/BOFU, formato), la búsqueda y la ★ de favoritos.
5. Editá una pieza, cerrá la app y volvé a abrirla: el cambio sigue. Eliminá una: pide confirmación.
6. Hacé un respaldo, borrá la app, instalala de nuevo y restauralo: vuelven las fotos y las piezas.

## Pruebas de la Etapa 3 (en el iPad)

1. En *Instrucciones*, cambiá las opciones: el texto de la derecha cambia al instante.
2. Tocá **Copiar instrucción** y pegala en Notas: es el mismo texto.
3. Editá la ficha en *Mi marca* (por ejemplo, el cable) y volvé: la instrucción ya tiene el cambio.
4. Elegí una foto de referencia y tocá **Guardar foto de referencia**: se guarda el original.
5. Con la pantalla dividida, arrastrá la foto de referencia a ChatGPT.
6. Probá una instrucción de cada tipo en ChatGPT y fijate si la esfera queda igual.

## Límites que conviene conocer

- Los datos viven **solo en ese iPad**. No se sincronizan; el respaldo es la forma de pasarlos a otro dispositivo.
- Si borrás la app de la pantalla de inicio, se borran sus datos. Por eso el respaldo es parte de esta etapa.
- Al elegir fotos desde la app **Fotos**, el iPad puede entregar una copia JPG de una foto HEIC. Lo que guarda la app es exactamente lo que entrega el iPad.
- El respaldo es un ZIP común: se puede abrir en la app Archivos para ver las fotos aunque la app no esté instalada.

## Tipografías

[Fraunces](https://github.com/undercasetype/Fraunces) y [Manrope](https://github.com/googlefonts/manrope), ambas con licencia SIL Open Font License 1.1 (ver `fonts/OFL-*.txt`). Van incluidas en la app para que se vean igual sin internet.

## Para desarrollar

No hace falta compilar nada: son archivos HTML, CSS y JavaScript que se publican tal cual (por ejemplo, con GitHub Pages).

```bash
python3 -m http.server 8000      # abrir http://localhost:8000
node --test tests/zip.test.mjs tests/prompts.test.mjs   # respaldo e instrucciones
node tests/e2e.cjs               # recorrido completo en Chromium (necesita Playwright)
```

- `js/app.js`: menú y navegación
- `js/views/`: pantallas (Mi marca, Mis originales, Biblioteca, Instrucciones, Respaldo)
- `js/prompts.js`: armado de las instrucciones para ChatGPT
- `js/store.js`, `js/db.js`: datos guardados en el navegador (IndexedDB)
- `js/backup.js`, `js/zip.js`: respaldo y restauración
- `sw.js`: funcionamiento sin internet
- `tools/make-icons.py`: genera los íconos
