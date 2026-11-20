/* La Crystalline Mixology | V3 glassware and light fluid renderer
   Lightweight, deterministic Canvas 2D. Three vessels share 3/4 eye-level optics.
   Visual simulation, not Navier-Stokes. No external images or GPU textures. */
(function(){
'use strict';
const TAU=Math.PI*2, CX=280;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rgba=(a,alpha=1)=>`rgba(${a[0]|0},${a[1]|0},${a[2]|0},${alpha})`;
const lerp=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>a.map((x,i)=>Math.round(lerp(x,b[i],t)));
const tint=(a,t)=>blend(a,t>0?[255,251,244]:[10,19,29],Math.abs(t));
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const ellipse=(c,x,y,rx,ry,rot=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,rot,0,TAU)};
function gradient(c,x0,y0,x1,y1,stops){let gr=c.createLinearGradient(x0,y0,x1,y1);for(const [v,color] of stops)gr.addColorStop(v,color);return gr}
function P(geo,y){ // exact shape shared by the game's capacity solver
 const {g,glass}=geo,t=clamp((g.bottom-y)/(g.bottom-g.top),0,1);
 return glass==='coupe'?g.wt*Math.sqrt(Math.max(0,1-(1-t)*(1-t))):g.wb+(g.wt-g.wb)*t;
}
function profile(c,geo,inset=0){
 const {g,glass}=geo,top=g.top+2,bottom=g.bottom-1;
 c.beginPath();
 c.moveTo(CX-P(geo,top)+inset,top+1);
 for(let y=top+2;y<=bottom-8;y+=2)c.lineTo(CX-Math.max(1,P(geo,y)-inset),y);
 const wb=Math.max(2,P(geo,bottom)-inset);
 if(glass==='coupe')c.quadraticCurveTo(CX,bottom+4,CX+wb,bottom);
 else {c.quadraticCurveTo(CX-wb+2,bottom+7,CX,bottom+7);c.quadraticCurveTo(CX+wb-2,bottom+7,CX+wb,bottom)}
 for(let y=bottom-8;y>=top+2;y-=2)c.lineTo(CX+Math.max(1,P(geo,y)-inset),y);
 c.closePath();
}
function drawGround(c,t){
 const halo=c.createRadialGradient(CX,338,12,CX,338,250);
 halo.addColorStop(0,'rgba(143,188,190,.082)');halo.addColorStop(.52,'rgba(76,119,144,.038)');halo.addColorStop(1,'rgba(25,57,80,0)');
 c.fillStyle=halo;c.fillRect(0,32,560,550);
 const shadow=c.createRadialGradient(CX+5,543,5,CX,543,174);
 shadow.addColorStop(0,'rgba(0,5,14,.77)');shadow.addColorStop(.48,'rgba(2,10,22,.46)');shadow.addColorStop(1,'rgba(2,10,22,0)');
 c.fillStyle=shadow;ellipse(c,CX,542,176,32);c.fill();
 c.strokeStyle='rgba(236,201,156,.105)';c.lineWidth=.9;c.beginPath();c.moveTo(145,539);c.lineTo(415,539);c.stroke();
}
function drawFoot(c,geo){
 if(geo.glass!=='coupe')return;
 const {g}=geo;
 // Warm-white crystal foot. The inner dark region makes the stem look truly translucent.
 let base=gradient(c,170,510,390,534,[[0,'rgba(177,212,216,.07)'],[.2,'rgba(247,241,218,.47)'],[.43,'rgba(255,253,241,.16)'],[.75,'rgba(143,193,215,.23)'],[1,'rgba(248,231,191,.35)']]);
 c.fillStyle=base;c.beginPath();c.moveTo(275,496);c.bezierCurveTo(266,511,202,516,191,525);c.bezierCurveTo(181,535,241,541,280,540);c.bezierCurveTo(330,540,381,531,368,524);c.bezierCurveTo(350,514,292,511,285,497);c.closePath();c.fill();
 c.strokeStyle='rgba(243,224,193,.55)';c.lineWidth=1.6;ellipse(c,CX,526,92,11,-.035);c.stroke();
 c.strokeStyle='rgba(235,249,250,.36)';c.lineWidth=2.6;ellipse(c,CX,523,73,6,-.03);c.stroke();
 const shaft=gradient(c,271,0,289,0,[[0,'rgba(247,250,242,.49)'],[.2,'rgba(170,220,225,.10)'],[.46,'rgba(21,38,53,.35)'],[.7,'rgba(239,243,226,.32)'],[1,'rgba(145,205,211,.34)']]);
 c.fillStyle=shaft;c.beginPath();c.moveTo(277,g.bottom-4);c.bezierCurveTo(271,417,273,471,270,489);c.quadraticCurveTo(272,503,280,506);c.quadraticCurveTo(288,503,290,489);c.bezierCurveTo(286,461,290,411,283,g.bottom-4);c.closePath();c.fill();
 c.strokeStyle='rgba(241,234,214,.61)';c.lineWidth=2.1;c.beginPath();c.moveTo(275,409);c.bezierCurveTo(275,444,274,484,275,492);c.stroke();
 c.strokeStyle='rgba(177,206,218,.48)';c.lineWidth=1;c.beginPath();c.moveTo(286,418);c.lineTo(286,487);c.stroke();
 for(let y of [394,401,496]){c.strokeStyle=y===401?'rgba(251,233,189,.44)':'rgba(202,227,227,.46)';c.lineWidth=y===401?1:2;ellipse(c,CX,y,y===496?15:9,3);c.stroke()}
}
function glassBack(c,geo){
 const {g,glass}=geo;
 c.save();profile(c,geo,-5);
 c.fillStyle=gradient(c,CX-g.wt,g.top,CX+g.wt,g.bottom,[[0,'rgba(218,244,246,.13)'],[.15,'rgba(227,246,251,.032)'],[.48,'rgba(121,174,186,.016)'],[.8,'rgba(221,234,226,.045)'],[1,'rgba(253,220,166,.11)']]);c.fill();
 c.strokeStyle='rgba(166,225,234,.23)';c.lineWidth=1.1;c.stroke();c.restore();
 // A distinct heavy polished base catches light in both straight-sided glasses.
 if(glass!=='coupe'){
  const wb=P(geo,g.bottom-4);c.fillStyle=gradient(c,0,g.bottom-17,0,g.bottom+8,[[0,'rgba(121,173,185,.07)'],[.45,'rgba(225,239,231,.30)'],[1,'rgba(210,182,145,.12)']]);
  c.beginPath();c.moveTo(CX-wb-2,g.bottom-16);c.quadraticCurveTo(CX,g.bottom-8,CX+wb+2,g.bottom-16);c.lineTo(CX+wb+3,g.bottom+3);c.quadraticCurveTo(CX,g.bottom+14,CX-wb-3,g.bottom+3);c.closePath();c.fill();
  c.strokeStyle='rgba(244,230,207,.35)';c.lineWidth=1.4;c.beginPath();c.moveTo(CX-wb-2,g.bottom+3);c.quadraticCurveTo(CX,g.bottom+12,CX+wb+2,g.bottom+3);c.stroke();
 }
}
function drawIce(c,geo,liquidY,t){
 const g=geo.g,ml=geo.displayed;if(!ml||!geo.decor.has('ice'))return;
 // Three gently refracting irregular ice blocks, bounded by liquid top.
 c.save();profile(c,geo,8);c.clip();
 const positions=geo.glass==='coupe'?[[259,liquidY+24,21],[302,liquidY+36,16]]:[[248,Math.max(liquidY+30,g.bottom-100),20],[303,Math.max(liquidY+49,g.bottom-75),23],[275,Math.max(liquidY+76,g.bottom-56),15]];
 for(let i=0;i<positions.length;i++){
  const [x,y,s]=positions[i],angle=(i%2?-.24:.21);
  c.save();c.translate(x,y+Math.sin(t*.00055+i)*1.2);c.rotate(angle);
  c.beginPath();c.moveTo(-s*.8,-s*.7);c.lineTo(s*.6,-s*.92);c.lineTo(s*.95,s*.6);c.lineTo(-s*.45,s*.85);c.closePath();
  c.fillStyle=gradient(c,-s,-s,s,s,[[0,'rgba(242,255,255,.28)'],[.45,'rgba(233,248,245,.07)'],[1,'rgba(239,246,251,.23)']]);c.fill();
  c.lineWidth=1.3;c.strokeStyle='rgba(242,254,254,.46)';c.stroke();
  c.strokeStyle='rgba(247,248,239,.22)';c.lineWidth=1;c.beginPath();c.moveTo(-s*.6,-s*.5);c.lineTo(s*.4,s*.45);c.stroke();
  c.restore();
 }
 c.restore();
}
function drawFluid(c,geo,state,t){
 const displayed=clamp(state.visualML,0,geo.total());if(displayed<.05)return;
 const {g}=geo,layers=geo.getLayers(),avg=geo.liquidAverage(),mix=state.mix;
 const topY=geo.yFor(displayed),time=t*.001,stir=clamp(state.stirMotion,0,1);
 const pour=state.pour,impact=pour?Math.max(0,Math.sin((t-pour.start)/pour.duration*Math.PI)):0;
 const amp=clamp(.35+1.7*stir+1.35*impact,.35,3.6);
 const wobble=x=>Math.sin(time*5.4+(x-CX)*.034)*amp*.50+Math.sin(time*3.1+(x-CX)*.012)*amp*.32;
 c.save();profile(c,geo,5);c.clip();
 let filled=0,lastColor=avg;
 for(const p of layers){
  const amount=Math.min(p.ml,Math.max(0,displayed-filled));if(amount<=0)break;
  const lo=geo.yFor(filled),hi=geo.yFor(filled+amount);
  const cc=blend(p.layerColor,avg,mix);lastColor=cc;const inset=geo.glass==='coupe'?2:5;
  const left=CX-P(geo,hi)+inset,right=CX+P(geo,hi)-inset;
  let body=gradient(c,left,hi,right,hi,[[0,rgba(tint(cc,-.35),.89)],[.1,rgba(tint(cc,-.08),.91)],[.34,rgba(tint(cc,.22),.95)],[.61,rgba(tint(cc,.08),.96)],[.82,rgba(tint(cc,-.04),.95)],[1,rgba(tint(cc,-.38),.92)]]);
  c.beginPath();c.moveTo(80,hi);
  for(let x=80;x<=480;x+=7)c.lineTo(x,hi+wobble(x)*(filled+amount>=displayed?1:.38));
  c.lineTo(480,lo+11);c.lineTo(80,lo+11);c.closePath();c.fillStyle=body;c.fill();
  // Gradient shading in the depth direction suggests refraction through liquid.
  let vertical=gradient(c,0,hi,0,lo,[[0,'rgba(255,251,237,.13)'],[.16,'rgba(247,253,255,.015)'],[.83,'rgba(10,23,32,.015)'],[1,'rgba(3,18,32,.15)']]);
  c.fillStyle=vertical;c.fillRect(65,hi,430,lo-hi+8);
  if(filled>0&&mix<.96){
   const w=P(geo,lo)-4;
   c.strokeStyle=`rgba(242,239,213,${.29*(1-mix)})`;c.lineWidth=1.1;
   c.beginPath();c.ellipse(CX,lo-1,Math.max(5,w),Math.max(2,w*.11),-.018,0,Math.PI);c.stroke();
  }
  filled+=p.ml;
 }
 // Méniscus: translucent ellipse compresses in perspective; upper rim and frontal edge differ in clarity.
 const surfaceColor=lastColor;
 let rx=P(geo,topY)-5,ry=geo.glass==='coupe'?Math.max(4,rx*.129):Math.max(4.8,rx*.13);
 const e=c.createRadialGradient(CX-24,topY-ry*.6,4,CX,topY,rx);
 e.addColorStop(0,rgba(tint(surfaceColor,.50),.46));e.addColorStop(.45,rgba(tint(surfaceColor,.18),.27));e.addColorStop(1,rgba(tint(surfaceColor,-.14),.41));
 ellipse(c,CX,topY,Math.max(4,rx),ry,-.018);c.fillStyle=e;c.fill();
 c.beginPath();c.ellipse(CX,topY,Math.max(4,rx),ry,-.018,0,Math.PI);
 c.lineWidth=1.25;c.strokeStyle='rgba(253,251,228,.36)';c.stroke();
 c.beginPath();c.ellipse(CX,topY,Math.max(4,rx),ry,-.018,Math.PI,TAU);
 c.lineWidth=.8;c.strokeStyle='rgba(244,250,253,.16)';c.stroke();
 // Contact meniscus / capillary rise against glass.
 c.strokeStyle='rgba(246,251,235,.38)';c.lineWidth=1.3;
 c.beginPath();c.moveTo(CX-rx-3,topY-2);c.quadraticCurveTo(CX-rx+3,topY+4,CX-rx+10,topY+2);
 c.moveTo(CX+rx+3,topY-2);c.quadraticCurveTo(CX+rx-3,topY+4,CX+rx-10,topY+2);c.stroke();
 // Impact ripples: a few short arcs with physically damped strength, no uncontrolled particles.
 if(pour||stir>.08){
  let strength=clamp(stir*.8+impact*.75,0,.9);
  for(let k=0;k<3;k++){
   c.beginPath();c.ellipse(CX+4,topY+1,11+k*15,2.1+k*1.7,-.018,0,Math.PI);
   c.strokeStyle=`rgba(251,255,245,${strength*(.30-k*.075)})`;c.lineWidth=1;c.stroke();
  }
 }
 // Directional specular caustics, weak enough to preserve color layers.
 const sheen=gradient(c,CX-g.wt,0,CX+g.wt,0,[[0,'rgba(252,255,254,.19)'],[.12,'rgba(251,252,246,.015)'],[.43,'rgba(255,255,255,.075)'],[.71,'rgba(250,242,223,.02)'],[.9,'rgba(231,250,253,.07)'],[1,'rgba(246,249,236,.18)']]);
 c.fillStyle=sheen;c.fillRect(80,g.top,400,g.bottom-g.top+8);
 // Very small bubbles, stable deterministic locations only in sparkling mixes.
 const sparkling=state.portions.some(p=>p.id==='soda'||p.id==='tonic');
 if(sparkling){for(let i=0;i<16;i++){
   const n=((i*47)%79)/79,s=((t*.016+i*19)%(g.bottom-topY+20)),y=g.bottom-s;
   if(y<topY+6||y>g.bottom-8)continue;
   const w=P(geo,y)*.78,x=CX+Math.sin(i*10.31)*w;
   c.strokeStyle=`rgba(249,254,252,${.16+.10*(i%3)})`;c.lineWidth=.8;
   ellipse(c,x,y,1.0+(i%3)*.35,1.6+(i%2)*.4);c.stroke();
 }}
 c.restore();
 drawIce(c,geo,topY,t);
}
function glassFront(c,geo,state,t){
 const {g,glass}=geo,topW=P(geo,g.top)+5,bottom=g.bottom;
 // Front polished shell, with asymmetric cold/warm highlights as in hidden cocktail assets.
 c.save();profile(c,geo,-6);c.strokeStyle=gradient(c,CX-topW,g.top,CX+topW,bottom,[[0,'rgba(239,253,250,.51)'],[.13,'rgba(202,224,228,.18)'],[.48,'rgba(230,245,251,.16)'],[.78,'rgba(255,230,177,.23)'],[1,'rgba(245,247,240,.51)']]);c.lineWidth=2.6;c.stroke();c.restore();
 c.save();profile(c,geo,-6);c.clip();
 // An extremely thin, bright, broken reflection along the left side.
 c.beginPath();for(let y=g.top+17;y<g.bottom-(glass==='coupe'?23:29);y+=3){
  let x=CX-P(geo,y)-6+10;
  if(y===g.top+17)c.moveTo(x,y);else c.lineTo(x,y)}
 c.strokeStyle=gradient(c,0,g.top,0,g.bottom,[[0,'rgba(255,255,249,.78)'],[.24,'rgba(239,249,248,.36)'],[.72,'rgba(234,241,236,.13)'],[1,'rgba(240,244,245,0)']]);c.lineWidth=2.8;c.stroke();
 c.beginPath();for(let y=g.top+25;y<g.bottom-(glass==='coupe'?28:17);y+=3){let x=CX+P(geo,y)+6-14;if(y===g.top+25)c.moveTo(x,y);else c.lineTo(x,y)}
 c.strokeStyle=gradient(c,0,g.top,0,g.bottom,[[0,'rgba(249,251,241,.25)'],[.4,'rgba(248,252,247,.14)'],[.85,'rgba(255,239,215,.34)'],[1,'rgba(245,252,248,.16)']]);c.lineWidth=8;c.stroke();
 c.restore();
 // 3/4 rim, compressed elliptical geometry (10°-ish camera elevation).
 let rim=gradient(c,CX-topW,g.top,CX+topW,g.top,[[0,'rgba(250,249,234,.64)'],[.17,'rgba(223,241,238,.38)'],[.4,'rgba(247,250,247,.25)'],[.76,'rgba(167,214,229,.43)'],[1,'rgba(255,244,219,.67)']]);
 ellipse(c,CX,g.top-1,topW,glass==='coupe'?24:glass==='rocks'?18:14,-.018);
 c.strokeStyle=rim;c.lineWidth=glass==='coupe'?3.1:2.8;c.stroke();
 ellipse(c,CX,g.top+1,topW-4,glass==='coupe'?20:glass==='rocks'?14.8:11,-.018);c.lineWidth=1.1;c.strokeStyle='rgba(230,252,251,.24)';c.stroke();
 // Rim optical sparkle accents, deliberately not faceted jewels.
 c.beginPath();c.ellipse(CX,g.top-1,topW,glass==='coupe'?24:glass==='rocks'?18:14,-.018,Math.PI*1.13,Math.PI*1.58);
 c.strokeStyle='rgba(255,248,233,.67)';c.lineWidth=2.2;c.stroke();
 c.beginPath();c.ellipse(CX,g.top-1,topW,glass==='coupe'?24:glass==='rocks'?18:14,-.018,.04,.26);
 c.strokeStyle='rgba(237,248,253,.65)';c.lineWidth=1.8;c.stroke();
 if(glass==='coupe'){
  c.strokeStyle='rgba(252,233,201,.24)';c.lineWidth=1.9;c.beginPath();c.moveTo(CX-33,g.bottom-20);c.quadraticCurveTo(CX,g.bottom+7,CX+33,g.bottom-20);c.stroke();
 }else{
  // Polished wide bottom; no fake rim around every liquid boundary.
  const bw=P(geo,g.bottom-4)+3;
  c.strokeStyle='rgba(241,240,217,.43)';c.lineWidth=2.1;
  c.beginPath();c.moveTo(CX-bw,bottom+2);c.quadraticCurveTo(CX,bottom+12,CX+bw,bottom+2);c.stroke();
  c.strokeStyle='rgba(229,250,249,.13)';c.lineWidth=1;
  c.beginPath();c.moveTo(CX-bw+5,bottom-8);c.quadraticCurveTo(CX,bottom-2,CX+bw-5,bottom-8);c.stroke();
 }
 if(state.decor.has('citrus'))garnishCitrus(c,CX+topW*.65,g.top-8);
 if(state.decor.has('cherry'))garnishCherry(c,CX+topW*.47,g.top-8,t);
}
function garnishCitrus(c,x,y){
 c.save();c.translate(x,y);c.rotate(-.27);let rad=21;
 c.fillStyle='rgba(245,183,70,.92)';ellipse(c,0,0,rad,rad*1.03);c.fill();c.strokeStyle='rgba(255,224,135,.95)';c.lineWidth=3;c.stroke();
 c.fillStyle='#f5cf8f';ellipse(c,0,0,rad-4,rad-4);c.fill();c.strokeStyle='rgba(250,244,215,.78)';c.lineWidth=1.3;
 for(let i=0;i<7;i++){let a=i*TAU/7;c.beginPath();c.moveTo(0,0);c.lineTo((rad-4)*Math.cos(a),(rad-4)*Math.sin(a));c.stroke()}
 c.restore();
}
function garnishCherry(c,x,y,t){
 c.strokeStyle='rgba(163,168,117,.83)';c.lineWidth=1.5;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+14,y-20,x+18,y-35);c.stroke();
 c.fillStyle='#8f213b';ellipse(c,x,y,10,10);c.fill();c.fillStyle='rgba(255,230,220,.62)';ellipse(c,x-3,y-3,3.2,2.5);c.fill();
}
function drawPour(c,geo,state,t){
 const p=state.pour;if(!p)return;
 const z=clamp((t-p.start)/p.duration,0,1),a=Math.sin(Math.PI*z);if(a<=.005)return;
 const endY=geo.yFor(clamp(state.visualML,0,geo.total()));
 const fluid=Array.isArray(p.color)?p.color:[196,221,214];
 // Glass pourer's mouth, not a floating cartoon bottle.
 c.save();c.translate(375,101);c.rotate(-.55);c.fillStyle='rgba(11,24,34,.70)';
 c.strokeStyle='rgba(238,238,220,.56)';c.lineWidth=1.8;
 c.beginPath();c.moveTo(-14,-57);c.lineTo(14,-57);c.lineTo(15,1);c.quadraticCurveTo(15,10,8,13);c.lineTo(-7,13);c.quadraticCurveTo(-14,10,-14,1);c.closePath();c.fill();c.stroke();
 c.beginPath();c.ellipse(0,9,9,3.4,0,0,TAU);c.strokeStyle='rgba(248,235,203,.74)';c.lineWidth=1.6;c.stroke();
 c.fillStyle=rgba(fluid,.35);c.fillRect(-9,-22,18,22);c.restore();
 const sx=379,sy=116,ex=CX+2,ey=endY+3;
 let stream=gradient(c,sx,sy,ex,ey,[[0,rgba(tint(fluid,.36),.55*a)],[.52,rgba(fluid,.8*a)],[1,rgba(tint(fluid,.26),.92*a)]]);
 c.beginPath();c.moveTo(sx,sy);c.bezierCurveTo(sx+7,sy+56,ex-12,ey-70,ex,ey);c.lineWidth=3.6+1.2*a;c.strokeStyle=stream;c.lineCap='round';c.stroke();
 c.lineWidth=1.2;c.strokeStyle=`rgba(255,255,249,${a*.46})`;c.stroke();
 // Micro droplets are capped and fade naturally.
 for(let i=0;i<5;i++){let f=(z*1.7+i/5)%1,y=sy+(ey-sy)*f,x=lerp(sx,ex,f)+4*Math.sin(f*4.7);c.fillStyle=rgba(tint(fluid,.25),a*.35);ellipse(c,x,y,1.2,2.3);c.fill()}
}
window.LCArtV3={draw({ctx:c,state,t,glasses,byId,getLayers,liquidAverage,vToY,total}){
 const g=glasses[state.glass];if(!g)return;
 const geo={g,glass:state.glass,displayed:state.visualML,decor:state.decor,byId,getLayers,liquidAverage,yFor:vToY,total};
 c.save();drawGround(c,t);drawFoot(c,geo);glassBack(c,geo);drawFluid(c,geo,state,t);glassFront(c,geo,state,t);drawPour(c,geo,state,t);c.restore();
}};
})();