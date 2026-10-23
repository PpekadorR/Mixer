(() => {
  const songs = window.MULTITRACK_SONGS || [];
  const $ = id => document.getElementById(id);

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

  const colors = [
    "#f4b64b", "#67b9f4", "#b68aff", "#ff8d78",
    "#a5e65a", "#65d6c4", "#ed8fbb", "#aab2bd"
  ];

  const fmt = s => {
    s = Math.max(0, Number.isFinite(s) ? s : 0);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);

    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  const shortFmt = s => fmt(s).slice(0, 5);

  function stopTicker() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function updateDuration() {
    const ds = tracks
      .map(t => t.audio.duration)
      .filter(Number.isFinite);

    duration = ds.length ? Math.max(...ds) : 0;

    const durationEl = $("duration");
    if (durationEl) {
      durationEl.textContent = "DUR " + shortFmt(duration);
    }
  }

  // Crear una pista de audio.
  function makeTrack(meta, index) {
    const audio = new Audio();

    audio.preload = "auto";
    audio.src = meta.file;
    audio.volume = 0;

    audio.addEventListener("loadedmetadata", updateDuration);

    audio.addEventListener("error", () => {
      const n = document.querySelector(
        `[data-track="${index}"] .channel-file`
      );

      if (n) n.textContent = "AUDIO FILE NOT FOUND";
    });

    return {
      meta,
      audio,
      volume: 0.8,
      muted: false,
      index
    };
  }

  // Registrar las pistas en el selector de canciones.
  function populateSelect() {
    const sel = $("songSelect");
    if (!sel) return;

    sel.innerHTML = "";

    if (!songs.length) {
      sel.innerHTML =
        '<option value="">No hay canciones configuradas</option>';
      return;
    }

    songs.forEach(song => {
      const option = document.createElement("option");

      option.value = song.id;
      option.textContent = song.title;

      sel.appendChild(option);
    });

    sel.addEventListener("change", () => {
      const song = songs.find(s => s.id === sel.value);
      if (song) loadSong(song);
    });
  }

  // Lista de canciones.
  function renderList() {
    const songCount = $("songCount");
    const songList = $("songList");

    if (!songCount || !songList) return;

    songCount.textContent =
      `${songs.length} ${songs.length === 1 ? "SESSION" : "SESSIONS"}`;

    songList.innerHTML = "";

    if (!songs.length) {
      songList.innerHTML =
        '<div class="empty">Agrega sesiones en songs.js.</div>';
      return;
    }

    songs.forEach((song, i) => {
      const row = document.createElement("div");

      row.className =
        "song-row" +
        (selectedSong && song.id === selectedSong.id ? " selected" : "");

      row.innerHTML = `
        <div class="song-index">${String(i + 1).padStart(2, "0")}</div>
        <div>
          <div class="song-name"></div>
          <div class="song-detail"></div>
        </div>
        <div class="song-bpm">${Number(song.bpm) || "—"} BPM</div>
        <div class="track-count">${song.tracks.length} TRACKS</div>
      `;

      row.querySelector(".song-name").textContent = song.title;
      row.querySelector(".song-detail").textContent =
        song.artist || "Unknown Artist";

      row.addEventListener("click", () => loadSong(song));

      songList.appendChild(row);
    });
  }

  // Cambiar de canción.
  function loadSong(song) {
    stopAll();

    // Desconectar o limpiar el procesamiento de las pistas anteriores.
    if (window.PekadorEQ &&
        typeof window.PekadorEQ.unregisterTrackEQ === "function") {
      tracks.forEach(track => {
        window.PekadorEQ.unregisterTrackEQ(track.index);
      });
    }

    tracks.forEach(track => {
      track.audio.pause();
      track.audio.src = "";
    });

    selectedSong = song;
    bank = 0;
    soloIndex = null;

    // Restablecer EQ al cambiar de canción.
    if (window.PekadorEQ &&
        typeof window.PekadorEQ.resetAllEQ === "function") {
      window.PekadorEQ.resetAllEQ();
    }

    tracks = song.tracks.map((meta, index) => makeTrack(meta, index));

    if ($("songSelect")) $("songSelect").value = song.id;

    if ($("songTitle")) $("songTitle").textContent = song.title;

    if ($("songMeta")) {
      $("songMeta").textContent =
        `${song.artist || "Unknown Artist"} · ${song.tracks.length} tracks`;
    }

    if ($("bpmValue")) {
      $("bpmValue").innerHTML =
        `${Number(song.bpm) || "---"} <small>BPM</small>`;
    }

    if ($("loadedTracks")) {
      $("loadedTracks").textContent = `${tracks.length} TRACKS`;
    }

    duration = 0;

    if ($("currentTime")) {
      $("currentTime").textContent = "00:00.000";
    }

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
      $("bankLabel").textContent =
        `BANK ${bank + 1} · CH ${start + 1}–${Math.min(start + 8, tracks.length)}`;
    }

    for (let slot = 0; slot < 8; slot++) {
      const track = visible[slot];
      const idx = start + slot;

      // Canal vacío.
      if (!track) {
        const channel = document.createElement("div");

        channel.className = "channel disabled-channel";

        channel.innerHTML = `
          <div class="channel-top">
            <span class="channel-num">${String(idx + 1).padStart(2, "0")}</span>
            <span class="channel-name">EMPTY</span>
          </div>

          <div class="channel-file">No track assigned</div>

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

            <input class="fader" type="range"
              min="0" max="100" value="0" disabled>
          </div>

          <div class="db-value">−∞ dB</div>

          <div class="channel-buttons">
            <button disabled>EQ</button>
            <button disabled>MUTE</button>
            <button disabled>SOLO</button>
          </div>
        `;

        host.appendChild(channel);
        continue;
      }

      const color = track.meta.color || colors[idx % colors.length];
      const channel = document.createElement("div");

      channel.className = "channel";
      channel.dataset.track = idx;
      channel.style.setProperty("--channel", color);

      channel.innerHTML = `
        <div class="channel-top">
          <span class="channel-num">${String(idx + 1).padStart(2, "0")}</span>
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
            <span>+6</span>
            <span>0</span>
            <span>-12</span>
            <span>-∞</span>
          </div>

          <input class="fader"
            type="range"
            min="0"
            max="100"
            value="${Math.round(track.volume * 100)}"
            aria-label="Volumen de canal">
        </div>

        <div class="db-value"></div>

        <div class="channel-buttons">
          <button class="eq-btn" type="button"
            data-eq-track="${idx}">EQ</button>

          <button class="mute-btn" type="button">MUTE</button>

          <button class="solo-btn" type="button">SOLO</button>
        </div>
      `;

      channel.querySelector(".channel-name").textContent =
        track.meta.name || `TRACK ${idx + 1}`;

      channel.querySelector(".channel-file").textContent =
        track.meta.file.split("/").pop();

      // Fader de volumen.
      channel.querySelector(".fader").addEventListener("input", event => {
        track.volume = Number(event.target.value) / 100;
        updateVolumes();
      });

      // Botón EQ.
      channel.querySelector(".eq-btn").addEventListener("click", () => {
        if (!window.PekadorEQ ||
            typeof window.PekadorEQ.openEQ !== "function") {
          alert(
            "No se ha cargado correctamente eq.js. " +
            "Revisa que esté incluido en index.html."
          );
          return;
        }

        window.PekadorEQ.openEQ(
          track.index,
          track.meta.name || `TRACK ${idx + 1}`
        );
      });

      // Botón MUTE.
      channel.querySelector(".mute-btn").addEventListener("click", () => {
        track.muted = !track.muted;

        channel.querySelector(".mute-btn")
          .classList.toggle("active-mute", track.muted);

        updateVolumes();
      });

      // Botón SOLO.
      channel.querySelector(".solo-btn").addEventListener("click", () => {
        soloIndex = soloIndex === track.index ? null : track.index;

        renderChannels();
        updateVolumes();
      });

      host.appendChild(channel);

      setDb(channel, track.volume);

      if (track.muted) {
        channel.querySelector(".mute-btn")
          .classList.add("active-mute");
      }

      if (soloIndex === track.index) {
        channel.querySelector(".solo-btn")
          .classList.add("active-solo");
      }

      // Registrar el audio en el sistema EQ.
      if (window.PekadorEQ &&
          typeof window.PekadorEQ.registerTrackEQ === "function") {
        window.PekadorEQ.registerTrackEQ(track.index, track.audio);
      }
    }

    if ($("prevBank")) {
      $("prevBank").disabled = bank === 0;
    }

    if ($("nextBank")) {
      $("nextBank").disabled = (bank + 1) * 8 >= tracks.length;
    }
  }

  // Mostrar volumen en dB.
  function setDb(channel, volume) {
    const el = channel.querySelector(".db-value");
    if (!el) return;

    el.textContent = volume === 0
      ? "−∞ dB"
      : `${(20 * Math.log10(volume)).toFixed(1)} dB`;
  }

  // Aplicar volumen, MUTE y SOLO.
  function updateVolumes() {
    tracks.forEach((track, i) => {
      const active =
        !track.muted &&
        (soloIndex === null || soloIndex === i);

      track.audio.volume = active
        ? Math.min(1, track.volume * masterVolume)
        : 0;

      const channel = document.querySelector(`[data-track="${i}"]`);

      if (channel) {
        setDb(channel, track.volume);

        channel.classList.toggle("disabled-channel", !active);
      }
    });

    if ($("masterValue")) {
      $("masterValue").textContent = `${Math.round(masterVolume * 100)}%`;
    }
  }

  // Reproducir.
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

      tracks.forEach(track => {
        try {
          track.audio.currentTime = 0;
        } catch (error) {}
      });
    }

    // Iniciar el contexto de audio, si existe.
    if (window.PekadorEQ &&
        typeof window.PekadorEQ.resume === "function") {
      try {
        await window.PekadorEQ.resume();
      } catch (error) {
        console.warn("No se pudo iniciar el contexto de audio:", error);
      }
    }

    playing = true;
    startedAt = performance.now() - pausedAt * 1000;

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="pause-icon"></span>';
    }

    if ($("playState")) {
      $("playState").textContent = "PLAYING";
    }

    updateVolumes();

    const results = await Promise.allSettled(
      tracks.map(track => track.audio.play())
    );

    if (results.every(result => result.status === "rejected")) {
      playing = false;

      if ($("playBtn")) {
        $("playBtn").innerHTML = '<span class="play-icon"></span>';
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

    pausedAt = Math.max(0, (performance.now() - startedAt) / 1000);

    tracks.forEach(track => track.audio.pause());

    playing = false;
    stopTicker();

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="play-icon"></span>';
    }

    if ($("playState")) {
      $("playState").textContent = "PAUSED";
    }
  }

  // Detener y volver al inicio.
  function stopAll() {
    tracks.forEach(track => {
      track.audio.pause();

      try {
        track.audio.currentTime = 0;
      } catch (error) {}
    });

    playing = false;
    pausedAt = 0;
    startedAt = 0;

    stopTicker();

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="play-icon"></span>';
    }

    if ($("playState")) {
      $("playState").textContent = "STOPPED";
    }

    if ($("currentTime")) {
      $("currentTime").textContent = "00:00.000";
    }
  }

  // Actualizar el contador y los medidores.
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

    // Medidores visuales simulados.
    tracks.forEach((track, i) => {
      const meter = document.querySelector(
        `[data-track="${i}"] .meter-fill`
      );

      if (meter) {
        const active =
          !track.muted &&
          (soloIndex === null || soloIndex === i);

        meter.style.width =
          playing && active
            ? `${Math.max(3, Math.random() * 65 * track.volume * masterVolume)}%`
            : "0%";
      }
    });

    const meterL = $("masterMeterL");
    const meterR = $("masterMeterR");

    if (meterL) {
      meterL.style.width =
        `${playing ? Math.random() * 75 * masterVolume : 0}%`;
    }

    if (meterR) {
      meterR.style.width =
        `${playing ? Math.random() * 75 * masterVolume : 0}%`;
    }

    raf = requestAnimationFrame(tick);
  }

  // Controles principales.
  if ($("playBtn")) {
    $("playBtn").addEventListener("click", () => {
      playing ? pause() : play();
    });
  }

  if ($("stopBtn")) {
    $("stopBtn").addEventListener("click", stopAll);
  }

  if ($("restartBtn")) {
    $("restartBtn").addEventListener("click", () => {
      stopAll();

      tracks.forEach(track => {
        try {
          track.audio.currentTime = 0;
        } catch (error) {}
      });
    });
  }

  if ($("masterVolume")) {
    $("masterVolume").addEventListener("input", event => {
      masterVolume = Number(event.target.value) / 100;
      updateVolumes();
    });
  }

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

  // Inicialización.
  populateSelect();
  renderList();

  if (songs.length) {
    loadSong(songs[0]);
  } else {
    renderChannels();
  }
})();
