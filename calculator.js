const COMMON_ASPECT_RATIOS = [
  {
    name: '16:9',
    ratios: [1920/1080, 1366/768],
  },
  {
    name: '4:3',
    ratios: [4/3],
  },
  {
    name: '16:10',
    ratios: [1.6]
  },
  {
    name: '4:5',
    ratios: [4/5]
  },
  {
    name: '21:9',
    ratios: [5120/2160, 3440/1440]
  },
  {
    name: '32:9',
    ratios: [3840/1080]
  }
];

function resetCalculationWarnings() {
  document.getElementById('error_objects_not_matching')?.classList.add('hidden');
  document.getElementById('error_too_many_source_objects')?.classList.add('hidden');
  document.getElementById('warning_multiple_objects')?.classList.add('hidden');
  document.getElementById('warning_ar_not_matching')?.classList.add('hidden');
}

let calculatedScale;

function calculate() {
  resetCalculationWarnings();

  const resultsDiv = document.getElementById('results-ready');
  resultsDiv.classList.add('hidden');

  const landmark = window.landmark;
  const output = window.output;

  console.log('Landmark:', landmark, 'out:', output);

  if (landmark.length > 1) {
    document.getElementById('etmso_count').textContent = landmark.length;
    return;
  }

  let finalResult;
  let finalResultConcerns;
  let hasLandmark = false;
  let hasNonLandmark = false;


  for (const outObj of output) {
    if (landmark[0].vertices.length !== outObj.vertices.length || landmark[0].faces.length !== outObj.faces.length) {
      // document.getElementById('error_objects_not_matching').classList.remove('hidden');
      hasNonLandmark = true;
      continue;
    } else {
      outObj.isLandmark = true;
    }
    hasLandmark = true;
      hasNonLandmark = true;

    const result = analyzeTransform(landmark[0], outObj);
    normalizeResults(result);
    const testResult = verifyResults(result);

    if (!testResult.matches) {
      if (!testResult.altMatch && !finalResultConcerns?.altMatch) {
        const concerns = {
          ...testResult,
          notMatching: true,
          arDiff: Math.abs(testResult.detectedRatio - testResult.screenRatio)
        }
        if (finalResultConcerns && finalResultConcerns.arDiff > concerns.arDiff ) {
          finalResultConcerns = concerns;
          finalResult = result.scale;
        }
      } else if (testResult.altMatch && !finalResultConcerns?.altMatch) {
        finalResultConcerns = {
          notMatching: true,
          ...testResult
        };
        finalResult = result.scale;
      }
    } else {
      finalResultConcerns = undefined;
      finalResult = result.scale;
      break;
    }
  }

  console.info('found our match:', finalResult, ' — procesing warnings ...');
  console.info('did we detect objects other than landmark?', hasNonLandmark);
  console.info('objects in output:', output.length);

  const saveForm = document.getElementById('results-fix-and-save');
  if (hasNonLandmark) {
    console.log('we have non-landmark — showing convert form', saveForm)
    saveForm.classList.remove('hidden');
  } else {
    console.log('NO non-landmark — hiding convert form', saveForm)
    saveForm.classList.add('hidden');
  }

  if (landmark.length > 1) {
    document.getElementById('error_too_many_source_objects').classList.remove('hidden');
    document.getElementById('wmo_object_count').textContent = landmark.length;
  }

  if (finalResultConcerns) {
    document.getElementById('warning_ar_not_matching').classList.remove('hidden');
    document.getElementById('arnm_result').textContent = `${finalResultConcerns.altMatch ? `${finalResultConcerns.detectedRatio.toFixed(3)} (${finalResultConcerns.matchedRatio?.name})` : finalResultConcerns.detectedRatio}`;
  }

  calculatedScale = finalResult;

  const mirrorZ = document.getElementById('cb_invert_handedness').checked;
  document.getElementById('scale_x').textContent = finalResult[0].toFixed(3);
  document.getElementById('scale_y').textContent = mirrorZ ? ( (-finalResult[2]).toFixed(3)) : finalResult[2].toFixed(3);
  generateBlenderKeys('x', finalResult[0]);
  generateBlenderKeys('y', mirrorZ ? -finalResult[2] : finalResult[2]);

  console.info('showing results')
  resultsDiv.classList.remove('hidden');
}

function generateBlenderKeys(axis, ratio) {
  const container = document.getElementById(`key_sequence_${axis}`);

  const scaleDiv = document.createElement('div');
  scaleDiv.classList = 'key_tile';
  scaleDiv.innerHTML = `<div class="key">S</div><div class="action">scale</div>`
  container.innerHTML = `
    <div class="key-tile">
      <div class="key">S</div>
    </div>
    <div class="key-tile">
      <div class="key">${axis.toUpperCase()}</div>
    </div>
  `;

  const ratioTxt = ratio.toFixed(3);
  for (const letter of ratioTxt) {
    const keyDiv = document.createElement('div');
    keyDiv.innerHTML = `
      <div class="key-tile">
        <div class="key">${letter}</div>
      </div>
    `;
    container.appendChild(keyDiv);
  };

  const enterDiv = document.createElement('div');
  enterDiv.innerHTML = `
    <div class="key-tile">
      <div class="key">↵</div>
    </div>
  `;

  container.appendChild(enterDiv);
}


function scanCommonAR(r) {
  for (const cr of COMMON_ASPECT_RATIOS) {
    for (const nr of cr.ratios) {
      if (Math.abs(r - nr) < 0.05) {
        return cr;
      }
    }
  }
}

function verifyResults(result) {
  if (result.scale[1] !== 1) {
    normalizeResults(result);
  }

  const aspectRatio = window.screen.width / window.screen.height;
  const [sx] = result.scale;

  if (Math.abs(Math.abs(aspectRatio) - Math.abs(sx)) > 0.05) {
    console.warn('Results are sus — we expect X scale to match our aspect ratio, but it doesn\'t.', 'ar:', aspectRatio, 'detected sx:', sx);

    const matchingRatio = scanCommonAR(sx);
    if (matchingRatio) {
      return {
        matches: false,
        altMatch: true,
        detectedRatio: sx,
        matchedRatio: matchingRatio
      }
    } else {
      return {
        matches: false,
        detectedRatio: sx,
        screenRatio: aspectRatio
      }
    }
  }

  return {
    matches: true,
  };
}

function normalizeResults(result) {
  const [sx, sy, sz] = result.scale;
  const n = 1 / sy;

  result.scale = [sx * n, sy * n, sz * n];
  return result.scale;
}

function getObjects(string) {
  const geometry = readObj(string);
  const objects = groupObjects_global(geometry);
  // const objects = [geometry];
  return objects;
}

function fixAndSave() {
  fixAndSaveModel(calculatedScale, output);
}

function fixAndSaveModel(scale, objects) {
  console.log('fix and save — scale:', scale, 'objects', objects);

  // Example correction scales (from your analysis)
  const removeLandmarks = document.getElementById("cb_remove_landmarks").checked;
  const invertHandedness = document.getElementById("cb_invert_handedness").checked;
  const flipNormals = document.getElementById("cb_flip_normals").checked;
  const splitByLooseParts = document.getElementById('cb_split_loose').checked;
  const resizeModel = document.getElementById('cb_resize').checked;
  const approxHeight = parseFloat(document.getElementById("i_size").value);

  let [sx, sy, sz] = scale;
  if (invertHandedness) {
    sz = -sz;
  }

  console.info('[fix&save] un-stretching object. sx', sx, 'sy', sy, 'sz', sz);
  for (const object of objects) {
    object.scaledVertices = object.vertices.map(([x, y, z]) => [
      x * sx,
      y,
      z * sz,
    ]);
  }

  console.info(`[fix&save] Do we need to flip normals?`, invertHandedness !== flipNormals, ' — invertHandedness:', invertHandedness, 'flipNormals:', flipNormals);
  if (invertHandedness != flipNormals) {
    objects = objects.map(obj => ({
      ...obj,
      // vertices: [...obj.vertices],             // copy vertices as-is

      faces: obj.faces.map(face => [...face].reverse()) // reversed faces
    }));
  }

  console.info('[fix&save] should we normalize objects?', resizeModel, 'approx size:', approxHeight);
  if (resizeModel && approxHeight) {
    objects = normalizeObjectsGlobal(objects.map(x => ({...x, vertices: x.scaledVertices ?? x.vertices})), approxHeight)
  }

  console.info('[fix&save] compiling final object ...');
  const txt = compileObj_global(objects, {removeLandmarks, groupObjects: splitByLooseParts});

  console.info('[fix&save] saving file ...');
  saveObj(txt);
}


/**
 * Converts our object data into .obj string.
 * This function makes some assumptions that may not always be the case. Assumptions such as:
 *
 *   * different objects never share vertices
 *   * vertices of a given object are contiguous, from first to last vertex of the object
 *
 * @param {*} objects
 * @returns
 */
function compileObj_global(objects, options) {
  options = {
    output: options?.output ?? 'txt',
    groupObjects: options?.groupObjects ?? false,
    removeLandmarks: options?.removeLandmarks ?? false,
  };

  console.info('compileObj: received', objects.length, 'objects to process ...');
  const lines = [];
  const verticesOut = [];
  const facesOut = [];

  // Map original global vertex index -> output (1-based) vertex index in the final file
  const globalToOutIndex = new Map();
  let outVertexCounter = 0;

  // ------- PASS 1: emit all vertices and build mapping -------
  let processedObjects = 0;
  let processedNonLandmarks = 0;

  let missingVertices = false;
  for (const obj of objects) {
    processedObjects++;

    if (obj.isLandmark && options.removeLandmarks) {
      // Skip landmark object's vertices entirely
      continue;
    }
    processedNonLandmarks++;

    // obj.vertexIndices is expected to be array of original global indices (1-based)
    // obj.scaledVertices is expected to be aligned with obj.vertexIndices (same order)
    const verts = obj.scaledVertices ?? obj.vertices;
    if (!Array.isArray(verts) || !Array.isArray(obj.vertexIndices) || verts.length !== obj.vertexIndices.length) {
      console.warn('Object vertex array length mismatch or missing vertexIndices:', obj);
    }

    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      outVertexCounter++;

      if (options.output === 'txt') {
        lines.push(`v ${v[0]} ${v[1]} ${v[2]}`);
      } else {
        verticesOut.push(v);
      }

      // map the original global index -> the new out index
      const globalIdx = obj.vertexIndices && obj.vertexIndices[i];
      if (globalIdx == null) {
        missingVertices = true;
      } else {
        globalToOutIndex.set(globalIdx, outVertexCounter);
      }
    }
  }
  if (missingVertices) {
    console.warn('Missing global vertex index for object vertex; faces may not remap correctly.');
  }

  console.info('compileObj, pass 1: emitted', outVertexCounter, 'vertices across', processedNonLandmarks, 'objects');

  // ------- PASS 2: emit faces remapped via globalToOutIndex -------
  processedObjects = 0;
  processedNonLandmarks = 0;

  for (const obj of objects) {
    processedObjects++;

    if (obj.isLandmark && options.removeLandmarks) {
      continue; // skip landmark objects entirely
    }
    processedNonLandmarks++;

    // Optional object header
    if (options?.output === 'txt' && options.groupObjects) {
      lines.push(`o object_${processedNonLandmarks}`);
    }

    for (const face of obj.faces) {
      // face is an array of global indices (1-based)
      const remapped = face.map(idx => globalToOutIndex.get(idx));

      // If any vertex was removed (e.g., belonged to a skipped landmark), remapped will contain undefined
      if (remapped.some(x => x === undefined)) {
        // console.warn('Skipping face because one or more vertex indices were removed/unmapped:', face, '->', remapped);
        continue;
      }

      if (options.output === 'txt') {
        lines.push(`f ${remapped.join(' ')}`);
      } else {
        facesOut.push(remapped);
      }
    }
  }

  console.info('compileObj, pass 2: processed', processedNonLandmarks, 'objects');

  if (options.output === 'txt') {
    return lines.join('\n');
  } else {
    const vertexIndices = new Array(verticesOut.length);
    for (let i = 0; i < verticesOut.length; i++) {
      vertexIndices[i] = i + 1;
    }

    return {
      vertices: verticesOut,
      faces: facesOut,
      vertexIndices: vertexIndices
    }
  }
}


/**
 * Saves text to file
 * @param {*} param0
 */
function saveObj(objText) {
  const blob = new Blob([objText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fixed_model.obj";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}



/**
 * Receives .obj string and parses it into objects.
 * @param {*} string
 * @returns {vertices: number[], faces: }
 */
function readObj(string) {
  const rawVertices = [];
  const faces = [];

  const lines = string.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    const type = parts[0];

    if (type === 'v') {
      // vertex: v x y z
      const v = parts.slice(1).map(Number);
      rawVertices.push(v);
    } else if (type === 'f') {
      // face: f v1 v2 v3 (ignore normals/uvs)
      const indices = parts.slice(1).map(token => parseInt(token.split('/')[0], 10));
      faces.push(indices);
    }
  }

  // --- Deduplicate vertices ---
  const uniqueVertices = [];

  const vertexMap = new Map();  // key = "x,y,z" → index in uniqueVertices
  const remap = new Map();      // original vertex index → new deduped index

  for (let i = 0; i < rawVertices.length; i++) {
    const v = rawVertices[i];
    const key = v.join(',');

    // .obj indices are 1-based
    if (vertexMap.has(key)) {
      remap.set(i + 1, vertexMap.get(key));
    } else {
      const newIndex = uniqueVertices.length + 1;
      vertexMap.set(key, newIndex);
      uniqueVertices.push(v);
      remap.set(i + 1, newIndex);
    }
  }

  // --- Remap face indices to deduped vertices ---
  const dedupedFaces = faces.map(face => face.map(i => {
    return remap.get(i)
  }
  ));

  return {
    vertices: uniqueVertices,
    faces: dedupedFaces
  };
}

/**
 * Takes a list of vertices and faces, detects distinct objects, and groups them
 * @param {*} param0
 * @returns
 */
function groupObjects_global({vertices, faces}) {
  // Build adjacency: vertex → list of face indices
  const vertexToFaces = new Map();
  faces.forEach((face, fi) => {
    for (const v of face) {
      if (!vertexToFaces.has(v)) vertexToFaces.set(v, []);
      vertexToFaces.get(v).push(fi);
    }
  });

  const visitedFaces = new Set();
  const objects = [];

  // BFS/DFS to group connected faces
  for (let i = 0; i < faces.length; i++) {
    if (visitedFaces.has(i)) continue;

    const faceQueue = [i];
    const objectFaces = [];
    const objectVertices = new Set();

    while (faceQueue.length > 0) {
      const fIndex = faceQueue.pop();
      if (visitedFaces.has(fIndex)) continue;
      visitedFaces.add(fIndex);

      const face = faces[fIndex];
      objectFaces.push(face);
      face.forEach(v => objectVertices.add(v));

      // All faces sharing any of these vertices are connected
      for (const v of face) {
        for (const neighborFace of vertexToFaces.get(v) || []) {
          if (!visitedFaces.has(neighborFace)) {
            faceQueue.push(neighborFace);
          }
        }
      }
    }

    // Store object
    objects.push({
      faces: objectFaces,
      vertexIndices: Array.from(objectVertices).sort((a, b) => a - b),
      vertices: Array.from(objectVertices)
        .sort((a, b) => a - b)
        .map(idx => vertices[idx - 1]), // 1-based indices
    });
  }

  return objects;
}

function normalizeObjectsGlobal(objects, height = null) {
  console.log('[normalizeObjectsGlobal] Input:', objects)
  if (!Array.isArray(objects)) {
    objects = [objects];
  }

  // Flatten all vertices to compute global bounding box, but skip landmarks
  let allVertices = objects.filter(x => !x.isLandmark).flatMap(obj => obj.vertices);
  // fallback in case landmarks are all we have
  if (!allVertices || !allVertices[0]) {
    allVertices = objects.flatMap(obj => obj.vertices);
  }

  console.info('all verts', allVertices)

  if (allVertices.length === 0) return objects;

  // Compute global bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  allVertices.forEach(v => {
    minX = Math.min(minX, v[0]);
    minY = Math.min(minY, v[1]);
    minZ = Math.min(minZ, v[2]);
    maxX = Math.max(maxX, v[0]);
    maxY = Math.max(maxY, v[1]);
    maxZ = Math.max(maxZ, v[2]);
  });

  // Compute center for X and Z only
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Compute scale
  let scale;
  if (height !== null) {
    scale = height / (maxY - minY);
  } else {
    scale = 2 / (maxY - minY); // scale so Y fits [-1, 1]
  }

  // Compute Y offset
  const offsetY = height !== null ? -minY * scale : -((minY + maxY) / 2) * scale;

  // Apply global centering and scaling
  return objects.map(obj => ({
    isLandmark: obj.isLandmark,
    vertexIndices: obj.vertexIndices,
    vertices: obj.vertices.map(v => [
      (v[0] - centerX) * scale,
      v[1] * scale + offsetY,
      (v[2] - centerZ) * scale
    ]),
    faces: obj.faces,
  }));
}

// Analyze transform between sourceObj and targetObj (from parsed .obj structures)
function analyzeTransform(sourceObj, targetObj) {
  const A = sourceObj.vertices;
  const B = targetObj.vertices;

  if (!A.length || !B.length) throw new Error("Empty geometry input");

  // --- 1. Compute centroids ---
  const centroid = verts => {
    const c = [0, 0, 0];
    for (const v of verts) {
      c[0] += v[0]; c[1] += v[1]; c[2] += v[2];
    }
    const n = verts.length;
    return [c[0]/n, c[1]/n, c[2]/n];
  };

  const ca = centroid(A);
  const cb = centroid(B);

  // --- 2. Subtract centroids (center meshes) ---
  const Ac = A.map(v => [v[0]-ca[0], v[1]-ca[1], v[2]-ca[2]]);
  const Bc = B.map(v => [v[0]-cb[0], v[1]-cb[1], v[2]-cb[2]]);

  // --- 3. Covariance matrix ---
  const H = [[0,0,0],[0,0,0],[0,0,0]];
  const n = Math.min(Ac.length, Bc.length);
  for (let i=0;i<n;i++) {
    const a=Ac[i], b=Bc[i];
    for (let r=0;r<3;r++)
      for (let c=0;c<3;c++)
        H[r][c]+=a[r]*b[c];
  }

  // --- 4. Compute best-fit rotation (Kabsch) ---
  const {U, S, V} = svd3x3(H);
  let R = multiply3x3(V, transpose3x3(U));

  // Fix reflection
  if (determinant3x3(R) < 0) {
    V[2][0]*=-1; V[2][1]*=-1; V[2][2]*=-1;
    R = multiply3x3(V, transpose3x3(U));
  }

  // --- 5. Transform A by rotation + translation ---
  const transformedA = Ac.map(v => add3(mulMat3Vec3(R, v), cb));

  // --- 6. Compute bounding boxes and scale ---
  const bbox = verts => {
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    for(const v of verts){
      for(let i=0;i<3;i++){
        if(v[i]<min[i])min[i]=v[i];
        if(v[i]>max[i])max[i]=v[i];
      }
    }
    return {min,max,size:[max[0]-min[0],max[1]-min[1],max[2]-min[2]]};
  };

  const boxA=bbox(transformedA);
  const boxB=bbox(B);
  const scale=[
    boxA.size[0]/boxB.size[0],
    boxA.size[1]/boxB.size[1],
    boxA.size[2]/boxB.size[2],
  ];

  return {
    rotation:R,
    translation:[cb[0]-ca[0],cb[1]-ca[1],cb[2]-ca[2]],
    scale,
    transformedA
  };
}

//#region analyze helpers
// ============ Small math helpers =============
function add3(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}

function mulMat3Vec3(M,v){
  return [
    M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],
    M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],
    M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]
  ];
}
function transpose3x3(M){
  return [
    [M[0][0],M[1][0],M[2][0]],
    [M[0][1],M[1][1],M[2][1]],
    [M[0][2],M[1][2],M[2][2]]
  ];
}
function multiply3x3(A,B){
  const R=[[0,0,0],[0,0,0],[0,0,0]];
  for(let i=0;i<3;i++)
    for(let j=0;j<3;j++)
      for(let k=0;k<3;k++)
        R[i][j]+=A[i][k]*B[k][j];
  return R;
}
function determinant3x3(M){
  return (
    M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1]) -
    M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0]) +
    M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0])
  );
}

// ============ 3x3 SVD (compact self-contained) =============
// Using Jacobi iteration — sufficient for small 3x3 numeric stability.
function svd3x3(M){
  // Make symmetric matrices
  const ATA = multiply3x3(transpose3x3(M), M);

  // Eigen-decomposition of ATA -> V, eigenvalues = squared singular values
  const {vectors:V, values:vals} = eigenSymmetric3x3(ATA);
  const S = vals.map(v=>Math.sqrt(Math.max(v,0)));

  // Compute U = M * V * S^-1
  const S_inv = [1/S[0]||0,1/S[1]||0,1/S[2]||0];
  const U = [];
  for(let i=0;i<3;i++){
    const col = [V[0][i],V[1][i],V[2][i]];
    const mv = mulMat3Vec3(M, col);
    U.push([mv[0]*S_inv[i], mv[1]*S_inv[i], mv[2]*S_inv[i]]);
  }
  // Columns must be orthonormal
  return {U:transpose3x3(U), S, V};
}

// --- Eigen decomposition for symmetric 3x3 using Jacobi rotations ---
function eigenSymmetric3x3(A){
  let V=[[1,0,0],[0,1,0],[0,0,1]];
  let D=[[A[0][0],A[0][1],A[0][2]],[A[1][0],A[1][1],A[1][2]],[A[2][0],A[2][1],A[2][2]]];
  for(let iter=0;iter<50;iter++){
    // find largest off-diagonal element
    let p=0,q=1,max=Math.abs(D[0][1]);
    if(Math.abs(D[0][2])>max){p=0;q=2;max=Math.abs(D[0][2]);}
    if(Math.abs(D[1][2])>max){p=1;q=2;max=Math.abs(D[1][2]);}
    if(max<1e-10)break;
    const diff=D[q][q]-D[p][p];
    const phi=0.5*Math.atan2(2*D[p][q],diff);
    const c=Math.cos(phi), s=Math.sin(phi);
    const Ap=D[p].slice(), Aq=D[q].slice();
    for(let i=0;i<3;i++){
      D[p][i]=c*Ap[i]-s*Aq[i];
      D[q][i]=s*Ap[i]+c*Aq[i];
    }
    for(let i=0;i<3;i++){
      const dpi=D[i][p], dqi=D[i][q];
      D[i][p]=c*dpi-s*dqi;
      D[i][q]=s*dpi+c*dqi;
    }
    for(let i=0;i<3;i++){
      const vpi=V[i][p], vqi=V[i][q];
      V[i][p]=c*vpi-s*vqi;
      V[i][q]=s*vpi+c*vqi;
    }
  }
  const values=[D[0][0],D[1][1],D[2][2]];
  // Sort descending
  const idx=[0,1,2].sort((a,b)=>values[b]-values[a]);
  const sortedValues=idx.map(i=>values[i]);
  const sortedVectors=idx.map(i=>[V[0][i],V[1][i],V[2][i]]);
  return {values:sortedValues,vectors:transpose3x3(sortedVectors)};
}
//#endregion

function checkNormalOrientation(meshes) {
  // Collect all vertices
  const allVertices = meshes.flatMap(m => m.vertices);
  if (!allVertices.length) return null;

  // 1️⃣ Compute the overall center of geometry
  const center = [0, 0, 0];
  for (const v of allVertices) {
    center[0] += v[0];
    center[1] += v[1];
    center[2] += v[2];
  }
  center[0] /= allVertices.length;
  center[1] /= allVertices.length;
  center[2] /= allVertices.length;

  let score = 0, count = 0;

  // 2️⃣ For each face, compute its normal and midpoint
  for (const mesh of meshes) {
    const { vertices, faces } = mesh;
    if (!vertices || !faces) continue;

    for (const f of faces) {
      if (f.length < 3) continue;
      const v0 = vertices[f[0]], v1 = vertices[f[1]], v2 = vertices[f[2]];
      if (!v0 || !v1 || !v2) continue;

      const u = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      const v = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      const n = [
        u[1]*v[2] - u[2]*v[1],
        u[2]*v[0] - u[0]*v[2],
        u[0]*v[1] - u[1]*v[0]
      ];
      const len = Math.hypot(...n) || 1;
      n[0] /= len; n[1] /= len; n[2] /= len;

      // 3️⃣ Find face centroid
      const c = [
        (v0[0] + v1[0] + v2[0]) / 3,
        (v0[1] + v1[1] + v2[1]) / 3,
        (v0[2] + v1[2] + v2[2]) / 3
      ];

      // 4️⃣ Vector from center to face
      const toFace = [c[0]-center[0], c[1]-center[1], c[2]-center[2]];
      const toFaceLen = Math.hypot(...toFace) || 1;
      toFace[0]/=toFaceLen; toFace[1]/=toFaceLen; toFace[2]/=toFaceLen;

      // 5️⃣ Compare direction: dot product
      const dot = n[0]*toFace[0] + n[1]*toFace[1] + n[2]*toFace[2];
      score += dot;
      count++;
    }
  }

  const avgDot = score / (count || 1);

  // 6️⃣ Heuristic interpretation
  // avgDot > 0 → mostly outward
  // avgDot < 0 → mostly inward
  return {
    avgDot,
    orientation: avgDot > 0 ? 'outward' : 'inward'
  };
}
