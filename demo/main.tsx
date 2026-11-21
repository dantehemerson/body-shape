import { StrictMode, useId, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../package.json';
import {
  BodyVisualizer, MeasurementEditor, convertMeasurements, fromMetric, resolveMeasurements,
  type BodyMeasurements, type BodyTemplate, type MeasurementUnits,
} from '../src';
import '../src/styles.css';
import './style.css';

const repo = 'https://github.com/dantehemerson/body-shape';
const presets: Record<BodyTemplate, BodyMeasurements> = {
  male: { height: 180, weight: 82, chest: 104, waist: 86, hips: 100 },
  female: { height: 168, weight: 62, chest: 91, waist: 72, hips: 99 },
};

function Mark({ small = false }: { small?: boolean }) {
  return <svg width={small ? 24 : 34} height={small ? 24 : 34} viewBox="0 0 34 34" fill="none" aria-hidden="true">
    <path d="M17 3C11 3 8 10 8 17s3 14 9 14 9-7 9-14S23 3 17 3Z" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="17" cy="17" rx="15" ry="6" stroke="currentColor" strokeWidth="1.5" transform="rotate(-38 17 17)" />
    <path d="M17 3v28" stroke="currentColor" strokeWidth="1.2" />
  </svg>;
}

function Choice<T extends string>({ legend, options, value, onChange }: {
  legend: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const id = useId();
  return <fieldset className="bs-segmented">
    <legend className="bs-sr-only">{legend}</legend>
    {options.map(option => <div key={option.value}>
      <input type="radio" name={id} id={`${id}-${option.value}`} checked={value === option.value}
        onChange={() => onChange(option.value)} />
      <label htmlFor={`${id}-${option.value}`}>{option.label}</label>
    </div>)}
  </fieldset>;
}

function App() {
  const [template, setTemplate] = useState<BodyTemplate>('male');
  const [units, setUnits] = useState<MeasurementUnits>('metric');
  const [measurements, setMeasurements] = useState<BodyMeasurements>(presets.male);
  const [rings, setRings] = useState(true);
  const [grid, setGrid] = useState(true);
  const [color, setColor] = useState('#c2c5c1');
  const [muscle, setMuscle] = useState(0.35);
  const [rotate, setRotate] = useState(false);
  const [notice, setNotice] = useState('');
  const body = resolveMeasurements(measurements, template, units);
  const changeUnits = (next: MeasurementUnits) => {
    setMeasurements(convertMeasurements(measurements, units, next));
    setUnits(next);
  };
  const changeTemplate = (next: BodyTemplate) => {
    // A template change preserves the user's entered measurements.
    setTemplate(next);
  };
  const reset = () => {
    setMeasurements(convertMeasurements(presets[template], 'metric', units));
    setMuscle(0.35);
    setNotice('Sample measurements restored.');
  };
  const number = (key: 'height' | 'weight') => fromMetric(body.measurements[key], key, units).toFixed(1);
  const snippet = `import { BodyVisualizer } from '@dantehemerson/react-body-shape';\nimport '@dantehemerson/react-body-shape/styles.css';\n\n<BodyVisualizer\n  template="${template}"\n  units="${units}"\n  measurements={${JSON.stringify(measurements, null, 2).replace(/\n/g, '\n  ')}}\n  showMeasurements\n  style={{ height: 640 }}\n/>`;
  const exportMeasurements = () => {
    const blob = new Blob([JSON.stringify({ template, units, measurements }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'body-measurements.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Measurements exported. The file contains only the values you entered.');
  };
  return <>
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Body Shape home"><Mark /><span>body<span className="wordmark-light">shape</span><span className="wordmark-dot">/</span></span></a>
      <div className="header-center"><span className="tiny-dot" /> OPEN SOURCE · BUILT FOR REACT</div>
      <a className="github-link" href={repo} target="_blank" rel="noreferrer">View on GitHub <span aria-hidden="true">↗</span></a>
    </header>
    <main>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <div className="eyebrow"><span className="intro-line" /> THE BODY, IN PERSPECTIVE</div>
          <h1 id="page-title">A study in <em>you.</em></h1>
          <p>Your measurements. A new perspective.<br className="mobile-break" /> Explore your shape in three dimensions.</p>
        </div>
        <div className="intro-note"><span className="note-index">01 / BODY STUDIO</span><p>Not a number. Not a standard.<br />Just a little more understanding.</p><span className="version-pill">v{version} <span>PREVIEW</span></span></div>
      </section>

      <section className="workspace" aria-label="Interactive body studio">
        <aside className="measurement-panel">
          <div className="panel-heading"><h2>Make it yours</h2><span className="live-badge"><i /> LIVE</span></div>
          <p className="panel-subtitle">Small details. A fuller picture.</p>
          <div className="setup-grid">
            <div><span className="control-caption">BODY TEMPLATE</span><Choice legend="Body template" value={template} onChange={changeTemplate} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} /></div>
            <div><span className="control-caption">UNITS</span><Choice legend="Measurement units" value={units} onChange={changeUnits} options={[{ value: 'metric', label: 'cm / kg' }, { value: 'imperial', label: 'in / lb' }]} /></div>
          </div>
          <div className="section-rule"><span>MEASUREMENTS</span><span>↙ TAPE, NOT GUESSWORK</span></div>
          <MeasurementEditor value={measurements} onChange={setMeasurements} template={template} units={units} />
          <details className="definition-control">
            <summary>Visual definition <span>{Math.round(muscle * 100)}%</span></summary>
            <label htmlFor="muscle" className="bs-sr-only">Visual muscle definition</label>
            <input id="muscle" type="range" min={0} max={1} step={0.05} value={muscle} onChange={event => setMuscle(Number(event.target.value))} />
            <p>An artistic adjustment, not a muscle mass estimate.</p>
          </details>
          <button type="button" className="reset-shape" onClick={reset}><span aria-hidden="true">↺</span> Restore sample measurements</button>
        </aside>

        <div className="stage-column">
          <div className="stage">
            <div className="stage-topline"><span><span className="tiny-dot" /> PERSONAL BODY MODEL</span><span>360° VIEW</span></div>
            <BodyVisualizer measurements={measurements} template={template} units={units} color={color}
              showMeasurements={rings} showGrid={grid} muscle={muscle} autoRotate={rotate}
              className="studio-viewer" background="transparent" />
            <div className="stage-bottomline"><span>FIG. 01 — {template.toUpperCase()} / ADULT</span><span>ILLUSTRATIVE MODEL</span></div>
          </div>
          <div className="display-bar">
            <div className="swatches" role="group" aria-label="Model surface color">
              <span className="control-caption">SURFACE</span>
              {[{ color: '#a9b9a3', label: 'Sage' }, { color: '#c5b19c', label: 'Clay' }, { color: '#c2c5c1', label: 'Stone' }].map(option =>
                <button type="button" key={option.color} aria-label={option.label} aria-pressed={color === option.color}
                  style={{ '--swatch': option.color } as React.CSSProperties} onClick={() => setColor(option.color)}><span /></button>)}
            </div>
            <div className="display-options">
              <label><input type="checkbox" checked={rings} onChange={event => setRings(event.target.checked)} /> Guides</label>
              <label><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} /> Grid</label>
              <label><input type="checkbox" checked={rotate} onChange={event => setRotate(event.target.checked)} /> Rotate</label>
            </div>
          </div>
          <div className="stats-row">
            <div><span className="control-caption">HEIGHT</span><strong>{number('height')} <small>{units === 'metric' ? 'cm' : 'in'}</small></strong></div>
            <div><span className="control-caption">WEIGHT</span><strong>{number('weight')} <small>{units === 'metric' ? 'kg' : 'lb'}</small></strong></div>
            <div><span className="control-caption">CALCULATED BMI</span><strong>{body.bmi.toFixed(1)} <small>kg/m²</small></strong></div>
            <button type="button" className="export-button" onClick={exportMeasurements}>Export measurements <span aria-hidden="true">↓</span></button>
          </div>
        </div>
      </section>
      <p className="notice" role="status">{notice}</p>
      <div className="trust-row">
        <div><span aria-hidden="true">◇</span><p><strong>Yours, and yours only.</strong> Measurements stay in this browser. No uploads, accounts, or tracking.</p></div>
        <div><span aria-hidden="true">⌁</span><p><strong>A perspective, not a prediction.</strong> An approximate visualization, not a body scan or medical assessment.</p></div>
      </div>

      <section className="developer-section" aria-labelledby="developer-heading">
        <div className="developer-copy"><span className="eyebrow">MADE TO FIT YOUR STACK</span><h2 id="developer-heading">Your dashboard.<br /><em>Your component.</em></h2><p>A typed, controlled React component. Pass your measurements, bring your own interface, and make it part of something bigger.</p><a href={`${repo}#readme`} target="_blank" rel="noreferrer">Read the documentation ↗</a><div className="tech-tags"><span>React 19</span><span>TypeScript</span><span>Three.js</span><span>MIT</span></div></div>
        <div className="code-card"><div className="code-heading"><span>YOUR LIVE COMPONENT</span><button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(snippet); setNotice('Component code copied.'); }
          catch { setNotice('Clipboard unavailable. Select and copy the example below.'); }
        }}>Copy code <span aria-hidden="true">⧉</span></button></div><pre><code>{snippet}</code></pre><div className="install-command"><span>$</span> npm install @dantehemerson/react-body-shape@next three</div><p className="registry-note">RC channel · npm availability depends on the first release publication.</p></div>
      </section>
    </main>
    <footer><a className="footer-brand" href="/"><Mark small />bodyshape</a><span>A LITTLE MORE PERSPECTIVE.</span><a href={repo}>Open source, by design ↗</a></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
