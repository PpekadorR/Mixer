/* PPEKADORR MULTITRACK CONSOLE
   Reproductor sincronizado + mezclador + formas de onda
*/
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
  let pausedAt = 0;
  let duration = 0;
  let masterVolume = 0.85;
  let soloIndex = null;
  let raf = null;

  // La anchura de la línea de tiempo se expresa en píxeles por segundo.
  let pixelsPerSecond = 60;
  let fitZoom = false;
  let waveformContext = null;
  let songLoadId = 0;

  const waveformCache = new Map();

  const fmt = (seconds) => {
    seconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);

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

  function currentTime() {
    const activeTrack = tracks.find(
      (track) => Number.isFinite(track.audio.currentTime)
    );

    return activeTrack ? activeTrack.audio.currentTime : pausedAt;
  }

  function stopTicker() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  function getWaveformContext() {
    if (!waveformContext) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Este navegador no admite Web Audio API.");
      }

      waveformContext = new AudioContextClass();
    }

    return waveformContext;
  }

  function updateDuration() {
    const lengths = tracks
      .map((track) => track.audio.duration)
      .filter((value) => Number.isFinite(value) && value > 0);

    duration = lengths.length ? Math.max(...lengths) : 0;

    if ($("duration")) {
      $("duration").textContent = `DUR ${shortFmt(duration)}`;
    }

    renderArrangement();
  }

  function makeTrack(meta, index) {
    const audio = new Audio();

    audio.preload = "auto";
    audio.src = meta.file;
    audio.volume = 1;

    audio.addEventListener("loadedmetadata", () => {
      updateDuration();
      renderArrangement();
    });

    audio.addEventListener("error", () => {
      const label = document.querySelector(
        `[data-track="${index}"] .channel-file`
      );

      if (label) label.textContent = "NO SE ENCONTRÓ EL AUDIO";

      const wave = document.querySelector(
        `.arrangement-track[data-wave-track="${index}"]`
      );

      if (wave) {
        wave.classList.remove("loading");
        wave.classList.add("wave-error");
      }
    });

    if (window.PekadorEQ) {
      try {
        window.PekadorEQ.registerTrackEQ(index, audio);
        window.PekadorEQ.setTrackVolume(index, 1);
      } catch (error) {
        console.error("No se pudo registrar la pista en el EQ:", error);
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
      const song = songs.find((item) => item.id === select.value);
      if (song) loadSong(song);
    });
  }

  function renderList() {
    const count = $("songCount");
    const list = $("songList");

    if (count) {
      count.textContent =
        `${songs.length} ${songs.length === 1 ? "SESSION" : "SESSIONS"}`;
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
        (selectedSong && song.id === selectedSong.id ? " selected" : "");

      row.innerHTML = `
        <div class="song-index">${String(index + 1).padStart(2, "0")}</div>
        <div>
          <div class="song-name"></div>
          <div class="song-detail"></div>
        </div>
        <div class="song-bpm">${Number(song.bpm) || "—"} BPM</div>
        <div class="track-count">${song.tracks.length} TRACKS</div>
      `;

      row.querySelector(".song-name").textContent = song.title;
      row.querySelector(".song-detail").textContent =
        song.artist || "Artista desconocido";

      row.addEventListener("click", () => loadSong(song));
      list.appendChild(row);
    });
  }

  function loadSong(song) {
    const thisLoad = ++songLoadId;

    stopAll();

    tracks.forEach((track) => {
      track.audio.pause();

      if (window.PekadorEQ) {
        window.PekadorEQ.unregisterTrackEQ(track.index);
      }

      track.audio.removeAttribute("src");
      track.audio.load();
    });

    selectedSong = song;
    bank = 0;
    soloIndex = null;
    pausedAt = 0;
    duration = 0;

    tracks = (song.tracks || []).map((meta, index) =>
      makeTrack(meta, index)
    );

    if ($("songSelect")) $("songSelect").value = song.id;
    if ($("songTitle")) $("songTitle").textContent = song.title;

    if ($("songMeta")) {
      $("songMeta").textContent =
        `${song.artist || "Artista desconocido"} · ${tracks.length} pistas`;
    }

    if ($("bpmValue")) {
      $("bpmValue").innerHTML =
        `${Number(song.bpm) || "---"} <small>BPM</small>`;
    }

    if ($("loadedTracks")) {
      $("loadedTracks").textContent = `${tracks.length} TRACKS`;
    }

    if ($("currentTime")) $("currentTime").textContent = fmt(0);
    if ($("duration")) $("duration").textContent = "DUR 00:00";

    renderChannels();
    renderList();
    updateVolumes();
    renderArrangement();

    // Las formas de onda se cargan por separado para no bloquear el mezclador.
    tracks.forEach((track) => {
      loadWaveform(track, thisLoad);
    });
  }

  /* =========================
     MEZCLADOR
  ========================= */

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

      if (!track) {
        const empty = document.createElement("div");
        empty.className = "channel disabled-channel";
        empty.innerHTML = `
          <div class="channel-top">
            <span class="channel-num">${String(index + 1).padStart(2, "0")}</span>
            <span class="channel-name">VACÍO</span>
          </div>
          <div class="channel-file">Sin pista asignada</div>
          <div class="meter-label"><span>NIVEL</span><span>—</span></div>
          <div class="meter"><div class="meter-fill"></div></div>
          <div class="fader-zone">
            <div class="scale"><span>400%</span><span>200%</span><span>100%</span><span>0%</span></div>
            <input class="fader" type="range" min="0" max="400" value="0" disabled>
          </div>
          <div class="db-value">−∞ dB</div>
          <div class="channel-buttons">
            <button disabled>MUTE</button>
            <button disabled>SOLO</button>
            <button disabled>EQ</button>
          </div>
        `;
        host.appendChild(empty);
        continue;
      }

      const color = track.meta.color || colors[index % colors.length];
      const channel = document.createElement("div");

      channel.className = "channel";
      channel.dataset.track = index;
      channel.style.setProperty("--channel", color);

      channel.innerHTML = `
        <div class="channel-top">
          <span class="channel-num">${String(index + 1).padStart(2, "0")}</span>
          <span class="channel-name"></span>
        </div>
        <div class="channel-file"></div>
        <div class="meter-label">
          <span>NIVEL</span>
          <span class="peak-label">GAIN</span>
        </div>
        <div class="meter"><div class="meter-fill"></div></div>
        <div class="fader-zone">
          <div class="scale"><span>400%</span><span>200%</span><span>100%</span><span>0%</span></div>
          <input class="fader" type="range" min="0" max="400" step="1"
            value="${Math.round(track.volume * 100)}"
            aria-label="Volumen de canal">
        </div>
        <div class="db-value"></div>
        <div class="channel-buttons">
          <button class="mute-btn">MUTE</button>
          <button class="solo-btn">SOLO</button>
          <button class="eq-btn" data-eq-track="${index}" data-track-name="">EQ</button>
        </div>
      `;

      channel.querySelector(".channel-name").textContent =
        track.meta.name || `PISTA ${index + 1}`;

      channel.querySelector(".channel-file").textContent =
        String(track.meta.file || "").split("/").pop();

      channel.querySelector(".eq-btn").dataset.trackName =
        track.meta.name || `PISTA ${index + 1}`;

      channel.querySelector(".fader").addEventListener("input", (event) => {
        track.volume = Number(event.target.value) / 100;
        updateVolumes();
      });

      channel.querySelector(".mute-btn").addEventListener("click", () => {
        track.muted = !track.muted;
        renderChannels();
        updateVolumes();
      });

      channel.querySelector(".solo-btn").addEventListener("click", () => {
        soloIndex = soloIndex === index ? null : index;
        renderChannels();
        updateVolumes();
      });

      host.appendChild(channel);

      setDb(channel, track.volume);

      channel.querySelector(".mute-btn").classList.toggle("active-mute", track.muted);
      channel.querySelector(".solo-btn").classList.toggle(
        "active-solo",
        soloIndex === index
      );
    }

    if ($("prevBank")) $("prevBank").disabled = bank === 0;
    if ($("nextBank")) $("nextBank").disabled = (bank + 1) * 8 >= tracks.length;
  }

  function setDb(channel, volume) {
    const label = channel.querySelector(".db-value");
    if (!label) return;

    label.textContent = volume === 0
      ? "−∞ dB"
      : `${(20 * Math.log10(volume)).toFixed(1)} dB`;
  }

  function updateVolumes() {
    tracks.forEach((track, index) => {
      const active =
        !track.muted && (soloIndex === null || soloIndex === index);

      if (window.PekadorEQ) {
        window.PekadorEQ.setTrackActive(index, active);
        window.PekadorEQ.setTrackVolume(index, track.volume);
      } else {
        track.audio.volume = active
          ? Math.min(1, track.volume * masterVolume)
          : 0;
      }

      const channel = document.querySelector(`[data-track="${index}"]`);

      if (channel) {
        setDb(channel, track.volume);
        channel.classList.toggle("muted-channel", !active);
      }
    });

    if (window.PekadorEQ) {
      window.PekadorEQ.setMasterVolume(masterVolume);
    }

    if ($("masterValue")) {
      $("masterValue").textContent = `${Math.round(masterVolume * 100)}%`;
    }
  }

  /* =========================
     REPRODUCCIÓN SINCRONIZADA
  ========================= */

  async function play() {
    if (!selectedSong) {
      if (songs[0]) loadSong(songs[0]);
      else return;
    }

    if (playing) return;

    if (duration && pausedAt >= duration) {
      seekTo(0);
    }

    try {
      if (window.PekadorEQ) await window.PekadorEQ.resume();
    } catch (error) {
      console.warn("No se pudo reanudar el audio:", error);
    }

    playing = true;

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="pause-icon"></span>';
    }

    updateVolumes();

    const results = await Promise.allSettled(
      tracks.map((track) => track.audio.play())
    );

    if (results.length && results.every((result) => result.status === "rejected")) {
      playing = false;
      if ($("playBtn")) $("playBtn").innerHTML = '<span class="play-icon"></span>';
      return;
    }

    tick();
  }

  function pause() {
    if (!playing) return;

    pausedAt = currentTime();

    tracks.forEach((track) => track.audio.pause());

    playing = false;
    stopTicker();

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="play-icon"></span>';
    }

    updatePlayhead(pausedAt);
  }

  function stopAll() {
    tracks.forEach((track) => {
      track.audio.pause();
      try {
        track.audio.currentTime = 0;
      } catch (_) {}
    });

    playing = false;
    pausedAt = 0;

    stopTicker();

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="play-icon"></span>';
    }

    if ($("currentTime")) $("currentTime").textContent = fmt(0);

    document.querySelectorAll(".meter-fill").forEach((meter) => {
      meter.style.width = "0%";
    });

    if ($("masterMeterL")) $("masterMeterL").style.width = "0%";
    if ($("masterMeterR")) $("masterMeterR").style.width = "0%";

    updatePlayhead(0);
  }

  function seekTo(seconds) {
    const target = Math.max(0, Math.min(duration || Infinity, Number(seconds) || 0));
    pausedAt = target;

    tracks.forEach((track) => {
      try {
        track.audio.currentTime = target;
      } catch (_) {}
    });

    if ($("currentTime")) $("currentTime").textContent = fmt(target);

    updatePlayhead(target);
  }

  function tick() {
    if (!playing) return;

    const elapsed = currentTime();

    if ($("currentTime")) {
      $("currentTime").textContent = fmt(elapsed);
    }

    updatePlayhead(elapsed);

    if (duration && elapsed >= duration) {
      stopAll();
      return;
    }

    // Indicadores visuales aproximados del mezclador.
    tracks.forEach((track, index) => {
      const meter = document.querySelector(
        `[data-track="${index}"] .meter-fill`
      );

      if (meter) {
        const active =
          !track.muted && (soloIndex === null || soloIndex === index);

        const level = active
          ? Math.min(100, Math.random() * 65 * Math.min(track.volume, 1) * masterVolume)
          : 0;

        meter.style.width = `${level}%`;
      }
    });

    const left = $("masterMeterL");
    const right = $("masterMeterR");

    if (left) left.style.width = `${Math.random() * 75 * masterVolume}%`;
    if (right) right.style.width = `${Math.random() * 75 * masterVolume}%`;

    raf = requestAnimationFrame(tick);
  }

  /* =========================
     ARREGLO MULTIPISTA
  ========================= */

  function getArrangementWidth() {
    const scroll = $("arrangementScroll");
    const available = scroll ? scroll.clientWidth : 900;

    if (fitZoom && duration > 0) {
      return Math.max(available, available);
    }

    return Math.max(available, Math.ceil(Math.max(duration, 30) * pixelsPerSecond));
  }

  function renderArrangement() {
    const labels = $("arrangementLabels");
    const ruler = $("timelineRuler");
    const rows = $("arrangementTracks");
    const content = $("arrangementContent");
    const status = $("arrangementStatus");
    const count = $("arrangementTrackCount");

    if (!labels || !ruler || !rows || !content) return;

    const scroll = $("arrangementScroll");
    const viewportWidth = scroll ? scroll.clientWidth : 900;

    let pxPerSec = pixelsPerSecond;

    if (fitZoom && duration > 0) {
      pxPerSec = Math.max(2, viewportWidth / duration);
    }

    const seconds = Math.max(duration, 30);
    const width = Math.max(viewportWidth, Math.ceil(seconds * pxPerSec));

    content.style.width = `${width}px`;
    ruler.style.width = `${width}px`;
    rows.style.width = `${width}px`;

    labels.innerHTML = "";
    ruler.innerHTML = "";
    rows.innerHTML = "";

    tracks.forEach((track, index) => {
      const color = track.meta.color || colors[index % colors.length];

      const label = document.createElement("div");
      label.className = "arrangement-track-label";
      label.style.setProperty("--track-color", color);

      const name = document.createElement("strong");
      name.textContent = track.meta.name || `PISTA ${index + 1}`;

      const file = document.createElement("small");
      file.textContent = String(track.meta.file || "").split("/").pop();

      label.append(name, file);
      labels.appendChild(label);

      const row = document.createElement("div");
      row.className = "arrangement-track loading";
      row.dataset.waveTrack = index;
      row.style.setProperty("--track-color", color);
      row.style.width = `${width}px`;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = 66;
      canvas.setAttribute("aria-label", `Forma de onda: ${name.textContent}`);

      row.appendChild(canvas);

      row.addEventListener("click", (event) => {
        const rect = row.getBoundingClientRect();
        const x = event.clientX - rect.left;
        seekTo(x / pxPerSec);
      });

      rows.appendChild(row);

      const peaks = waveformCache.get(track.meta.file);

      if (peaks) {
        row.classList.remove("loading");
        drawWaveform(canvas, peaks, width, color);
      }
    });

    const step = chooseRulerStep(pxPerSec);

    for (let time = 0; time <= seconds; time += step) {
      const mark = document.createElement("div");
      mark.className = "timeline-mark";
      mark.style.left = `${time * pxPerSec}px`;

      const label = document.createElement("span");
      label.textContent = shortFmt(time);
      mark.appendChild(label);
      ruler.appendChild(mark);
    }

    ruler.style.cursor = "crosshair";
    ruler.addEventListener("click", onRulerClick);
    ruler.dataset.pxPerSec = String(pxPerSec);

    if (status) {
      status.textContent = tracks.length ? "SESIÓN CARGADA" : "ESPERANDO SESIÓN";
    }

    if (count) {
      count.textContent = `${tracks.length} ${tracks.length === 1 ? "pista" : "pistas"}`;
    }

    const zoomValue = $("zoomValue");
    if (zoomValue) {
      zoomValue.textContent = fitZoom
        ? "FIT"
        : `${Math.round((pixelsPerSecond / 60) * 100)}%`;
    }

    updatePlayhead(currentTime());
  }

  function onRulerClick(event) {
    const ruler = $("timelineRuler");
    if (!ruler) return;

    const rect = ruler.getBoundingClientRect();
    const pxPerSec = Number(ruler.dataset.pxPerSec) || pixelsPerSecond;
    const x = event.clientX - rect.left;

    seekTo(x / pxPerSec);
  }

  function chooseRulerStep(pxPerSec) {
    const choices = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    return choices.find((seconds) => seconds * pxPerSec >= 75) || 600;
  }

  function updatePlayhead(time) {
    const playhead = $("arrangementPlayhead");
    const ruler = $("timelineRuler");
    if (!playhead || !ruler) return;

    const pxPerSec = Number(ruler.dataset.pxPerSec) || pixelsPerSecond;
    playhead.style.left = `${Math.max(0, time) * pxPerSec}px`;
  }

  function drawWaveform(canvas, peaks, width, color) {
    const height = 66;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Línea central.
    ctx.strokeStyle = "#343c46";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!peaks || !peaks.length) return;

    const step = width / peaks.length;

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = Math.max(1, step * 0.75);
    ctx.beginPath();

    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const amp = peaks[i] * (height * 0.43);
      ctx.moveTo(x, height / 2 - amp);
      ctx.lineTo(x, height / 2 + amp);
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  async function loadWaveform(track, loadId) {
    const url = track.meta.file;
    if (!url) return;

    const rowSelector = `.arrangement-track[data-wave-track="${track.index}"]`;

    try {
      let peaks = waveformCache.get(url);

      if (!peaks) {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.arrayBuffer();
        const ctx = getWaveformContext();
        const audioBuffer = await ctx.decodeAudioData(data);

        peaks = buildPeaks(audioBuffer, 1800);
        waveformCache.set(url, peaks);
      }

      if (loadId !== songLoadId) return;

      const row = document.querySelector(rowSelector);
      const canvas = row && row.querySelector("canvas");

      if (row && canvas) {
        row.classList.remove("loading", "wave-error");

        const ruler = $("timelineRuler");
        const pxPerSec = Number(ruler?.dataset.pxPerSec) || pixelsPerSecond;
        const width = Math.max(1, Math.ceil(Math.max(duration, 30) * pxPerSec));

        drawWaveform(canvas, peaks, width, track.meta.color || colors[track.index % colors.length]);
      }
    } catch (error) {
      console.warn("No se pudo generar la forma de onda:", url, error);

      if (loadId !== songLoadId) return;

      const row = document.querySelector(rowSelector);
      if (row) {
        row.classList.remove("loading");
        row.classList.add("wave-error");
      }
    }
  }

  function buildPeaks(audioBuffer, targetPoints) {
    const channelCount = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const blockSize = Math.max(1, Math.floor(length / targetPoints));
    const peaks = [];

    for (let start = 0; start < length; start += blockSize) {
      const end = Math.min(length, start + blockSize);
      let peak = 0;

      for (let channel = 0; channel < channelCount; channel++) {
        const samples = audioBuffer.getChannelData(channel);

        for (let i = start; i < end; i++) {
          const value = Math.abs(samples[i]);
          if (value > peak) peak = value;
        }
      }

      peaks.push(peak);
    }

    return peaks;
  }

  function setZoom(multiplier) {
    fitZoom = false;
    pixelsPerSecond = Math.max(
      10,
      Math.min(600, pixelsPerSecond * multiplier)
    );

    renderArrangement();
  }

  function zoomToFit() {
    fitZoom = true;
    renderArrangement();
  }

  /* =========================
     CONTROLES
  ========================= */

  if ($("playBtn")) {
    $("playBtn").addEventListener("click", () => {
      playing ? pause() : play();
    });
  }

  if ($("stopBtn")) $("stopBtn").addEventListener("click", stopAll);

  if ($("restartBtn")) {
    $("restartBtn").addEventListener("click", () => {
      stopAll();
      seekTo(0);
    });
  }

  if ($("masterVolume")) {
    $("masterVolume").addEventListener("input", (event) => {
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

  if ($("zoomIn")) $("zoomIn").addEventListener("click", () => setZoom(1.5));
  if ($("zoomOut")) $("zoomOut").addEventListener("click", () => setZoom(1 / 1.5));
  if ($("zoomFit")) $("zoomFit").addEventListener("click", zoomToFit);

  // Mantener el ancho y la regla actualizados al cambiar el tamaño de ventana.
  window.addEventListener("resize", () => {
    renderArrangement();
  });

  // Inicialización.
  populateSelect();
  renderList();

  if (songs.length) {
    loadSong(songs[0]);
  } else {
    renderChannels();
    renderArrangement();
  }
})();
