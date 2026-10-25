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
      { name: "DRUMS", file: "audio/no-supiste-quererla/Drums.mp3", color: "#21c1c8" },
      { name: "BASS", file: "audio/no-supiste-quererla/Bass.mp3", color: "#388ee6" },
      { name: "SYNTH", file: "audio/no-supiste-quererla/Synth.mp3", color: "#8a76da" },
      { name: "FX", file: "audio/no-supiste-quererla/Other.mp3", color: "#7f95a8" },
      { name: "VOZ", file: "audio/no-supiste-quererla/Lead Vocals.mp3", color: "#e46b9b" },
      { name: "ADLIBS", file: "audio/no-supiste-quererla/Backing Vocals.mp3", color: "#d17eb8" },
      { name: "KEYBOARD", file: "audio/no-supiste-quererla/Keyboard.mp3", color: "#9a7bdc" },
      { name: "PERC", file: "audio/no-supiste-quererla/Percussion.mp3", color: "#e6bb48" },
      { name: "GUITAR", file: "audio/no-supiste-quererla/Guitar.mp3", color: "#ef9252" }
    ]
  }
];
