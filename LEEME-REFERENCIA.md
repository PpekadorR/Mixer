# PpekadorR Multitrack Console — Reference Studio UI

Esta carpeta contiene **el DAW real** (HTML/CSS/JavaScript y audios originales), rediseñado para acercar la interfaz al mockup de consola profesional aportado por el usuario. **No es una imagen incrustada, ni una web de presentación.**

## Estructura visual

- Barra de menús compacta superior.
- Transporte de consola inmediatamente debajo, con contador real en HH:MM:SS:FRM y contador de compases calculado desde el BPM. El nombre de la sesión sigue siendo editable.
- Navegador integrado con pestañas Browser, Sources y Markers. Sources muestra las pistas de la sesión; sus botones llevan al canal en el mixer.
- Arrangement principal con pistas coloreadas por tipo de stem, línea de tiempo en compases 4/4, waveforms construidas a partir del audio real y controles M/S.
- Mixer horizontal inferior de **83 px por tira**, con EQ y compresor por canal, paneo rectangular, envío AUX, BUS, faders y vúmetros.
- Cuatro buses de grupo ligeramente más claros y master con medidor estéreo y fader; el EQ master de 8 bandas se abre mediante `GRAPHIC EQ · 8 BANDAS` sin perder sus controles.
- Editor, exportación WAV/MP3, guardado JSON y audio conservados. La sección ARCHIVO / EXPORTAR agrupa los botones originales.
- Vistas Edición / Mezcla / Mastering y paneles ocultables. El ancho del navegador y la altura del arrangement se ajustan arrastrando divisores discretos; se recuerdan los ajustes.

## Puesta en marcha

Para GitHub Pages, sube **todo el contenido de la carpeta** sin modificar las rutas `audio/`. `index.html` abre la consola. Selecciona una canción desde el selector superior o la lista del Browser. Para hacer pruebas locales completas usa un servidor HTTP estático; abrir mediante `file://` puede bloquear `fetch()` de los MP3 y el render WAV por seguridad del navegador.

## Alcance y verificación

La interfaz se probó en Chromium con datos multimedia reales procedentes de extractos de 30 segundos de los stems del proyecto (usados **solo en la prueba**). Se comprobaron nueve canales, nueve clips, nueve waveforms, cuatro buses, ocho bandas EQ master, pestañas del navegador, cambio de vista, apertura del EQ, conmutador del compresor y menú de paneles, sin errores JavaScript en dichas pruebas.

El ZIP incluye los archivos MP3 originales completos, no los extractos usados para la captura de prueba. No se ha comprobado de nuevo la renderización de una mezcla completa de 3:35 ni toda la cadena de audio en reproducción. Tampoco se han inventado clips MIDI ni plugins inexistentes únicamente para calcar la ilustración; la captura de referencia presenta instrumentos y patrones distintos de los stems reales de PpekadorR.

La imagen de vista previa externa al ZIP es **una captura del navegador**, no un mockup generado: reproduce la interfaz con extractos temporales de los audios reales para verificar el diseño.

Archivos de aspecto: `reference-daw.css` y `reference-daw.js`. Organización de ventanas: `workspace.js`. DSP: `eq.js` y motor de aplicación `app.js`.
