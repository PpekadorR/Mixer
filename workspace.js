/* PpekadorR — Reference Dock Workspace.
 * Fixed professional editor layout. Original audio nodes, controls and listeners remain intact.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const main=document.querySelector('main');
  const bottom=main?.querySelector('.bottom-grid');
  if(!main||!bottom)return;
  const references=[
    ['browser',bottom.querySelector('.library'),'Browser'],
    ['arrangement',main.querySelector('#arrangement'),'Arrangement'],
    ['mixer',main.querySelector('.editor.panel'),'Mixer'],
    ['groups',main.querySelector('.group-buses'),'Group buses'],
    ['master',bottom.querySelector('.master'),'Master output'],
    ['loudness',bottom.querySelector('#loudnessPanel'),'Loudness']
  ];
  const panels=Object.fromEntries(references.map(([id,node])=>[id,node]));
  if(Object.values(panels).some(node=>!node))return;
  const storageKey='ppekadorr-reference-layout-v4';
  let settings={view:'edit',theme:'graphite',density:'compact',hidden:[],browserWidth:238,arrangementHeight:440,mixerHeight:310,trackLabelWidth:280};
  try{
    const stored=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(stored&&typeof stored==='object')settings={...settings,...stored};
  }catch(_){}
  if(!Array.isArray(settings.hidden))settings.hidden=[];
  settings.hidden=settings.hidden.filter(id=>id!=='loudness');
  // Never hide the editor + mixer simultaneously; user may switch views freely.
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch(_){}};
  const toolbar=document.createElement('div');
  toolbar.className='studio-toolbar';
  toolbar.innerHTML=`
    <div class="studio-toolbar-brand"><strong>EDIT</strong><span> / </span><span id="workspaceProjectLabel">ARRANGEMENT</span></div>
    <div id="studioEditTools" class="studio-edit-tools"></div>
    <div class="studio-toolbar-controls">
      <label class="studio-setting" title="Seleccionar disposición">VISTA <select id="studioView"><option value="edit">EDICIÓN</option><option value="mix">MEZCLA</option><option value="master">MASTERING</option></select></label>
      <label class="studio-setting" title="Tamaño de herramientas">DENSIDAD <select id="studioDensity"><option value="compact">COMPACTA</option><option value="comfortable">CÓMODA</option></select></label>
      <label class="studio-setting" title="Colores de la consola">TEMA <select id="studioTheme"><option value="graphite">STUDIO GRAPHITE</option><option value="slate">ACERO</option><option value="classic">CLÁSICO</option></select></label>
      <button id="studioLock" title="Bloquear o desbloquear divisores" aria-pressed="false">◩</button>
      <button id="studioReset" title="Restablecer tamaños">↺</button>
      <button id="studioPanels" aria-expanded="false">☷ PANELES</button>
      <details class="studio-files"><summary>ARCHIVO / EXPORTAR</summary><div id="studioActions" class="studio-actionbar"></div></details>
    </div>
    <div id="studioVisibility" class="studio-visibility" hidden></div>`;
  const stage=document.createElement('div');stage.className='studio-stage';
  const workspace=document.createElement('div');workspace.id='studioWorkspace';workspace.className='studio-workspace';
  const sidebar=document.createElement('aside');sidebar.className='studio-sidebar';
  main.prepend(toolbar);toolbar.after(stage);stage.append(workspace);
  bottom.remove();
  references.forEach(([id,node])=>{
    node.dataset.studioPanel=id;node.classList.add('studio-panel');
    (id==='browser'||id==='loudness'?sidebar:workspace).append(node);
    const header=node.querySelector(':scope > .panel-head, :scope > .loudness-heading, :scope > .group-buses-heading');
    if(header)header.classList.add('studio-heading');
  });
  workspace.append(sidebar);
  const transport=$('transportDock');
  if(transport){
    document.querySelector('.topbar')?.after(transport);
    transport.classList.add('transport-fixed');
    transport.querySelector('#transportHide')?.addEventListener('click',()=>{settings.hidden=[...new Set([...settings.hidden,'transport'])];update();});
  }
  // Move all original project control nodes, preserving JS event handlers.
  const filebar=$('studioActions');
  const arrangementButtons=$('arrangement')?.querySelector('.arrangement-tools');
  if(filebar&&arrangementButtons){
    [...arrangementButtons.children].forEach(el=>filebar.append(el));
  }
  const edit=$('studioEditTools');
  const clipToolbar=document.querySelector('.clip-editor-toolbar');
  const production=document.querySelector('.production-tools');
  if(clipToolbar)edit.append(clipToolbar);
  if(production){
    const advanced=document.createElement('details');advanced.className='studio-advanced-tools';
    const summary=document.createElement('summary');summary.textContent='⚙ EDICIÓN';
    advanced.append(summary,production);edit.append(advanced);
  }
  // Pull zoom controls out of the File popup and expose in timeline toolbar.
  ['zoomOut','zoomValue','zoomIn','zoomFit'].forEach(id=>{const el=$(id);if(el)edit.append(el);});
  const browser=panels.browser;
  const songCount=$('songCount');if(songCount)songCount.textContent='';
  const visibility=$('studioVisibility');
  const panelsButton=toolbar.querySelector('#studioPanels');
  const available=[['browser','Browser'],['arrangement','Arrangement'],['mixer','Mixer'],['groups','Grupos'],['master','Master'],['transport','Transporte']];
  function showPanels(){
    visibility.replaceChildren();
    available.forEach(([id,name])=>{
      const b=document.createElement('button');b.type='button';b.className='studio-panel-toggle';
      const show=!settings.hidden.includes(id);b.textContent=(show?'☑ ':'☐ ')+name;
      b.title=`${show?'Ocultar':'Mostrar'} ${name}`;
      b.setAttribute('aria-pressed',String(show));
      b.addEventListener('click',()=>{
        settings.hidden=show?[...new Set([...settings.hidden,id])]:settings.hidden.filter(x=>x!==id);
        update();
      });visibility.append(b);
    });
  }
  function update(){
    settings.hidden=settings.hidden.filter(id=>id!=='loudness');
    settings.browserWidth=Math.max(180,Math.min(330,Number(settings.browserWidth)||238));
    settings.trackLabelWidth=Math.max(180,Math.min(600,Number(settings.trackLabelWidth)||280));
    settings.arrangementHeight=Math.max(220,Math.min(1000,Number(settings.arrangementHeight)||440));
    settings.mixerHeight=Math.max(190,Math.min(850,Number(settings.mixerHeight)||310));
    // One contiguous console surface, panels with explicit user visibility.
    document.body.dataset.studioView=settings.view;
    document.body.dataset.studioTheme=settings.theme;
    document.body.dataset.studioDensity=settings.density;
    workspace.style.setProperty('--ref-browser',settings.hidden.includes('browser')?'0px':settings.browserWidth+'px');
    workspace.style.setProperty('--ref-track-label-width',settings.trackLabelWidth+'px');
    const arrangement= settings.view==='mix'?Math.max(250,settings.arrangementHeight*.65):settings.view==='master'?Math.max(210,settings.arrangementHeight*.63):settings.arrangementHeight;
    const mixer=settings.view==='mix'?Math.max(360,settings.mixerHeight*1.25):settings.view==='master'?Math.max(350,settings.mixerHeight*1.2):settings.mixerHeight;
    workspace.style.setProperty('--ref-arrangement',Math.round(arrangement)+'px');
    workspace.style.setProperty('--ref-mixer',Math.round(mixer)+'px');
    references.forEach(([id,node])=>node.classList.toggle('studio-hidden',settings.hidden.includes(id)));
    transport?.classList.toggle('transport-hidden',settings.hidden.includes('transport'));
    document.body.classList.toggle('transport-is-hidden',settings.hidden.includes('transport'));
    toolbar.querySelector('#studioView').value=settings.view;
    toolbar.querySelector('#studioTheme').value=settings.theme;
    toolbar.querySelector('#studioDensity').value=settings.density;
    toolbar.querySelector('#studioLock').setAttribute('aria-pressed',String(Boolean(settings.locked)));
    toolbar.querySelector('#studioLock').textContent=settings.locked?'🔒':'◩';
    showPanels();save();
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  function resizeVertical(arrangementHeight,mixerHeight,delta){
    const minDelta=Math.max(220-arrangementHeight,mixerHeight-850);
    const maxDelta=Math.min(1000-arrangementHeight,mixerHeight-190);
    const adjusted=Math.max(minDelta,Math.min(maxDelta,delta));
    settings.arrangementHeight=arrangementHeight+adjusted;
    settings.mixerHeight=mixerHeight-adjusted;
  }
  function setDimension(property,delta){
    if(settings.locked)return;
    if(property==='arrangementHeight')resizeVertical(settings.arrangementHeight,settings.mixerHeight,delta);
    else settings[property]+=delta;
    update();
  }
  const handles=[
    {place:workspace,cls:'studio-browser-divider',dimension:'browserWidth',axis:'x'},
    {place:workspace,cls:'studio-horizontal-divider',dimension:'arrangementHeight',axis:'y'},
    {place:$('arrangementViewport'),cls:'studio-track-label-divider',dimension:'trackLabelWidth',axis:'x'}
  ];
  handles.forEach(({place,cls,dimension,axis})=>{
    if(!place)return;
    const handle=document.createElement('div');handle.className='studio-divider '+cls;
    handle.setAttribute('role','separator');handle.setAttribute('tabindex','0');
    handle.setAttribute('aria-label',dimension==='trackLabelWidth'?'Cambiar ancho de los nombres de pista':axis==='x'?'Cambiar ancho del navegador':'Cambiar espacio entre arrangement y mixer');
    if(dimension==='trackLabelWidth'){
      handle.title='Arrastra para ampliar o reducir la columna de nombres';
      handle.setAttribute('aria-orientation','vertical');
    }
    place.append(handle);
    handle.addEventListener('pointerdown',event=>{
      if(settings.locked||event.button!==0)return;
      event.preventDefault();handle.setPointerCapture(event.pointerId);
      const start=event[axis==='x'?'clientX':'clientY'],original=settings[dimension];
      const originalMixer=settings.mixerHeight;
      const move=e=>{
        const delta=e[axis==='x'?'clientX':'clientY']-start;
        if(dimension==='arrangementHeight'){
          resizeVertical(original,originalMixer,delta);
        }else settings[dimension]=original+delta;
        update();
      };
      const done=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',done);save();};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',done,{once:true});
    });
    handle.addEventListener('keydown',event=>{
      const delta= axis==='x'?(event.key==='ArrowLeft'?-12:event.key==='ArrowRight'?12:0):(event.key==='ArrowUp'?-12:event.key==='ArrowDown'?12:0);
      if(delta){event.preventDefault();setDimension(dimension,delta);}
    });
  });
  panelsButton.setAttribute('aria-controls','studioVisibility');
  panelsButton.addEventListener('click',()=>{
    visibility.hidden=!visibility.hidden;
    if(!visibility.hidden){
      const bounds=panelsButton.getBoundingClientRect();
      visibility.style.top=`${Math.round(bounds.bottom)}px`;
      visibility.style.right=`${Math.max(8,window.innerWidth-bounds.right)}px`;
    }
    panelsButton.setAttribute('aria-expanded',String(!visibility.hidden));
  });
  document.addEventListener('pointerdown',event=>{
    if(!visibility.hidden&&!visibility.contains(event.target)&&!panelsButton.contains(event.target)){
      visibility.hidden=true;
      panelsButton.setAttribute('aria-expanded','false');
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!visibility.hidden){
      visibility.hidden=true;
      panelsButton.setAttribute('aria-expanded','false');
      panelsButton.focus();
    }
  });
  toolbar.querySelector('#studioView').addEventListener('change',event=>{settings.view=event.target.value;update();});
  toolbar.querySelector('#studioTheme').addEventListener('change',event=>{settings.theme=event.target.value;update();});
  toolbar.querySelector('#studioDensity').addEventListener('change',event=>{settings.density=event.target.value;update();});
  toolbar.querySelector('#studioLock').addEventListener('click',()=>{settings.locked=!settings.locked;update();});
  toolbar.querySelector('#studioReset').addEventListener('click',()=>{settings.browserWidth=238;settings.arrangementHeight=440;settings.mixerHeight=310;update();});
  // Controls for panel visibility from their real headers. Never duplicate DSP nodes.
  references.forEach(([id,node])=>{
    if(id==='loudness')return;
    const h=node.querySelector(':scope > .panel-head, :scope > .loudness-heading, :scope > .group-buses-heading');
    if(!h)return;
    const b=document.createElement('button');b.className='studio-hide';b.textContent='−';b.type='button';b.title='Ocultar panel';
    b.addEventListener('click',()=>{settings.hidden=[...new Set([...settings.hidden,id])];update();});
    h.append(b);
  });
  update();
  window.PpekadorStudioUX={getView:()=>settings.view,getLayout:()=>({...settings})};
})();
