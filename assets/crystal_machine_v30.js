/* La Crystalline — Crystal Engine V30: genuine separated wheel + thread layers.
   Static atmospheric base has no moving gear pixels. Three RGBA wheel sprites rotate
   independently through the full 360 degrees, while one separate woven-filament
   layers gently undulate. The complete animated composite is refracted through the
   SAME crystal facet normal map as the visible foreground membrane.
   Portrait projection, accessibility and typography are kept unchanged. */
(() => {
  'use strict';
  const canvas = document.getElementById('crystalMachineCanvas');
  const host = canvas && canvas.closest('.crystal-machine-scene');
  if (!canvas || !host) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const image = new Image();
  image.decoding = 'async';
  const facetImage = new Image();
  facetImage.decoding = 'async';
  // V30: the exact supplied pure-metal gear is shared by all rotating wheels.
  // One native-resolution lossless texture, varied sizes and phases in GLSL.
  // No SVG gear assets, no sprite regeneration, and no per-wheel resampling.
  const gearImage=new Image();
  gearImage.decoding='async';
  // Four independent transparent silk artworks: two horizontal, two vertical.
  // No cropped intersections, pixel masks or line removal at runtime.
  const silkNames=['horizontal_back','horizontal_front','vertical_back','vertical_front'];
  const silkImages=silkNames.map(()=>{
    const im=new Image(); im.decoding='async'; return im;
  });
  let gl, program, texture, facetTexture, gearTexture, silkTextures = [], frameHandle = 0, lastFrame = 0, start = 0, visible = !document.hidden;
  let uniforms = {};
  let running = false;
  // Non-generative subject extraction: original public member portraits are
  // drawn into a transient transparent atlas through hand-traced silhouette
  // masks. No original photograph is altered or uploaded.
  const portraits=[
    {src:'assets/master.webp',points:[
      [0,.94],[.08,.85],[.14,.72],[.16,.57],[.2,.47],[.29,.38],[.4,.39],
      [.45,.44],[.5,.39],[.52,.0],[.63,.0],[.69,.38],[.8,.2],[.91,.0],
      [1,0],[.91,.31],[.82,.42],[.84,.6],[.94,.72],[1,.86],[1,1],[0,1]
    ]},
    {src:'assets/hunfen_profile.webp',points:[
      [.03,1],[.06,.78],[.14,.53],[.21,.47],[.21,.36],[.15,.29],[.24,.24],
      [.26,.10],[.32,.01],[.52,0],[.61,.06],[.62,0],[.68,0],[.64,.19],
      [.74,.18],[.72,.29],[.67,.33],[.75,.4],[.86,.48],[.94,.7],[.99,1]
    ]},
    {src:'assets/noji_profile.webp',points:[
      [.16,1],[.22,.78],[.29,.64],[.32,.53],[.28,.44],[.26,.32],
      [.32,.21],[.28,.14],[.39,.18],[.46,.14],[.59,.14],[.72,.17],
      [.93,.18],[.82,.27],[.91,.32],[.97,.43],[.91,.57],[.96,.71],[1,1]
    ]},
    {src:'assets/o7_profile.webp',points:[
      [.13,1],[.13,.8],[.18,.61],[.23,.55],[.13,.47],[.12,.34],
      [.16,.24],[.24,.17],[.32,.135],[.49,.13],[.59,.17],[.68,.25],
      [.71,.38],[.63,.52],[.71,.59],[.84,.7],[.97,.87],[1,1]
    ]}
  ];
  let portraitAtlas=null,portraitTexture=null,portraitReady=false;
  let projectionUniforms={},portraitStart=0,portraitPresent=0;
  const facetKeyCache=new Map();
  const portraitPreview=new URLSearchParams(location.search).has('portraitPreview');
  const portraitAreas=[...document.querySelectorAll('.hero, #master')];
  const portraitVisibility=new WeakMap();
  const hasObserver='IntersectionObserver' in window;
  if(hasObserver){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(e=>portraitVisibility.set(e.target,e.isIntersecting));
    },{rootMargin:'12% 0px 12% 0px',threshold:0});
    portraitAreas.forEach(e=>observer.observe(e));
  }
  const isSmall=()=>window.innerWidth<720;
  const faceCentersDesktop=[
    [.24,.72],[.29,.42],[.31,.20],[.69,.72],[.73,.41],[.74,.20],
    [.43,.72],[.57,.72],[.42,.25],[.60,.23]
  ];
  const faceCentersPhone=[
    [.445,.74],[.55,.75],[.46,.25],[.55,.26],[.46,.52],[.55,.51],
    [.48,.87],[.54,.12]
  ];
  function alphaMaskCanvas(img, shape, w, h){
    const tile=document.createElement('canvas');tile.width=w;tile.height=h;
    const ctx=tile.getContext('2d',{willReadFrequently:false});
    if(!ctx)return null;
    const iw=img.naturalWidth,ih=img.naturalHeight;
    const scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
    const dx=(w-dw)*.5,dy=(h-dh)*.43;
    ctx.drawImage(img,dx,dy,dw,dh);
    const mask=document.createElement('canvas');mask.width=w;mask.height=h;
    const m=mask.getContext('2d');m.filter='blur(3px)';m.fillStyle='white';
    m.beginPath();
    for(let i=0;i<shape.length;i++){
      const [x,y]=shape[i],px=dx+x*dw,py=dy+y*dh;
      if(!i)m.moveTo(px,py);else m.lineTo(px,py);
    }
    m.closePath();m.fill();
    // Soft bust fade rather than a hard horizontal crop.
    m.globalCompositeOperation='destination-in';
    const fade=m.createLinearGradient(0,0,0,h);
    fade.addColorStop(0,'#fff');fade.addColorStop(.70,'#fff');
    fade.addColorStop(1,'rgba(255,255,255,0)');
    m.filter='none';m.fillStyle=fade;m.fillRect(0,0,w,h);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);
    return tile;
  }
  async function loadPortraitAtlas(){
    const tileW=320,tileH=420;
    const atlas=document.createElement('canvas');
    atlas.width=tileW*2;atlas.height=tileH*2;
    const out=atlas.getContext('2d');
    const results=await Promise.allSettled(portraits.map(async p=>{
      const img=new Image();img.decoding='async';
      img.src=p.src;
      await img.decode();
      return alphaMaskCanvas(img,p.points,tileW,tileH);
    }));
    let count=0;
    results.forEach((r,i)=>{
      if(r.status==='fulfilled'&&r.value){
        out.drawImage(r.value,(i%2)*tileW,Math.floor(i/2)*tileH);
        count++;
      }
    });
    if(!count)return;
    portraitAtlas=atlas;
    portraitReady=true;
    uploadPortraitTexture();
  }
  function uploadPortraitTexture(){
    if(!gl||!portraitAtlas)return;
    gl.activeTexture(gl.TEXTURE2);
    if(!portraitTexture)portraitTexture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,portraitTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,portraitAtlas);
    gl.uniform1i(projectionUniforms.atlas,2);
    gl.activeTexture(gl.TEXTURE0);
  }
  function random01(seed){
    const n=Math.sin(seed*127.132+12.194)*43758.5453;
    return n-Math.floor(n);
  }
  function syncProjection(now){
    if(!gl)return;
    const t=(now-(portraitStart||now))/1000;
    // The portraits appear ONLY near the homepage hero and member archive.
    const inRange=portraitAreas.some(el=>{
      if(hasObserver)return portraitVisibility.get(el)===true;
      const b=el.getBoundingClientRect();
      return b.bottom>window.innerHeight*.12&&b.top<window.innerHeight*.90;
    });
    portraitPresent+=((inRange?1:0)-portraitPresent)*.018;
    portraitPresent=Math.max(0,Math.min(1,portraitPresent));
    const enabled=portraitReady&&(!reduced.matches)&&portraitPresent>.003;
    const placements=new Float32Array(16);
    const keys=new Float32Array(12);
    const faceList=isSmall()?faceCentersPhone:faceCentersDesktop;
    const count=2;
    const cycle=portraitPreview?34:165;
    const displayWindow=portraitPreview?29:80;
    const active=enabled?count:0;
    const usedFacets=new Set();
    const usedPortraits=new Set();
    // Cache face-color sampling once per frame group, not each drawn pixel.
    const faceContext=facetImage._portraitKeyCtx;
    for(let i=0;i<active;i++){
      // Both reflections appear together; two distinct people and facets.
      // Fade in/out twice as fast without changing the quiet interval.
      const epoch=Math.floor(t/cycle);
      const phase=((t%cycle)+cycle)%cycle;
      const fadeIn=Math.min(1,phase/(portraitPreview?2:9));
      const fadeOut=Math.min(1,(displayWindow-phase)/(portraitPreview?2:11));
      const fade=Math.max(0,Math.min(fadeIn,fadeOut));
      let candidateIndex=(Math.floor(random01(epoch*37.17+i*98.1)*faceList.length)+i*3)%faceList.length;
      while(usedFacets.has(candidateIndex))candidateIndex=(candidateIndex+1)%faceList.length;
      usedFacets.add(candidateIndex);
      const face=faceList[candidateIndex];
      // UV is bottom-up: the mask key is read from the same normal map.
      placements.set([face[0],face[1],.13,fade*(portraitPreview?.30:.145)*portraitPresent],i*4);
      let raw=Math.floor(random01(epoch*83.71+i*56.92)*portraits.length);
      while(usedPortraits.has(raw))raw=(raw+1)%portraits.length;
      usedPortraits.add(raw);
      // texture tile is packed in the atlas; encoded in key's 4th component
      // via a separate 4-element selection uniform below.
      if(faceContext){
        const x=Math.max(0,Math.min(facetImage.naturalWidth-1,Math.round(face[0]*facetImage.naturalWidth)));
        const y=Math.max(0,Math.min(facetImage.naturalHeight-1,Math.round((1-face[1])*facetImage.naturalHeight)));
        const ck=(isSmall()?'m':'d')+candidateIndex;
        if(!facetKeyCache.has(ck)){
          const pix=faceContext.getImageData(x,y,1,1).data;
          facetKeyCache.set(ck,[pix[0]/255,pix[1]/255,pix[2]/255]);
        }
        keys.set(facetKeyCache.get(ck),i*3);
      }
      projectionUniforms.picks[i]=raw;
    }
    gl.uniform4fv(projectionUniforms.slot,placements);
    gl.uniform3fv(projectionUniforms.key,keys);
    gl.uniform4f(projectionUniforms.pick,
      projectionUniforms.picks[0]||0,projectionUniforms.picks[1]||0,
      projectionUniforms.picks[2]||0,projectionUniforms.picks[3]||0);
    gl.uniform1f(projectionUniforms.visible,enabled?1:0);
  }

  const loadVertex = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const loadFragment = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_art;
    uniform sampler2D u_facet;
    uniform sampler2D u_gears;
    uniform sampler2D u_threads;
    uniform sampler2D u_threads2;
    uniform sampler2D u_threads3;
    uniform sampler2D u_threads4;
    uniform sampler2D u_portraits;
    uniform vec4 u_portraitSlot[4];
    uniform vec3 u_portraitFace[4];
    uniform vec4 u_portraitPick;
    uniform float u_portraitVisible;
    uniform vec2 u_view;
    uniform float u_seconds;
    uniform float u_reduced;
    const float PI = 3.141592653589793;
    const float ASPECT = 1.7755856967; /* 1440 / 811 */
    mat2 rotation(float a){float s=sin(a), c=cos(a);return mat2(c,-s,s,c);}
    vec2 coverUV(vec2 p){
      float ratio=u_view.x/u_view.y;
      return ratio>ASPECT
        ? vec2(p.x, .5+(p.y-.5)*ASPECT/ratio)
        : vec2(.5+(p.x-.5)*ratio/ASPECT,p.y);
    }
    float noise2(vec2 p){return fract(sin(dot(p,vec2(123.71,311.17)))*43758.54);}
    /* V30: all wheels sample the SAME lossless 1254px metal artwork.
       Only scale/position/angle changes, never the original silhouette. */
    vec4 wheelSprite(vec2 uv,vec2 centerPx,float halfSize,float angle){
      vec2 world=uv*vec2(1440.,811.)-centerPx;
      vec2 local=(rotation(-angle)*world)/(2.*halfSize)+vec2(.5);
      float valid=step(.0,local.x)*step(local.x,1.)*
                  step(.0,local.y)*step(local.y,1.);
      if(valid<.5)return vec4(0.);
      vec4 metal=texture2D(u_gears,clamp(local,vec2(.002),vec2(.998)));
      // Gilding and actual tooth bevels are baked into the individual
      // transparent gear assets; use only a subtle world-fixed glancing light.
      vec2 n=normalize(world+vec2(.001));
      float light=pow(max(0.,dot(n,vec2(-.55,.835))),17.);
      metal.rgb=clamp(metal.rgb*(.975+.050*light)+metal.a*light*vec3(.017,.014,.011),0.,1.);
      metal.a*=valid;
      return metal;
    }

    vec4 operatingScene(vec2 uv){
      float t=u_seconds*(1.-u_reduced);
      vec3 painting=texture2D(u_art,uv).rgb;
      /* V30 positions on the original 1440×811 plane, bottom-left origin:
         keep the large wheels cropped into the margins, leave the hero
         typography clear, add one small peripheral wheel for scale contrast.
         Sizes (half-diameters): 165 / 380 / 460 / 490 reference pixels.
         All four rotate independently, with distinct speed and direction. */
      vec4 side=wheelSprite(uv,vec2(-45.,355.),165.,-t*2.*PI/740.+.38);
      painting=mix(painting,side.rgb,side.a*.82);
      vec4 ul=wheelSprite(uv,vec2(25.,995.),380.,t*2.*PI/900.);
      painting=mix(painting,ul.rgb,ul.a);
      vec4 right=wheelSprite(uv,vec2(1595.,470.),460.,-t*2.*PI/1080.-PI/12.);
      painting=mix(painting,right.rgb,right.a);
      vec4 low=wheelSprite(uv,vec2(930.,-360.),490.,t*2.*PI/1260.+PI/9.);
      painting=mix(painting,low.rgb,low.a);

      /* V25: four COMPLETE independently generated silk artworks.
         Horizontal curves and upright threads live in separate textures.
         Every filament is intact, including its crossings; no alpha cutout.
         Slow phase-shifted UV displacement moves the actual positions. */
      float riseBack=.0108*sin(uv.x*9.9-t*.21+uv.y*1.7)+
                     .0031*sin(uv.x*18.2+t*.15);
      float riseFront=.0130*sin(uv.x*8.3+t*.17+uv.y*2.1+1.2)+
                      .0035*sin(uv.x*16.1-t*.14);
      /* V26: gravity-aligned hanging silk. Nearly straight strands remain
         anchored at their tops; lower sections drift only 3–6 source px.
         Slow phases make the subtle left-right movement visible without
         introducing serpentine waves or vertical bobbing. */
      float hang=pow(clamp(1.-uv.y,0.,1.),.82);
      float swayBack=hang*(.0025*sin(t*.22+uv.y*.85+.45)+
                           .00065*sin(t*.13-uv.y*1.5+1.8));
      float swayFront=hang*(.00315*sin(t*.19-uv.y*1.0+1.2)+
                            .00070*sin(t*.11+uv.y*1.8-.5));
      vec2 uvHB=clamp(uv+vec2(.0009*sin(uv.y*8.0+t*.09),riseBack),vec2(.002),vec2(.998));
      vec2 uvHF=clamp(uv+vec2(.0010*sin(uv.y*7.0-t*.08),riseFront),vec2(.002),vec2(.998));
      /* Keep the shifted right-hand veil in view on narrow screens:
         desktop uses the original x+360px artwork position (74-83%).
         On a tall/portrait viewport, coverUV crops the sides of the art,
         so translate the vertical-only sampling left within the crop.
         Horizontal strands, gears, facets and portraits remain unchanged. */
      float viewportAspect=u_view.x/u_view.y;
      float mobileSilkComp=clamp(.2875-.30*viewportAspect/ASPECT,0.,.215);
      vec2 uvVB=clamp(uv+vec2(swayBack+mobileSilkComp,0.),vec2(.002),vec2(.998));
      vec2 uvVF=clamp(uv+vec2(swayFront+mobileSilkComp,0.),vec2(.002),vec2(.998));
      vec4 silkHB=texture2D(u_threads,uvHB);
      vec4 silkHF=texture2D(u_threads2,uvHF);
      vec4 silkVB=texture2D(u_threads3,uvVB);
      vec4 silkVF=texture2D(u_threads4,uvVF);
      /* Preserve the V20/V21 strong blue-gold line visibility, but only
         on actual filament pixels, with no wide bloom or white bands. */
      float pulseH=.96+.26*sin(uv.x*12.9-t*.018+uv.y*3.);
      float pulseV=.97+.24*sin(uv.y*10.3+t*.016-uv.x*2.7);
      float alphaHB=clamp(pow(silkHB.a,.63)*pulseH*1.12,0.,.68);
      float alphaHF=clamp(pow(silkHF.a,.59)*pulseH*1.18,0.,.84);
      float alphaVB=clamp(pow(silkVB.a,.64)*pulseV*1.09,0.,.67);
      float alphaVF=clamp(pow(silkVF.a,.60)*pulseV*1.16,0.,.78);
      float satinH=pow(.5+.5*sin(uv.x*25.+uv.y*8.-t*.22),7.);
      float satinV=pow(.5+.5*sin(uv.y*26.-uv.x*7.+t*.18),7.);
      vec3 colorHB=clamp(max(silkHB.rgb,vec3(.57,.68,.77))+vec3(.09,.12,.13)*satinH,0.,1.);
      vec3 colorHF=clamp(max(silkHF.rgb,vec3(.65,.78,.85))+vec3(.12,.14,.15)*satinH,0.,1.);
      vec3 colorVB=clamp(max(silkVB.rgb,vec3(.60,.70,.73))+vec3(.10,.12,.12)*satinV,0.,1.);
      vec3 colorVF=clamp(max(silkVF.rgb,vec3(.68,.77,.81))+vec3(.12,.13,.13)*satinV,0.,1.);
      painting=mix(painting,colorHB,alphaHB);
      painting=mix(painting,colorVB,alphaVB);
      painting=mix(painting,colorHF,alphaHF);
      painting=mix(painting,colorVF,alphaVF);
      painting+=colorHF*alphaHF*.043+colorVF*alphaVF*.038;
      painting=clamp(painting,0.,1.);
      return vec4(painting,1.);
    }

    /* Face key is sampled from the SAME crystallographic normal map as
       the refraction. A portrait cannot bleed across facet boundaries. */
    vec3 projectGhost(vec3 backdrop, vec2 p, vec3 fkey,
                      vec4 slot,vec3 target,float tile){
      if(slot.w<.003)return backdrop;
      float face=1.-smoothstep(.042,.125,length(fkey-target));
      if(face<.003)return backdrop;
      vec2 local=vec2(.5+(p.x-slot.x)/(slot.z*.78),
                      .5+(p.y-slot.y)/(slot.z*1.12));
      if(local.x<=.02||local.x>=.98||local.y<=.02||local.y>=.98)return backdrop;
      float col=mod(tile,2.);
      float row=floor(tile/2.);
      // GL upload flips Y; row zero is upper-left of the source atlas.
      vec2 atlasUV=vec2((col+local.x)*.5,(1.-row+local.y)*.5);
      vec4 person=texture2D(u_portraits,atlasUV);
      float brightness=dot(person.rgb,vec3(.25,.62,.13));
      vec3 glassTint=mix(person.rgb,vec3(brightness)*vec3(.66,.84,1.08),.62);
      float edge=smoothstep(.03,.13,local.x)*(1.-smoothstep(.87,.97,local.x));
      edge*=smoothstep(.02,.12,local.y)*(1.-smoothstep(.88,.98,local.y));
      float alpha=slot.w*face*person.a*edge*u_portraitVisible;
      return mix(backdrop,glassTint,clamp(alpha,0.,.36));
    }
    /* Shared-edge geometric facets across the ENTIRE viewport, not a crystal border.
       The skewed triangular lattice is deliberately contiguous. */
    void main(){
      float t=u_seconds*(1.-u_reduced);
      /* The optical normals correspond EXACTLY to the visible shared-edge
         crystal membrane. All gears and weaving threads refract beneath it. */
      vec2 coords=coverUV(v_uv);
      vec3 ftex=texture2D(u_facet,coords).rgb;
      vec2 facetN=(ftex.rg-vec2(.5))*2.;
      float facetShade=ftex.b;
      float illumination=.5+.5*sin(t*2.*PI/228.+facetShade*6.283+v_uv.x*.64);
      float refractAmount=(.0027+.0022*facetShade)*(.83+illumination*.23);
      vec2 bend=facetN*refractAmount;
      /* Refraction is applied AFTER separately rotating each real gear and
         undulating the independent threads. Single composite sample limits
         mobile GPU cost while preserving actual warped geometry. */
      vec3 base=operatingScene(clamp(coords+bend,vec2(.003),vec2(.997))).rgb;
      /* A slightly milky, HARD crystalline foreground: broad planar face
         highlights, not pinprick sparkles or additional hanging objects. */
      float incidence=clamp(.5+.5*dot(normalize(facetN+vec2(.01)),
                                      normalize(vec2(.75,-.32))),0.,1.);
      float sheen=(.020+.031*incidence)*(.75+.25*illumination);
      base=mix(base,vec3(.65,.78,.90),sheen);
      base+=mix(vec3(.21,.41,.66),vec3(.60,.51,.38),facetShade)
            *(.010+.015*incidence)*illumination;
      float centerShade=1.-smoothstep(.22,1.00,length((v_uv-.5)*vec2(1.3,1.)));
      base*=mix(.81,.95,centerShade);
      // Every adjoining facet has its own soft directional shading, including
      // planes whose painted border is subtle. Zero-mean so V9 remains dark.
      float planarLight=clamp(dot(facetN,vec2(.77,-.51)),-1.,1.);
      float planeContrast=1.+.044*planarLight+.010*(facetShade-.5);
      base*=planeContrast;
      /* Four supported slots; currently exactly 2 active on all devices.
         Original staff portraits are composited INSIDE their exact crystal facet. */
      base=projectGhost(base,coords,ftex,u_portraitSlot[0],u_portraitFace[0],u_portraitPick.x);
      base=projectGhost(base,coords,ftex,u_portraitSlot[1],u_portraitFace[1],u_portraitPick.y);
      base=projectGhost(base,coords,ftex,u_portraitSlot[2],u_portraitFace[2],u_portraitPick.z);
      base=projectGhost(base,coords,ftex,u_portraitSlot[3],u_portraitFace[3],u_portraitPick.w);
      gl_FragColor=vec4(clamp(base,0.,1.),1.);
    }`;

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader); throw new Error('Crystal shader: ' + err);
    }
    return shader;
  }
  function setup() {
    gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,
      preserveDrawingBuffer:false,powerPreference:'low-power'});
    if (!gl) return false;
    const vertex=compile(gl.VERTEX_SHADER,loadVertex);
    const fragment=compile(gl.FRAGMENT_SHADER,loadFragment);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);
    gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'a_position');
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.activeTexture(gl.TEXTURE1);
    facetTexture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,facetTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,facetImage);
    uniforms.view=gl.getUniformLocation(program,'u_view');
    uniforms.seconds=gl.getUniformLocation(program,'u_seconds');
    uniforms.reduced=gl.getUniformLocation(program,'u_reduced');
    gl.uniform1i(gl.getUniformLocation(program,'u_art'),0);
    gl.uniform1i(gl.getUniformLocation(program,'u_facet'),1);
    function uploadLayer(unit,img){
      gl.activeTexture(gl.TEXTURE0+unit);
      const tx=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,tx);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      return tx;
    }
    function nativeGearTexture(){
      // A single 1254×1254 lossless RGBA source remains full resolution
      // whenever the GPU supports it, including ordinary mobile hardware.
      // Only extraordinary GPUs with a lower texture limit need a runtime
      // downscale; never mutate or recompress the repository asset.
      const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if(gearImage.naturalWidth<=limit && gearImage.naturalHeight<=limit){
        return gearImage;
      }
      const ratio=Math.min(limit/gearImage.naturalWidth,limit/gearImage.naturalHeight);
      const c=document.createElement('canvas');
      c.width=Math.max(1,Math.floor(gearImage.naturalWidth*ratio));
      c.height=Math.max(1,Math.floor(gearImage.naturalHeight*ratio));
      const ctx=c.getContext('2d',{alpha:true});
      if(!ctx)throw new Error('No gear resampling canvas');
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      ctx.drawImage(gearImage,0,0,c.width,c.height);
      return c;
    }
    gearTexture=uploadLayer(3,nativeGearTexture());
    // Four full-resolution isolated layers, one GL texture per artwork.
    // WebGL 1 guarantees 8 fragment texture units; 0-3 are existing scene,
    // facet, portrait and gear, while 4-7 carry the new separate filaments.
    silkTextures=silkImages.map((im,i)=>uploadLayer(4+i,im));
    gl.uniform1i(gl.getUniformLocation(program,'u_gears'),3);
    ['u_threads','u_threads2','u_threads3','u_threads4'].forEach((name,i)=>{
      gl.uniform1i(gl.getUniformLocation(program,name),4+i);
    });
    gl.activeTexture(gl.TEXTURE0);
    projectionUniforms={
      atlas:gl.getUniformLocation(program,'u_portraits'),
      slot:gl.getUniformLocation(program,'u_portraitSlot[0]'),
      key:gl.getUniformLocation(program,'u_portraitFace[0]'),
      pick:gl.getUniformLocation(program,'u_portraitPick'),
      visible:gl.getUniformLocation(program,'u_portraitVisible'),
      picks:[0,0,0,0]
    };
    const nCanvas=document.createElement('canvas');
    nCanvas.width=facetImage.naturalWidth;nCanvas.height=facetImage.naturalHeight;
    const nCtx=nCanvas.getContext('2d',{willReadFrequently:true});
    nCtx.drawImage(facetImage,0,0);facetImage._portraitKeyCtx=nCtx;
    gl.activeTexture(gl.TEXTURE2);
    portraitTexture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,portraitTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
    gl.uniform1i(projectionUniforms.atlas,2);
    if(portraitAtlas)uploadPortraitTexture();
    gl.activeTexture(gl.TEXTURE0);
    return true;
  }
  function resize() {
    if(!gl) return;
    // Match the actual CSS-fixed background dimensions, NOT Safari innerHeight.
    // svh stays stable when browser bars hide/show while scrolling.
    const rect=host.getBoundingClientRect();
    const cssWidth=Math.max(1,Math.round(rect.width));
    const cssHeight=Math.max(1,Math.round(rect.height));
    const ratio=Math.min(window.devicePixelRatio||1,cssWidth<720?1:1.35);
    const factor=Math.min(1,1440/Math.max(1,cssWidth*ratio));
    const width=Math.max(1,Math.round(cssWidth*ratio*factor));
    const height=Math.max(1,Math.round(cssHeight*ratio*factor));
    if(canvas.width!==width||canvas.height!==height){
      canvas.width=width;
      canvas.height=height;
      gl.viewport(0,0,width,height);
    }
    // Rebind even on context recovery when the backing dimensions match.
    gl.uniform2f(uniforms.view,width,height);
  }
  function render(now) {
    if(!running)return;
    frameHandle=0;
    const fps=innerWidth<720?15:24;
    if(now-lastFrame<1000/fps){frameHandle=requestAnimationFrame(render);return;}
    lastFrame=now;
    gl.useProgram(program);
    gl.uniform1f(uniforms.seconds,(now-start)/1000);
    gl.uniform1f(uniforms.reduced,reduced.matches?1:0);
    syncProjection(now);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    // Reveal only after the new frame is actually painted. V16's former
    // static gear background never appears, even on a cold/slow page load.
    if(!host.classList.contains('is-ready'))host.classList.add('is-ready');
    frameHandle=requestAnimationFrame(render);
  }
  function startRendering(){
    if(!gl||running||!visible)return;
    running=true;
    if(!start)start=performance.now();
    resize();
    frameHandle=requestAnimationFrame(render);
  }
  function stopRendering(){
    running=false;
    if(frameHandle)cancelAnimationFrame(frameHandle);
    frameHandle=0;
  }
  let initialized=false;
  function tryInit(){
    if(initialized||![image,facetImage,gearImage,...silkImages].every(im=>im.complete&&im.naturalWidth>0))return;
    initialized=true;
    try {
      if (!setup())return;  // static painted fallback on browsers without WebGL
      if (reduced.matches) {
        startRendering();
        requestAnimationFrame(()=>stopRendering());
      } else startRendering();
    } catch(err) {
      console.warn('[La Crystalline background]',err);
      stopRendering();
      host.classList.remove('is-ready');
    }
  }
  const loadError=()=>host.classList.remove('is-ready');
  [image,facetImage,gearImage,...silkImages].forEach(im=>{
    im.onload=tryInit;
    im.onerror=loadError;
  });
  portraitStart=performance.now();
  loadPortraitAtlas().catch(()=>{});
  image.src='assets/crystal_machine_base_v16.webp';
  facetImage.src='assets/crystal_facet_normals_v16.webp';
  gearImage.src='assets/crystal_gear_rococo_v30.webp';
  silkImages.forEach((im,i)=>im.src='assets/crystal_silk_'+silkNames[i]+(i<2?'_v24.svg':'_v26.svg'));
  tryInit();
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    visible=!document.hidden;
    if(visible&&!reduced.matches)startRendering();else stopRendering();
  });
  const changeMotion=()=>{
    if(reduced.matches){stopRendering();if(gl){gl.uniform1f(uniforms.seconds,0);gl.uniform1f(uniforms.reduced,1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}}
    else startRendering();
  };
  if(reduced.addEventListener)reduced.addEventListener('change',changeMotion);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopRendering();host.classList.remove('is-ready');});
  canvas.addEventListener('webglcontextrestored',()=>{try{if(setup())startRendering();}catch(e){console.warn(e)}});
})();
