import { BufferAttribute, BufferGeometry } from 'three';
import type { MeasurementKey, ResolvedBody } from './measurements';
import {
  addTarget, createControlPositions, getControlFaces, getMeasurementTarget,
  joint, modelSource, type Point3, type Positions,
} from './human-data';
import { meshSection, type MeshSection } from './mesh-section';
import { subdivideHuman } from './subdivision';

export type GeometryQuality = 'low' | 'medium' | 'high';
export interface BodyLandmarks {
  height: number; groin: number; shoulder: number; chest: number; waist: number; hips: number;
}
export interface BodyMeasurementGuide extends MeshSection {
  key: 'chest' | 'waist' | 'hips';
  /** Requested circumference in meters; actual surface remains approximate. */
  target: number;
}
export interface BodyGeometryMetadata {
  source: typeof modelSource;
  landmarks: BodyLandmarks;
  guides: BodyMeasurementGuide[];
  /** The fitting range is limited to preserve the authored human anatomy. */
  limitedMeasurements: MeasurementKey[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mix = (a: Point3, b: Point3, t: number): Point3 => a.map((v, i) => v + (b[i] - v) * t) as Point3;
const direction = (a: Point3, b: Point3): Point3 => {
  const length = Math.hypot(...a.map((v, i) => b[i] - v)) || 1;
  return a.map((v, i) => (b[i] - v) / length) as Point3;
};

/** World coordinates: meters, Y up, +Z forward. */
export function getBodyLandmarks(body: ResolvedBody): BodyLandmarks {
  const m = body.measurements;
  const height = m.height / 100;
  const groin = m.inseam / 100;
  const shoulder = Math.min(groin + m.torsoLength / 100, height - m.headHeight / 100 - height * 0.025);
  return {
    height, groin, shoulder,
    chest: groin + (shoulder - groin) * 0.76,
    waist: groin + (shoulder - groin) * 0.42,
    hips: groin + (shoulder - groin) * 0.15,
  };
}

interface NativeFrame { floor: number; top: number; groin: number; shoulder: number; chin: number }
function nativeFrame(positions: Positions, faces: Int32Array): NativeFrame {
  const vertices = new Set(faces);
  let floor = Infinity, top = -Infinity, groin = Infinity;
  for (const i of vertices) {
    const x = positions[i * 3], y = positions[i * 3 + 1];
    floor = Math.min(floor, y); top = Math.max(top, y);
    if (Math.abs(x) < 0.12 && y > -3) groin = Math.min(groin, y);
  }
  return { floor, top, groin, shoulder: joint(positions, 'l-shoulder')[1], chin: top - (top - floor) * 0.13 };
}

function gauge(positions: Positions, frame: NativeFrame, key: string): { center: Point3; normal: Point3 } {
  const at = (fraction: number) => frame.groin + (frame.shoulder - frame.groin) * fraction;
  const horizontal = (y: number) => ({ center: [0, y, 0] as Point3, normal: [0, 1, 0] as Point3 });
  if (key === 'chest') return horizontal(at(0.76));
  if (key === 'waist') return horizontal(at(0.42));
  if (key === 'hips') return horizontal(at(0.15));
  if (key === 'neck') return horizontal(frame.top - (frame.top - frame.floor) * 0.14);
  const shoulder = joint(positions, 'l-shoulder'), elbow = joint(positions, 'l-elbow'), hand = joint(positions, 'l-hand');
  const hip = joint(positions, 'l-upper-leg'), knee = joint(positions, 'l-knee'), ankle = joint(positions, 'l-ankle');
  if (key === 'upperArm') return { center: mix(shoulder, elbow, 0.43), normal: direction(shoulder, elbow) };
  if (key === 'forearm') return { center: mix(elbow, hand, 0.32), normal: direction(elbow, hand) };
  if (key === 'wrist') return { center: mix(elbow, hand, 0.94), normal: direction(elbow, hand) };
  if (key === 'thigh') return { center: mix(hip, knee, 0.30), normal: direction(hip, knee) };
  if (key === 'calf') return { center: mix(knee, ankle, 0.36), normal: direction(knee, ankle) };
  return { center: mix(knee, ankle, 0.94), normal: direction(knee, ankle) };
}

function shoulderWidth(positions: Positions, frame: NativeFrame, faces: Int32Array): number {
  let left = 0, right = 0;
  const level = frame.shoulder + (frame.top - frame.floor) * 0.023;
  for (const i of new Set(faces)) {
    const y = positions[i * 3 + 1];
    if (Math.abs(y - level) > (frame.top - frame.floor) * 0.004) continue;
    left = Math.min(left, positions[i * 3]); right = Math.max(right, positions[i * 3]);
  }
  return right - left;
}

/**
 * Calibrate the artist-authored measurement morphs against actual mesh sections.
 * We limit extrapolation rather than destroying the anatomy to hit extreme inputs.
 */
function fitMeasurements(positions: Positions, body: ResolvedBody, faces: Int32Array, frame: NativeFrame): MeasurementKey[] {
  const scale = body.measurements.height / 100 / (frame.top - frame.floor);
  const limited = new Set<MeasurementKey>();
  const keys = ['chest', 'waist', 'hips', 'neck', 'upperArm', 'forearm', 'wrist', 'thigh', 'calf', 'ankle', 'shoulderWidth'] as const;
  for (const key of keys) {
    const plane = gauge(positions, frame, key);
    const measure = (values: Positions) => key === 'shoulderWidth' ? shoulderWidth(values, frame, faces)
      : meshSection(values, faces, plane.center, plane.normal)?.circumference;
    const actual = measure(positions);
    if (!actual) continue;
    const desired = body.measurements[key] / 100 / scale;
    if (Math.abs(desired - actual) * scale < 0.003) continue;
    const target = getMeasurementTarget(key, desired < actual ? 'decr' : 'incr');
    const candidate = positions.slice();
    addTarget(candidate, target, 1);
    const changed = measure(candidate);
    if (!changed || Math.abs(changed - actual) < 1e-5) { limited.add(key); continue; }
    const rawWeight = (desired - actual) / (changed - actual);
    const limit = key === 'waist' || key === 'hips' || key === 'chest' ? 2.5 : 1.5;
    const weight = clamp(rawWeight, 0, limit);
    if (rawWeight > limit || rawWeight < 0) limited.add(key);
    addTarget(positions, target, weight);
  }
  // The authored length targets move the full limb and its skeletal helpers,
  // keeping hands attached rather than stretching individual render meshes.
  const armDistance = (values: Positions, upper: boolean) => {
    const a = joint(values, upper ? 'l-shoulder' : 'l-elbow');
    const b = joint(values, upper ? 'l-elbow' : 'l-hand');
    return Math.hypot(...a.map((v, i) => b[i] - v));
  };
  const upper = armDistance(positions, true), lower = armDistance(positions, false);
  for (const isUpper of [true, false]) {
    const actual = armDistance(positions, isUpper);
    const desired = body.measurements.armLength / 100 / scale * (isUpper ? upper : lower) / (upper + lower);
    const name = isUpper ? 'upperArmLength' : 'lowerArmLength';
    const target = getMeasurementTarget(name, desired < actual ? 'decr' : 'incr');
    const candidate = positions.slice();
    addTarget(candidate, target, 1);
    const changed = armDistance(candidate, isUpper);
    if (Math.abs(changed - actual) < 1e-5) continue;
    const rawWeight = (desired - actual) / (changed - actual);
    if (rawWeight > 1.5 || rawWeight < 0) limited.add('armLength');
    addTarget(positions, target, clamp(rawWeight, 0, 1.5));
  }
  return [...limited];
}

function applyProportions(positions: Positions, frame: NativeFrame, body: ResolvedBody): void {
  const landmarks = getBodyLandmarks(body);
  const h = landmarks.height;
  const scale = h / (frame.top - frame.floor);
  const source = [frame.floor, frame.groin, frame.shoulder, frame.chin, frame.top];
  const target = [0, landmarks.groin, landmarks.shoulder, h - body.measurements.headHeight / 100, h];
  const mapY = (value: number) => {
    let i = 0;
    while (i < source.length - 2 && value > source[i + 1]) i++;
    return target[i] + (value - source[i]) / (source[i + 1] - source[i]) * (target[i + 1] - target[i]);
  };
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] *= scale;
    positions[i + 1] = mapY(positions[i + 1]);
    positions[i + 2] *= scale;
  }
}

/** Read-only metadata for surface-derived guides and fitting limits. */
export function getBodyGeometryMetadata(geometry: BufferGeometry): BodyGeometryMetadata {
  return geometry.userData.bodyShape as BodyGeometryMetadata;
}

/**
 * Anatomical MakeHuman CC0 mesh + authored macro/measurement morphs, independently
 * fitted and subdivided here. No implicit primitive synthesis. Caller owns disposal.
 */
export function createBodyGeometry(body: ResolvedBody, quality: GeometryQuality = 'medium', muscle = 0.35): BufferGeometry {
  if (!['low', 'medium', 'high'].includes(quality)) throw new TypeError('Unknown geometry quality.');
  if (!Number.isFinite(muscle) || muscle < 0 || muscle > 1) throw new RangeError('Muscle must be in [0, 1].');
  const control = createControlPositions(body, muscle);
  const bodyFaces = getControlFaces();
  const frame = nativeFrame(control, bodyFaces);
  const limitedMeasurements = fitMeasurements(control, body, bodyFaces, frame);
  applyProportions(control, frame, body);
  const { positions, quads } = subdivideHuman(control, getControlFaces(true), { low: 0, medium: 1, high: 2 }[quality]);
  // Catmull–Clark shrinks a small amount at the crown/sole. Preserve exact input height.
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) { minY = Math.min(minY, positions[i]); maxY = Math.max(maxY, positions[i]); }
  const correction = body.measurements.height / 100 / (maxY - minY);
  for (let i = 1; i < positions.length; i += 3) positions[i] = (positions[i] - minY) * correction;
  const indices = new Uint32Array(quads.length / 4 * 6);
  for (let i = 0; i < quads.length / 4; i++) {
    const [a, b, c, d] = quads.subarray(i * 4, i * 4 + 4);
    indices.set([a, b, c, a, c, d], i * 6);
  }
  const landmarks = getBodyLandmarks(body);
  const guides: BodyMeasurementGuide[] = [];
  for (const key of ['chest', 'waist', 'hips'] as const) {
    const section = meshSection(positions, quads, [0, landmarks[key], 0]);
    if (section) guides.push({ key, ...section, target: body.measurements[key] / 100 });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.bodyShape = { source: modelSource, landmarks, guides, limitedMeasurements } satisfies BodyGeometryMetadata;
  return geometry;
}
