/* La Crystalline — Crystal Engine V5.
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
  image.src = 'assets/crystal_machine_scene_v5.webp';
  let gl, program, texture, frameHandle = 0, lastFrame = 0, start = 0, visible = !document.hidden;
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
      vec2 lattice=v_uv*vec2(9.0,5.6);
      lattice+=vec2(.13*sin(v_uv.y*6.), .13*sin(v_uv.x*5.));
      vec2 id=floor(lattice);
      vec2 f=fract(lattice);
      float diag=step(1.,f.x+f.y);
      vec2 tri=id*2.0+vec2(diag,1.-diag);
      float seed=noise2(tri), seed2=noise2(tri+23.);
      /* Smooth flat facet normals: offset applies to the art beneath the crystal. */
      vec2 facetN=normalize(vec2(seed-.5, seed2-.5)+vec2(.014,.019));
      float edge=min(min(f.x,f.y),min(1.-f.x,1.-f.y));
      edge=min(edge,abs(f.x+f.y-1.)*.707);
      float facetEdge=1.-smoothstep(.002,.028,edge);
      float illumination=.5+.5*sin(t*2.*PI/172. +seed*6.283+v_uv.x*2.5);
      float refractAmount=(.0010+.0011*seed)*(1.+illumination*.32);
      vec2 coords=coverUV(v_uv);
      vec2 bend=facetN*refractAmount;
      vec3 base;
      base.r=operatingScene(clamp(coords+bend*1.18,vec2(.003),vec2(.997))).r;
      base.g=operatingScene(clamp(coords+bend*.94,vec2(.003),vec2(.997))).g;
      base.b=operatingScene(clamp(coords+bend*.69,vec2(.003),vec2(.997))).b;
      /* Only slow, low-intensity facet glints; no rapid sparkle flashes. */
      float glint=pow(max(0.,.5+.5*sin(t*2.*PI/188.+seed2*3.5)),3.);
      vec3 cool=vec3(.19,.39,.62);
      vec3 warm=vec3(.63,.53,.36);
      base += mix(cool,warm,seed2)*(.009+.019*glint);
      base += vec3(.32,.49,.64)*facetEdge*(.016+.021*illumination);
      float centerShade=1.-smoothstep(.22,1.00,length((v_uv-.5)*vec2(1.3,1.)));
      base*=mix(.70,.91,centerShade);
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
    uniforms.view=gl.getUniformLocation(program,'u_view');
    uniforms.seconds=gl.getUniformLocation(program,'u_seconds');
    uniforms.reduced=gl.getUniformLocation(program,'u_reduced');
    gl.uniform1i(gl.getUniformLocation(program,'u_art'),0);
    return true;
  }
  function resize() {
    if(!gl) return;
    const ratio=Math.min(window.devicePixelRatio||1,innerWidth<720?1:1.35);
    /* 1440 screen pixels on desktop, less on mobile; artistic backdrop not text. */
    const factor=Math.min(1,1440/Math.max(1,innerWidth*ratio));
    const width=Math.max(320,Math.round(innerWidth*ratio*factor));
    const height=Math.max(240,Math.round(innerHeight*ratio*factor));
    if(canvas.width!==width||canvas.height!==height){
      canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);
      gl.uniform2f(uniforms.view,width,height);
    }
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
  image.onload=()=>{
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
  };
  image.onerror=()=>host.classList.remove('is-ready');
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
