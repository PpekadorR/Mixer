/* PpekadorR Console Pro — UI enhancements only. Existing audio callbacks stay intact. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const topbar = document.querySelector('.topbar');
  const toolbar = document.querySelector('.studio-toolbar');
  const transport = $('transportDock');
  if (!topbar || !toolbar || !transport) return;

  // Actual working menu commands, delegated to the original controls.
  const nav=document.createElement('nav');
  nav.className='pro-menubar';nav.setAttribute('aria-label','Menú de la consola');
  const menus=[
    ['ARCHIVO',[['Añadir audios','#addAudioBtn'],['Importar proyecto','#importProjectBtn'],['Exportar proyecto','#exportProjectBtn'],['Exportar WAV','button:contains-wav'],['Exportar MP3','button:contains-mp3']]],
    ['EDITAR',[['Cortar clip','[data-mode="cut"]'],['Duplicar clip','[data-action="duplicate"]'],['Eliminar clip','[data-action="delete"]'],['Deshacer','[data-action="undo"]'],['Rehacer','[data-action="redo"]']]],
    ['VISTA',[['Edición','view:edit'],['Mezcla','view:mix'],['Mastering','view:master']]],
    ['VENTANAS',[['Mostrar / ocultar paneles','#studioPanels'],['Bloquear disposición','#studioLock'],['Restablecer vista','#studioReset']]]
  ];
  function runCommand(key){
    if(key.startsWith('view:')){
      const sel=$('studioView');if(!sel)return;
      sel.value=key.split(':')[1];sel.dispatchEvent(new Event('change',{bubbles:true}));return;
    }
    let found;
    if(key.startsWith('button:contains-')){
      const term=key.endsWith('wav')?'EXPORTAR WAV':'EXPORTAR MP3';
      found=[...document.querySelectorAll('#studioActions button')].find(x=>x.textContent.trim().toUpperCase().includes(term));
    }else found=document.querySelector(key);
    if(found)found.click();
  }
  menus.forEach(([label,items])=>{
    const details=document.createElement('details');details.className='pro-menu';
    const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
    const list=document.createElement('div');list.className='pro-dropdown';
    items.forEach(([name,key])=>{
      const b=document.createElement('button');b.type='button';b.textContent=name;
      b.addEventListener('click',()=>{runCommand(key);details.open=false;});list.append(b);
    });
    details.append(list);nav.append(details);
  });
  topbar.querySelector('.brand').after(nav);
  document.addEventListener('pointerdown',event=>{
    nav.querySelectorAll('details[open]').forEach(d=>{if(!d.contains(event.target))d.open=false;});
  });
  nav.addEventListener('toggle',e=>{if(!e.target.open)return;
    nav.querySelectorAll('details[open]').forEach(d=>{if(d!==e.target)d.open=false;});
  },true);

  // Functional secondary musical counter, calculated from playback time and session BPM.
  const extra=document.createElement('div');extra.className='pro-beat-counter';
  extra.innerHTML='<span>BAR | BEAT | TICK</span><strong id="proBeatValue">001 | 01 | 000</strong>';
  transport.querySelector('.time-readout').after(extra);
  const projectInfo=document.createElement('div');projectInfo.className='pro-status';
  projectInfo.innerHTML='<span>STEREO</span><i></i><span>WEB AUDIO</span>';
  transport.append(projectInfo);
  let last='';
  const update=()=>{
    const text=$('currentTime')?.textContent||'00:00.000';
    if(text!==last){
      last=text;
      const parts=text.split(':').map(Number);
      const seconds=parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:(parts.length===2?parts[0]*60+parts[1]:0);
      const bpm=Number($('prodBpm')?.value)||Number(($('bpmValue')?.textContent||'').match(/\d+(?:\.\d+)?/)?.[0])||120;
      const beats=seconds*bpm/60;
      const bar=Math.floor(beats/4)+1;
      const beat=Math.floor(beats%4)+1;
      const tick=Math.floor((beats%1)*960);
      $('proBeatValue').textContent=[bar,beat,tick].map((v,i)=>String(v).padStart(i===2?3:3,'0')).join(' | ');
    }
    requestAnimationFrame(update);
  };requestAnimationFrame(update);

  // Editing tool row: same original buttons, but an integrated professional toolbar.
  const arrange=$('arrangement');
  const tools=arrange?.querySelector('.clip-editor-toolbar');
  if(tools){
    const title=tools.querySelector('strong');if(title)title.textContent='HERRAMIENTAS';
    tools.querySelector('small')?.classList.add('pro-editor-help');
  }
  const list=document.querySelector('.library');
  if(list){
    const bar=document.createElement('div');bar.className='pro-browser-tools';
    const search=document.createElement('input');search.type='search';search.placeholder='Buscar sesión...';search.setAttribute('aria-label','Buscar sesión');
    bar.append(search);
    const songList=$('songList');songList?.before(bar);
    search.addEventListener('input',()=>{
      const q=search.value.toLocaleLowerCase();
      songList?.querySelectorAll('.song-card').forEach(card=>{
        card.hidden=!card.textContent.toLocaleLowerCase().includes(q);
      });
    });
  }
  const editor=document.querySelector('.editor');
  if(editor){
    const bar=document.createElement('div');bar.className='pro-mixer-navigation';
    bar.innerHTML='<div class="pro-tabs"><button type="button" class="pro-tab-active" data-pro-mix="all" aria-pressed="true">MIXER</button><button type="button" data-pro-mix="fx" aria-pressed="false">EQ / COMP</button><button type="button" data-pro-mix="routes" aria-pressed="false">SENDS / BUS</button></div><span class="pro-console-label">CANAL / NIVEL / RUTEO</span>';
    bar.querySelectorAll('[data-pro-mix]').forEach(button=>button.addEventListener('click',()=>{
      editor.dataset.proMix=button.dataset.proMix;
      bar.querySelectorAll('[data-pro-mix]').forEach(b=>{
        const active=b===button;b.classList.toggle('pro-tab-active',active);b.setAttribute('aria-pressed',String(active));
      });
    }));
    const panelHeading=editor.querySelector('.panel-head');panelHeading?.after(bar);
  }
  // A useful workspace label and real view state, not placeholder buttons.
  const dockStatus=document.createElement('span');dockStatus.className='pro-dock-status';dockStatus.textContent='● AUDIO ENGINE';
  toolbar.querySelector('.studio-toolbar-brand')?.append(dockStatus);
})();
