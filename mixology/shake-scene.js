/* La Crystalline V10.7 SHAKE scene: a Boston shaker in the middle of the stage.
   The drink is built in the shaker glass (so it can be seen), the tin goes on upside down, the shake
   itself happens in the game (/shakedrink), then the tin is turned upright holding the drink and pours
   it into the serving glass. The shaker is drawn in code in the same lighting as the bar tools; when the
   painted shaker artwork arrives it replaces these drawings, the scene and its timing stay. */
(()=>{
'use strict';
const h=window.mixologyHooks;if(!h)return;
const s=h.state,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)},inOut=t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const rgba=(c,a)=>'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+a+')';
const mixc=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),lift=(c,q)=>mixc(c,q>=0?[254,246,228]:[4,12,30],Math.abs(q));
const INK=op=>.10+.90*clamp(op,0,1);

// ---------- scale and parts (cm; same camera as the mixing glass: rim ellipse height/width ~ .205) ----------
const CM=18,KY=.205,GROUND=580,CX=280;   // 18 px per cm: the closed shaker (29 cm) fits the stage
const GLASS={h:14.5,rTop:4.3,rBase:2.95,floor:1.0};          // Boston shaker glass (16 oz pint)
const TIN={h:17.5,rTop:4.6,rBase:3.3,floor:.4};              // 28 oz tin
const OVERLAP=3.0;                                           // glass rim inside the inverted tin (cm)
const JG={src:'./assets/stir/jigger.webp',cx:298,rimY:140,rx:284,foot:1106,scale:.26};
const jig=new Image();let jigOk=false;jig.onload=()=>{jigOk=true};jig.src=JG.src;

// ---------- frost texture (fine speckle), made once ----------
let frostTex=null;
function frost(){if(frostTex)return frostTex;const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
 let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
 for(let i=0;i<6500;i++){const r=rnd()*.75+.2,a=.08+rnd()*.28;x.fillStyle='rgba(244,249,252,'+a.toFixed(3)+')';x.beginPath();x.arc(rnd()*256,rnd()*256,r,0,Math.PI*2);x.fill()}
 for(let i=0;i<14;i++){const r=1.2+rnd()*1.6,px=rnd()*256,py=rnd()*256;const g=x.createRadialGradient(px-r*.3,py-r*.3,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,.85)');g.addColorStop(1,'rgba(200,220,235,.15)');x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill()}
 return frostTex=c}

// ---------- geometry helpers ----------
// A frustum standing on (x, yb): radius r0 at its bottom, r1 at its top, height H (all px).
function frustum(x,yb,r0,r1,H){return {x,yb,yt:yb-H,r0,r1,H,ry0:r0*KY,ry1:r1*KY,rAt:y=>lerp(r0,r1,(yb-y)/H)}}
function ellPath(c,x,y,rx,ry){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2)}
function bodyPath(c,f){ // outline seen from slightly above: front arc of the bottom, sides, front arc of the top
 c.beginPath();c.moveTo(f.x-f.r1,f.yt);c.lineTo(f.x-f.r0,f.yb);c.ellipse(f.x,f.yb,f.r0,f.ry0,0,Math.PI,0,true);
 c.lineTo(f.x+f.r1,f.yt);c.ellipse(f.x,f.yt,f.r1,f.ry1,0,0,Math.PI,false);c.closePath()}
function bodyPathDown(c,f){ // inverted: wide end at the bottom; seen from above, the top (closed base) is a full ellipse
 c.beginPath();c.moveTo(f.x-f.r1,f.yt);c.lineTo(f.x-f.r0,f.yb);c.ellipse(f.x,f.yb,f.r0,f.ry0,0,Math.PI,0,true);
 c.lineTo(f.x+f.r1,f.yt);c.ellipse(f.x,f.yt,f.r1,f.ry1,0,0,Math.PI,true);c.closePath()}
// polished steel lit from the upper left, warm reflections, like the jigger
function steel(c,f,cool){const g=c.createLinearGradient(f.x-Math.max(f.r0,f.r1),0,f.x+Math.max(f.r0,f.r1),0);
 const S=cool?[[0,'#34404c'],[.07,'#6f7b86'],[.2,'#d9dee2'],[.27,'#f7f8f8'],[.36,'#b9c1c8'],[.55,'#7c8790'],[.72,'#a99a83'],[.82,'#d8c8a6'],[.92,'#6a737c'],[1,'#2b343e']]
  :[[0,'#3a4450'],[.07,'#7a858f'],[.2,'#dde2e6'],[.27,'#fafbfb'],[.36,'#c2c9cf'],[.55,'#87929b'],[.72,'#b7a68b'],[.82,'#e4d3ae'],[.92,'#717a83'],[1,'#2f3843']];
 for(const [o,col] of S)g.addColorStop(o,col);return g}
function gold(c,x,w){const g=c.createLinearGradient(x-w,0,x+w,0);g.addColorStop(0,'#6b4a1c');g.addColorStop(.25,'#f3d28c');g.addColorStop(.5,'#b98a3e');g.addColorStop(.75,'#ffe6a8');g.addColorStop(1,'#6b4a1c');return g}
function vshade(c,f,a){const g=c.createLinearGradient(0,f.yt,0,f.yb);g.addColorStop(0,'rgba(255,250,236,'+a*.5+')');g.addColorStop(.45,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(6,14,30,'+a+')');return g}
function glint(c,x,y,r){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,253,244,.95)');g.addColorStop(.35,'rgba(255,240,205,.35)');g.addColorStop(1,'rgba(255,240,205,0)');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r)}

// ---------- the tin ----------
function drawTin(c,f,o={}){ // upright (open top) unless o.down
 c.save();
 if(o.down)bodyPathDown(c,f);else bodyPath(c,f);
 c.fillStyle=steel(c,f);c.fill();
 c.save();c.clip();c.fillStyle=vshade(c,f,.35);c.fillRect(f.x-200,f.yt-60,400,f.H+120);
 if(o.frost>0){c.globalAlpha=clamp(o.frost,0,1)*.7;c.fillStyle=c.createPattern(frost(),'repeat');c.fillRect(f.x-200,f.yt-60,400,f.H+120);
  const fg=c.createLinearGradient(0,f.yt,0,f.yb);fg.addColorStop(0,'rgba(232,240,246,.15)');fg.addColorStop(1,'rgba(232,240,246,.45)');c.fillStyle=fg;c.fillRect(f.x-200,f.yt-60,400,f.H+120);c.globalAlpha=1}
 c.restore();
 if(o.down){ // closed base on top: a flat steel disc
  ellPath(c,f.x,f.yt,f.r1,f.ry1);const d=c.createLinearGradient(f.x-f.r1,f.yt-f.ry1,f.x+f.r1,f.yt+f.ry1);
  d.addColorStop(0,'#eef1f3');d.addColorStop(.5,'#9aa5ae');d.addColorStop(1,'#5a6570');c.fillStyle=d;c.fill();
  c.strokeStyle='rgba(255,255,255,.55)';c.lineWidth=1;c.stroke();
  if(o.frost>0){c.save();c.clip();c.globalAlpha=clamp(o.frost,0,1)*.7;c.fillStyle=c.createPattern(frost(),'repeat');c.fillRect(f.x-f.r1,f.yt-f.ry1,2*f.r1,2*f.ry1);c.restore()}
  // gold band near the mouth (now at the bottom)
  c.beginPath();c.ellipse(f.x,f.yb-6,f.rAt(f.yb-6),f.rAt(f.yb-6)*KY,0,0,Math.PI,false);c.strokeStyle=gold(c,f.x,f.r0);c.lineWidth=3;c.stroke();
 }else{
  // the opening: dark inside, the drink (if any) seen where the front wall does not hide it
  ellPath(c,f.x,f.yt,f.r1-1.2,f.ry1-1);c.save();c.clip();
  const ig=c.createLinearGradient(0,f.yt-f.ry1,0,f.yt+f.ry1);ig.addColorStop(0,'#c8cfd5');ig.addColorStop(.35,'#56616c');ig.addColorStop(1,'#1d2631');c.fillStyle=ig;c.fillRect(f.x-f.r1,f.yt-f.ry1,2*f.r1,2*f.ry1);
  if(o.liquid){const L=o.liquid,ly=L.y,lr=f.rAt(ly);ellPath(c,f.x,ly,lr,lr*KY);const lg=c.createLinearGradient(0,ly-lr*KY,0,ly+lr*KY);
   lg.addColorStop(0,rgba(lift(L.color,.25),.95));lg.addColorStop(1,rgba(lift(L.color,-.1),.95));c.fillStyle=lg;c.fill();
   if(L.foam){c.fillStyle='rgba(250,247,238,'+L.foam+')';c.fill()}}
  c.restore();
  ellPath(c,f.x,f.yt,f.r1,f.ry1);c.strokeStyle=gold(c,f.x,f.r1);c.lineWidth=3.2;c.stroke();
  ellPath(c,f.x,f.yt,f.r1-2.4,f.ry1-1.8);c.strokeStyle='rgba(255,255,255,.35)';c.lineWidth=.8;c.stroke();
 }
 glint(c,f.x-Math.max(f.r0,f.r1)*.52,o.down?f.yb-18:f.yt+14,7);glint(c,f.x+Math.max(f.r0,f.r1)*.55,(f.yt+f.yb)/2,4);
 c.restore();
}

// ---------- the shaker glass with the drink and ice ----------
const ICE=[[-.42,-.1,1.0,.25],[.38,.15,.95,-.35],[-.05,.35,1.05,.6],[.15,-.4,.9,-.15],[-.3,.5,.85,.9]];
function drawGlass(c,f,o){
 const liq=o.ml>0.5,top=f.yt,floorY=f.yb-GLASS.floor*CM;
 // back wall and floor, faint
 c.save();bodyPath(c,f);const bg=c.createLinearGradient(f.x-f.r1,0,f.x+f.r1,0);
 bg.addColorStop(0,'rgba(170,200,220,.18)');bg.addColorStop(.25,'rgba(255,255,255,.05)');bg.addColorStop(.7,'rgba(255,255,255,.03)');bg.addColorStop(1,'rgba(170,200,220,.16)');
 c.fillStyle=bg;c.fill();c.restore();
 // drink: a column from the floor to the surface, in perspective
 if(liq){const ly=o.levelY,r0=f.rAt(floorY)-2,r1=f.rAt(ly)-2,col=o.color,op=INK(o.op);
  c.save();c.beginPath();c.moveTo(f.x-r1,ly);c.lineTo(f.x-r0,floorY);c.ellipse(f.x,floorY,r0,r0*KY,0,Math.PI,0,true);c.lineTo(f.x+r1,ly);c.ellipse(f.x,ly,r1,r1*KY,0,0,Math.PI,false);c.closePath();
  const g=c.createLinearGradient(f.x-r1,0,f.x+r1,0);g.addColorStop(0,rgba(lift(col,-.35),.84*op));g.addColorStop(.35,rgba(lift(col,.12),.88*op));g.addColorStop(.7,rgba(lift(col,.05),.88*op));g.addColorStop(1,rgba(lift(col,-.35),.82*op));
  c.fillStyle=g;c.fill();c.restore();
  ellPath(c,f.x,ly,r1,r1*KY);const sg=c.createLinearGradient(0,ly-r1*KY,0,ly+r1*KY);sg.addColorStop(0,rgba(lift(col,.3),.8*op));sg.addColorStop(1,rgba(lift(col,.08),.86*op));c.fillStyle=sg;c.fill();
  c.strokeStyle='rgba(255,250,238,.35)';c.lineWidth=1;c.stroke();
  if(o.impact>0){c.fillStyle='rgba(255,252,240,'+(.18*o.impact)+')';ellPath(c,f.x+4,ly+3,r1*.45,r1*KY*.6);c.fill()}
 }
 // ice cubes in the glass
 if(o.ice){const n=ICE.length,base=liq?Math.min(floorY-8,o.levelY+10):floorY-8;
  for(let i=0;i<n;i++){const [u,v,sz,rot]=ICE[i],drop=o.iceDrop[i]||0;const w=2.6*CM*sz*.5,x=f.x+u*f.rAt(base)*.9,y=base-i*1.25*CM-v*CM*.6-drop;
   c.save();c.translate(x,y);c.rotate(rot*.3);const gg=c.createLinearGradient(-w,-w,w,w);gg.addColorStop(0,'rgba(250,253,255,.75)');gg.addColorStop(.5,'rgba(205,228,240,.35)');gg.addColorStop(1,'rgba(240,250,255,.6)');
   c.fillStyle=gg;c.strokeStyle='rgba(255,255,255,.7)';c.lineWidth=1;c.beginPath();c.roundRect(-w,-w*.8,2*w,1.6*w,w*.25);c.fill();c.stroke();c.restore()}}
 // front wall: rim, side highlights, thick base
 c.save();bodyPath(c,f);c.clip();
 const fl=c.createLinearGradient(f.x-f.r1,0,f.x+f.r1,0);fl.addColorStop(0,'rgba(255,255,255,.42)');fl.addColorStop(.06,'rgba(255,255,255,.08)');fl.addColorStop(.17,'rgba(255,255,255,.22)');fl.addColorStop(.22,'rgba(255,255,255,0)');fl.addColorStop(.86,'rgba(255,255,255,0)');fl.addColorStop(.93,'rgba(255,240,210,.18)');fl.addColorStop(1,'rgba(255,255,255,.38)');
 c.fillStyle=fl;c.fillRect(f.x-f.r1-4,f.yt-20,2*f.r1+8,f.H+40);
 const bb=c.createLinearGradient(0,floorY-6,0,f.yb+f.ry0);bb.addColorStop(0,'rgba(255,255,255,0)');bb.addColorStop(.3,'rgba(220,236,246,.28)');bb.addColorStop(1,'rgba(255,255,255,.45)');c.fillStyle=bb;c.fillRect(f.x-f.r1,floorY-6,2*f.r1,f.yb-floorY+f.ry0+8);
 c.restore();
 c.save();bodyPath(c,f);c.strokeStyle='rgba(225,240,250,.55)';c.lineWidth=1.2;c.stroke();c.restore();
 ellPath(c,f.x,f.yt,f.r1,f.ry1);c.strokeStyle=gold(c,f.x,f.r1);c.lineWidth=2.6;c.stroke();
 glint(c,f.x-f.r1*.62,f.yt+f.H*.3,6);glint(c,f.x+f.r1*.7,f.yt+6,5);
}

// ---------- volumes ----------
function glassFrame(x){return frustum(x,GROUND,GLASS.rBase*CM,GLASS.rTop*CM,GLASS.h*CM)}
function tinFrame(x,yb){return frustum(x,yb,TIN.rBase*CM,TIN.rTop*CM,TIN.h*CM)}
const ICE_ML=110;
function levelY(f,ml){ // height of ml (plus ice) in the glass, from its floor (frustum volume, cm)
 const vol=ml+(s.prepIce?ICE_ML:0),r0=f.rAt(f.yb-GLASS.floor*CM)/CM,top=GLASS.h-GLASS.floor,r1=GLASS.rTop-.35;
 let lo=0,hi=top;for(let i=0;i<30;i++){const z=(lo+hi)/2,rz=r0+(r1-r0)*z/top,v=Math.PI*z/3*(r0*r0+r0*rz+rz*rz);if(v<vol)lo=z;else hi=z}
 return f.yb-GLASS.floor*CM-lo*CM}
function prepQ(){const p=s.prepPour;return p?clamp((performance.now()-p.start)/p.duration,0,1):1}
function visualMl(){const p=s.prepPour;if(!p)return h.total();const q=clamp((prepQ()-.3)/.5,0,1);return lerp(p.from,p.to,q)}

// ---------- jigger pour into the shaker glass ----------
function drawJiggerPour(c,f,ly){const p=s.prepPour;if(!p||!jigOk)return;const q=prepQ();
 const enter=smooth(q/.22),leave=smooth((q-.85)/.15),tip=q<.3?inOut((q-.12)/.18)*1.9:q<.8?1.9+.35*(q-.3)/.5:2.25*(1-leave);
 const lip=[f.x-f.r1*.35,f.yt-34-(1-enter)*60+leave*-40];c.save();c.globalAlpha=Math.min(enter,1-leave*.9);
 c.translate(lip[0],lip[1]);c.rotate(tip);const k=.17;c.translate(-(JG.cx+JG.rx)*k,-JG.rimY*k);
 c.drawImage(jig,0,0,jig.width*k,jig.height*k);c.restore();
 const sq=clamp((q-.3)/.5,0,1);if(sq<=0||sq>=1)return;
 const col=Array.isArray(p.color)?p.color:[230,230,230],w=3.2*Math.sin(Math.PI*Math.min(1,sq*1.1))+.8;
 const g=c.createLinearGradient(0,lip[1],0,ly);g.addColorStop(0,rgba(lift(col,.2),.85));g.addColorStop(1,rgba(col,.75));
 c.beginPath();c.moveTo(lip[0]-w,lip[1]+2);c.quadraticCurveTo(lip[0]+6,lip[1]+(ly-lip[1])*.4,lip[0]+10-w*.6,ly);c.lineTo(lip[0]+10+w*.6,ly);c.quadraticCurveTo(lip[0]+8,lip[1]+(ly-lip[1])*.4,lip[0]+w,lip[1]+2);c.closePath();c.fillStyle=g;c.fill()}

// ---------- scene ----------
const local={iceAt:0,iceWas:false,shakeAt:0,lastStep:'',readyAt:0};
function groundShadow(c,x,w,a){const g=c.createRadialGradient(x,GROUND+4,2,x,GROUND+4,w);g.addColorStop(0,'rgba(0,0,0,'+a+')');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.save();c.translate(x,GROUND+4);c.scale(1,.18);c.translate(-x,-(GROUND+4));c.beginPath();c.arc(x,GROUND+4,w,0,Math.PI*2);c.fill();c.restore()}
function servingTarget(){const art=window.LCArtV5,g=s.glass;if(!art||!art.view)return {x:280,mouth:330};
 const v=art.view(g),r=art.rim(g);return {x:280,mouth:r.back*v.s+v.ty}}
function active(){return s.flow==='shake'&&['preparing','shaking','ready','transferring'].includes(s.flowStep)}
function frame(ctx,t,drawServing){
 if(!active())return false;
 const step=s.flowStep,nowp=performance.now();
 if(step!==local.lastStep){if(step==='shaking')local.shakeAt=nowp;if(step==='ready')local.readyAt=nowp;local.lastStep=step}
 if(s.prepIce&&!local.iceWas)local.iceAt=nowp;local.iceWas=s.prepIce;
 const col=h.liquidAverage?h.liquidAverage():[220,220,220],op=h.liquidOpacity?h.liquidOpacity():1;
 if(step==='preparing'){
  const gf=glassFrame(CX-45),ml=visualMl(),ly=levelY(gf,ml);
  const tf=tinFrame(CX+105,GROUND);
  groundShadow(ctx,tf.x,tf.r0*1.4,.35);drawTin(ctx,tf,{});
  groundShadow(ctx,gf.x,gf.r0*1.5,.4);
  const age=nowp-local.iceAt,drop=ICE.map((_,i)=>s.prepIce?Math.max(0,1-smooth((age-i*90)/380))*260:0);
  drawGlass(ctx,gf,{ml,levelY:ly,color:col,op,ice:s.prepIce,iceDrop:drop,impact:s.prepPour?.6:0});
  drawJiggerPour(ctx,gf,ly);
  return true;
 }
 if(step==='shaking'){
  // tin upside down over the glass; a gentle rock while the bartender shakes in game
  const e=(nowp-local.shakeAt)/1000,cool=smooth(e/12),wob=Math.sin(nowp*.018)*.035*(1-cool*.4),bob=Math.sin(nowp*.036)*2.5;
  const X=CX+95,gf=glassFrame(X),tf=frustum(X,gf.yt+OVERLAP*CM,TIN.rTop*CM,TIN.rBase*CM,TIN.h*CM);
  groundShadow(ctx,X,gf.r0*1.6,.4);
  ctx.save();ctx.translate(X,GROUND);ctx.rotate(wob);ctx.translate(-X,-GROUND+bob);
  drawGlass(ctx,gf,{ml:h.total(),levelY:levelY(gf,h.total()),color:col,op,ice:s.prepIce&&!s.shakeDry,iceDrop:[],impact:.4});
  drawTin(ctx,tf,{down:true,frost:s.shakeDry?0:cool});
  ctx.restore();return true;
 }
 if(step==='ready'){
  // turned upright: the drink is in the frosted tin; the glass is set aside
  const q=smooth((nowp-local.readyAt)/500),tf=tinFrame(CX-20,GROUND),gf=glassFrame(CX+135);
  const ly=tf.yt+lerp(1.2,3.2,1-clamp(h.total()/220,0,1))*CM;
  ctx.save();ctx.globalAlpha=q;groundShadow(ctx,gf.x,gf.r0*1.4,.3);drawGlass(ctx,gf,{ml:0,levelY:gf.yb,color:col,op,ice:false,iceDrop:[]});ctx.restore();
  groundShadow(ctx,tf.x,tf.r0*1.5,.4);
  drawTin(ctx,tf,{frost:1,liquid:{y:ly,color:col,foam:s.portions.some(p=>h.byId[p.id]&&h.byId[p.id].shakeOnly)?.75:.25}});
  return true;
 }
 if(step==='transferring'){
  drawServing(ctx);
  const p=s.pour;const q=p?clamp((nowp-p.start)/p.duration,0,1):1,tg=servingTarget();
  const enter=smooth(Math.min(1,q/.12)),tilt=lerp(-1.25,-1.85,q)*enter,k=.55;
  // the tin pivots about its left lip, which sits a little above the serving glass mouth
  const lip=[tg.x+14,tg.mouth-Math.min(48,Math.max(26,tg.mouth-60))];   // keep the raised tin on the stage
  ctx.save();ctx.translate(lip[0]+(1-enter)*80,lip[1]-(1-enter)*40);ctx.rotate(tilt);ctx.scale(k,k);
  const f=frustum(0,TIN.h*CM,TIN.rBase*CM,TIN.rTop*CM,TIN.h*CM);ctx.translate(f.r1,0);
  drawTin(ctx,f,{frost:1});ctx.restore();
  if(p&&q>0&&q<.97){const w=3.4*Math.sin(Math.PI*Math.min(1,q*1.15))+1;const yEnd=tg.mouth+44;
   const g=ctx.createLinearGradient(0,lip[1],0,yEnd);g.addColorStop(0,rgba(lift(col,.2),.9*INK(op)));g.addColorStop(1,rgba(col,.75*INK(op)));
   const L0=[lip[0]-2,lip[1]+3],x1=L0[0]-3;   // falls nearly straight down from the lip
   ctx.beginPath();ctx.moveTo(L0[0]-w,L0[1]);ctx.quadraticCurveTo(L0[0]-w*.8,L0[1]+20,x1-w*.6,yEnd);ctx.lineTo(x1+w*.6,yEnd);ctx.quadraticCurveTo(L0[0]+w*.8,L0[1]+20,L0[0]+w,L0[1]);ctx.closePath();ctx.fillStyle=g;ctx.fill()}
  return true;
 }
 return false;
}
window.LCShakeScene={frame,active,version:'10.7'};
})();
