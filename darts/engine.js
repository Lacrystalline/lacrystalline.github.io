/* 水晶庭・水晶飛鏢 共用擲鏢引擎（單人 COUNT-UP 與店員對戰共用）
 * 靶面幾何、繪製、「按住瞄準 → 往上甩出」輸入、力道／方向回饋、音效。
 * 落點以 mm 表示：靶心為原點、x 向右、y 向下（與伺服器 darts_hit 相同）。
 */
(()=>{
'use strict';
const ORDER=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const R_BULL=6.35,R_OBULL=15.9,R_T_IN=99,R_T_OUT=107,R_D_IN=162,R_D_OUT=170,R_FRAME=225;

// ---------------- 擲鏢手感參數（以蒙地卡羅模擬調校難度） ----------------
// 速度單位：螢幕像素／毫秒（px/ms），以實際手指或滑鼠移動量計
const TUNING={
  IDEAL_TOUCH:1.2,   // 手機理想甩出速度（px/ms）
  IDEAL_MOUSE:1.6,   // 滑鼠理想甩出速度（px/ms）
  MIN_SPEED:0.35,    // 甩出峰值低於此速度 = 沒有擲出（取消）
  AIM_SPEED:0.25,    // 低於此速度的移動視為瞄準
  FLICK_WINDOW:180,  // 放手前多少毫秒內找甩出的峰值速度
  POWER_MM:110,      // 力道誤差 100% 時的上下偏移（mm）
  ANGLE_MM:130,      // 方向誤差 tan(θ)=1 時的左右偏移（mm）
  SWAY_MM:10,        // 瞄準時手的自然晃動幅度（mm）
  NOISE_MM:3,        // 每鏢不可控的微小誤差（mm）
  TOUCH_LIFT:64      // 觸控時準星在指尖上方（px），避免被手指擋住
};

function hitTestMM(x,y){
  const r=Math.hypot(x,y);
  if(r<=R_BULL)return {s:25,m:2};
  if(r<=R_OBULL)return {s:25,m:1};
  if(r>R_D_OUT)return {s:0,m:0};
  const a=Math.atan2(y,x)*180/Math.PI;
  const s=ORDER[((Math.floor((a+90)/18+0.5)%20)+20)%20];
  return {s,m:(r>=R_T_IN&&r<=R_T_OUT)?3:(r>=R_D_IN)?2:1};
}
const pts=h=>h.s===25?50:h.s*h.m;
const label=h=>h.s===0?'MISS':h.s===25?(h.m===2?'D-BULL':'BULL'):(h.m===3?'T':h.m===2?'D':'S')+h.s;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

// ---------------- 音效 ----------------
let ac=null;
function audio(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();}catch(e){}}
function thunk(miss){
  if(!ac)return;
  const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
  o.type='triangle';o.frequency.setValueAtTime(miss?140:220,t);o.frequency.exponentialRampToValueAtTime(60,t+.09);
  g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);
  o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.13);
}
function chime(n=3){
  if(!ac)return;
  [880,1108.7,1318.5,1760,2217.5].slice(0,n).forEach((f,i)=>{const t=ac.currentTime+i*.08,o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.6);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.6);});
}

function create(opts){
  const cv=opts.canvas,ctx=cv.getContext('2d');
  const canThrow=opts.canThrow||(()=>true);
  const onLand=opts.onLand||(()=>{});
  let W=600,DPR=1,C=300,K=1,boardCache=null;
  let darts=[];            // 已插在靶上的鏢 {x,y,tone}（mm）
  let flights=[];          // 飛行中的鏢 {x,y,t0,local,tone}
  let aim=null,pressed=false,isTouch=false,pointerId=null,samples=[],hist=[];

  function resize(){
    const box=cv.getBoundingClientRect();
    DPR=Math.min(window.devicePixelRatio||1,2.5);
    W=Math.max(200,Math.round(box.width));
    cv.width=Math.round(W*DPR);cv.height=Math.round(W*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    C=W/2;K=(W/2)/R_FRAME;boardCache=null;
  }
  const toPx=(x,y)=>({x:C+x*K,y:C+y*K});

  function drawBoard(){
    if(boardCache){ctx.drawImage(boardCache,0,0,W,W);return;}
    const off=document.createElement('canvas');off.width=cv.width;off.height=cv.height;
    const g=off.getContext('2d');g.setTransform(DPR,0,0,DPR,0,0);
    const fr=g.createRadialGradient(C,C,R_D_OUT*K,C,C,R_FRAME*K);
    fr.addColorStop(0,'#0c1525');fr.addColorStop(.85,'#09101c');fr.addColorStop(1,'#1b2a40');
    g.fillStyle=fr;g.beginPath();g.arc(C,C,R_FRAME*K,0,Math.PI*2);g.fill();
    g.strokeStyle='rgba(216,184,122,.55)';g.lineWidth=1.4;g.beginPath();g.arc(C,C,R_FRAME*K-2,0,Math.PI*2);g.stroke();
    const ring=(r0,r1,a0,a1,col)=>{g.fillStyle=col;g.beginPath();g.arc(C,C,r1*K,a0,a1);g.arc(C,C,r0*K,a1,a0,true);g.closePath();g.fill();};
    for(let i=0;i<20;i++){
      const a0=((-90+18*i-9)*Math.PI)/180,a1=((-90+18*i+9)*Math.PI)/180,dark=i%2===0;
      const base=dark?'#121f33':'#cfd9e3',acc=dark?'#3fa9ae':'#c9a466';
      ring(R_OBULL,R_T_IN,a0,a1,base);ring(R_T_IN,R_T_OUT,a0,a1,acc);
      ring(R_T_OUT,R_D_IN,a0,a1,base);ring(R_D_IN,R_D_OUT,a0,a1,acc);
    }
    g.fillStyle='#3fa9ae';g.beginPath();g.arc(C,C,R_OBULL*K,0,Math.PI*2);g.fill();
    g.fillStyle='#d8b87a';g.beginPath();g.arc(C,C,R_BULL*K,0,Math.PI*2);g.fill();
    g.strokeStyle='rgba(225,232,240,.55)';g.lineWidth=Math.max(.6,K*.9);
    for(const r of [R_BULL,R_OBULL,R_T_IN,R_T_OUT,R_D_IN,R_D_OUT]){g.beginPath();g.arc(C,C,r*K,0,Math.PI*2);g.stroke();}
    for(let i=0;i<20;i++){const a=((-90+18*i-9)*Math.PI)/180;g.beginPath();g.moveTo(C+Math.cos(a)*R_OBULL*K,C+Math.sin(a)*R_OBULL*K);g.lineTo(C+Math.cos(a)*R_D_OUT*K,C+Math.sin(a)*R_D_OUT*K);g.stroke();}
    const gl=g.createRadialGradient(C-W*.12,C-W*.16,0,C,C,R_D_OUT*K);
    gl.addColorStop(0,'rgba(255,255,255,.10)');gl.addColorStop(.6,'rgba(255,255,255,0)');
    g.fillStyle=gl;g.beginPath();g.arc(C,C,R_D_OUT*K,0,Math.PI*2);g.fill();
    g.fillStyle='#e8edf2';g.textAlign='center';g.textBaseline='middle';
    g.font=`500 ${Math.round(30*K)}px "Cormorant Garamond",serif`;
    for(let i=0;i<20;i++){const a=((-90+18*i)*Math.PI)/180,rr=(R_D_OUT+R_FRAME)/2*K;g.fillText(String(ORDER[i]),C+Math.cos(a)*rr,C+Math.sin(a)*rr);}
    boardCache=off;ctx.drawImage(off,0,0,W,W);
  }
  function swayOffset(now){
    const t=now/1000,a=TUNING.SWAY_MM*K;
    return {x:a*(.62*Math.sin(t*1.9)+.38*Math.sin(t*3.7+1.3)),y:a*(.58*Math.cos(t*1.5+.4)+.42*Math.sin(t*2.9+2.1))};
  }
  function drawDart(x,y,scale,alpha,tone){
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(scale,scale);ctx.rotate(-.55);
    const L=W*.12,gold=tone==='gold';
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(3,4,3,1.6,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#cfd6de';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,L*.22);ctx.stroke();
    const bg=ctx.createLinearGradient(-3,0,3,0);
    if(gold){bg.addColorStop(0,'#8a6a2f');bg.addColorStop(.5,'#f1d9a3');bg.addColorStop(1,'#8a6a2f');}
    else{bg.addColorStop(0,'#2f7f86');bg.addColorStop(.5,'#9fe6e8');bg.addColorStop(1,'#2f7f86');}
    ctx.fillStyle=bg;ctx.beginPath();ctx.moveTo(-2.6,L*.22);ctx.lineTo(2.6,L*.22);ctx.lineTo(3.2,L*.55);ctx.lineTo(-3.2,L*.55);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#8a94a3';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,L*.55);ctx.lineTo(0,L*.78);ctx.stroke();
    ctx.fillStyle=gold?'rgba(127,211,214,.92)':'rgba(216,184,122,.92)';
    ctx.beginPath();ctx.moveTo(0,L*.7);ctx.lineTo(-L*.17,L);ctx.lineTo(0,L*.93);ctx.lineTo(L*.17,L);ctx.closePath();ctx.fill();
    ctx.restore();
    if(scale<=1.01){ctx.fillStyle='rgba(10,14,20,.9)';ctx.beginPath();ctx.arc(x,y,1.7,0,Math.PI*2);ctx.fill();}
  }
  function drawReticle(x,y){
    ctx.save();
    ctx.strokeStyle=pressed?'rgba(216,184,122,.95)':'rgba(127,211,214,.9)';ctx.lineWidth=1.4;
    ctx.beginPath();ctx.arc(x,y,TUNING.SWAY_MM*K*.7+4,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x-3,y);ctx.moveTo(x+3,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y-3);ctx.moveTo(x,y+3);ctx.lineTo(x,y+10);ctx.stroke();
    if(pressed){   // 按住時提示：往上甩
      const r=TUNING.SWAY_MM*K*.7+12,bob=Math.sin(performance.now()/160)*3;
      ctx.fillStyle='rgba(216,184,122,.9)';
      for(let k=0;k<2;k++){const yy=y-r-k*9+bob;ctx.beginPath();ctx.moveTo(x,yy-7);ctx.lineTo(x-6,yy);ctx.lineTo(x+6,yy);ctx.closePath();ctx.globalAlpha=k?.45:.9;ctx.fill();}
    }
    ctx.restore();
  }
  function frame(now){
    ctx.clearRect(0,0,W,W);
    drawBoard();
    for(const d of darts){const p=toPx(d.x,d.y);drawDart(p.x,p.y,1,1,d.tone);}
    for(const f of flights.slice()){
      const p=Math.min(1,(now-f.t0)/280),e=1-Math.pow(1-p,3),q=toPx(f.x,f.y);
      drawDart(q.x+(1-e)*W*.05,q.y+(1-e)*W*.2,1+2.2*(1-e),.35+.65*e,f.tone);
      if(p>=1){
        flights.splice(flights.indexOf(f),1);
        darts.push({x:f.x,y:f.y,tone:f.tone});
        const h=hitTestMM(f.x,f.y);thunk(h.s===0);
        if(f.local)onLand(h,{x:f.x,y:f.y});
        else if(f.cb)f.cb(h);
      }
    }
    if(aim&&!flights.length&&canThrow()){const o=swayOffset(now);drawReticle(aim.x+o.x,aim.y+o.y);}
    requestAnimationFrame(frame);
  }

  // ---------------- 輸入：按住瞄準 → 往上甩出 ----------------
  function toBoard(ev){
    const r=cv.getBoundingClientRect();
    return {x:(ev.clientX-r.left)*(W/r.width),y:(ev.clientY-r.top)*(W/r.height)};
  }
  function pushSample(ev){
    const p=toBoard(ev);samples.push({t:performance.now(),x:p.x,y:p.y});
    const cut=performance.now()-800;while(samples.length>2&&samples[0].t<cut)samples.shift();
    return p;
  }
  // 取樣座標是畫布 CSS 像素；速度 = px/ms
  function segSpeed(i){
    if(i<1)return 0;const a=samples[i-1],b=samples[i],dt=Math.max(4,b.t-a.t);
    return Math.hypot(b.x-a.x,b.y-a.y)/dt;
  }
  // 甩出起點：從放手往回找，最後一個仍在慢速瞄準的位置
  function flickStart(){
    const n=samples.length-1;let i=n;
    while(i>0&&samples[n].t-samples[i].t<30)i--;
    while(i>0&&segSpeed(i)>=TUNING.AIM_SPEED)i--;
    return samples[i];
  }
  // 甩出速度：放手前 FLICK_WINDOW 毫秒內，取「往上」最快的一段（每段至少 20ms）
  // 放手瞬間的重複取樣、手指收尾減速都不會把速度拉低
  function flickVelocity(){
    const n=samples.length;if(n<2)return {vx:0,vy:0};
    const end=samples[n-1].t;let best={vx:0,vy:0};
    for(let i=n-2;i>=0&&end-samples[i].t<=FLICK_WINDOW_MS();i--){
      for(let j=i+1;j<n;j++){
        const dt=samples[j].t-samples[i].t;if(dt<20)continue;
        const vx=(samples[j].x-samples[i].x)/dt,vy=(samples[j].y-samples[i].y)/dt;
        if(-vy>-best.vy)best={vx,vy};
        break;
      }
    }
    return best;
  }
  const FLICK_WINDOW_MS=()=>TUNING.FLICK_WINDOW;
  const lift=()=>isTouch?TUNING.TOUCH_LIFT:0;
  cv.addEventListener('pointermove',ev=>{
    if(pointerId!==null&&ev.pointerId!==pointerId)return;
    isTouch=ev.pointerType!=='mouse';
    if(!pressed){if(!isTouch){const p=toBoard(ev);aim={x:p.x,y:p.y};}return;}
    const p=pushSample(ev);
    if(segSpeed(samples.length-1)<TUNING.AIM_SPEED)aim={x:p.x,y:p.y-lift()};
  });
  cv.addEventListener('pointerleave',()=>{if(!pressed)aim=null;});
  cv.addEventListener('pointerdown',ev=>{
    audio();
    if(flights.length||!canThrow())return;
    ev.preventDefault();
    isTouch=ev.pointerType!=='mouse';
    pointerId=ev.pointerId;try{cv.setPointerCapture(ev.pointerId);}catch(e){}
    pressed=true;samples=[];
    const p=pushSample(ev);aim={x:p.x,y:p.y-lift()};
  });
  function release(ev){
    if(ev.pointerId!==pointerId)return;
    pointerId=null;
    if(!pressed)return;
    pushSample(ev);pressed=false;
    if(flights.length||!canThrow()||!aim){samples=[];return;}
    const v=flickVelocity(),st=flickStart();samples=[];
    if(st)aim={x:st.x,y:st.y-lift()};
    const up=-v.vy,ideal=isTouch?TUNING.IDEAL_TOUCH:TUNING.IDEAL_MOUSE;
    if(up<TUNING.MIN_SPEED){verdict('沒有擲出：按住後<b>往上快速一甩</b>，邊甩邊放手。');if(isTouch)aim=null;return;}
    const now=performance.now(),o=swayOffset(now);
    const power=Math.max(-1,Math.min(1.5,(up-ideal)/ideal));
    const theta=Math.atan2(v.vx,up);
    const px=aim.x+o.x+Math.tan(Math.max(-1,Math.min(1,theta)))*TUNING.ANGLE_MM*K+gauss()*TUNING.NOISE_MM*K;
    const py=aim.y+o.y-power*TUNING.POWER_MM*K+gauss()*TUNING.NOISE_MM*K;
    showCoach(power,theta);
    flights.push({x:(px-C)/K,y:(py-C)/K,t0:now,local:true,tone:opts.localTone||'crys'});
    if(isTouch)aim=null;
  }
  cv.addEventListener('pointerup',release);
  cv.addEventListener('pointercancel',ev=>{if(ev.pointerId===pointerId){pointerId=null;pressed=false;samples=[];}});

  // ---------------- 回饋 ----------------
  function verdict(html){if(opts.verdictEl)opts.verdictEl.innerHTML=html;}
  function showCoach(power,theta){
    hist.push(power);if(hist.length>6)hist.shift();
    renderGauge();
    const pc=Math.round(power*100),deg=Math.round(theta*180/Math.PI);
    const pw=Math.abs(pc)<=10?'<b>剛好</b>':pc<0?`偏輕 ${-pc}%（落低）`:`偏重 ${pc}%（飛高）`;
    const dr=Math.abs(deg)<=2?'<b>筆直</b>':deg<0?`偏左 ${-deg}°`:`偏右 ${deg}°`;
    verdict(`力道 ${pw}　·　方向 ${dr}`);
  }
  function renderGauge(){
    const g=opts.gaugeEl;if(!g)return;
    const pos=p=>Math.max(2,Math.min(98,50+p*50/1.2));
    g.querySelectorAll('.mk').forEach(e=>e.remove());
    hist.forEach((p,i)=>{const m=document.createElement('span');m.className='mk'+(i<hist.length-1?' old':'');m.style.left=pos(p)+'%';g.appendChild(m);});
  }
  function flash(txt,award,sub){
    const f=opts.flashEl;if(!f)return;
    f.className='flash'+(award?' award':'');
    f.innerHTML=esc(txt)+(sub?`<small>${esc(sub)}</small>`:'');
    requestAnimationFrame(()=>f.classList.add('show'));
    clearTimeout(flash.t);flash.t=setTimeout(()=>f.classList.remove('show'),award?1300:650);
  }

  window.addEventListener('resize',resize);
  resize();requestAnimationFrame(frame);

  return {
    hitTestMM,pts,label,flash,chime,verdict,
    isBusy:()=>flights.length>0,
    clearDarts(){darts=[];},
    // 依伺服器狀態重畫靶上的鏢（不播動畫）
    setDarts(list){darts=(list||[]).map(d=>({x:+d.x,y:+d.y,tone:d.tone}));},
    // 遠端（對手）的一鏢：播放飛行動畫後插上靶
    throwRemote(x,y,tone,cb){flights.push({x:+x,y:+y,t0:performance.now(),local:false,tone,cb});},
    resetCoach(){hist=[];renderGauge();verdict('按住瞄準，往上甩出放手。');},
    get dartCount(){return darts.length;}
  };
}

window.CrystalDarts={create,hitTestMM,pts,label,esc,TUNING};
})();
