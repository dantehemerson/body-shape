export type BodyTemplate = 'male' | 'female';
export type MeasurementUnits = 'metric' | 'imperial';

/** Metric: centimeters / kilograms. Imperial: inches / pounds, including height. */
export interface BodyMeasurements {
  height: number;
  weight: number;
  chest?: number;
  waist?: number;
  hips?: number;
  shoulderWidth?: number;
  neck?: number;
  upperArm?: number;
  forearm?: number;
  wrist?: number;
  thigh?: number;
  calf?: number;
  ankle?: number;
  inseam?: number;
  torsoLength?: number;
  armLength?: number;
  headHeight?: number;
}

export type MeasurementKey = keyof BodyMeasurements;
export type ResolvedMeasurements = Required<BodyMeasurements>;

export interface MeasurementDefinition {
  key: MeasurementKey;
  label: string;
  group: 'basic' | 'upper' | 'lower';
  /** Supported adult input range in cm/kg, not a medical reference range. */
  min: number;
  max: number;
  description: string;
}

export const measurementDefinitions: readonly MeasurementDefinition[] = [
  { key: 'height', label: 'Height', group: 'basic', min: 120, max: 230, description: 'Standing height, floor to top of head.' },
  { key: 'weight', label: 'Weight', group: 'basic', min: 30, max: 250, description: 'Body weight. Used to estimate unspecified measurements.' },
  { key: 'chest', label: 'Chest / bust', group: 'basic', min: 55, max: 180, description: 'Circumference around the fullest part of the chest or bust.' },
  { key: 'waist', label: 'Waist', group: 'basic', min: 40, max: 200, description: 'Circumference at the natural waist, not the trouser waistband.' },
  { key: 'hips', label: 'Hips', group: 'basic', min: 60, max: 200, description: 'Circumference around the widest part of the hips and seat.' },
  { key: 'shoulderWidth', label: 'Shoulder width', group: 'upper', min: 25, max: 65, description: 'Straight-line width between the outer shoulders; not a circumference.' },
  { key: 'neck', label: 'Neck', group: 'upper', min: 20, max: 70, description: 'Circumference around the base of the neck.' },
  { key: 'upperArm', label: 'Upper arm', group: 'upper', min: 14, max: 70, description: 'Circumference at the fullest part of a relaxed upper arm.' },
  { key: 'forearm', label: 'Forearm', group: 'upper', min: 12, max: 50, description: 'Circumference at the widest part of the forearm.' },
  { key: 'wrist', label: 'Wrist', group: 'upper', min: 10, max: 30, description: 'Circumference around the wrist bones.' },
  { key: 'armLength', label: 'Arm length', group: 'upper', min: 35, max: 95, description: 'Shoulder to wrist length, excluding the hand.' },
  { key: 'torsoLength', label: 'Torso length', group: 'upper', min: 30, max: 85, description: 'Vertical crotch-to-shoulder distance in this model.' },
  { key: 'headHeight', label: 'Head height', group: 'upper', min: 16, max: 32, description: 'Chin to crown distance.' },
  { key: 'thigh', label: 'Thigh', group: 'lower', min: 25, max: 100, description: 'Circumference at the fullest part of the upper thigh.' },
  { key: 'calf', label: 'Calf', group: 'lower', min: 18, max: 65, description: 'Circumference at the widest part of the calf.' },
  { key: 'ankle', label: 'Ankle', group: 'lower', min: 13, max: 40, description: 'Circumference just above the ankle bones.' },
  { key: 'inseam', label: 'Inseam', group: 'lower', min: 45, max: 115, description: 'Floor-to-crotch length, barefoot.' },
] as const;

export function toMetric(value: number, key: MeasurementKey, units: MeasurementUnits): number {
  return units === 'metric' ? value : value * (key === 'weight' ? 0.45359237 : 2.54);
}

export function fromMetric(value: number, key: MeasurementKey, units: MeasurementUnits): number {
  return units === 'metric' ? value : value / (key === 'weight' ? 0.45359237 : 2.54);
}

export function convertMeasurements(
  values: BodyMeasurements,
  from: MeasurementUnits,
  to: MeasurementUnits,
): BodyMeasurements {
  const result: Record<string, number> = {};
  for (const { key } of measurementDefinitions) {
    const value = values[key];
    if (value !== undefined) result[key] = fromMetric(toMetric(value, key, from), key, to);
  }
  return result as unknown as BodyMeasurements;
}

export interface ResolvedBody {
  /** Always centimeters and kilograms, regardless of input units. */
  measurements: ResolvedMeasurements;
  estimatedKeys: MeasurementKey[];
  bmi: number;
  template: BodyTemplate;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Explicit tape measurements override weight-derived defaults. Never mutates inputs. */
export function resolveMeasurements(
  input: BodyMeasurements,
  template: BodyTemplate = 'male',
  units: MeasurementUnits = 'metric',
): ResolvedBody {
  if (template !== 'male' && template !== 'female') throw new TypeError('Unknown body template.');
  if (units !== 'metric' && units !== 'imperial') throw new TypeError('Unknown measurement units.');
  const explicit: Partial<ResolvedMeasurements> = {};
  for (const { key, min, max } of measurementDefinitions) {
    const value = input[key];
    if (value === undefined && key !== 'height' && key !== 'weight') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RangeError(`${key} must be a finite number.`);
    }
    const metric = toMetric(value, key, units);
    // Allow floating-point error from lossless unit round-trips.
    if (metric < min - 1e-8 || metric > max + 1e-8) {
      throw new RangeError(`${key} must be between ${fromMetric(min, key, units).toFixed(1)} and ${fromMetric(max, key, units).toFixed(1)} ${key === 'weight' ? (units === 'metric' ? 'kg' : 'lb') : (units === 'metric' ? 'cm' : 'in')}.`);
    }
    explicit[key] = metric;
  }
  const height = explicit.height!;
  const weight = explicit.weight!;
  const bmi = weight / (height / 100) ** 2;
  const female = template === 'female';
  const fullness = clamp(Math.sqrt(bmi / 23), 0.74, 1.65);
  const base: ResolvedMeasurements = {
    height, weight,
    chest: height * (female ? 0.515 : 0.56) * fullness,
    waist: height * (female ? 0.405 : 0.46) * fullness ** 1.3,
    hips: height * (female ? 0.565 : 0.545) * fullness,
    shoulderWidth: height * (female ? 0.225 : 0.255),
    neck: height * (female ? 0.19 : 0.215) * fullness ** 0.5,
    upperArm: height * (female ? 0.157 : 0.185) * fullness,
    forearm: height * (female ? 0.14 : 0.16) * fullness ** 0.6,
    wrist: height * (female ? 0.09 : 0.10),
    thigh: height * (female ? 0.335 : 0.32) * fullness,
    calf: height * 0.215 * fullness ** 0.6,
    ankle: height * 0.125,
    inseam: height * 0.465,
    torsoLength: height * 0.345,
    armLength: height * 0.325,
    headHeight: height * 0.13,
  };
  // Keep inferred values inside the documented input domain.
  for (const { key, min, max } of measurementDefinitions) base[key] = clamp(base[key], min, max);
  const measurements = { ...base, ...explicit };
  if (measurements.inseam > height * 0.57 || measurements.inseam < height * 0.33) {
    throw new RangeError('Inseam must be between 33% and 57% of height.');
  }
  if (measurements.inseam + measurements.torsoLength > height * 0.87 ||
      measurements.inseam + measurements.torsoLength < height * 0.70) {
    throw new RangeError('Inseam + torso length must be between 70% and 87% of height.');
  }
  return {
    measurements, bmi, template,
    estimatedKeys: measurementDefinitions.filter(({ key }) => input[key] === undefined).map(({ key }) => key),
  };
}

/** Ramanujan ellipse perimeter. Radius inputs and result use the same units. */
export function ellipseCircumference(a: number, b: number): number {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
}

export function ellipseRadii(circumference: number, widthToDepth = 1.4): [number, number] {
  const depth = circumference / ellipseCircumference(widthToDepth, 1);
  return [depth * widthToDepth, depth];
}
