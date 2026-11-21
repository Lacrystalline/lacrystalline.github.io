/* La Crystalline Mixology V10.4 — painted garnish catalogue.
   Assets: ./assets/garnish/<id>.webp (lossless), resampled to 64 px per real centimetre and cropped
   to the object. w/h are the file's pixel size; (ax, ay) is the anchor in file pixels:
     rim   – top of the cut, where the glass rim sits
     stand – bottom end of the stem (or the lower end for sticks laid along the stem)
     pick  – the pointed tip
     float – the centre of the piece
     sink  – the lowest point of the fruit
   cm is the real size of the longest side of the file's object; drawing scales by the glass's own
   centimetre size (rim diameter), so every garnish keeps its true proportion to each glass. */
(()=>{
'use strict';
const meta={
 lemon_wheel:{slot:'rim',zh:'檸檬輪片',cm:6,w:384,h:388,ax:190.0,ay:272.0},
 lime_wheel:{slot:'rim',zh:'萊姆輪片',cm:4.5,w:281,h:291,ax:140.0,ay:175.0},
 lime_wedge:{slot:'rim',zh:'萊姆角',cm:5,w:323,h:219,ax:159.0,ay:98.0},
 orange_halfwheel:{slot:'rim',zh:'柳橙半月片',cm:7,w:453,h:256,ax:228.0,ay:148.0},
 lemon_twist:{slot:'float',zh:'檸檬皮捲',cm:5,w:323,h:110,ax:161.5,ay:55.0},
 orange_peel:{slot:'float',zh:'柳橙皮',cm:5,w:323,h:132,ax:161.5,ay:66.0},
 dried_orange:{slot:'float',zh:'乾燥柳橙片',cm:6,w:384,h:388,ax:192.0,ay:194.0,squash:1},
 viola:{slot:'float',zh:'三色堇',cm:3,w:194,h:189,ax:97.0,ay:94.5,squash:1},
 star_anise:{slot:'float',zh:'八角',cm:3,w:194,h:192,ax:97.0,ay:96.0,squash:1},
 mint_sprig:{slot:'stand',zh:'薄荷枝',cm:9,w:444,h:582,ax:186.0,ay:578.0},
 rosemary_sprig:{slot:'stand',zh:'迷迭香',cm:12,w:395,h:775,ax:166.0,ay:770.0},
 cinnamon_stick:{slot:'stand',zh:'肉桂棒',cm:7.5,w:485,h:235,ax:3.0,ay:181.0},
 cucumber_ribbon:{slot:'stand',zh:'小黃瓜緞帶',cm:12,w:775,h:254,ax:4.0,ay:137.0},
 olive_pick:{slot:'pick',zh:'橄欖串',cm:8.7,w:562,h:324,ax:4.0,ay:317.0},
 pick_gold:{slot:'pick',zh:'金色酒籤',cm:8.7,w:562,h:446,ax:4.0,ay:439.0},
 cherry_luxardo:{slot:'sink',zh:'酒漬黑櫻桃',cm:4.2,w:256,h:272,ax:76.0,ay:269.0},
 cherry_red:{slot:'sink',zh:'糖漬紅櫻桃',cm:4.5,w:258,h:291,ax:82.0,ay:288.0}
};
const SLOTS=[['rim','杯緣','RIM'],['float','浮面','FLOAT'],['stand','插飾','SPRIG'],['pick','酒籤','PICK'],['sink','杯底','SINK']];
const cache={};
function img(k){if(!meta[k])return null;let c=cache[k];
 if(!c){const im=new Image();im.decoding='async';c=cache[k]={im,ok:false};im.onload=()=>{c.ok=true};im.onerror=()=>{c.err=true;console.warn('Garnish asset failed',k)};im.src='./assets/garnish/'+k+'.webp?v=20261121-v104'}
 return c.ok?c.im:null}
function src(k){return './assets/garnish/'+k+'.webp?v=20261121-v104'}
function preload(){Object.keys(meta).forEach(img)}
if(document.readyState==='complete')setTimeout(preload,400);else window.addEventListener('load',()=>setTimeout(preload,400),{once:true});
window.LCGarnish={meta,SLOTS,img,src,isGarnish:k=>!!meta[k],name:k=>meta[k]?meta[k].zh:k,version:'10.4'};
})();
