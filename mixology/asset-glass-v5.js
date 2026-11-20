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
function liquid(ctx,opts){
 const {state,t,glasses,getLayers,liquidAverage,total}=opts;
 const id=state.glass,g=specs[id];if(!g)return;
 const ml=clamp(state.visualML,0,total());if(ml<=.08)return;
 const cap=glasses[id].capacity, layers=getLayers(), avg=liquidAverage(),mix=clamp(state.mix,0,1),stir=state.stirMotion||0;
 const time=t*.001,impact=state.pour?Math.max(0,Math.sin(Math.PI*clamp((t-state.pour.start)/state.pour.duration,0,1))):0;
 const waveAmp=.6+2.7*stir+2.8*impact;
 const wave=x=>waveAmp*(.55*Math.sin(x*.038+time*5.1)+.28*Math.sin(x*.088-time*3.6));
 ctx.save();mask(ctx,id,4);ctx.clip();
 let used=0,topColor=avg;
 for(const p of layers){const take=Math.min(p.ml,Math.max(0,ml-used));if(take<=.01)break;
  const yTop=liquidY(id,used+take,cap),yBottom=liquidY(id,used,cap);
  let shade=blend(p.layerColor,avg,mix);topColor=shade;
  let left= CX-radScreen(id,yTop),right=CX+radScreen(id,yTop);
  const gr=ctx.createLinearGradient(left,yTop,right,yTop);
  gr.addColorStop(0,color(bright(shade,-.42),.94));gr.addColorStop(.19,color(bright(shade,.06),.91));gr.addColorStop(.39,color(bright(shade,.25),.94));
  gr.addColorStop(.67,color(bright(shade,.09),.93));gr.addColorStop(.89,color(bright(shade,-.12),.93));gr.addColorStop(1,color(bright(shade,-.39),.95));
  ctx.fillStyle=gr;ctx.beginPath();ctx.moveTo(0,yTop+wave(0));
  for(let x=0;x<=560;x+=7)ctx.lineTo(x,yTop+wave(x)*(used+take>=ml?1:.28));
  ctx.lineTo(560,yBottom+8);ctx.lineTo(0,yBottom+8);ctx.closePath();ctx.fill();
  const grad=ctx.createLinearGradient(0,yTop,0,yBottom);
  grad.addColorStop(0,'rgba(255,252,229,.17)');grad.addColorStop(.3,'rgba(255,255,244,0)');grad.addColorStop(1,'rgba(13,18,32,.16)');
  ctx.fillStyle=grad;ctx.fillRect(0,yTop,560,Math.max(2,yBottom-yTop)+6);
  if(used>0&&mix<.88){
    ctx.beginPath();const width=radScreen(id,yBottom)-5;
    ctx.ellipse(CX,yBottom,Math.max(2,width),Math.max(1,width*g.ellipse),0,0,Math.PI);
    ctx.strokeStyle=`rgba(246,242,217,${.36*(1-mix)})`;ctx.lineWidth=1.25;ctx.stroke();
  }
  used+=p.ml;
 }
 // Visible fluid surface ellipse; mask makes it disappear naturally at the glass wall.
 const surface=liquidY(id,ml,cap),sr=radScreen(id,surface)-3,ry=Math.max(2,sr*g.ellipse);
 const front=ctx.createRadialGradient(CX-18,surface-ry*.65,2,CX,surface,Math.max(12,sr));
 front.addColorStop(0,color(bright(topColor,.46),.50));front.addColorStop(.6,color(bright(topColor,.24),.24));front.addColorStop(1,color(bright(topColor,-.18),.36));
 ctx.fillStyle=front;ellipse(ctx,CX,surface+wave(CX)*.15,sr,ry);ctx.fill();
 ctx.strokeStyle='rgba(250,249,227,.58)';ctx.lineWidth=1.3;
 ctx.beginPath();ctx.ellipse(CX,surface,sr,ry,0,0,Math.PI);ctx.stroke();
 ctx.strokeStyle='rgba(244,247,245,.23)';ctx.lineWidth=.85;
 ctx.beginPath();ctx.ellipse(CX,surface,sr,ry,0,Math.PI,TAU);ctx.stroke();
 if(stir>.07||impact>.1){const strength=clamp(stir*.8+impact*.8,0,1);
  for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(CX+8,surface,16+k*14,3+k*2,0,0,Math.PI);
  ctx.strokeStyle=`rgba(255,253,234,${Math.max(0,.36-k*.085)*strength})`;ctx.lineWidth=1.1;ctx.stroke()}
 }
 // Small, bounded bubbles only for carbonated ingredients.
 if(state.portions.some(p=>['soda','tonic'].includes(p.id))){
  const down=liquidY(id,0,cap);
  for(let j=0;j<20;j++){
    let f=(j*23+t*.016)%(down-surface+10),y=down-f;
    if(y<surface+9||y>down-6)continue;
    const r=radScreen(id,y)*.75,x=CX+Math.sin(j*13.4)*r;
    ctx.strokeStyle=`rgba(247,255,251,${.15+(j%4)*.035})`;ctx.lineWidth=.8;
    ellipse(ctx,x,y,1.1+j%3*.35,1.7);ctx.stroke();
  }
 }
 if(state.decor.has('ice'))drawIce(ctx,id,surface,t);
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
 ctx.save();ground(ctx,id);liquid(ctx,options);
 // The original transparent glass artwork provides the optics, edges and facets.
 // This image is overlaid on the liquid. The geometry mask is never stroked.
 ctx.drawImage(g.img,IMG.x,IMG.y,IMG.w,IMG.h);
 garnish(ctx,id,state,t);pour(ctx,id,state,t,glasses[id].capacity);
 ctx.restore();return true;
}
window.LCArtV5={draw,liquidY,hitTest,ready:()=>Object.values(loaded).every(x=>x==='ready'),specs,assetRect:IMG};
})();