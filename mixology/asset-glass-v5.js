/* La Crystalline Mixology V5 (V8.2 geometry) — photographic glass assets with invisible liquid masks.
   V8.2: one measured interior geometry per glass, taken from the actual WebP pixels
   (inner wall = inner edge of the separated wall layer; rim and floor ellipses measured on
   the centre column). The SAME geometry drives the liquid volume, liquid clip, ice clip,
   ice collision and the front-glass pass, so collision, mask and pixels can no longer disagree.
   Front glass is re-drawn from the ORIGINAL glass image (not from the old partial overlays):
   walls/base/rim are composited over the ice, front-wall reflections are screened over it. */
(()=>{
'use strict';
const TAU=Math.PI*2,CX=280,SCALE=400/1086,IMG={x:80,y:35,w:400,h:1448*(400/1086)};
// All numbers in source-image pixels (1086 x 1448). Measured, not tuned:
//  wall  : inner edge of *_glass_edges.webp at y0 / y1 (linear fit, < 1 px error in between)
//  rim   : centre-column back/front rim arcs -> centre cy, half-depth ry, outer half-width hw
//  floor : centre-column back/front edge of the inner floor ellipse -> cy, ry
//  base  : lowest opaque row of the glass image (where the glass stands)
const specs={
 highball:{src:'./assets/highball_glass_lossless.webp',top:118,bottom:1193,
  wall:{y0:225,l0:336,r0:750,y1:1125,l1:361,r1:724},rim:{cy:103,ry:65,hw:276,band:12},floor:{cy:1193,ry:51},base:1423},
 rocks:{src:'./assets/rocks_glass_lossless.webp',top:318,bottom:1017,
  wall:{y0:325,l0:164,r0:920,y1:1075,l1:206,r1:879},rim:{cy:303,ry:105,hw:441,band:12},floor:{cy:1017,ry:95},base:1297},
 // Coupe bowl: surface of revolution fitted to the measured outer silhouette (RMS error < 2 px),
 // inner bottom raised to the visible inside of the bowl (thick glass where it meets the stem).
 coupe:{src:'./assets/coupe_glass_lossless.webp',top:200,bottom:470,
  bowl:{rIn:453,yb:470,p:3.1,q:.74},rim:{cy:179,ry:121,hw:465,band:12},base:1415}
};
// Stage composition (P4): the whole glass scene is drawn at VIEW.scale and every glass stands
// on the same ground line, so switching glasses no longer jumps and the glass no longer fills
// the whole stage. Physics stays in scene coordinates; only hit-testing needs the inverse.
const VIEW={scale:.84,ground:580};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const color=(c,a=1)=>`rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const blend=(a,b,t)=>a.map((v,i)=>Math.round(lerp(v,b[i],t)));
const bright=(a,q)=>blend(a,q>=0?[254,246,228]:[4,12,30],Math.abs(q));
const gy=y=>IMG.y+y*SCALE, gx=x=>IMG.x+x*SCALE, sy=y=>(y-IMG.y)/SCALE;
const loaded={};
Object.keys(specs).forEach(id=>{
 const im=new Image();im.decoding='async';im.onload=()=>{loaded[id]='ready'};
 im.onerror=()=>{loaded[id]='error';console.warn('Cannot load cocktail glass asset',id)};
 im.src=specs[id].src;specs[id].img=im;
});
function view(id){
 const g=specs[id],s=VIEW.scale;
 return {s,tx:CX*(1-s),ty:VIEW.ground-gy(g.base)*s};
}
// ---- measured interior geometry (source space) ----
function wallAt(id,y){const w=specs[id].wall;const f=(y-w.y0)/(w.y1-w.y0);return [lerp(w.l0,w.l1,f),lerp(w.r0,w.r1,f)]}
function half(id,y){const g=specs[id];if(!g)return 0;
 if(g.wall){const yy=clamp(y,g.rim.cy,g.floor.cy),[l,r]=wallAt(id,yy);return (r-l)/2}
 const b=g.bowl,f=clamp((y-g.rim.cy)/(b.yb-g.rim.cy),0,1);
 return Math.max(.5,b.rIn*Math.pow(Math.max(0,1-Math.pow(f,b.p)),b.q));
}
// Perspective ratio of a horizontal circle at depth y (ry / rx). Rim and floor are measured;
// in between it is interpolated, so every liquid interface uses the glass's own perspective.
function ratio(id,y){const g=specs[id];
 if(!g.wall)return g.rim.ry/g.rim.hw;
 const top=g.rim.ry/g.rim.hw,bottom=g.floor.ry/half(id,g.floor.cy);
 return lerp(top,bottom,clamp((y-g.rim.cy)/(g.floor.cy-g.rim.cy),0,1));
}
// Deterministic cross-sectional integration from the floor plane to the fill line.
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
// Visible inner silhouette of the coupe bowl = union of its horizontal circles in perspective.
const bowlRows={};
for(const id of Object.keys(specs)){const g=specs[id];if(!g.bowl)continue;
 const rows=[],k=ratio(id,0);
 for(let y=g.rim.cy;y<=g.bowl.yb+80;y+=3){let w=0;
  for(let yc=g.rim.cy;yc<=g.bowl.yb&&yc<=y;yc+=2){const r=half(id,yc),d=(y-yc)/Math.max(.001,k*r);
   if(d<1)w=Math.max(w,r*Math.sqrt(1-d*d))}
  if(w<.5&&y>g.bowl.yb)break;rows.push([y,w]);}
 bowlRows[id]=rows;
}
// ---- screen-space helpers (scene coordinates) ----
function radScreen(id,y){return half(id,sy(y))*SCALE}
function depthScreen(id,y,inset=0){return Math.max(1,radScreen(id,y)-inset)*ratio(id,sy(y))}
// Front arc of a horizontal liquid / floor ellipse whose centre line is y.
function frontArc(id,y,x,inset=0){const r=Math.max(1,radScreen(id,y)-inset),u=clamp((x-CX)/r,-1,1);
 return y+depthScreen(id,y,inset)*Math.sqrt(Math.max(0,1-u*u))}
function floorInfo(id){const g=specs[id];if(!g.wall)return null;
 const y=gy(g.floor.cy);return {y,radius:radScreen(id,y),ratio:ratio(id,g.floor.cy),depth:g.floor.ry*SCALE}}
function rimInfo(id){const g=specs[id];
 const y=gy(g.rim.cy),r=radScreen(id,y);return {y,radius:r,back:y-r*ratio(id,g.rim.cy),front:y+g.rim.ry*SCALE}}
// The visible inside of the glass: inner back-rim arc, inner walls, inner floor front arc.
function interior(ctx,id,inset=0,fresh=true){
 const g=specs[id];
 if(g.bowl){
  const rows=bowlRows[id],rimY=gy(g.rim.cy),rr=Math.max(2,half(id,g.rim.cy)*SCALE-inset),rd=rr*ratio(id,0),N=48;
  if(fresh)ctx.beginPath();
  for(let i=0;i<=N;i++){const u=-1+2*i/N;(i?ctx.lineTo:ctx.moveTo).call(ctx,CX+u*rr,rimY-rd*Math.sqrt(Math.max(0,1-u*u))+inset*.5)}
  for(const [y,w] of rows)ctx.lineTo(CX+Math.max(0,w*SCALE-inset),gy(y));
  for(let i=rows.length-1;i>=0;i--)ctx.lineTo(CX-Math.max(0,rows[i][1]*SCALE-inset),gy(rows[i][0]));
  ctx.closePath();return;
 }
 const rimY=gy(g.rim.cy),floorY=gy(g.floor.cy);
 const rr=Math.max(2,radScreen(id,rimY)-inset),rd=rr*ratio(id,g.rim.cy);
 const fr=Math.max(2,radScreen(id,floorY)-inset),fd=fr*ratio(id,g.floor.cy);
 const N=48;if(fresh)ctx.beginPath();
 for(let i=0;i<=N;i++){const u=-1+2*i/N;(i?ctx.lineTo:ctx.moveTo).call(ctx,CX+u*rr,rimY-rd*Math.sqrt(Math.max(0,1-u*u))+inset*.5)}
 for(let y=rimY;y<=floorY;y+=4)ctx.lineTo(CX+radScreen(id,y)-inset,y);
 ctx.lineTo(CX+fr,floorY);
 for(let i=N;i>=0;i--){const u=-1+2*i/N;ctx.lineTo(CX+u*fr,floorY+fd*Math.sqrt(Math.max(0,1-u*u))-inset*.5)}
 for(let y=floorY;y>=rimY;y-=4)ctx.lineTo(CX-radScreen(id,y)+inset,y);
 ctx.closePath();
}
// The solid front rim band of the ORIGINAL image (it must sit over ice and liquid).
function rimBand(ctx,id){
 const g=specs[id],y=gy(g.rim.cy),ry=g.rim.ry*SCALE,hw=g.rim.hw*SCALE,b=g.rim.band*SCALE,N=48;
 ctx.beginPath();
 for(let i=0;i<=N;i++){const u=-1+2*i/N;ctx.lineTo(CX+u*hw,y+ry*Math.sqrt(1-u*u)-b)}
 for(let i=N;i>=0;i--){const u=-1+2*i/N;ctx.lineTo(CX+u*hw,y+ry*Math.sqrt(1-u*u)+b)}
 ctx.closePath();
}
function floorEllipse(ctx,id,fresh=true){const f=floorInfo(id);if(fresh)ctx.beginPath();else ctx.moveTo(CX+f.radius,f.y);ctx.ellipse(CX,f.y,f.radius,f.radius*f.ratio,0,0,TAU)}
function toScene(id,x,y){const v=view(id);return {x:(x-v.tx)/v.s,y:(y-v.ty)/v.s}}
function hitTest(id,x,y,ml,cap){const g=specs[id];if(!g)return false;
 const p=toScene(id,x,y),src=sy(p.y);if(src<g.top-20||src>(g.floor?g.floor.cy+g.floor.ry:g.bottom+60))return false;
 const r=half(id,src)*SCALE-4;
 return p.y>=liquidY(id,ml,cap)-15&&Math.abs(p.x-CX)<r;
}
function ellipse(ctx,x,y,w,h){ctx.beginPath();ctx.ellipse(x,y,Math.max(1,w),Math.max(1,h),0,0,TAU)}
function ground(ctx,id){
 const g=specs[id],baseY=gy(g.base)-2,mid=(gy(g.top)+baseY)/2;
 let halo=ctx.createRadialGradient(CX,mid,8,CX,mid,300);
 halo.addColorStop(0,'rgba(181,164,127,.09)');halo.addColorStop(.6,'rgba(58,111,140,.045)');halo.addColorStop(1,'rgba(11,19,37,0)');
 ctx.fillStyle=halo;ctx.fillRect(-80,mid-330,720,660);
 const w=id==='rocks'?190:id==='coupe'?150:130;
 const shadow=ctx.createRadialGradient(CX,baseY,8,CX,baseY,w*1.05);
 shadow.addColorStop(0,'rgba(2,6,12,.72)');shadow.addColorStop(.6,'rgba(0,7,19,.29)');shadow.addColorStop(1,'rgba(0,5,13,0)');
 ctx.fillStyle=shadow;ellipse(ctx,CX,baseY,w*1.15,24);ctx.fill();
 const line=ctx.createLinearGradient(CX-230,baseY,CX+230,baseY);
 line.addColorStop(0,'rgba(208,168,115,0)');line.addColorStop(.48,'rgba(231,195,143,.24)');line.addColorStop(1,'rgba(208,168,115,0)');
 ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(CX-215,baseY+1);ctx.lineTo(CX+215,baseY+1);ctx.stroke();
}
const waterMotion={wasPouring:false,lastPourEnd:-99999};
let lastLiquid={bands:[],surface:null};
function capOf(state,glasses,id){
 return Math.max(60,glasses[id].capacity-(window.LCIceV7?window.LCIceV7.displacement(state.iceKind,id):(state.decor.has('ice')?(id==='rocks'?50:60):0)));
}
function liquid(ctx,opts){
 const {state,t,glasses,getLayers,liquidAverage,total}=opts,id=state.glass,g=specs[id];
 if(!g)return;
 lastLiquid={bands:[],surface:null};
 const ml=clamp(state.visualML,0,total());if(ml<=.08){waterMotion.wasPouring=!!state.pour;return}
 const cap=capOf(state,glasses,id),layers=getLayers(),avg=liquidAverage();
 const mix=clamp(state.mix,0,1),stir=Math.max(0,state.stirMotion||0),pour=state.pour;
 if(pour)waterMotion.wasPouring=true;
 else if(waterMotion.wasPouring){waterMotion.wasPouring=false;waterMotion.lastPourEnd=t}
 const pourProgress=pour?clamp((t-pour.start)/Math.max(1,pour.duration),0,1):0;
 const contact=pour?Math.pow(Math.sin(Math.PI*pourProgress),.65):0;
 const after=(!pour&&waterMotion.lastPourEnd>0)?Math.exp(-Math.max(0,t-waterMotion.lastPourEnd)/520):0;
 const impact=Math.max(contact,after*.65,window.LCIceV7?window.LCIceV7.impact(state):0);
 const amp=.16+Math.min(1,stir)*2.5+impact*5.3;
 // Negative inset: the drink reaches the inner glass surface and continues a little under the
 // wall art (which is composited over it), as refraction does in the photograph. No dark gap.
 const INSET=g.wall?-5:-1.5;
 const surfaceY=liquidY(id,ml,cap),sr=Math.max(2,radScreen(id,surfaceY)-INSET);
 const wobble=(x,depth=1)=>{
  const q=clamp((x-CX)/Math.max(1,sr),-1,1);
  const envelope=Math.pow(Math.max(0,1-q*q),1.6);
  const cascade=Math.sin((x-CX)*.062-t*.024)*.60+Math.sin((x-CX)*.115+t*.031)*.28;
  const sink=impact*Math.exp(-Math.pow((x-CX)/29,2))*1.6;
  return envelope*depth*(amp*cascade+sink);
 };
 ctx.save();interior(ctx,id,INSET);ctx.clip();
 // Every interface is an ellipse in the glass's measured perspective (front arc only).
 const rAt=y=>Math.max(2,radScreen(id,y)-INSET);
 const edgeAt=(y,x,onSurface=false)=>frontArc(id,y,x,INSET)+(onSurface?wobble(x)*.75:0);
 // A layer is every point of the glass's front surface between two levels. Where the lower
 // level is narrower than the upper one (tapering bowl), the points outside it still belong to
 // this layer, so the band runs down to the interior clip there instead of being joined by a
 // straight chord (that chord produced the old kite / wedge shapes).
 const bandPath=(upper,lower,topIsSurface,isBottom=false)=>{
  const r1=rAt(upper),r2=isBottom?0:Math.min(r1,rAt(lower)),deep=lower+400;
  ctx.beginPath();
  for(let i=0;i<=60;i++){const x=CX-r1+(r1*2*i/60);ctx.lineTo(x,edgeAt(upper,x,topIsSurface))}
  ctx.lineTo(CX+r1,deep);ctx.lineTo(CX+r2,deep);
  if(r2>0)for(let i=60;i>=0;i--){const x=CX-r2+(r2*2*i/60);ctx.lineTo(x,edgeAt(lower,x,false))}
  ctx.lineTo(CX-r2,deep);ctx.lineTo(CX-r1,deep);
  ctx.closePath();
 };
 const bodyFill=(shade,r)=>{
  const s=ctx.createLinearGradient(CX-r,0,CX+r,0);
  s.addColorStop(0,color(bright(shade,-.30),.80));
  s.addColorStop(.16,color(bright(shade,-.05),.86));
  s.addColorStop(.42,color(bright(shade,.13),.89));
  s.addColorStop(.67,color(bright(shade,.07),.88));
  s.addColorStop(.90,color(bright(shade,-.09),.85));
  s.addColorStop(1,color(bright(shade,-.28),.79));
  return s;
 };
 let used=0,topColor=avg;const bands=[];
 for(const p of layers){
  const take=Math.min(p.ml,Math.max(0,ml-used));
  if(take<=.001)break;
  const upper=liquidY(id,used+take,cap),lower=liquidY(id,used,cap);
  const topIsSurface=used+take>=ml-.01;
  const r=Math.max(rAt(upper),rAt(lower));
  const shade=blend(p.layerColor,avg,mix);
  topColor=shade;bands.push({upper,lower,shade});
  bandPath(upper,lower,topIsSurface,used<=.001);
  ctx.fillStyle=bodyFill(shade,r);ctx.fill();
  ctx.save();ctx.clip();
  const absorption=ctx.createLinearGradient(0,upper-4,0,Math.max(upper+5,lower+depthScreen(id,lower,INSET)));
  absorption.addColorStop(0,'rgba(255,252,242,.05)');
  absorption.addColorStop(.43,'rgba(28,37,53,0)');
  absorption.addColorStop(1,'rgba(11,19,31,.09)');
  ctx.fillStyle=absorption;
  ctx.fillRect(CX-r-10,upper-35,r*2+20,Math.max(60,lower-upper+76));
  ctx.restore();
  used+=take;
 }
 lastLiquid={bands:bands.map(b=>({...b})),surface:null};
 // Interfaces: a translucent colour transition that follows the curved front arc.
 // No white line, no straight stripe: the two neighbouring colours are feathered together.
 for(let i=1;i<bands.length;i++){
  const below=bands[i-1],above=bands[i],y=above.lower,r=rAt(y);
  const feather=clamp((above.lower-above.upper)*.18,2.5,7)*(1-mix*.8);
  if(feather<.6)continue;
  const mid=blend(below.shade,above.shade,.5);
  ctx.beginPath();
  for(let j=0;j<=54;j++){const x=CX-r+2*r*j/54;ctx.lineTo(x,edgeAt(y,x)-feather)}
  for(let j=54;j>=0;j--){const x=CX-r+2*r*j/54;ctx.lineTo(x,edgeAt(y,x)+feather)}
  ctx.closePath();
  const f=ctx.createLinearGradient(0,y-feather,0,y+depthScreen(id,y,INSET)+feather);
  f.addColorStop(0,color(above.shade,0));f.addColorStop(.5,color(mid,.42));f.addColorStop(1,color(below.shade,0));
  ctx.fillStyle=f;ctx.fill();
  const shine=ctx.createLinearGradient(CX-r,0,CX+r,0);
  shine.addColorStop(0,'rgba(255,250,236,0)');shine.addColorStop(.45,color(bright(mid,.45),.12));shine.addColorStop(1,'rgba(255,250,236,0)');
  ctx.beginPath();for(let j=0;j<=54;j++){const x=CX-r+2*r*j/54;ctx.lineTo(x,edgeAt(y,x))}
  ctx.strokeStyle=shine;ctx.lineWidth=1.1;ctx.stroke();
 }
 // Free surface: a perspective ellipse in the drink's OWN colour (lit from above), not a
 // near-transparent plane that lets the dark stage show through as a grey "lid".
 lastLiquid.surface=surfaceY;
 const rad=sr,dep=depthScreen(id,surfaceY,INSET);
 ctx.beginPath();
 for(let j=0;j<=64;j++){
  const x=CX-rad+(2*rad*j/64),u=clamp((x-CX)/rad,-1,1);
  ctx.lineTo(x,surfaceY-dep*Math.sqrt(Math.max(0,1-u*u))+wobble(x)*.28);
 }
 for(let j=64;j>=0;j--){const x=CX-rad+(2*rad*j/64);ctx.lineTo(x,edgeAt(surfaceY,x,true))}
 ctx.closePath();
 const topGlow=ctx.createLinearGradient(0,surfaceY-dep,0,surfaceY+dep);
 topGlow.addColorStop(0,color(bright(topColor,.30),.62));
 topGlow.addColorStop(.45,color(bright(topColor,.16),.72));
 topGlow.addColorStop(1,color(bright(topColor,.04),.80));
 ctx.fillStyle=topGlow;ctx.fill();
 ctx.save();ctx.clip();
 const sheen=ctx.createRadialGradient(CX-rad*.28,surfaceY-dep*.25,1,CX-rad*.28,surfaceY-dep*.25,rad*.75);
 sheen.addColorStop(0,'rgba(255,250,236,.20)');sheen.addColorStop(1,'rgba(255,250,236,0)');
 ctx.fillStyle=sheen;ctx.fillRect(CX-rad,surfaceY-dep-4,rad*2,dep*2+8);
 ctx.restore();
 ctx.beginPath();
 for(let j=0;j<=60;j++){const x=CX-rad+(2*rad*j/60);ctx.lineTo(x,edgeAt(surfaceY,x,true))}
 const rimGlow=ctx.createLinearGradient(CX-rad,0,CX+rad,0);
 rimGlow.addColorStop(0,'rgba(252,250,243,0)');
 rimGlow.addColorStop(.24,'rgba(255,249,239,.12)');
 rimGlow.addColorStop(.57,'rgba(255,250,239,.22)');
 rimGlow.addColorStop(.82,'rgba(250,251,250,.10)');
 rimGlow.addColorStop(1,'rgba(255,255,255,0)');
 ctx.strokeStyle=rimGlow;ctx.lineWidth=.9;ctx.stroke();
 if(impact>.035){
  const focal=ctx.createRadialGradient(CX+3,surfaceY+8,2,CX+3,surfaceY+22,Math.max(30,sr*.44));
  const injected=pour&&Array.isArray(pour.color)?pour.color:topColor;
  focal.addColorStop(0,color(bright(injected,.26),.22*impact));
  focal.addColorStop(.55,color(injected,.08*impact));
  focal.addColorStop(1,color(injected,0));
  ctx.fillStyle=focal;ellipse(ctx,CX+3,surfaceY+21,Math.min(sr*.57,63),22+impact*22);
  ctx.fill();
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
 ctx.restore();
}
function garnish(ctx,id,state,t){
 const g=specs[id],baseY=gy(g.rim.cy)-11,rx=g.rim.hw*SCALE,x=CX+rx*.77;
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
 const g=specs[id],rimTop=gy(g.rim.cy)-g.rim.ry*SCALE;
 const sx=376,sy0=Math.min(59,rimTop-40),ex=CX+6,ey=surface+2;
 const gr=ctx.createLinearGradient(sx,sy0,ex,ey);gr.addColorStop(0,color(bright(pc,.30),.64*force));gr.addColorStop(.65,color(pc,.85*force));gr.addColorStop(1,color(bright(pc,.16),.95*force));
 ctx.strokeStyle=gr;ctx.lineCap='round';ctx.lineWidth=3+2*force;
 ctx.beginPath();ctx.moveTo(sx,sy0);ctx.bezierCurveTo(sx+4,sy0+47,ex-7,ey-45,ex,ey);ctx.stroke();
 ctx.lineWidth=1;ctx.strokeStyle=`rgba(247,254,253,${.49*force})`;ctx.stroke();
 for(let n=0;n<4;n++){const k=(z*1.8+n*.25)%1;const x=lerp(sx,ex,k),y=lerp(sy0,ey,k);
  ctx.fillStyle=color(bright(pc,.22),.35*force);ellipse(ctx,x,y,1.6,2.2);ctx.fill()}
}
// Front glass from the ORIGINAL image, so nothing in the cup can appear in front of the glass:
//  1. everything outside the interior silhouette (walls, base, outer rim) – normal compositing
//  2. the solid front rim band – normal compositing
//  3. inside the silhouette: the transparent front wall only adds light (screen), so its cut
//     facets and reflections lie over ice and liquid without hiding them.
function frontGlass(ctx,id){
 const g=specs[id],im=g.img;
 ctx.save();
 ctx.beginPath();ctx.rect(-200,-200,960,1100);
 interior(ctx,id,0,false);
 ctx.clip('evenodd');
 ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);
 ctx.restore();
 ctx.save();rimBand(ctx,id);ctx.clip();ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();
 ctx.save();
 interior(ctx,id,0);ctx.clip();
 ctx.globalCompositeOperation='screen';
 if(!g.floor){ctx.globalAlpha=.55;ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();return}
 // Above the floor the front wall is clear glass: its reflections are fully visible.
 ctx.save();ctx.beginPath();ctx.rect(-200,-200,960,1100);floorEllipse(ctx,id,false);ctx.clip('evenodd');
 ctx.globalAlpha=id==='rocks'?.62:.5;ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();
 // Over the floor the image also contains the (behind) floor itself; keep only a light pass.
 ctx.save();floorEllipse(ctx,id);ctx.clip();
 ctx.globalAlpha=id==='rocks'?.34:.2;ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();
 ctx.restore();
}
function draw(options){const {ctx,state,t,glasses}=options,id=state.glass,g=specs[id];if(!g)return false;
 if(loaded[id]!=='ready')return false;
 const v=view(id);
 ctx.save();ctx.transform(v.s,0,0,v.s,v.tx,v.ty);
 ground(ctx,id);
 // Back: only the inside of the glass (back wall, back rim, floor / bowl).
 ctx.save();interior(ctx,id,0);ctx.clip();ctx.drawImage(g.img,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();
 liquid(ctx,options);
 if(window.LCIceV8&&g.floor)window.LCIceV8.draw(ctx,state,t,lastLiquid);
 frontGlass(ctx,id);
 garnish(ctx,id,state,t);pour(ctx,id,state,t,capOf(state,glasses,id));
 ctx.restore();return true;
}
window.LCArtV5={draw,liquidY,hitTest,
 clipInner:(ctx,id,inset=0)=>{interior(ctx,id,inset);ctx.clip()},
 innerRadius:(id,y,inset=0)=>Math.max(1,radScreen(id,y)-inset),
 frontArc,floor:floorInfo,rim:rimInfo,view,toScene,
 ready:()=>Object.values(loaded).every(x=>x==='ready'),specs,assetRect:IMG,version:'8.2'};
})();
