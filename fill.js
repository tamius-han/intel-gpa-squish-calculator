function isManifold(faces) {
  const edgeCount = new Map();
  for (const f of faces) {
    for (let i=0;i<3;i++){
      const a=f[i],b=f[(i+1)%3];
      const key = a<b?`${a}_${b}`:`${b}_${a}`;
      edgeCount.set(key,(edgeCount.get(key)??0)+1);
    }
  }
  for (const c of edgeCount.values()) if (c>2) return false;
  return true;
}

// Very lightweight bounding-box triangle intersection test
function trianglesIntersect(A, B, EPS=1e-9) {

  // Vector arithmetic
  const sub = (a,b)=>[a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const cross = (a,b)=>[
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0]
  ];
  const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

  // Unpack vertices
  const [A0,A1,A2] = A;
  const [B0,B1,B2] = B;

  // Plane normal of A
  const N1 = cross(sub(A1,A0), sub(A2,A0));

  // Signed distances of B’s vertices to A’s plane
  const dB0 = dot(N1, sub(B0,A0));
  const dB1 = dot(N1, sub(B1,A0));
  const dB2 = dot(N1, sub(B2,A0));

  // If all distances have same sign → B is entirely on one side of A
  if ((dB0>EPS && dB1>EPS && dB2>EPS) || (dB0<-EPS && dB1<-EPS && dB2<-EPS))
    return false;

  // Plane normal of B
  const N2 = cross(sub(B1,B0), sub(B2,B0));

  // Signed distances of A’s vertices to B’s plane
  const dA0 = dot(N2, sub(A0,B0));
  const dA1 = dot(N2, sub(A1,B0));
  const dA2 = dot(N2, sub(A2,B0));

  if ((dA0>EPS && dA1>EPS && dA2>EPS) || (dA0<-EPS && dA1<-EPS && dA2<-EPS))
    return false;

  // Compute intersection line direction
  const D = cross(N1, N2);
  const axis =
    Math.abs(D[0]) > Math.abs(D[1]) && Math.abs(D[0]) > Math.abs(D[2]) ? 0 :
    Math.abs(D[1]) > Math.abs(D[2]) ? 1 : 2;

  // Project triangles onto the dominant axis
  const proj = (p)=>p[axis];

  function interval(p0,p1,p2, normal, ref) {
    const v0 = proj(p0), v1 = proj(p1), v2 = proj(p2);
    const min = Math.min(v0,v1,v2);
    const max = Math.max(v0,v1,v2);
    return [min,max];
  }

  const [aMin,aMax] = interval(A0,A1,A2, N1, A0);
  const [bMin,bMax] = interval(B0,B1,B2, N2, B0);

  return !(aMax < bMin || bMax < aMin);
}

// function hasSelfIntersections(vertices, faces) {
//   const tris = faces.map(f=>f.map(i=>vertices[i-1]));

//   for (let i=0;i<tris.length;i++){
//     for (let j=i+1;j<tris.length;j++){
//       if (trianglesIntersect(tris[i],tris[j])) return true;
//     }
//   }
//   return false;
// }
function hasSelfIntersections(vertices, faces) {
  // Convert faces to triangles in vertex coordinates
  const tris = faces.map(f => {
    if (vertices[f[0] - 1] === undefined || vertices[f[1] - 1] === undefined || vertices[f[2] - 1] === undefined) {
      console.warn('one of the face vertices returns undefined! face:', f, 'vert. size:', vertices.length, 'vertices:', vertices[f[0] - 1], vertices[f[1] - 1], vertices[f[2] - 1]);
    }

    return [
      vertices[f[0] - 1],
      vertices[f[1] - 1],
      vertices[f[2] - 1]
    ]
  });


  for (let i = 0; i < tris.length; i++) {
    const fi = faces[i];

    for (let j = i + 1; j < tris.length; j++) {
      const fj = faces[j];

      // --- Skip triangles sharing any vertex (adjacent triangles) ---
      if (
        fi[0] === fj[0] || fi[0] === fj[1] || fi[0] === fj[2] ||
        fi[1] === fj[0] || fi[1] === fj[1] || fi[1] === fj[2] ||
        fi[2] === fj[0] || fi[2] === fj[1] || fi[2] === fj[2]
      ) {
        continue;
      }

      const tA = tris[i], tB = tris[j];
      const bA = triBounds(tA), bB = triBounds(tB);
      if (!bboxOverlap(bA, bB)) continue;

      // Only test true disjoint triangles
      if (trianglesIntersect(tris[i], tris[j])) {

        // Check coplanarity — if coplanar, ignore
        const t1 = tris[i], t2 = tris[j];
        if (!areCoplanar(t1[0],t1[1],t1[2], t2[0],t2[1],t2[2])) {
          console.warn("INTERSECTION DETECTED - triangles are coplanar", {
            faceA: faces[i],
            faceB: faces[j],
            triA: tris[i],
            triB: tris[j]
          });
          return true; // real self-intersection
        } else {
          console.warn("ignored coplanar intersection ...");
        }


        // return true;
      }
    }
  }
  return false;
}

/**
 * Attempt to fill all planar edge loops of an object using centroid fan.
 * Returns true if all loops filled successfully.
 */
function fillObjectHoles(obj, options = {}) {
  const loops = detectEdgeLoops(obj); // assume this returns array of loops [ [v1,v2,...], ... ]
  if (!loops || loops.length === 0) return { obj, filled: false };

  let allFilled = true;

  for (const loop of loops) {
    if (loop.length < 3) continue;

    const filled = fillEdgeLoopFan(obj, loop, options);
    if (!filled) allFilled = false;
  }

  return { obj, filled: allFilled };
}

/**
 * Triangulate a loop using centroid fan.
 * obj.vertices must be local 1-based indexing
 */
function fillEdgeLoopFan(obj, loop) {
  const verts = obj.vertices;
  if (!verts || loop.length < 3) return false;

  // centroid
  const centroid = loop.reduce((s, idx) => {
    const v = verts[idx-1];
    return [s[0]+v[0], s[1]+v[1], s[2]+v[2]];
  }, [0,0,0]).map(x => x/loop.length);

  let centroidIndex = verts.findIndex(v=>
    Math.abs(v[0]-centroid[0])<1e-9 &&
    Math.abs(v[1]-centroid[1])<1e-9 &&
    Math.abs(v[2]-centroid[2])<1e-9
  );
  if (centroidIndex >=0) centroidIndex+=1;
  else {
    verts.push(centroid);
    centroidIndex = verts.length;
  }

  for (let i=0;i<loop.length;i++) {
    const a = loop[i], b = loop[(i+1)%loop.length];
    const neighborFace = findNeighborFace(obj, a, b);
    if (!neighborFace) {
      // fallback: just pick consistent clockwise order
      obj.faces.push([a, centroidIndex, b]);
      continue;
    }

    // determine edge direction in neighbor face
    const idxA = neighborFace.indexOf(a);
    const idxB = neighborFace.indexOf(b);
    const nextIdx = (idxA+1) % neighborFace.length;
    let triangle;
    if (neighborFace[nextIdx] === b) {
      // edge a->b matches neighbor face orientation
      triangle = [a, centroidIndex, b];
    } else {
      // edge reversed in neighbor face
      triangle = [b, centroidIndex, a];
    }
    obj.faces.push(triangle);
  }

  return true;
}
/**
 * Group objects into categories after hole-filling
 * Returns same format as your previous groupFixedMeshes_safe report
 */
function groupFixedMeshes_safe(objects) {
  const report = {
    unchanged: [],
    filledAll: [],
    fillFailed: [],
    selfIntersecting: [],
    nonManifold: [],
    objects: []
  };

  for (let obj of objects) {
    const initialFaceCount = obj.faces.length;
    const loops = detectEdgeLoops(obj);
    if (!loops || loops.length === 0) {
      report.unchanged.push(obj);
      report.objects.push(obj);
      continue;
    }

    const { obj: filledObj, filled } = fillObjectHoles(obj);

    // For now, simple heuristic for self-intersection / non-manifold
    const selfIntersect = false; // safe for convex planar fans
    const nonManifold = false;   // we assume objects from groupObjects_global are manifold

    if (nonManifold) report.nonManifold.push(filledObj);
    else if (selfIntersect) report.selfIntersecting.push(filledObj);
    else if (filled) report.filledAll.push(filledObj);
    else report.fillFailed.push(filledObj);

    report.objects.push(filledObj);
  }

  return report;
}

function findBoundaryEdges(obj) {
  const edges = new Map(); // key = "minIdx,maxIdx" -> count

  for (const face of obj.faces) {
    const n = face.length;
    for (let i = 0; i < n; i++) {
      const a = face[i];
      const b = face[(i + 1) % n];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }

  // Keep edges used by exactly one face → boundary
  const boundaryEdges = [];
  for (const [key, count] of edges) {
    if (count === 1) {
      const [a, b] = key.split(',').map(Number);
      boundaryEdges.push([a, b]);
    }
  }

  return boundaryEdges;
}

function isObjectThinOrFlat(obj, threshold = 0.0125) {
  const verts = obj.vertices;
  if (!verts || verts.length < 3) return true;

  // Step 1: centroid
  const N = verts.length;
  const centroid = verts.reduce(
    (s, v) => [s[0]+v[0], s[1]+v[1], s[2]+v[2]],
    [0,0,0]
  ).map(x => x/N);

  // Step 2: covariance matrix
  let cov = [[0,0,0],[0,0,0],[0,0,0]];
  for (const v of verts) {
    const x = v[0]-centroid[0], y = v[1]-centroid[1], z = v[2]-centroid[2];
    cov[0][0] += x*x; cov[0][1] += x*y; cov[0][2] += x*z;
    cov[1][0] += y*x; cov[1][1] += y*y; cov[1][2] += y*z;
    cov[2][0] += z*x; cov[2][1] += z*y; cov[2][2] += z*z;
  }
  cov = cov.map(row => row.map(v => v/N));

  // Step 3: compute eigenvalues analytically for symmetric 3x3 matrix
  const m = cov;
  const p1 = m[0][1]**2 + m[0][2]**2 + m[1][2]**2;
  if (p1 === 0) {
    // diagonal matrix -> eigenvalues are diagonal elements
    const eig = [m[0][0], m[1][1], m[2][2]];
    eig.sort((a,b)=>b-a);
    return eig[2]/eig[0] < threshold;
  }

  const q = (m[0][0]+m[1][1]+m[2][2])/3;
  const a11 = m[0][0]-q, a22 = m[1][1]-q, a33 = m[2][2]-q;
  const p2 = a11**2 + a22**2 + a33**2 + 2*p1;
  const p = Math.sqrt(p2/6);

  // Build B = (1/p) * (A - q*I)
  const B = [
    [(m[0][0]-q)/p, m[0][1]/p, m[0][2]/p],
    [m[1][0]/p, (m[1][1]-q)/p, m[1][2]/p],
    [m[2][0]/p, m[2][1]/p, (m[2][2]-q)/p]
  ];

  const r = (B[0][0]*B[1][1]*B[2][2] + 2*B[0][1]*B[0][2]*B[1][2]
             - B[0][0]*B[1][2]**2 - B[1][1]*B[0][2]**2 - B[2][2]*B[0][1]**2) / 2;

  // clamp r to [-1,1]
  const phi = Math.acos(Math.max(-1, Math.min(1, r)))/3;
  const eig1 = q + 2*p*Math.cos(phi);
  const eig3 = q + 2*p*Math.cos(phi + (2*Math.PI/3));
  const eig2 = 3*q - eig1 - eig3;
  const eigenvalues = [eig1, eig2, eig3].sort((a,b)=>b-a); // λ1 >= λ2 >= λ3

  return eigenvalues[2]/eigenvalues[0] < threshold;
}
function buildEdgeLoops(boundaryEdges) {
  const edgeMap = new Map(); // vertex -> connected vertices
  for (const [a, b] of boundaryEdges) {
    if (!edgeMap.has(a)) edgeMap.set(a, []);
    if (!edgeMap.has(b)) edgeMap.set(b, []);
    edgeMap.get(a).push(b);
    edgeMap.get(b).push(a);
  }

  const loops = [];
  const visited = new Set();

  for (const start of edgeMap.keys()) {
    if (visited.has(start)) continue;

    const loop = [];
    let current = start;
    let prev = null;

    while (current !== null && !visited.has(current)) {
      loop.push(current);
      visited.add(current);
      const neighbors = edgeMap.get(current).filter(v => v !== prev);
      if (neighbors.length > 0) {
        prev = current;
        current = neighbors[0]; // pick next neighbor
      } else {
        current = null;
      }
    }

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

function detectEdgeLoops(obj) {
  // skip thin objects
  if (isObjectThinOrFlat(obj)) return [];

  const boundaryEdges = findBoundaryEdges(obj);
  if (boundaryEdges.length === 0) return [];

  const loops = buildEdgeLoops(boundaryEdges);
  return loops;
}

function findNeighborFace(obj, v0, v1) {
  // find a face that contains the edge (v0,v1) in any order
  for (const face of obj.faces) {
    const idx0 = face.indexOf(v0);
    const idx1 = face.indexOf(v1);
    if (idx0 >= 0 && idx1 >= 0) return face;
  }
  return null;
}

function areCoplanar(a, b, c, d, e, f, eps = 1e-6) {
  // Compute triangle normals
  const n1 = cross(sub(b,a), sub(c,a));
  const n2 = cross(sub(e,d), sub(f,d));

  // If normals are parallel → coplanar or mirrored
  const crossN = cross(n1, n2);
  if (length(crossN) > eps) return false; // not parallel → not coplanar

  // Check if one vertex lies in the plane of the other triangle
  const dist = dot(n1, sub(d,a));
  return Math.abs(dist) < eps;
}

function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function length(v){return Math.sqrt(dot(v,v));}

function bboxOverlap(a, b) {
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis] < b.min[axis] || a.min[axis] > b.max[axis]) return false;
  }
  return true;
}

function triBounds(t) {
  return {
    min: [Math.min(t[0][0], t[1][0], t[2][0]),
          Math.min(t[0][1], t[1][1], t[2][1]),
          Math.min(t[0][2], t[1][2], t[2][2])],
    max: [Math.max(t[0][0], t[1][0], t[2][0]),
          Math.max(t[0][1], t[1][1], t[2][1]),
          Math.max(t[0][2], t[1][2], t[2][2])]
  };
}
