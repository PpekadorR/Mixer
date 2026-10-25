/* Reference Studio v4: only enriches the actual DOM; no image/mock audio UI. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 document.body.classList.add('ref-studio');
 const transport=$('transportDock');
 const topbar=document.querySelector('.topbar');
 const editor=document.querySelector('.editor');
 const arrangement=$('arrangement');
 if(!transport||!topbar||!editor||!arrangement)return;

 // Replace the old track-bank caption with a functioning mixer tab bar.
 const nav=editor.querySelector('.pro-mixer-navigation');
 if(nav){
   const tabs=nav.querySelector('.pro-tabs');
   tabs?.querySelector('[data-pro-mix="all"]')?.setAttribute('title','Mostrar consola completa');
   const label=nav.querySelector('.pro-console-label');if(label)label.textContent='CANAL / INSERTS / ENVÍOS / FADER';
 }

 // Show the transport time as a studio timecode; original counter remains intact for its listeners.
 const timePanel=transport.querySelector('.time-readout');
 const timecode=document.createElement('div');timecode.className='ref-timecode';
 timecode.innerHTML='<span class="ref-counter-title">MAIN COUNTER</span><strong id="refMainCounter">00:00:00:00</strong><div class="ref-time-units"><span>HRS</span><span>MIN</span><span>SEC</span><span>FRM</span></div>';
 timePanel?.append(timecode);
 const beatPanel=transport.querySelector('.pro-beat-counter');
 if(beatPanel)beatPanel.querySelector('span').textContent='BAR | BEAT | TICK';
 const range=document.createElement('div');range.className='ref-range';
 range.innerHTML='<div><span>START</span><output>001 | 01 | 000</output></div><div><span>END</span><output id="refEndTime">—</output></div><div><span>LENGTH</span><output id="refLengthTime">—</output></div>';
 beatPanel?.after(range);
 const output=document.createElement('div');output.className='ref-output-meter';
 output.innerHTML='<div class="ref-output-label"><b>MASTER OUTPUT</b><span id="refOutDb">−∞ dB</span></div><div class="ref-output-bars"><i id="refOutL"></i><i id="refOutR"></i></div><div class="ref-output-scale"><span>−48</span><span>−24</span><span>−12</span><span>−6</span><span>0</span></div>';
 transport.append(output);
 const session=transport.querySelector('.session-title');
 if(session){
   session.querySelector('.micro').textContent='CURRENT SESSION';
   session.title='Haz clic en el nombre para renombrar la sesión';
 }
 const buttons={restartBtn:'|◀',rewindBtn:'◀◀',stopBtn:'■',pauseBtn:'Ⅱ',forwardBtn:'▶▶'};
 Object.entries(buttons).forEach(([id,txt])=>{const b=$(id);if(b)b.textContent=txt;});
 const play=$('playBtn');if(play)play.title='Reproducir · Espacio';
 const bpm=$('bpmValue');if(bpm)bpm.title='Tempo de la sesión';

 // Compact, usable sidebar tabs with real session list, real loaded sources and marker references.
 const browser=document.querySelector('.studio-panel.library');
 const list=$('songList');
 if(browser&&list){
   const head=browser.querySelector(':scope > .panel-head');
   if(head){
     head.querySelector('span:not(.section-dot)')?.replaceWith(document.createTextNode('PROJECT BROWSER'));
   }
   const tabs=document.createElement('div');tabs.className='ref-browser-tabs';
   tabs.innerHTML='<button class="is-active" data-ref-tab="browser">Browser</button><button data-ref-tab="sources">Sources</button><button data-ref-tab="markers">Markers</button>';
   head?.after(tabs);
   const panes=document.createElement('div');panes.className='ref-browser-panes';
   const sessionPane=document.createElement('div');sessionPane.className='ref-browser-pane is-active';sessionPane.dataset.refPane='browser';
   const sourcesPane=document.createElement('div');sourcesPane.className='ref-browser-pane';sourcesPane.dataset.refPane='sources';
   const markersPane=document.createElement('div');markersPane.className='ref-browser-pane';markersPane.dataset.refPane='markers';
   const projectLabel=document.createElement('div');projectLabel.className='ref-folder-header';projectLabel.innerHTML='<span>▾</span> <b>PROJECT SESSIONS</b>';
   const listWrapper=document.createElement('div');listWrapper.className='ref-session-list';listWrapper.append(list);
   const proSearch=browser.querySelector('.pro-browser-tools');
   if(proSearch)sessionPane.append(proSearch);
   sessionPane.append(projectLabel,listWrapper);
   panes.append(sessionPane,sourcesPane,markersPane);tabs.after(panes);
   tabs.querySelectorAll('[data-ref-tab]').forEach(b=>b.addEventListener('click',()=>{
     tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('is-active',x===b));
     panes.querySelectorAll('.ref-browser-pane').forEach(p=>p.classList.toggle('is-active',p.dataset.refPane===b.dataset.refTab));
     if(b.dataset.refTab==='sources')updateSources();
     if(b.dataset.refTab==='markers')updateMarkers();
   }));
   function updateSources(){
     sourcesPane.replaceChildren();
     const title=document.createElement('div');title.className='ref-folder-header';title.innerHTML='<span>▾</span> <b>CURRENT PROJECT / AUDIO</b>';sourcesPane.append(title);
     const labels=[...document.querySelectorAll('#arrangementLabels .arrangement-track-label')];
     if(!labels.length){const n=document.createElement('div');n.className='ref-browser-empty';n.textContent='Abre una sesión para ver sus stems.';sourcesPane.append(n);return;}
     labels.forEach((label,i)=>{
       const node=document.createElement('button');node.className='ref-source-item';node.type='button';
       const name=label.querySelector('strong')?.textContent||`Track ${i+1}`;
       const file=label.querySelector('small')?.textContent||'';
       node.innerHTML='<span class="ref-file-icon">♫</span><span></span>';node.lastElementChild.textContent=name;
       node.title=file+' · seleccionar canal';
       node.addEventListener('click',()=>{document.querySelector(`#channels .channel[data-track="${i}"]`)?.scrollIntoView({behavior:'smooth',inline:'nearest',block:'nearest'});});
       sourcesPane.append(node);
     });
   }
   function updateMarkers(){
     markersPane.replaceChildren();
     const title=document.createElement('div');title.className='ref-folder-header';title.innerHTML='<span>▾</span> <b>MARKERS</b>';markersPane.append(title);
     const markers=[...document.querySelectorAll('#prodMarkers button')];
     if(!markers.length){const n=document.createElement('div');n.className='ref-browser-empty';n.textContent='Usa + MARCADOR para guardar un punto de la sesión.';markersPane.append(n);return;}
     markers.forEach(m=>{const b=document.createElement('button');b.className='ref-source-item';b.textContent=m.textContent;b.addEventListener('click',()=>m.click());markersPane.append(b);});
   }
 }

 // Show a signal-informed mini meter in each actual track header, not a static illustration.
 function addTrackDecor(){
   document.querySelectorAll('#arrangementLabels .arrangement-track-label').forEach((label,i)=>{
     if(label.dataset.refReady)return;label.dataset.refReady='1';
     const number=document.createElement('b');number.className='ref-track-index';number.textContent=String(i+1).padStart(2,'0');
     label.prepend(number);
     const mini=document.createElement('span');mini.className='ref-track-mini';mini.innerHTML='<i></i>';
     label.append(mini);
   });
 }
 const labels=$('arrangementLabels');
 if(labels){const obs=new MutationObserver(addTrackDecor);obs.observe(labels,{childList:true});addTrackDecor();}
 // Sync sidebar vertical scrolling with the actual arrangement editor.
 const timeline=$('arrangementScroll');
 if(timeline&&labels){timeline.addEventListener('scroll',()=>{labels.style.transform=`translateY(${-timeline.scrollTop}px)`;},{passive:true});}

 // On a narrow master strip the fully functional graphic EQ opens as a docked drawer.
 const master=document.querySelector('.studio-panel.master');
 if(master){
   const eq=master.querySelector('.master-eq');
   if(eq){
     const toggle=document.createElement('button');toggle.type='button';toggle.id='refMasterEqToggle';toggle.className='ref-master-eq-toggle';toggle.textContent='GRAPHIC EQ · 8 BANDAS';
     toggle.setAttribute('aria-expanded','false');
     eq.before(toggle);
     eq.classList.add('ref-eq-drawer');
     toggle.addEventListener('click',()=>{
       const open=eq.classList.toggle('ref-eq-open');
       toggle.setAttribute('aria-expanded',String(open));
     });
   }
 }
 const group=document.querySelector('.studio-panel.group-buses');
 group?.querySelectorAll('.group-strip').forEach(strip=>{
   strip.dataset.groupName='G'+strip.dataset.bus;
 });

 function repaintMeters(){
   const t=$('currentTime')?.textContent||'00:00.000';
   const arr=t.split(':');
   const seconds=arr.length>=2?Number(arr[0])*60+Number(arr[1]):0;
   if(Number.isFinite(seconds)){
     const h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=Math.floor(seconds)%60,f=Math.floor((seconds%1)*30);
     const pad=n=>String(n).padStart(2,'0');
     const v=`${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
     if($('refMainCounter').textContent!==v)$('refMainCounter').textContent=v;
   }
   const d=$('duration')?.textContent||'';let match=d.match(/\d+:\d+(?::\d+)?/);
   if(match){
     const val=match[0];
     if($('refEndTime').textContent!==val)$('refEndTime').textContent=val;
     if($('refLengthTime').textContent!==val)$('refLengthTime').textContent=val;
   }
   const output=window.PekadorEQ?.getMasterMeters?.();
   if(output){
     for(const [key,id] of [['left','refOutL'],['right','refOutR']]){
       const value=Math.max(0,Number(output[key])||0);
       const db=20*Math.log10(Math.max(.00001,value));
       const pct=Math.max(0,Math.min(100,(db+60)/60*100));
       $(id).style.width=pct+'%';
     }
     const peak=Math.max(output.left||0,output.right||0);
     $('refOutDb').textContent=peak>0?`${(20*Math.log10(peak)).toFixed(1)} dB`:'−∞ dB';
   }
   document.querySelectorAll('#arrangementLabels .ref-track-mini i').forEach((meter,i)=>{
     const rms=window.PekadorEQ?.getTrackMeter?.(i)||0;
     meter.style.width=Math.max(0,Math.min(100,((20*Math.log10(Math.max(0.0001,rms))+58)/58)*100))+'%';
   });
   requestAnimationFrame(repaintMeters);
 }
 requestAnimationFrame(repaintMeters);
})();
