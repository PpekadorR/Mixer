
/* PPEKADORR MULTITRACK STUDIO — 8 BAND GRAPHIC EQ */
(() => {
  const FREQUENCIES = [60, 120, 250, 500, 1000, 2000, 4000, 8000];
  const MIN_DB = -12;
  const MAX_DB = 12;

  let audioContext;
  let currentTrack = null;

  const tracks = new Map();

  function getContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
    return audioContext;
  }

  // Conecta una pista de audio real al ecualizador.
  function registerTrackEQ(trackId, audioElement) {
    if (!(audioElement instanceof HTMLMediaElement)) {
      throw new Error("Se necesita un elemento de audio válido.");
    }

    if (tracks.has(trackId)) {
      const existing = tracks.get(trackId);
      if (existing.audio !== audioElement) {
        throw new Error(
          `El ID "${trackId}" ya está conectado a otro audio.`
        );
      }
      return existing;
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

    // Cadena: audio → 8 filtros → salida.
    source.connect(filters[0]);

    filters.forEach((filter, index) => {
      if (index < filters.length - 1) {
        filter.connect(filters[index + 1]);
      } else {
        filter.connect(ctx.destination);
      }
    });

    const track = {
      id: trackId,
      audio: audioElement,
      source,
      filters,
      enabled: true,
      gains: Array(8).fill(0)
    };

    tracks.set(trackId, track);
    return track;
  }

  function setBand(trackId, bandIndex, value) {
    const track = tracks.get(trackId);
    if (!track) return;

    const index = Number(bandIndex);
    if (!Number.isInteger(index) || index < 0 || index > 7) return;

    const gain = Math.max(MIN_DB, Math.min(MAX_DB, Number(value)));
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

    track.gains = Array(8).fill(0);

    track.filters.forEach((filter) => {
      filter.gain.setTargetAtTime(
        0,
        getContext().currentTime,
        0.015
      );
    });

    if (trackId === currentTrack) renderEQ(trackId);
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
  }

  function openEQ(trackId) {
    const track = tracks.get(trackId);

    if (!track) {
      console.warn(`La pista "${trackId}" aún no está conectada al EQ.`);
      return;
    }

    currentTrack = trackId;
    renderEQ(trackId);

    document.querySelector("#eq-modal").hidden = false;
    getContext().resume();
  }

  function renderEQ(trackId) {
    const track = tracks.get(trackId);
    if (!track) return;

    document.querySelector("#eq-track-name").textContent =
      `TRACK EQ · ${trackId}`;

    const container = document.querySelector("#eq-bands");
    container.innerHTML = "";

    FREQUENCIES.forEach((frequency, index) => {
      const band = document.createElement("div");
      band.className = "eq-band";

      const value = document.createElement("output");
      value.className = "eq-value";
      value.textContent = `${track.gains[index] > 0 ? "+" : ""}${track.gains[index]} dB`;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "eq-fader";
      slider.min = MIN_DB;
      slider.max = MAX_DB;
      slider.step = 0.5;
      slider.value = track.gains[index];
      slider.setAttribute("aria-label", `${frequency} Hz`);
      slider.title = `${frequency} Hz`;

      slider.addEventListener("input", () => {
        const gain = Number(slider.value);
        setBand(trackId, index, gain);
        value.textContent = `${gain > 0 ? "+" : ""}${gain} dB`;
      });

      const label = document.createElement("label");
      label.textContent = frequency >= 1000
        ? `${frequency / 1000}k`
        : `${frequency}`;

      band.append(value, slider, label);
      container.appendChild(band);
    });

    const bypass = document.querySelector("#eq-bypass");
    bypass.textContent = track.enabled ? "BYPASS" : "EQ OFF";
    bypass.classList.toggle("active", !track.enabled);
  }

  // Botones EQ de los canales.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-eq-track]");
    if (button) openEQ(button.dataset.eqTrack);
  });

  document.querySelector("#eq-close").addEventListener("click", () => {
    document.querySelector("#eq-modal").hidden = true;
  });

  document.querySelector("#eq-reset").addEventListener("click", () => {
    if (currentTrack !== null) resetTrackEQ(currentTrack);
  });

  document.querySelector("#eq-bypass").addEventListener("click", () => {
    if (currentTrack === null) return;
    const track = tracks.get(currentTrack);
    setBypass(currentTrack, track.enabled);
    renderEQ(currentTrack);
  });

  // API pública para el reproductor.
  window.PekadorEQ = {
    registerTrackEQ,
    openEQ,
    setBand,
    resetTrackEQ,
    resetAllEQ,
    setBypass,
    resume: () => getContext().resume()
  };
})();
