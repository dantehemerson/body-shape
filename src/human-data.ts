import asset from './assets/human.json';
import type { ResolvedBody } from './measurements';

export type Point3 = [number, number, number];
export type Positions = Float64Array;

/** Decode the little-endian quantized CC0 asset data lazily, on first mesh use. */
function decode(encoded: string): Int16Array {
  const binary = atob(encoded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(buffer);
  const values = new Int16Array(binary.length / 2);
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true);
  return values;
}

const decoded = new Map<string, Int16Array>();
function cached(key: string, encoded: string): Int16Array {
  let values = decoded.get(key);
  if (!values) { values = decode(encoded); decoded.set(key, values); }
  return values;
}

export function getControlFaces(includeEyes = false): Int32Array {
  const body = cached('bodyFaces', asset.bodyFaces);
  if (!includeEyes) return Int32Array.from(body);
  const eyes = cached('eyeFaces', asset.eyeFaces);
  const faces = new Int32Array(body.length + eyes.length);
  faces.set(body); faces.set(eyes, body.length);
  return faces;
}

/** Sparse records are [source vertex index, dx, dy, dz]; source units are dm. */
export function addTarget(positions: Positions, target: Int16Array, weight: number): void {
  if (!weight) return;
  const factor = weight / asset.quantization;
  for (let i = 0; i < target.length; i += 4) {
    const vertex = target[i] * 3;
    positions[vertex] += target[i + 1] * factor;
    positions[vertex + 1] += target[i + 2] * factor;
    positions[vertex + 2] += target[i + 3] * factor;
  }
}

export function getMeasurementTarget(name: string, direction: 'decr' | 'incr'): Int16Array {
  const encoded = (asset.targets as Record<string, string[]>)[name]?.[direction === 'decr' ? 0 : 1];
  if (encoded === undefined) throw new Error(`No authored target for ${name}.`);
  return cached(`${name}-${direction}`, encoded);
}

export function joint(positions: ArrayLike<number>, name: keyof typeof asset.joints): Point3 {
  const indices = asset.joints[name];
  const result: Point3 = [0, 0, 0];
  for (const i of indices) for (let d = 0; d < 3; d++) result[d] += positions[i * 3 + d] / indices.length;
  return result;
}

function weights(value: number): [number, number][] {
  const t = Math.max(0, Math.min(2, value));
  const lower = Math.min(1, Math.floor(t));
  return [[lower, 1 - (t - lower)], [lower + 1, t - lower]];
}

/** Blend authored adult frame + 3x3 muscle/weight shapes, not geometric primitives. */
export function createControlPositions(body: ResolvedBody, muscle: number): Positions {
  const frame = cached(`frame-${body.template}`, asset.frames[body.template]);
  const positions = Float64Array.from(frame, value => value / asset.quantization);
  const muscleNames = ['minmuscle', 'averagemuscle', 'maxmuscle'];
  const weightNames = ['minweight', 'averageweight', 'maxweight'];
  const fullness = body.bmi < 23 ? (body.bmi - 17) / 6 : 1 + (body.bmi - 23) / 16;
  for (const [mi, mw] of weights(muscle * 2)) for (const [wi, ww] of weights(fullness)) {
    if (!mw || !ww) continue;
    const name = `${body.template}-${muscleNames[mi]}-${weightNames[wi]}`;
    const encoded = (asset.macros as Record<string, string>)[name];
    addTarget(positions, cached(name, encoded), mw * ww);
  }
  return positions;
}

export const modelSource = {
  name: 'MakeHuman hm08',
  revision: asset.revision,
  license: 'CC0-1.0',
} as const;
