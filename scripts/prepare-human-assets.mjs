/**
 * Build redistributable model data from MakeHuman's CC0 ASSETS ONLY.
 * No MakeHuman application/source code is downloaded or incorporated.
 * The pinned upstream revision and hashes are recorded alongside the output.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const revision = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const root = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${revision}/`;
const cache = new URL(`../.cache/makehuman/${revision}/`, import.meta.url);
const output = new URL('../src/assets/', import.meta.url);
const licenses = new URL('../licenses/', import.meta.url);
await Promise.all([mkdir(cache, { recursive: true }), mkdir(output, { recursive: true }), mkdir(licenses, { recursive: true })]);
const manifest = {};

async function source(path) {
  const local = new URL(path.replaceAll('/', '__'), cache);
  let text;
  try { text = await readFile(local, 'utf8'); }
  catch {
    const response = await fetch(root + path);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    text = await response.text();
    await writeFile(local, text);
  }
  if (!text.includes('CC0')) throw new Error(`Asset has no explicit CC0 declaration: ${path}`);
  manifest[path] = createHash('sha256').update(text).digest('hex');
  return text;
}

function parseObj(text) {
  const positions = [], groups = {};
  let group = 'default';
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) positions.push(...line.trim().split(/\s+/).slice(1).map(Number));
    if (line.startsWith('g ')) group = line.slice(2).trim();
    if (line.startsWith('f ')) {
      const face = line.trim().split(/\s+/).slice(1).map(v => Number(v.split('/')[0]) - 1);
      if (face.length !== 4) throw new Error('Expected authored quad topology.');
      (groups[group] ??= []).push(face);
    }
  }
  return { positions, groups };
}

function target(text) {
  return text.split('\n').filter(line => /^\d+\s/.test(line)).map(line => line.trim().split(/\s+/).map(Number));
}

function encode(values, factor = 1) {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => {
    const n = Math.round(value * factor);
    if (n < -32768 || n > 32767) throw new Error(`Quantization overflow: ${n}`);
    bytes.writeInt16LE(n, index * 2);
  });
  return bytes.toString('base64');
}

const obj = parseObj(await source('makehuman/data/3dobjs/base.obj'));
const vertices = obj.positions.length / 3;
const bodyFaces = obj.groups.body;
const eyeFaces = [...obj.groups['helper-l-eye'], ...obj.groups['helper-r-eye']];
const jointNames = ['l-shoulder', 'l-elbow', 'l-hand', 'l-upper-leg', 'l-knee', 'l-ankle'];
const sourceJoints = Object.fromEntries(jointNames.map(name =>
  [name, [...new Set(obj.groups[`joint-${name}`].flat())]]));
// Clothing, hair, teeth, unused rig helpers and genital helper geometry are not
// shipped. Keep only visible skin/eyes plus the six anchors used for fitting.
const retained = [...new Set([...bodyFaces.flat(), ...eyeFaces.flat(), ...Object.values(sourceJoints).flat()])].sort((a, b) => a - b);
const remap = new Map(retained.map((source, compact) => [source, compact]));
function sparse(rows) {
  return encode(rows.filter(([index]) => remap.has(index)).flatMap(([index, x, y, z]) =>
    [remap.get(index), x * 1000, y * 1000, z * 1000]));
}
const frames = {};
const macros = {};
for (const sex of ['male', 'female']) {
  const positions = [...obj.positions];
  const ethnicities = ['african', 'asian', 'caucasian'];
  const ethnicTargets = await Promise.all(ethnicities.map(ethnicity =>
    source(`makehuman/data/targets/macrodetails/${ethnicity}-${sex}-young.target`)));
  for (const text of ethnicTargets) for (const [index, x, y, z] of target(text)) {
    positions[index * 3] += x / 3;
    positions[index * 3 + 1] += y / 3;
    positions[index * 3 + 2] += z / 3;
  }
  frames[sex] = encode(retained.flatMap(index => positions.slice(index * 3, index * 3 + 3)), 1000);
  for (const muscle of ['minmuscle', 'averagemuscle', 'maxmuscle']) {
    const files = ['minweight', 'averageweight', 'maxweight'].map(weight => ({
      name: `${sex}-${muscle}-${weight}`,
      path: `makehuman/data/targets/macrodetails/universal-${sex}-young-${muscle}-${weight}.target`,
    }));
    for (const { name, path } of files) macros[name] = sparse(target(await source(path)));
  }
}

const measureNames = {
  chest: 'bust-circ', waist: 'waist-circ', hips: 'hips-circ',
  shoulderWidth: 'shoulder-dist', neck: 'neck-circ', upperArm: 'upperarm-circ',
  wrist: 'wrist-circ', thigh: 'thigh-circ', calf: 'calf-circ', ankle: 'ankle-circ',
  upperArmLength: 'upperarm-length', lowerArmLength: 'lowerarm-length',
};
const targets = {};
for (const [name, asset] of Object.entries(measureNames)) {
  const files = ['decr', 'incr'].map(direction =>
    source(`makehuman/data/targets/measure/measure-${asset}-${direction}.target`));
  targets[name] = (await Promise.all(files)).map(text => sparse(target(text)));
}
for (const direction of ['decr', 'incr']) {
  const files = ['l', 'r'].map(side => source(`makehuman/data/targets/armslegs/${side}-lowerarm-fat-${direction}.target`));
  (targets.forearm ??= []).push(sparse((await Promise.all(files)).flatMap(text => target(text))));
}

const joints = Object.fromEntries(Object.entries(sourceJoints).map(([name, indices]) =>
  [name, indices.map(index => remap.get(index))]));
const payload = {
  format: 1, revision, quantization: 1000, vertexCount: retained.length,
  frames, macros, targets, joints,
  bodyFaces: encode(bodyFaces.flat().map(index => remap.get(index))),
  eyeFaces: encode(eyeFaces.flat().map(index => remap.get(index))),
};
await writeFile(new URL('human.json', output), JSON.stringify(payload) + '\n');
await writeFile(new URL('human.provenance.json', output), JSON.stringify({
  project: 'MakeHuman Community', url: 'https://github.com/makehumancommunity/makehuman',
  revision, license: 'CC0-1.0', quantization: '0.0001 meters (source unit = decimeter)',
  bodyQuads: bodyFaces.length, eyeQuads: eyeFaces.length, vertices,
  retainedVertices: retained.length,
  assets: Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + '\n');
const license = await source('LICENSE.ASSETS.md');
await writeFile(new URL('MakeHuman-CC0-1.0.md', licenses), license);
console.log(`Prepared ${retained.length} of ${vertices} source vertices, ${bodyFaces.length} body quads, ${eyeFaces.length} eye quads.`);
console.log(`Output: ${fileURLToPath(new URL('human.json', output))}`);
