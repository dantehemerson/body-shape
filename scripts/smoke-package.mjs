import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const tarball = process.argv[2];
if (!tarball) throw new Error('Usage: node scripts/smoke-package.mjs path/to/package.tgz');
const directory = mkdtempSync(join(tmpdir(), 'body-shape-package-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: directory, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
try {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', resolve(tarball), 'react@19', 'react-dom@19', 'three@0.181', 'typescript@5', '@types/react@19', '@types/react-dom@19', '@types/three@0.181']);
  writeFileSync(join(directory, 'consumer.tsx'), `
    import { BodyVisualizer, MeasurementEditor, type BodyMeasurements } from '@dantehemerson/react-body-shape';
    import { resolveMeasurements, createBodyGeometry, type GeometryQuality } from '@dantehemerson/react-body-shape/core';
    const values: BodyMeasurements = { height: 180, weight: 82, waist: 86 };
    const quality: GeometryQuality = 'low';
    const shape = createBodyGeometry(resolveMeasurements(values), quality);
    shape.dispose();
    export const example = <>
      <BodyVisualizer measurements={values} showMeasurements />
      <MeasurementEditor value={values} onChange={next => console.log(next.waist)} />
    </>;
  `);
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--skipLibCheck', '--jsx', 'react-jsx', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', 'consumer.tsx']);
  writeFileSync(join(directory, 'verify.mjs'), `
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import { BodyVisualizer, MeasurementEditor } from '@dantehemerson/react-body-shape';
    import { resolveMeasurements, createBodyGeometry, getBodyGeometryMetadata } from '@dantehemerson/react-body-shape/core';
    import { readFileSync, existsSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    const measurements = {height: 180, weight: 82, waist: 86};
    const html = renderToString(createElement(BodyVisualizer, {measurements}));
    if (!html.includes('Preparing your 3D view')) throw new Error('SSR shell missing.');
    const editor = renderToString(createElement(MeasurementEditor, {value: measurements, onChange() {}}));
    if (!editor.includes('Height')) throw new Error('Editor missing.');
    const geometry = createBodyGeometry(resolveMeasurements(measurements), 'low');
    if (geometry.getAttribute('position').count < 1000) throw new Error('Packaged core mesh failed.');
    if (getBodyGeometryMetadata(geometry).source.license !== 'CC0-1.0') throw new Error('Wrong model source.');
    geometry.dispose();
    const css = readFileSync(fileURLToPath(import.meta.resolve('@dantehemerson/react-body-shape/styles.css')), 'utf8');
    if (!css.includes('.bs-viewer')) throw new Error('Styles missing.');
    if (!existsSync('node_modules/@dantehemerson/react-body-shape/licenses/MakeHuman-CC0-1.0.md')) throw new Error('Model license missing.');
    if (!existsSync('node_modules/@dantehemerson/react-body-shape/THIRD_PARTY_NOTICES.md')) throw new Error('Model provenance missing.');
    console.log('Packed install, typed exports, SSR shell, editor, core geometry and CSS: OK');
  `);
  run(process.execPath, ['verify.mjs']);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
