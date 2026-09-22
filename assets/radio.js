(function(){
  'use strict';
  const SUPABASE_URL='https://idqysanzhafayovieqig.supabase.co';
  const SUPABASE_ANON_KEY='sb_publishable_h-0u9bNzU_cqyVah3QTmKg_pIScFn5T';
  const PREF_KEY='lacrystalline_radio_pref_v1'; // on | off | ask
  const SESSION_KEY='lacrystalline_radio_session_v1'; // on | off
  const AUTO_NEXT_URL=SUPABASE_URL+'/functions/v1/radio-public-next';
  let sb=null, state=null, player=null, playerReady=false, ytLoading=false, consentShown=false, desiredVideo=null, advancingVideo=null;

  function pref(){ return localStorage.getItem(PREF_KEY)||'ask'; }
  function sessionPref(){ return sessionStorage.getItem(SESSION_KEY)||''; }
  function wantsAudio(){ const p=pref(); return p==='on'||(p==='ask'&&sessionPref()==='on'); }
  function wantsSilence(){ const p=pref(); return p==='off'||(p==='ask'&&sessionPref()==='off'); }
  function live(s){ return !!(s&&s.current_video_id&&(s.status==='playing'||s.status==='paused')); }
  function pos(s){
    let base=Number(s&&s.position_seconds||0);
    if(s&&s.status==='playing'&&s.started_at){ base+=Math.max(0,(Date.now()-new Date(s.started_at).getTime())/1000); }
    return Math.max(0,base);
  }
  function esc(t){return String(t||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function buildUI(){
    if(document.getElementById('lcRadioPanel'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <button id="lcRadioLaunch" class="lc-radio-launch" type="button">♫ 今晚有音樂</button>
      <section id="lcRadioPanel" class="lc-radio-panel" aria-label="La Crystalline Radio">
        <div class="lc-radio-kicker">La Crystalline Radio</div>
        <div id="lcRadioTitle" class="lc-radio-title">水晶庭音樂台</div>
        <div id="lcRadioAuthor" class="lc-radio-author">與今晚同步聆聽</div>
        <div id="lcRadioPlayer" class="lc-radio-player"></div>
        <div class="lc-radio-row">
          <button id="lcRadioSync" class="lc-radio-btn" type="button">重新同步</button>
          <button id="lcRadioMute" class="lc-radio-btn" type="button">關閉音樂</button>
        </div>
        <div id="lcRadioStatus" class="lc-radio-status"></div>
      </section>
      <div id="lcRadioConsent" class="lc-radio-consent" role="dialog" aria-modal="true" aria-label="音樂播放提示">
        <div class="lc-radio-card">
          <div class="lc-radio-mark">♫</div>
          <h3>今晚的水晶庭正在播放音樂</h3>
          <p>是否與店內同步聆聽？開啟後會播放 YouTube 內容。</p>
          <div class="lc-radio-consent-actions">
            <button id="lcRadioYes" class="lc-radio-yes" type="button">開啟音樂</button>
            <button id="lcRadioNo" class="lc-radio-no" type="button">保持安靜</button>
          </div>
          <label class="lc-radio-remember"><input id="lcRadioRemember" type="checkbox">記住我的選擇</label>
        </div>
      </div>`);

    document.getElementById('lcRadioLaunch').addEventListener('click',()=>enableFromGesture(false));
    document.getElementById('lcRadioSync').addEventListener('click',()=>syncPlayer(true));
    document.getElementById('lcRadioMute').addEventListener('click',()=>disableAudio(false));
    document.getElementById('lcRadioYes').addEventListener('click',()=>{
      const remember=document.getElementById('lcRadioRemember').checked;
      if(remember)localStorage.setItem(PREF_KEY,'on'); else sessionStorage.setItem(SESSION_KEY,'on');
      hideConsent(); enableFromGesture(true);
    });
    document.getElementById('lcRadioNo').addEventListener('click',()=>{
      const remember=document.getElementById('lcRadioRemember').checked;
      if(remember)localStorage.setItem(PREF_KEY,'off'); else sessionStorage.setItem(SESSION_KEY,'off');
      hideConsent(); disableAudio(false);
    });
  }

  function showConsent(){ if(consentShown||!live(state))return; consentShown=true; document.getElementById('lcRadioConsent').classList.add('show'); }
  function hideConsent(){ document.getElementById('lcRadioConsent').classList.remove('show'); }
  function showLaunch(text){ const b=document.getElementById('lcRadioLaunch'); b.textContent=text||'♫ 今晚有音樂'; b.classList.add('show'); }
  function hideLaunch(){ document.getElementById('lcRadioLaunch').classList.remove('show'); }
  function showPanel(){ document.getElementById('lcRadioPanel').classList.add('show'); hideLaunch(); }
  function hidePanel(){ document.getElementById('lcRadioPanel').classList.remove('show'); }
  function status(t){ document.getElementById('lcRadioStatus').textContent=t||''; }
  function updateMeta(){
    document.getElementById('lcRadioTitle').textContent=state&&state.current_title||'水晶庭音樂台';
    document.getElementById('lcRadioAuthor').textContent=state&&state.current_author||'與今晚同步聆聽';
  }

  async function requestAdvance(videoId){
    if(!videoId||advancingVideo===videoId)return;
    advancingVideo=videoId;
    status('正在銜接下一首…');
    try{
      const res=await fetch(AUTO_NEXT_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({video_id:videoId})
      });
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(!data.advanced){
        setTimeout(()=>{if(advancingVideo===videoId)advancingVideo=null;},1800);
      }
    }catch(e){
      console.warn('La Crystalline Radio auto-next failed',e);
      status('下一首同步失敗，請等待店員切歌。');
      setTimeout(()=>{if(advancingVideo===videoId)advancingVideo=null;},3000);
    }
  }

  function loadYT(){
    if(window.YT&&window.YT.Player){ createPlayer(); return; }
    if(ytLoading)return; ytLoading=true;
    const old=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=function(){ if(typeof old==='function')try{old();}catch(e){} createPlayer(); };
    const s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; s.async=true; document.head.appendChild(s);
  }
  function createPlayer(){
    if(player||!live(state))return;
    desiredVideo=state.current_video_id;
    player=new YT.Player('lcRadioPlayer',{
      width:210,height:210,videoId:state.current_video_id,
      playerVars:{autoplay:1,controls:1,playsinline:1,start:Math.floor(pos(state)),origin:location.origin},
      events:{
        onReady:function(e){ playerReady=true; syncPlayer(true); },
        onStateChange:function(e){
          if(window.YT&&e.data===YT.PlayerState.ENDED){
            let id='';
            try{id=player.getVideoData&&player.getVideoData().video_id||'';}catch(err){}
            requestAdvance(id||state&&state.current_video_id||'');
          }
        },
        onAutoplayBlocked:function(){ status('瀏覽器阻擋自動播放，請點「重新同步」開始。'); showPanel(); },
        onError:function(){ status('這支 YouTube 影片目前無法在網頁播放，請通知店員切歌。'); }
      }
    });
  }
  function syncPlayer(force){
    updateMeta();
    if(!live(state)){ if(playerReady&&player)try{player.stopVideo();}catch(e){} hidePanel(); hideLaunch(); return; }
    if(!wantsAudio()){ hidePanel(); showLaunch('♫ 今晚有音樂'); return; }
    showPanel();
    if(!player){ loadYT(); return; }
    if(!playerReady)return;
    const target=pos(state);
    try{
      const currentId=player.getVideoData&&player.getVideoData().video_id;
      if(currentId!==state.current_video_id){
        desiredVideo=state.current_video_id;
        if(state.status==='playing')player.loadVideoById({videoId:state.current_video_id,startSeconds:target});
        else player.cueVideoById({videoId:state.current_video_id,startSeconds:target});
      }else{
        const here=Number(player.getCurrentTime?player.getCurrentTime():0);
        if(force||Math.abs(here-target)>2.5)player.seekTo(target,true);
        if(state.status==='playing')player.playVideo(); else if(state.status==='paused')player.pauseVideo();
      }
      status(state.status==='playing'?'與店內同步播放中':'店內目前已暫停');
    }catch(e){ status('播放器正在重新連線…'); }
  }
  function enableFromGesture(remember){
    if(pref()==='off'&&!remember)localStorage.setItem(PREF_KEY,'ask');
    sessionStorage.setItem(SESSION_KEY,'on');
    showPanel(); loadYT(); setTimeout(()=>syncPlayer(true),50);
  }
  function disableAudio(remember){
    if(remember)localStorage.setItem(PREF_KEY,'off');
    sessionStorage.setItem(SESSION_KEY,'off');
    try{if(playerReady&&player)player.pauseVideo();}catch(e){}
    hidePanel(); if(live(state))showLaunch('♫ 音樂已關閉'); else hideLaunch();
  }

  async function fetchState(){
    const res=await sb.from('radio_state').select('*').eq('id',1).single();
    if(res.error)throw res.error; state=res.data; updateMeta();
    if(!live(state)){ syncPlayer(false); return; }
    if(pref()==='ask'&&!sessionPref()) showConsent();
    else if(wantsAudio()){ showPanel(); loadYT(); }
    else showLaunch('♫ 今晚有音樂');
  }
  function subscribe(){
    sb.channel('lc-radio-public')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'radio_state',filter:'id=eq.1'},payload=>{
        const oldVideo=state&&state.current_video_id;
        state=payload.new;
        if(!state||state.current_video_id!==oldVideo)advancingVideo=null;
        updateMeta();
        if(!live(state)){ syncPlayer(false); return; }
        if(pref()==='ask'&&!sessionPref()){ showConsent(); return; }
        if(wantsAudio())syncPlayer(true); else showLaunch('♫ 今晚有音樂');
      }).subscribe();
  }

  async function init(){
    try{
      buildUI();
      if(!window.supabase||!window.supabase.createClient)return;
      sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      await fetchState(); subscribe();
      document.addEventListener('visibilitychange',()=>{if(!document.hidden&&wantsAudio())syncPlayer(true);});
      window.addEventListener('focus',()=>{if(wantsAudio())syncPlayer(false);});
    }catch(e){ console.warn('La Crystalline Radio init failed',e); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
