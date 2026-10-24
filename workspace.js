/* PpekadorR Studio UX — disposición profesional, sin librerías externas.
   Reorganiza los NODOS ORIGINALES, no clones: los listeners de audio se conservan. */
(() => {
  'use strict';
  const main = document.querySelector('main');
  const bottom = main?.querySelector('.bottom-grid');
  if (!main || !bottom) return;

  const source = [
    ['arrangement', main.querySelector('#arrangement'), 'ARRANGEMENT'],
    ['mixer', main.querySelector('.editor.panel'), 'MIXER'],
    ['groups', main.querySelector('.group-buses'), 'GROUP BUS'],
    ['browser', bottom.querySelector('.library'), 'SESSION BROWSER'],
    ['loudness', bottom.querySelector('#loudnessPanel'), 'MASTER LOUDNESS'],
    ['master', bottom.querySelector('.master'), 'MASTER OUTPUT']
  ];
  const entries = source.filter(([,node]) => node).map(([id,node,title]) => ({id,node,title}));
  if (!entries.length) return;
  const ids = entries.map(e => e.id);
  const transport = main.querySelector('#transportDock');
  const panels = Object.fromEntries(entries.map(e => [e.id,e.node]));
  const STEP = 32, GAP = 8, COLS = 12;
  const storageKey = 'ppekadorr-studio-ux-v2-transport';
  const defaults = {
    edit: {
      arrangement:[0,0,12,16],mixer:[0,16,9,15],groups:[9,16,3,15],
      browser:[0,31,3,14],loudness:[3,31,5,14],master:[8,31,4,21]
    },
    mix: {
      mixer:[0,0,8,22],groups:[8,0,4,11],master:[8,11,4,21],
      arrangement:[0,22,8,14],browser:[0,36,3,13],loudness:[3,36,5,13]
    },
    master: {
      arrangement:[0,0,8,13],master:[8,0,4,22],loudness:[0,13,8,13],
      mixer:[0,26,9,17],groups:[9,26,3,17],browser:[0,43,5,12]
    }
  };
  const minSpan = {arrangement:5,mixer:4,groups:2,browser:2,loudness:3,master:3};
  const minRows = {arrangement:7,mixer:8,groups:7,browser:6,loudness:8,master:10};
  const clone = value => JSON.parse(JSON.stringify(value));
  const sanitize = (p,id) => ({
    c:Math.max(0,Math.min(12 - minSpan[id],Math.round(Number(p?.c)||0))),
    r:Math.max(0,Math.min(250,Math.round(Number(p?.r)||0))),
    w:Math.max(minSpan[id],Math.min(12,Math.round(Number(p?.w)||minSpan[id]))),
    h:Math.max(minRows[id],Math.min(85,Math.round(Number(p?.h)||minRows[id])))
  });
  const makePreset = name => Object.fromEntries(ids.map(id => {
    const a = defaults[name][id] || defaults.edit[id];
    return [id,sanitize({c:a[0],r:a[1],w:a[2],h:a[3]},id)];
  }));
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { saved = {}; }
  if (!saved || typeof saved !== 'object') saved = {};
  let view = ['edit','mix','master'].includes(saved.view) ? saved.view : 'edit';
  let theme = ['slate','classic'].includes(saved.theme) ? saved.theme : 'slate';
  let density = ['compact','comfortable'].includes(saved.density) ? saved.density : 'compact';
  let locked = Boolean(saved.locked);
  let hidden = Array.isArray(saved.hidden) ? saved.hidden.filter(id => ids.includes(id)||id==='session') : [];
  // Browser always starts closed. It opens only on explicit PANELES selection.
  if(!hidden.includes('browser')) hidden.push('browser');
  const layouts = Object.fromEntries(Object.keys(defaults).map(v => [v,makePreset(v)]));
  for (const v of Object.keys(defaults)) {
    const old = saved.layouts?.[v];
    if (old && typeof old === 'object') {
      for (const id of ids) if (old[id]) layouts[v][id] = sanitize(old[id],id);
    }
  }
  const save = () => {
    try {localStorage.setItem(storageKey,JSON.stringify({view,theme,density,locked,hidden,layouts}));}
    catch (e) {console.warn('No se pudo guardar la distribución',e);}
  };
  const workbar = document.createElement('div');
  workbar.className = 'studio-toolbar';
  workbar.innerHTML = `
    <div class="studio-toolbar-brand"><span class="studio-live-dot"></span><strong>STUDIO WORKSPACE</strong><small>PERSONALIZABLE</small></div>
    <div class="studio-toolbar-controls">
      <label class="studio-setting">VISTA <select id="studioView" aria-label="Vista de trabajo">
        <option value="edit">EDICIÓN</option><option value="mix">MEZCLA</option><option value="master">MASTERING</option>
      </select></label>
      <label class="studio-setting">DENSIDAD <select id="studioDensity" aria-label="Densidad de paneles">
        <option value="compact">COMPACTA</option><option value="comfortable">CÓMODA</option>
      </select></label>
      <label class="studio-setting">TEMA <select id="studioTheme" aria-label="Tema visual">
        <option value="slate">STUDIO BLUE</option><option value="classic">CLASSIC GREEN</option>
      </select></label>
      <button id="studioLock" type="button" aria-pressed="false" title="Bloquear el movimiento y el tamaño de los paneles">🔓 LIBRE</button>
      <button id="studioReset" type="button" title="Restaurar posiciones de la vista actual">↺ RESTABLECER VISTA</button>
      <button id="studioPanels" type="button" aria-expanded="false">☷ PANELES</button>
    </div>
    <div id="studioActions" class="studio-actionbar" aria-label="Herramientas de sesión y arreglo"></div>
    <div id="studioVisibility" class="studio-visibility" hidden></div>
    <div class="studio-hint">⠿ Arrastra el encabezado · Ajuste magnético invisible · Bordes derecho e inferior para redimensionar · <kbd>Shift</kbd> + flechas sobre ⠿ para mover</div>
  `;
  const stage = document.createElement('div');
  stage.className = 'studio-stage';
  const workspace = document.createElement('div');
  workspace.id = 'studioWorkspace';
  workspace.className = 'studio-workspace';
  main.insertBefore(workbar,main.firstChild);
  workbar.after(stage);
  stage.append(workspace);
  bottom.remove();

  let topRow = 0;
  const renderControls = () => {
    const visibility = workbar.querySelector('#studioVisibility');
    visibility.replaceChildren();
    for (const e of [{id:'session',title:'TRANSPORTE'},...entries]) {
      const button = document.createElement('button');
      button.type='button';
      button.className='studio-visibility-button';
      const isHidden = hidden.includes(e.id);
      button.textContent=(isHidden?'＋ ':'✓ ')+e.title;
      button.setAttribute('aria-pressed',String(!isHidden));
      button.addEventListener('click',()=>{
        hidden = isHidden ? hidden.filter(id => id !== e.id) : [...hidden,e.id];
        renderControls();commit();
      });
      visibility.append(button);
    }
  };
  const hasOverlap = (a,b) => a.c < b.c+b.w && a.c+a.w > b.c && a.r < b.r+b.h && a.r+a.h > b.r;
  function solve(leadingId=null) {
    const layout=layouts[view];
    // Only the panel being operated on has priority; other panels retain their column.
    const ordered=leadingId ? [leadingId,...ids.filter(id=>id!==leadingId)] : ids;
    const placed=[];
    for (const id of ordered) {
      if(hidden.includes(id)) continue;
      const p=layout[id];
      p.w=Math.max(minSpan[id],Math.min(COLS,p.w));
      p.c=Math.max(0,Math.min(COLS-p.w,p.c));
      p.h=Math.max(minRows[id],p.h);
      let guard=0;
      while (placed.some(other => hasOverlap(p,other)) && guard++ < 1000) {
        // Relocate to the first lower row, not simply swap panels.
        const intersect=placed.filter(other=>hasOverlap(p,other));
        p.r=Math.max(p.r+1,...intersect.map(other=>other.r+other.h));
      }
      placed.push({...p});
    }
  }
  function metrics() {
    const width=Math.max(560,workspace.clientWidth);
    const cell=(width-GAP*11)/12;
    return {cell,stepX:cell+GAP};
  }
  let pendingResize=0;
  const informCanvas=()=>{
    cancelAnimationFrame(pendingResize);
    pendingResize=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  };
  function draw(skipResize=false) {
    transport?.classList.toggle('transport-hidden',hidden.includes('session'));
    document.body.classList.toggle('transport-is-hidden',hidden.includes('session'));
    const m=metrics();let maxBottom=15;
    for (const e of entries) {
      const p=layouts[view][e.id],node=e.node;
      const isHidden=hidden.includes(e.id);
      node.classList.toggle('studio-hidden',isHidden);
      if(isHidden)continue;
      const x=p.c*m.stepX,y=p.r*STEP;
      const w=p.w*m.cell+(p.w-1)*GAP;
      const h=p.h*STEP-GAP;
      node.style.left=x+'px';node.style.top=y+'px';
      node.style.width=w+'px';node.style.height=h+'px';
      node.dataset.size=p.w <= 3?'narrow':p.w<=5?'medium':'wide';
      maxBottom=Math.max(maxBottom,p.r+p.h);
    }
    topRow=maxBottom;
    workspace.style.height=(maxBottom*STEP+20)+'px';
    if(!skipResize) informCanvas();
  }
  const commit=(leader)=>{solve(leader);draw();save();};
  const themeApply=()=>{document.body.dataset.studioTheme=theme;document.body.dataset.studioDensity=density;};
  const controls=workbar.querySelector('.studio-toolbar-controls');
  controls.querySelector('#studioView').value=view;
  controls.querySelector('#studioDensity').value=density;
  controls.querySelector('#studioTheme').value=theme;
  const lockButton=controls.querySelector('#studioLock');
  function updateLock(){
    lockButton.textContent=locked?'🔒 BLOQUEADO':'🔓 LIBRE';
    lockButton.setAttribute('aria-pressed',String(locked));
    workspace.classList.toggle('studio-locked',locked);
  }
  controls.querySelector('#studioView').addEventListener('change',e=>{view=e.target.value;commit();});
  controls.querySelector('#studioDensity').addEventListener('change',e=>{density=e.target.value;themeApply();save();});
  controls.querySelector('#studioTheme').addEventListener('change',e=>{theme=e.target.value;themeApply();save();});
  lockButton.addEventListener('click',()=>{locked=!locked;updateLock();save();});
  controls.querySelector('#studioReset').addEventListener('click',()=>{
    layouts[view]=makePreset(view);
    commit();
  });
  controls.querySelector('#studioPanels').addEventListener('click',e=>{
    const host=workbar.querySelector('#studioVisibility');
    host.hidden=!host.hidden;
    e.currentTarget.setAttribute('aria-expanded',String(!host.hidden));
  });

  function installDrag(e,grip) {
    grip.addEventListener('pointerdown',event=>{
      if(locked||event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const node=e.node,id=e.id;
      const start={...layouts[view][id]};
      const x=event.clientX,y=event.clientY;
      const m=metrics();
      grip.setPointerCapture(event.pointerId);
      node.classList.add('studio-moving');
      function move(ev){
        const dc=Math.round((ev.clientX-x)/m.stepX),dr=Math.round((ev.clientY-y)/STEP);
        const p=layouts[view][id];
        p.c=Math.max(0,Math.min(12-p.w,start.c+dc));
        p.r=Math.max(0,start.r+dr);
        draw(true);
      }
      function done(){
        grip.removeEventListener('pointermove',move);
        grip.removeEventListener('pointerup',done);
        grip.removeEventListener('pointercancel',cancel);
        node.classList.remove('studio-moving');
        commit(id);
      }
      function cancel(){
        Object.assign(layouts[view][id],start);
        grip.removeEventListener('pointermove',move);
        grip.removeEventListener('pointerup',done);
        grip.removeEventListener('pointercancel',cancel);
        node.classList.remove('studio-moving');draw(true);
      }
      grip.addEventListener('pointermove',move);
      grip.addEventListener('pointerup',done);
      grip.addEventListener('pointercancel',cancel);
    });
    grip.addEventListener('keydown',event=>{
      if(locked || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const p=layouts[view][e.id];
      const step=event.shiftKey?2:1;
      if(event.key==='ArrowLeft') p.c-=step;
      if(event.key==='ArrowRight') p.c+=step;
      if(event.key==='ArrowUp') p.r-=step;
      if(event.key==='ArrowDown') p.r+=step;
      p.c=Math.max(0,Math.min(12-p.w,p.c));p.r=Math.max(0,p.r);
      commit(e.id);
    });
  }
  function installResize(e,part,side) {
    part.addEventListener('pointerdown',event=>{
      if(locked||event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const id=e.id,start={...layouts[view][id]},x=event.clientX,y=event.clientY;
      const m=metrics();
      part.setPointerCapture(event.pointerId);
      e.node.classList.add('studio-resizing');
      const move=ev=>{
        const p=layouts[view][id];
        if(side!=='height')p.w=Math.max(minSpan[id],Math.min(12-start.c,start.w+Math.round((ev.clientX-x)/m.stepX)));
        if(side!=='width')p.h=Math.max(minRows[id],Math.min(85,start.h+Math.round((ev.clientY-y)/STEP)));
        draw(true);
      };
      const done=()=>{
        part.removeEventListener('pointermove',move);
        part.removeEventListener('pointerup',done);
        part.removeEventListener('pointercancel',cancel);
        e.node.classList.remove('studio-resizing');commit(id);
      };
      const cancel=()=>{
        Object.assign(layouts[view][id],start);
        part.removeEventListener('pointermove',move);
        part.removeEventListener('pointerup',done);
        part.removeEventListener('pointercancel',cancel);
        e.node.classList.remove('studio-resizing');draw(true);
      };
      part.addEventListener('pointermove',move);
      part.addEventListener('pointerup',done);
      part.addEventListener('pointercancel',cancel);
    });
  }

  for (const e of entries) {
    e.node.classList.add('studio-panel');
    e.node.dataset.studioPanel=e.id;
    e.node.title='';
    const original=e.node.querySelector(':scope > .panel-head, :scope > .loudness-heading');
    const heading=original || document.createElement('div');
    if (!original) {
      heading.className='studio-custom-heading';
      e.node.prepend(heading);
      const title=document.createElement('strong');title.textContent=e.title;heading.append(title);
    }
    heading.classList.add('studio-heading');
    const controls=document.createElement('div');
    controls.className='studio-panel-actions';
    const grip=document.createElement('button');
    grip.type='button';grip.className='studio-grip';grip.textContent='⠿ MOVER';
    grip.title='Mover ventana; usa las flechas del teclado';
    grip.setAttribute('aria-label','Mover '+e.title);
    const expand=document.createElement('button');expand.type='button';expand.textContent='□';
    expand.title='Expandir o reducir panel';expand.className='studio-expand';
    const hide=document.createElement('button');hide.type='button';hide.textContent='−';
    hide.title='Ocultar panel (recupéralo desde PANELES)';hide.className='studio-hide';
    controls.append(grip,expand,hide);heading.append(controls);
    installDrag(e,grip);
    expand.addEventListener('click',()=>{
      const p=layouts[view][e.id];
      if(!e.node.dataset.beforeExpand){
        e.node.dataset.beforeExpand=JSON.stringify(p);
        p.c=0;p.w=12;p.h=Math.max(p.h,15);
      }else{
        Object.assign(p,JSON.parse(e.node.dataset.beforeExpand));
        delete e.node.dataset.beforeExpand;
      }
      commit(e.id);
    });
    hide.addEventListener('click',()=>{
      hidden=[...new Set([...hidden,e.id])];renderControls();commit();
    });
    for (const side of ['width','height','both']) {
      const resizer=document.createElement('div');
      resizer.className='studio-resize studio-resize-'+side;
      resizer.title=side==='width'?'Redimensionar ancho':side==='height'?'Redimensionar alto':'Redimensionar panel';
      resizer.setAttribute('aria-hidden','true');
      e.node.append(resizer);
      installResize(e,resizer,side);
    }
    workspace.append(e.node);
  }

  // The transport is outside the workspace, anchored to the viewport.
  if(transport){
    document.body.append(transport);
    transport.classList.add('transport-fixed');
    transport.querySelector('#transportHide')?.addEventListener('click',()=>{
      if(!hidden.includes('session'))hidden.push('session');
      renderControls();commit();
    });
  }
  // Move the original actionable buttons into the workspace toolbar. Their JS listeners remain attached.
  const actionBar=workbar.querySelector('#studioActions');
  const arrangementTools=document.querySelector('#arrangement .arrangement-tools');
  if(actionBar&&arrangementTools){
    actionBar.append(...[...arrangementTools.children]);
    arrangementTools.classList.add('studio-tools-relocated');
  }

  // Keep controls tied to their original track/bus index, even after visual reordering.
  function sortableStrips(host,selector,key,dataField){
    if(!host)return;
    let active=null;
    const decorate=()=>{
      const strips=[...host.querySelectorAll(':scope > '+selector)];
      for(const node of strips){
        if(node.querySelector(':scope > .strip-grip'))continue;
        const grip=document.createElement('button');grip.type='button';grip.className='strip-grip';
        grip.title='Reordenar canal';grip.textContent='⠿';grip.draggable=true;
        node.prepend(grip);
      }
      let previous=[];
      try{previous=JSON.parse(localStorage.getItem(key)||'[]');}catch(_){}
      if(!Array.isArray(previous))previous=[];
      const lookup=new Map(strips.map(node=>[node.dataset[dataField],node]));
      for(const id of previous)if(lookup.has(String(id)))host.append(lookup.get(String(id)));
    };
    host.addEventListener('dragstart',event=>{
      const grip=event.target.closest('.strip-grip');if(!grip)return;
      active=grip.closest(selector);
      if(!active)return;
      active.classList.add('strip-dragging');
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',active.dataset[dataField]);
    });
    host.addEventListener('dragover',event=>{
      if(!active)return;
      const candidate=event.target.closest(selector);
      if(!candidate||candidate===active)return;
      event.preventDefault();candidate.classList.add('strip-target');
    });
    host.addEventListener('drop',event=>{
      if(!active)return;
      const target=event.target.closest(selector);
      if(!target||target===active)return;
      event.preventDefault();
      const list=[...host.querySelectorAll(':scope > '+selector)];
      if(list.indexOf(active)<list.indexOf(target))target.after(active);
      else target.before(active);
      try{localStorage.setItem(key,JSON.stringify([...host.querySelectorAll(':scope > '+selector)].map(node=>node.dataset[dataField])));}catch(_){}
    });
    host.addEventListener('dragend',()=>{
      active?.classList.remove('strip-dragging');active=null;
      host.querySelectorAll('.strip-target').forEach(node=>node.classList.remove('strip-target'));
    });
    const observer=new MutationObserver(()=>{
      observer.disconnect();
      decorate();
      observer.observe(host,{childList:true});
    });
    decorate();observer.observe(host,{childList:true});
  }
  sortableStrips(document.querySelector('#channels'),'.channel','ppekadorr-channel-order-v1','track');
  sortableStrips(document.querySelector('.group-buses-strips'),'.group-strip','ppekadorr-group-order-v1','bus');

  // Resolve collisions before first draw and on each preset switch.
  themeApply();updateLock();renderControls();commit();
  let lastWidth=workspace.clientWidth;
  window.addEventListener('resize',()=>{
    const next=workspace.clientWidth;
    if(Math.abs(lastWidth-next)<1)return;
    lastWidth=next;
    draw(true);
  });
  window.PpekadorStudioUX={getView:()=>view,getLayout:()=>clone(layouts[view])};
})();
