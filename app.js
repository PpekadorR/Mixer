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
  const groupLevels={1:1,2:1,3:1,4:1};
  let trackHeight=42;
  let raf = null;

  // La anchura de la línea de tiempo se expresa en píxeles por segundo.
  let pixelsPerSecond = 60;
  let fitZoom = false;
  let waveformContext = null;
  let songLoadId = 0;

  const waveformCache = new Map();
  const localObjectUrls = new Set();
  // Editor de clips no destructivo.
  let clips=[], selectedClipId=null, clipSerial=0, clipHistory=[], clipFuture=[];
  let clipMode="move", transportStarted=0;
  let markers=[],bpm=120,snapEnabled=false,volumeAutomation={};
  const clipNewId=()=>`clip-${++clipSerial}`;
  const clipSnap=n=>{
    const v=Math.max(0,n);
    return snapEnabled?Math.round(v/(60/bpm))*(60/bpm):Math.round(v*10)/10;
  };
  const clipSelected=()=>clips.find(c=>c.id===selectedClipId);
  function clipCheckpoint(){clipHistory.push(JSON.stringify(clips));if(clipHistory.length>60)clipHistory.shift();clipFuture=[];}
  function clipRestore(back){
    const from=back?clipHistory:clipFuture,to=back?clipFuture:clipHistory;
    if(!from.length)return;
    to.push(JSON.stringify(clips));clips=JSON.parse(from.pop());renderArrangement();syncClips(true);
  }
  function initClips(){
    clips=tracks.map((t,i)=>({id:clipNewId(),track:i,start:0,offset:0,length:Number.isFinite(t.audio.duration)?t.audio.duration:0}));
    selectedClipId=null;clipHistory=[];clipFuture=[];
  }
  function fillClipDurations(){
    clips.forEach(c=>{if(c.length===0 && Number.isFinite(tracks[c.track]?.audio.duration))c.length=tracks[c.track].audio.duration;});
  }
  function clipSplit(at){
    const c=clipSelected();if(!c||at<=c.start+.02||at>=c.start+c.length-.02)return;
    clipCheckpoint();const delta=at-c.start;
    clips.push({...c,id:clipNewId(),start:at,offset:c.offset+delta,length:c.length-delta});
    c.length=delta;renderArrangement();syncClips(true);
  }
  function clipDuplicate(){
    const c=clipSelected();if(!c)return;
    clipCheckpoint();const d={...c,id:clipNewId(),start:clipSnap(c.start+c.length)};
    clips.push(d);selectedClipId=d.id;updateDuration();renderArrangement();
  }
  function clipDelete(){
    if(!clipSelected())return;clipCheckpoint();
    clips=clips.filter(c=>c.id!==selectedClipId);selectedClipId=null;
    updateDuration();renderArrangement();syncClips(true);
  }
  function syncClips(force=false){
    const now=currentTime();
    tracks.forEach((t,i)=>{
      const active=clips.filter(c=>c.track===i&&c.length>0&&now>=c.start&&now<c.start+c.length).at(-1);
      if(!active){
        window.PekadorEQ?.setTrackClipGain(i,0);
        if(!t.audio.paused)t.audio.pause();return;
      }
      const elapsed=now-active.start;
      const fadeIn=Math.max(0,Number(active.fadeIn)||0);
      const fadeOut=Math.max(0,Number(active.fadeOut)||0);
      const fade=Math.min(1,fadeIn?elapsed/fadeIn:1,fadeOut?(active.length-elapsed)/fadeOut:1);
      window.PekadorEQ?.setTrackClipGain(i,Math.max(0,fade));
      const automation=volumeAutomation[i]||[];
      if(automation.length){
        const points=[...automation].sort((a,b)=>a.time-b.time);
        let value=points[0].value;
        for(let k=0;k<points.length-1;k++){
          if(now>=points[k].time&&now<=points[k+1].time){
            const f=(now-points[k].time)/Math.max(.001,points[k+1].time-points[k].time);
            value=points[k].value+(points[k+1].value-points[k].value)*f;break;
          }
          if(now>points[k+1].time)value=points[k+1].value;
        }
        window.PekadorEQ?.setTrackVolume(i,t.volume*value);
      }
      const sourceTime=active.offset+now-active.start;
      if(force||Math.abs(t.audio.currentTime-sourceTime)>.15){
        try{t.audio.currentTime=sourceTime;}catch(_){}
      }
      if(playing&&t.audio.paused)t.audio.play().catch(()=>{});
    });
  }
  function setupClipEditor(){
    const tools=document.querySelector(".arrangement-tools");
    if(!tools)return;
    const bar=document.createElement("div");bar.className="clip-editor-toolbar";
    bar.innerHTML='<strong>CLIP EDITOR</strong><button data-mode="move" class="active">MOVER</button><button data-mode="cut">CORTAR</button><button data-action="duplicate">DUPLICAR</button><button data-action="delete">BORRAR</button><button data-action="undo">↶</button><button data-action="redo">↷</button><small>ESPACIO: play/pausa · RUEDA: zoom · CTRL+K: cortar · CTRL+CLIC DERECHO + ARRASTRAR: copiar</small>';
    tools.after(bar);
    bar.onclick=e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.mode){clipMode=b.dataset.mode;bar.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===b));}
      else ({duplicate:clipDuplicate,delete:clipDelete,undo:()=>clipRestore(true),redo:()=>clipRestore(false)})[b.dataset.action]?.();
    };
    document.addEventListener("keydown",e=>{
      if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();clipRestore(!e.shiftKey);}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){e.preventDefault();clipDuplicate();}
      else if(e.key==="Delete"){clipDelete();}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
        e.preventDefault();clipSplit(currentTime());
      }
      else if(e.code==="Space"&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.repeat){
        e.preventDefault();playing?pause():play();
      }
      else if(e.key.toLowerCase()==="s"&&!e.ctrlKey){clipSplit(currentTime());}
    });
  }
  function paintClips(row,trackIndex,px,color){
    clips.filter(c=>c.track===trackIndex&&c.length>0).forEach(c=>{
      const el=document.createElement("div");el.className="editor-clip"+(c.id===selectedClipId?" selected":"");
      el.style.left=`${c.start*px}px`;el.style.width=`${Math.max(5,c.length*px)}px`;
      el.style.setProperty("--clip-color",color);
      const peaks=waveformCache.get(tracks[trackIndex].meta.file);
      if(peaks){
        const canvas=document.createElement("canvas");
        const total=tracks[trackIndex].audio.duration||c.length;
        const start=Math.floor((c.offset/total)*peaks.length);
        const end=Math.max(start+1,Math.ceil(((c.offset+c.length)/total)*peaks.length));
        drawWaveform(canvas,peaks.slice(start,end),Math.max(5,c.length*px),color);
        el.append(canvas);
      }
      const l=document.createElement("i");l.className="clip-handle left";
      const r=document.createElement("i");r.className="clip-handle right";
      el.append(l,r);
      const fades=document.createElement("div");
      fades.className="clip-fades";
      fades.innerHTML=`<span class="fade-in" title="Fundido de entrada">${c.fadeIn?`↗ ${c.fadeIn.toFixed(1)}s`:"↗"}</span><span class="fade-out" title="Fundido de salida">${c.fadeOut?`${c.fadeOut.toFixed(1)}s ↘`:"↘"}</span>`;
      fades.querySelector(".fade-in").addEventListener("dblclick",event=>{
        event.stopPropagation();clipCheckpoint();
        c.fadeIn=c.fadeIn?0:Math.min(1,c.length/2);renderArrangement();
      });
      fades.querySelector(".fade-out").addEventListener("dblclick",event=>{
        event.stopPropagation();clipCheckpoint();
        c.fadeOut=c.fadeOut?0:Math.min(1,c.length/2);renderArrangement();
      });
      el.append(fades);
      el.addEventListener("contextmenu",e=>{
        if(e.ctrlKey || e.metaKey || el.dataset.copyDrag==="1")e.preventDefault();
      });
      el.addEventListener("pointerdown",e=>{
        const copyDrag=(e.ctrlKey||e.metaKey)&&e.button===2;
        if(e.button!==0&&!copyDrag)return;
        e.preventDefault();
        e.stopPropagation();selectedClipId=c.id;
        if(clipMode==="cut"&&!copyDrag){
          const rect=el.getBoundingClientRect();
          clipSplit(c.start+(e.clientX-rect.left)/px);return;
        }
        const type=copyDrag?"move":e.target.closest(".clip-handle")?.classList.contains("left")?"left":e.target.closest(".clip-handle")?"right":"move";
        const original={...c},originX=e.clientX;
        clipCheckpoint();
        let activeClip=c;
        if(copyDrag){
          activeClip={...c,id:clipNewId()};
          clips.push(activeClip);
          selectedClipId=activeClip.id;
          el.dataset.copyDrag="1";
        }
        el.setPointerCapture(e.pointerId);
        const onmove=ev=>{
          const delta=Math.round((ev.clientX-originX)/px*10)/10;
          if(type==="move"){
            activeClip.start=clipSnap(original.start+delta);
            // La copia conserva el audio, el canal y los recortes originales.
          }else if(type==="left"){
            const shift=Math.max(-original.offset,Math.min(original.length-.05,delta));
            c.start=clipSnap(original.start+shift);
            c.offset=original.offset+shift;c.length=original.length-shift;
          }else{
            const max=(tracks[c.track]?.audio.duration||Infinity)-original.offset;
            c.length=Math.max(.05,Math.min(max,original.length+delta));
          }
          el.style.left=`${activeClip.start*px}px`;el.style.width=`${Math.max(5,activeClip.length*px)}px`;
        };
        const onend=()=>{
          el.removeEventListener("pointermove",onmove);
          delete el.dataset.copyDrag;
          renderArrangement();updateDuration();syncClips(true);
        };
        el.addEventListener("pointermove",onmove);
        el.addEventListener("pointerup",onend,{once:true});
        el.addEventListener("pointercancel",onend,{once:true});
      });
      row.append(el);
    });
  }


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
    return playing ? Math.max(0,(performance.now()-transportStarted)/1000) : pausedAt;
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

    fillClipDurations();
    duration = Math.max(0,...clips.map(c=>c.start+c.length));

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
    clips = [];
    selectedClipId = null;
    clipHistory = [];
    clipFuture = [];

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
    initClips();

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
        <div class="channel-routing">
          <label>PAN <input class="pan-knob" type="range" min="-100" max="100" value="${Math.round((track.pan||0)*100)}" title="Paneo L/R"></label>
          <label>AUX <input class="aux-knob" type="range" min="0" max="100" value="${Math.round((track.aux||0)*100)}" title="Envío auxiliar a delay"></label>
          <label>BUS <select class="group-select" title="Asignar grupo"><option value="0">MAIN</option><option value="1">G1</option><option value="2">G2</option><option value="3">G3</option><option value="4">G4</option></select></label>
        </div>
        <div class="channel-buttons">
          <button class="mute-btn" title="Mute">M</button>
          <button class="solo-btn" title="Solo">S</button>
          <button class="comp-btn" title="Compresor 3:1">C</button>
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

      channel.querySelector(".group-select").value=String(track.group||0);
      channel.querySelector(".pan-knob").addEventListener("input",e=>{
        track.pan=Number(e.target.value)/100;
        window.PekadorEQ?.setTrackPan(index,track.pan);
      });
      channel.querySelector(".aux-knob").addEventListener("input",e=>{
        track.aux=Number(e.target.value)/100;
        window.PekadorEQ?.setTrackAux(index,track.aux);
      });
      channel.querySelector(".group-select").addEventListener("change",e=>{
        track.group=Number(e.target.value);
        window.PekadorEQ?.setTrackGroup(index,track.group);
      });
      channel.querySelector(".comp-btn").classList.toggle("active-comp",Boolean(track.compressorEnabled));
      channel.querySelector(".comp-btn").addEventListener("click",()=>{
        track.compressorEnabled=!track.compressorEnabled;
        window.PekadorEQ?.setTrackCompressor(index,track.compressorEnabled);
        channel.querySelector(".comp-btn").classList.toggle("active-comp",track.compressorEnabled);
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
        window.PekadorEQ.setTrackPan(index,track.pan||0);
        window.PekadorEQ.setTrackAux(index,track.aux||0);
        window.PekadorEQ.setTrackGroup(index,track.group||0);
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

    transportStarted=performance.now()-pausedAt*1000;
    playing = true;

    if ($("playBtn")) {
      $("playBtn").innerHTML = '<span class="pause-icon"></span>';
    }

    updateVolumes();

    syncClips(true);
    const results = [{status:"fulfilled"}];

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

    if(playing)transportStarted=performance.now()-target*1000;
    syncClips(true);

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
    if(playing)syncClips();
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
      row.style.height=`${trackHeight}px`;
      label.style.height=`${trackHeight}px`;

      row.addEventListener("click",event=>{
        const rect=row.getBoundingClientRect();
        seekTo((event.clientX-rect.left)/pxPerSec);
      });
      rows.appendChild(row);
      row.classList.remove("loading");
      paintClips(row,index,pxPerSec,color);
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
        renderArrangement();
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

  // Zoom de la línea de tiempo con rueda, anclado al cursor.
  const arrangementScroll=$("arrangementScroll");
  if(arrangementScroll){
    arrangementScroll.addEventListener("wheel",event=>{
      if(event.ctrlKey || event.metaKey || event.altKey)return;
      event.preventDefault();
      const rect=arrangementScroll.getBoundingClientRect();
      const pointerX=event.clientX-rect.left;
      const oldPx=fitZoom && duration>0
        ? Math.max(2,arrangementScroll.clientWidth/duration)
        : pixelsPerSecond;
      const anchorSeconds=(arrangementScroll.scrollLeft+pointerX)/oldPx;
      fitZoom=false;
      pixelsPerSecond=Math.max(10,Math.min(600,oldPx*(event.deltaY<0?1.15:1/1.15)));
      renderArrangement();
      arrangementScroll.scrollLeft=Math.max(0,anchorSeconds*pixelsPerSecond-pointerX);
    },{passive:false});
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
      groupLevels:{...groupLevels},
      clips: clips.map(({track,start,offset,length,fadeIn=0,fadeOut=0})=>({track,start,offset,length,fadeIn,fadeOut})),
      bpm,snapEnabled,markers,volumeAutomation,
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
          pan:track.pan||0,
          aux:track.aux||0,
          group:track.group||0,
          compressorEnabled:Boolean(track.compressorEnabled),
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
      track.pan=Math.max(-1,Math.min(1,Number(saved.pan)||0));
      track.aux=Math.max(0,Math.min(1,Number(saved.aux)||0));
      track.group=[0,1,2,3,4].includes(Number(saved.group))?Number(saved.group):0;
      track.compressorEnabled=Boolean(saved.compressorEnabled);
      window.PekadorEQ?.setTrackCompressor(index,track.compressorEnabled);

      if (window.PekadorEQ) {
        window.PekadorEQ.setTrackVolume(index, track.volume);
        if (window.PekadorEQ.setTrackEQState) {
          window.PekadorEQ.setTrackEQState(index, saved.eq || { enabled: true, gains: Array(8).fill(0) });
        }
      }

      if (saved.solo) soloIndex = index;
      return track;
    });

    for(const group of [1,2,3,4]){
      groupLevels[group]=Math.max(0,Math.min(2,Number(project.groupLevels?.[group])||1));
      window.PekadorEQ?.setGroupVolume(group,groupLevels[group]);
      const input=document.querySelector(`[data-group-level="${group}"]`);
      if(input)input.value=String(Math.round(groupLevels[group]*100));
      const output=document.querySelector(`[data-group-output="${group}"]`);
      if(output)output.textContent=`${Math.round(groupLevels[group]*100)}%`;
    }
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
    initClips();
    bpm=Math.max(30,Math.min(300,Number(project.bpm)||120));
    snapEnabled=Boolean(project.snapEnabled);
    markers=Array.isArray(project.markers)?project.markers.filter(m=>Number.isFinite(m.time)&&typeof m.name==="string"):[];
    volumeAutomation=project.volumeAutomation&&typeof project.volumeAutomation==="object"?project.volumeAutomation:{};
    if($("prodBpm"))$("prodBpm").value=bpm;
    if($("prodSnap"))$("prodSnap").checked=snapEnabled;
    window.PpekadorRenderMarkers?.();
    if(Array.isArray(project.clips)){
      const valid=project.clips.filter(c=>Number.isInteger(c.track)&&tracks[c.track]&&
        [c.start,c.offset,c.length].every(v=>Number.isFinite(v)&&v>=0)&&c.length>0);
      if(valid.length)clips=valid.map(c=>({...c,id:clipNewId()}));
    }
    renderChannels();
    renderList();
    updateVolumes();
    updateDuration();
    renderArrangement();
    tracks.forEach((track) => loadWaveform(track, thisLoad));
    return true;
  }


  /* EXPORTAR AUDIO: mezcla no destructiva, renderizada sin tiempo real. */
  const EQ_FREQS=[60,120,250,500,1000,2000,4000,8000];
  function downloadAudioBlob(blob,extension){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`${safeFileName(selectedSong?.title||"PpekadorR-Mezcla")}.${extension}`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),20000);
  }
  function audioToWav(buffer){
    const channels=Math.min(2,buffer.numberOfChannels);
    const samples=buffer.length,bytes=44+samples*channels*2;
    const data=new ArrayBuffer(bytes),view=new DataView(data);
    const str=(off,value)=>{for(let i=0;i<value.length;i++)view.setUint8(off+i,value.charCodeAt(i));};
    str(0,"RIFF");view.setUint32(4,bytes-8,true);str(8,"WAVE");
    str(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
    view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);
    view.setUint32(28,buffer.sampleRate*channels*2,true);
    view.setUint16(32,channels*2,true);view.setUint16(34,16,true);
    str(36,"data");view.setUint32(40,samples*channels*2,true);
    const arrays=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
    let off=44;
    for(let i=0;i<samples;i++)for(let ch=0;ch<channels;ch++){
      const v=Math.max(-1,Math.min(1,arrays[ch][i]));
      view.setInt16(off,v<0?v*32768:v*32767,true);off+=2;
    }
    return new Blob([data],{type:"audio/wav"});
  }
  function filterChain(ctx,input,gains,enabled=true){
    let last=input;
    EQ_FREQS.forEach((freq,i)=>{
      const f=ctx.createBiquadFilter();f.type="peaking";f.frequency.value=freq;
      f.Q.value=1.1;f.gain.value=enabled?(Number(gains?.[i])||0):0;
      last.connect(f);last=f;
    });
    return last;
  }
  async function renderMixOffline(){
    fillClipDurations();
    const seconds=Math.max(0,...clips.map(c=>c.start+c.length));
    if(!tracks.length||seconds<=0)throw Error("No hay clips con audio para exportar.");
    if(seconds>3600)throw Error("La exportación está limitada a 60 minutos por proyecto.");
    const rate=44100;
    const ctx=new OfflineAudioContext(2,Math.ceil(seconds*rate),rate);
    const masterEQ=window.PekadorEQ?.getMasterEQState?.()||{enabled:true,gains:Array(8).fill(0)};
    const masterInput=ctx.createGain();
    const masterLast=filterChain(ctx,masterInput,masterEQ.gains,masterEQ.enabled);
    const master=ctx.createGain();master.gain.value=masterVolume;
    masterLast.connect(master);master.connect(ctx.destination);
    const groupNodes=new Map();
    for(let g=1;g<=4;g++){
      const bus=ctx.createGain();bus.gain.value=groupLevels[g];
      bus.connect(masterInput);groupNodes.set(g,bus);
    }
    const auxInput=ctx.createGain(),delay=ctx.createDelay(1),auxReturn=ctx.createGain();
    delay.delayTime.value=.22;auxReturn.gain.value=.28;
    auxInput.connect(delay);delay.connect(auxReturn);auxReturn.connect(masterInput);
    const decoded=await Promise.all(tracks.map(async(t)=>{
      const response=await fetch(t.meta.file);
      if(!response.ok)throw Error(`No se pudo leer ${t.meta.name}: HTTP ${response.status}`);
      return await ctx.decodeAudioData(await response.arrayBuffer());
    }));
    for(let i=0;i<tracks.length;i++){
      const t=tracks[i],buffer=decoded[i];
      const audible=!t.muted&&(soloIndex===null||soloIndex===i);
      if(!audible)continue;
      const settings=window.PekadorEQ?.getTrackSettings?.(i)||{enabled:true,gains:Array(8).fill(0)};
      const input=ctx.createGain();
      const last=filterChain(ctx,input,settings.gains,settings.enabled);
      const level=ctx.createGain();level.gain.value=t.volume;
      last.connect(level);
      const comp=ctx.createDynamicsCompressor();
      comp.threshold.value=-18;comp.ratio.value=3;comp.attack.value=.005;comp.release.value=.16;
      const pan=ctx.createStereoPanner();pan.pan.value=t.pan||0;
      if(t.compressorEnabled){level.connect(comp);comp.connect(pan);}
      else level.connect(pan);
      const points=(volumeAutomation[i]||[]).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)).sort((a,b)=>a.time-b.time);
      if(points.length){
        level.gain.setValueAtTime(t.volume*points[0].value,0);
        for(const point of points)level.gain.linearRampToValueAtTime(t.volume*point.value,Math.max(0,point.time));
      }
      pan.connect(groupNodes.get(t.group)||masterInput);
      if(t.aux>0){
        const send=ctx.createGain();send.gain.value=t.aux;
        pan.connect(send);send.connect(auxInput);
      }
      clips.filter(c=>c.track===i&&c.length>0).forEach(c=>{
        const available=Math.min(c.length,buffer.duration-c.offset,seconds-c.start);
        if(available<=0)return;
        const source=ctx.createBufferSource();source.buffer=buffer;
        const fadeNode=ctx.createGain();
        const fadeIn=Math.min(available,Math.max(0,Number(c.fadeIn)||0));
        const fadeOut=Math.min(available,Math.max(0,Number(c.fadeOut)||0));
        fadeNode.gain.setValueAtTime(fadeIn?0:1,c.start);
        if(fadeIn)fadeNode.gain.linearRampToValueAtTime(1,c.start+fadeIn);
        if(fadeOut){
          const fadeStart=Math.max(c.start+fadeIn,c.start+available-fadeOut);
          fadeNode.gain.setValueAtTime(1,fadeStart);
          fadeNode.gain.linearRampToValueAtTime(0,c.start+available);
        }
        source.connect(fadeNode);fadeNode.connect(input);
        source.start(c.start,c.offset,available);
      });
    }
    return await ctx.startRendering();
  }
  async function encodeMp3(buffer){
    // LameJS se carga únicamente cuando se solicita MP3; requiere conexión.
    if(!window.lamejs){
      await new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src="https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
        script.onload=resolve;script.onerror=()=>reject(Error("No se pudo cargar el codificador MP3. Comprueba la conexión a Internet."));
        document.head.appendChild(script);
      });
    }
    if(!window.lamejs?.Mp3Encoder)throw Error("El codificador MP3 no está disponible.");
    const left=buffer.getChannelData(0),right=buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1));
    const encoder=new window.lamejs.Mp3Encoder(2,buffer.sampleRate,192);
    const chunks=[],chunkSize=1152;
    for(let offset=0;offset<left.length;offset+=chunkSize){
      const end=Math.min(offset+chunkSize,left.length);
      const l=new Int16Array(end-offset),r=new Int16Array(end-offset);
      for(let j=offset;j<end;j++){
        const a=Math.max(-1,Math.min(1,left[j])),b=Math.max(-1,Math.min(1,right[j]));
        l[j-offset]=a<0?a*32768:a*32767;
        r[j-offset]=b<0?b*32768:b*32767;
      }
      const part=encoder.encodeBuffer(l,r);if(part.length)chunks.push(new Uint8Array(part));
      if(offset%(chunkSize*100)===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const last=encoder.flush();if(last.length)chunks.push(new Uint8Array(last));
    return new Blob(chunks,{type:"audio/mpeg"});
  }
  function setupAudioExport(){
    const toolbar=document.querySelector(".arrangement-tools");
    if(!toolbar)return;
    const wav=document.createElement("button"),mp3=document.createElement("button");
    wav.className=mp3.className="project-tool-btn";
    wav.textContent="EXPORTAR WAV";mp3.textContent="EXPORTAR MP3";
    toolbar.append(wav,mp3);
    async function run(format){
      const buttons=[wav,mp3];buttons.forEach(b=>b.disabled=true);
      const original=wav.textContent;wav.textContent="RENDERIZANDO…";
      try{
        const buffer=await renderMixOffline();
        if(format==="wav")downloadAudioBlob(audioToWav(buffer),"wav");
        else{
          wav.textContent="CODIFICANDO MP3…";
          downloadAudioBlob(await encodeMp3(buffer),"mp3");
        }
      }catch(error){
        console.error("Exportación de audio:",error);
        alert("No se pudo exportar: "+error.message+"\n\nLos audios externos deben permitir acceso CORS. MP3 necesita Internet para cargar su codificador.");
      }finally{
        wav.textContent=original;buttons.forEach(b=>b.disabled=false);
      }
    }
    wav.addEventListener("click",()=>run("wav"));
    mp3.addEventListener("click",()=>run("mp3"));
  }
  function setupGroupBuses(){
    const channels=document.getElementById("channels");
    if(!channels)return;
    const bar=document.createElement("section");
    bar.className="group-buses";
    bar.setAttribute("aria-label","Buses de grupo");
    bar.innerHTML=`<div class="group-buses-heading">GROUP BUS</div><div class="group-buses-strips">${[1,2,3,4].map(g=>`
      <div class="group-strip" data-bus="${g}">
        <div class="group-strip-name">G${g}</div>
        <div class="group-strip-subtitle">BUS</div>
        <div class="group-fader-zone">
          <div class="group-fader-scale"><span>200</span><span>100</span><span>0</span></div>
          <input class="group-fader" type="range" min="0" max="200" step="1"
            value="${Math.round(groupLevels[g]*100)}" data-group-level="${g}"
            aria-label="Volumen del bus de grupo ${g}">
        </div>
        <output class="group-fader-value" data-group-output="${g}">${Math.round(groupLevels[g]*100)}%</output>
      </div>`).join("")}</div>`;
    channels.after(bar);
    bar.addEventListener("input",e=>{
      const input=e.target.closest("[data-group-level]");
      if(!input)return;
      const g=Number(input.dataset.groupLevel);
      if(![1,2,3,4].includes(g))return;
      groupLevels[g]=Number(input.value)/100;
      const output=bar.querySelector(`[data-group-output="${g}"]`);
      if(output)output.textContent=`${Math.round(groupLevels[g]*100)}%`;
      window.PekadorEQ?.setGroupVolume(g,groupLevels[g]);
    });
  }
  function setupVerticalArrangementZoom(){
    const area=document.getElementById("arrangementScroll");
    if(!area)return;
    const rail=document.createElement("div");rail.className="arrangement-vertical-rail";
    rail.title="Rueda del ratón aquí: altura de pistas";
    rail.innerHTML='<span>↕</span><small>ALTURA</small>';
    const parent=area.parentElement;
    if(getComputedStyle(parent).position==="static")parent.style.position="relative";
    parent.append(rail);
    rail.addEventListener("wheel",event=>{
      event.preventDefault();
      trackHeight=Math.max(28,Math.min(160,trackHeight+(event.deltaY<0?6:-6)));
      document.querySelectorAll(".arrangement-track,.arrangement-track-label").forEach(el=>el.style.height=`${trackHeight}px`);
    },{passive:false});
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

    newTracks.forEach(t=>clips.push({id:clipNewId(),track:t.index,start:0,offset:0,length:Number.isFinite(t.audio.duration)?t.audio.duration:0}));
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

  function setupLoudnessMeter(){
    const panel=$("loudnessPanel");
    if(!panel)return;
    const history=[];
    let momentaryMax=-Infinity,shortMax=-Infinity,peakMax=-Infinity;
    const format=(n,unit)=>Number.isFinite(n)?`${n.toFixed(1)} ${unit}`:`— ${unit}`;
    const loudness=(power)=>power>1e-12?-0.691+10*Math.log10(power):-Infinity;
    function reset(){
      history.length=0;momentaryMax=shortMax=peakMax=-Infinity;
      for(const id of ["lufsMomentary","lufsShort","lufsIntegrated","loudnessRange","lufsMomentaryMax","lufsShortMax","truePeakMax"]){
        const el=$(id);if(el)el.textContent="—";
      }
      $("loudnessMeterFill").style.height="0%";
    }
    $("loudnessReset").addEventListener("click",reset);
    let last=0;
    function update(now){
      requestAnimationFrame(update);
      if(now-last<100)return;
      const elapsed=last?Math.min(.3,(now-last)/1000):.1;
      last=now;
      if(!playing)return;
      const frame=window.PekadorEQ?.getMasterLoudnessFrame?.();
      if(!frame)return;
      history.push({time:now,power:frame.power,dt:elapsed});
      if(history.length>36000)history.splice(0,history.length-36000);
      const windowPower=(seconds)=>{
        let sum=0,duration=0;
        for(let i=history.length-1;i>=0&&duration<seconds;i--){
          const weight=Math.min(history[i].dt,seconds-duration);
          sum+=history[i].power*weight;duration+=weight;
        }
        return duration?sum/duration:0;
      };
      const momentary=loudness(windowPower(.4));
      const short=loudness(windowPower(3));
      // Gating aproximado: puerta absoluta -70 y relativa a media no filtrada -10 LU.
      const blocks=history.filter(v=>loudness(v.power)>-70);
      const avg=blocks.reduce((sum,v)=>sum+v.power,0)/Math.max(1,blocks.length);
      const threshold=loudness(avg)-10;
      const gated=blocks.filter(v=>loudness(v.power)>=threshold);
      const integrated=loudness(gated.reduce((sum,v)=>sum+v.power,0)/Math.max(1,gated.length));
      const values=history.filter(v=>loudness(v.power)>-70).map(v=>loudness(v.power)).sort((a,b)=>a-b);
      const percentile=(p)=>values.length?values[Math.min(values.length-1,Math.floor(p*(values.length-1)))]:NaN;
      const range=values.length>10?percentile(.95)-percentile(.1):NaN;
      momentaryMax=Math.max(momentaryMax,momentary);
      shortMax=Math.max(shortMax,short);
      peakMax=Math.max(peakMax,20*Math.log10(Math.max(1e-12,frame.peak)));
      $("lufsMomentary").textContent=format(momentary,"LUFS");
      $("lufsShort").textContent=format(short,"LUFS");
      $("lufsIntegrated").textContent=format(integrated,"LUFS");
      $("loudnessRange").textContent=format(range,"LU");
      $("lufsMomentaryMax").textContent=format(momentaryMax,"LUFS");
      $("lufsShortMax").textContent=format(shortMax,"LUFS");
      $("truePeakMax").textContent=format(peakMax,"dBTP");
      $("loudnessMeterFill").style.height=`${Math.max(0,Math.min(100,(momentary+54)/54*100))}%`;
    }
    requestAnimationFrame(update);
  }


  // Workspace modular: mueve los nodos originales sin desmontar sus controles.
  function setupDockablePanels(){
    const main=document.querySelector('main');
    const bottom=document.querySelector('.bottom-grid');
    if(!main||!bottom)return;
    const workspace=document.createElement('div');
    workspace.className='modular-workspace';
    workspace.id='modularWorkspace';
    // La barra principal permanece intacta: selector de sesión y marca.
    main.insertBefore(workspace,main.firstChild);
    const groups=document.querySelector('.group-buses');
    const entries=[
      {id:'session',node:main.querySelector('.sessionbar'),name:'NOMBRE / TRANSPORTE'},
      {id:'arrangement',node:main.querySelector('#arrangement'),name:'MULTIPISTA'},
      {id:'mixer',node:main.querySelector('.editor.panel'),name:'MIXER / FADERS'},
      {id:'groups',node:groups,name:'BUSES / GRUPOS'},
      {id:'browser',node:bottom.querySelector('.library'),name:'SESSION BROWSER'},
      {id:'loudness',node:bottom.querySelector('#loudnessPanel'),name:'MASTER LOUDNESS'},
      {id:'master',node:bottom.querySelector('.master'),name:'MASTER OUTPUT'}
    ].filter(e=>e.node);
    const map=new Map(entries.map(e=>[e.id,e]));
    const storageKey='ppekadorr-workspace-v2';
    const originals=entries.map(e=>e.id);
    const defaults={order:originals,wide:['session','arrangement','mixer'],hidden:[],sizes:{}};
    let state={...defaults};
    try{
      const old=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(old && Array.isArray(old.order)){
        state.order=[...new Set(old.order.filter(id=>map.has(id)))];
        originals.forEach(id=>{if(!state.order.includes(id))state.order.push(id)});
        state.wide=(Array.isArray(old.wide)?old.wide:defaults.wide).filter(id=>map.has(id));
        state.hidden=(Array.isArray(old.hidden)?old.hidden:[]).filter(id=>map.has(id));
        state.sizes=(old.sizes && typeof old.sizes==='object')?old.sizes:{};
      }
    }catch(error){console.warn('Layout guardado no válido',error)}
    const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state))}catch(error){console.warn('No se pudo guardar layout',error)}};
    const toolbar=document.createElement('div');toolbar.className='workspace-toolbar';
    toolbar.innerHTML='<strong>ESPACIO MODULAR</strong><span>⠿ arrastrar · ↔ ampliar · − ocultar · ↕ alto · ↔ borde derecho: ancho</span><button type="button" class="workspace-restore">RESTABLECER TODO</button><div class="workspace-visibility"></div>';
    main.insertBefore(toolbar,workspace);
    const visibility=toolbar.querySelector('.workspace-visibility');
    let sourceId=null;
    function renderVisibility(){
      visibility.replaceChildren();
      for(const e of entries){
        const button=document.createElement('button');
        button.type='button';button.className='visibility-toggle';
        button.textContent=(state.hidden.includes(e.id)?'+ ':'✓ ')+e.name;
        button.setAttribute('aria-pressed',String(!state.hidden.includes(e.id)));
        button.addEventListener('click',()=>{
          state.hidden=state.hidden.includes(e.id)?state.hidden.filter(id=>id!==e.id):[...state.hidden,e.id];
          apply();save();
        });
        visibility.append(button);
      }
    }
    function apply(){
      for(const id of state.order){
        const e=map.get(id);if(!e)continue;
        workspace.append(e.node);
        e.node.classList.toggle('workspace-wide',state.wide.includes(id));
        e.node.classList.toggle('workspace-hidden',state.hidden.includes(id));
        const saved=state.sizes[id]||{};
        const span=Math.max(3,Math.min(12,Number(saved.span)||(state.wide.includes(id)?12:4)));
        e.node.style.setProperty('--panel-span',String(span));
        e.node.style.minHeight=Number(saved.height)>0?`${Math.max(145,Math.min(1200,Number(saved.height)))}px`:'';
        e.node.style.setProperty('--panel-scale',String(Math.max(.82,Math.min(1.32,.82+span/24))));
        e.node.querySelector('.workspace-size')?.setAttribute('aria-pressed',String(state.wide.includes(id)));
      }
      renderVisibility();
      // Formas de onda y rejilla se reajustan tras cada reordenamiento.
      requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'))});
    }
    entries.forEach(e=>{
      e.node.classList.add('workspace-panel');
      const header=e.node.querySelector(':scope > .panel-head, :scope > .loudness-heading');
      const head=header||document.createElement('div');
      if(!header){head.className='workspace-custom-heading';e.node.prepend(head)}
      head.classList.add('workspace-heading');
      const controls=document.createElement('div');controls.className='workspace-panel-controls';
      const handle=document.createElement('button');handle.type='button';handle.className='workspace-move';
      handle.textContent='⠿ MOVER';handle.title='Arrastra para cambiar el orden';handle.draggable=true;
      const expand=document.createElement('button');expand.type='button';expand.className='workspace-size';
      expand.textContent='↔';expand.title='Ancho completo / columna';
      const hide=document.createElement('button');hide.type='button';hide.textContent='−';hide.title='Ocultar ventana';
      controls.append(handle,expand,hide);head.append(controls);
      if(!header){const title=document.createElement('strong');title.textContent=e.name;head.prepend(title)}
      expand.addEventListener('click',()=>{
        const wide=!state.wide.includes(e.id);
        state.wide=wide?[...state.wide,e.id]:state.wide.filter(id=>id!==e.id);
        state.sizes[e.id]={...(state.sizes[e.id]||{}),span:wide?12:4};
        apply();save();
      });
      hide.addEventListener('click',()=>{state.hidden=[...new Set([...state.hidden,e.id])];apply();save()});
      handle.addEventListener('dragstart',event=>{
        sourceId=e.id;e.node.classList.add('workspace-dragging');
        event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',e.id);
      });
      handle.addEventListener('dragend',()=>{sourceId=null;e.node.classList.remove('workspace-dragging');workspace.querySelectorAll('.workspace-drop').forEach(el=>el.classList.remove('workspace-drop'))});
      e.node.addEventListener('dragover',event=>{
        if(!sourceId||sourceId===e.id)return;
        event.preventDefault();event.dataTransfer.dropEffect='move';e.node.classList.add('workspace-drop');
      });
      e.node.addEventListener('dragleave',event=>{if(!e.node.contains(event.relatedTarget))e.node.classList.remove('workspace-drop')});
      e.node.addEventListener('drop',event=>{
        if(!sourceId||sourceId===e.id)return;
        event.preventDefault();e.node.classList.remove('workspace-drop');
        const from=state.order.indexOf(sourceId),to=state.order.indexOf(e.id);
        if(from<0||to<0)return;
        state.order.splice(from,1);state.order.splice(to,0,sourceId);
        apply();save();
      });
      // Tiradores independientes para alto y ancho, y esquina para ambos.
      // Ancho en columnas de la cuadrícula: otros paneles fluyen sin solaparse.
      const gridSpan=()=>{
        const gridWidth=workspace.getBoundingClientRect().width;
        const gap=parseFloat(getComputedStyle(workspace).columnGap)||10;
        return (gridWidth-gap*11)/12+gap;
      };
      function resizeHandle(kind,className,title){
        const handle=document.createElement('div');
        handle.className=className;
        handle.title=title;
        handle.setAttribute('role','separator');
        handle.setAttribute('aria-label',title);
        handle.tabIndex=0;
        const adjust=(deltaX,deltaY,start)=>{
          const record={...(state.sizes[e.id]||{})};
          if(kind!=='vertical'){
            const span=Math.max(3,Math.min(12,Math.round(start.span+deltaX/Math.max(1,gridSpan()))));
            record.span=span;
            e.node.style.setProperty('--panel-span',String(span));
            e.node.style.setProperty('--panel-scale',String(Math.max(.82,Math.min(1.32,.82+span/24))));
            state.wide=span===12?[...new Set([...state.wide,e.id])]:state.wide.filter(id=>id!==e.id);
          }
          if(kind!=='horizontal'){
            record.height=Math.max(145,Math.min(1200,Math.round(start.height+deltaY)));
            e.node.style.minHeight=record.height+'px';
          }
          state.sizes[e.id]=record;
        };
        handle.addEventListener('pointerdown',event=>{
          if(event.button!==0)return;
          event.preventDefault();event.stopPropagation();
          const x=event.clientX,y=event.clientY;
          const start={span:Number(state.sizes[e.id]?.span)||(state.wide.includes(e.id)?12:4),height:e.node.offsetHeight};
          handle.setPointerCapture(event.pointerId);
          const move=ev=>adjust(ev.clientX-x,ev.clientY-y,start);
          const finish=()=>{
            handle.removeEventListener('pointermove',move);
            handle.removeEventListener('pointerup',finish);
            handle.removeEventListener('pointercancel',finish);
            save();requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
          };
          handle.addEventListener('pointermove',move);
          handle.addEventListener('pointerup',finish,{once:true});
          handle.addEventListener('pointercancel',finish,{once:true});
        });
        handle.addEventListener('keydown',ev=>{
          const step=ev.shiftKey?3:1;
          const deltaX=ev.key==='ArrowRight'?step:-step;
          const deltaY=ev.key==='ArrowDown'?16:-16;
          if(kind==='horizontal'&&!['ArrowRight','ArrowLeft'].includes(ev.key))return;
          if(kind==='vertical'&&!['ArrowDown','ArrowUp'].includes(ev.key))return;
          if(kind==='both'&&!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(ev.key))return;
          ev.preventDefault();
          const start={span:Number(state.sizes[e.id]?.span)||(state.wide.includes(e.id)?12:4),height:e.node.offsetHeight};
          if(ev.key==='ArrowLeft'||ev.key==='ArrowRight')adjust(deltaX*gridSpan(),0,start);
          else adjust(0,deltaY,start);
          save();requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
        });
        e.node.append(handle);
      }
      // Quita el tirador antiguo si un proyecto se ha abierto con scripts mezclados.
      e.node.querySelector(':scope > .workspace-resizer')?.remove();
      resizeHandle('vertical','workspace-resizer','Cambiar altura del contenedor');
      resizeHandle('horizontal','workspace-resizer-right','Arrastrar a la derecha para cambiar ancho');
      resizeHandle('both','workspace-resizer-corner','Cambiar ancho y alto');
    });
    // Faders: se reordena solo su DOM, no el índice lógico de audio, mute o solo.
    function sortableStrips(host,selector,key,dataName){
      if(!host)return;
      let dragged=null;
      function reorder(){
        let ids=[];
        try{ids=JSON.parse(localStorage.getItem(key)||'[]')}catch(_){ }
        if(!Array.isArray(ids))ids=[];
        const found=[...host.querySelectorAll(selector)];
        const map=new Map(found.map(el=>[el.dataset[dataName],el]));
        ids.forEach(id=>{if(map.has(String(id)))host.append(map.get(String(id)))});
      }
      host.addEventListener('dragstart',event=>{
        const grip=event.target.closest('.strip-grip');if(!grip)return;
        const strip=grip.closest(selector);if(!strip)return;
        dragged=strip;strip.classList.add('strip-dragging');
        event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',strip.dataset[dataName]);
      });
      host.addEventListener('dragover',event=>{
        if(!dragged)return;
        const target=event.target.closest(selector);
        if(!target||target===dragged)return;
        event.preventDefault();target.classList.add('strip-target');
      });
      host.addEventListener('dragleave',event=>{
        const target=event.target.closest(selector);
        if(target&&!target.contains(event.relatedTarget))target.classList.remove('strip-target');
      });
      host.addEventListener('drop',event=>{
        const target=event.target.closest(selector);if(!dragged||!target||target===dragged)return;
        event.preventDefault();target.classList.remove('strip-target');
        const nodes=[...host.querySelectorAll(selector)];
        const a=nodes.indexOf(dragged),b=nodes.indexOf(target);
        if(a<b)target.after(dragged);else target.before(dragged);
        persist();
      });
      function persist(){
        try{localStorage.setItem(key,JSON.stringify([...host.querySelectorAll(selector)].map(el=>el.dataset[dataName])))}catch(_){}
      }
      host.addEventListener('dragend',()=>{
        if(dragged)dragged.classList.remove('strip-dragging');
        dragged=null;host.querySelectorAll('.strip-target').forEach(el=>el.classList.remove('strip-target'));
      });
      const observer=new MutationObserver(()=>{
        // El render del mixer borra y recrea canales; se añaden grips a los nuevos.
        observer.disconnect();
        [...host.querySelectorAll(selector)].forEach(strip=>{
          if(strip.querySelector('.strip-grip'))return;
          const handle=document.createElement('button');handle.type='button';handle.className='strip-grip';
          handle.title='Arrastra para ordenar este fader';handle.textContent='⠿';handle.draggable=true;
          strip.prepend(handle);
        });
        reorder();observer.observe(host,{childList:true});
      });
      observer.observe(host,{childList:true});
      [...host.querySelectorAll(selector)].forEach(strip=>{
        if(strip.querySelector('.strip-grip'))return;
        const grip=document.createElement('button');grip.type='button';grip.className='strip-grip';grip.draggable=true;grip.textContent='⠿';grip.title='Arrastra para ordenar el fader';strip.prepend(grip);
      });
      reorder();
      return ()=>{try{localStorage.removeItem(key)}catch(_){};reorder()};
    }
    const resetTracks=sortableStrips(document.querySelector('#channels'),'.channel','ppekadorr-channel-order-v1','track');
    const resetGroups=sortableStrips(document.querySelector('.group-buses-strips'),'.group-strip','ppekadorr-group-order-v1','bus');
    toolbar.querySelector('.workspace-restore').addEventListener('click',()=>{
      state={order:[...originals],wide:[...defaults.wide],hidden:[],sizes:{}};
      entries.forEach(e=>{e.node.style.minHeight='';e.node.style.removeProperty('--panel-span');});
      resetTracks?.();resetGroups?.();
      // Reposicionar tiras de canal por índice, sin cambiar conexiones de audio.
      const host=document.querySelector('#channels');
      [...host.querySelectorAll('.channel')].sort((a,b)=>Number(a.dataset.track)-Number(b.dataset.track)).forEach(node=>host.append(node));
      apply();save();
    });
    apply();
  }

  function setupProductionTools(){
    const bar=document.querySelector(".clip-editor-toolbar");
    if(!bar)return;
    const extra=document.createElement("div");
    extra.className="production-tools";
    extra.innerHTML='<label>BPM <input id="prodBpm" type="number" min="30" max="300" value="120"></label><label><input id="prodSnap" type="checkbox"> SNAP</label><button id="prodMarker">+ MARCADOR</button><button id="prodFadeIn">FADE IN</button><button id="prodFadeOut">FADE OUT</button><button id="prodAutomation">AUTOMATIZACIÓN</button><span id="prodMarkers"></span>';
    bar.after(extra);
    $("prodBpm").addEventListener("change",e=>{bpm=Math.max(30,Math.min(300,Number(e.target.value)||120));});
    $("prodSnap").addEventListener("change",e=>{snapEnabled=e.target.checked;});
    $("prodMarker").addEventListener("click",()=>{
      const time=currentTime();
      const name=prompt("Nombre del marcador",`Marcador ${markers.length+1}`);
      if(name===null)return;
      markers.push({time,name:name.trim()||"Marcador"});
      renderMarkers();
    });
    const fade=(type)=>{
      const clip=clipSelected();if(!clip)return alert("Selecciona un clip primero.");
      const seconds=prompt("Duración del fundido en segundos (0 para quitar)",String(clip[type]||1));
      if(seconds===null)return;
      const n=Number(seconds);
      if(!Number.isFinite(n)||n<0)return;
      clipCheckpoint();clip[type]=Math.min(n,clip.length);
      renderArrangement();
    };
    $("prodFadeIn").addEventListener("click",()=>fade("fadeIn"));
    $("prodFadeOut").addEventListener("click",()=>fade("fadeOut"));
    $("prodAutomation").addEventListener("click",()=>{
      const clip=clipSelected();if(!clip)return alert("Selecciona un clip primero.");
      const value=prompt("Nivel en este instante (0 a 200 %)", "100");
      if(value===null)return;
      const n=Number(value);if(!Number.isFinite(n)||n<0||n>200)return;
      const points=volumeAutomation[clip.track]||[];
      points.push({time:currentTime(),value:n/100});
      volumeAutomation[clip.track]=points;
      alert(`Punto de automatización añadido: pista ${clip.track+1}, ${n}%`);
    });
    function renderMarkers(){
      const host=$("prodMarkers");host.innerHTML="";
      markers.sort((a,b)=>a.time-b.time).forEach((marker,i)=>{
        const b=document.createElement("button");
        b.textContent=`${marker.name} (${shortFmt(marker.time)})`;
        b.title="Clic: ir al marcador · clic derecho: eliminar";
        b.addEventListener("click",()=>seekTo(marker.time));
        b.addEventListener("contextmenu",event=>{event.preventDefault();markers.splice(i,1);renderMarkers();});
        host.append(b);
      });
    }
    window.PpekadorRenderMarkers=renderMarkers;
  }
  // Inicialización en blanco: no carga automáticamente songs[0].
  populateSelect();
  renderList();
  setupAudioImport();
  setupProjectImportExport();
  setupAudioExport();
  setupGroupBuses();
  setupVerticalArrangementZoom();
  setupClipEditor();
  setupLoudnessMeter();
  setupDockablePanels();
  setupProductionTools();
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
