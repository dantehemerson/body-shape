import { BufferAttribute, BufferGeometry } from 'three';
import { ellipseRadii, type ResolvedBody } from './measurements';

export type GeometryQuality = 'low' | 'medium' | 'high';
type Vec = [number, number, number];
type Bounds = [Vec, Vec];
type Profile = [number, number, number, number]; // y, width radius, depth radius, depth offset
interface Primitive { bounds: Bounds; distance: (x: number, y: number, z: number) => number }

export interface BodyLandmarks {
  height: number;
  groin: number;
  shoulder: number;
  chest: number;
  waist: number;
  hips: number;
}

/** World units are meters, Y is up and +Z is the front of the body. */
export function getBodyLandmarks(body: ResolvedBody): BodyLandmarks {
  const m = body.measurements;
  const height = m.height / 100;
  const groin = m.inseam / 100;
  const shoulder = groin + m.torsoLength / 100;
  return {
    height, groin, shoulder,
    chest: groin + (shoulder - groin) * 0.76,
    waist: groin + (shoulder - groin) * 0.42,
    hips: groin + (shoulder - groin) * 0.15,
  };
}

function ellipsoid(center: Vec, radii: Vec): Primitive {
  const [cx, cy, cz] = center;
  const [rx, ry, rz] = radii;
  const scale = Math.min(rx, ry, rz);
  return {
    bounds: [[cx - rx, cy - ry, cz - rz], [cx + rx, cy + ry, cz + rz]],
    distance: (x, y, z) => (Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz) - 1) * scale,
  };
}

/** Smooth, elliptical tube following an axis in the XY plane, with rounded ends. */
function tube(start: Vec, end: Vec, profile: [number, number, number][]): Primitive {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return ellipsoid(start, [profile[0][1], profile[0][1], profile[0][2]]);
  const ux = dx / length, uy = dy / length;
  const maxRadius = Math.max(...profile.flatMap(p => [p[1], p[2]]));
  return {
    bounds: [
      [Math.min(start[0], end[0]) - maxRadius, Math.min(start[1], end[1]) - maxRadius, start[2] - maxRadius],
      [Math.max(start[0], end[0]) + maxRadius, Math.max(start[1], end[1]) + maxRadius, start[2] + maxRadius],
    ],
    distance(x, y, z) {
      const ax = x - start[0], ay = y - start[1];
      const along = (ax * ux + ay * uy) / length;
      const t = Math.max(0, Math.min(1, along));
      let i = 0;
      while (i < profile.length - 2 && t > profile[i + 1][0]) i++;
      const a = profile[i], b = profile[i + 1];
      const u = (t - a[0]) / (b[0] - a[0]);
      const ease = u * u * (3 - 2 * u);
      const rx = a[1] + (b[1] - a[1]) * ease;
      const rz = a[2] + (b[2] - a[2]) * ease;
      const across = ax * -uy + ay * ux;
      const cap = (along - t) * length / Math.min(rx, rz);
      return (Math.hypot(across / rx, (z - start[2]) / rz, cap) - 1) * Math.min(rx, rz);
    },
  };
}

function torso(profile: Profile[]): Primitive {
  const width = Math.max(...profile.map(p => p[1]));
  const depth = Math.max(...profile.map(p => p[2] + Math.abs(p[3])));
  return {
    bounds: [[-width, profile[0][0], -depth], [width, profile.at(-1)![0], depth]],
    distance(x, y, z) {
      const cy = Math.max(profile[0][0], Math.min(profile.at(-1)![0], y));
      let i = 0;
      while (i < profile.length - 2 && cy > profile[i + 1][0]) i++;
      const a = profile[i], b = profile[i + 1];
      const t = (cy - a[0]) / (b[0] - a[0]);
      const u = t * t * (3 - 2 * t);
      const rx = a[1] + (b[1] - a[1]) * u;
      const rz = a[2] + (b[2] - a[2]) * u;
      const offset = a[3] + (b[3] - a[3]) * u;
      const scale = Math.min(rx, rz);
      return (Math.hypot(x / rx, (z - offset) / rz, (y - cy) / scale) - 1) * scale;
    },
  };
}

function bodyPrimitives(body: ResolvedBody, muscle: number): Primitive[] {
  const m = body.measurements;
  const l = getBodyLandmarks(body);
  const h = l.height;
  const female = body.template === 'female';
  const p: Primitive[] = [];
  const add = (c: Vec, r: Vec) => p.push(ellipsoid(c, r));
  const chest = ellipseRadii(m.chest / 100, female ? 1.5 : 1.55);
  const waist = ellipseRadii(m.waist / 100, 1.42);
  const hips = ellipseRadii(m.hips / 100, female ? 1.48 : 1.38);
  const neck = m.neck / 100 / (Math.PI * 2);
  const arm = m.upperArm / 100 / (Math.PI * 2);
  const forearm = m.forearm / 100 / (Math.PI * 2);
  const wrist = m.wrist / 100 / (Math.PI * 2);
  const thigh = m.thigh / 100 / (Math.PI * 2);
  const calf = m.calf / 100 / (Math.PI * 2);
  const ankle = m.ankle / 100 / (Math.PI * 2);
  const shoulderX = Math.max(m.shoulderWidth / 200 - arm * 0.80, neck * 1.4);
  const hipX = Math.max(hips[0] * 0.53, thigh * 0.95);
  const kneeY = l.groin * 0.55;
  const ankleY = h * 0.055;
  const kneeRadius = Math.min(thigh * 0.62, calf * 0.85);
  const headH = m.headHeight / 100;

  p.push(torso([
    [l.groin - h * 0.018, hips[0] * 0.34, hips[1] * 0.5, 0],
    [l.hips, hips[0], hips[1], -h * 0.006],
    [l.waist, waist[0], waist[1], 0],
    [l.chest, chest[0] * (female ? 0.93 : 1), chest[1] * (female ? 0.91 : 1), 0],
    [l.shoulder - h * 0.025, shoulderX * 0.90, chest[1] * 0.78, -h * 0.004],
    [l.shoulder + h * 0.015, neck * 1.15, neck * 0.85, -h * 0.009],
  ]));

  // The two templates change frame, pelvis and chest shape, not just overall size.
  if (female) {
    for (const side of [-1, 1]) {
      add([side * chest[0] * 0.46, l.chest - h * 0.012, chest[1] * 0.62],
        [chest[0] * 0.47, h * 0.040, chest[1] * 0.52]);
    }
  }
  const chin = h - headH;
  p.push(tube([0, l.shoulder, -h * 0.008], [0, chin + headH * 0.13, -h * 0.008],
    [[0, neck * 1.08, neck * 0.91], [1, neck * 0.88, neck * 0.90]]));

  // Original procedural head: cranium, jaw, brow, nose, ears. No third-party assets.
  add([0, h - headH * 0.46, -h * 0.006], [headH * 0.335, headH * 0.46, headH * 0.39]);
  add([0, chin + headH * 0.24, headH * 0.035], [headH * 0.27, headH * 0.27, headH * 0.30]);
  add([0, chin + headH * 0.43, headH * 0.16], [headH * 0.28, headH * 0.30, headH * 0.20]);
  add([0, chin + headH * 0.45, headH * 0.32], [headH * 0.060, headH * 0.12, headH * 0.10]);
  add([0, chin + headH * 0.22, headH * 0.235], [headH * 0.16, headH * 0.065, headH * 0.065]);

  for (const s of [-1, 1]) {
    add([s * headH * 0.326, chin + headH * 0.48, -h * 0.005],
      [headH * 0.065, headH * 0.12, headH * 0.08]);

    // Relaxed A-pose; opposing limbs remain separate even with larger thighs.
    const kneeX = hipX + h * 0.012;
    const ankleX = hipX + h * 0.025;
    p.push(tube([s * hipX, l.groin + thigh * 0.44, -h * 0.008], [s * kneeX, kneeY, 0], [
      [0, thigh * 0.95, thigh * 1.02],
      [0.28, thigh, thigh * (1.00 + muscle * 0.04)],
      [0.75, thigh * 0.71, thigh * 0.79],
      [1, kneeRadius, kneeRadius * 1.06],
    ]));
    p.push(tube([s * kneeX, kneeY, 0], [s * ankleX, ankleY, 0], [
      [0, kneeRadius, kneeRadius],
      [0.30, calf * 0.97, calf * 1.03],
      [0.70, calf * 0.69, calf * 0.76],
      [1, ankle, ankle * 0.90],
    ]));
    add([s * ankleX, h * 0.035, h * 0.027], [h * 0.026, h * 0.034, h * 0.068]);
    add([s * ankleX, h * 0.019, h * 0.075], [h * 0.030, h * 0.018, h * 0.035]);

    const armLength = m.armLength / 100;
    const elbow: Vec = [s * (shoulderX + armLength * 0.21), l.shoulder - armLength * 0.49, 0];
    const hand: Vec = [s * (shoulderX + armLength * 0.39), l.shoulder - armLength * 0.92, h * 0.008];
    p.push(tube([s * shoulderX, l.shoulder - h * 0.012, 0], elbow, [
      [0, arm * 0.94, arm * 0.98],
      [0.38, arm * (1 + muscle * 0.04), arm],
      [1, forearm * 0.76, forearm * 0.78],
    ]));
    p.push(tube(elbow, hand, [
      [0, forearm * 0.80, forearm * 0.83],
      [0.28, forearm, forearm * 0.94],
      [1, wrist, wrist * 0.82],
    ]));
    const palm: Vec = [hand[0] + s * h * 0.011, hand[1] - h * 0.027, hand[2]];
    add(palm, [h * 0.022, h * 0.038, h * 0.012]);
    // Fingers are fused at medium resolution into a clean, neutral hand silhouette.
    for (let finger = 0; finger < 4; finger++) {
      const x = palm[0] + s * (finger - 1.5) * h * 0.010;
      const len = h * (finger === 0 || finger === 3 ? 0.027 : 0.034);
      p.push(tube([x, palm[1] - h * 0.022, palm[2]],
        [x + s * h * 0.004, palm[1] - h * 0.022 - len, palm[2]],
        [[0, h * 0.0055, h * 0.006], [1, h * 0.0045, h * 0.005]]));
    }
    p.push(tube([palm[0] - s * h * 0.018, palm[1] + h * 0.008, palm[2] + h * 0.004],
      [palm[0] - s * h * 0.030, palm[1] - h * 0.020, palm[2] + h * 0.009],
      [[0, h * 0.009, h * 0.008], [1, h * 0.005, h * 0.006]]));
  }
  return p;
}

const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const corners: Vec[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

/**
 * Original implicit-surface human mesh. Smooth unions + indexed marching tetrahedra
 * make one continuous surface rather than a collection of overlapping render meshes.
 * Tape measurements constrain local elliptical sections, not scan-level anatomy.
 * Caller owns the returned geometry and must dispose it.
 */
export function createBodyGeometry(
  body: ResolvedBody,
  quality: GeometryQuality = 'medium',
  muscle = 0.35,
): BufferGeometry {
  if (!['low', 'medium', 'high'].includes(quality)) throw new TypeError('Unknown geometry quality.');
  if (!Number.isFinite(muscle) || muscle < 0 || muscle > 1) throw new RangeError('Muscle must be in [0, 1].');
  const h = body.measurements.height / 100;
  const primitives = bodyPrimitives(body, muscle);
  const step = h / ({ low: 85, medium: 125, high: 175 }[quality]);
  const blend = h * 0.007;
  const padding = blend + step * 3;
  const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
  for (const { bounds } of primitives) for (let d = 0; d < 3; d++) {
    min[d] = Math.min(min[d], bounds[0][d] - padding);
    max[d] = Math.max(max[d], bounds[1][d] + padding);
  }
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const plane = nx * ny;
  const count = plane * nz;
  const field = new Float32Array(count).fill(h);
  const index = (x: number, y: number, z: number) => x + nx * y + plane * z;
  for (const primitive of primitives) {
    const lo = primitive.bounds[0].map((v, d) => Math.max(0, Math.floor((v - padding - min[d]) / step)));
    const hi = primitive.bounds[1].map((v, d) => Math.min([nx, ny, nz][d] - 1, Math.ceil((v + padding - min[d]) / step)));
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const i = index(x, y, z);
      const b = primitive.distance(min[0] + x * step, min[1] + y * step, min[2] + z * step);
      const a = field[i];
      const k = Math.max(blend - Math.abs(a - b), 0) / blend;
      field[i] = Math.min(a, b) - k * k * blend * 0.25;
    }
  }
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const edges = new Map<number, number>();
  const gradient = (i: number): Vec => {
    const z = Math.floor(i / plane);
    const y = Math.floor((i - z * plane) / nx);
    const x = i % nx;
    return [
      field[index(Math.min(nx - 1, x + 1), y, z)] - field[index(Math.max(0, x - 1), y, z)],
      field[index(x, Math.min(ny - 1, y + 1), z)] - field[index(x, Math.max(0, y - 1), z)],
      field[index(x, y, Math.min(nz - 1, z + 1))] - field[index(x, y, Math.max(0, z - 1))],
    ];
  };
  const vertex = (aa: number, bb: number): number => {
    const a = Math.min(aa, bb), b = Math.max(aa, bb);
    const key = a * count + b;
    const cached = edges.get(key);
    if (cached !== undefined) return cached;
    const t = field[a] / (field[a] - field[b]);
    const az = Math.floor(a / plane), bz = Math.floor(b / plane);
    const ay = Math.floor((a - az * plane) / nx), by = Math.floor((b - bz * plane) / nx);
    const ax = a % nx, bx = b % nx;
    positions.push(min[0] + (ax + (bx - ax) * t) * step, min[1] + (ay + (by - ay) * t) * step, min[2] + (az + (bz - az) * t) * step);
    const ga = gradient(a), gb = gradient(b);
    const n = ga.map((v, d) => v + (gb[d] - v) * t);
    const length = Math.hypot(...n) || 1;
    normals.push(n[0] / length, n[1] / length, n[2] / length);
    const result = positions.length / 3 - 1;
    edges.set(key, result);
    return result;
  };
  const triangle = (a: number, b: number, c: number) => {
    const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const dot = (ay * bz - az * by) * normals[a * 3] + (az * bx - ax * bz) * normals[a * 3 + 1] + (ax * by - ay * bx) * normals[a * 3 + 2];
    if (dot >= 0) indices.push(a, b, c); else indices.push(a, c, b);
  };
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const ids = corners.map(c => index(x + c[0], y + c[1], z + c[2]));
    const inside = ids.map(i => field[i] < 0);
    if (inside.every(Boolean) || inside.every(v => !v)) continue;
    for (const tet of tetrahedra) {
      const inn = tet.filter(i => inside[i]), out = tet.filter(i => !inside[i]);
      if (inn.length === 0 || inn.length === 4) continue;
      const v = (a: number, b: number) => vertex(ids[a], ids[b]);
      if (inn.length === 1) triangle(v(inn[0], out[0]), v(inn[0], out[1]), v(inn[0], out[2]));
      else if (inn.length === 3) triangle(v(out[0], inn[0]), v(out[0], inn[1]), v(out[0], inn[2]));
      else {
        const a = v(inn[0], out[0]), b = v(inn[0], out[1]), c = v(inn[1], out[0]), d = v(inn[1], out[1]);
        triangle(a, b, c);
        triangle(b, d, c);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
