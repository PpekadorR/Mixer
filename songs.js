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
    id: "no-supiste-quererla",
    title: "No Supiste Quererla",
    artist: "PpekadorR",
    bpm: 94,
    tracks: [
      { name: "DRUMS", file: "audio/no-supiste-quererla/Drums.mp3", color: "#f4b64b" },
      { name: "BASS", file: "audio/no-supiste-quererla/Bass.mp3", color: "#67b9f4" },
      { name: "SYNTH", file: "audio/no-supiste-quererla/Synth.mp3", color: "#b68aff" },
      { name: "FX", file: "audio/no-supiste-quererla/Other.mp3", color: "#ff8d78" },
      { name: "VOZ", file: "audio/no-supiste-quererla/Lead Vocals.mp3", color: "#a5e65a" },
      { name: "ADLIBS", file: "audio/no-supiste-quererla/Backing Vocals.mp3", color: "#65d6c4" },
      { name: "KEYBOARD", file: "audio/no-supiste-quererla/Keyboard.mp3", color: "#ed8fbb" },
      { name: "PERC", file: "audio/no-supiste-quererla/Percussion.mp3", color: "#aab2bd" },
      { name: "GUITAR", file: "audio/no-supiste-quererla/Guitar.mp3", color: "#a5e65a" }
    ]
  }
];
