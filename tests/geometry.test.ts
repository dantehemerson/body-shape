import { describe, expect, it } from 'vitest';
import { createBodyGeometry, getBodyLandmarks } from '../src/geometry';
import { resolveMeasurements } from '../src/measurements';

describe('procedural body geometry', () => {
  it.each(['male', 'female'] as const)('builds a finite indexed %s body at realistic scale', template => {
    const body = resolveMeasurements({ height: 180, weight: 80 }, template);
    const geometry = createBodyGeometry(body, 'low');
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    expect(positions.count).toBeGreaterThan(3000);
    expect(geometry.index!.count).toBeGreaterThan(15000);
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
    for (let i = 0; i < normals.count; i += 43) {
      expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4);
    }
    const box = geometry.boundingBox!;
    expect(box.max.y).toBeCloseTo(1.8, 1);
    expect(box.min.y).toBeGreaterThan(-0.03);
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.02);
    geometry.dispose();
  });
  it('responds to waist circumference without changing height', () => {
    const a = createBodyGeometry(resolveMeasurements({ height: 180, weight: 80, waist: 65 }), 'low');
    const b = createBodyGeometry(resolveMeasurements({ height: 180, weight: 80, waist: 120 }), 'low');
    const waistY = getBodyLandmarks(resolveMeasurements({ height: 180, weight: 80 })).waist;
    const widthAtWaist = (geometry: typeof a) => {
      const p = geometry.getAttribute('position');
      let width = 0;
      for (let i = 0; i < p.count; i++) {
        // Exclude the arms crossing the same horizontal plane.
        if (Math.abs(p.getY(i) - waistY) < 0.02 && Math.abs(p.getZ(i)) < 0.04 && Math.abs(p.getX(i)) < 0.28) width = Math.max(width, Math.abs(p.getX(i)));
      }
      return width;
    };
    expect(widthAtWaist(b)).toBeGreaterThan(widthAtWaist(a) * 1.3);
    expect(a.boundingBox!.max.y).toBeCloseTo(b.boundingBox!.max.y, 2);
    a.dispose(); b.dispose();
  });
  it('scales with height and exposes metric landmarks', () => {
    const body = resolveMeasurements({ height: 160, weight: 60 });
    const landmarks = getBodyLandmarks(body);
    expect(landmarks.height).toBe(1.6);
    expect(landmarks.shoulder).toBeGreaterThan(landmarks.chest);
    expect(landmarks.chest).toBeGreaterThan(landmarks.waist);
    const geometry = createBodyGeometry(body, 'low');
    expect(geometry.boundingBox!.max.y).toBeCloseTo(1.6, 1);
    geometry.dispose();
  });
  it('rejects invalid quality and definition', () => {
    const body = resolveMeasurements({ height: 180, weight: 80 });
    expect(() => createBodyGeometry(body, 'invalid' as never)).toThrow();
    expect(() => createBodyGeometry(body, 'low', NaN)).toThrow();
    expect(() => createBodyGeometry(body, 'low', 2)).toThrow();
  });
});
