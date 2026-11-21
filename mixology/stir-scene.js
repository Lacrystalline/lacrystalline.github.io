/* La Crystalline Mixology V9 — STIR scene.
   Mixing glass, bar spoon, lift-out and strain into the serving glass.

   - Only draws. Recipe, volume, dilution and flowStep stay in index.html / flow-v6.js.
   - The visual phase ("stirScene") is DERIVED from a synchronised epoch timestamp
     (state.stirAnim.startAt), so a viewer who joins mid-way lands in the right phase and a
     finished animation simply shows its final frame. Nothing here writes to Supabase.
   - All mixing-glass contents (liquid, ice, spoon, strainer) are drawn in the glass image's
     own pixel space under ONE transform, so lifting / tilting the glass moves everything.
   - Geometry below comes from projecting the Blender model through the same camera that
     rendered assets/stir/*.webp (see assets/stir/mixing_glass_geometry.json). */
(()=>{
'use strict';
const h=window.mixologyHooks,B=window.mixologyBridge;
if(!h||!B){console.error('stir-scene: hooks unavailable');return}
const s=h.state,TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const inOut=t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const rgba=(c,a)=>'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+a+')';
const mixc=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const lift=(c,q)=>mixc(c,q>=0?[254,246,228]:[4,12,30],Math.abs(q));
const INK=op=>.10+.90*clamp(op,0,1);   // V9.6 tint strength -> paint opacity (clear spirits read as clear)

// ---------- assets ----------
const DIR='./assets/stir/';
const SRC={glass:DIR+'mixing_glass.webp',strainer:DIR+'strainer.webp',spoon:DIR+'bar_spoon.webp',jigger:DIR+'jigger.webp',ice:'./ice-v8-preview/assets/ice-cube.webp'};
const img={},ok={};
for(const [k,src] of Object.entries(SRC)){const im=new Image();im.decoding='async';
 im.onload=()=>{if(k==='glass')buildGloss();ok[k]=true};im.onerror=()=>console.warn('stir-scene: cannot load',src);im.src=src;img[k]=im}
const ready=()=>ok.glass&&ok.spoon&&ok.ice;
// Highlight-only copy of the glass (same idea as the V8.3 serving glasses): bright pixels keep
// their opacity, so the cut facets and rim reflections can sit IN FRONT of the drink and ice.
let gloss=null;
function buildGloss(){
 try{const im=img.glass,c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){const l=Math.max(p[i],p[i+1],p[i+2])/255,k=Math.min(1,Math.max(0,(l-.6)/.36));p[i+3]=p[i+3]*k*k*(3-2*k)}
  x.putImageData(d,0,0);gloss=c;
 }catch(e){console.warn('stir-scene: gloss layer unavailable',e)}
}

// ---------- geometry (mixing_glass.webp pixels, 1086 x 1448) ----------
// Measured on the artwork: rim = ellipse fitted to the gold rim ring (inner edge), floor = the
// inner floor ellipse above the thick base, spout = outer tip of the gold lip.
const G={cx:551,rim:{cy:201.4,rx:358,ry:73.5,hw:371,band:10},floor:{cy:1136,rx:312,ry:81},baseFront:1386,
 spout:[106,250],pivot:[551,760]};
// Strainer artwork (strainer.webp crop): dish rim ellipse centre / radii
const STR={cx:331,cy:209.5,rx:305,ry:69};
const DIM={R:.045,T:.0036,H:.135,HB:.022},RHO=DIM.R-DIM.T,AREA=Math.PI*RHO*RHO;      // m, m^2
// Visual volume of the mixing glass: treated as a ~350 ml working volume so a 60-200 ml drink
// reads clearly around the ice (a real 600 ml Yarai would leave the liquid hidden under it).
const ML_PER_M=AREA*1e6*.56;
// height (m above ground) -> projected ellipse in image px
function ell(z){const f=(z-DIM.HB)/(DIM.H-DIM.HB);
 return {cy:lerp(G.floor.cy,G.rim.cy,f),rx:lerp(G.floor.rx,G.rim.rx,f),ry:lerp(G.floor.ry,G.rim.ry,f)}}
// 3D point (x right, y towards the back, z up; metres) -> image px
function proj(x,y,z){const e=ell(z);return [G.cx+x*e.rx/RHO,e.cy-y*e.ry/RHO]}
// Spoon sprite (bar_spoon.webp crop): axis x 81, bowl centre y 1330, teardrop tip y 8.
const SP={ax:81,bowl:1330,tip:8,len:1322,pxPerM:1322/.2765,scale:.86};
const SPOON_M=.2765*SP.scale;
// Stage placement (canvas logical coords, same ground line as the V8.3 serving glasses)
const K=.31,GROUND=580;
const REST={x:280,y:GROUND-(G.baseFront-G.pivot[1])*K,rot:0,sc:1,alpha:1};

// ---------- timings (ms) ----------
const T={enter:550,stir:2400,decel:400,withdraw:500,tilt:250,exit:750,swap:250};
T.stirEnd=T.enter+T.stir;                       // 2950: processing ends, dilution applied once
T.exitStart=T.stirEnd;                          // spoon slows, then withdraws
T.liftStart=T.exitStart+T.decel+T.withdraw;     // 3850
T.leave=T.liftStart+T.tilt;                     // 4100
T.swapStart=T.leave+T.exit;                     // 4850
T.end=T.swapStart+T.swap;                       // 5100
const ST={enter:650,pour:1450,exit:650};
ST.pourStart=ST.enter;ST.pourEnd=ST.enter+ST.pour;ST.end=ST.pourEnd+ST.exit;     // 2750
const W_SPIN=2.35*TAU/1000;                     // rad per ms while stirring

// ---------- state helpers ----------
let frozen=null;                                  // test hook: freeze the visual clock
const now=()=>frozen===null?(window.mixologyClock?window.mixologyClock():Date.now()):frozen;   // bartender's clock on viewers
function anim(kind){const a=s.stirAnim;return a&&a.kind===kind?a:null}
function elapsed(a){return a?now()-Number(a.startAt||0):Infinity}
function inStir(){return s.flow==='stir'}
function busy(){
 if(!inStir())return false;
 const a=s.stirAnim;if(!a)return false;
 if(a.kind==='stir')return (s.flowStep==='ready'||s.flowStep==='preparing')&&elapsed(a)<T.end;
 if(a.kind==='strain')return elapsed(a)<ST.end;
 return false;
}
// The derived visual phase ("stirScene"). flowStep stays the recipe truth; this is only the picture.
function phase(){
 if(!inStir())return null;
 const a=s.stirAnim,e=elapsed(a);
 if(s.flowStep==='preparing'){
  if(a&&a.kind==='stir'&&s.processing){return e<T.enter?'spoon_enter':'stirring'}
  return 'prep';
 }
 if(s.flowStep==='ready'){
  if(a&&a.kind==='stir'&&e<T.end){return e<T.liftStart?'spoon_exit':e<T.swapStart?'glass_lift':'service_ready'}
  return 'service_ready';
 }
 if(a&&a.kind==='strain'&&e<ST.end)return 'straining';
 return 'finished';
}

// ---------- recipe -> layers (mirrors index.html getLayers, prep-vessel volumes) ----------
function layersFor(visualMl){
 const items=[];let left=visualMl;
 for(const p of s.portions){
  if(left<=.0001)break;const ml=Math.min(p.ml,left);left-=ml;
  const info=h.byId[p.id];if(!info)continue;
  const L=h.lookOf(p);
  items.push({id:p.id,locked:!!p.lockedColor,ml,spec:L.spec,haze:L.haze,color:L.color,op:L.op,density:p.lockedDensity??info.density});
 }
 const vol=items.reduce((a,p)=>a+p.ml,0);
 // same spectral Beer-Lambert blend as index.html (butterfly pea reacts to the blend's pH there)
 const M=vol?h.mixLook(items):{color:[236,242,240],op:1};
 return {layers:items.sort((a,b)=>b.density-a.density),avg:M.color,op:M.op,vol};
}

// ---------- ice ----------
const CUBE=.026,CUBE_ML=CUBE*CUBE*CUBE*1e6;
const CUBES=[[.50,.20,.0135,.3],[.52,2.25,.0135,-.5],[.48,4.25,.0135,.9],[.42,1.20,.0395,-.2],[.46,3.25,.0395,.6],[.40,5.30,.0395,-.8],[.16,.70,.0645,.2]];
function iceList(rot,spin,drop){
 if(!s.prepIce)return [];
 return CUBES.map(([r,a,z,r0],i)=>{
  const d=drop?clamp((drop-i*70)/420,0,1):1;
  const fall=d<1?(1-smooth(d))*.11:0;
  const bounce=d<1?0:0;
  const ang=a+rot;
  return {x:r*RHO*Math.cos(ang),y:r*RHO*Math.sin(ang),z:DIM.HB+z+fall+bounce+Math.sin(spin*.7+i)*.0006*Math.min(1,Math.abs(spin)),
   rot:r0+spin*.22+i*.4,visible:d>0||!drop};
 });
}
function iceSubmerged(hm){ // ice volume below the liquid line (ml)
 if(!s.prepIce)return 0;let v=0;
 for(const [,, z] of CUBES){const lo=DIM.HB+z-CUBE/2;v+=CUBE_ML*.56*clamp((DIM.HB+hm-lo)/CUBE,0,1)}
 return v;
}
function levelFor(ml){ // liquid height above the floor (m), with the ice displacing the drink
 let hm=ml/ML_PER_M;
 for(let i=0;i<8;i++)hm=(ml+iceSubmerged(hm))/ML_PER_M;
 return hm;
}

// ---------- spoon ----------
function spoonPose(theta,inset){ // inset: metres slid back out along the shaft (0 = bowl at the bottom)
 const zb=DIM.HB+.0118,rs=.62*RHO;
 const pb=[rs*Math.cos(theta),rs*Math.sin(theta),zb];
 const pr=[.22*RHO*Math.cos(theta)+.32*RHO,.22*RHO*Math.sin(theta)+.12*RHO,DIM.H];
 const d=[pr[0]-pb[0],pr[1]-pb[1],pr[2]-pb[2]],n=Math.hypot(...d);d[0]/=n;d[1]/=n;d[2]/=n;
 const b=[pb[0]+d[0]*inset,pb[1]+d[1]*inset,pb[2]+d[2]*inset];
 const tp=[b[0]+d[0]*SPOON_M,b[1]+d[1]*SPOON_M,b[2]+d[2]*SPOON_M];
 return {bowl:proj(...b),top:proj(...tp),depth:b[1]};
}
function drawSpoon(c,p){
 const dx=p.top[0]-p.bowl[0],dy=p.top[1]-p.bowl[1],L=Math.hypot(dx,dy);
 c.save();c.translate(p.bowl[0],p.bowl[1]);c.rotate(Math.atan2(dx,-dy));
 const w=SP.scale*(G.rim.rx/RHO)/SP.pxPerM;
 c.scale(w,L/SP.len);c.drawImage(img.spoon,-SP.ax,-SP.bowl);c.restore();
}

// ---------- reusable offscreen layers ----------
const layers={};
function layer(name,ref){let c=layers[name];if(!c){c=document.createElement('canvas');layers[name]=c}
 if(c.width!==ref.width||c.height!==ref.height){c.width=ref.width;c.height=ref.height}
 const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.clearRect(0,0,c.width,c.height);return x}

// ---------- interior outline (image px) ----------
function interior(c,inset=0,fresh=true){
 const N=40,r=G.rim,f=G.floor;if(fresh)c.beginPath();
 for(let i=0;i<=N;i++){const u=-1+2*i/N;(i?c.lineTo:c.moveTo).call(c,G.cx+u*(r.rx-inset),r.cy-r.ry*Math.sqrt(1-u*u))}
 c.lineTo(G.cx+f.rx-inset,f.cy);
 for(let i=N;i>=0;i--){const u=-1+2*i/N;c.lineTo(G.cx+u*(f.rx-inset),f.cy+f.ry*Math.sqrt(1-u*u)-inset*.4)}
 c.closePath();
}
const Q=[[G.cx-G.rim.rx,G.rim.cy],[G.cx+G.rim.rx,G.rim.cy],[G.cx+G.floor.rx,G.floor.cy],[G.cx-G.floor.rx,G.floor.cy]];
const polyArea=p=>{let a=0;for(let i=0;i<p.length;i++){const [x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length];a+=x1*y2-x2*y1}return Math.abs(a)/2};
function clipHalf(poly,d,c){ // keep dot(p,d) >= c
 const out=[];for(let i=0;i<poly.length;i++){const P=poly[i],N=poly[(i+1)%poly.length];
  const a=P[0]*d[0]+P[1]*d[1]-c,b=N[0]*d[0]+N[1]*d[1]-c;
  if(a>=0)out.push(P);if((a>=0)!==(b>=0)){const t=a/(a-b);out.push([P[0]+(N[0]-P[0])*t,P[1]+(N[1]-P[1])*t])}}
 return out;
}

// ---------- liquid (upright, layered, with swirl) ----------
function frontY(z,x){const e=ell(z),u=clamp((x-G.cx)/e.rx,-1,1);return e.cy+e.ry*Math.sqrt(1-u*u)}
function drawUprightLiquid(c,o){
 const {mlv,mix,spin,speed,t,impact}=o;if(mlv<=.3)return null;
 const L=layersFor(mlv),hm=levelFor(mlv),zs=DIM.HB+hm,es=ell(zs);
 const wob=(x,k)=>{const u=clamp((x-G.cx)/es.rx,-1,1),env=Math.pow(1-u*u,1.4);
  return env*k*((.6+impact*5)*Math.sin((x-G.cx)*.03-t*.006)+speed*3*Math.sin((x-G.cx)*.05+spin*1.3))};
 c.save();interior(c,-5);c.clip();
 // bands bottom -> top, boundaries at volume-proportional heights
 let acc=0;const bands=[];
 for(const p of L.layers){const zl=DIM.HB+hm*acc/L.vol;acc+=p.ml;const zu=DIM.HB+hm*acc/L.vol;bands.push({zl,zu,color:mixc(p.color,L.avg,mix),k:INK(lerp(p.op,L.op,mix))})}
 bands.forEach((b,i)=>{
  const top=i===bands.length-1,eu=ell(b.zu),el=ell(b.zl),r1=eu.rx+3,r2=i===0?0:Math.min(r1,el.rx+3);
  const swirlK=(1-mix)*speed*7;
  c.beginPath();
  for(let j=0;j<=48;j++){const x=G.cx-r1+2*r1*j/48;c.lineTo(x,frontY(b.zu,x)+(top?wob(x,.8):Math.sin(x*.045+spin*1.7+i)*swirlK))}
  c.lineTo(G.cx+r1,1700);c.lineTo(G.cx+r2,1700);
  if(r2>0)for(let j=48;j>=0;j--){const x=G.cx-r2+2*r2*j/48;c.lineTo(x,frontY(b.zl,x)+Math.sin(x*.045+spin*1.7+i-1)*swirlK)}
  c.lineTo(G.cx-r2,1700);c.lineTo(G.cx-r1,1700);c.closePath();
  const g=c.createLinearGradient(G.cx-r1,0,G.cx+r1,0);
  g.addColorStop(0,rgba(lift(b.color,-.42),.80*b.k));g.addColorStop(.2,rgba(lift(b.color,-.06),.84*b.k));g.addColorStop(.45,rgba(lift(b.color,.12),.86*b.k));
  g.addColorStop(.75,rgba(lift(b.color,.02),.85*b.k));g.addColorStop(1,rgba(lift(b.color,-.40),.80*b.k));
  c.fillStyle=g;c.fill();
 });
 // stirring: colour tendrils of the lower layers spiral up and fade as the drink becomes one
 if(speed>.02&&mix<.995&&bands.length>1){
  for(let i=0;i<bands.length-1;i++)for(let j=0;j<2;j++){
   c.beginPath();
   for(let k=0;k<=40;k++){const q=k/40,z=lerp(bands[i].zu,zs,q*.92),e=ell(z),a=spin*.85+q*3.4+j*Math.PI+i;
    c.lineTo(G.cx+e.rx*.72*Math.cos(a),e.cy+e.ry*.9*Math.sin(a))}
   c.strokeStyle=rgba(lift(bands[i].color,.08),.42*bands[i].k*(1-mix)*Math.min(1,speed*1.6));c.lineWidth=24;c.lineCap='round';c.stroke();
  }
 }
 // free surface (V8.3 treatment) + vortex while stirring
 const top=mixc(bands[bands.length-1].color,L.avg,mix),tk=bands[bands.length-1].k,rx=es.rx+3,ry=es.ry;
 const back=x=>{const u=clamp((x-G.cx)/rx,-1,1);return es.cy-ry*Math.sqrt(1-u*u)+wob(x,.3)};
 const front=x=>frontY(zs,x)+wob(x,.8);
 c.beginPath();for(let j=0;j<=64;j++){const x=G.cx-rx+2*rx*j/64;c.lineTo(x,back(x))}
 for(let j=64;j>=0;j--){const x=G.cx-rx+2*rx*j/64;c.lineTo(x,front(x))}c.closePath();
 const pl=c.createLinearGradient(0,es.cy-ry,0,es.cy+ry);
 pl.addColorStop(0,rgba(lift(top,.22),.70*tk));pl.addColorStop(.5,rgba(lift(top,.06),.74*tk));pl.addColorStop(1,rgba(lift(top,.12),.80*tk));
 c.fillStyle=pl;c.fill();
 c.save();c.clip();
 if(speed>.02){
  const dip=c.createRadialGradient(G.cx,es.cy+ry*.05,2,G.cx,es.cy,rx*.62);
  dip.addColorStop(0,rgba(lift(top,-.45),.30*speed));dip.addColorStop(.55,rgba(lift(top,-.2),.12*speed));dip.addColorStop(1,rgba(top,0));
  c.fillStyle=dip;c.fillRect(G.cx-rx,es.cy-ry,rx*2,ry*2);
  for(let k=0;k<6;k++){const rr=.30+k*.11,a0=spin*(1.25-k*.12)+k*1.7;
   c.beginPath();c.ellipse(G.cx,es.cy,rx*rr,ry*rr,0,a0,a0+1.15);
   c.strokeStyle='rgba(255,250,236,'+(.30*speed*(1-k*.1))+')';c.lineWidth=2.4;c.stroke()}
 }
 const gl=c.createRadialGradient(G.cx-rx*.48,es.cy-ry*.15,0,G.cx-rx*.48,es.cy-ry*.15,rx*.42);
 gl.addColorStop(0,'rgba(255,252,240,.34)');gl.addColorStop(1,'rgba(255,252,240,0)');
 c.save();c.translate(0,es.cy);c.scale(1,.35);c.translate(0,-es.cy);c.fillStyle=gl;c.fillRect(G.cx-rx,es.cy-ry*3,rx*2,ry*6);c.restore();
 c.restore();
 const line=(f,a,w)=>{c.beginPath();for(let j=0;j<=60;j++){const x=G.cx-rx+2*rx*j/60;c.lineTo(x,f(x))}
  const g=c.createLinearGradient(G.cx-rx,0,G.cx+rx,0);g.addColorStop(0,'rgba(255,250,238,0)');g.addColorStop(.5,'rgba(255,250,238,'+a+')');g.addColorStop(1,'rgba(255,250,238,0)');
  c.strokeStyle=g;c.lineWidth=w;c.stroke()};
 line(back,.32,2);line(front,.46,3);
 c.restore();
 return {surfaceY:es.cy,ratio:ry/rx,bands,top,zs};
}

// ---------- liquid (tilted glass, one colour) ----------
function drawTiltedLiquid(c,o){
 const {mlv,rot,color}=o;if(mlv<=.3)return null;
 const hm=levelFor(mlv),frac=clamp(hm/(DIM.H-DIM.HB),0,1),target=polyArea(Q)*frac;
 const d=[Math.sin(rot),Math.cos(rot)],dots=Q.map(p=>p[0]*d[0]+p[1]*d[1]);
 let lo=Math.min(...dots),hi=Math.max(...dots);
 for(let i=0;i<34;i++){const m=(lo+hi)/2;if(polyArea(clipHalf(Q,d,m))>target)lo=m;else hi=m}
 const cut=(lo+hi)/2,wet=clipHalf(Q,d,cut);if(wet.length<3)return null;
 // chord of the free surface inside the glass
 const pts=[];for(let i=0;i<Q.length;i++){const P=Q[i],N=Q[(i+1)%Q.length],a=P[0]*d[0]+P[1]*d[1]-cut,b=N[0]*d[0]+N[1]*d[1]-cut;
  if((a>=0)!==(b>=0)){const t=a/(a-b);pts.push([P[0]+(N[0]-P[0])*t,P[1]+(N[1]-P[1])*t])}}
 const ang=Math.atan2(-d[0],d[1]);   // world-horizontal direction in local coords
 let m=null,major=0,minor=0;
 if(pts.length>=2){m=[(pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2];major=Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1])/2;
  const f=clamp((m[1]-G.floor.cy)/(G.rim.cy-G.floor.cy),0,1);minor=lerp(G.floor.ry,G.rim.ry,f)*Math.min(1,major/G.rim.rx+.15)}
 if(!m){m=[wet.reduce((a,p)=>a+p[0],0)/wet.length,wet.reduce((a,p)=>a+p[1],0)/wet.length]}
 const far=3000,e=[Math.cos(ang),Math.sin(ang)];
 c.save();interior(c,-5);c.clip();
 // body = the wet side of the free surface inside the glass, minus the surface ellipse itself
 c.beginPath();
 c.moveTo(m[0]-e[0]*far,m[1]-e[1]*far);c.lineTo(m[0]+e[0]*far,m[1]+e[1]*far);
 c.lineTo(m[0]+e[0]*far+d[0]*far,m[1]+e[1]*far+d[1]*far);c.lineTo(m[0]-e[0]*far+d[0]*far,m[1]-e[1]*far+d[1]*far);c.closePath();
 if(major>1)c.ellipse(m[0],m[1],major,minor,ang,0,TAU);
 c.fillStyle=rgba(lift(color,.04),.84);c.fill('evenodd');
 if(major>1){c.beginPath();c.ellipse(m[0],m[1],major,minor,ang,0,TAU);c.fillStyle=rgba(lift(color,.16),.74);c.fill();
  c.strokeStyle='rgba(255,250,238,.32)';c.lineWidth=2.4;c.stroke()}
 c.restore();
 return {cut,d,m,ang,color};
}

// ---------- contents layer: ice + spoon, tinted where they are under the drink ----------
function drawContents(ctx,base,o){
 const c=layer('contents',ctx.canvas);c.setTransform(ctx.getTransform());
 const items=[];
 const W=CUBE*G.rim.rx/RHO*1.34,Hh=W*img.ice.height/img.ice.width;
 for(const q of o.ice)if(q.visible)items.push({depth:q.y,clip:true,draw:()=>{const p=q.px||proj(q.x,q.y,q.z);
  c.save();c.translate(p[0],p[1]);c.rotate(q.rot);c.drawImage(img.ice,-W/2,-Hh/2,W,Hh);c.restore()}});
 if(o.spoon)items.push({depth:o.spoon.depth,clip:false,draw:()=>drawSpoon(c,o.spoon)});
 items.sort((a,b)=>b.depth-a.depth);
 // ice stays inside the glass; the spoon shaft leaves through the mouth, so it is not clipped
 for(const it of items){if(!it.clip){it.draw();continue}c.save();interior(c,6);c.clip();it.draw();c.restore()}
 if(o.liquid){
  c.save();c.globalCompositeOperation='source-atop';
  if(o.liquid.bands){
   for(const b of o.liquid.bands){c.beginPath();
    for(let x=G.cx-420;x<=G.cx+420;x+=12)c.lineTo(x,b===o.liquid.bands[o.liquid.bands.length-1]?o.liquid.surfaceY:frontY(b.zu,x));
    for(let x=G.cx+420;x>=G.cx-420;x-=12)c.lineTo(x,b===o.liquid.bands[0]?1800:frontY(b.zl,x));
    c.closePath();c.fillStyle=rgba(b.color,.40);c.fill()}
   c.fillStyle='rgba(255,250,236,.30)';c.fillRect(G.cx-420,o.liquid.surfaceY-1.5,840,3);
  }else if(o.liquid.m){
   const {cut,d}=o.liquid,far=3000,mm=o.liquid.m,e=[Math.cos(o.liquid.ang),Math.sin(o.liquid.ang)];
   c.beginPath();c.moveTo(mm[0]-e[0]*far,mm[1]-e[1]*far);c.lineTo(mm[0]+e[0]*far,mm[1]+e[1]*far);
   c.lineTo(mm[0]+e[0]*far+d[0]*far,mm[1]+e[1]*far+d[1]*far);c.lineTo(mm[0]-e[0]*far+d[0]*far,mm[1]-e[1]*far+d[1]*far);c.closePath();
   c.fillStyle=rgba(o.liquid.color,.40);c.fill();
  }
  c.restore();
 }
 // the long shaft fades into the dark above the stage instead of being cut by the canvas edge
 if(o.spoon){c.save();c.setTransform(base);c.globalCompositeOperation='destination-out';
 const f=c.createLinearGradient(0,0,0,118);f.addColorStop(0,'rgba(0,0,0,1)');f.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=f;c.fillRect(-50,-50,700,168);c.restore()}
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(c.canvas,0,0);ctx.restore();
}

// ---------- one complete mixing-glass picture under a pose ----------
function placeGlass(c,pose){
 c.translate(pose.x,pose.y);c.rotate(pose.rot);c.scale(K*pose.sc,K*pose.sc);c.translate(-G.pivot[0],-G.pivot[1]);
}
// The rim band of the artwork (gold ring + front lip) must sit over the drink, ice and strainer.
function rimBand(c){const r=G.rim,N=48;c.beginPath();
 for(let i=0;i<=N;i++){const u=-1+2*i/N;c.lineTo(G.cx+u*r.hw,r.cy+r.ry*Math.sqrt(1-u*u)-r.band)}
 for(let i=N;i>=0;i--){const u=-1+2*i/N;c.lineTo(G.cx+u*r.hw,r.cy+r.ry*Math.sqrt(1-u*u)+r.band)}
 c.closePath()}
function drawStrainer(c){
 if(!ok.strainer)return;
 // the dish sits just inside the mouth, a touch smaller than the bore; the handle rests over the right rim
 const s=(G.rim.rx*.84)/STR.rx;
 c.save();c.translate(G.cx-8,G.rim.cy+46);c.rotate(-.05);c.scale(s,s);
 c.drawImage(img.strainer,-STR.cx,-STR.cy);c.restore();
}
function drawGlassScene(ctx,base,pose,o){
 const im=img.glass,wet=o.mlv>.5;
 ctx.save();placeGlass(ctx,pose);
 // back: only the inside of the glass (back wall, back rim, cut facets seen through, floor)
 ctx.save();interior(ctx,0);ctx.clip();ctx.drawImage(im,0,0);ctx.restore();
 const liq=o.tilted?drawTiltedLiquid(ctx,o):drawUprightLiquid(ctx,o);
 drawContents(ctx,base,{ice:o.ice,spoon:o.spoon,liquid:liq});
 if(o.strainer)drawStrainer(ctx);
 // front: everything outside the inner silhouette (walls, base, lip) + the front rim band
 ctx.save();ctx.beginPath();ctx.rect(-600,-600,2400,2800);interior(ctx,0,false);ctx.clip('evenodd');ctx.drawImage(im,0,0);ctx.restore();
 ctx.save();rimBand(ctx);ctx.clip();ctx.drawImage(im,0,0);ctx.restore();
 // inside the silhouette the front wall only adds light: its facets glint over drink and ice
 ctx.save();interior(ctx,0);ctx.clip();
 ctx.globalCompositeOperation='screen';ctx.globalAlpha=wet?.36:.5;ctx.drawImage(im,0,0);
 if(gloss){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=wet?.62:.3;ctx.drawImage(gloss,0,0)}
 ctx.restore();
 ctx.restore();
}
function shadow(ctx,amount){
 if(amount<=.01)return;
 const g=ctx.createRadialGradient(280,GROUND+4,6,280,GROUND+4,150);
 g.addColorStop(0,'rgba(2,6,12,'+(.62*amount)+')');g.addColorStop(.6,'rgba(0,7,19,'+(.24*amount)+')');g.addColorStop(1,'rgba(0,5,13,0)');
 ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(280,GROUND+4,150,22,0,0,TAU);ctx.fill();
}
function withFade(ctx,base,alpha,fn){
 const c=layer('scene',ctx.canvas);c.setTransform(base);fn(c);
 // soften the canvas border so an object leaving the stage dissolves instead of being cut
 // (in screen space: the stage may be zoomed out while straining)
 c.setTransform(c.canvas.width/560,0,0,c.canvas.height/620,0,0);
 c.globalCompositeOperation='destination-in';
 const gx=c.createLinearGradient(0,0,560,0);gx.addColorStop(0,'rgba(0,0,0,0)');gx.addColorStop(.09,'#000');gx.addColorStop(.91,'#000');gx.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=gx;c.fillRect(-10,-10,580,640);
 const gy=c.createLinearGradient(0,0,0,620);gy.addColorStop(0,'rgba(0,0,0,0)');gy.addColorStop(.1,'#000');gy.addColorStop(1,'#000');
 c.fillStyle=gy;c.fillRect(-10,-10,580,640);
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=alpha;ctx.drawImage(c.canvas,0,0);ctx.restore();
}

// ---------- spin integration (closed form, so every client agrees) ----------
function spinAt(a,e){
 const th0=Number(a.theta0)||0,s0=e-T.enter;
 if(s0<=0)return {theta:th0,speed:0};
 const tau=180,sp=Math.min(s0,T.stir);
 let theta=th0+W_SPIN*(sp-tau*(1-Math.exp(-sp/tau))),speed=1-Math.exp(-sp/tau);
 if(s0>T.stir){const d=Math.min(s0-T.stir,T.decel+T.withdraw),td=150;theta+=W_SPIN*td*(1-Math.exp(-d/td));speed=Math.exp(-d/td)}
 return {theta,speed};
}

// ---------- pours into the mixing glass ----------
const local={iceSeenAt:0,iceWas:false,drag:null,manualSpeed:0,lastManual:0};
// Each ingredient is measured in the jigger and tipped into the mixing glass:
// the jigger comes in over the mouth, tips past horizontal, the stream falls in, then it rights itself and leaves.
// Jigger artwork (jigger.webp, 597 x 1116): large-cup rim ellipse, foot, rotation pivot.
const JG={cx:298,rim:{cy:140,rx:284,ry:128},foot:1106,pivot:[298,560]},JK=.198;
const PREP={enter:.22,pourA:.30,pourB:.80};          // fractions of the prep pour duration
function prepQ(){const p=s.prepPour;return p?clamp((performance.now()-p.start)/p.duration,0,1):1}
function prepStreamQ(q){return clamp((q-PREP.pourA)/(PREP.pourB+.05-PREP.pourA),0,1)}
function prepVisualMl(){
 const p=s.prepPour,vol=h.total();
 if(!p)return vol;
 const u=clamp((prepStreamQ(prepQ())-.08)/.86,0,1),e=u*u*(3-2*u);   // rises only once the stream has landed
 return p.from+(p.to-p.from)*e;
}
function mouthOf(pose){ // canvas-space mouth of the upright mixing glass
 const k=K*pose.sc;
 return {x:pose.x+(G.cx-G.pivot[0])*k,back:pose.y+(G.rim.cy-G.rim.ry-G.pivot[1])*k,cy:pose.y+(G.rim.cy-G.pivot[1])*k,r:G.rim.rx*k};
}
function jiggerLip(rot){ // lowest point of the tipped rim ellipse, in artwork pixels
 const f=Math.atan2(JG.rim.ry*Math.cos(rot),JG.rim.rx*Math.sin(rot));
 return [JG.cx+JG.rim.rx*Math.cos(f),JG.rim.cy+JG.rim.ry*Math.sin(f)];
}
function jiggerAt(L,rot){ // pose whose pouring lip sits on L
 const lp=jiggerLip(rot),vx=(lp[0]-JG.pivot[0])*JK,vy=(lp[1]-JG.pivot[1])*JK,c=Math.cos(rot),sn=Math.sin(rot);
 return {x:L[0]-(vx*c-vy*sn),y:L[1]-(vx*sn+vy*c),rot,alpha:1};
}
function jiggerPose(q,m){
 const L=[m.x+m.r*.22,m.back-12],off={x:m.x+300,y:m.back-250,rot:-.35,alpha:1};
 if(q<PREP.enter){const u=inOut(q/PREP.enter),P=jiggerAt(L,-1.25);
  return {x:lerp(off.x,P.x,u),y:lerp(off.y,P.y,u),rot:lerp(off.rot,P.rot,u),alpha:1}}
 if(q<PREP.pourA)return jiggerAt(L,lerp(-1.25,-1.95,inOut((q-PREP.enter)/(PREP.pourA-PREP.enter))));
 if(q<PREP.pourB)return jiggerAt(L,lerp(-1.95,-2.2,smooth((q-PREP.pourA)/(PREP.pourB-PREP.pourA))));
 const u=inOut((q-PREP.pourB)/(1-PREP.pourB)),P=jiggerAt(L,-2.2);
 return {x:lerp(P.x,off.x,u),y:lerp(P.y,off.y,u),rot:lerp(P.rot,off.rot,u),alpha:1-smooth((u-.6)/.4)};
}
function drawJigger(ctx,jp,col,full,op=1){
 if(!ok.jigger)return;
 ctx.save();ctx.globalAlpha=jp.alpha;ctx.translate(jp.x,jp.y);ctx.rotate(jp.rot);ctx.scale(JK,JK);ctx.translate(-JG.pivot[0],-JG.pivot[1]);
 ctx.drawImage(img.jigger,0,0);
 if(full>.01){ // the measure brimming in the cup while it is carried in
  const r=JG.rim;ctx.beginPath();ctx.ellipse(JG.cx,r.cy+6,r.rx*.9,r.ry*.84,0,0,TAU);ctx.clip();
  const g=ctx.createLinearGradient(0,r.cy-r.ry,0,r.cy+r.ry);const jk=INK(op);g.addColorStop(0,rgba(lift(col,.25),.92*full*jk));g.addColorStop(1,rgba(lift(col,-.12),.92*full*jk));
  ctx.fillStyle=g;ctx.fillRect(JG.cx-r.rx,r.cy-r.ry,r.rx*2,r.ry*2);
  ctx.strokeStyle='rgba(255,252,240,'+(.35*full)+')';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(JG.cx-r.rx*.2,r.cy-r.ry*.25,r.rx*.45,r.ry*.3,0,Math.PI*1.05,Math.PI*1.6);ctx.stroke();
 }
 ctx.restore();
}
function drawPrepPour(ctx,pose,mlv,t){
 const p=s.prepPour;if(!p)return;
 const q=prepQ(),m=mouthOf(pose),col=Array.isArray(p.color)?p.color:[190,215,220];
 const jp=jiggerPose(q,m),sq=prepStreamQ(q);
 const hm=levelFor(Math.max(mlv,.5)),e=ell(DIM.HB+hm);
 const tg={x:m.x,y:pose.y+(e.cy-G.pivot[1])*K*pose.sc,mouth:m.back,r:e.rx*K*pose.sc};
 const full=q<PREP.enter?1:1-clamp((jp.rot+1.25)/-.6,0,1);
  const lastP=s.portions[s.portions.length-1],pop=lastP&&h.byId[lastP.id]?(h.byId[lastP.id].op??1):1;
 if(sq>0&&sq<1)drawStream(ctx,(()=>{const lp=jiggerLip(jp.rot),vx=(lp[0]-JG.pivot[0])*JK,vy=(lp[1]-JG.pivot[1])*JK,c=Math.cos(jp.rot),sn=Math.sin(jp.rot);return [jp.x+vx*c-vy*sn,jp.y+vx*sn+vy*c]})(),tg,sq,t,col,.72,pop);
 drawJigger(ctx,jp,col,full,pop);
}
function prepLanding(){const p=s.prepPour;if(!p)return 0;const sq=prepStreamQ(prepQ());return sq>.1&&sq<.95?.6:0}

// ---------- the frame entry point ----------
function frame(ctx,t,drawServing){
 const ph=phase();if(!ph||!ready())return false;
 const base=ctx.getTransform(),a=s.stirAnim,e=elapsed(a);
 if(ph==='finished'||(ph==='service_ready'&&!(a&&a.kind==='stir'&&e<T.end)))return false;
 if(s.prepIce&&!local.iceWas)local.iceSeenAt=performance.now();
 local.iceWas=s.prepIce;
 const iceDrop=local.iceSeenAt?performance.now()-local.iceSeenAt:1e9;
 if(ph==='prep'||ph==='spoon_enter'||ph==='stirring'||ph==='spoon_exit'||ph==='glass_lift'){
  let theta=0,speed=0,spoon=null,pose={...REST},mix=0;
  const mlv=ph==='prep'?prepVisualMl():h.total();
  if(ph==='prep'){
   mix=clamp(s.mix,0,1);
   const m=s.stirManual;
   if(m&&s.mix>0){theta=Number(m.theta)||0;
    const recent=now()-(Number(m.at)||0)<450;
    speed=local.drag?local.manualSpeed:(recent?.55:0);
    spoon=spoonPose(theta,0);}
  }else{
   const sp=spinAt(a,e);theta=sp.theta;speed=sp.speed;
   const from=clamp(Number(a.mixFrom)||0,0,1);
   mix=ph==='spoon_enter'?from:ph==='stirring'?from+(1-from)*smooth((e-T.enter)/T.stir):1;
   if(ph==='spoon_enter')spoon=spoonPose(theta,(1-inOut(e/T.enter))*.17);
   else if(ph==='stirring')spoon=spoonPose(theta,0);
   else if(e<T.liftStart){const w=e-T.exitStart-T.decel;spoon=w<0?spoonPose(theta,0):spoonPose(theta,inOut(w/T.withdraw)*.19);
    if(w>T.withdraw*.98)spoon=null}
   if(ph==='glass_lift'){
    const lt=e-T.liftStart;
    if(lt<T.tilt){const q=inOut(lt/T.tilt);pose.rot=-.075*q;pose.y-=7*q}
    else{const q=inOut((lt-T.tilt)/T.exit),u=1-q;
     // cubic Bezier: a short lift first, then the weight swings up and away to the right
     const P=[[0,-7],[18,-60],[150,-180],[350,-270]];
     pose.x+=u*u*u*P[0][0]+3*u*u*q*P[1][0]+3*u*q*q*P[2][0]+q*q*q*P[3][0];
     pose.y+=u*u*u*P[0][1]+3*u*u*q*P[1][1]+3*u*q*q*P[2][1]+q*q*q*P[3][1];
     pose.rot=-.075-.125*q;pose.sc=1-.08*q;pose.alpha=1-smooth((q-.62)/.38)}
   }
  }
  const ice=iceList(theta*.32,theta,ph==='prep'?iceDrop:0);
  const o={mlv,mix,spin:theta,speed,t,impact:ph==='prep'?prepLanding():0,ice,spoon,tilted:ph==='glass_lift'&&Math.abs(pose.rot)>.001,rot:pose.rot,color:layersFor(mlv).avg};
  const lifted=ph==='glass_lift'?clamp((e-T.liftStart)/(T.tilt+T.exit*.5),0,1):0;
  shadow(ctx,1-lifted);
  if(ph==='glass_lift')withFade(ctx,base,pose.alpha,c=>drawGlassScene(c,base,pose,o));
  else drawGlassScene(ctx,base,pose,o);
  if(ph==='prep')drawPrepPour(ctx,pose,mlv,t);
  return true;
 }
 if(ph==='service_ready'){
  // the serving glass fades in where the mixing glass stood - no blank frame, no ghost
  const q=smooth((e-T.swapStart)/T.swap);
  const c=layer('serve',ctx.canvas);c.setTransform(base);drawServing(c);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=q;ctx.drawImage(c.canvas,0,0);ctx.restore();
  return true;
 }
 if(ph==='straining'){
  // the camera pulls back a little so the whole mixing glass, the stream and the serving glass fit
  const tg=servingTarget(),z=strainZoom(e,tg),bz=zoomed(base,z);
  ctx.save();ctx.setTransform(bz);drawServing(ctx);ctx.restore();
  ctx.save();ctx.setTransform(bz);drawStrain(ctx,bz,e,t,tg);ctx.restore();
  return true;
 }
 return false;
}

// ---------- strain: mixing glass enters, pours through the strainer, leaves ----------
function servingTarget(){
 const art=window.LCArtV5,g=s.glass;
 if(!art)return {x:280,y:420,mouth:330,r:60};
 const v=art.view(g),cap=h.glasses[g].capacity-(window.LCIceV7?window.LCIceV7.displacement(s.iceKind,g):0);
 const ys=art.liquidY(g,Math.max(s.visualML,0),cap)*v.s+v.ty,r=art.rim(g);
 return {x:280,y:ys,mouth:(r.back)*v.s+v.ty,r:r.radius*v.s};
}
const POUR={rot0:-1.12,rot1:-1.74,sc:.78,gap:30};   // tilt at first drop / at the last drop, glass scale, spout height over the mouth
function pourAt(tg,rot){
 const tip=[tg.x+10,tg.mouth-POUR.gap],v=[(G.spout[0]-G.pivot[0])*K*POUR.sc,(G.spout[1]-G.pivot[1])*K*POUR.sc];
 const c=Math.cos(rot),sn=Math.sin(rot);return {x:tip[0]-(v[0]*c-v[1]*sn),y:tip[1]-(v[0]*sn+v[1]*c),rot,sc:POUR.sc,alpha:1};
}
function poseBox(pose){ // canvas-space bounding box of the glass outline (+ strainer handle) under a pose
 const pts=[[G.cx-G.rim.hw,G.rim.cy-G.rim.ry],[G.cx+G.rim.hw,G.rim.cy-G.rim.ry],[G.cx-G.rim.hw,G.rim.cy+G.rim.ry],[G.cx+G.rim.hw,G.rim.cy+G.rim.ry],
  [G.cx-G.floor.rx-20,G.baseFront],[G.cx+G.floor.rx+20,G.baseFront],[G.cx+G.rim.hw+40,G.rim.cy+20]];
 const c=Math.cos(pose.rot),sn=Math.sin(pose.rot),k=K*pose.sc;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 for(const [px,py] of pts){const u=(px-G.pivot[0])*k,w=(py-G.pivot[1])*k,x=pose.x+u*c-w*sn,y=pose.y+u*sn+w*c;
  x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
 return {x0,y0,x1,y1};
}
function needZoom(tg){ // largest zoom (<=1) about (280,GROUND) that keeps both pour poses on screen
 let z=1;
 for(const r of [POUR.rot0,POUR.rot1]){const b=poseBox(pourAt(tg,r));
  if(b.y0<44)z=Math.min(z,(GROUND-44)/(GROUND-b.y0));
  if(b.x1>524)z=Math.min(z,(524-280)/(b.x1-280))}
 return clamp(z,.62,1);
}
function strainZoom(e,tg){
 const z=needZoom(tg);if(z>=.999)return 1;
 const q=e<ST.pourStart?inOut(e/ST.enter):e<ST.pourEnd?1:1-inOut((e-ST.pourEnd)/ST.exit);
 return lerp(1,z,q);
}
function zoomed(base,z){
 if(z>=.999)return base;
 const m=new DOMMatrix([z,0,0,z,280*(1-z),GROUND*(1-z)]);
 return base.multiply(m);
}
function strainPose(e,tg){
 const rotAt=q=>lerp(POUR.rot0,POUR.rot1,q);
 const off={x:690,y:-210,rot:-.42,sc:.7,alpha:1};
 if(e<ST.pourStart){const q=inOut(e/ST.enter),P=pourAt(tg,rotAt(0));
  return {x:lerp(off.x,P.x,q),y:lerp(off.y,P.y,q),rot:lerp(off.rot,P.rot,q),sc:lerp(off.sc,POUR.sc,q),alpha:1}}
 if(e<ST.pourEnd)return pourAt(tg,rotAt(smooth((e-ST.pourStart)/ST.pour)));
 const q=inOut((e-ST.pourEnd)/ST.exit),P=pourAt(tg,rotAt(1));
 return {x:lerp(P.x,off.x,q),y:lerp(P.y,off.y,q),rot:lerp(P.rot,off.rot,q),sc:lerp(POUR.sc,off.sc,q),alpha:1-smooth((q-.55)/.45)};
}
function spoutOf(pose){
 const c=Math.cos(pose.rot),sn=Math.sin(pose.rot),v=[(G.spout[0]-G.pivot[0])*K*pose.sc,(G.spout[1]-G.pivot[1])*K*pose.sc];
 return [pose.x+v[0]*c-v[1]*sn,pose.y+v[0]*sn+v[1]*c];
}
// A falling stream: leaves the lip with a little forward speed, narrows as it accelerates,
// head falls in at the start and the tail drops away at the end.
function drawStream(ctx,sp,tg,q,t,col,wk=1,op=1){
 const sk=.25+.75*clamp(op,0,1);
 const sx=sp[0],sy=sp[1]+1,ex=clamp(tg.x+(sx-tg.x)*.35,tg.x-tg.r*.5,tg.x+tg.r*.5),ey=tg.y+1;
 const fall=Math.max(20,ey-sy),vx=(ex-sx);
 const P=u=>[sx+vx*(1-Math.pow(1-u,2.2))-6*Math.sin(Math.PI*u)*(1-u),sy+fall*u*u*.55+fall*u*.45];
 const head=clamp(q/.10,0,1),tail=clamp((q-.92)/.08,0,1);if(head<=tail)return;
 const force=Math.pow(Math.sin(Math.PI*clamp(q,0,1)),.35);
 const u0=tail*tail,u1=1-Math.pow(1-head,2),N=36,L=[],R=[];
 for(let i=0;i<=N;i++){const u=lerp(u0,u1,i/N),p=P(u),pn=P(Math.min(1,u+.01)),pp=P(Math.max(0,u-.01));
  const dx=pn[0]-pp[0],dy=pn[1]-pp[1],l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
  const w=(lerp(7.6,4.4,Math.sqrt(u))+.6*Math.sin(t*.02+u*18))*(.45+.55*force)*wk;
  L.push([p[0]+nx*w,p[1]+ny*w]);R.push([p[0]-nx*w,p[1]-ny*w])}
 const mouthY=tg.mouth+6;
 const body=c=>{c.beginPath();L.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));for(let i=R.length-1;i>=0;i--)c.lineTo(R[i][0],R[i][1]);c.closePath()};
 for(const part of ['above','inside']){
  ctx.save();ctx.beginPath();if(part==='above')ctx.rect(-400,-900,1400,mouthY+900);else ctx.rect(-400,mouthY,1400,1200);ctx.clip();
  const a=part==='above'?1:.72;
  const g=ctx.createLinearGradient(sx,sy,ex,ey);g.addColorStop(0,rgba(lift(col,.22),.86*a*sk));g.addColorStop(1,rgba(lift(col,.06),.80*a*sk));
  body(ctx);ctx.fillStyle=g;ctx.fill();
  // glassy core highlight and a darker trailing edge give the ribbon volume
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();L.forEach((p,i)=>{const m=[lerp(p[0],R[i][0],.32),lerp(p[1],R[i][1],.32)];i?ctx.lineTo(m[0],m[1]):ctx.moveTo(m[0],m[1])});
  ctx.strokeStyle='rgba(255,253,244,'+(.55*a)+')';ctx.lineWidth=1.3;ctx.stroke();
  ctx.beginPath();R.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=rgba(lift(col,-.25),.45*a*sk);ctx.lineWidth=1;ctx.stroke();
  // light glints running down the stream
  for(let k=0;k<6;k++){const f=((t*.0024)+k/6)%1,u=lerp(u0,u1,f),p=P(u);
   ctx.fillStyle='rgba(255,255,250,'+(.42*a*force)+')';ctx.beginPath();ctx.ellipse(p[0]-1,p[1],1.1,3.2,0,0,TAU);ctx.fill()}
  ctx.restore();
 }
 // impact: rings spreading on the drink surface, a small crown while the stream lands
 if(head>=1&&tail<1){const rx=Math.min(tg.r*.8,40);
  ctx.save();ctx.lineWidth=1.2;
  for(let k=0;k<3;k++){const f=((t*.0018)+k/3)%1;ctx.strokeStyle=rgba(lift(col,.35),.42*(1-f)*force);
   ctx.beginPath();ctx.ellipse(ex,ey,6+rx*f,(6+rx*f)*.26,0,0,TAU);ctx.stroke()}
  ctx.fillStyle='rgba(255,252,240,'+(.35*force)+')';ctx.beginPath();ctx.ellipse(ex,ey-1,5.5*force+2,2.2,0,0,TAU);ctx.fill();
  ctx.restore()}
}
function drawStrain(ctx,base,e,t,tg){
 const p=s.pour,vol=p&&p.kind==='strain'?p.to:h.total();
 const q=p?clamp((performance.now()-p.start)/p.duration,0,1):(e>=ST.pourEnd?1:0);
 const eased=q*q*(3-2*q),left=vol*(1-eased);
 tg=tg||servingTarget();const pose=strainPose(e,tg);
 const tiltQ=clamp(-pose.rot/1.6,0,1);
 const ice=iceList(0,0,0).map((c,i)=>{ // the strainer holds the ice back against the low wall
  const pr=proj(c.x,c.y,c.z),R=G.rim.rx,Hh=G.floor.cy-G.rim.cy;
  const tx=clamp(lerp(pr[0],G.cx-R*.62+(i%3)*R*.24,tiltQ),G.cx-R*.8,G.cx+R*.8);
  const ty=clamp(lerp(pr[1],G.rim.cy+Hh*(.30+(i>>1)*.14),tiltQ*.7),G.rim.cy+Hh*.2,G.floor.cy-60);
  return {...c,px:[tx,ty]};
 });
 const o={mlv:left,tilted:true,rot:pose.rot,color:p&&Array.isArray(p.color)?p.color:layersFor(vol).avg,ice,spoon:null,strainer:true};
 withFade(ctx,base,pose.alpha,c=>drawGlassScene(c,base,pose,o));
 if(p&&q>0)drawStream(ctx,spoutOf(pose),tg,q,t,o.color,1,h.liquidOpacity?h.liquidOpacity():1);
}

// ---------- host-side actions (never run on a viewer) ----------
let seq=0;
function begin(kind){ // called from startProcess right after processing is set
 if(!inStir()||kind!=='stirred')return;
 const m=s.stirManual,manual=!!(m&&s.mix>0);
 s.stirAnim={kind:'stir',seq:++seq+Math.floor(Math.random()*1e6),startAt:now()-(manual?T.enter:0),theta0:manual?Number(m.theta)||0:-.6,mixFrom:clamp(s.mix,0,1)};
}
function processMs(){const m=s.stirManual;return m&&s.mix>0?T.stir:T.stirEnd}
function onReset(){s.stirAnim=null;s.stirManual=null;local.drag=null}
function strainTiming(){return {pourStart:ST.pourStart,pour:ST.pour,end:ST.end}}
function startStrain(){s.stirAnim={kind:'strain',seq:++seq+Math.floor(Math.random()*1e6),startAt:now()}}

// ---------- drag-to-stir on the mixing glass (shares state.mix with the button) ----------
const canvas=document.getElementById('glassCanvas');
function pt(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*560,y:(e.clientY-r.top)/r.height*620}}
function canDrag(){return inStir()&&s.flowStep==='preparing'&&s.prepIce&&h.total()>0&&!s.busy&&!s.processing&&!s.demo&&!B.isViewer()&&ready()}
function inGlass(p){
 const x0=REST.x-(G.rim.rx+10)*K,x1=REST.x+(G.rim.rx+10)*K,y0=REST.y+(G.rim.cy-G.pivot[1])*K-30,y1=REST.y+(G.floor.cy-G.pivot[1])*K;
 return p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1;
}
function centre(){const hm=levelFor(h.total()),e=ell(DIM.HB+hm*.6);return {x:REST.x,y:REST.y+(e.cy-G.pivot[1])*K}}
if(canvas){
 canvas.addEventListener('pointerdown',ev=>{
  if(!canDrag())return;const p=pt(ev);if(!inGlass(p))return;
  const c=centre();local.drag={a:Math.atan2(p.y-c.y,(p.x-c.x)*.55),theta:s.stirManual?Number(s.stirManual.theta)||0:-.6,last:performance.now()};
  if(!s.stirManual)s.stirManual={theta:local.drag.theta,at:now()};
  try{canvas.setPointerCapture(ev.pointerId)}catch{}
  canvas.style.cursor='grabbing';ev.preventDefault();
 });
 canvas.addEventListener('pointermove',ev=>{
  const p=pt(ev);
  if(!local.drag){if(canDrag())canvas.style.cursor=inGlass(p)?'grab':'default';return}
  if(!canDrag()){local.drag=null;return}
  const c=centre(),a=Math.atan2(p.y-c.y,(p.x-c.x)*.55);let d=a-local.drag.a;
  d=((d+Math.PI)%TAU+TAU)%TAU-Math.PI;local.drag.a=a;
  if(Math.abs(d)>1.4)return;                       // ignore jumps through the centre
  const tnow=performance.now(),dt=Math.max(8,tnow-local.drag.last);local.drag.last=tnow;
  local.manualSpeed=lerp(local.manualSpeed,clamp(Math.abs(d)/dt*95,0,1),.25);
  local.drag.theta+=Math.abs(d);                   // the spoon always travels the same way round
  s.stirManual={theta:local.drag.theta,at:now()};
  s.mix=clamp(s.mix+Math.abs(d)/(TAU*3.2),0,1);s.mixKind='stirred';
  if(s.mix>=1)completeManual();else{h.updateUI();h.syncRoom('stir')}
 });
 const stop=()=>{if(local.drag){local.drag=null;canvas.style.cursor='default';if(inStir()&&s.flowStep==='preparing')h.syncRoom('stir_end')}};
 canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
}
function completeManual(){
 if(!canDrag()&&!local.drag)return;
 local.drag=null;canvas.style.cursor='default';
 const theta=s.stirManual?Number(s.stirManual.theta)||0:0;
 // jump the shared timeline straight to "spoon slows down" with the spoon where the hand left it
 s.stirAnim={kind:'stir',seq:++seq+Math.floor(Math.random()*1e6),startAt:now()-T.stirEnd,theta0:theta-W_SPIN*(T.stir-180),mixFrom:1};
 s.mix=1;s.mixedOnce=true;s.mixKind='stirred';
 if(window.flowV6)window.flowV6.onProcessDone('stirred');   // the single dilution
 h.updateUI();h.syncRoom('mix_end');
}

// keep buttons in step with the visual phases (host and viewer): refresh the UI when the
// derived phase changes. Cheap: one comparison every 250 ms.
let lastPhase=null;
setInterval(()=>{const p=phase()+'|'+busy();if(p!==lastPhase){lastPhase=p;h.updateUI()}},200);
function schedule(){lastPhase=null}

window.LCStirScene={frame,phase,busy,begin,processMs,onReset,strainTiming,startStrain,schedule,
 freezeAt:ms=>{frozen=ms===null?null:Number(s.stirAnim?.startAt||0)+ms},
 timings:{stir:{...T},strain:{...ST}},geometry:G,ready,version:'10.1'};
})();
