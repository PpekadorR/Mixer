/* PPEKADORR MULTITRACK STUDIO — 8 BAND GRAPHIC EQ */
(() => {
  "use strict";

  const FREQUENCIES = [60, 120, 250, 500, 1000, 2000, 4000, 8000];
  const MIN_DB = -12;
  const MAX_DB = 12;

  const tracks = new Map();

  let audioContext = null;
  let masterGain = null;
  let currentTrack = null;

  const $ = (selector) => document.querySelector(selector);

  // Crear el contexto de audio una sola vez.
  function getContext() {
    if (!audioContext) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Este navegador no admite Web Audio API.");
      }

      audioContext = new AudioContextClass();

      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(audioContext.destination);
    }

    return audioContext;
  }

  // Registrar una pista y conectarla al ecualizador.
  function registerTrackEQ(trackId, audioElement) {
    if (!(audioElement instanceof HTMLMediaElement)) {
      throw new Error("Se necesita un elemento de audio válido.");
    }

    const existing = tracks.get(trackId);

    // No crear otra conexión si la pista ya está registrada.
    if (existing && existing.audio === audioElement) {
      return existing;
    }

    // Si el ID pertenece a otro elemento, liberar la conexión anterior.
    if (existing && existing.audio !== audioElement) {
      unregisterTrackEQ(trackId);
    }

    const ctx = getContext();
    const source = ctx.createMediaElementSource(audioElement);

    const filters = FREQUENCIES.map((frequency) => {
      const filter = ctx.createBiquadFilter();

      filter.type = "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 1.1;
      filter.gain.value = 0;

      return filter;
    });

    const channelGain = ctx.createGain();
    channelGain.gain.value = 0.8;

    // Conexión: audio -> 8 bandas EQ -> volumen del canal -> volumen maestro.
    source.connect(filters[0]);

    filters.forEach((filter, index) => {
      if (index < filters.length - 1) {
        filter.connect(filters[index + 1]);
      } else {
        filter.connect(channelGain);
      }
    });

    channelGain.connect(masterGain);

    const track = {
      id: trackId,
      audio: audioElement,
      source,
      filters,
      channelGain,
      enabled: true,
      gains: Array(FREQUENCIES.length).fill(0),
      volume: 0.8,
      active: true
    };

    tracks.set(trackId, track);

    // El volumen se controla mediante GainNode.
    audioElement.volume = 1;

    return track;
  }

  // Ajustar una banda de ecualización.
  function setBand(trackId, bandIndex, value) {
    const track = tracks.get(trackId);
    const index = Number(bandIndex);
    const numericValue = Number(value);

    if (
      !track ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= FREQUENCIES.length ||
      !Number.isFinite(numericValue)
    ) {
      return;
    }

    const gain = Math.max(
      MIN_DB,
      Math.min(MAX_DB, numericValue)
    );

    track.gains[index] = gain;

    track.filters[index].gain.setTargetAtTime(
      track.enabled ? gain : 0,
      getContext().currentTime,
      0.015
    );
  }

  // Reiniciar el EQ de una sola pista.
  function resetTrackEQ(trackId) {
    const track = tracks.get(trackId);
    if (!track) return;

    track.gains = Array(FREQUENCIES.length).fill(0);

    track.filters.forEach((filter) => {
      filter.gain.setTargetAtTime(
        0,
        getContext().currentTime,
        0.015
      );
    });

    if (currentTrack === trackId) {
      renderEQ(trackId);
    }
  }

  // Reiniciar el EQ de todas las pistas registradas.
  function resetAllEQ() {
    for (const id of tracks.keys()) {
      resetTrackEQ(id);
    }
  }

  // Activar o desactivar el ecualizador sin borrar sus ajustes.
  function setBypass(trackId, bypassed) {
    const track = tracks.get(trackId);
    if (!track) return;

    track.enabled = !bypassed;

    track.filters.forEach((filter, index) => {
      filter.gain.setTargetAtTime(
        track.enabled ? track.gains[index] : 0,
        getContext().currentTime,
        0.015
      );
    });

    if (currentTrack === trackId) {
      renderEQ(trackId);
    }
  }

  // Control de volumen individual del canal.
  function setTrackVolume(trackId, value) {
    const track = tracks.get(trackId);
    if (!track) return;

    const volume = Math.max(
      0,
      Math.min(1, Number(value) || 0)
    );

    track.volume = volume;

    track.channelGain.gain.setTargetAtTime(
      track.active ? volume : 0,
      getContext().currentTime,
      0.015
    );
  }

  // Activar/desactivar un canal para MUTE y SOLO.
  function setTrackActive(trackId, active) {
    const track = tracks.get(trackId);
    if (!track) return;

    track.active = Boolean(active);

    track.channelGain.gain.setTargetAtTime(
      track.active ? track.volume : 0,
      getContext().currentTime,
      0.015
    );
  }

  // Volumen maestro.
  function setMasterVolume(value) {
    getContext();

    const volume = Math.max(
      0,
      Math.min(1, Number(value) || 0)
    );

    masterGain.gain.setTargetAtTime(
      volume,
      getContext().currentTime,
      0.015
    );
  }

  // Desconectar una pista cuando se carga otra canción.
  function unregisterTrackEQ(trackId) {
    const track = tracks.get(trackId);
    if (!track) return;

    try {
      track.source.disconnect();
    } catch (_) {}

    track.filters.forEach((filter) => {
      try {
        filter.disconnect();
      } catch (_) {}
    });

    try {
      track.channelGain.disconnect();
    } catch (_) {}

    tracks.delete(trackId);

    if (currentTrack === trackId) {
      currentTrack = null;

      const modal = $("#eq-modal");
      if (modal) modal.hidden = true;
    }
  }

  // Abrir el ecualizador de una pista.
  function openEQ(trackId, trackName) {
    const track = tracks.get(trackId);

    if (!track) {
      console.warn(
        `La pista "${trackId}" todavía no está registrada en el EQ.`
      );
      return;
    }

    currentTrack = trackId;

    renderEQ(trackId, trackName);

    const modal = $("#eq-modal");
    if (modal) modal.hidden = false;

    resume().catch((error) => {
      console.warn("No se pudo iniciar el audio:", error);
    });
  }

  // Dibujar los ocho controles del ecualizador.
  function renderEQ(trackId, trackName) {
    const track = tracks.get(trackId);
    if (!track) return;

    const title = $("#eq-track-name");
    const container = $("#eq-bands");

    if (!title || !container) return;

    title.textContent =
      `TRACK EQ · ${trackName || `TRACK ${trackId + 1}`}`;

    container.innerHTML = "";

    FREQUENCIES.forEach((frequency, index) => {
      const band = document.createElement("div");
      band.className = "eq-band";

      const value = document.createElement("output");
      value.className = "eq-value";
      value.textContent =
        `${track.gains[index] > 0 ? "+" : ""}${track.gains[index]} dB`;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "eq-fader";
      slider.min = String(MIN_DB);
      slider.max = String(MAX_DB);
      slider.step = "0.5";
      slider.value = String(track.gains[index]);
      slider.setAttribute("aria-label", `${frequency} Hz`);
      slider.title = `${frequency} Hz`;

      slider.addEventListener("input", () => {
        const gain = Number(slider.value);

        setBand(trackId, index, gain);

        value.textContent =
          `${gain > 0 ? "+" : ""}${gain} dB`;
      });

      const label = document.createElement("label");

      label.textContent =
        frequency >= 1000
          ? `${frequency / 1000}k`
          : String(frequency);

      band.append(value, slider, label);
      container.appendChild(band);
    });

    const bypass = $("#eq-bypass");

    if (bypass) {
      bypass.textContent = track.enabled ? "BYPASS" : "EQ OFF";
      bypass.classList.toggle("active", !track.enabled);
      bypass.setAttribute(
        "aria-pressed",
        String(!track.enabled)
      );
    }
  }

  // Reactivar el contexto de audio tras la interacción del usuario.
  function resume() {
    const ctx = getContext();

    if (ctx.state === "suspended") {
      return ctx.resume();
    }

    return Promise.resolve();
  }

  // Soporte para botones con data-eq-track.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-eq-track]");

    if (button) {
      const id = Number(button.dataset.eqTrack);

      openEQ(
        id,
        button.dataset.trackName || ""
      );
    }
  });

  // Cerrar el ecualizador.
  const closeButton = $("#eq-close");

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      const modal = $("#eq-modal");
      if (modal) modal.hidden = true;
    });
  }

  // Cerrar al hacer clic fuera del contenido.
  const modal = $("#eq-modal");

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.hidden = true;
      }
    });
  }

  // Cerrar con Escape.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const eqModal = $("#eq-modal");
      if (eqModal) eqModal.hidden = true;
    }
  });

  // Botón RESET.
  const resetButton = $("#eq-reset");

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (currentTrack !== null) {
        resetTrackEQ(currentTrack);
      }
    });
  }

  // Botón BYPASS.
  const bypassButton = $("#eq-bypass");

  if (bypassButton) {
    bypassButton.addEventListener("click", () => {
      if (currentTrack === null) return;

      const track = tracks.get(currentTrack);

      if (track) {
        setBypass(currentTrack, track.enabled);
      }
    });
  }

  // API utilizada por app.js.
  window.PekadorEQ = {
    registerTrackEQ,
    openEQ,
    setBand,
    resetTrackEQ,
    resetAllEQ,
    setBypass,
    setTrackVolume,
    setTrackActive,
    setMasterVolume,
    unregisterTrackEQ,
    resume
  };
})();
