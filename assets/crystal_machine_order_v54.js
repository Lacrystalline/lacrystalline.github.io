/* La Crystalline — Crystal Engine V42: genuine separated wheel + thread layers.
   Static atmospheric base has no moving gear pixels. Three RGBA wheel sprites rotate
   independently through the full 360 degrees, while one separate woven-filament
   layers gently undulate. The complete animated composite is refracted through the
   SAME crystal facet normal map as the visible foreground membrane.
   Ordering-specific lite build: no staff image projection; accessibility remains. */
(() => {
  'use strict';
  /* V48: slower, softer single sweep (keep all facet geometry and samplers). */
  const PERIOD=12.5;
  const PASS=8.5;
  const PARALLAX=0.22;
  const BAND_FRONT=0.040;
  const BAND_TAIL=0.135;
  const SWEEP_GAIN=0.80; /* Applies to every V47 moving-light contribution. */
  const TIP_LEAD=0.018;
  const CORE=0.007;
  const HALO=0.0224;
  const apexDebug=new URLSearchParams(location.search).get('apex')==='1';
  const canvas = document.getElementById('crystalMachineCanvas');
  const host = canvas && canvas.closest('.crystal-machine-scene');
  if (!canvas || !host) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const image = new Image();
  image.decoding = 'async';
  const facetImage = new Image();
  facetImage.decoding = 'async';
  const apexImage = new Image();
  apexImage.decoding = 'async';
  // V36: one user-supplied, six-spoke engraved bronze wheel, with its original
  // transparent contours preserved. Three scales share this exact artwork;
  // their existing locations, angular directions and periods are unchanged.
  const gearNames=['large','medium','small'];
  const gearImages=gearNames.map(()=>{
    const im=new Image();im.decoding='async';return im;
  });
  // Four independent transparent silk artworks: two horizontal, two vertical.
  // No cropped intersections, pixel masks or line removal at runtime.
  const silkNames=['horizontal_back','horizontal_front','vertical_back','vertical_front'];
  const silkImages=silkNames.map(()=>{
    const im=new Image(); im.decoding='async'; return im;
  });
  let gl, program, texture, facetTexture, gearTexture, silkTextures = [], frameHandle = 0, lastFrame = 0, start = 0, visible = !document.hidden;
  let uniforms = {};
  let running = false;
  // Adaptive FPS: sample rAF cadence for 3.2s at startup AND every 15s.
  // This is a cadence heuristic (not a GPU timer); it can recover upward or
  // downshift after sustained slowdown. Never change gear/silk geometry.
  const FPS_RESAMPLE_MS=15000;
  let frameQuality='full', frameSamples=[], sampleStart=0, sampleLast=0;
  let sampleFinished=false, nextSampleAt=0, qualityNeedsResize=false;
  /* V54 order-lite: no member images or projection.
     Keep the shared geometry, lapis texture, silk and rotating bronze wheels. */
  const isSmall=()=>window.innerWidth<720;

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
    uniform vec2 u_view;
    uniform float u_seconds;
    uniform float u_reduced;
    uniform float u_apexDebug;
    const float PERIOD = ${PERIOD.toFixed(6)};
    const float PASS = ${PASS.toFixed(6)};
    const float PARALLAX = ${PARALLAX.toFixed(6)};
    const float BAND_FRONT = ${BAND_FRONT.toFixed(6)};
    const float BAND_TAIL = ${BAND_TAIL.toFixed(6)};
    const float SWEEP_GAIN = ${SWEEP_GAIN.toFixed(6)};
    const float TIP_LEAD = ${TIP_LEAD.toFixed(6)};
    const float CORE = ${CORE.toFixed(6)};
    const float HALO = ${HALO.toFixed(6)};
    const float ASP = 720.0 / 406.0;
    const float PI = 3.141592653589793;
    const float ASPECT = 1.7755856967; /* 1440 / 811 */
    mat2 rotation(float a){float s=sin(a), c=cos(a);return mat2(c,-s,s,c);}
    vec2 coverUV(vec2 p){
      float ratio=u_view.x/u_view.y;
      return ratio>ASPECT
        ? vec2(p.x, .5+(p.y-.5)*ASPECT/ratio)
        : vec2(.5+(p.x-.5)*ratio/ASPECT,p.y);
    }
    /* V46: two side-by-side 720x406 maps in ONE sampler texture unit.
       Left half: original normal map. Right half: baked apex displacement.
       Mobile retains all eight preexisting sampler units and portrait slots. */
    vec2 normalUV(vec2 p){return vec2(p.x*.5,p.y);}
    vec2 apexUV(vec2 p){return vec2(.5+p.x*.5,p.y);}
    float axis(vec2 p,vec2 L){
      return (p.x*ASP*L.x+p.y*L.y)/(ASP*abs(L.x)+abs(L.y));
    }
    float band(float s){
      return s>0. ? exp(-pow(s/BAND_FRONT,2.)) : exp(s/BAND_TAIL);
    }
    float noise2(vec2 p){return fract(sin(dot(p,vec2(123.71,311.17)))*43758.54);}
    /* V30: all wheels sample the SAME lossless 1254px metal artwork.
       Only scale/position/angle changes, never the original silhouette. */
    /* V32: native, separately cropped aged-bronze gears in a 2x2 GPU atlas.
       1024px tile and the actual dimensions ensure NO sprite resampling;
       only display-scale transforms change their size in the scene. */
    vec4 wheelSprite(vec2 uv,vec2 centerPx,float halfSize,
                     vec2 atlasCell,float imageRatio,float angle){
      vec2 world=uv*vec2(1440.,811.)-centerPx;
      vec2 local=(rotation(-angle)*world)/(2.*halfSize)+vec2(.5);
      float valid=step(.0,local.x)*step(local.x,1.)*
                  step(.0,local.y)*step(local.y,1.);
      if(valid<.5)return vec4(0.);
      vec2 cellLocal=vec2(.5)+(clamp(local,vec2(0.),vec2(1.))-vec2(.5))*imageRatio;
      vec2 tileUv=(vec2(atlasCell.x,1.-atlasCell.y)+cellLocal)*.5;
      vec4 metal=texture2D(u_gears,tileUv);
      // Retain aged bronze and real engraving; no fake plastic specular gloss.
      metal.rgb*=vec3(.90,.88,.85);
      metal.a*=valid;
      return metal;
    }

    vec4 operatingScene(vec2 uv){
      float t=u_seconds*(1.-u_reduced);
      vec3 painting=texture2D(u_art,uv).rgb*vec3(.88,.94,1.00); /* V52: reveal genuine lapis pyrite; gear, gold threads and optical shader unchanged */
      /* Composition approved earlier:
         upper-left cropped eight-spoke gear, right-edge six-spoke gear,
         lower-left just a corner of the smaller six-spoke wheel.
         The center and all crystal/filament artwork are left unchanged. */
      vec4 ul=wheelSprite(uv,vec2(168.,1000.),445.,vec2(0.,0.),761./1024.,t*2.*PI/900.);
      painting=mix(painting,ul.rgb,ul.a*.92);
      vec4 right=wheelSprite(uv,vec2(1520.,441.),475.,vec2(1.,0.),627./1024.,-t*2.*PI/1080.-PI/12.);
      painting=mix(painting,right.rgb,right.a*.88);
      /* V37 lower-left wheel: keep the upper arc visibly above the viewport edge
         on desktop AND portrait. Reuse the proven first atlas tile because all
         three wheels use the same supplied metal artwork; the old third-tile
         lookup plus overly low Y center could leave this region invisible. */
      float portraitN=clamp((ASPECT-u_view.x/u_view.y)/1.25,0.,1.);
      vec2 lowerCenter=mix(vec2(445.,-90.),vec2(710.,-90.),portraitN);
      vec4 low=wheelSprite(uv,lowerCenter,330.,vec2(0.,0.),761./1024.,t*2.*PI/1260.+PI/9.);
      painting=mix(painting,low.rgb,low.a*.81);

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
      /* V43: muted champagne-gold filaments. Geometry, alpha, silk motion,
         sheen rhythm, and blue crystalline background remain unchanged. */
      float pulseH=.96+.26*sin(uv.x*12.9-t*.018+uv.y*3.);
      float pulseV=.97+.24*sin(uv.y*10.3+t*.016-uv.x*2.7);
      float alphaHB=clamp(pow(silkHB.a,.63)*pulseH*1.12,0.,.68);
      float alphaHF=clamp(pow(silkHF.a,.59)*pulseH*1.18,0.,.84);
      float alphaVB=clamp(pow(silkVB.a,.64)*pulseV*1.09,0.,.67);
      float alphaVF=clamp(pow(silkVF.a,.60)*pulseV*1.16,0.,.78);
      float satinH=pow(.5+.5*sin(uv.x*25.+uv.y*8.-t*.22),7.);
      float satinV=pow(.5+.5*sin(uv.y*26.-uv.x*7.+t*.18),7.);
      /* Preserve subtle tonal variation of each original silk texture while
         replacing its former blue/teal cast with a soft pale-gold palette. */
      float toneHB=clamp(dot(silkHB.rgb,vec3(.24,.68,.08)),0.,1.);
      float toneHF=clamp(dot(silkHF.rgb,vec3(.24,.68,.08)),0.,1.);
      float toneVB=clamp(dot(silkVB.rgb,vec3(.24,.68,.08)),0.,1.);
      float toneVF=clamp(dot(silkVF.rgb,vec3(.24,.68,.08)),0.,1.);
      vec3 colorHB=clamp(mix(vec3(.70,.59,.42),vec3(.90,.79,.60),toneHB)+vec3(.07,.06,.04)*satinH,0.,1.);
      vec3 colorHF=clamp(mix(vec3(.77,.67,.50),vec3(.96,.87,.70),toneHF)+vec3(.06,.05,.03)*satinH,0.,1.);
      vec3 colorVB=clamp(mix(vec3(.71,.60,.43),vec3(.91,.80,.62),toneVB)+vec3(.07,.06,.04)*satinV,0.,1.);
      vec3 colorVF=clamp(mix(vec3(.78,.68,.52),vec3(.97,.88,.71),toneVF)+vec3(.06,.05,.03)*satinV,0.,1.);
      painting=mix(painting,colorHB,alphaHB);
      painting=mix(painting,colorVB,alphaVB);
      painting=mix(painting,colorHF,alphaHF);
      painting=mix(painting,colorVF,alphaVF);
      painting+=colorHF*alphaHF*.043+colorVF*alphaVF*.038;
      painting=clamp(painting,0.,1.);
      return vec4(painting,1.);
    }

    /* Shared-edge geometric facets across the ENTIRE viewport, not a crystal border.
       The skewed triangular lattice is deliberately contiguous. */
    void main(){
      float t=u_seconds*(1.-u_reduced);
      /* The optical normals correspond EXACTLY to the visible shared-edge
         crystal membrane. All gears and weaving threads refract beneath it. */
      vec2 coords=coverUV(v_uv);
      vec3 ftex=texture2D(u_facet,normalUV(coords)).rgb;
      vec3 apexTex=texture2D(u_facet,apexUV(coords)).rgb;
      /* Account for the NEAREST texel center and actual 720x406 aspect. */
      vec2 tc=(floor(coords*vec2(720.,406.))+.5)/vec2(720.,406.);
      vec2 apexOffset=(apexTex.rg-vec2(.5))*.24;
      vec2 vertexUV=tc-apexOffset;
      vec2 offA=(coords-vertexUV)*vec2(ASP,1.);
      float d=length(offA);
      float apexFalloff=exp(-pow(d/.035,1.6));
      float apexPhase=apexTex.b;
      vec2 facetN=(ftex.rg-vec2(.5))*2.;
      float facetShade=ftex.b;
      vec2 L=normalize(vec2(.80,-.60));
      float cycle=mod(t,PERIOD);
      float c=u_reduced>.5 ? .5 : -.35+1.7*(cycle/PASS);
      float passMask=u_reduced>.5 ? 1. : 1.-smoothstep(PASS-.12,PASS,cycle);
      float mirror=PARALLAX*dot(facetN,L);
      float s=axis(coords,L)-c+mirror;
      float scan=band(s)*passMask;
      float facing=clamp(.55+.45*dot(facetN,L),0.,1.);
      /* Static refractive base; the band is the only moving light. */
      float illumination=.55+.25*facetShade;
      /* V47: anchored facet apices only, no randomized timing or positions.
         Preserve the two neighbor normals and one operating scene sample. */
      vec2 nearX=(texture2D(u_facet,normalUV(
        clamp(coords+vec2(.0017,0.),vec2(.003),vec2(.997)))).rg-vec2(.5))*2.;
      vec2 nearY=(texture2D(u_facet,normalUV(
        clamp(coords+vec2(0.,.0017),vec2(.003),vec2(.997)))).rg-vec2(.5))*2.;
      float ridgeDelta=max(length(facetN-nearX),length(facetN-nearY));
      float ridge=smoothstep(.12,.58,ridgeDelta);
      vec2 surfaceDir=normalize(facetN+vec2(.055,-.035));
      float incidence=clamp(.5+.5*dot(surfaceDir,normalize(vec2(.75,-.32))),0.,1.);
      float grazing=pow(1.-incidence,2.);
      /* Refraction remains subtle at the seams of the raised facets.
         Preserve ONE complete animated-scene sample for mobile GPUs. */
      float refractAmount=(.0026+.0021*facetShade+.00065*ridge)
                          *(.83+.23*illumination);
      vec2 bend=facetN*refractAmount;
      vec3 base=operatingScene(clamp(coords+bend,vec2(.003),vec2(.997))).rgb;
      /* V47: muted broad reflection remains as a STATIC optical base.
         Its old separate motion is gone, preserving one directional sweep. */
      vec2 softboxDir=L;
      float baseFacing=max(0.,dot(surfaceDir,softboxDir));
      float broadSpecular=pow(baseFacing,3.2)*mix(.45,1.35,apexFalloff);
      float ridgeLight=ridge*pow(baseFacing,1.6)*mix(.25,1.0,apexFalloff);
      float specularEnergy=(.035+.125*broadSpecular*.20
                            +.065*ridgeLight*(.42+.58*.20))*.90*1.22;
      base=mix(base,vec3(.56,.75,.88),min(specularEnergy,.23));
      base+=vec3(.025,.044,.062)*ridge*(.34+.66*incidence)
            *(.56+.44*illumination)*1.20;
      base+=mix(vec3(.18,.35,.55),vec3(.48,.44,.34),facetShade)
            *(.008+.011*incidence)*illumination*1.20;
      float centerShade=1.-smoothstep(.22,1.00,length((v_uv-.5)*vec2(1.3,1.)));
      base*=mix(.77,.93,centerShade);
      /* Low-contrast face-to-face shading maintains dimensionality in the dark. */
      float planarLight=clamp(dot(facetN,vec2(.77,-.51)),-1.,1.);
      float planeContrast=1.+.033*planarLight+.008*(facetShade-.5);
      base*=planeContrast;
      /* Facet-normal parallax shifts the band per face, splitting it at
         adjacent seams. Darken only after passage, by at most ten percent. */
      float behind=s<0. ? 1.-exp(s/.275) : 0.;
      base*=1.-.10*behind*(1.-scan)*passMask;
      float faceI=scan*facing*(.45+.75*exp(-d/.045))*SWEEP_GAIN;
      base+=vec3(.62,.80,.95)*faceI*.70;
      /* Light-spectrum front and tail via math only; no extra reads. */
      float frontColor=exp(-pow((s-.6*BAND_FRONT)/(.45*BAND_FRONT),2.))*faceI;
      float tailColor=exp(-pow((s+.9*BAND_FRONT)/(.60*BAND_FRONT),2.))*faceI;
      base+=vec3(.35,.55,1.)*frontColor*.10;
      base+=vec3(1.,.78,.45)*tailColor*.06;
      /* Tip intensity is always driven by the same passing band.
         Phase changes strength and the STATIC color ring, never timing. */
      float sv=axis(vertexUV,L)-c+mirror-TIP_LEAD;
      float tipI=band(sv)*passMask*facing*(.7+.3*apexPhase)*SWEEP_GAIN;
      float core=exp(-pow(d/CORE,2.));
      float halo=exp(-pow(d/HALO,1.2));
      float rays=(exp(-abs(offA.x)/.0016)+exp(-abs(offA.y)/.0016))
        *pow(max(0.,1.-d/.03),2.);
      base+=vec3(1.,.98,.94)*tipI*(core+.35*halo+.30*rays);
      float ring=exp(-pow((d-.0154)/.0056,2.));
      float hue=atan(offA.y,offA.x)/6.2831853+apexPhase;
      vec3 spectrum=.5+.5*cos(6.2831853*(hue+vec3(0.,.333333,.666667)));
      base+=spectrum*(.18*tipI*ring);
      if(u_apexDebug>.5){
        float point=1.-smoothstep(.0022,.0040,d);
        base=mix(base,vec3(1.,.015,.035),point);
      }
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
    /* V46 runtime atlas: add the apex image alongside, never modifying
       either source file. This keeps total WebGL1 fragment samplers at 8. */
    if(facetImage.naturalWidth!==apexImage.naturalWidth||
       facetImage.naturalHeight!==apexImage.naturalHeight)
      throw new Error('Apex map size differs from facet normal map');
    const facetAtlas=document.createElement('canvas');
    facetAtlas.width=facetImage.naturalWidth*2;
    facetAtlas.height=facetImage.naturalHeight;
    const facetCtx=facetAtlas.getContext('2d',{alpha:false});
    if(!facetCtx)throw new Error('Cannot build normal/apex GPU atlas');
    facetCtx.drawImage(facetImage,0,0);
    facetCtx.drawImage(apexImage,facetImage.naturalWidth,0);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,facetAtlas);
    uniforms.apexDebug=gl.getUniformLocation(program,'u_apexDebug');
    gl.uniform1f(uniforms.apexDebug,apexDebug?1:0);
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
    function buildGearAtlas(){
      // The same user-supplied transparent bronze artwork is scaled only as
      // necessary to match the previously approved 761/627/453px wheel bounds.
      // No new gear geometry, synthetic rendering or background pixels.
      // WebGL 1 guarantees MAX_TEXTURE_SIZE >= 2048.
      const tile=1024;
      const a=document.createElement('canvas');
      a.width=tile*2;a.height=tile*2;
      const ctx=a.getContext('2d',{alpha:true});
      if(!ctx)throw new Error('No gear atlas canvas');
      const sizes=[761,627,453];
      gearImages.forEach((im,i)=>{
        const cx=(i%2)*tile+tile/2;
        const cy=Math.floor(i/2)*tile+tile/2;
        const size=sizes[i];
        ctx.drawImage(im,cx-size/2,cy-size/2,size,size);
      });
      return a;
    }
    gearTexture=uploadLayer(3,buildGearAtlas());
    // Four full-resolution isolated layers, one GL texture per artwork.
    // Texture slots: 0 lapis artwork, 1 facet/apex, 3 rotating gears,
    // and 4–7 separated filaments; no staff image sampler.
    silkTextures=silkImages.map((im,i)=>uploadLayer(4+i,im));
    gl.uniform1i(gl.getUniformLocation(program,'u_gears'),3);
    ['u_threads','u_threads2','u_threads3','u_threads4'].forEach((name,i)=>{
      gl.uniform1i(gl.getUniformLocation(program,name),4+i);
    });
    gl.activeTexture(gl.TEXTURE0);
    return true;
  }
  function sampleFrameCadence(now) {
    if(!visible||reduced.matches)return;
    if(sampleFinished){
      if(now<nextSampleAt)return;
      sampleFinished=false;
      sampleStart=0;sampleLast=0;frameSamples=[];
    }
    if(!sampleStart){sampleStart=now;sampleLast=now;return;}
    const elapsed=now-sampleLast;
    sampleLast=now;
    // Ignore one-off tab switches and suspension; hidden tabs reset sampling.
    if(elapsed>=4&&elapsed<=200)frameSamples.push(elapsed);
    if(now-sampleStart<3200)return;
    const count=frameSamples.length;
    const ordered=frameSamples.slice().sort((a,b)=>a-b);
    const median=count?ordered[Math.floor(count/2)]:Infinity;
    const slow=count?frameSamples.filter(n=>n>35).length/count:1;
    const verySlow=count?frameSamples.filter(n=>n>70).length/count:1;
    let next='full';
    if(count<35||median>35||slow>.30||verySlow>.11)next='lite';
    else if(median>23||slow>.10||verySlow>.03)next='balanced';
    if(next!==frameQuality){frameQuality=next;qualityNeedsResize=true;}
    host.dataset.frameQuality=frameQuality;
    sampleFinished=true;
    nextSampleAt=now+FPS_RESAMPLE_MS;
    frameSamples=[];
  }
  function resize() {
    if(!gl) return;
    // Match the actual CSS-fixed background dimensions, NOT Safari innerHeight.
    // svh stays stable when browser bars hide/show while scrolling.
    const rect=host.getBoundingClientRect();
    const cssWidth=Math.max(1,Math.round(rect.width));
    const cssHeight=Math.max(1,Math.round(rect.height));
    const detailFactor=frameQuality==='lite'?.82:frameQuality==='balanced'?.93:1;
    const ratio=Math.min(window.devicePixelRatio||1,cssWidth<720?1:1.1)*detailFactor;
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
    sampleFrameCadence(now);
    const mobile=isSmall();
    // V54: fewer background frames on the ordering page leave time for input.
    const fps=frameQuality==='lite'?(mobile?8:10):
      frameQuality==='balanced'?(mobile?10:14):(mobile?12:18);
    if(now-lastFrame<1000/fps){frameHandle=requestAnimationFrame(render);return;}
    lastFrame=now;
    gl.useProgram(program);
    if(qualityNeedsResize){qualityNeedsResize=false;resize();}
    gl.uniform1f(uniforms.seconds,(now-start)/1000);
    gl.uniform1f(uniforms.reduced,reduced.matches?1:0);
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
    if(initialized||![image,facetImage,apexImage,...gearImages,...silkImages].every(im=>im.complete&&im.naturalWidth>0))return;
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
  [image,facetImage,apexImage,...gearImages,...silkImages].forEach(im=>{
    im.onload=tryInit;
    im.onerror=loadError;
  });

  image.src='assets/crystal_lapis_lazuli_base_v43.webp';
  facetImage.src='assets/crystal_facet_normals_v16.webp';
  apexImage.src='assets/crystal_facet_apex_v1.webp';
  gearImages.forEach(im=>im.src='assets/crystal_gear_bronze_six_spoke_v36.webp');
  silkImages.forEach((im,i)=>im.src='assets/crystal_silk_'+silkNames[i]+(i<2?'_v24.svg':'_v26.svg'));
  tryInit();
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    visible=!document.hidden;
    if(!visible){
      sampleStart=0;sampleLast=0;frameSamples=[];
      sampleFinished=true;nextSampleAt=0; // re-evaluate on return
    }
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
