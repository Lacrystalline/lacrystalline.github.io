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
 const im=new Image();im.decoding='async';im.onload=()=>{buildGloss(id);loaded[id]='ready'};
 im.onerror=()=>{loaded[id]='error';console.warn('Cannot load cocktail glass asset',id)};
 im.src=specs[id].src;specs[id].img=im;
});
// Highlight-only copy of the original glass (V8.3). Bright pixels keep their opacity, mid/dark
// pixels fade out. Drawn source-over in front of the drink it restores the wall's specular
// streaks and facet edges that a coloured liquid otherwise washes out (screen alone cannot add
// contrast over a pale drink). Built once per glass from the same-origin WebP.
function buildGloss(id){
 const g=specs[id],im=g.img;
 try{
  const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){
   const l=Math.max(p[i],p[i+1],p[i+2])/255,k=Math.min(1,Math.max(0,(l-.6)/.36));
   p[i+3]=p[i+3]*k*k*(3-2*k);
  }
  x.putImageData(d,0,0);g.gloss=c;
 }catch(e){console.warn('Glass gloss layer unavailable',id,e)}
}
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
 const cap=capOf(state,glasses,id),layers=getLayers(),avg=liquidAverage(),avgOp=opts.liquidOpacity?opts.liquidOpacity():1;
 // V9.6: clear spirits are water-white; ink() scales the body paint so they read as clear liquid
 const ink=op=>.10+.90*clamp(op,0,1);
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
 const bodyFill=(shade,r,op=1)=>{
  const s=ctx.createLinearGradient(CX-r,0,CX+r,0),k=ink(op);
  s.addColorStop(0,color(bright(shade,-.42),.82*k));
  s.addColorStop(.16,color(bright(shade,-.05),.86*k));
  s.addColorStop(.42,color(bright(shade,.13),.89*k));
  s.addColorStop(.67,color(bright(shade,.07),.88*k));
  s.addColorStop(.90,color(bright(shade,-.09),.85*k));
  s.addColorStop(1,color(bright(shade,-.40),.81*k));
  return s;
 };
 let used=0,topColor=avg,topOp=avgOp;const bands=[];
 for(const p of layers){
  const take=Math.min(p.ml,Math.max(0,ml-used));
  if(take<=.001)break;
  const upper=liquidY(id,used+take,cap),lower=liquidY(id,used,cap);
  const topIsSurface=used+take>=ml-.01;
  const r=Math.max(rAt(upper),rAt(lower));
  const shade=blend(p.layerColor,avg,mix),op=lerp(p.opacity??1,avgOp,mix);
  topColor=shade;topOp=op;bands.push({upper,lower,shade,op,soft:!!p.soft});
  bandPath(upper,lower,topIsSurface,used<=.001);
  ctx.fillStyle=bodyFill(shade,r,op);ctx.fill();
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
  // a blended pour zone (V10.2) fades into its neighbours instead of meeting them at a crisp line
  const soft=above.soft||below.soft,thin=Math.min(above.lower-above.upper,below.lower-below.upper);
  const feather=(soft?clamp(thin*.5,4,16):clamp((above.lower-above.upper)*.18,2.5,7))*(1-mix*.8);
  if(feather<.6)continue;
  const mid=blend(below.shade,above.shade,.5);
  ctx.beginPath();
  for(let j=0;j<=54;j++){const x=CX-r+2*r*j/54;ctx.lineTo(x,edgeAt(y,x)-feather)}
  for(let j=54;j>=0;j--){const x=CX-r+2*r*j/54;ctx.lineTo(x,edgeAt(y,x)+feather)}
  ctx.closePath();
  const f=ctx.createLinearGradient(0,y-feather,0,y+depthScreen(id,y,INSET)+feather);
  f.addColorStop(0,color(above.shade,0));f.addColorStop(.5,color(mid,.42*Math.max(ink(above.op),ink(below.op))));f.addColorStop(1,color(below.shade,0));
  ctx.fillStyle=f;ctx.fill();
  const shine=ctx.createLinearGradient(CX-r,0,CX+r,0);
  shine.addColorStop(0,'rgba(255,250,236,0)');shine.addColorStop(.45,color(bright(mid,.45),.12));shine.addColorStop(1,'rgba(255,250,236,0)');
  ctx.beginPath();for(let j=0;j<=54;j++){const x=CX-r+2*r*j/54;ctx.lineTo(x,edgeAt(y,x))}
  ctx.strokeStyle=shine;ctx.lineWidth=1.1;ctx.stroke();
 }
 // Free surface: a perspective ellipse in the drink's OWN colour (lit from above), not a
 // near-transparent plane that lets the dark stage show through as a grey "lid".
 const rad=sr,dep=depthScreen(id,surfaceY,INSET);
 lastLiquid.surface=surfaceY;lastLiquid.ratio=dep/Math.max(1,rad);lastLiquid.color=topColor;
 const backY=x=>{const u=clamp((x-CX)/rad,-1,1);return surfaceY-dep*Math.sqrt(Math.max(0,1-u*u))+wobble(x)*.28};
 const planePath=()=>{ctx.beginPath();
  for(let j=0;j<=64;j++){const x=CX-rad+(2*rad*j/64);ctx.lineTo(x,backY(x))}
  for(let j=64;j>=0;j--){const x=CX-rad+(2*rad*j/64);ctx.lineTo(x,edgeAt(surfaceY,x,true))}
  ctx.closePath()};
 // V8.3 free surface: the drink's own colour seen through a thin sheet, plus what a liquid
 // surface actually reflects - more light towards the far edge (Fresnel), the dark room in the
 // middle, a soft specular glint and bright meniscus lines where it meets the glass.
 planePath();
 const body=ctx.createLinearGradient(0,surfaceY-dep,0,surfaceY+dep);
 const tk=ink(topOp);
 body.addColorStop(0,color(bright(topColor,.20),.70*tk));
 body.addColorStop(.5,color(bright(topColor,.06),.74*tk));
 body.addColorStop(1,color(bright(topColor,.12),.80*tk));
 ctx.fillStyle=body;ctx.fill();
 ctx.save();ctx.clip();
 const fres=ctx.createLinearGradient(0,surfaceY-dep,0,surfaceY+dep);
 fres.addColorStop(0,'rgba(255,251,240,.20)');fres.addColorStop(.32,'rgba(255,251,240,.05)');
 fres.addColorStop(.58,'rgba(6,14,30,.08)');fres.addColorStop(1,'rgba(255,251,240,.07)');
 ctx.fillStyle=fres;ctx.fillRect(CX-rad-2,surfaceY-dep-4,rad*2+4,dep*2+8);
 const gx0=CX-rad*.5,gy0=surfaceY-dep*.12;
 ctx.save();ctx.translate(gx0,gy0);ctx.scale(1,Math.max(.12,dep/rad)*1.15);
 const glint=ctx.createRadialGradient(0,0,0,0,0,rad*.46);
 glint.addColorStop(0,'rgba(255,252,240,.42)');glint.addColorStop(.35,'rgba(255,252,240,.17)');glint.addColorStop(1,'rgba(255,252,240,0)');
 ctx.fillStyle=glint;ctx.beginPath();ctx.arc(0,0,rad*.46,0,TAU);ctx.fill();
 const spark=ctx.createRadialGradient(-rad*.06,0,0,-rad*.06,0,rad*.12);
 spark.addColorStop(0,'rgba(255,255,250,.62)');spark.addColorStop(1,'rgba(255,255,250,0)');
 ctx.fillStyle=spark;ctx.beginPath();ctx.arc(-rad*.06,0,rad*.12,0,TAU);ctx.fill();
 ctx.restore();
 ctx.restore();
 // Meniscus: thin bright line where the drink climbs the glass (back and front).
 const lineGrad=(a)=>{const g2=ctx.createLinearGradient(CX-rad,0,CX+rad,0);
  g2.addColorStop(0,'rgba(255,250,238,0)');g2.addColorStop(.18,'rgba(255,250,238,'+a*.55+')');
  g2.addColorStop(.5,'rgba(255,250,238,'+a+')');g2.addColorStop(.82,'rgba(255,250,238,'+a*.55+')');
  g2.addColorStop(1,'rgba(255,250,238,0)');return g2};
 ctx.beginPath();for(let j=0;j<=60;j++){const x=CX-rad+(2*rad*j/60);ctx.lineTo(x,backY(x))}
 ctx.strokeStyle=lineGrad(.30);ctx.lineWidth=1;ctx.stroke();
 ctx.beginPath();for(let j=0;j<=60;j++){const x=CX-rad+(2*rad*j/60);ctx.lineTo(x,edgeAt(surfaceY,x,true))}
 ctx.strokeStyle=lineGrad(.42);ctx.lineWidth=1.3;ctx.stroke();
 ctx.beginPath();for(let j=0;j<=60;j++){const x=CX-rad+(2*rad*j/60);ctx.lineTo(x,edgeAt(surfaceY,x,true)+2.2)}
 ctx.strokeStyle=color(bright(topColor,-.35),.16*tk);ctx.lineWidth=1.6;ctx.stroke();
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
 if(state.portions.some(p=>{const d=window.mixologyHooks&&window.mixologyHooks.byId&&window.mixologyHooks.byId[p.id];return d?d.cat==='soda':p.id==='soda'||p.id==='tonic'})){
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
 // V10.5 shaken texture: air beaten in by the shake. A citrus / syrup drink gets a thin head of fine
 // froth that thins out over about a minute and a pale haze in the body that clears; egg white keeps a
 // thick, fine, matte foam. The foam takes the top of the liquid column, coloured by the drink.
 const foam=state.foam&&state.flowStep==='served'?state.foam:null;
 if(foam){
  const age=Math.max(0,(Date.now()-foam.at)/1000),egg=foam.kind==='egg',kcm=2*g.rim.hw*SCALE/RIM_CM[id];
  const thick=Math.max(1.2,(egg?1.1*(.86+.14*Math.exp(-age/90)):.3*(.2+.8*Math.exp(-age/30)))*kcm);
  const haze=egg?.08:.2*Math.exp(-age/25);
  if(haze>.01){bandPath(surfaceY,liquidY(id,0,cap),true,true);ctx.fillStyle='rgba(248,246,238,'+haze.toFixed(3)+')';ctx.fill()}
  const fc=blend(topColor,[250,248,240],egg?.84:.6),fa=egg?.96:.14+.5*Math.exp(-age/40);
  bandPath(surfaceY,surfaceY+thick,true);
  const fg=ctx.createLinearGradient(0,surfaceY,0,surfaceY+thick+dep);
  fg.addColorStop(0,color(bright(fc,.06),fa));fg.addColorStop(.7,color(fc,fa*.92));fg.addColorStop(1,color(bright(fc,-.06),fa*.35));
  ctx.fillStyle=fg;ctx.fill();
  planePath();const top=ctx.createLinearGradient(0,surfaceY-dep,0,surfaceY+dep);
  top.addColorStop(0,color(bright(fc,.10),fa));top.addColorStop(1,color(bright(fc,-.02),fa));ctx.fillStyle=top;ctx.fill();
  ctx.save();ctx.clip();
  // bubbles: froth shows a few visible ones, egg foam is too fine to resolve
  const nB=egg?10:26;
  for(let k=0;k<nB;k++){const u=Math.sin(k*12.9898)*43758.5453%1,v=Math.sin(k*78.233)*12345.678%1;
   const x=CX+(Math.abs(u)*2-1)*rad*.9,y=surfaceY+(Math.abs(v)*2-1)*dep*.8,r=egg?.7:.8+(k%3)*.45;
   ctx.strokeStyle='rgba(255,255,252,'+(egg?.25:.42*fa).toFixed(3)+')';ctx.lineWidth=.7;ellipse(ctx,x,y,r,r*.6);ctx.stroke()}
  ctx.restore();
  ctx.beginPath();for(let j=0;j<=60;j++){const x=CX-rad+(2*rad*j/60);ctx.lineTo(x,edgeAt(surfaceY,x,true))}
  ctx.strokeStyle='rgba(255,253,246,'+(.35*fa).toFixed(3)+')';ctx.lineWidth=1.2;ctx.stroke();
 }
 ctx.restore();
}
// ---- V10.4 painted garnish (catalogue + images from garnish-v1.js) ----
// Real rim diameters (outer, cm) of the three glass assets; they turn asset centimetres into scene
// pixels per glass. Typical bar glassware sizes, consistent with each image's width/height ratio.
const RIM_CM={highball:6.5,rocks:8.5,coupe:11};
// One placement per glass and garnish (V10.4.1), chosen the way a bartender would serve it:
//  rim    – hung on the rim by its cut
//  float  – floating on the drink (peel, twist, dried wheel, flower, star anise)
//  lay    – lying flat on the drink (coupe: mint sprig, cinnamon stick)
//  lean   – lower end resting on the ice (sprigs, cinnamon) or on the floor (picks in rocks, fruit in
//           the drink), upper part leaning on the rim
//  across – lying across the rim opening, resting on the rim at both ends (picks in a highball,
//           rosemary over a coupe; sprigs in a highball / rocks served without ice)
//  wall   – pressed along the inside wall (cucumber ribbon)
//  bowl   – lying inside the coupe bowl on its walls, the fruit in the drink (picks in a coupe)
//  sink   – dropped in, resting on the bottom (cherries)
const PLACE={
 highball:{mint_sprig:'lean',rosemary_sprig:'lean',cinnamon_stick:'lean',cucumber_ribbon:'wall',olive_pick:'across',pick_gold:'across'},
 rocks:{mint_sprig:'lean',rosemary_sprig:'lean',cinnamon_stick:'lean',cucumber_ribbon:'wall',olive_pick:'lean',pick_gold:'lean'},
 coupe:{mint_sprig:'lay',rosemary_sprig:'across',cinnamon_stick:'lay',cucumber_ribbon:'wall',olive_pick:'bowl',pick_gold:'bowl'}};
// Direction (radians, image space) and length (px) from each long piece's anchor to its far end.
const AXIS={mint_sprig:[-1.424,581],rosemary_sprig:[-1.390,779],cinnamon_stick:[-.297,499],cucumber_ribbon:[.023,766],olive_pick:[-.496,626],pick_gold:[-.660,690]};
const NEEDS_ICE={mint_sprig:1,rosemary_sprig:1,cinnamon_stick:1},SPANS={mint_sprig:9,rosemary_sprig:12,cinnamon_stick:7.5};
function placeOf(state,k,m){const id=state.glass;let pl=(PLACE[id]&&PLACE[id][k])||m.slot;
 // a sprig or stick only stands up when the ice holds it; otherwise it rests across the rim if it is
 // long enough to reach both sides, else it leans from the floor
 if(pl==='lean'&&NEEDS_ICE[k]&&iceTop(state)==null&&SPANS[k]>RIM_CM[id])pl='across';
 return pl}
function gItems(state){const G=window.LCGarnish,out=[];if(!G||!state.decor)return out;
 for(const k of state.decor){const m=G.meta[k];if(!m)continue;const im=G.img(k);if(im)out.push({k,m,im,pl:placeOf(state,k,m)})}
 let n=0;for(const it of out)if(it.pl==='across')it.ai=n++; // a second piece across the rim lies behind the first
 return out}
// Highest point of the ice in the glass (scene px), or null; iceTopX is its x.
let iceTopX=CX;
function iceTop(state){const I=window.LCIceV8;if(!I||!state.decor||!state.decor.has('ice'))return null;
 const ps=(I.physics&&I.physics.particles)||[];if(!ps.length)return null;let top=1e9;
 for(const p of ps){const c=Math.abs(Math.cos(p.angle||0)),n=Math.abs(Math.sin(p.angle||0));
  const ey=p.k==='sphere'?p.height*.5:(p.height*c+p.w*n)*.5;if(p.y-ey<top){top=p.y-ey;iceTopX=p.x}}
 return top<1e8?top:null}
function gPose(id,state,glasses,it){const k=it.k,m=it.m,pl=it.pl;
 const g=specs[id],kcm=2*g.rim.hw*SCALE/RIM_CM[id],s=kcm/64;
 const rimY=gy(g.rim.cy),rIn=radScreen(id,rimY),rOut=g.rim.hw*SCALE,rd=rIn*ratio(id,g.rim.cy);
 const floorY=g.floor?gy(g.floor.cy):gy(g.bowl.yb);
 const ax=AXIS[k]||[0,0],toward=(bx,by,cx,cy)=>Math.atan2(cy-by,cx-bx)-ax[0];
 let x=CX,y=rimY,rot=0,q=1,qs=1;
 if(pl==='rim'){x=CX+(rIn+rOut)/2;y=rimY;rot=.06}
 else if(pl==='lean'){
  const pick=m.slot==='pick',top=iceTop(state);
  let by=floorY-2;if(top!=null&&top<floorY)by=Math.min(floorY-2,Math.max(rimY+.6*kcm,top+(pick?3.5:2.2)*kcm));
  const bx=CX+rIn*(pick?-.45:-.1),cx=CX+rIn*(pick?.62:-.92),cy=rimY-rd*.55;
  x=bx;y=by;rot=toward(bx,by,cx,cy)}
 else if(pl==='across'){const ph=.70,c=Math.cos(ph),n=Math.sin(ph),sh=it.ai?-.6:.2; // a second piece rests nearer the back
  const x1=CX-rOut*c,y1=rimY+rd*n,x2=CX+rOut*c,y2=rimY-rd*n,a=Math.atan2(y2-y1,x2-x1),L=ax[1]*s;
  x=CX-Math.cos(a)*L/2-n*rOut*sh;y=rimY-2-Math.sin(a)*L/2+c*rd*sh;rot=a-ax[0]}
 else if(pl==='wall'){
  if(id==='highball'){x=CX-rIn*.32;y=rimY+.7*kcm-rd*.85;rot=Math.PI/2-ax[0]}
  else{const L=ax[1]*s;x=CX-L/2;y=rimY+(id==='rocks'?2:.9)*kcm-rd*.9;rot=-ax[0]+.04}}
 else if(pl==='bowl'){let yc=g.rim.cy;const want=half(id,g.rim.cy)*.32;while(yc<g.bowl.yb&&half(id,yc)>want)yc+=2;
  x=CX-want*SCALE;y=gy(yc)-3;rot=(m.slot==='pick'?.05:0)}
 else if(pl==='float'||pl==='lay'){const sv=liquidY(id,state.visualML,capOf(state,glasses,id));
  if(pl==='float'){const top=iceTop(state);x=CX+rIn*.06;y=sv+depthScreen(id,sv)*.12;
   // ice standing above the drink: the piece is laid on top of the ice, as a peel on a large cube
   if(top!=null&&top<y){x=iceTopX;y=top+.3*kcm}
   if(m.squash)q=Math.max(.12,ratio(id,sy(sv))*1.15)}
  else{const L=ax[1]*s;x=CX-L/2;y=sv+depthScreen(id,sv)*.1;rot=-ax[0]+.05;qs=Math.max(.3,ratio(id,sy(sv))*1.6)}}
 else if(pl==='sink'){x=CX+rIn*.28;y=g.floor?floorY+g.floor.ry*SCALE*.3:floorY}
 return {x,y,rot,s,q,qs};
}
function gPaint(ctx,it,p){ctx.save();ctx.translate(p.x,p.y);if(p.qs!==1)ctx.scale(1,p.qs);ctx.rotate(p.rot);ctx.scale(p.s,p.s*p.q);
 ctx.drawImage(it.im,-it.m.ax,-it.m.ay,it.m.w,it.m.h);ctx.restore()}
// Front arc of the rim opening; garnish below it and inside the glass is seen through the front wall.
function rimArc(ctx,id,below,dy=0){const g=specs[id],y=gy(g.rim.cy)+dy,rr=radScreen(id,y),rd=rr*ratio(id,g.rim.cy),W=rr+400,N=40;
 ctx.beginPath();ctx.moveTo(CX-W,y);
 for(let i=0;i<=N;i++){const u=-1+2*i/N;ctx.lineTo(CX+u*rr,y+rd*Math.sqrt(Math.max(0,1-u*u)))}
 ctx.lineTo(CX+W,y);ctx.lineTo(CX+W,below?2400:-2400);ctx.lineTo(CX-W,below?2400:-2400);ctx.closePath()}
const CROSS={rim:1,lean:1,bowl:1},INSIDE={wall:1,sink:1},SURFACE={float:1,lay:1};
// Before the liquid: what is inside the glass below the rim (sunken fruit, the ribbon on the wall, the
// lower part of pieces crossing the rim), so the drink tints what is submerged and the front wall lies over it.
function garnishInside(ctx,id,state,glasses){
 for(const it of gItems(state)){if(!CROSS[it.pl]&&!INSIDE[it.pl])continue;
  const p=gPose(id,state,glasses,it);ctx.save();interior(ctx,id,0);ctx.clip();
  if(CROSS[it.pl]){rimArc(ctx,id,true,-1.5);ctx.clip()} // overlaps the outside layer by 1.5 px: no seam
  gPaint(ctx,it,p);ctx.restore()}
}
// After the liquid and ice: pieces floating or lying on the surface.
// After the ice: floating pieces lie on the drink, or on top of ice that stands above it.
function garnishFloat(ctx,id,state,glasses){if(!(state.visualML>=8))return; // nothing to float on
 for(const it of gItems(state)){if(!SURFACE[it.pl])continue;
 const p=gPose(id,state,glasses,it);ctx.save();interior(ctx,id,0);ctx.clip();gPaint(ctx,it,p);ctx.restore()}}
// After the front glass: what is outside the glass, or above the rim opening.
// Painted whole on a scratch layer, then the part inside the glass below the front rim is erased in one
// cut, so there is a single edge (on the rim line) instead of two clip edges meeting with a seam.
// Rebuilt only when a pose, the glass or the canvas changes. Pieces lying across the rim are above the
// glass everywhere and are drawn last, uncut.
let gScratch=null,gKey='';
function garnishOutside(ctx,id,state,glasses){const all=gItems(state),its=all.filter(it=>CROSS[it.pl]);
 if(its.length){
  const W=ctx.canvas.width,H=ctx.canvas.height,T=ctx.getTransform(),ps=its.map(it=>gPose(id,state,glasses,it));
  const key=[id,W,H,T.a,T.b,T.c,T.d,T.e,T.f,...its.map((it,i)=>it.k+':'+ps[i].x.toFixed(1)+','+ps[i].y.toFixed(1)+','+ps[i].rot.toFixed(3))].join('|');
  if(!gScratch)gScratch=document.createElement('canvas');
  if(key!==gKey){if(gScratch.width!==W||gScratch.height!==H){gScratch.width=W;gScratch.height=H}
   const o=gScratch.getContext('2d');o.setTransform(1,0,0,1,0,0);o.clearRect(0,0,W,H);o.setTransform(T);
   its.forEach((it,i)=>{if(it.pl!=='lean'){gPaint(o,it,ps[i]);return}
    // a leaning piece is inside the glass below the rim: never beside the outer wall
    const y0=gy(specs[id].rim.cy);o.save();o.beginPath();o.rect(-2000,-2000,4000,2000+y0);o.clip();gPaint(o,it,ps[i]);o.restore();
    o.save();interior(o,id,0);o.clip();o.beginPath();o.rect(-2000,y0-1.5,4000,4000);o.clip();gPaint(o,it,ps[i]);o.restore()});
   o.save();o.globalCompositeOperation='destination-out';interior(o,id,0);o.clip();rimArc(o,id,true);o.fill();o.restore();gKey=key}
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(gScratch,0,0);ctx.restore()}
 for(const it of all.filter(it=>it.pl==='across').sort((a,b)=>b.ai-a.ai))gPaint(ctx,it,gPose(id,state,glasses,it));
}
function pour(ctx,id,state,t,cap){const p=state.pour;if(!p)return;
 // V9 STIR: the stream comes from the mixing glass spout, drawn by stir-scene.js
 if(p.kind==='strain'&&(state.flow==='stir'&&window.LCStirScene||state.flow==='shake'&&window.LCShakeScene))return;   // the scene draws its own stream
 const z=clamp((t-p.start)/p.duration,0,1),force=Math.sin(Math.PI*z);if(force<=.008)return;
 const pc=Array.isArray(p.color)?p.color:[188,211,217],surface=liquidY(id,state.visualML,cap);
 const hk=window.mixologyHooks,lp=state.portions[state.portions.length-1],sk=.25+.75*clamp(lp&&hk&&hk.byId[lp.id]?(hk.byId[lp.id].op??1):1,0,1);
 const g=specs[id],rimTop=gy(g.rim.cy)-g.rim.ry*SCALE;
 const sx=376,sy0=Math.min(59,rimTop-40),ex=CX+6,ey=surface+2;
 const gr=ctx.createLinearGradient(sx,sy0,ex,ey);gr.addColorStop(0,color(bright(pc,.30),.64*force*sk));gr.addColorStop(.65,color(pc,.85*force*sk));gr.addColorStop(1,color(bright(pc,.16),.95*force*sk));
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
function frontGlass(ctx,id,wet){
 const g=specs[id],im=g.img,gl=g.gloss;
 ctx.save();
 ctx.beginPath();ctx.rect(-200,-200,960,1100);
 interior(ctx,id,0,false);
 ctx.clip('evenodd');
 ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);
 ctx.restore();
 ctx.save();rimBand(ctx,id);ctx.clip();ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();
 ctx.save();
 interior(ctx,id,0);ctx.clip();
 const pass=(a,b,c,d)=>{ // a: screen above floor, b: screen on floor, c/d: gloss above / on floor
  ctx.save();ctx.globalCompositeOperation='screen';
  if(!g.floor){ctx.globalAlpha=a;ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);
   if(gl){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=c;ctx.drawImage(gl,IMG.x,IMG.y,IMG.w,IMG.h)}
   ctx.restore();return}
  // Above the floor the front wall is clear glass: its reflections are fully visible.
  ctx.save();ctx.beginPath();ctx.rect(-200,-200,960,1100);floorEllipse(ctx,id,false);ctx.clip('evenodd');
  ctx.globalAlpha=a;ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);
  if(gl){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=c;ctx.drawImage(gl,IMG.x,IMG.y,IMG.w,IMG.h)}
  ctx.restore();
  // Over the floor the image also contains the (behind) floor itself; keep only a light pass.
  ctx.save();floorEllipse(ctx,id);ctx.clip();
  ctx.globalAlpha=b;ctx.drawImage(im,IMG.x,IMG.y,IMG.w,IMG.h);
  if(gl){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=d;ctx.drawImage(gl,IMG.x,IMG.y,IMG.w,IMG.h)}
  ctx.restore();
  ctx.restore();
 };
 // A drink behind the front wall needs a stronger specular pass than an empty glass.
 // Over a drink the full-image screen pass only adds haze; the highlight pass carries the gloss.
 if(id==='rocks')pass(wet?.4:.62,wet?.22:.34,wet?.78:.35,wet?.38:.16);
 else if(id==='highball')pass(wet?.32:.5,wet?.14:.2,wet?.72:.3,wet?.3:.1);
 else pass(wet?.38:.55,0,wet?.62:.25,0);
 if(g.wall)wallSpecular(ctx,id,wet);
 ctx.restore();
}
// Cylindrical front-wall reflections (V8.3): a wide soft sheen and two narrow window streaks
// that follow the measured wall taper. They sit on the glass, so they cross liquid and ice.
function wallSpecular(ctx,id,wet){
 const g=specs[id],y0=gy(g.rim.cy)+g.rim.ry*SCALE+6,y1=gy(g.floor.cy);
 const streak=(u0,u1,alpha)=>{
  ctx.beginPath();
  for(let y=y0;y<=y1;y+=6)ctx.lineTo(CX+u0*radScreen(id,y),y);
  for(let y=y1;y>=y0;y-=6)ctx.lineTo(CX+u1*radScreen(id,y),y);
  ctx.closePath();
  const f=ctx.createLinearGradient(0,y0,0,y1);
  f.addColorStop(0,'rgba(255,252,244,0)');f.addColorStop(.18,'rgba(255,252,244,'+alpha+')');
  f.addColorStop(.72,'rgba(255,252,244,'+(alpha*.8)+')');f.addColorStop(1,'rgba(255,252,244,0)');
  ctx.fillStyle=f;ctx.fill();
 };
 const k=wet?1:.55;
 ctx.save();ctx.globalCompositeOperation='screen';
 streak(-.66,-.53,.15*k);   // main window reflection, left
 streak(-.47,-.43,.10*k);   // thin secondary line
 streak(.74,.83,.12*k);     // right rim of the cylinder
 streak(-.30,.05,.035*k);   // broad soft sheen across the face
 ctx.restore();
}
function draw(options){const {ctx,state,t,glasses}=options,id=state.glass,g=specs[id];if(!g)return false;
 if(loaded[id]!=='ready')return false;
 const v=view(id);
 ctx.save();ctx.transform(v.s,0,0,v.s,v.tx,v.ty);
 ground(ctx,id);
 // Back: only the inside of the glass (back wall, back rim, floor / bowl).
 ctx.save();interior(ctx,id,0);ctx.clip();ctx.drawImage(g.img,IMG.x,IMG.y,IMG.w,IMG.h);ctx.restore();
 garnishInside(ctx,id,state,glasses);
 liquid(ctx,options);
 if(window.LCIceV8&&g.floor)window.LCIceV8.draw(ctx,state,t,lastLiquid);
 garnishFloat(ctx,id,state,glasses);
 frontGlass(ctx,id,state.visualML>.5);
 garnishOutside(ctx,id,state,glasses);pour(ctx,id,state,t,capOf(state,glasses,id));
 ctx.restore();return true;
}
window.LCArtV5={draw,liquidY,hitTest,
 clipInner:(ctx,id,inset=0)=>{interior(ctx,id,inset);ctx.clip()},
 innerRadius:(id,y,inset=0)=>Math.max(1,radScreen(id,y)-inset),
 frontArc,floor:floorInfo,rim:rimInfo,view,toScene,
 ready:()=>Object.values(loaded).every(x=>x==='ready'),status:id=>loaded[id]||'loading',specs,assetRect:IMG,version:'10.4'};
})();
