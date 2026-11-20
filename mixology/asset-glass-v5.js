/* La Crystalline Mixology V5 — photographic glass assets with invisible liquid masks.
   Source-quality lossless WebP glasses are drawn ABOVE a dynamic Canvas liquid layer.
   Only the liquid, surface, ripples and pour are simulated. No visible Canvas outline.
   No changes to room state or Realtime. */
(()=>{
'use strict';
const TAU=Math.PI*2,CX=280,SCALE=400/1086,IMG={x:80,y:35,w:400,h:1448*(400/1086)};
const specs={
 highball:{src:'./assets/highball_glass_lossless.webp',top:151,bottom:1158,radTop:235,radBottom:204,ellipse:.116},
 rocks:{src:'./assets/rocks_glass_lossless.webp',top:298,bottom:1094,radTop:405,radBottom:360,ellipse:.135},
 coupe:{src:'./assets/coupe_glass_lossless.webp',top:213,bottom:563,radTop:415,radBottom:24,ellipse:.20}
};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const color=(c,a=1)=>`rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const blend=(a,b,t)=>a.map((v,i)=>Math.round(lerp(v,b[i],t)));
const bright=(a,q)=>blend(a,q>=0?[254,246,228]:[4,12,30],Math.abs(q));
const gy=y=>IMG.y+y*SCALE, gx=x=>IMG.x+x*SCALE;
const loaded={};
Object.keys(specs).forEach(id=>{
 const im=new Image();im.decoding='async';im.onload=()=>{loaded[id]='ready'};
 im.onerror=()=>{loaded[id]='error';console.warn('Cannot load cocktail glass asset',id)};
 im.src=specs[id].src;specs[id].img=im;
});
// V8 glass layers: back glass -> liquid -> ice -> transparent wall optics -> glass base.
// These are the actual separated WebPs prepared and verified in the V8 approval preview.
for(const id of ['highball','rocks']){
 for(const [prop,suffix] of [['edges','edges'],['baseFront','base_front']]){
  const img=new Image();img.decoding='async';
  img.onerror=()=>console.warn('V8 glass overlay unavailable',id,suffix);
  img.src='./ice-v8-preview/assets/'+id+'_glass_'+suffix+'.webp';
  specs[id][prop]=img;
 }
}

function half(id,y){const g=specs[id];if(!g)return 0;const f=clamp((y-g.top)/(g.bottom-g.top),0,1);
 if(id==='coupe'){
   // A rounded coupe bowl; cross-section tapers sharply near the stem.
   return Math.max(g.radBottom,g.radTop*Math.pow(Math.max(0,1-Math.pow(f,1.68)),.58));
 }
 const taper=id==='highball'?Math.pow(f,.8):Math.pow(f,.68);
 return lerp(g.radTop,g.radBottom,taper);
}
// Deterministic cross-sectional integration. This is a simplified volume model,
// not a visual linear interpolation, so shallow bowls fill quickly near the base.
const lookup={};
for(const id of Object.keys(specs)){
 const g=specs[id],table=[[g.bottom,0]];let volume=0;const step=2;
 for(let y=g.bottom;y>g.top;){const ny=Math.max(g.top,y-step);const r=half(id,(ny+y)/2);
 volume+=Math.PI*r*r*(y-ny);table.push([ny,volume]);y=ny;}
 lookup[id]={table,total:volume};
}
function levelSrc(id,ml,cap){const g=specs[id],l=lookup[id];if(!g||!l)return 0;
 const target=clamp(ml/cap,0,1)*l.total;
 if(!target)return g.bottom;
 if(target>=l.total)return g.top;
 let lo=0,hi=l.table.length-1;
 while(lo+1<hi){const m=(lo+hi)>>1;if(l.table[m][1]<target)lo=m;else hi=m}
 const [y0,v0]=l.table[lo],[y1,v1]=l.table[hi];return lerp(y0,y1,(target-v0)/(v1-v0));
}
function liquidY(id,ml,cap){return gy(levelSrc(id,ml,cap))}
function radScreen(id,y){const src=(y-IMG.y)/SCALE;return half(id,src)*SCALE}
function mask(ctx,id,inset=0){const g=specs[id],steps=5;ctx.beginPath();
 let y=g.top;ctx.moveTo(gx(543-half(id,y))+inset,gy(y));
 for(y=g.top+steps;y<g.bottom;y+=steps)ctx.lineTo(gx(543-half(id,y))+inset,gy(y));
 ctx.lineTo(gx(543-half(id,g.bottom))+inset,gy(g.bottom));
 ctx.quadraticCurveTo(CX,gy(g.bottom)+3,gx(543+half(id,g.bottom))-inset,gy(g.bottom));
 for(y=g.bottom-steps;y>g.top;y-=steps)ctx.lineTo(gx(543+half(id,y))-inset,gy(y));
 ctx.lineTo(gx(543+half(id,g.top))-inset,gy(g.top));ctx.closePath();
}
function hitTest(id,x,y,ml,cap){const g=specs[id];if(!g)return false;
 const sy=(y-IMG.y)/SCALE;if(sy<g.top||sy>g.bottom)return false;
 const r=half(id,sy)*SCALE-4;
 return y>=liquidY(id,ml,cap)-15&&Math.abs(x-CX)<r;
}
function ellipse(ctx,x,y,w,h){ctx.beginPath();ctx.ellipse(x,y,Math.max(1,w),Math.max(1,h),0,0,TAU)}
function ground(ctx,id){
 let halo=ctx.createRadialGradient(CX,305,8,CX,305,265);
 halo.addColorStop(0,'rgba(181,164,127,.09)');halo.addColorStop(.6,'rgba(58,111,140,.045)');halo.addColorStop(1,'rgba(11,19,37,0)');
 ctx.fillStyle=halo;ctx.fillRect(12,20,536,560);
 const baseY=id==='rocks'?521:567;
 const shadow=ctx.createRadialGradient(CX,baseY,8,CX,baseY,145);
 shadow.addColorStop(0,'rgba(2,6,12,.72)');shadow.addColorStop(.6,'rgba(0,7,19,.29)');shadow.addColorStop(1,'rgba(0,5,13,0)');
 ctx.fillStyle=shadow;ellipse(ctx,CX,baseY,170,id==='rocks'?26:20);ctx.fill();
 const line=ctx.createLinearGradient(120,baseY,440,baseY);
 line.addColorStop(0,'rgba(208,168,115,0)');line.addColorStop(.48,'rgba(231,195,143,.22)');line.addColorStop(1,'rgba(208,168,115,0)');
 ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(136,baseY);ctx.lineTo(426,baseY);ctx.stroke();
}
// One surface contour + a subtle translucent top plane. No twin ellipse strokes.
const waterMotion={wasPouring:false,lastPourEnd:-99999};
function liquid(ctx,opts){
 const {state,t,glasses,getLayers,liquidAverage,total}=opts,id=state.glass,g=specs[id];
 if(!g)return;
 const ml=clamp(state.visualML,0,total());if(ml<=.08){waterMotion.wasPouring=!!state.pour;return}
 const cap=Math.max(60,glasses[id].capacity-(window.LCIceV7?window.LCIceV7.displacement(state.iceKind,id):(state.decor.has('ice')?(id==='rocks'?50:60):0))),layers=getLayers(),avg=liquidAverage();
 const mix=clamp(state.mix,0,1),stir=Math.max(0,state.stirMotion||0),pour=state.pour;
 if(pour)waterMotion.wasPouring=true;
 else if(waterMotion.wasPouring){waterMotion.wasPouring=false;waterMotion.lastPourEnd=t}
 const pourProgress=pour?clamp((t-pour.start)/Math.max(1,pour.duration),0,1):0;
 const contact=pour?Math.pow(Math.sin(Math.PI*pourProgress),.65):0;
 const after=(!pour&&waterMotion.lastPourEnd>0)?Math.exp(-Math.max(0,t-waterMotion.lastPourEnd)/520):0;
 const impact=Math.max(contact,after*.65,window.LCIceV7?window.LCIceV7.impact(state):0);
 const amp=.16+Math.min(1,stir)*2.5+impact*5.3;
 const surfaceY=liquidY(id,ml,cap),sr=Math.max(2,radScreen(id,surfaceY)-5);
 const surfaceDepth=Math.max(2,sr*g.ellipse*.76);
 const wobble=(x,depth=1)=>{
  const q=clamp((x-CX)/Math.max(1,sr),-1,1);
  const envelope=Math.pow(Math.max(0,1-q*q),1.6);
  const cascade=Math.sin((x-CX)*.062-t*.024)*.60+Math.sin((x-CX)*.115+t*.031)*.28;
  const sink=impact*Math.exp(-Math.pow((x-CX)/29,2))*1.6;
  return envelope*depth*(amp*cascade+sink);
 };
 ctx.save();mask(ctx,id,5);ctx.clip();
 let used=0,topColor=avg;
 for(const p of layers){
  const take=Math.min(p.ml,Math.max(0,ml-used));if(take<=.001)break;
  const top=liquidY(id,used+take,cap),bottom=liquidY(id,used,cap);
  const isSurface=(used+take>=ml-.01);
  const r=Math.max(2,radScreen(id,top)-4);
  const ry=Math.max(1,r*g.ellipse*(isSurface?.76:.30));
  const shade=blend(p.layerColor,avg,mix);
  topColor=shade;
  const gr=ctx.createLinearGradient(CX-r,top,CX+r,top);
  gr.addColorStop(0,color(bright(shade,-.39),.86));
  gr.addColorStop(.14,color(bright(shade,-.04),.91));
  gr.addColorStop(.38,color(bright(shade,.19),.94));
  gr.addColorStop(.64,color(bright(shade,.06),.93));
  gr.addColorStop(.84,color(bright(shade,-.04),.90));
  gr.addColorStop(1,color(bright(shade,-.34),.87));
  // Paint the liquid body all the way to the FRONT edge of one meniscus.
  // The back edge is rendered only as a light/shaded plane, not another line.
  ctx.beginPath();ctx.moveTo(CX-r,top);
  for(let x=CX-r+4;x<CX+r;x+=4){
   const q=clamp((x-CX)/r,-1,1);
   ctx.lineTo(x,top+ry*Math.sqrt(Math.max(0,1-q*q))+(isSurface?wobble(x):0));
  }
  ctx.lineTo(CX+r,top);ctx.lineTo(CX+r,bottom+8);
  ctx.lineTo(CX-r,bottom+8);ctx.closePath();
  ctx.fillStyle=gr;ctx.fill();
  // Continuous vertical absorption, not independent rectangle banding.
  const depth=ctx.createLinearGradient(0,top,0,bottom);
  depth.addColorStop(0,'rgba(255,252,239,.045)');
  depth.addColorStop(.8,'rgba(28,34,51,0)');
  depth.addColorStop(1,'rgba(7,15,28,.10)');
  ctx.fillStyle=depth;ctx.fillRect(CX-r-4,top,r*2+8,Math.max(2,bottom-top)+9);
  used+=take;
 }
 // Single transparent liquid surface, entirely inside the interior glass mask.
 // No front/back semicircle outlines; the body shares this exact meniscus.
 const plane=ctx.createRadialGradient(CX-18,surfaceY-surfaceDepth*.6,1,CX,surfaceY,sr);
 plane.addColorStop(0,color(bright(topColor,.43),.24));
 plane.addColorStop(.52,color(bright(topColor,.20),.11));
 plane.addColorStop(1,color(bright(topColor,-.13),.07));
 ctx.fillStyle=plane;
 ellipse(ctx,CX,surfaceY+wobble(CX)*.22,sr,surfaceDepth);
 ctx.fill();
 // Localized submerged currents at the impact point, fading after a pour.
 if(impact>.035){
  const focal=ctx.createRadialGradient(CX+3,surfaceY+8,2,CX+3,surfaceY+22,Math.max(30,sr*.44));
  const injected=pour&&Array.isArray(pour.color)?pour.color:topColor;
  focal.addColorStop(0,color(bright(injected,.26),.22*impact));
  focal.addColorStop(.55,color(injected,.08*impact));
  focal.addColorStop(1,color(injected,0));
  ctx.fillStyle=focal;ellipse(ctx,CX+3,surfaceY+21,Math.min(sr*.57,63),22+impact*22);
  ctx.fill();
  // Very short, irregular highlights near the pouring impact, not surface rings.
  for(let k=0;k<3;k++){
   const x=CX+(k-1)*14+Math.sin(t*.011+k)*3;
   const y=surfaceY+7+Math.sin(t*.018+k)*impact*5;
   ctx.fillStyle='rgba(255,251,234,'+(impact*(.11+.035*k))+')';
   ellipse(ctx,x,y,2.1,1.1);ctx.fill();
  }
 }
 if(stir>.09){
  const current=ctx.createLinearGradient(CX-45,surfaceY+10,CX+55,surfaceY+56);
  current.addColorStop(0,'rgba(245,249,250,0)');
  current.addColorStop(.45,'rgba(245,249,250,'+(.068*stir)+')');
  current.addColorStop(1,'rgba(245,249,250,0)');
  ctx.fillStyle=current;ctx.fillRect(CX-55,surfaceY+6,110,60);
 }
 // Only sparkling mixers emit a small number of bounded bubbles.
 if(state.portions.some(p=>p.id==='soda'||p.id==='tonic')){
  const down=liquidY(id,0,cap);
  for(let k=0;k<17;k++){
   const h=down-surfaceY;if(h<12)break;
   const y=down-((k*23+t*.014)%(h+6));
   if(y<surfaceY+9||y>down-6)continue;
   const r=radScreen(id,y)*.75,x=CX+Math.sin(k*13.4)*r;
   ctx.strokeStyle='rgba(247,255,251,'+(.10+(k%4)*.035)+')';
   ctx.lineWidth=.8;ellipse(ctx,x,y,1+k%3*.3,1.5);ctx.stroke();
  }
 }
 if(state.decor.has('ice')&&!window.LCIceV7)drawIce(ctx,id,surfaceY,t);
 ctx.restore();
}
function drawIce(ctx,id,surface,t){
 const g=specs[id],bottom=gy(g.bottom);
 const count=id==='coupe'?2:3;
 for(let n=0;n<count;n++){
  let x=CX+[-30,28,0][n],y=clamp(surface+23+15*n,surface+18,bottom-18),s=id==='coupe'?14:20;
  ctx.save();ctx.translate(x,y+Math.sin(t*.0006+n)*1.5);ctx.rotate((n%2?-.24:.16));
  ctx.fillStyle='rgba(232,248,250,.17)';ctx.strokeStyle='rgba(248,250,249,.47)';ctx.lineWidth=1.3;
  ctx.beginPath();ctx.moveTo(-s*.82,-s*.65);ctx.lineTo(s*.5,-s*.92);ctx.lineTo(s*.94,s*.58);ctx.lineTo(-s*.4,s*.81);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 }
}
function garnish(ctx,id,state,t){
 const g=specs[id],baseY=gy(g.top)-11,rx=half(id,g.top)*SCALE,x=CX+rx*.77;
 if(state.decor.has('citrus')){
  ctx.save();ctx.translate(x,baseY-2);ctx.rotate(-.31);ctx.fillStyle='#d6a244';ctx.beginPath();ctx.ellipse(0,0,21,21,0,0,TAU);ctx.fill();ctx.strokeStyle='#efc16e';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#f7d8a2';ctx.beginPath();ctx.arc(0,0,17,0,TAU);ctx.fill();ctx.strokeStyle='rgba(255,249,212,.85)';ctx.lineWidth=1;
  for(let k=0;k<7;k++){const a=k*TAU/7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(17*Math.cos(a),17*Math.sin(a));ctx.stroke()}
  ctx.restore();
 }
 if(state.decor.has('cherry')){
  ctx.beginPath();ctx.moveTo(x-12,baseY);ctx.quadraticCurveTo(x+8,baseY-24,x+3,baseY-34);ctx.strokeStyle='#728366';ctx.lineWidth=1.7;ctx.stroke();
  ctx.fillStyle='#8d243c';ellipse(ctx,x-12,baseY,10,10);ctx.fill();ctx.fillStyle='rgba(251,229,222,.7)';ellipse(ctx,x-15,baseY-3,2.4,2.4);ctx.fill();
 }
 if(state.decor.has('rosemary')){
  ctx.save();ctx.translate(CX+rx*.41,baseY);ctx.rotate(-.45);
  ctx.strokeStyle='#617a51';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(0,-57);ctx.stroke();
  for(let j=0;j<11;j++){let yy=-j*5;ctx.strokeStyle=j%2?'#788e65':'#a1b08d';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(j%2?13:-12,yy-13);ctx.stroke();
  }ctx.restore();
 }
 if(state.decor.has('flower')){
  let fx=CX+rx*.28,fy=baseY-9;
  ctx.fillStyle='#e6bdcd';
  for(let k=0;k<5;k++){let a=k*TAU/5;ellipse(ctx,fx+8*Math.cos(a),fy+8*Math.sin(a),7,10);ctx.fill();}
  ctx.fillStyle='#edce7c';ellipse(ctx,fx,fy,4,4);ctx.fill();
 }
}
function pour(ctx,id,state,t,cap){const p=state.pour;if(!p)return;
 const z=clamp((t-p.start)/p.duration,0,1),force=Math.sin(Math.PI*z);if(force<=.008)return;
 const pc=Array.isArray(p.color)?p.color:[188,211,217],surface=liquidY(id,state.visualML,cap);
 const sx=376,sy=59,ex=CX+6,ey=surface+2;
 const gr=ctx.createLinearGradient(sx,sy,ex,ey);gr.addColorStop(0,color(bright(pc,.30),.64*force));gr.addColorStop(.65,color(pc,.85*force));gr.addColorStop(1,color(bright(pc,.16),.95*force));
 ctx.strokeStyle=gr;ctx.lineCap='round';ctx.lineWidth=3+2*force;
 ctx.beginPath();ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx+4,sy+47,ex-7,ey-45,ex,ey);ctx.stroke();
 ctx.lineWidth=1;ctx.strokeStyle=`rgba(247,254,253,${.49*force})`;ctx.stroke();
 for(let n=0;n<4;n++){const k=(z*1.8+n*.25)%1;const x=lerp(sx,ex,k),y=lerp(sy,ey,k);
  ctx.fillStyle=color(bright(pc,.22),.35*force);ellipse(ctx,x,y,1.6,2.2);ctx.fill()}
}
function draw(options){const {ctx,state,t,glasses}=options,id=state.glass,g=specs[id];if(!g)return false;
 if(!loaded[id])return false;
 if(loaded[id]!=='ready')return false;
 ctx.save();ground(ctx,id);
 const v8=window.LCIceV8;
 const split=!!(v8&&id!=='coupe'&&g.edges?.complete&&g.edges.naturalWidth&&g.baseFront?.complete&&g.baseFront.naturalWidth);
 if(split){
  // Glass art at BACK, so the ice is never hidden by an opaque faceted glass base.
  ctx.drawImage(g.img,IMG.x,IMG.y,IMG.w,IMG.h);
  liquid(ctx,options);
  v8.draw(ctx,state,t);
  // These physically separated source-image passes preserve original rim and base reflection.
  ctx.drawImage(g.edges,IMG.x,IMG.y,IMG.w,IMG.h);
  ctx.drawImage(g.baseFront,IMG.x,IMG.y,IMG.w,IMG.h);
 }else{
  // Fallback for unavailable layers and the stemmed coupe (normally no ice).
  liquid(ctx,options);
  if(window.LCIceV7)window.LCIceV7.draw(ctx,state,t);
  else if(state.decor.has('ice')&&state.visualML<=.08&&id!=='coupe')drawIce(ctx,id,gy(g.bottom)-98,t);
  ctx.drawImage(g.img,IMG.x,IMG.y,IMG.w,IMG.h);
 }
 garnish(ctx,id,state,t);pour(ctx,id,state,t,glasses[id].capacity-(window.LCIceV7?window.LCIceV7.displacement(state.iceKind,id):(state.decor.has('ice')?(id==='rocks'?50:60):0)));
 ctx.restore();return true;
}
window.LCArtV5={draw,liquidY,hitTest,ready:()=>Object.values(loaded).every(x=>x==='ready'),specs,assetRect:IMG};
})();