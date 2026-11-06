/* La Crystalline — Crystal Engine V10.
   Source painting: artwork only, no newly invented gear sprites.
   Pixel displacement rotates the gears/annular mechanisms IN the source painting,
   then refracts that animated scene through continuous shared-edge facets.
   The fragment shader samples the approved painted surface at shifted coordinates;
   it does not overlay a second, unrelated set of gears. */
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
  let gl, program, texture, facetTexture, frameHandle = 0, lastFrame = 0, start = 0, visible = !document.hidden;
  let uniforms = {};
  let running = false;
  const loadVertex = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const loadFragment = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_art;
    uniform sampler2D u_facet;
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
    float gold(vec3 c){
      /* Gold/lemon outlines versus cool blue-purple backdrop. */
      return smoothstep(.04,.19,(c.r+c.g)*.5-c.b*.87)*smoothstep(.27,.67,c.r);
    }
    vec2 circularMotion(vec2 p,vec2 center,float radius,float width,float angle){
      vec2 metric=(p-center)*vec2(ASPECT,1.);
      float d=length(metric);
      float band=(smoothstep(radius-width, radius-width*.7,d)-smoothstep(radius+width*.7,radius+width,d));
      vec2 rotated=center+rotation(-angle)*metric/vec2(ASPECT,1.);
      return mix(p,rotated,band);
    }
    /* The source art's existing arch-gears are translated in their own circular
       mechanism regions. Each angular velocity is one-directional. */
    vec4 operatingScene(vec2 uv){
      vec2 p=uv;
      float t=u_seconds*(1.-u_reduced);
      p=circularMotion(p,vec2(.282,.843),.345,.090, t*2.*PI/900.);
      p=circularMotion(p,vec2(.902,.680),.331,.080,-t*2.*PI/1080.);
      p=circularMotion(p,vec2(.735,.020),.512,.088, t*2.*PI/1260.);
      /* The original thread design has a very faint optical travel, not a swing. */
      float threadArea=smoothstep(.30,.47,uv.x)*(1.-smoothstep(.76,.92,uv.x))
                       *smoothstep(.25,.45,uv.y)*(1.-smoothstep(.80,.98,uv.y));
      p.x+=threadArea*sin(t*.020+uv.y*5.)*.0016;
      p=clamp(p,vec2(.003),vec2(.997));
      return texture2D(u_art,p);
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
      vec3 base;
      base.r=operatingScene(clamp(coords+bend*1.18,vec2(.003),vec2(.997))).r;
      base.g=operatingScene(clamp(coords+bend*.94,vec2(.003),vec2(.997))).g;
      base.b=operatingScene(clamp(coords+bend*.69,vec2(.003),vec2(.997))).b;
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
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    frameHandle=requestAnimationFrame(render);
  }
  function startRendering(){
    if(!gl||running||!visible)return;
    running=true;
    if(!start)start=performance.now();
    resize();
    frameHandle=requestAnimationFrame(render);
    host.classList.add('is-ready');
  }
  function stopRendering(){
    running=false;
    if(frameHandle)cancelAnimationFrame(frameHandle);
    frameHandle=0;
  }
  let initialized=false;
  function tryInit(){
    if(initialized||!image.complete||!facetImage.complete||!image.naturalWidth||!facetImage.naturalWidth)return;
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
  image.onload=tryInit;
  facetImage.onload=tryInit;
  image.onerror=loadError;
  facetImage.onerror=loadError;
  image.src='assets/crystal_machine_scene_v5.webp';
  facetImage.src='assets/crystal_facet_normals_v6.webp';
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
