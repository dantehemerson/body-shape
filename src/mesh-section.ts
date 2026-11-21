import type { Point3 } from './human-data';

export interface MeshSection {
  points: Point3[];
  circumference: number;
}

/**
 * Intersect authored quad topology with a plane and choose the connected contour
 * closest to its center. Separating components avoids accidentally measuring both
 * arms together with a torso, or both legs together with a thigh.
 */
export function meshSection(
  positions: ArrayLike<number>,
  quads: ArrayLike<number>,
  center: Point3,
  normal: Point3 = [0, 1, 0],
): MeshSection | null {
  const count = positions.length / 3;
  const nodes: { point: Point3; neighbors: number[] }[] = [];
  const edges = new Map<number, number>();
  const signed = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    signed[i] = (positions[i * 3] - center[0]) * normal[0] +
      (positions[i * 3 + 1] - center[1]) * normal[1] +
      (positions[i * 3 + 2] - center[2]) * normal[2] - 1e-7;
  }
  const intersection = (a: number, b: number) => {
    const key = Math.min(a, b) * count + Math.max(a, b);
    const previous = edges.get(key);
    if (previous !== undefined) return previous;
    const t = signed[a] / (signed[a] - signed[b]);
    const point = [0, 1, 2].map(d => positions[a * 3 + d] + (positions[b * 3 + d] - positions[a * 3 + d]) * t) as Point3;
    const id = nodes.length;
    nodes.push({ point, neighbors: [] });
    edges.set(key, id);
    return id;
  };
  for (let i = 0; i < quads.length; i += 4) {
    const face = [quads[i], quads[i + 1], quads[i + 2], quads[i + 3]];
    const inside = face.map(id => signed[id] < 0);
    if (inside.every(Boolean) || inside.every(value => !value)) continue;
    const hits: number[] = [];
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      if (inside[edge] !== inside[next]) hits.push(intersection(face[edge], face[next]));
    }
    for (let pair = 0; pair + 1 < hits.length; pair += 2) {
      nodes[hits[pair]].neighbors.push(hits[pair + 1]);
      nodes[hits[pair + 1]].neighbors.push(hits[pair]);
    }
  }
  const visited = new Set<number>();
  let result: MeshSection | null = null;
  let bestDistance = Infinity;
  for (let start = 0; start < nodes.length; start++) {
    if (visited.has(start)) continue;
    const component = [start];
    visited.add(start);
    for (let i = 0; i < component.length; i++) for (const neighbor of nodes[component[i]].neighbors) {
      if (!visited.has(neighbor)) { component.push(neighbor); visited.add(neighbor); }
    }
    if (component.length < 4 || component.some(i => nodes[i].neighbors.length !== 2)) continue;
    const centroid: Point3 = [0, 0, 0];
    for (const i of component) for (let d = 0; d < 3; d++) centroid[d] += nodes[i].point[d] / component.length;
    const distance = Math.hypot(...centroid.map((v, d) => v - center[d]));
    if (distance >= bestDistance) continue;
    const points: Point3[] = [];
    let current = start, previous = -1;
    do {
      points.push(nodes[current].point);
      const next = nodes[current].neighbors.find(i => i !== previous)!;
      previous = current;
      current = next;
    } while (current !== start && points.length <= component.length);
    if (current !== start) continue;
    const circumference = points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length];
      return sum + Math.hypot(point[0] - next[0], point[1] - next[1], point[2] - next[2]);
    }, 0);
    bestDistance = distance;
    result = { points, circumference };
  }
  return result;
}
