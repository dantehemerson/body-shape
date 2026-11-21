import { describe, expect, it } from 'vitest';
import { convertMeasurements, ellipseCircumference, ellipseRadii, resolveMeasurements } from '../src/measurements';

const input = { height: 180, weight: 82, waist: 86, chest: 104, hips: 100 };

describe('measurement resolution', () => {
  it('preserves every explicit measurement and marks only defaults as estimated', () => {
    const body = resolveMeasurements(input);
    expect(body.measurements.waist).toBe(86);
    expect(body.estimatedKeys).not.toContain('waist');
    expect(body.estimatedKeys).toContain('neck');
    expect(body.bmi).toBeCloseTo(25.3086);
    expect(input).toEqual({ height: 180, weight: 82, waist: 86, chest: 104, hips: 100 });
  });
  it('uses distinct adult template frames', () => {
    const male = resolveMeasurements({ height: 170, weight: 65 }, 'male');
    const female = resolveMeasurements({ height: 170, weight: 65 }, 'female');
    expect(female.measurements.shoulderWidth).toBeLessThan(male.measurements.shoulderWidth);
    expect(female.measurements.hips).toBeGreaterThan(male.measurements.hips);
  });
  it('uses weight only to infer unspecified measurements', () => {
    const a = resolveMeasurements({ ...input, weight: 60 });
    const b = resolveMeasurements({ ...input, weight: 95 });
    expect(a.measurements.waist).toBe(b.measurements.waist);
    expect(a.measurements.thigh).toBeLessThan(b.measurements.thigh);
  });
  it('round-trips units without dropping optional values or adding estimates', () => {
    const imperial = convertMeasurements(input, 'metric', 'imperial');
    expect(imperial.height).toBeCloseTo(70.86614);
    expect(imperial.weight).toBeCloseTo(180.77905);
    expect(imperial.neck).toBeUndefined();
    const metric = convertMeasurements(imperial, 'imperial', 'metric');
    for (const key of Object.keys(input) as (keyof typeof input)[]) expect(metric[key]).toBeCloseTo(input[key], 10);
    const resolved = resolveMeasurements(imperial, 'male', 'imperial');
    expect(resolved.measurements.chest).toBeCloseTo(104);
  });
  it.each([NaN, Infinity, -Infinity, 0, -5, 231])('rejects invalid height %s', height => {
    expect(() => resolveMeasurements({ height, weight: 82 })).toThrow(RangeError);
  });
  it('rejects missing required values and unknown runtime options', () => {
    expect(() => resolveMeasurements({} as never)).toThrow();
    expect(() => resolveMeasurements(input, 'unknown' as never)).toThrow();
    expect(() => resolveMeasurements(input, 'male', 'feet' as never)).toThrow();
  });
  it('rejects impossible segment combinations instead of silently distorting them', () => {
    expect(() => resolveMeasurements({ height: 180, weight: 80, inseam: 110 })).toThrow(/Inseam/);
    expect(() => resolveMeasurements({ height: 180, weight: 80, torsoLength: 85 })).toThrow(/torso/);
  });
  it('fits the specified circumference with an elliptical cross section', () => {
    for (const ratio of [1, 1.4, 1.55]) {
      const [a, b] = ellipseRadii(104, ratio);
      expect(ellipseCircumference(a, b)).toBeCloseTo(104, 9);
      expect(a / b).toBeCloseTo(ratio);
    }
  });
});
