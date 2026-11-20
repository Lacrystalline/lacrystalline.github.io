/* La Crystalline — interactive artwork V4.
 * Glass and liquid are still independent Canvas geometry, NOT a static screenshot.
 * This layer adds atelier lighting, glass caustics and live garnishes around V3 fluid physics.
 */
(function(){
'use strict';
const TAU=Math.PI*2, cx=280;
let backdrop=null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function ellipse(c,x,y,rx,ry,rot=0){c.beginPath();c.ellipse(x,y,rx,ry,rot,0,TAU)}
function buildBackdrop(){
 const can=document.createElement('canvas');can.width=560;can.height=620;
 const c=can.getContext('2d');
 // A narrow, defocused liquor cabinet: warm lanterns against ink-blue marble.
 let back=c.createLinearGradient(0,0,0,620);
 back.addColorStop(0,'#0b1729');back.addColorStop(.43,'#111b2d');back.addColorStop(.73,'#081424');back.addColorStop(1,'#0b1824');
 c.fillStyle=back;c.fillRect(0,0,560,620);
 let halo=c.createRadialGradient(277,295,18,277,295,275);
 halo.addColorStop(0,'rgba(92,162,177,.18)');halo.addColorStop(.6,'rgba(50,110,142,.07)');halo.addColorStop(1,'rgba(20,69,104,0)');
 c.fillStyle=halo;c.fillRect(0,0,560,570);
 // Bottles remain silhouettes, outside the central glass; no distracting sharp outlines.
 for(const [x,y,w,h,a] of [[52,157,27,190,.20],[95,139,34,210,.13],[145,124,24,155,.13],[420,118,28,185,.14],[468,155,27,170,.20],[506,117,19,200,.11]]){
   const g=c.createLinearGradient(x,0,x+w,0);
   g.addColorStop(0,'rgba(11,27,37,0)');g.addColorStop(.22,`rgba(166,127,79,${a*.45})`);
   g.addColorStop(.53,`rgba(53,83,99,${a*.70})`);g.addColorStop(.8,`rgba(213,155,76,${a*.22})`);g.addColorStop(1,'rgba(10,27,38,0)');
   c.fillStyle=g;c.fillRect(x,y,w,h);
   c.fillStyle=`rgba(205,172,107,${a*.45})`;c.fillRect(x+w*.34,y-17,w*.30,19);
 }
 // Brass shelving and muted lantern bokeh.
 c.fillStyle='rgba(190,142,88,.10)';c.fillRect(24,350,512,2);
 for(const [x,y,rad,opacity] of [[65,125,66,.21],[488,108,76,.20],[421,290,46,.10],[114,258,46,.10],[505,370,36,.09]]){
  const b=c.createRadialGradient(x,y,1,x,y,rad);
  b.addColorStop(0,`rgba(255,215,136,${opacity})`);b.addColorStop(.22,`rgba(221,160,92,${opacity*.42})`);b.addColorStop(1,'rgba(202,131,83,0)');
  c.fillStyle=b;c.fillRect(x-rad,y-rad,rad*2,rad*2);
 }
 // Dark marble bar top. Slightly luminous front edge anchors glass feet.
 const top=c.createLinearGradient(0,502,0,620);
 top.addColorStop(0,'rgba(23,36,48,0)');top.addColorStop(.18,'rgba(26,34,42,.73)');top.addColorStop(.52,'rgba(14,22,30,.93)');top.addColorStop(1,'rgba(11,18,25,.97)');
 c.fillStyle=top;c.fillRect(0,493,560,127);
 c.strokeStyle='rgba(227,179,103,.21)';c.lineWidth=.8;c.beginPath();c.moveTo(36,542);c.lineTo(524,542);c.stroke();
 for(let i=0;i<9;i++){
   const y=550+i*7,x=35+((i*73)%180),len=70+(i*57)%210;
   c.strokeStyle=`rgba(199,185,156,${.025+(i%3)*.01})`;
   c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+len*.5,y+2,x+len,y);c.stroke();
 }
 backdrop=can;return can;
}
function pwidth(g,glass,y){
 const t=clamp((g.bottom-y)/(g.bottom-g.top),0,1);
 return glass==='coupe'?g.wt*Math.sqrt(Math.max(0,1-(1-t)*(1-t))):g.wb+(g.wt-g.wb)*t;
}
function bowl(c,g,glass,inset=5){
 c.beginPath();c.moveTo(cx-pwidth(g,glass,g.top)+inset,g.top);
 for(let y=g.top;y<=g.bottom;y+=3)c.lineTo(cx-Math.max(1,pwidth(g,glass,y)-inset),y);
 c.lineTo(cx,g.bottom+3);
 for(let y=g.bottom;y>=g.top;y-=3)c.lineTo(cx+Math.max(1,pwidth(g,glass,y)-inset),y);
 c.closePath();
}
function drawCutGlass(c,g,glass){
 if(glass==='coupe')return;
 // Clean vertical optical cuts only. No diamond lattice or faux gemstones.
 const y0=g.bottom-(glass==='rocks'?96:84),y1=g.bottom-6;
 c.save();bowl(c,g,glass,5);c.clip();
 const num=glass==='rocks'?17:14;
 for(let k=0;k<num;k++){
  const x=cx+(k-(num-1)/2)*((glass==='rocks'?245:172)/num);
  const spec=Math.cos((k-(num-1)/2)/num*Math.PI);
  c.beginPath();c.moveTo(x,y0+Math.abs(x-cx)*.035);c.quadraticCurveTo(x+(x-cx)*.075,(y0+y1)*.55,x+(x-cx)*.13,y1);
  c.strokeStyle=`rgba(246,236,213,${.055+Math.max(0,spec)*.095})`;
  c.lineWidth=k%4===0?1.8:.85;c.stroke();
 }
 // Reflected warm caustic bends upward from the thick glass base.
 const glow=c.createRadialGradient(cx+34,g.bottom-17,6,cx,g.bottom-17,130);
 glow.addColorStop(0,'rgba(255,212,142,.17)');glow.addColorStop(.54,'rgba(243,201,145,.055)');glow.addColorStop(1,'rgba(243,201,145,0)');
 c.fillStyle=glow;c.fillRect(cx-g.wt-14,y0-9,g.wt*2+28,y1-y0+25);
 c.restore();
}
function drawVeins(c,g,glass,state,t,yFor){
 if(!state.portions.length)return;
 const liquidTop=yFor(clamp(state.visualML,0,state.portions.reduce((s,p)=>s+p.ml,0)));
 const stir=clamp(state.stirMotion,0,1),mix=clamp(state.mix,0,1);
 const opacity=clamp(stir*.20+(mix>.03&&mix<.96?.075:0),0,.24);
 if(opacity<.015)return;
 c.save();bowl(c,g,glass,8);c.clip();
 const height=Math.max(1,g.bottom-liquidTop);
 for(let k=0;k<9;k++){
  const y=liquidTop+10+(k+.45)/10*height;
  const width=pwidth(g,glass,y)*.68;
  if(width<12)continue;
  const phase=t*.0015+k*1.13;
  c.strokeStyle=`rgba(${k%2?250:207},${k%2?231:241},${k%2?198:250},${opacity*(.65+.32*Math.sin(phase))})`;
  c.lineWidth=1.25+k%3*.35;c.beginPath();
  c.moveTo(cx-width*.75,y+Math.sin(phase)*5);
  c.bezierCurveTo(cx-width*.24,y-7+Math.sin(phase)*10,cx+width*.26,y+9*Math.cos(phase),cx+width*.68,y-3);
  c.stroke();
 }
 c.restore();
}
function drawGlassBloom(c,g,glass,t){
 const y=g.top+45;
 c.save();
 // Controlled highlight, based on a faint offset light source rather than sparkling sprites.
 const x=cx-pwidth(g,glass,y)+22;
 const b=c.createLinearGradient(x-4,y,x+37,y+25);
 b.addColorStop(0,'rgba(255,248,222,0)');b.addColorStop(.23,'rgba(255,253,237,.085)');b.addColorStop(.41,'rgba(251,255,248,.13)');b.addColorStop(.55,'rgba(227,248,252,.05)');b.addColorStop(1,'rgba(244,251,247,0)');
 c.fillStyle=b;c.save();bowl(c,g,glass,2);c.clip();c.fillRect(x-4,y-10,47,Math.min(205,g.bottom-y));c.restore();
 const rad=glass==='coupe'?9:6;
 c.strokeStyle='rgba(247,222,184,.10)';c.lineWidth=.8;
 ellipse(c,cx,g.top-1,pwidth(g,glass,g.top)+5,glass==='coupe'?24:glass==='rocks'?18:14,-.02);
 c.stroke();c.restore();
}
function flower(c,x,y,t){
 c.save();c.translate(x,y);c.rotate(.09);
 const bob=Math.sin(t*.00046)*1.3;
 c.strokeStyle='rgba(167,178,107,.64)';c.lineWidth=1.4;c.beginPath();c.moveTo(0,bob+2);c.quadraticCurveTo(-6,bob+24,4,bob+39);c.stroke();
 for(let k=0;k<5;k++){
  const ang=k*TAU/5-.2,px=Math.cos(ang)*12,py=Math.sin(ang)*11+bob;
  const petals=c.createRadialGradient(px-2,py-2,1,px,py,12);
  petals.addColorStop(0,'rgba(240,217,255,.94)');petals.addColorStop(.58,'rgba(167,145,207,.93)');petals.addColorStop(1,'rgba(116,102,166,.69)');
  c.save();c.translate(px,py);c.rotate(ang+.2);c.fillStyle=petals;
  c.beginPath();c.ellipse(0,0,11.4,8.4,0,0,TAU);c.fill();
  c.strokeStyle='rgba(238,224,252,.46)';c.lineWidth=.85;c.stroke();c.restore();
 }
 c.fillStyle='#eacf8c';ellipse(c,0,bob,5.1,5.1);c.fill();
 for(let k=0;k<6;k++){const a=k*TAU/6;c.fillStyle='rgba(117,93,87,.72)';ellipse(c,Math.cos(a)*2.7,Math.sin(a)*2.7+bob,1,1);c.fill()}
 c.restore();
}
function herb(c,x,y,t){
 c.save();c.translate(x,y);c.rotate(-.17);
 c.strokeStyle='#a7ad77';c.lineWidth=2.2;c.lineCap='round';
 c.beginPath();c.moveTo(0,33);c.quadraticCurveTo(-3,-12,Math.sin(t*.0005)*1.1,-42);c.stroke();
 for(let i=0;i<12;i++){
  const yy=-37+i*5.8,scale=.85+Math.sin(i*.6)*.1;
  for(const side of [-1,1]){
   c.strokeStyle=i%3===0?'rgba(179,197,125,.93)':'rgba(101,137,99,.94)';
   c.lineWidth=1.55;c.beginPath();c.moveTo(0,yy+3);
   c.quadraticCurveTo(side*7,yy,side*(15-i*.35)*scale,yy-9);c.stroke();
  }
 }
 c.restore();
}
function drawReflection(c,g,glass,t){
 const alpha=.12;const x=cx,y=548;
 const refl=c.createRadialGradient(x,y+14,4,x,y+14,106);
 refl.addColorStop(0,`rgba(245,213,151,${alpha})`);refl.addColorStop(.42,'rgba(155,206,221,.045)');refl.addColorStop(1,'rgba(142,202,227,0)');
 c.fillStyle=refl;c.fillRect(cx-116,y,232,57);
}
window.LCArtV4={draw(options){
 const {ctx:c,state,t,glasses,vToY}=options,g=glasses[state.glass];
 if(!g)return;
 c.save();c.drawImage(backdrop||buildBackdrop(),0,0);
 // The V3 renderer keeps actual liquid height, stirring and pour timing interactive.
 if(window.LCArtV3?.draw)window.LCArtV3.draw(options);
 drawVeins(c,g,state.glass,state,t,vToY);
 drawCutGlass(c,g,state.glass);
 drawGlassBloom(c,g,state.glass,t);
 if(state.decor?.has('rosemary'))herb(c,cx+g.wt*.72,g.top-16,t);
 if(state.decor?.has('flower'))flower(c,cx-g.wt*.38,g.top-18,t);
 drawReflection(c,g,state.glass,t);
 c.restore();
}};
})();