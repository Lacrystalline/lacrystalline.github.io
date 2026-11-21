/* La Crystalline V6: practical Build / Stir / Shake workflows */
(()=>{
'use strict';
const h=window.mixologyHooks;if(!h){console.error('V6 hooks unavailable');return}
const s=h.state,$=id=>document.getElementById(id),isBubbly=id=>id==='soda'||id==='tonic';
const prep=()=>s.flow==='stir'||s.flow==='shake', cap=()=>h.glasses[s.glass].capacity;
const viewer=()=>!!(window.mixologyBridge&&window.mixologyBridge.isViewer());
const scene=()=>s.flow==='stir'&&window.LCStirScene?window.LCStirScene:null;   // V9 STIR visuals
const sceneBusy=()=>!!(scene()&&scene().busy());
const iceVol=()=>window.LCIceV7?window.LCIceV7.displacement(s.iceKind,s.glass):(s.glass==='rocks'?50:60);
const modes={
 build:{name:'直調 Build',help:'在成品杯調製；通常先放冰、再量酒倒入。',tool:'成品杯',ice:'先放入成品杯冰塊'},
 stir:{name:'攪拌 Stir',help:'原料先進調酒杯，加冰攪拌，最後過濾入成品杯。',tool:'調酒杯',ice:'調酒杯加入調製用冰'},
 shake:{name:'搖盪 Shake',help:'原料先進雪克杯，加冰搖盪，最後濾入成品杯；氣泡水要最後加。',tool:'雪克杯',ice:'雪克杯加入調製用冰'}
};
function mount(){
 const sheet=document.createElement('style');sheet.textContent=
 '.v6-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}.v6-btn{min-width:0;background:#16293c;color:#e4d5bf;border:1px solid #496075;border-radius:9px;padding:10px 3px;font-size:12px}.v6-btn.active{border-color:#efca8e;background:#4b4037}.v6-note{color:#aebeca;font-size:11px;line-height:1.7;margin:9px 0}.v6-ice{display:block;width:100%;text-align:left;margin:9px 0;border:1px solid #6b6763;border-radius:10px;background:#182e40;color:#f1d6a9;padding:10px 12px;font-size:12px}.v6-ice.active{border-color:#e5c38e;background:#4c4235}.v6-ice small{display:block;color:#afc2cc;margin-top:4px} .v6-ice:disabled{opacity:.4}.v6-ice[hidden]{display:none!important}.v6-ice[hidden],.actions .act[hidden]{display:none!important}.v6-strain{width:100%;border:1px solid #e5c38e;border-radius:9px;padding:12px;background:#524434;color:#ffe5ba;margin:10px 0}.v6-strain[hidden]{display:none}.v6-work{margin:10px auto 0;width:95%;padding:10px;border:1px solid #766548;border-radius:9px;background:#091e32e8;text-align:center;color:#e8cf9f;font-size:12px}.v6-work[hidden]{display:none}.v6-track{background:#2b4655;height:4px;margin-top:9px;border-radius:5px}.v6-track span{display:block;width:0;height:100%;background:#d7b37b;transition:width .08s linear}';
 document.head.appendChild(sheet);
 const left=document.querySelector('.side.left'),glass=left&&left.querySelector('.glass-options');
 if(!left||!glass)return;
 const method=document.createElement('section');method.innerHTML=
 '<div class="sectheading"><h2>00 · 調製方式</h2><span>METHOD</span></div><div class="v6-methods"><button class="v6-btn active" data-flow="build">直調<br>BUILD</button><button class="v6-btn" data-flow="stir">攪拌<br>STIR</button><button class="v6-btn" data-flow="shake">搖盪<br>SHAKE</button></div><p class="v6-note" id="v6Help"></p><div class="hairline"></div>';
 left.insertBefore(method,left.firstChild);
 const ice=document.createElement('section');ice.innerHTML=
 '<div class="hairline"></div><div class="sectheading"><h2>02 · 冰塊與調製順序</h2><span>ICE & METHOD</span></div><button id="v6Ice" class="v6-ice"><span id="v6IceName">加入冰塊</span><small id="v6IceHint"></small></button><button id="v6Layer" class="v6-ice">吧匙慢倒 · 保留分層<small>直調限定，酒流靠近杯壁，減少混色</small></button><p class="v6-note" id="v6IceState"></p>';
 glass.after(ice);
 const title=[...left.querySelectorAll('h2')].find(e=>e.textContent.includes('選擇酒材'));if(title)title.textContent='03 · 選擇酒材';
 const right=document.querySelector('.side.right');const rt=[...right.querySelectorAll('h2')];
 const recipe=rt.find(e=>e.textContent.includes('你的配方'));if(recipe)recipe.textContent='04 · 你的配方';
 const craft=rt.find(e=>e.textContent.includes('調製手法'));if(craft)craft.textContent='05 · 調製與濾出';
 const actions=right.querySelector('.actions');if(actions)actions.insertAdjacentHTML('afterend','<button id="v6Strain" class="v6-strain" hidden>準備濾出 · STRAIN</button><p class="v6-note" id="v6Instructions">完成調製後再加裝飾。</p>');
 const old=right.querySelector('[data-deco="ice"]');if(old)old.remove();
 const ornament=document.querySelector('.stage-ornament');
 if(ornament)ornament.insertAdjacentHTML('afterend','<div id="v6Work" class="v6-work" hidden><strong id="v6WorkTitle">調酒器具</strong><div id="v6WorkDesc"></div><div class="v6-track"><span id="v6WorkProgress"></span></div></div>');
 document.querySelectorAll('[data-flow]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.flow)));
 $('v6Ice').addEventListener('click',toggleIce);
 $('v6Layer').addEventListener('click',()=>{if(s.flow!=='build'||s.busy)return;s.layerIntent=!s.layerIntent;h.updateUI();h.syncRoom('snapshot')});
 $('v6Strain').addEventListener('click',strain);
 h.updateUI();
}
function setMode(mode){
 if(!modes[mode]||s.busy||s.demo||viewer()||sceneBusy())return;
 if(h.total()){h.notify('請先清空酒杯，再切換調製模式。');return}
 s.flow=mode;s.flowStep=mode==='build'?'served':'preparing';s.prepIce=false;s.dilutionMl=0;s.prepPour=null;s.layerIntent=false;s.visualML=0;s.decor.delete('ice');s.iceKind='none';s.iceStartedAt=0;s.iceSeed=(s.iceSeed||0)+1;s.stirAnim=null;s.stirManual=null;
 h.updateUI();h.syncRoom('snapshot');
}
function toggleIce(){
 if(s.busy||s.demo||viewer()||sceneBusy())return;
 const serving=s.flow==='build'||s.flowStep==='ready'||s.flowStep==='served';
 if(serving){
  if(s.glass==='coupe'){h.notify('淺碟杯建議預先冰鎮，而不是放入成品冰塊。');return}
  if(!s.decor.has('ice')&&h.total()+iceVol()>cap()){h.notify('成品杯剩餘容量不足以加入冰塊。');return}
  if(window.LCIceV7){window.LCIceV7.pick(s.decor.has('ice')?'none':s.glass==='rocks'?'sphere':'spear');return}if(s.decor.has('ice'))s.decor.delete('ice');else s.decor.add('ice');
 }else if(s.flowStep==='preparing'){s.prepIce=!s.prepIce}
 h.updateUI();h.syncRoom('decor');
}
function shouldHandleAdd(id){
 return prep()&&(s.flowStep==='preparing'||s.flowStep==='ready'||s.flowStep==='transferring'||s.flowStep==='served'&&!isBubbly(id));
}
async function addPrep(id,ml,fromDemo){
 if(s.busy||(!fromDemo&&s.demo)||viewer()||s.drag)return false;
 if(s.flowStep!=='preparing'){h.notify('請先完成這杯的調製與濾出；濾出後只可追加氣泡水。');return false}
 if(isBubbly(id)){h.notify('蘇打水或通寧水請在濾出後再加，不可放入調酒杯或雪克杯。');return false}
 if(h.total()+ml>cap()*.83){h.notify('請預留融冰稀釋與濾出空間。');return false}
 const rev=s.revision,from=h.total(),duration=s.flow==='stir'&&window.LCStirScene?1500:750;   // stir: jigger in, pour, out
 s.portions.push({id,ml});s.prepPour={from,to:h.total(),start:performance.now(),duration,color:h.rgb(h.byId[id].color)};
 s.busy=true;h.updateUI();h.syncRoom('pour_begin');
 await h.sleep(duration+40);
 if(rev!==s.revision)return false;
 s.prepPour=null;s.busy=false;h.updateUI();h.syncRoom('pour_end');return true;
}
function allowProcess(kind){
 if(s.flow==='build')return kind!=='shaken';
 if(s.flowStep!=='preparing'){h.notify('目前步驟不能再次攪拌或搖盪。');return false}
 if(s.flow==='stir'&&kind!=='stirred'||s.flow==='shake'&&kind!=='shaken'){h.notify('請使用此模式對應的調製手法。');return false}
 if(!s.prepIce){h.notify('請先加入調製用冰，再攪拌或搖盪。');return false}
 if(sceneBusy())return false;
 return true;
}
function dilute(fraction){
 const ml=Math.max(0,Math.min(cap()-(s.decor.has('ice')?iceVol():0)-h.total(),Math.round(h.total()*fraction)));
 if(!ml)return;
 s.portions.push({id:'melt',ml});s.dilutionMl=(s.dilutionMl||0)+ml;
}
function onProcessDone(){
 if(s.flow==='build'){if(s.decor.has('ice'))dilute(.035);s.visualML=h.total();s.flowStep='served'}
 else{dilute(s.flow==='shake'?.18:.12);s.flowStep='ready';s.visualML=0}
}
async function strain(){
 if(viewer()||!prep()||s.flowStep!=='ready'||s.busy||sceneBusy())return;
 if(h.total()+(s.decor.has('ice')?iceVol():0)>cap()){h.notify('目前成品杯容量不足，請移除成品冰塊。');return}
 const rev=s.revision,vol=h.total();
 if(scene()){
  // V9 STIR: the mixing glass comes in, tilts, pours through the strainer and leaves.
  // The serving fill keeps the original volume maths; it simply starts when the glass is in place.
  const T=scene().strainTiming();
  s.flowStep='transferring';s.visualML=0;s.busy=true;scene().startStrain();
  s.pour={kind:'strain',from:0,to:vol,start:performance.now()+T.pourStart,duration:T.pour,color:h.liquidAverage()};
  h.updateUI();h.syncRoom('pour_begin');
  await h.sleep(T.pourStart+T.pour+40);if(rev!==s.revision)return;
  s.pour=null;s.visualML=vol;h.updateUI();h.syncRoom('pour_end');
  await h.sleep(Math.max(0,T.end-T.pourStart-T.pour-40));if(rev!==s.revision)return;
  s.flowStep='served';s.busy=false;h.updateUI();h.syncRoom('snapshot');h.notify('已濾出至成品杯。');
  return;
 }
 const duration=1450;
 s.flowStep='transferring';s.visualML=0;s.busy=true;
 s.pour={kind:'strain',from:0,to:vol,start:performance.now(),duration,color:h.liquidAverage()};
 h.updateUI();h.syncRoom('pour_begin');
 await h.sleep(duration+50);if(rev!==s.revision)return;
 s.pour=null;s.visualML=vol;s.flowStep='served';s.busy=false;
 h.updateUI();h.syncRoom('pour_end');h.notify('已濾出至成品杯。');
}
function tick(t){
 if(!$('v6WorkProgress'))return;
 if(s.prepPour){const p=Math.max(0,Math.min(1,(t-s.prepPour.start)/s.prepPour.duration));$('v6WorkProgress').style.width=(15+p*85)+'%'}
 else if(s.processing&&prep()){
  const p=Math.max(0,Math.min(1,(t-s.processing.start)/s.processing.duration));
  $('v6WorkProgress').style.width=(p*100)+'%';
  const w=$('v6Work');if(w)w.style.transform=s.flow==='shake'?'translateX('+Math.sin(t*.032)*Math.sin(p*Math.PI)*3+'px)':'none';
 }else{const w=$('v6Work');if(w)w.style.transform='none'}
}
function updateUI(){
 if(!$('v6Help'))return;
 document.querySelectorAll('[data-flow]').forEach(b=>{const yes=b.dataset.flow===s.flow;b.classList.toggle('active',yes);b.disabled=s.busy||s.demo;b.setAttribute('aria-pressed',String(yes))});
 $('v6Help').textContent=modes[s.flow].help;
 const inPrep=prep()&&s.flowStep==='preparing';
 const serving=s.flow==='build'||['ready','served'].includes(s.flowStep);
 const hasIce=serving?s.decor.has('ice'):s.prepIce;
 $('v6Ice').classList.toggle('active',hasIce);$('v6Ice').hidden=serving&&!!window.LCIceV7;
 $('v6Ice').disabled=s.busy||s.demo||sceneBusy()||serving&&s.glass==='coupe'||!serving&&!inPrep;
 $('v6IceName').textContent=serving?(hasIce?'移除成品杯冰塊':'加入成品杯新冰'):(hasIce?'移除調製用冰':modes[s.flow].ice);
 $('v6IceHint').textContent=serving?'成品冰與攪拌／搖盪用冰分開處理。':'用於冷卻與稀釋，濾出時不帶入成品杯。';
 $('v6IceState').textContent=serving?'成品冰型由上方杯型選單決定 · 估計融冰 '+(s.dilutionMl||0)+' ml':('調製器具'+(hasIce?'已有冰':'尚未加冰')+' · 估計融冰 '+(s.dilutionMl||0)+' ml');
 $('v6Layer').hidden=s.flow!=='build';$('v6Layer').classList.toggle('active',s.layerIntent);$('v6Layer').disabled=s.busy||s.demo;
 $('stirBtn').hidden=s.flow==='shake';$('shakeBtn').hidden=s.flow!=='shake';
 $('stirBtn').disabled=s.busy||s.demo||!h.total()||sceneBusy()||prep()&&(!inPrep||!s.prepIce);
 $('shakeBtn').disabled=s.busy||s.demo||!h.total()||!inPrep||!s.prepIce;
 $('v6Strain').hidden=!prep();$('v6Strain').disabled=s.busy||s.flowStep!=='ready'||sceneBusy();
 $('v6Instructions').textContent=prep()?(s.flowStep==='preparing'?'請加冰並完成調製。':s.flowStep==='ready'?'已冷卻與稀釋，可準備成品冰再濾出。':s.flowStep==='transferring'?'正在濾入成品杯。':'已濾出，可加入裝飾與氣泡水。'):'直調在成品杯進行，慢倒可保留分層。';
 $('finishBtn').disabled=s.busy||s.demo||!h.total()||prep()&&s.flowStep!=='served';
 document.querySelectorAll('#decorations .tag').forEach(b=>b.disabled=s.busy||s.demo||prep()&&s.flowStep!=='served');
 document.querySelectorAll('.ing').forEach(b=>{const id=b.dataset.ingredient;b.disabled=s.busy||s.demo||prep()&&!(inPrep&&!isBubbly(id)||s.flowStep==='served'&&isBubbly(id))});
 // STIR shows the real mixing glass on the stage, so the temporary status panel is only for SHAKE
 const work=$('v6Work');work.hidden=!prep()||s.flowStep==='served'||s.flow==='stir';
 if(!work.hidden){
  $('v6WorkTitle').textContent=modes[s.flow].tool+' · '+s.flowStep.toUpperCase();
  $('v6WorkDesc').textContent=(s.flowStep==='ready'?'已攪拌／搖盪，等待濾出。':s.flowStep==='transferring'?'正在倒入成品杯。':'原料尚在調製器具中，成品杯保持空杯。')+' '+h.total()+' ml · 調製用冰 '+(s.prepIce?'已加入':'未加入');
  if(!s.prepPour)$('v6WorkProgress').style.width=(s.flowStep==='ready'||s.flowStep==='transferring'?100:Math.min(95,h.total()/200*100))+'%';
 }
 if(prep()&&s.flowStep!=='served'){
  $('phaseLabel').textContent=s.flowStep==='ready'?'READY TO STRAIN':s.flowStep==='transferring'?'STRAINING':'PREPARING '+s.flow.toUpperCase();
  $('stageHint').textContent=s.flow==='stir'?(s.flowStep==='preparing'?(s.prepIce?(h.total()?'按「攪拌」，或在調酒杯上畫圈攪拌。':'倒入原料，開始調製。'):'原料在調酒杯中；加入調製用冰後即可攪拌。'):s.flowStep==='ready'?(sceneBusy()?'吧匙收回，調酒杯被拿起。':'成品杯準備好了；可選擇成品冰，再按「準備濾出」。'):'經濾冰器倒入成品杯，調製冰留在調酒杯內。'):'成品杯尚未裝入酒液；原料正在調製器具中。';
  if(s.flow==='stir'&&s.flowStep==='preparing'&&s.processing)$('phaseLabel').textContent='STIRRING';
 }
}
window.flowV6={mount,updateUI,selectMode:setMode,toggleIce,shouldHandleAdd,addPrep,allowProcess,onProcessDone,strain,tick,
 renderState:()=>prep()&&s.flowStep!=='transferring'&&s.flowStep!=='served'?{...s,visualML:0,pour:null,decor:s.flowStep==='ready'?s.decor:new Set()}:s,
 effectiveCapacity:()=>cap()-(s.decor.has('ice')?iceVol():0),
 canFinish:()=>!prep()||s.flowStep==='served',
 methodName:()=>modes[s.flow].name,
 onGlassChange:()=>{if(s.glass==='coupe'){s.decor.delete('ice');s.iceKind='none';s.iceStartedAt=0}}
};
mount();
})();