/* La Crystalline Mixology V2: server-authorized writes, read-only viewers. */
(()=>{
'use strict';
const $=x=>document.getElementById(x),ui=window.mixologyBridge;
const client=window.supabase?.createClient('https://frphnumgjlpmnkplyfaa.supabase.co','sb_publishable_I-8Y6vRvelc7lysHQ6kLRg_YhfqY_bB',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const r={mode:'local',id:null,host:null,view:null,rev:-1,channel:null,saving:Promise.resolve(),reading:false,repeat:false,lastStir:0,heard:null,samples:[]};
// Clock offset (bartender minus guest). A broadcast reaches the guest at least a short transit after the
// snapshot was taken, so (sentAt - arrival) is a lower bound of the offset; keep the best recent bound.
const TRANSIT=120;
function learnSkew(state,rev){
 const h=r.heard;if(!h||h.rev!==rev||!state||!Number.isFinite(Number(state.sentAt)))return;
 r.samples.push(Number(state.sentAt)-h.at);if(r.samples.length>16)r.samples.shift();
 window.__mixSkew=Math.max(...r.samples)+TRANSIT;
}
// A guest whose browser still holds an older page reloads once into the bartender's version.
function checkVersion(state){
 const v=state&&state.appVer,mine=window.mixologyVersion;
 if(!v||!mine||Number(v)<=Number(mine))return;
 const key='mixology-reload-'+v;
 try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1')}catch(e){}
 location.replace(location.pathname+'?v='+encodeURIComponent(v)+location.hash);
}
const status=t=>{$('liveStatus').textContent=t};
const url=()=>location.origin+location.pathname+'#room='+r.id+'&view='+r.view;
async function read(){
 if(!client||r.mode==='local')return;
 if(r.reading){r.repeat=true;return}
 r.reading=true;
 try{
  const host=r.mode==='host';
  const {data,error}=await client.rpc(host?'mixology_host_room':'mixology_view_room',host?{p_id:r.id,p_host_token:r.host}:{p_id:r.id,p_viewer_token:r.view});
  if(error)throw error;
  if(host){r.view=data.viewer_token;$('viewLink').value=url()}
  else{checkVersion(data.state);learnSkew(data.state,Number(data.revision));if(Number(data.revision)>r.rev)ui.apply(data.state)}
  r.rev=Math.max(r.rev,Number(data.revision));
  status(host?'連線正常，可以把觀看連結傳給客人。':'正在同步觀看調酒師的酒杯。');
 }catch(e){console.error(e);status('遠端讀取失敗：'+(e.message||'網路異常'))}
 finally{r.reading=false;if(r.repeat){r.repeat=false;read()}}
}
function subscribe(){
 if(!r.view)return;
 if(r.channel)client.removeChannel(r.channel);
 r.channel=client.channel('mixology:'+r.view).on('broadcast',{event:'state_changed'},msg=>{
   const pl=msg&&msg.payload;r.heard={rev:Number(pl&&pl.revision),at:Date.now()};
   // Broadcast is only a notification. Authoritative data is re-read from SQL.
   if(r.mode==='viewer')read();
 }).subscribe(s=>{if(s==='SUBSCRIBED')read();else if(s==='TIMED_OUT'||s==='CHANNEL_ERROR')status('連線暫時中斷，正在重連…')});
}
async function enter(mode,id,secret,data,localOnCreate=false){
 r.mode=mode;r.id=id;
 document.body.classList.toggle('host-mode',mode==='host');
 document.body.classList.toggle('viewer-mode',mode==='viewer');
 $('liveRole').textContent=mode==='host'?'調酒師｜操作端':'客人｜純觀看';
 if(mode==='host'){r.host=secret;r.view=data.viewer_token;$('viewLink').value=url()}
 else r.view=secret;
 r.rev=Number(data.revision);
 if(data.state&&!localOnCreate)ui.apply(data.state);
 status('正在建立即時連線…');
 subscribe();
}
window.mixologyEmit=event=>{
 if(r.mode!=='host')return;
 if(event==='stir'){const n=Date.now();if(n-r.lastStir<180)return;r.lastStir=n}
 const snap=ui.take();
 r.saving=r.saving.catch(()=>{}).then(async()=>{
  const {data,error}=await client.rpc('mixology_update_room',{p_id:r.id,p_host_token:r.host,p_state:snap,p_event:event});
  if(error)throw error;r.rev=Number(data.revision);
 }).catch(e=>{console.error('Sync write:',e);status('遠端同步失敗，請檢查連線。')});
};
const pinField=$('roomPin');
pinField.addEventListener('input',()=>{
 const sanitized=pinField.value.replace(/[^0-9]/g,'').slice(0,6);
 if(pinField.value!==sanitized)pinField.value=sanitized;
});
pinField.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('createRoom').click()}});
$('createRoom').addEventListener('click',async()=>{
 if(!client){status('Supabase 程式庫未載入，請重新整理。');return}
 const pin=pinField.value.trim();
 if(!/^[0-9]{6}$/.test(pin)){status('請先輸入 6 位數調酒師密碼。');pinField.focus();return}
 $('createRoom').disabled=true;status('正在驗證調酒師密碼…');
 pinField.value='';
 try{
  const {data,error}=await client.rpc('mixology_create_room_with_pin',{p_pin:pin});
  if(error)throw error;
  if(data?.error==='invalid_pin'){status('密碼錯誤，請重試。');pinField.focus();return}
  if(data?.error==='rate_limited'){status('密碼嘗試次數過多，請約 '+Math.ceil((data.retry_after_seconds||300)/60)+' 分鐘後再試。');return}
  if(data?.error||!data?.host_token){status('無法驗證密碼，請稍後重試。');return}
  history.replaceState(null,'','#room='+data.id+'&host='+data.host_token);
  await enter('host',data.id,data.host_token,data,true);
  window.mixologyEmit('snapshot');
  status('房間已建立，請複製觀看連結。');
 }catch(e){console.error('Room PIN:',e);status('建立房間失敗，請檢查連線後重試。')}
 finally{$('createRoom').disabled=false}
});
$('copyView').addEventListener('click',async()=>{
 const v=$('viewLink').value;if(!v)return;
 try{await navigator.clipboard.writeText(v);status('觀看連結已複製。')}
 catch{$('viewLink').select();status('已選取觀看連結，請手動複製。')}
});
async function boot(){
 if(!client){status('同步元件未能載入；單機調酒仍可使用。');return}
 const q=new URLSearchParams(location.hash.slice(1)),id=q.get('room'),host=q.get('host'),view=q.get('view');
 if(!id||(!host&&!view)){status('單機模式可以直接試玩，建立房間後才會同步。');return}
 const mode=host?'host':'viewer';
 try{
  const {data,error}=await client.rpc(mode==='host'?'mixology_host_room':'mixology_view_room',mode==='host'?{p_id:id,p_host_token:host}:{p_id:id,p_viewer_token:view});
  if(error)throw error;
  await enter(mode,id,host||view,data);
 }catch(e){console.error(e);status('無法加入房間：'+(e.message||'無效連結'))}
}
window.addEventListener('online',()=>{if(r.mode!=='local')read()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&r.mode!=='local')read()});
boot();
})();