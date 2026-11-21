import { describe, expect, it } from 'vitest';
import { meshSection } from '../src/mesh-section';

const cube = new Float64Array([
  -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
]);
const faces = new Int32Array([
  0, 3, 2, 1, 4, 5, 6, 7, 0, 1, 5, 4,
  3, 7, 6, 2, 0, 4, 7, 3, 1, 2, 6, 5,
]);

describe('surface-derived measurement sections', () => {
  it('measures a connected contour rather than an ellipse approximation', () => {
    const section = meshSection(cube, faces, [0, 0, 0]);
    expect(section).not.toBeNull();
    expect(section!.circumference).toBeCloseTo(8, 6);
    expect(section!.points.length).toBe(4);
  });
  it('returns no contour when the measurement plane misses the mesh', () => {
    expect(meshSection(cube, faces, [0, 3, 0])).toBeNull();
  });
  it('separates disconnected body parts and selects the contour nearest the gauge', () => {
    const points = new Float64Array(cube.length * 2);
    const quads = new Int32Array(faces.length * 2);
    points.set(cube);
    // A second, larger section mimics an arm/other leg crossing the same plane.
    for (let i = 0; i < cube.length; i += 3) {
      points[cube.length + i] = cube[i] * 2 + 7;
      points[cube.length + i + 1] = cube[i + 1] * 2;
      points[cube.length + i + 2] = cube[i + 2] * 2;
    }
    quads.set(faces);
    quads.set(Int32Array.from(faces, value => value + 8), faces.length);
    expect(meshSection(points, quads, [0, 0, 0])!.circumference).toBeCloseTo(8, 6);
    expect(meshSection(points, quads, [7, 0, 0])!.circumference).toBeCloseTo(16, 6);
  });
});
