interface Edge { a: number; b: number; faces: number[] }
interface Plan {
  count: number; quads: Int32Array; edges: Edge[];
  facesAt: number[][]; edgesAt: number[][];
  nextQuads: Int32Array;
}

/** Original Catmull–Clark implementation over the authored anatomical quads. */
function plan(quads: Int32Array, count: number): Plan {
  const faceCount = quads.length / 4;
  const edges: Edge[] = [];
  const lookup = new Map<number, number>();
  const facesAt = Array.from({ length: count }, () => [] as number[]);
  const edgesAt = Array.from({ length: count }, () => [] as number[]);
  const faceEdges = new Int32Array(quads.length);
  for (let f = 0; f < faceCount; f++) for (let c = 0; c < 4; c++) {
    const a = quads[f * 4 + c], b = quads[f * 4 + (c + 1) % 4];
    facesAt[a].push(f);
    const key = Math.min(a, b) * count + Math.max(a, b);
    let id = lookup.get(key);
    if (id === undefined) {
      id = edges.length;
      edges.push({ a, b, faces: [] });
      edgesAt[a].push(id); edgesAt[b].push(id);
      lookup.set(key, id);
    }
    edges[id].faces.push(f);
    faceEdges[f * 4 + c] = id;
  }
  const nextQuads = new Int32Array(quads.length * 4);
  for (let f = 0; f < faceCount; f++) for (let c = 0; c < 4; c++) {
    const offset = (f * 4 + c) * 4;
    nextQuads.set([
      quads[f * 4 + c],
      count + faceCount + faceEdges[f * 4 + c],
      count + f,
      count + faceCount + faceEdges[f * 4 + (c + 3) % 4],
    ], offset);
  }
  return { count, quads, edges, facesAt, edgesAt, nextQuads };
}

function evaluate(positions: Float64Array, p: Plan): Float64Array {
  const faces = p.quads.length / 4;
  const result = new Float64Array((p.count + faces + p.edges.length) * 3);
  for (let f = 0; f < faces; f++) for (let d = 0; d < 3; d++) {
    let value = 0;
    for (let c = 0; c < 4; c++) value += positions[p.quads[f * 4 + c] * 3 + d] / 4;
    result[(p.count + f) * 3 + d] = value;
  }
  for (let e = 0; e < p.edges.length; e++) {
    const edge = p.edges[e];
    for (let d = 0; d < 3; d++) {
      const sum = positions[edge.a * 3 + d] + positions[edge.b * 3 + d];
      result[(p.count + faces + e) * 3 + d] = edge.faces.length === 2
        ? (sum + result[(p.count + edge.faces[0]) * 3 + d] + result[(p.count + edge.faces[1]) * 3 + d]) / 4
        : sum / 2;
    }
  }
  for (let v = 0; v < p.count; v++) {
    const neighbors = p.edgesAt[v];
    const boundary = neighbors.filter(e => p.edges[e].faces.length !== 2);
    for (let d = 0; d < 3; d++) {
      const original = positions[v * 3 + d];
      if (boundary.length === 2) {
        result[v * 3 + d] = original * 0.75 + boundary.reduce((sum, e) => {
          const edge = p.edges[e];
          return sum + positions[(edge.a === v ? edge.b : edge.a) * 3 + d] / 8;
        }, 0);
      } else if (boundary.length || !neighbors.length) result[v * 3 + d] = original;
      else {
        const n = neighbors.length;
        const faceAverage = p.facesAt[v].reduce((sum, f) => sum + result[(p.count + f) * 3 + d], 0) / p.facesAt[v].length;
        const edgeAverage = neighbors.reduce((sum, e) => {
          const edge = p.edges[e];
          return sum + (positions[edge.a * 3 + d] + positions[edge.b * 3 + d]) / 2;
        }, 0) / n;
        result[v * 3 + d] = (faceAverage + 2 * edgeAverage + (n - 3) * original) / n;
      }
    }
  }
  return result;
}

const plans = new Map<number, Plan>();
let sourceIndices: number[] | undefined;
let compactQuads: Int32Array | undefined;

/** Topology plans are shared; positions and returned arrays are per-body. */
export function subdivideHuman(
  control: Float64Array, faces: Int32Array, levels: number,
): { positions: Float64Array; quads: Int32Array } {
  if (!compactQuads || !sourceIndices) {
    sourceIndices = [...new Set(faces)];
    const indices = new Map(sourceIndices.map((source, i) => [source, i]));
    compactQuads = Int32Array.from(faces, index => indices.get(index)!);
  }
  let positions: Float64Array = new Float64Array(sourceIndices.length * 3);
  sourceIndices.forEach((source, index) => {
    positions[index * 3] = control[source * 3];
    positions[index * 3 + 1] = control[source * 3 + 1];
    positions[index * 3 + 2] = control[source * 3 + 2];
  });
  let quads = compactQuads;
  for (let level = 0; level < levels; level++) {
    let p = plans.get(level);
    if (!p) { p = plan(quads, positions.length / 3); plans.set(level, p); }
    positions = evaluate(positions, p);
    quads = p.nextQuads;
  }
  return { positions, quads };
}
