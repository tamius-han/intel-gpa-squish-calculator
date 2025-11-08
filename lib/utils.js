// Author: Axel Antoine
// mail: ax.antoine@gmail.com
// website: https://axantoine.com
// 24/02/2022

// Loki, Inria project-team with Université de Lille
// within the Joint Research Unit UMR 9189 CNRS-Centrale
// Lille-Université de Lille, CRIStAL.
// https://loki.lille.inria.fr

// LICENCE: Licence.md

const EPSILON = 1e-10;
const _tmp1 = new Vector3();
const _tmp2 = new Vector3();
const _matrix4 = new Matrix4();
const _matrix3 = new Matrix3();

function isTriDegenerated(tri) {

  _tmp1.subVectors(tri.a, tri.b);
  _tmp2.subVectors(tri.a, tri.c);
  _tmp1.cross(_tmp2);

  return _tmp1.x > -EPSILON && _tmp1.x < EPSILON &&
         _tmp1.y > -EPSILON && _tmp1.y < EPSILON &&
         _tmp1.z > -EPSILON && _tmp1.z < EPSILON;
}

function orient3D(a, b, c, d) {

  _matrix4.set(
    a.x, a.y, a.z, 1,
    b.x, b.y, b.z, 1,
    c.x, c.y, c.z, 1,
    d.x, d.y, d.z, 1
  );
  const det = _matrix4.determinant();

  if (det < -EPSILON)
    return -1;
  else if (det > EPSILON)
    return 1;
  else
    return 0;
}

function orient2D(a, b, c) {

  _matrix3.set(
    a.x, a.y, 1,
    b.x, b.y, 1,
    c.x, c.y, 1
  );
  const det = _matrix3.determinant();

  if (det < -EPSILON)
    return -1;
  else if (det > EPSILON)
    return 1;
  else
    return 0;
}

function permuteTriLeft(tri) {
  const tmp = tri.a;
  tri.a = tri.b;
  tri.b = tri.c;
  tri.c = tmp;
}

function permuteTriRight(tri) {
  const tmp = tri.c;
  tri.c = tri.b;
  tri.b = tri.a;
  tri.a = tmp;
}

function makeTriCounterClockwise(tri) {

  if (orient2D(tri.a, tri.b, tri.c) < 0) {
    const tmp = tri.c;
    tri.c = tri.b;
    tri.b = tmp;
  }
}

function linesIntersect2d(
    a1, b1,
    a2, b2,
    target) {

  const dx1 = (a1.x-b1.x);
  const dx2 = (a2.x-b2.x);
  const dy1 = (a1.y-b1.y);
  const dy2 = (a2.y-b2.y);

  const D = dx1*dy2 - dx2*dy1;

  // if (D > -EPSILON && D < EPSILON) {
  //   return false;
  // }

  const n1 = a1.x*b1.y - a1.y*b1.x;
  const n2 = a2.x*b2.y - a2.y*b2.x;

  target.set((n1*dx2 - n2*dx1)/D, (n1*dy2 - n2*dy1)/D, 0);

  // return true;
}

