/* PPEKADORR MULTITRACK STUDIO — PLAYER + MIXER */
(() => {
  "use strict";

  const songs = window.MULTITRACK_SONGS || [];
  const $ = (id) => document.getElementById(id);

  const colors = [
    "#f4b64b",
    "#67b9f4",
    "#b68aff",
    "#ff8d78",
    "#a5e65a",
    "#65d6c4",
    "#ed8fbb",
    "#aab2bd"
  ];

  let selectedSong = null;
  let tracks = [];
  let bank = 0;
  let playing = false;
  let startedAt = 0;
  let pausedAt = 0;
  let duration = 0;
  let masterVolume = 0.85;
  let soloIndex = null;
  let raf = null;

  // Formato de tiempo: 00:00.000
  const fmt = (seconds) => {
    seconds = Math.max(
      0,
      Number.isFinite(seconds) ? seconds : 0
    );

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return (
      `${String(minutes).padStart(2, "0")}:` +
      `${String(secs).padStart(2, "0")}.` +
      `${String(ms).padStart(3, "0")}`
    );
  };

  const shortFmt = (seconds) => fmt(seconds).slice(0, 5);

  function stopTicker() {
    if (raf !== null) {
      cancelAnimationFrame(raf);
    }

    raf = null;
  }

  // Calcular la duración de la sesión.
  function updateDuration() {
    const lengths = tracks
      .map((track) => track.audio.duration)
      .filter(Number.isFinite);

    duration = lengths.length
      ? Math.max(...lengths)
      : 0;

    const element = $("duration");

    if (element) {
      element.textContent = `DUR ${shortFmt(duration)}`;
    }
  }

  // Crear una pista de audio.
  function makeTrack(meta, index) {
    const audio = new Audio();

    audio.preload = "auto";
    audio.src = meta.file;

    // El volumen lo controlan los nodos de Web Audio.
    audio.volume = 1;

    audio.addEventListener(
      "loadedmetadata",
      updateDuration
    );

    audio.addEventListener("error", () => {
      const label = document.querySelector(
        `[data-track="${index}"] .channel-file`
      );

      if (label) {
        label.textContent = "AUDIO FILE NOT FOUND";
      }
    });

    // Registrar la pista en el ecualizador.
    if (window.PekadorEQ) {
      try {
        window.PekadorEQ.registerTrackEQ(index, audio);

        window.PekadorEQ.setTrackVolume(index, 1);
      } catch (error) {
        console.error(
          "No se pudo conectar el ecualizador de la pista",
          index,
          error
        );
      }
    }

    return {
      meta,
      audio,
      volume: 1,
      muted: false,
      index
    };
  }

  // Llenar el selector de canciones.
  function populateSelect() {
    const select = $("songSelect");

    if (!select) return;

    select.innerHTML = "";

    if (!songs.length) {
      select.innerHTML =
        '<option value="">No hay canciones configuradas</option>';
      return;
    }

    songs.forEach((song) => {
      const option = document.createElement("option");

      option.value = song.id;
      option.textContent = song.title;

      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      const song = songs.find(
        (item) => item.id === select.value
      );

      if (song) {
        loadSong(song);
      }
    });
  }

  // Lista de sesiones.
  function renderList() {
    const count = $("songCount");
    const list = $("songList");

    if (count) {
      count.textContent =
        `${songs.length} ` +
        `${songs.length === 1 ? "SESSION" : "SESSIONS"}`;
    }

    if (!list) return;

    list.innerHTML = "";

    if (!songs.length) {
      list.innerHTML =
        '<div class="empty">Agrega sesiones en songs.js.</div>';
      return;
    }

    songs.forEach((song, index) => {
      const row = document.createElement("div");

      row.className =
        "song-row" +
        (
          selectedSong && song.id === selectedSong.id
            ? " selected"
            : ""
        );

      row.innerHTML = `
        <div class="song-index">
          ${String(index + 1).padStart(2, "0")}
        </div>

        <div>
          <div class="song-name"></div>
          <div class="song-detail"></div>
        </div>

        <div class="song-bpm">
          ${Number(song.bpm) || "—"} BPM
        </div>

        <div class="track-count">
          ${song.tracks.length} TRACKS
        </div>
      `;

      row.querySelector(".song-name").textContent =
        song.title;

      row.querySelector(".song-detail").textContent =
        song.artist || "Unknown Artist";

      row.addEventListener("click", () => {
        loadSong(song);
      });

      list.appendChild(row);
    });
  }

  // Cargar una canción y liberar la sesión anterior.
  function loadSong(song) {
    stopAll();

    tracks.forEach((track) => {
      track.audio.pause();

      if (window.PekadorEQ) {
        window.PekadorEQ.unregisterTrackEQ(
          track.index
        );
      }

      track.audio.removeAttribute("src");
      track.audio.load();
    });

    selectedSong = song;
    bank = 0;
    soloIndex = null;

    tracks = song.tracks.map(
      (meta, index) => makeTrack(meta, index)
    );

    if ($("songSelect")) {
      $("songSelect").value = song.id;
    }

    if ($("songTitle")) {
      $("songTitle").textContent = song.title;
    }

    if ($("songMeta")) {
      $("songMeta").textContent =
        `${song.artist || "Unknown Artist"} · ` +
        `${song.tracks.length} tracks`;
    }

    if ($("bpmValue")) {
      $("bpmValue").innerHTML =
        `${Number(song.bpm) || "---"} <small>BPM</small>`;
    }

    if ($("loadedTracks")) {
      $("loadedTracks").textContent =
        `${tracks.length} TRACKS`;
    }

    if ($("currentTime")) {
      $("currentTime").textContent = "00:00.000";
    }

    duration = 0;

    if ($("duration")) {
      $("duration").textContent = "DUR 00:00";
    }

    renderChannels();
    renderList();
    updateVolumes();
    updateDuration();
  }

  // Dibujar los ocho canales visibles.
  function renderChannels() {
    const host = $("channels");

    if (!host) return;

    host.innerHTML = "";

    const start = bank * 8;
    const visible = tracks.slice(start, start + 8);

    if ($("bankLabel")) {
      $("bankLabel").textContent = tracks.length
        ? `BANK ${bank + 1} · CH ${start + 1}–${Math.min(start + 8, tracks.length)}`
        : "BANK 1 · CH 1–8";
    }

    for (let slot = 0; slot < 8; slot++) {
      const track = visible[slot];
      const index = start + slot;

      // Canal vacío.
      if (!track) {
        const channel = document.createElement("div");

        channel.className =
          "channel disabled-channel";

        channel.innerHTML = `
          <div class="channel-top">
            <span class="channel-num">
              ${String(index + 1).padStart(2, "0")}
            </span>
            <span class="channel-name">EMPTY</span>
          </div>

          <div class="channel-file">
            No track assigned
          </div>

          <div class="meter-label">
            <span>LEVEL</span>
            <span>PEAK</span>
          </div>

          <div class="meter">
            <div class="meter-fill"></div>
          </div>

          <div class="fader-zone">
            <div class="scale">
              <span>+6</span>
              <span>0</span>
              <span>-12</span>
              <span>-∞</span>
            </div>

            <input
              class="fader"
              type="range"
              min="0"
              max="100"
              value="0"
              disabled
            >
          </div>

          <div class="db-value">−∞ dB</div>

          <div class="channel-buttons">
            <button disabled>MUTE</button>
            <button disabled>SOLO</button>
            <button disabled>EQ</button>
          </div>
        `;

        host.appendChild(channel);
        continue;
      }

      // Canal con pista.
      const color =
        track.meta.color ||
        colors[index % colors.length];

      const channel = document.createElement("div");

      channel.className = "channel";
      channel.dataset.track = index;

      channel.style.setProperty(
        "--channel",
        color
      );

      channel.innerHTML = `
        <div class="channel-top">
          <span class="channel-num">
            ${String(index + 1).padStart(2, "0")}
          </span>
          <span class="channel-name"></span>
        </div>

        <div class="channel-file"></div>

        <div class="meter-label">
          <span>LEVEL</span>
          <span class="peak-label">PEAK −∞</span>
        </div>

        <div class="meter">
          <div class="meter-fill"></div>
        </div>

        <div class="fader-zone">
          <div class="scale">
            <span>+12</span>
            <span>+6</span>
            <span>0</span>
            <span>-∞</span>
          </div>

          <input
            class="fader"
            type="range"
            min="0"
            max="400"
            value="${Math.round(track.volume * 100)}"
            aria-label="Volumen de canal"
          >
        </div>

        <div class="db-value"></div>

        <div class="channel-buttons">
          <button class="mute-btn">MUTE</button>
          <button class="solo-btn">SOLO</button>
          <button
            class="eq-btn"
            data-eq-track="${index}"
            data-track-name=""
          >EQ</button>
        </div>
      `;

      channel.querySelector(".channel-name").textContent =
        track.meta.name || `TRACK ${index + 1}`;

      channel.querySelector(".channel-file").textContent =
        String(track.meta.file || "").split("/").pop();

      const eqButton = channel.querySelector(".eq-btn");

      eqButton.dataset.trackName =
        track.meta.name || `TRACK ${index + 1}`;

      // Fader de volumen.
      channel.querySelector(".fader").addEventListener(
        "input",
        (event) => {
          track.volume =
            Number(event.target.value) / 100;

          updateVolumes();
        }
      );

      // MUTE.
      channel.querySelector(".mute-btn").addEventListener(
        "click",
        () => {
          track.muted = !track.muted;

          channel
            .querySelector(".mute-btn")
            .classList.toggle(
              "active-mute",
              track.muted
            );

          updateVolumes();
        }
      );

      // SOLO.
      channel.querySelector(".solo-btn").addEventListener(
        "click",
        () => {
          soloIndex =
            soloIndex === index ? null : index;

          renderChannels();
          updateVolumes();
        }
      );

      host.appendChild(channel);

      setDb(channel, track.volume);

      if (track.muted) {
        channel
          .querySelector(".mute-btn")
          .classList.add("active-mute");
      }

      if (soloIndex === index) {
        channel
          .querySelector(".solo-btn")
          .classList.add("active-solo");
      }
    }

    if ($("prevBank")) {
      $("prevBank").disabled = bank === 0;
    }

    if ($("nextBank")) {
      $("nextBank").disabled =
        (bank + 1) * 8 >= tracks.length;
    }
  }

  // Mostrar el volumen en decibelios.
  function setDb(channel, volume) {
    const label = channel.querySelector(".db-value");

    if (!label) return;

    label.textContent = volume === 0
      ? "−∞ dB"
      : `${(20 * Math.log10(volume)).toFixed(1)} dB`;
  }

  // Aplicar MUTE, SOLO, faders y volumen maestro.
  function updateVolumes() {
    tracks.forEach((track, index) => {
      const active =
        !track.muted &&
        (soloIndex === null || soloIndex === index);

      if (window.PekadorEQ) {
        window.PekadorEQ.setTrackActive(
          index,
          active
        );

        window.PekadorEQ.setTrackVolume(
          index,
          track.volume
        );
      } else {
        track.audio.volume =
          active
            ? Math.min(1, track.volume * masterVolume)
            : 0;
      }

      const channel = document.querySelector(
        `[data-track="${index}"]`
      );

      if (channel) {
        setDb(channel, track.volume);

        channel.classList.toggle(
          "muted-channel",
          !active
        );
      }
    });

    if (window.PekadorEQ) {
      window.PekadorEQ.setMasterVolume(
        masterVolume
      );
    }

    if ($("masterValue")) {
      $("masterValue").textContent =
        `${Math.round(masterVolume * 100)}%`;
    }
  }

  // Reproducir todas las pistas sincronizadas.
  async function play() {
    if (!selectedSong) {
      if (songs[0]) {
        loadSong(songs[0]);
      } else {
        return;
      }
    }

    if (playing) return;

    if (duration && pausedAt >= duration) {
      pausedAt = 0;

      tracks.forEach((track) => {
        try {
          track.audio.currentTime = 0;
        } catch (_) {}
      });
    }

    try {
      if (window.PekadorEQ) {
        await window.PekadorEQ.resume();
      }
    } catch (error) {
      console.warn(
        "AudioContext no pudo reanudarse:",
        error
      );
    }

    playing = true;

    startedAt =
      performance.now() - pausedAt * 1000;

    if ($("playBtn")) {
      $("playBtn").innerHTML =
        '<span class="pause-icon"></span>';
    }

    if ($("playState")) {
      $("playState").textContent = "PLAYING";
    }

    updateVolumes();

    const results = await Promise.allSettled(
      tracks.map((track) => track.audio.play())
    );

    if (
      results.length &&
      results.every(
        (result) => result.status === "rejected"
      )
    ) {
      playing = false;

      if ($("playBtn")) {
        $("playBtn").innerHTML =
          '<span class="play-icon"></span>';
      }

      if ($("playState")) {
        $("playState").textContent = "STOPPED";
      }

      return;
    }

    tick();
  }

  // Pausar.
  function pause() {
    if (!playing) return;

    pausedAt = Math.max(
      0,
      (performance.now() - startedAt) / 1000
    );

    tracks.forEach((track) => {
      track.audio.pause();
    });

    playing = false;

    stopTicker();

    if ($("playBtn")) {
      $("playBtn").innerHTML =
        '<span class="play-icon"></span>';
    }

    if ($("playState")) {
      $("playState").textContent = "PAUSED";
    }
  }

  // Detener y volver al inicio.
  function stopAll() {
    tracks.forEach((track) => {
      track.audio.pause();

      try {
        track.audio.currentTime = 0;
      } catch (_) {}
    });

    playing = false;
    pausedAt = 0;
    startedAt = 0;

    stopTicker();

    if ($("playBtn")) {
      $("playBtn").innerHTML =
        '<span class="play-icon"></span>';
    }

    if ($("playState")) {
      $("playState").textContent = "STOPPED";
    }

    if ($("currentTime")) {
      $("currentTime").textContent = "00:00.000";
    }

    document.querySelectorAll(".meter-fill").forEach(
      (meter) => {
        meter.style.width = "0%";
      }
    );

    if ($("masterMeterL")) {
      $("masterMeterL").style.width = "0%";
    }

    if ($("masterMeterR")) {
      $("masterMeterR").style.width = "0%";
    }
  }

  // Actualizar el tiempo y animar los medidores.
  function tick() {
    if (!playing) return;

    const elapsed = Math.max(
      0,
      (performance.now() - startedAt) / 1000
    );

    if ($("currentTime")) {
      $("currentTime").textContent = fmt(elapsed);
    }

    if (duration && elapsed >= duration) {
      stopAll();
      return;
    }

    // Medidores visuales simulados, no picos reales de audio.
    tracks.forEach((track, index) => {
      const meter = document.querySelector(
        `[data-track="${index}"] .meter-fill`
      );

      if (meter) {
        const active =
          !track.muted &&
          (soloIndex === null || soloIndex === index);

        meter.style.width =
          playing && active
            ? `${Math.max(
                2,
                Math.random() *
                  65 *
                  track.volume *
                  masterVolume
              )}%`
            : "0%";
      }
    });

    const left = $("masterMeterL");
    const right = $("masterMeterR");

    if (left) {
      left.style.width =
        `${playing ? Math.random() * 75 * masterVolume : 0}%`;
    }

    if (right) {
      right.style.width =
        `${playing ? Math.random() * 75 * masterVolume : 0}%`;
    }

    raf = requestAnimationFrame(tick);
  }

  // Controles principales.
  if ($("playBtn")) {
    $("playBtn").addEventListener(
      "click",
      () => playing ? pause() : play()
    );
  }

  if ($("stopBtn")) {
    $("stopBtn").addEventListener(
      "click",
      stopAll
    );
  }

  if ($("restartBtn")) {
    $("restartBtn").addEventListener("click", () => {
      stopAll();

      tracks.forEach((track) => {
        try {
          track.audio.currentTime = 0;
        } catch (_) {}
      });
    });
  }

  // Volumen maestro.
  if ($("masterVolume")) {
    $("masterVolume").addEventListener(
      "input",
      (event) => {
        masterVolume =
          Number(event.target.value) / 100;

        updateVolumes();
      }
    );
  }

  // Bancos del mezclador.
  if ($("prevBank")) {
    $("prevBank").addEventListener("click", () => {
      if (bank > 0) {
        bank--;
        renderChannels();
        updateVolumes();
      }
    });
  }

  if ($("nextBank")) {
    $("nextBank").addEventListener("click", () => {
      if ((bank + 1) * 8 < tracks.length) {
        bank++;
        renderChannels();
        updateVolumes();
      }
    });
  }

  // Inicializar el reproductor.
  populateSelect();
  renderList();

  if (songs.length) {
    loadSong(songs[0]);
  } else {
    renderChannels();
  }
})();
