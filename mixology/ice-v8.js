/* La Crystalline | V7 serving ice: fixed-glass 2.5D rigid bodies + bounded buoyancy.
   Ice art is rendered inside the existing glass's invisible mask.
   Same ice kind, seed and startAt reconstruct an equivalent scene for viewers.
   Physics is stylised and bounded, not scientific CFD. */
(()=>{
'use strict';
const h=window.mixologyHooks,art=window.LCArtV5;
if(!h||!art){console.warn('Ice V7: glass engine not available');return}
const s=h.state,$=id=>document.getElementById(id);
const TYPES={
 highball:[['none','無冰','常溫或預先冰鎮'],['spear','長柱冰','推薦 · 細長直立'],['cubes','小方冰','3–4 顆，逐顆碰撞'],['crushed','碎冰','特殊配方']],
 rocks:[['none','無冰','純飲或預先冰鎮'],['sphere','球冰','推薦 · 單顆大球'],['large','大方冰','單顆切割方冰'],['cubes','小方冰','3 顆，堆疊碰撞'],['crushed','碎冰','特殊配方']],
 coupe:[['none','無冰','建議冰鎮杯身']]
};
const DISPLACEMENT={none:0,spear:47,cubes:52,crushed:67,sphere:48,large:52};
const V8_VERSION=2,CX=280,S=400/1086,Y0=35,PI=Math.PI;
const mix=(a,b,t)=>a+(b-a)*t,clamp=(a,l,h)=>Math.max(l,Math.min(h,a));
let sys={key:'',particles:[],dtAccum:0,lastAt:0,recoveredAt:0,rested:false,lastImpulse:0};
const spawnCache=new Map();
// V8 independently rendered WebP sprites. These replace the simplified Canvas ice shapes.
const spritePaths={
 spear:'./ice-v8-preview/assets/ice-spear.webp',
 sphere:'./ice-v8-preview/assets/ice-sphere.webp',
 large:'./ice-v8-preview/assets/ice-cube.webp',
 cubes:'./ice-v8-preview/assets/ice-cube.webp',
 crushed:'./ice-v8-preview/assets/ice-crushed.webp'
};
const sprites={},spriteCrops={};
for(const [kind,path] of Object.entries(spritePaths)){
 const im=new Image();im.decoding='async';sprites[kind]=im;
 im.onload=()=>{
  // Trim transparent margins (asset sizes are not necessarily the dimensions of the ice itself).
  // Work on a small image to avoid expensive per-pixel full-resolution mobile reads.
  try{
   const c=document.createElement('canvas'),edge=192;
   c.width=edge;c.height=edge;
   const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,edge,edge);
   const a=g.getImageData(0,0,edge,edge).data;let l=edge,r=-1,t=edge,b=-1;
   for(let y=0;y<edge;y++)for(let x=0;x<edge;x++){
    if(a[(y*edge+x)*4+3]<30)continue;
    l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
   }
   if(r>=l&&b>=t){const sx=im.naturalWidth/edge,sy=im.naturalHeight/edge;
    spriteCrops[kind]={x:l*sx,y:t*sy,w:Math.min(im.naturalWidth,(r-l+1)*sx),h:Math.min(im.naturalHeight,(b-t+1)*sy)};
   }
  }catch(e){console.warn('Ice V8 crop fallback',kind,e)}
 };
 im.src=path;
}
const V8_SIZES={
 spear:{w:79,h:350,r:39},sphere:{w:207,h:207,r:95},
 large:{w:197,h:197,r:90},
 cubes:{highball:{w:70,h:71,r:33},rocks:{w:101,h:100,r:46}},
 crushed:{highball:{w:35,h:29,r:17},rocks:{w:46,h:33,r:21}}
};
const type=st=>(st.decor?.has('ice')?st.iceKind||'cubes':'none');
const displacement=(k,glass)=>glass==='coupe'?0:(DISPLACEMENT[k]||0);
const gy=y=>Y0+y*S,rad=(g,y)=>{let f=clamp((y-g.top)/(g.bottom-g.top),0,1);
 if(g===art.specs.coupe)return Math.max(g.radBottom,g.radTop*Math.pow(Math.max(0,1-Math.pow(f,1.68)),.58))*S;
 const taper=Math.pow(f,g===art.specs.highball?.8:.68);
 return mix(g.radTop,g.radBottom,taper)*S;
};
function boundary(glass,y){
 const g=art.specs[glass];if(!g)return 30;
 return Math.max(7,rad(g,clamp((y-Y0)/S,g.top,g.bottom))-7);
}
const bottom=glass=>gy(art.specs[glass].bottom)-7;
const top=glass=>gy(art.specs[glass].top)+7;
function extents(p){
 const cos=Math.abs(Math.cos(p.angle)),sin=Math.abs(Math.sin(p.angle));
 if(p.k==='sphere')return {x:p.w*.5,y:p.height*.5};
 // Rotation changes the entire silhouette, not just the proxy-circle centre.
 return {x:(p.w*cos+p.height*sin)*.5+2,y:(p.height*cos+p.w*sin)*.5+2};
}
function keepInside(p,glass){
 const lo=top(glass)+2,hi=bottom(glass);
 // The ice must fit both walls throughout its ENTIRE vertical silhouette.
 const e=extents(p);
 p.y=clamp(p.y,lo+e.y,hi-e.y);
 const radiusAt=y=>boundary(glass,y);
 const width=Math.min(radiusAt(p.y-e.y*.84),radiusAt(p.y),radiusAt(p.y+e.y*.84))-9;
 const xSpace=Math.max(0,width-e.x);
 const nx=clamp(p.x,CX-xSpace,CX+xSpace);
 if(nx!==p.x){p.x=nx;p.vx=-p.vx*.18;p.angular*=.54}
 // Large rigid shapes cannot rotate so far that their corners cut through the wall.
 if(e.x>width+1&&p.k!=='sphere'){
  p.angle*=.67;p.angular*=.40;
  p.x=clamp(p.x,CX-Math.max(0,width-extents(p).x),CX+Math.max(0,width-extents(p).x));
 }
}
function rng(seed){let x=(seed|0)||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)%100000)/100000}}
function make(glass,k,seed){
 const cacheKey=glass+'|'+k+'|'+seed;
 if(spawnCache.has(cacheKey))return spawnCache.get(cacheKey).map(p=>({...p}));
 const random=rng(seed*1664525+1013904223),p=[],low=bottom(glass);
 const create=(i,w,height,rad,delay=0)=>{
  const isSpear=k==='spear',isBall=k==='sphere',angle=(random()-.5)*(isSpear?.13:.34);
  p.push({i,k,x:CX+(random()-.5)*(k==='crushed'?77:54),y:top(glass)-height*.60-i*(k==='crushed'?9:27),
    vx:(random()-.5)*58,vy:5,angular:(random()-.5)*.7,angle,w,height,r:rad,delay,
    targetY:low-height*.55,age:0,active:false,wet:false,phase:random()*6.28});
 };
 if(k==='spear')create(0,V8_SIZES.spear.w,V8_SIZES.spear.h,V8_SIZES.spear.r,0);
 if(k==='sphere')create(0,V8_SIZES.sphere.w,V8_SIZES.sphere.h,V8_SIZES.sphere.r,0);
 if(k==='large')create(0,V8_SIZES.large.w,V8_SIZES.large.h,V8_SIZES.large.r,0);
 if(k==='cubes'){const count=glass==='rocks'?3:4,dim=V8_SIZES.cubes[glass];
 for(let i=0;i<count;i++)create(i,dim.w,dim.h,dim.r,i*130)}
 if(k==='crushed'){for(let i=0;i<15;i++){const d=V8_SIZES.crushed[glass],variation=.75+random()*.45;
 create(i,d.w*variation,d.h*variation,d.r*variation,i*37)}}
 spawnCache.set(cacheKey,p.map(q=>({...q})));
 return p;
}
function reset(st){
 const kind=type(st);
 const key=[st.glass,kind,st.iceSeed||0,st.iceStartedAt||0].join('|');
 if(key===sys.key)return;
 sys={key,particles:make(st.glass,kind,Number(st.iceSeed)||1),dtAccum:0,lastAt:0,recoveredAt:0,rested:false,lastImpulse:0};
 if(kind==='none')return;
 const since=clamp((Date.now()-(Number(st.iceStartedAt)||Date.now()))/1000,0,5);
 // Catch up late spectators before first drawn frame.
 for(let n=0;n<Math.min(260,Math.floor(since*65));n++)step(st,1/65,n/65);
 sys.recoveredAt=since;
}
function liquidSurface(st){
 if(!st||st.visualML<=.1)return bottom(st.glass)+200;
 const g=st.glass,cap=Math.max(50,h.glasses[g].capacity-displacement(type(st),g));
 return art.liquidY(g,Math.min(st.visualML,cap),cap);
}
function step(st,dt,clock){
 const k=type(st);if(k==='none')return;
 const b=bottom(st.glass),t=top(st.glass),surface=liquidSurface(st);
 const liquidActive=surface<b-10,fluidDrag=liquidActive?.92:.991;
 const particles=sys.particles;
 for(const p of particles){
  if(clock<p.delay/1000)continue;
  p.active=true;p.age+=dt;
  const r=p.r,verticalHalf=extents(p).y;
  const left=CX-boundary(st.glass,p.y)+r,right=CX+boundary(st.glass,p.y)-r;
  const immersion=liquidActive?clamp((p.y+r-surface)/Math.max(1,r*2),0,1):0;
  if(immersion>.03&&!p.wet&&p.vy>40){sys.lastImpulse=Math.max(sys.lastImpulse,clamp(p.vy/560,0,.85));p.wet=true}
  if(!liquidActive)p.wet=false;
  const buoyance=immersion*610;
  p.vy+=(535-buoyance)*dt;
  p.vx+=liquidActive&&st.stirMotion?.5*Math.sin(p.phase+p.age*4)*dt:0;
  p.vx*=Math.pow(fluidDrag,dt*60);p.vy*=Math.pow(liquidActive?.96:.996,dt*60);
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  p.angle+=p.angular*dt;
  p.angular*=Math.pow(liquidActive?.955:.989,dt*60);
  const maxAngle=k==='spear'?.11:k==='sphere'?.2:k==='crushed'?.65:.42;
  p.angle=clamp(p.angle,-maxAngle,maxAngle);
  if(p.y+verticalHalf>=b){
   if(p.vy>70)sys.lastImpulse=Math.max(sys.lastImpulse,clamp(p.vy/700,0,.62));
   p.y=b-verticalHalf;p.vy=p.vy>28?-p.vy*(k==='crushed'?.17:.23):0;
   p.vx*=.77;p.angular+=p.vx*.001;
  }
  if(p.y-verticalHalf<t&&p.vy<0){p.y=t+verticalHalf;p.vy=0}
  if(p.x<left){p.x=left;p.vx=Math.abs(p.vx)*.33;p.angular+=.11}
  if(p.x>right){p.x=right;p.vx=-Math.abs(p.vx)*.33;p.angular-=.11}
  // Light restoring torque for standing spear; broad collision proxy for rigid body.
  if(k==='spear'){p.angular+=-p.angle*3.6*dt;p.x=clamp(p.x,CX-9,CX+9)}
  keepInside(p,st.glass);
 }
 if(particles.length>1)for(let iter=0;iter<3;iter++){
  for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
   const a=particles[i],b2=particles[j];if(!a.active||!b2.active)continue;
   const dx=b2.x-a.x,dy=b2.y-a.y,dist=Math.max(.001,Math.hypot(dx,dy));
   const minD=(a.r+b2.r)*.89,overlap=minD-dist;
   if(overlap>0){
    const nx=dx/dist,ny=dy/dist;
    a.x-=nx*overlap*.48;a.y-=ny*overlap*.48;
    b2.x+=nx*overlap*.48;b2.y+=ny*overlap*.48;
    const vn=(b2.vx-a.vx)*nx+(b2.vy-a.vy)*ny;
    if(vn<0){const impulse=-vn*.29;a.vx-=nx*impulse;a.vy-=ny*impulse;b2.vx+=nx*impulse;b2.vy+=ny*impulse;
     a.angular-=impulse*.003;b2.angular+=impulse*.003;sys.lastImpulse=Math.max(sys.lastImpulse,clamp(impulse/500,0,.34))}
   }
  }
  // Restore boundaries after pairwise pushes.
  for(const p of particles)keepInside(p,st.glass)
 }
 sys.lastImpulse*=Math.pow(.965,dt*60);
}
function update(st,t){
 reset(st);if(sys.particles.length===0)return;
 if(sys.lastAt===0){sys.lastAt=t;return}
 let elapsed=clamp((t-sys.lastAt)/1000,0,.045);
 sys.lastAt=t;
 sys.dtAccum+=elapsed;
 const from=(Date.now()-(Number(st.iceStartedAt)||Date.now()))/1000;
 let ticks=0;
 while(sys.dtAccum>=1/60&&ticks<4){step(st,1/60,Math.max(0,from-sys.dtAccum));sys.dtAccum-=1/60;ticks++}
}
function icePath(ctx,w,h,r=.16){
 const l=-w/2,t=-h/2;
 ctx.beginPath();ctx.moveTo(l+r*w,t);
 ctx.lineTo(l+w-r*w,t);ctx.quadraticCurveTo(l+w,t,l+w,t+r*h);
 ctx.lineTo(l+w,t+h-r*h);ctx.quadraticCurveTo(l+w,t+h,l+w-r*w,t+h);
 ctx.lineTo(l+r*w,t+h);ctx.quadraticCurveTo(l,t+h,l,t+h-r*h);
 ctx.lineTo(l,t+r*h);ctx.quadraticCurveTo(l,t,l+r*w,t);ctx.closePath();
}
function drawFacet(ctx,p,t){
 const {w,height:H,k}=p,r=Math.min(w,H)*.12;
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
 if(k==='sphere'){
  const R=p.r*1.07;
  const fill=ctx.createRadialGradient(-R*.33,-R*.38,R*.02,0,0,R*1.05);
  fill.addColorStop(0,'rgba(250,255,255,.95)');fill.addColorStop(.22,'rgba(212,239,251,.77)');fill.addColorStop(.64,'rgba(137,177,208,.45)');fill.addColorStop(1,'rgba(222,240,248,.82)');
  ctx.fillStyle=fill;ctx.beginPath();ctx.arc(0,0,R,0,PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,251,236,.81)';ctx.lineWidth=1.6;ctx.stroke();
  ctx.strokeStyle='rgba(241,252,255,.46)';ctx.lineWidth=1;
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-R*.09+i*3,-R*.02,R*(.62+i*.07),.5,2.35);ctx.stroke()}
  const light=ctx.createRadialGradient(-R*.5,-R*.54,1,-R*.3,-R*.3,R*.5);
  light.addColorStop(0,'rgba(255,248,219,.62)');light.addColorStop(1,'rgba(255,248,219,0)');
  ctx.fillStyle=light;ctx.beginPath();ctx.arc(0,0,R,0,PI*2);ctx.fill();
 }else{
  const f=ctx.createLinearGradient(-w/2,0,w/2,0);
  f.addColorStop(0,'rgba(174,201,220,.76)');f.addColorStop(.22,'rgba(237,250,255,.59)');
  f.addColorStop(.46,'rgba(190,226,240,.27)');f.addColorStop(.72,'rgba(244,250,255,.67)');
  f.addColorStop(1,'rgba(144,196,221,.69)');
  icePath(ctx,w,H,r/Math.min(w,H));ctx.fillStyle=f;ctx.fill();
  ctx.strokeStyle='rgba(252,255,254,.86)';ctx.lineWidth=1.25;ctx.stroke();
  const x=-w/2,y=-H/2;
  ctx.fillStyle='rgba(247,253,255,.26)';
  ctx.beginPath();ctx.moveTo(x+4,y+3);ctx.lineTo(x+w*.78,y+3);ctx.lineTo(x+w*.66,y+Math.min(10,H*.16));
  ctx.lineTo(x+9,y+Math.min(11,H*.14));ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(54,118,161,.18)';
  ctx.beginPath();ctx.moveTo(x+w*.76,y+Math.min(8,H*.14));ctx.lineTo(x+w-3,y+4);
  ctx.lineTo(x+w-3,y+H-4);ctx.lineTo(x+w*.77,y+H-Math.min(9,H*.13));ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(232,251,255,.23)';ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(-w*.27,-H*.24);ctx.lineTo(w*.18,H*.12);ctx.lineTo(w*.08,H*.30);ctx.stroke();
  if(k==='crushed'){
   ctx.fillStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.moveTo(x+3,y+3);ctx.lineTo(x+w*.48,y+2);
   ctx.lineTo(x+w*.7,y+H*.48);ctx.lineTo(x+w*.3,y+H*.62);ctx.closePath();ctx.fill();
  }
  const glare=ctx.createLinearGradient(-w*.45,-H*.3,w*.4,H*.4);
  glare.addColorStop(0,'rgba(255,246,221,.0)');glare.addColorStop(.34,'rgba(255,251,231,.24)');glare.addColorStop(.53,'rgba(255,251,231,0)');glare.addColorStop(1,'rgba(247,254,255,.10)');
  icePath(ctx,w,H,.14);ctx.fillStyle=glare;ctx.fill();
 }
 ctx.restore();
}

function drawSprite(ctx,p,t){
 const im=sprites[p.k];
 if(!im?.complete||!im.naturalWidth){drawFacet(ctx,p,t);return}
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
 if(p.k==='crushed'){
  // Select different source regions from the crushed-ice mound; each is an independent
  // collision fragment, not the same mound drawn 15 times.
  const sx=Math.floor(im.width*(.09+((p.i*7)%11)*.057));
  const sy=Math.floor(im.height*(.23+(p.i%4)*.125));
  const sw=Math.min(im.width-sx,Math.ceil(im.width*.19));
  const sh=Math.min(im.height-sy,Math.ceil(im.height*.27));
  ctx.drawImage(im,sx,sy,sw,sh,-p.w*.5,-p.height*.5,p.w,p.height);
 }else{
  const trim=spriteCrops[p.k];
  if(trim)ctx.drawImage(im,trim.x,trim.y,trim.w,trim.h,-p.w*.5,-p.height*.5,p.w,p.height);
  else ctx.drawImage(im,-p.w*.5,-p.height*.5,p.w,p.height);
 }
 ctx.restore();
}
function render(ctx,st,t){
 if(type(st)==='none'||st.glass==='coupe')return;
 update(st,t);
 const g=st.glass,config=art.specs[g],c=Math.max(40,h.glasses[g].capacity-displacement(type(st),g));
 const water=st.visualML>0?art.liquidY(g,st.visualML,c):bottom(g)+100;
 // Use exactly the SAME calibrated glass interior as the liquid renderer.
 // One shared clip eliminates the old mismatch between the ice & drink outlines.
 ctx.save();
 if(typeof art.clipInner==='function')art.clipInner(ctx,g,10);
 else{
  ctx.beginPath();
  for(let j=0;j<=60;j++){
   const sy=config.top+(config.bottom-config.top)*j/60,yy=gy(sy),width=rad(config,sy)-12;
   if(j===0)ctx.moveTo(CX-width,yy);else ctx.lineTo(CX-width,yy);
  }
  for(let j=60;j>=0;j--){
   const sy=config.top+(config.bottom-config.top)*j/60,yy=gy(sy),width=rad(config,sy)-12;
   ctx.lineTo(CX+width,yy);
  }ctx.closePath();ctx.clip();
 }
 for(const p of sys.particles){
  if(!p.active)continue;
  const submerged=st.visualML>0?clamp((p.y+p.r-water)/(p.r*2),0,1):0;
  ctx.save();ctx.globalAlpha=1-submerged*.17;
  drawSprite(ctx,p,t);ctx.restore();
  if(submerged>.2){
   ctx.save();ctx.globalAlpha=submerged*.22;
   const gleam=ctx.createLinearGradient(p.x,p.y-p.r,p.x,p.y+p.r);
   gleam.addColorStop(0,'rgba(234,246,251,.33)');gleam.addColorStop(1,'rgba(70,137,170,.05)');
   ctx.fillStyle=gleam;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r*.77,0,0,2*PI);ctx.fill();ctx.restore();
  }
 }
 ctx.restore();
}
function impact(st){
 if(type(st)==='none')return 0;
 return clamp(sys.lastImpulse*.8,0,.75);
}
function pick(kind){
 if(s.busy||s.demo)return;
 if(!TYPES[s.glass].some(a=>a[0]===kind))return;
 if(s.flow!=='build'&&!['ready','served'].includes(s.flowStep)){h.notify('調製用冰請在調酒杯／雪克杯中加入；成品冰須在濾出前準備。');return}
 const old=displacement(type(s),s.glass),newD=displacement(kind,s.glass);
 const volume=h.total();
 if(volume+newD>h.glasses[s.glass].capacity){h.notify('目前酒量與冰塊體積超過杯子容量，請減少原料或改用較小冰型。');return}
 s.iceKind=kind;s.iceStartedAt=Date.now();s.iceSeed=(Number(s.iceSeed)||0)+1;
 if(kind==='none')s.decor.delete('ice');else s.decor.add('ice');
 s.stirMotion=Math.max(s.stirMotion||0,.5);h.updateUI();h.syncRoom('decor');updateUI();
}
function clear(){
 s.iceKind='none';s.iceStartedAt=0;s.iceSeed=(Number(s.iceSeed)||0)+1;s.decor.delete('ice');sys.key='';
}
function onGlassChange(){if(!TYPES[s.glass].some(a=>a[0]===type(s)))clear();updateUI()}
function updateUI(){
 const list=$('v7IceOptions');if(!list)return;
 const config=TYPES[s.glass];
 for(const b of list.querySelectorAll('[data-ice-kind]')){
  const k=b.dataset.iceKind,option=config.find(a=>a[0]===k);
  b.hidden=!option;
  if(option){b.classList.toggle('active',type(s)===k);b.setAttribute('aria-pressed',String(type(s)===k))}
  b.disabled=!!s.busy||!!s.demo||(s.flow!=='build'&&!['ready','served'].includes(s.flowStep));
 }
 const hint=$('v7IceHint');
 if(hint)hint.textContent=s.glass==='coupe'?'淺碟杯建議預先冰鎮，成品不放冰塊。':s.flow!=='build'&&s.flowStep==='preparing'?'這裡選的是成品冰。請先在調製器具加冰完成攪拌／搖盪。':s.flow!=='build'&&s.flowStep==='transferring'?'正在濾入成品杯，不可更換冰型。':'冰塊有體積與碰撞效果。碎冰只建議用於特定調酒。';
}
function mount(){
 const glass=document.querySelector('.glass-options');if(!glass)return;
 const el=document.createElement('section');el.id='v7IcePanel';el.className='v7-ice-panel';
 el.innerHTML='<div class="hairline"></div><div class="sectheading"><h2>02 · 選擇成品冰型</h2><span>ICE FORM</span></div><p class="v7-help" id="v7IceHint"></p><div id="v7IceOptions" class="v7-ice-list"></div>';
 glass.after(el);
 const kinds=[['none','無冰'],['spear','長柱冰'],['sphere','球冰'],['large','大方冰'],['cubes','小方冰'],['crushed','碎冰 · 特調']];
 for(const [kind,label] of kinds){
  const button=document.createElement('button');button.type='button';button.dataset.iceKind=kind;button.className='v7-ice-choice';
  button.innerHTML='<span class="v7-icon v7-'+kind+'"></span><span>'+label+'</span>';
  button.addEventListener('click',()=>pick(kind));$('v7IceOptions').appendChild(button);
 }
 const css=document.createElement('style');css.textContent=
 '.v7-ice-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0 3px}.v7-ice-choice{display:flex;min-height:77px;gap:6px;align-items:center;justify-content:center;flex-direction:column;background:rgba(15,31,50,.64);border:1px solid rgba(199,223,234,.24);border-radius:9px;color:#d5dfe1;font-size:11px}.v7-ice-choice.active{border-color:#e1bb83;background:rgba(170,134,85,.17);color:#f5e4c6}.v7-ice-choice[hidden]{display:none}.v7-ice-choice:disabled{opacity:.4;cursor:not-allowed}.v7-help{color:#aebeca;font-size:11px;line-height:1.6;margin:7px 0}.v7-icon{width:36px;height:30px;display:block;position:relative;filter:drop-shadow(0 1px 3px rgba(155,220,244,.27))}.v7-icon:before,.v7-icon:after{content:"";position:absolute;border:1px solid #c8e8f4;background:linear-gradient(127deg,rgba(255,255,255,.85),rgba(163,211,237,.35) 50%,rgba(251,255,254,.75));box-shadow:inset -3px -3px 6px rgba(87,158,198,.18)}.v7-spear:before{width:12px;height:27px;left:12px;top:1px;transform:rotate(8deg);border-radius:3px}.v7-sphere:before{width:26px;height:26px;left:4px;top:2px;border-radius:50%}.v7-large:before{width:25px;height:25px;left:6px;top:2px;transform:rotate(-10deg);border-radius:4px}.v7-cubes:before{width:17px;height:16px;left:2px;top:6px;transform:rotate(-13deg);border-radius:3px}.v7-cubes:after{width:17px;height:16px;left:17px;top:10px;transform:rotate(14deg);border-radius:3px}.v7-crushed:before{width:14px;height:12px;left:5px;top:13px;transform:rotate(32deg);border-radius:3px}.v7-crushed:after{width:15px;height:15px;left:18px;top:11px;transform:rotate(-22deg);border-radius:4px}.v7-none:before,.v7-none:after{display:none}.v7-none{display:flex;align-items:center;justify-content:center}.v7-none:after{display:block;position:static;content:"—";background:none;border:none;color:#e2c28f;box-shadow:none;font:24px Georgia,serif}';
 document.head.appendChild(css);
 updateUI();
}
const api={types:TYPES,displacement,pick,clear,onGlassChange,updateUI,draw:render,impact,
 get physics(){return sys},version:V8_VERSION,artMode:'photographic-webp',spritePaths,V8_SIZES};
window.LCIceV8=api;
window.LCIceV7=api; // preserve V6 and existing liquid-mask interface
mount();
})();