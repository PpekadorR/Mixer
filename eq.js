
/* PPEKADORR MULTITRACK STUDIO — 8 BAND GRAPHIC EQ */
(() => {
  "use strict";

  const FREQUENCIES = [60, 120, 250, 500, 1000, 2000, 4000, 8000];
  const MIN_DB = -12;
  const MAX_DB = 12;

  const tracks = new Map();

  let audioContext = null;
  let masterGain = null;
  let masterSplitter = null;
  let masterAnalyserL = null;
  let masterAnalyserR = null;
  let masterMerger = null;
  let masterLeftData = null;
  let masterRightData = null;
  let currentTrack = null;

  const $ = (selector) => document.querySelector(selector);

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

      // Medición estéreo después del volumen master.
      masterSplitter = audioContext.createChannelSplitter(2);
      masterAnalyserL = audioContext.createAnalyser();
      masterAnalyserR = audioContext.createAnalyser();
      masterMerger = audioContext.createChannelMerger(2);

      [masterAnalyserL, masterAnalyserR].forEach((analyser) => {
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.12;
      });

      masterLeftData = new Float32Array(masterAnalyserL.fftSize);
      masterRightData = new Float32Array(masterAnalyserR.fftSize);

      masterGain.connect(masterSplitter);
      masterSplitter.connect(masterAnalyserL, 0);
      masterSplitter.connect(masterAnalyserR, 1);
      masterAnalyserL.connect(masterMerger, 0, 0);
      masterAnalyserR.connect(masterMerger, 0, 1);
      masterMerger.connect(audioContext.destination);
    }

    return audioContext;
  }

  function registerTrackEQ(trackId, audioElement) {
    if (!(audioElement instanceof HTMLMediaElement)) {
      throw new Error("Se necesita un elemento de audio válido.");
    }

    const existing = tracks.get(trackId);

    if (existing && existing.audio === audioElement) {
      return existing;
    }

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
    const analyser = ctx.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.12;

    const meterData = new Float32Array(analyser.fftSize);
    channelGain.gain.value = 1;

    source.connect(filters[0]);

    filters.forEach((filter, index) => {
      if (index < filters.length - 1) {
        filter.connect(filters[index + 1]);
      } else {
        filter.connect(channelGain);
      }
    });

    // Medidor de canal: después del EQ y del fader, antes del master.
    channelGain.connect(analyser);
    analyser.connect(masterGain);

    const track = {
      id: trackId,
      audio: audioElement,
      source,
      filters,
      channelGain,
      analyser,
      meterData,
      enabled: true,
      gains: Array(FREQUENCIES.length).fill(0),
      volume: 1,
      active: true
    };

    tracks.set(trackId, track);
    audioElement.volume = 1;

    return track;
  }

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

    const gain = Math.max(MIN_DB, Math.min(MAX_DB, numericValue));
    track.gains[index] = gain;

    track.filters[index].gain.setTargetAtTime(
      track.enabled ? gain : 0,
      getContext().currentTime,
      0.015
    );
  }

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

  function resetAllEQ() {
    for (const id of tracks.keys()) {
      resetTrackEQ(id);
    }
  }

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

  function setTrackVolume(trackId, value) {
    const track = tracks.get(trackId);
    if (!track) return;

    const numericValue = Number(value);
    const volume = Math.max(
      0,
      Math.min(4, Number.isFinite(numericValue) ? numericValue : 0)
    );

    track.volume = volume;

    track.channelGain.gain.setTargetAtTime(
      track.active ? volume : 0,
      getContext().currentTime,
      0.015
    );
  }

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

  function setMasterVolume(value) {
    getContext();

    const volume = Math.max(0, Math.min(1, Number(value) || 0));

    masterGain.gain.setTargetAtTime(
      volume,
      getContext().currentTime,
      0.015
    );
  }

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

    try {
      track.analyser.disconnect();
    } catch (_) {}

    tracks.delete(trackId);

    if (currentTrack === trackId) {
      currentTrack = null;
      const modal = $("#eq-modal");
      if (modal) modal.hidden = true;
    }
  }

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
        value.textContent = `${gain > 0 ? "+" : ""}${gain} dB`;
      });

      const label = document.createElement("label");
      label.textContent =
        frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);

      band.append(value, slider, label);
      container.appendChild(band);
    });

    const bypass = $("#eq-bypass");

    if (bypass) {
      bypass.textContent = track.enabled ? "BYPASS" : "EQ OFF";
      bypass.classList.toggle("active", !track.enabled);
      bypass.setAttribute("aria-pressed", String(!track.enabled));
    }
  }

  // Calcula el RMS real de las muestras de audio.
  function readRms(analyser, buffer) {
    if (
      !analyser ||
      !buffer ||
      !audioContext ||
      audioContext.state !== "running"
    ) {
      return 0;
    }

    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i] || 0;
      sum += sample * sample;
    }

    return Math.sqrt(sum / buffer.length);
  }

  function getTrackMeter(trackId) {
    const track = tracks.get(trackId);
    if (!track || !track.active) return 0;
    return readRms(track.analyser, track.meterData);
  }

  function getMasterMeters() {
    return {
      left: readRms(masterAnalyserL, masterLeftData),
      right: readRms(masterAnalyserR, masterRightData)
    };
  }

  function resume() {
    const ctx = getContext();

    if (ctx.state === "suspended") {
      return ctx.resume();
    }

    return Promise.resolve();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-eq-track]");

    if (button) {
      const id = Number(button.dataset.eqTrack);
      openEQ(id, button.dataset.trackName || "");
    }
  });

  const closeButton = $("#eq-close");

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      const modal = $("#eq-modal");
      if (modal) modal.hidden = true;
    });
  }

  const modal = $("#eq-modal");

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.hidden = true;
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const eqModal = $("#eq-modal");
      if (eqModal) eqModal.hidden = true;
    }
  });

  const resetButton = $("#eq-reset");

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (currentTrack !== null) {
        resetTrackEQ(currentTrack);
      }
    });
  }

  const bypassButton = $("#eq-bypass");

  if (bypassButton) {
    bypassButton.addEventListener("click", () => {
      if (currentTrack === null) return;

      const track = tracks.get(currentTrack);
      if (track) setBypass(currentTrack, track.enabled);
    });
  }

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
    getTrackMeter,
    getMasterMeters,
    unregisterTrackEQ,
    resume
  };
})();
