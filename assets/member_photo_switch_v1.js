/* La Crystalline / member photo switching v1.
   Two genuine images; no generated pixels. The native horizontal carousel owns swipes. */
(function(){
  'use strict';
  const carousel=document.getElementById('memberCarousel');
  if(!carousel)return;
  const cards=[...carousel.querySelectorAll('.member-card')];
  const photos=[...carousel.querySelectorAll('.member-card .portrait[data-alt-src]')];
  if(!photos.length)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const WAIT=8000;
  const SWITCH_MS=5200;
  let timer=0,scrollTimer=0,memberOnScreen=true;
  let hovering=null;
  const isActive=portrait=>portrait.closest('.member-card')?.classList.contains('active');
  const isVisible=portrait=>{
    const a=portrait.getBoundingClientRect(),b=carousel.getBoundingClientRect();
    return a.width>0&&(Math.min(a.right,b.right)-Math.max(a.left,b.left))/a.width>.55;
  };
  function stopTimer(){
    if(timer){window.clearTimeout(timer);timer=0;}
  }
  function activePhoto(){
    return photos.find(p=>p.classList.contains('is-ready')&&isActive(p))||null;
  }
  function schedule(){
    stopTimer();
    const portrait=activePhoto();
    if(!portrait||document.hidden||!memberOnScreen||reduced.matches||
       portrait===hovering||portrait.classList.contains('is-switching')||!isVisible(portrait))return;
    timer=window.setTimeout(()=>{
      timer=0;
      if(portrait===activePhoto()&&memberOnScreen&&!document.hidden&&portrait!==hovering){
        switchPhoto(portrait);
      }
    },WAIT);
  }
  function switchPhoto(portrait){
    if(!portrait.classList.contains('is-ready')||portrait.classList.contains('is-switching'))return;
    stopTimer();
    portrait.classList.toggle('is-alt');
    if(!reduced.matches){
      portrait.classList.remove('is-switching');
      // Both directions of PHOTO change restart the SAME left-to-right gold sweep.
      // No reverse playback, no mirrored return stroke.
      void portrait.offsetWidth;
      portrait.classList.add('is-switching');
      window.setTimeout(()=>{
        portrait.classList.remove('is-switching');
        schedule();
      },SWITCH_MS+50);
    }else{
      schedule();
    }
  }
  photos.forEach(portrait=>{
    const card=portrait.closest('.member-card');
    const source=portrait.dataset.altSrc;
    if(!card||!source)return;
    const alt=document.createElement('img');
    alt.className='member-photo-alternate';
    alt.alt='';
    alt.setAttribute('aria-hidden','true');
    alt.loading='lazy';
    alt.decoding='async';
    portrait.insertBefore(alt,portrait.querySelector('.member-signature'));
    const glint=document.createElement('span');
    glint.className='member-photo-glint';
    glint.setAttribute('aria-hidden','true');
    portrait.appendChild(glint);
    const dots=document.createElement('span');
    dots.className='member-photo-dots';
    dots.setAttribute('aria-hidden','true');
    dots.innerHTML='<i></i><i></i>';
    portrait.appendChild(dots);
    let ready=false;
    const enable=()=>{
      if(ready||!alt.naturalWidth)return;
      ready=true;
      portrait.classList.add('is-ready');
      portrait.title='點按切換照片';
      card.setAttribute('aria-description','這位成員有兩張照片；選取後按 Enter 或點按照片可切換');
      schedule();
    };
    alt.addEventListener('load',()=>{
      if(typeof alt.decode==='function'){alt.decode().catch(()=>{}).then(enable);}
      else enable();
    },{once:true});
    alt.addEventListener('error',()=>{portrait.classList.remove('is-ready');stopTimer();},{once:true});
    alt.src=source;
    if(alt.complete&&alt.naturalWidth)enable();

    let start=null,ignoreClickUntil=0;
    portrait.addEventListener('pointerdown',event=>{
      if(!event.isPrimary)return;
      start={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      stopTimer();
    },{passive:true});
    portrait.addEventListener('pointermove',event=>{
      if(start&&start.id===event.pointerId&&
        Math.hypot(event.clientX-start.x,event.clientY-start.y)>9)start.moved=true;
    },{passive:true});
    portrait.addEventListener('pointerup',()=>{
      if(start?.moved)ignoreClickUntil=Date.now()+450;
      start=null;
      schedule();
    },{passive:true});
    portrait.addEventListener('pointercancel',()=>{start=null;ignoreClickUntil=Date.now()+450;schedule();},{passive:true});
    portrait.addEventListener('click',event=>{
      if(Date.now()<ignoreClickUntil){
        event.preventDefault();event.stopPropagation();return;
      }
      // Inactive card tap selects the member; a second tap switches the photo.
      if(!isActive(portrait)||!ready)return;
      event.preventDefault();event.stopPropagation();
      switchPhoto(portrait);
    });
    portrait.addEventListener('pointerenter',event=>{
      if(event.pointerType==='mouse'){hovering=portrait;stopTimer();}
    });
    portrait.addEventListener('pointerleave',event=>{
      if(event.pointerType==='mouse'&&hovering===portrait){hovering=null;schedule();}
    });
    card.addEventListener('keydown',event=>{
      if(!ready||!isActive(portrait)||event.repeat)return;
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        switchPhoto(portrait);
      }
    });
  });

  // Keep native touch and trackpad horizontal scrolling; select the snapped card
  // when a swipe settles, without re-centering it or intercepting gestures.
  carousel.addEventListener('scroll',()=>{
    stopTimer();
    window.clearTimeout(scrollTimer);
    scrollTimer=window.setTimeout(()=>{
      const midpoint=carousel.getBoundingClientRect().left+carousel.clientWidth/2;
      let best=0,distance=Infinity;
      cards.forEach((card,i)=>{
        const r=card.getBoundingClientRect();
        const d=Math.abs(r.left+r.width/2-midpoint);
        if(d<distance){distance=d;best=i;}
      });
      if(!cards[best]?.classList.contains('active')&&typeof renderMember==='function'){
        renderMember(best,{scroll:false});
      }
      schedule();
    },210);
  },{passive:true});

  const changeWatcher=new MutationObserver(()=>schedule());
  cards.forEach(card=>changeWatcher.observe(card,{attributes:true,attributeFilter:['class']}));
  document.addEventListener('visibilitychange',schedule);
  if('IntersectionObserver' in window){
    const shell=carousel.closest('.member-carousel-shell')||carousel;
    const observer=new IntersectionObserver(entries=>{
      memberOnScreen=entries.some(e=>e.isIntersecting);
      schedule();
    },{threshold:[0,.2]});
    observer.observe(shell);
  }
  reduced.addEventListener?.('change',schedule);
  window.addEventListener('pagehide',()=>{stopTimer();window.clearTimeout(scrollTimer);},{once:true});
  schedule();
})();