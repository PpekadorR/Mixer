/*
  Cada canción tiene SU PROPIA carpeta dentro de audio/.
  Ejemplo:
    audio/
      no-me-llames/
        drums.mp3
        bass.mp3
        voz.mp3
      codigo-pekador/
        drums.mp3
        bass.mp3
        voz.mp3
        adlibs.mp3

  GitHub Pages no permite que el navegador liste automáticamente los archivos de una carpeta.
  Por eso registramos el nombre/BPM/archivos de cada canción en esta lista.
*/
window.MULTITRACK_SONGS = [
  {
    id: "no-me-llames",
    title: "No me llames",
    artist: "PpekadorR",
    bpm: 98,
    tracks: [
      { name: "DRUMS", file: "audio/no-me-llames/drums.mp3", color: "#f4b64b" },
      { name: "BASS", file: "audio/no-me-llames/bass.mp3", color: "#67b9f4" },
      { name: "MELODÍA", file: "audio/no-me-llames/melodia.mp3", color: "#b68aff" },
      { name: "FX", file: "audio/no-me-llames/fx.mp3", color: "#ff8d78" },
      { name: "VOZ", file: "audio/no-me-llames/voz.mp3", color: "#a5e65a" },
      { name: "ADLIBS", file: "audio/no-me-llames/adlibs.mp3", color: "#65d6c4" },
      { name: "COROS", file: "audio/no-me-llames/coros.mp3", color: "#ed8fbb" },
      { name: "EXTRA", file: "audio/no-me-llames/extra.mp3", color: "#aab2bd" }
    ]
  },
  {
    id: "codigo-pekador",
    title: "Código Pekador",
    artist: "PpekadorR",
    bpm: 102,
    tracks: [
      { name: "DRUMS", file: "audio/codigo-pekador/drums.mp3", color: "#f4b64b" },
      { name: "BASS", file: "audio/codigo-pekador/bass.mp3", color: "#67b9f4" },
      { name: "SYNTH", file: "audio/codigo-pekador/synth.mp3", color: "#b68aff" },
      { name: "FX", file: "audio/codigo-pekador/fx.mp3", color: "#ff8d78" },
      { name: "VOZ", file: "audio/codigo-pekador/voz.mp3", color: "#a5e65a" },
      { name: "ADLIBS", file: "audio/codigo-pekador/adlibs.mp3", color: "#65d6c4" },
      { name: "COROS", file: "audio/codigo-pekador/coros.mp3", color: "#ed8fbb" },
      { name: "PERC", file: "audio/codigo-pekador/perc.mp3", color: "#aab2bd" },
      { name: "VOZ DOBLE", file: "audio/codigo-pekador/voz-doble.mp3", color: "#a5e65a" },
      { name: "FX VOCAL", file: "audio/codigo-pekador/fx-vocal.mp3", color: "#ff8d78" }
    ]
  }
];
