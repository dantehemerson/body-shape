import { describe, expect, it } from 'vitest';
import { createBodyGeometry, getBodyLandmarks, getBodyGeometryMetadata } from '../src/geometry';
import { resolveMeasurements } from '../src/measurements';

describe('anatomical body geometry', () => {
  it('uses authored skin/eye topology and never renders the rig or clothing helpers', () => {
    const geometry = createBodyGeometry(resolveMeasurements({ height: 180, weight: 82 }), 'low');
    const data = getBodyGeometryMetadata(geometry);
    expect(data.source.name).toBe('MakeHuman hm08');
    expect(data.source.license).toBe('CC0-1.0');
    expect(geometry.getAttribute('position').count).toBeLessThan(15000);
    expect(geometry.index!.count).toBe((13378 + 140) * 6);
    expect(data.guides.map(guide => guide.key)).toEqual(['chest', 'waist', 'hips']);
    for (const guide of data.guides) {
      expect(guide.points.length).toBeGreaterThan(20);
      const measured = guide.points.reduce((sum, p, i) => {
        const next = guide.points[(i + 1) % guide.points.length];
        return sum + Math.hypot(...p.map((value, d) => value - next[d]));
      }, 0);
      expect(guide.circumference).toBeCloseTo(measured, 8);
    }
    geometry.dispose();
  });
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
    const waistSection = (geometry: typeof a) => getBodyGeometryMetadata(geometry).guides.find(guide => guide.key === 'waist')!;
    expect(waistSection(b).circumference).toBeGreaterThan(waistSection(a).circumference * 1.3);
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
  it('keeps topology stable while authored frame, muscle and limb length change', () => {
    const short = createBodyGeometry(resolveMeasurements({ height: 180, weight: 82, armLength: 45 }), 'low', 0.1);
    const long = createBodyGeometry(resolveMeasurements({ height: 180, weight: 82, armLength: 70 }), 'low', 0.9);
    expect(long.getAttribute('position').count).toBe(short.getAttribute('position').count);
    expect(long.index!.count).toBe(short.index!.count);
    expect(long.boundingBox!.max.x).toBeGreaterThan(short.boundingBox!.max.x);
    expect(long.boundingBox!.max.y).toBeCloseTo(1.8, 5);
    short.dispose(); long.dispose();
  });
  it('subdivides the anatomical surface without changing the requested height', () => {
    const body = resolveMeasurements({ height: 168, weight: 62 }, 'female');
    const low = createBodyGeometry(body, 'low');
    const medium = createBodyGeometry(body, 'medium');
    const high = createBodyGeometry(body, 'high');
    expect(medium.index!.count).toBe(low.index!.count * 4);
    expect(high.index!.count).toBe(medium.index!.count * 4);
    expect(high.boundingBox!.max.y).toBeCloseTo(1.68, 5);
    expect(high.boundingBox!.min.y).toBeCloseTo(0, 5);
    low.dispose(); medium.dispose(); high.dispose();
  });
  it('rejects invalid quality and definition', () => {
    const body = resolveMeasurements({ height: 180, weight: 80 });
    expect(() => createBodyGeometry(body, 'invalid' as never)).toThrow();
    expect(() => createBodyGeometry(body, 'low', NaN)).toThrow();
    expect(() => createBodyGeometry(body, 'low', 2)).toThrow();
  });
});
