# PpekadorR Multitrack Console

Reproductor multipistas estático para GitHub Pages, con interfaz de consola inspirada en flujos de trabajo de estudio (sin copiar recursos gráficos de Pro Tools).

## ¿Dónde se eligen las canciones?
Hay dos lugares:
- El selector **SESIÓN / CANCIÓN** en la barra superior.
- La lista **SESSION BROWSER** debajo de la consola. Haz clic en una canción para cargarla.

## Organización recomendada de archivos

```text
tu-repositorio/
├── index.html
├── style.css
├── app.js
├── songs.js
├── README.md
└── audio/
    ├── no-me-llames/
    │   ├── drums.mp3
    │   ├── bass.mp3
    │   ├── melodia.mp3
    │   ├── voz.mp3
    │   ├── adlibs.mp3
    │   └── fx.mp3
    └── codigo-pekador/
        ├── drums.mp3
        ├── bass.mp3
        ├── synth.mp3
        ├── voz.mp3
        └── adlibs.mp3
```

Cada carpeta dentro de `audio/` pertenece a una canción y contiene todos los stems de esa canción.

## Importante: el catálogo se declara en songs.js
GitHub Pages es alojamiento estático. El navegador no puede descubrir automáticamente el contenido de las carpetas `audio/` por seguridad; por eso `songs.js` contiene una lista de canciones y las rutas de sus pistas. Al agregar un tema, crea su carpeta y registra cada archivo en esa lista. La cantidad de pistas se calcula a partir de los elementos `tracks`.

Ejemplo:

```js
{
  id: "no-me-llames",
  title: "No me llames",
  artist: "PpekadorR",
  bpm: 98,
  tracks: [
    { name: "DRUMS", file: "audio/no-me-llames/drums.mp3", color: "#f4b64b" },
    { name: "BASS", file: "audio/no-me-llames/bass.mp3", color: "#67b9f4" },
    { name: "VOZ", file: "audio/no-me-llames/voz.mp3", color: "#a5e65a" }
  ]
}
```

Puedes usar cualquier cantidad de pistas. La consola muestra 8 canales a la vez; si hay más de 8, cambia de banco con **NEXT BANK**. Exporta los stems desde el mismo punto de inicio para conservar la sincronización.

## Publicar
1. Sube los archivos y la carpeta `audio/` al repositorio.
2. Abre **Settings → Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**, rama `main`, carpeta `/(root)`.
4. Guarda y abre la URL que entrega GitHub.

## Audio
El ZIP contiene la estructura y una configuración de ejemplo, no los archivos de audio reales. Reemplaza las rutas de ejemplo por tus stems. Para muchos archivos o audio pesado, puede ser preferible un hosting de audio aparte.

## Versión: transporte fijo y workspace optimizado

- **Transporte fijo** abajo, visible durante el scroll, con botones STOP, PLAY, PAUSA, retroceso 5 s y avance 5 s. Solo muestra el control □ de ocultar. Se recupera con **STUDIO WORKSPACE > PANELES > TRANSPORTE**.
- **Nombre editable**: haz clic en el texto de `CURRENT SESSION`, escribe y pulsa Enter. El nombre se usa para exportar el proyecto JSON y para nombrar las exportaciones de audio.
- **Herramientas en STUDIO WORKSPACE**: importar/exportar JSON, agregar audios, nueva sesión, estado, controles de zoom, FIT, exportar WAV y MP3. Conservan sus controladores originales.
- **SESSION BROWSER** cerrado automáticamente al abrir la aplicación. Se puede abrir desde el menú PANELES.
- **MASTER LOUDNESS**: siete lecturas compactas, en columna única, junto al medidor vertical.
- **TRACK LIST / MIXER**: desaparece el contador de pistas; PAN con barra rectangular, centro marcado y relleno según desplazamiento hacia L o R, manteniendo control de teclado.
- **Compatibilidad**: las otras seis ventanas siguen usando la cuadrícula magnética y sus tres vistas.

Se recomienda servir este proyecto desde un servidor web local o GitHub Pages, especialmente para la reproducción de audios. El proyecto no incluye un empaquetador de terceros. La exportación MP3 solicita un codificador en línea al usarse.
