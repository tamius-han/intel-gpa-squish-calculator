function renderTwoSidedLit(meshes, canvas, options = {}) {
  const gl = canvas.getContext("webgl2", { alpha: true, depth: true });
  if (!gl) throw new Error("WebGL2 not supported");

  // ---- Options ----
  const frontColor = options.frontColor || "#ffaa66";
  const backColor = options.backColor || "#dd0033";
  const lightDir = options.lightDir || [1, 1, -0.5]; // top-left
  const width = options.width || canvas.width;
  const height = options.height || canvas.height;

  // ---- GL setup ----
  gl.viewport(0, 0, width, height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ---- Convert hex to RGB ----
  function hexToRgb(hex) {
    const num = parseInt(hex.replace("#",""),16);
    return [(num>>16 & 255)/255, (num>>8 & 255)/255, (num & 255)/255];
  }

  const frontRGB = hexToRgb(frontColor);
  const backRGB = hexToRgb(backColor);

  // ---- Flatten all vertices and faces ----
  const allVertices = meshes.flatMap(m => m.vertices);
  const allFaces = [];
  let offset = 0;
  for (const m of meshes) {
    for (const f of m.faces) {
      if (f.length < 3) continue;
      allFaces.push([f[0]+offset, f[1]+offset, f[2]+offset]);
    }
    offset += m.vertices.length;
  }

  // ---- Compute per-vertex normals (flat) ----
  const normals = new Array(allVertices.length).fill(0).map(()=>[0,0,0]);
  for (const f of allFaces) {
    const v0=allVertices[f[0]], v1=allVertices[f[1]], v2=allVertices[f[2]];
    if(!v0||!v1||!v2) continue;
    const u=[v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const v=[v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    const n=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const len=Math.hypot(...n)||1;
    for(let i=0;i<3;i++) n[i]/=len;
    for(const idx of f){
      normals[idx][0]+=n[0]; normals[idx][1]+=n[1]; normals[idx][2]+=n[2];
    }
  }
  for(const n of normals){
    const len=Math.hypot(...n)||1;
    n[0]/=len; n[1]/=len; n[2]/=len;
  }

  const vertexData = new Float32Array(allVertices.flat());
  const normalData = new Float32Array(normals.flat());
  const indexData = new Uint32Array(allFaces.flat());

  // ---- Vertex Array ----
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);
  gl.bufferData(gl.ARRAY_BUFFER,vertexData,gl.STATIC_DRAW);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,normBuf);
  gl.bufferData(gl.ARRAY_BUFFER,normalData,gl.STATIC_DRAW);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indexData,gl.STATIC_DRAW);

  // ---- Shaders ----
  const vs=`#version 300 es
  precision highp float;
  in vec3 a_position;
  in vec3 a_normal;
  uniform mat4 u_matrix;
  flat out vec3 v_normal;
  void main() {
    gl_Position = u_matrix * vec4(a_position,1.0);
    v_normal = a_normal;
  }`;

  const fs=`#version 300 es
  precision highp float;
  flat in vec3 v_normal;
  out vec4 outColor;
  uniform vec4 u_color;
  uniform vec3 u_lightDir;
  void main(){
    vec3 N = normalize(v_normal);
    vec3 L = normalize(u_lightDir);
    float diff = max(dot(N,L),0.0);
    float brightness = mix(0.5,1.0,diff);
    vec3 tint = vec3(0.8,0.9,1.0);
    float tintStrength = (1.0-diff)*0.3;
    vec3 litColor = mix(u_color.rgb*brightness, u_color.rgb*brightness*tint, tintStrength);
    outColor = vec4(litColor,u_color.a);
  }`;

  function compileShader(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s,src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const program = gl.createProgram();
  gl.attachShader(program,compileShader(gl.VERTEX_SHADER,vs));
  gl.attachShader(program,compileShader(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  // ---- Bind attributes ----
  const a_position = gl.getAttribLocation(program,"a_position");
  gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);
  gl.enableVertexAttribArray(a_position);
  gl.vertexAttribPointer(a_position,3,gl.FLOAT,false,0,0);

  const a_normal = gl.getAttribLocation(program,"a_normal");
  gl.bindBuffer(gl.ARRAY_BUFFER,normBuf);
  gl.enableVertexAttribArray(a_normal);
  gl.vertexAttribPointer(a_normal,3,gl.FLOAT,false,0,0);

  // ---- Uniforms ----
  const u_matrix = gl.getUniformLocation(program,"u_matrix");
  const u_color = gl.getUniformLocation(program,"u_color");
  const u_lightDir = gl.getUniformLocation(program,"u_lightDir");
  gl.uniform3fv(u_lightDir,new Float32Array(lightDir));

  // ---- Camera along +X looking -X ----
  const minD = Math.min(...allVertices.map(v=>v[0]));
  const eye = [0, 0, minD ];
  const center = [0,0,0];
  const up = [0,1,0];

  function normalize(v){const len=Math.hypot(...v)||1;return v.map(c=>c/len);}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function lookAt(eye,center,up){
    const z=normalize([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]);
    const x=normalize(cross(up,z));
    const y=cross(z,x);
    return new Float32Array([
      x[0],y[0],z[0],0,
      x[1],y[1],z[1],0,
      x[2],y[2],z[2],0,
      -dot(x,eye),-dot(y,eye),-dot(z,eye),1
    ]);
  }
  function ortho(l,r,b,t,n,f){
    return new Float32Array([
      2/(r-l),0,0,0,
      0,2/(t-b),0,0,
      0,0,-2/(f-n),0,
      -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1
    ]);
  }

  // Compute bounds in Y/Z for ortho
  const ys = allVertices.map(v=>v[1]);
  const zs = allVertices.map(v=>v[2]);

  // yeah, we know that model was normalized to between -1 and 1


  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const margin=0.1;
  const aspectRatio = canvas.width / canvas.height;

  const orthoMat = ortho(-aspectRatio,aspectRatio,-1,1,-10,10);
  const viewMat = lookAt(eye,center,up);
  const uMat = multiplyMatrices(orthoMat,viewMat);
  gl.uniformMatrix4fv(u_matrix,false,uMat);

  // ---- Draw ----
  // Back faces first
  gl.cullFace(gl.FRONT);
  gl.uniform4fv(u_color,new Float32Array([...backRGB,1]));
  gl.drawElements(gl.TRIANGLES,indexData.length,gl.UNSIGNED_INT,0);

  // Front faces
  gl.cullFace(gl.BACK);
  gl.uniform4fv(u_color,new Float32Array([...frontRGB,1]));
  gl.drawElements(gl.TRIANGLES,indexData.length,gl.UNSIGNED_INT,0);

  // ---- Matrix multiplication helper ----
  function multiplyMatrices(a,b){
    const r=new Float32Array(16);
    for(let i=0;i<4;i++){
      for(let j=0;j<4;j++){
        r[i*4+j] = a[j]*b[i*4] + a[4+j]*b[i*4+1] + a[8+j]*b[i*4+2] + a[12+j]*b[i*4+3];
      }
    }
    return r;
  }
}
