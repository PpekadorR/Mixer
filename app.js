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
  const localObjectUrls = new Set();

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

    select.innerHTML = '<option value="">Sesión en blanco</option>';
    songs.forEach((song) => {
      const option = document.createElement("option");
      option.value = song.id;
      option.textContent = song.title;
      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      const song = songs.find((item) => String(item.id) === select.value);
      if (song) loadSong(song);
      else clearSession();
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

  function releaseTracks() {
    tracks.forEach((track) => {
      track.audio.pause();

      if (window.PekadorEQ) {
        try {
          window.PekadorEQ.unregisterTrackEQ(track.index);
        } catch (_) {}
      }

      track.audio.removeAttribute("src");
      track.audio.load();

      if (track.meta.localObjectUrl) {
        URL.revokeObjectURL(track.meta.localObjectUrl);
        localObjectUrls.delete(track.meta.localObjectUrl);
      }
    });

    tracks = [];
  }

  function clearSession() {
    ++songLoadId;
    stopAll();
    releaseTracks();

    selectedSong = null;
    soloIndex = null;
    pausedAt = 0;
    duration = 0;

    if ($("songSelect")) $("songSelect").value = "";
    if ($("songTitle")) $("songTitle").textContent = "Sesión en blanco";

    if ($("songMeta")) {
      $("songMeta").textContent =
        "Arrastra audios al arreglo o pulsa + AÑADIR AUDIOS";
    }

    if ($("bpmValue")) {
      $("bpmValue").innerHTML = '--- <small>BPM</small>';
    }

    if ($("loadedTracks")) $("loadedTracks").textContent = "0 TRACKS";
    if ($("currentTime")) $("currentTime").textContent = fmt(0);
    if ($("duration")) $("duration").textContent = "DUR 00:00";

    renderChannels();
    renderList();
    updateVolumes();
    updateDuration();
    renderArrangement();
  }

  function loadSong(song) {
    const thisLoad = ++songLoadId;

    stopAll();
    releaseTracks();

    selectedSong = song;
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
     Todos los canales visibles simultáneamente.
  ========================= */

  function renderChannels() {
    const host = $("channels");
    if (!host) return;

    host.innerHTML = "";

    // Ocultar los controles de bancos si existen en el HTML.
    if ($("bankLabel")) {
      $("bankLabel").textContent = `${tracks.length} CANALES`;
    }

    if ($("prevBank")) $("prevBank").hidden = true;
    if ($("nextBank")) $("nextBank").hidden = true;

    tracks.forEach((track, index) => {
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
          <div class="scale">
            <span>400%</span>
            <span>200%</span>
            <span>100%</span>
            <span>0%</span>
          </div>
          <input
            class="fader"
            type="range"
            min="0"
            max="400"
            step="1"
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
        track.meta.name || `PISTA ${index + 1}`;

      channel.querySelector(".channel-file").textContent =
        track.meta.originalName ||
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

      channel.querySelector(".mute-btn").classList.toggle(
        "active-mute",
        track.muted
      );

      channel.querySelector(".solo-btn").classList.toggle(
        "active-solo",
        soloIndex === index
      );
    });

    updateVolumes();
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
    if (!tracks.length || playing) return;

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

    if (
      results.length &&
      results.every((result) => result.status === "rejected")
    ) {
      playing = false;

      if ($("playBtn")) {
        $("playBtn").innerHTML = '<span class="play-icon"></span>';
      }

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

    document.querySelectorAll(".meter-fill").forEach((meter) => {
      meter.style.width = "0%";
    });
    if ($("masterMeterL")) $("masterMeterL").style.width = "0%";
    if ($("masterMeterR")) $("masterMeterR").style.width = "0%";
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
    const target = Math.max(
      0,
      Math.min(duration || Infinity, Number(seconds) || 0)
    );

    pausedAt = target;

    tracks.forEach((track) => {
      try {
        track.audio.currentTime = target;
      } catch (_) {}
    });

    if ($("currentTime")) $("currentTime").textContent = fmt(target);

    updatePlayhead(target);
  }

  function rmsToMeterPercent(rms) {
    if (!Number.isFinite(rms) || rms <= 0.0005) return 0;
    const db = 20 * Math.log10(rms);
    // Escala visual: -66 dBFS = 0 %, 0 dBFS = 100 %.
    return Math.max(0, Math.min(100, ((db + 66) / 66) * 100));
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

    // Medidores de canal: señal RMS real después del EQ y del fader.
    tracks.forEach((track, index) => {
      const meter = document.querySelector(
        `[data-track="${index}"] .meter-fill`
      );
      if (!meter) return;

      const active =
        !track.muted && (soloIndex === null || soloIndex === index);
      const rms = active && window.PekadorEQ?.getTrackMeter
        ? window.PekadorEQ.getTrackMeter(index)
        : 0;

      meter.style.width = `${rmsToMeterPercent(rms)}%`;
    });

    // Medidores master: señal real después del volumen maestro.
    const left = $("masterMeterL");
    const right = $("masterMeterR");
    const master = window.PekadorEQ?.getMasterMeters
      ? window.PekadorEQ.getMasterMeters()
      : { left: 0, right: 0 };

    if (left) left.style.width = `${rmsToMeterPercent(master.left)}%`;
    if (right) right.style.width = `${rmsToMeterPercent(master.right)}%`;

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

    return Math.max(
      available,
      Math.ceil(Math.max(duration, 30) * pixelsPerSecond)
    );
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
      file.textContent =
        track.meta.originalName ||
        String(track.meta.file || "").split("/").pop();

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

    // Evita acumular eventos al redibujar la regla.
    ruler.onclick = onRulerClick;
    ruler.dataset.pxPerSec = String(pxPerSec);

    if (status) {
      status.textContent = tracks.length
        ? "SESIÓN CARGADA"
        : "ESPERANDO SESIÓN";
    }

    if (count) {
      count.textContent =
        `${tracks.length} ${tracks.length === 1 ? "pista" : "pistas"}`;
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
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const center = height / 2;
    ctx.strokeStyle = "#343c46";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(width, center);
    ctx.stroke();

    if (!peaks || !peaks.length || width <= 0) return;

    const step = width / peaks.length;
    const maxAmp = height * 0.44;

    // Silueta continua simétrica basada en los picos del audio decodificado.
    ctx.beginPath();
    ctx.moveTo(0, center);

    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const amp = Math.max(0, Math.min(1, peaks[i])) * maxAmp;
      ctx.lineTo(x, center - amp);
    }

    ctx.lineTo(width, center);

    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = i * step;
      const amp = Math.max(0, Math.min(1, peaks[i])) * maxAmp;
      ctx.lineTo(x, center + amp);
    }

    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.fill();

    // Borde superior suave para definir los transitorios sin bloques.
    ctx.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const amp = Math.max(0, Math.min(1, peaks[i])) * maxAmp;
      if (i === 0) ctx.moveTo(x, center - amp);
      else ctx.lineTo(x, center - amp);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  async function loadWaveform(track, loadId) {
    const url = track.meta.file;
    if (!url) return;

    const rowSelector =
      `.arrangement-track[data-wave-track="${track.index}"]`;

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
        const pxPerSec =
          Number(ruler?.dataset.pxPerSec) || pixelsPerSecond;

        const width = Math.max(
          1,
          Math.ceil(Math.max(duration, 30) * pxPerSec)
        );

        drawWaveform(
          canvas,
          peaks,
          width,
          track.meta.color || colors[track.index % colors.length]
        );
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

  if ($("stopBtn")) {
    $("stopBtn").addEventListener("click", stopAll);
  }

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

  // Los controles de banco se mantienen inactivos por compatibilidad con el HTML.
  if ($("prevBank")) $("prevBank").hidden = true;
  if ($("nextBank")) $("nextBank").hidden = true;

  if ($("zoomIn")) {
    $("zoomIn").addEventListener("click", () => setZoom(1.5));
  }

  if ($("zoomOut")) {
    $("zoomOut").addEventListener("click", () => setZoom(1 / 1.5));
  }

  if ($("zoomFit")) {
    $("zoomFit").addEventListener("click", zoomToFit);
  }

  // Mantener el ancho y la regla actualizados al cambiar el tamaño de ventana.
  window.addEventListener("resize", () => {
    renderArrangement();
  });

  /* =========================
     PROYECTOS JSON
     Guarda la mezcla, no copia los archivos de audio al JSON.
  ========================= */

  function safeFileName(value) {
    return String(value || "PpekadorR-Proyecto")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "") || "PpekadorR-Proyecto";
  }

  function exportProject() {
    const project = {
      format: "PpekadorR-Multitrack-Project",
      version: 1,
      projectName: selectedSong?.title || "Mi mezcla",
      savedAt: new Date().toISOString(),
      masterVolume,
      masterEQ: window.PekadorEQ?.getMasterEQState
        ? window.PekadorEQ.getMasterEQState()
        : { enabled: true, gains: Array(8).fill(0) },
      session: selectedSong ? {
        id: selectedSong.id ?? null,
        title: selectedSong.title || "Sesión local",
        artist: selectedSong.artist || "",
        bpm: Number(selectedSong.bpm) || null
      } : null,
      soloIndex,
      tracks: tracks.map((track, index) => {
        const isLocal = Boolean(track.meta.localObjectUrl);
        const eq = window.PekadorEQ?.getTrackSettings
          ? window.PekadorEQ.getTrackSettings(index)
          : null;

        return {
          index,
          source: isLocal ? "local" : "url",
          file: isLocal ? null : (track.meta.file || null),
          name: track.meta.name || `PISTA ${index + 1}`,
          originalName: track.meta.originalName ||
            String(track.meta.file || "").split("/").pop(),
          color: track.meta.color || colors[index % colors.length],
          volume: track.volume,
          muted: Boolean(track.muted),
          solo: soloIndex === index,
          eq: eq ? { enabled: eq.enabled, gains: eq.gains } : {
            enabled: true,
            gains: Array(8).fill(0)
          }
        };
      })
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(project.projectName)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function isValidProject(project) {
    return Boolean(
      project &&
      typeof project === "object" &&
      project.format === "PpekadorR-Multitrack-Project" &&
      Array.isArray(project.tracks) &&
      project.tracks.length <= 200 &&
      project.tracks.every((track) => track && typeof track === "object")
    );
  }

  function matchLocalAudioFiles(projectTracks, selectedFiles) {
    const used = new Set();
    const matches = new Map();

    projectTracks.forEach((saved, index) => {
      if (saved.source !== "local") return;
      const wanted = String(saved.originalName || "").toLocaleLowerCase();
      const matchIndex = selectedFiles.findIndex((file, fileIndex) =>
        !used.has(fileIndex) && file.name.toLocaleLowerCase() === wanted
      );
      if (matchIndex >= 0) {
        used.add(matchIndex);
        matches.set(index, selectedFiles[matchIndex]);
      }
    });

    return matches;
  }

  function restoreProject(project, selectedAudioFiles = []) {
    if (!isValidProject(project)) {
      alert("El archivo no es un proyecto válido de PpekadorR o su formato no es compatible.");
      return false;
    }

    const localTracks = project.tracks.filter((track) => track.source === "local");
    const localMatches = matchLocalAudioFiles(project.tracks, selectedAudioFiles);
    const missing = [];

    localTracks.forEach((saved) => {
      const index = project.tracks.indexOf(saved);
      if (!localMatches.has(index)) missing.push(saved.originalName || saved.name || `Pista ${index + 1}`);
    });

    if (missing.length) {
      alert(
        "No se cargó el proyecto porque faltan estos audios locales:\n\n" +
        missing.join("\n") +
        "\n\nSelecciona los archivos originales con sus nombres correspondientes e inténtalo otra vez."
      );
      return false;
    }

    const thisLoad = ++songLoadId;
    stopAll();
    releaseTracks();

    masterVolume = Math.max(0, Math.min(1, Number(project.masterVolume ?? 0.85)));
    soloIndex = Number.isInteger(project.soloIndex) ? project.soloIndex : null;
    if (window.PekadorEQ) {
      window.PekadorEQ.setMasterVolume(masterVolume);
      if (window.PekadorEQ.setMasterEQState) {
        window.PekadorEQ.setMasterEQState(project.masterEQ || { enabled: true, gains: Array(8).fill(0) });
      }
    }

    const sessionId = project.session?.id;
    const catalogSong = songs.find((song) => String(song.id) === String(sessionId));
    selectedSong = catalogSong || (project.session ? {
      id: project.session.id || null,
      title: project.session.title || project.projectName || "Proyecto importado",
      artist: project.session.artist || "",
      bpm: project.session.bpm || null,
      tracks: []
    } : null);

    tracks = project.tracks.map((saved, index) => {
      let file = saved.file;
      let localObjectUrl = null;

      if (saved.source === "local") {
        localObjectUrl = URL.createObjectURL(localMatches.get(index));
        localObjectUrls.add(localObjectUrl);
        file = localObjectUrl;
      }

      const meta = {
        id: `project-${index}-${Date.now()}`,
        name: saved.name || `PISTA ${index + 1}`,
        originalName: saved.originalName || String(file || "").split("/").pop(),
        file: file || "",
        color: saved.color || colors[index % colors.length],
        ...(localObjectUrl ? { localObjectUrl } : {})
      };
      const track = makeTrack(meta, index);
      const volume = Number(saved.volume);
      track.volume = Number.isFinite(volume) ? Math.max(0, Math.min(4, volume)) : 1;
      track.muted = Boolean(saved.muted);

      if (window.PekadorEQ) {
        window.PekadorEQ.setTrackVolume(index, track.volume);
        if (window.PekadorEQ.setTrackEQState) {
          window.PekadorEQ.setTrackEQState(index, saved.eq || { enabled: true, gains: Array(8).fill(0) });
        }
      }

      if (saved.solo) soloIndex = index;
      return track;
    });

    if (soloIndex !== null && (soloIndex < 0 || soloIndex >= tracks.length)) {
      soloIndex = null;
    }

    if ($("songSelect")) {
      const catalogId = catalogSong ? catalogSong.id : "";
      $("songSelect").value = catalogId;
    }
    if ($("songTitle")) {
      $("songTitle").textContent = selectedSong?.title || project.projectName || "Proyecto importado";
    }
    if ($("songMeta")) {
      const artist = selectedSong?.artist ? `${selectedSong.artist} · ` : "";
      $("songMeta").textContent = `${artist}${tracks.length} pistas · proyecto importado`;
    }
    if ($("bpmValue")) {
      $("bpmValue").innerHTML = `${Number(selectedSong?.bpm) || "---"} <small>BPM</small>`;
    }
    if ($("loadedTracks")) $("loadedTracks").textContent = `${tracks.length} TRACKS`;
    if ($("currentTime")) $("currentTime").textContent = fmt(0);
    if ($("masterVolume")) $("masterVolume").value = String(Math.round(masterVolume * 100));

    pausedAt = 0;
    duration = 0;
    renderChannels();
    renderList();
    updateVolumes();
    updateDuration();
    renderArrangement();
    tracks.forEach((track) => loadWaveform(track, thisLoad));
    return true;
  }

  function setupProjectImportExport() {
    const tools = document.querySelector(".arrangement-tools");
    if (!tools) return;

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.id = "exportProjectBtn";
    exportButton.className = "project-tool-btn";
    exportButton.textContent = "EXPORTAR .JSON";
    exportButton.title = "Descargar los ajustes de esta mezcla como proyecto JSON";
    exportButton.addEventListener("click", exportProject);

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.id = "importProjectBtn";
    importButton.className = "project-tool-btn";
    importButton.textContent = "IMPORTAR .JSON";
    importButton.title = "Cargar un proyecto JSON guardado anteriormente";

    const jsonInput = document.createElement("input");
    jsonInput.type = "file";
    jsonInput.accept = ".json,application/json";
    jsonInput.hidden = true;
    jsonInput.id = "projectJsonInput";
    document.body.appendChild(jsonInput);

    const audioInput = document.createElement("input");
    audioInput.type = "file";
    audioInput.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus";
    audioInput.multiple = true;
    audioInput.hidden = true;
    audioInput.id = "projectAudioInput";
    document.body.appendChild(audioInput);

    let pendingProject = null;
    importButton.addEventListener("click", () => jsonInput.click());

    jsonInput.addEventListener("change", async () => {
      const file = jsonInput.files?.[0];
      jsonInput.value = "";
      if (!file) return;

      try {
        const project = JSON.parse(await file.text());
        if (!isValidProject(project)) {
          alert("Este archivo no parece un proyecto válido de PpekadorR.");
          return;
        }

        if (project.tracks.some((track) => track.source === "local")) {
          pendingProject = project;
          alert("Este proyecto usa audios locales. En el siguiente selector, elige los archivos originales de audio. Deben conservar sus nombres de archivo.");
          audioInput.click();
        } else {
          restoreProject(project);
        }
      } catch (error) {
        console.error("Error al importar el proyecto:", error);
        alert("No se pudo leer el JSON. Comprueba que el archivo no esté dañado.");
      }
    });

    audioInput.addEventListener("change", () => {
      const files = Array.from(audioInput.files || []);
      audioInput.value = "";
      const project = pendingProject;
      pendingProject = null;
      if (!project || !files.length) return;
      restoreProject(project, files);
    });

    tools.prepend(importButton, exportButton);
  }

  // Importación local: los archivos permanecen en el navegador y no se suben.
  function setupAudioImport() {
    const tools = document.querySelector(".arrangement-tools");
    const viewport = $("arrangementViewport") || $("arrangement");

    if (!tools || !viewport) return;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.id = "addAudioBtn";
    addButton.className = "add-audio-btn";
    addButton.textContent = "+ AÑADIR AUDIOS";
    addButton.title = "Importar uno o varios archivos de audio";

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.id = "clearSessionBtn";
    clearButton.textContent = "NUEVA SESIÓN";
    clearButton.title = "Vaciar todas las pistas";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus";
    input.multiple = true;
    input.hidden = true;
    input.id = "audioFileInput";

    document.body.appendChild(input);
    tools.prepend(addButton, clearButton);

    addButton.addEventListener("click", () => input.click());
    clearButton.addEventListener("click", clearSession);

    input.addEventListener("change", () => {
      addLocalFiles(input.files);
      input.value = "";
    });

    const dropHint = document.createElement("div");
    dropHint.className = "audio-drop-hint";
    dropHint.innerHTML =
      '<strong>SUELTA AQUÍ TUS AUDIOS</strong>' +
      '<span>MP3 · WAV · M4A · OGG · FLAC</span>' +
      '<small>Se añadirán alineados desde 00:00</small>';

    viewport.appendChild(dropHint);

    ["dragenter", "dragover"].forEach((type) => {
      viewport.addEventListener(type, (event) => {
        if (
          !Array.from(event.dataTransfer?.items || []).some(
            (item) => item.kind === "file"
          )
        ) {
          return;
        }

        event.preventDefault();
        viewport.classList.add("audio-drag-over");
      });
    });

    ["dragleave", "drop"].forEach((type) => {
      viewport.addEventListener(type, (event) => {
        if (type === "drop") {
          event.preventDefault();

          const files = Array.from(event.dataTransfer?.files || []).filter(
            (file) =>
              file.type.startsWith("audio/") ||
              /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)
          );

          if (files.length) addLocalFiles(files);
        }

        viewport.classList.remove("audio-drag-over");
      });
    });
  }

  function addLocalFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      (file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)
    );

    if (!files.length) return;

    const wasPlaying = playing;
    const firstNewIndex = tracks.length;

    selectedSong = null;
    soloIndex = null;

    const newTracks = files.map((file, offset) => {
      const url = URL.createObjectURL(file);
      localObjectUrls.add(url);

      const baseName = file.name.replace(/\.[^.]+$/, "");

      const meta = {
        id: `local-${Date.now()}-${offset}`,
        name: baseName || file.name,
        originalName: file.name,
        file: url,
        localObjectUrl: url,
        color: colors[(firstNewIndex + offset) % colors.length]
      };

      return makeTrack(meta, firstNewIndex + offset);
    });

    tracks.push(...newTracks);

    tracks.forEach((track, index) => {
      track.index = index;
    });

    if ($("songSelect")) $("songSelect").value = "";
    if ($("songTitle")) $("songTitle").textContent = "Sesión local";

    if ($("songMeta")) {
      $("songMeta").textContent =
        `${tracks.length} pistas locales · alineadas desde 00:00`;
    }

    if ($("bpmValue")) {
      $("bpmValue").innerHTML = '--- <small>BPM</small>';
    }

    if ($("loadedTracks")) {
      $("loadedTracks").textContent = `${tracks.length} TRACKS`;
    }

    renderChannels();
    renderList();
    updateVolumes();
    renderArrangement();

    const thisLoad = songLoadId;

    newTracks.forEach((track) => {
      try {
        track.audio.currentTime = 0;
      } catch (_) {}

      loadWaveform(track, thisLoad);

      if (wasPlaying) {
        track.audio.play().catch(() => {});
      }
    });

    updateDuration();
  }

  // Inicialización en blanco: no carga automáticamente songs[0].
  populateSelect();
  renderList();
  setupAudioImport();
  setupProjectImportExport();
  renderChannels();
  renderArrangement();

  if ($("songTitle")) {
    $("songTitle").textContent = "Sesión en blanco";
  }

  if ($("songMeta")) {
    $("songMeta").textContent =
      "Arrastra audios al arreglo o pulsa + AÑADIR AUDIOS";
  }

  if ($("bpmValue")) {
    $("bpmValue").innerHTML = '--- <small>BPM</small>';
  }
})();
