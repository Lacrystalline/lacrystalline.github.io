/* La Crystalline V10.6 layout: foldable side panels and a compact desktop page.
   Panels that are set once per drink (glass, serving ice, presets, taste, garnish) fold to a single
   line that shows the current choice; the ingredient list and the actions stay open. The fold state
   is remembered per browser. The mixing-ice panel opens by itself while a stir / shake is being
   prepared, because its button is part of that flow. */
(()=>{
'use strict';
const KEY='lc-fold-v2';let saved={};
try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){saved={}}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}};
const h=window.mixologyHooks,s=h&&h.state,$=q=>document.querySelector(q);
const folds=[];

const css=document.createElement('style');css.textContent=`
.fold-head{cursor:pointer;user-select:none;position:relative;padding-right:22px}
.fold-head:focus-visible{outline:1px solid #e5c38e;outline-offset:3px;border-radius:4px}
.fold-head:after{content:"▾";position:absolute;right:0;top:50%;transform:translateY(-50%) rotate(-90deg);color:#c9a66b;font-size:11px;transition:transform .18s}
.fold.open>.fold-head:after{transform:translateY(-50%) rotate(0)}
.fold-sum{display:block;margin-top:5px;font-size:11.5px;color:#e6cf9f;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fold.open .fold-sum{display:none}
.fold:not(.open)>.fold-head>span:not(.fold-sum){display:none}
.fold-head .fold-sum{margin:0 0 0 auto;padding-left:10px}
.fold:not(.open)>.fold-body{display:none}
.fold-body{padding-top:2px}
.stage .v6-work{width:calc(100% - 192px);max-width:560px;margin:10px auto 0;box-sizing:border-box}
@media(max-width:720px){.stage .v6-work{width:calc(100% - 16px);margin:26px auto 0}}
.fold{margin:0}
.fold+.fold,.fold+.hairline{margin-top:0}
.side .fold{padding:2px 0 10px}
.side .fold>.fold-head h2,.side .fold>.fold-head.minorh{margin-bottom:0}
@media(min-width:1021px){
 .topbar{height:60px}
 .shell{padding-top:14px}
 .intro{margin:0 0 12px}
 .intro h1{font-size:clamp(21px,1.7vw,27px)}
 .intro .eyebrow{font-size:9.5px}
 .livebar{padding:9px 14px;margin-bottom:12px}
 .layout{align-items:start}
 .side{padding:16px 15px}
 .side .hairline{margin:10px 0}
 .side .sidesub{margin:3px 0 8px}
 .stage{position:sticky;top:8px}
 .stage-inner{min-height:0!important;padding:16px 14px 12px}
 .glass-canvas-wrap{max-width:min(565px,calc((100vh - 250px)*560/620))!important;width:100%}
 .stage .v6-work:not([hidden])~.glass-canvas-wrap{max-width:min(565px,calc((100vh - 320px)*560/620))!important}
 .ingredients{gap:6px}
 .ing{min-height:58px;padding:7px 8px 6px 10px;gap:2px}
 .ing-meta{display:none}
}
@media(min-width:1300px){
 .ingredients{grid-template-columns:repeat(3,minmax(0,1fr))}
 .ing{padding-left:8px}
 .ing-head{gap:6px}
 .ing .plus{bottom:5px;font-size:17px}
 .glass-options .glass-choice{padding-top:8px;padding-bottom:8px}
 .presets .preset{padding-top:9px;padding-bottom:9px}
}`;
document.head.appendChild(css);

// Make `head` the clickable header of a fold whose body is `nodes` (moved into a wrapper).
function fold(key,head,nodes,opts){
 if(!head||!nodes.length)return null;
 const sec=document.createElement('section');sec.className='fold';sec.dataset.fold=key;
 head.before(sec);
 const body=document.createElement('div');body.className='fold-body';
 nodes.forEach(n=>n&&body.appendChild(n));
 head.classList.add('fold-head');head.setAttribute('role','button');head.tabIndex=0;
 const sum=document.createElement('span');sum.className='fold-sum';head.appendChild(sum);
 sec.append(head,body);
 const open=key in saved?!!saved[key]:!!opts.open;set(sec,open);
 const toggle=()=>{const o=!sec.classList.contains('open');set(sec,o);saved[key]=o;save()};
 head.addEventListener('click',toggle);
 head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
 const f={key,sec,sum,summary:opts.summary,force:opts.force};folds.push(f);return f;
}
function set(sec,open){sec.classList.toggle('open',open);const hd=sec.querySelector('.fold-head');if(hd)hd.setAttribute('aria-expanded',String(open))}
// The siblings after `start` up to (not including) the first element matching `stop`.
function until(start,stop){const out=[];let n=start&&start.nextElementSibling;while(n&&!n.matches(stop)){out.push(n);n=n.nextElementSibling}return out}
const headingOf=(root,txt)=>[...root.querySelectorAll('.sectheading')].find(d=>d.textContent.includes(txt));
const txt=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';

function mount(){
 const left=$('.side.left'),right=$('.side.right');if(!left||!right)return;
 // left: glassware
 const gh=headingOf(left,'選擇酒杯');
 if(gh)fold('glass',gh,until(gh,'.sectheading,section,.hairline'),{summary:()=>{const b=$('.glass-choice.active span');return b?'目前：'+txt(b):''}});
 // left: serving ice form (its own section)
 const ice=$('.v7-ice-panel');
 if(ice){const ih=ice.querySelector('.sectheading');
  if(ih)fold('serveIce',ih,until(ih,'.nothing-stops-here'),{summary:()=>{const a=ice.querySelector('.active,[aria-pressed="true"]');return a?'目前：'+txt(a):''}})}
 // left: mixing ice & order (V6)
 const mh=headingOf(left,'冰塊與調製順序');
 if(mh)fold('prepIce',mh,until(mh,'.nothing-stops-here'),{
  force:()=>(s.flow==='stir'||s.flow==='shake')&&s.flowStep==='preparing',
  summary:()=>s.flow==='build'?(s.layerIntent?'吧匙慢倒：開':'吧匙慢倒：關'):(s.prepIce?'調製用冰：已加入':'調製用冰：未加入')});
 // left: presets
 const ph=headingOf(left,'試玩配方');
 if(ph)fold('presets',ph,until(ph,'.sectheading,section'),{summary:()=>{const n=document.querySelectorAll('.presets .preset').length;return n?n+' 款示範配方':''}});
 // right: taste profile
 const th=right.querySelector('h3.minorh');
 if(th)fold('taste',th,until(th,'.hairline,.sectheading'),{summary:()=>{const v=['Sweet','Sour','Bitter','Spirit'].map(k=>txt($('#val'+k)));return v.every(x=>x==='—'||!x)?'':'甜 '+v[0]+'　酸 '+v[1]+'　苦 '+v[2]+'　酒 '+v[3]}});
 // right: garnish (gets its own heading)
 const deco=$('#decorations');
 if(deco){const gh2=document.createElement('div');gh2.className='sectheading';gh2.innerHTML='<h2>06 · 裝飾</h2><span>GARNISH</span>';
  const tip=deco.previousElementSibling&&deco.previousElementSibling.matches('p.sidesub')?deco.previousElementSibling:null;
  deco.before(gh2);
  fold('garnish',gh2,[deco],{summary:()=>{const on=[...deco.querySelectorAll('.tag.active,[aria-pressed="true"]')].filter(b=>b.dataset.deco!=='ice').map(b=>txt(b).replace(/^＋\s*/,''));return on.length?'已選：'+on.join('、'):'尚未加裝飾'}});
  if(tip)tip.style.margin='8px 0 10px'}
 // one running number down the page (the modules each numbered their own section)
 const ren=[['冰塊與調製順序','03 · 調製用冰與順序'],['選擇酒材','04 · 選擇酒材'],['你的配方','05 · 你的配方'],['調製與濾出','06 · 調製與濾出'],['調製手法','06 · 調製與濾出'],['· 裝飾','07 · 裝飾']];
 for(const h2 of document.querySelectorAll('.side h2'))for(const [k,v] of ren)if(h2.textContent.includes(k)){h2.textContent=v;break}
 refresh();setInterval(refresh,400);
}
function refresh(){
 for(const f of folds){
  if(f.summary){let t='';try{t=f.summary()}catch(e){}f.sum.textContent=t}
  if(f.force){const want=!!f.force();if(want&&!f.sec.classList.contains('open')){set(f.sec,true);f.forced=true}
   else if(!want&&f.forced){f.forced=false;set(f.sec,!!saved[f.key])}}
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
