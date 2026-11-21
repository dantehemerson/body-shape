import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BodyVisualizer } from '../src/BodyVisualizer';
import { MeasurementEditor } from '../src/MeasurementEditor';

describe('React SSR and accessible shells', () => {
  it('renders without window, document or a WebGL context', () => {
    const html = renderToString(createElement(BodyVisualizer, { measurements: { height: 180, weight: 82 } }));
    expect(html).toContain('Preparing your 3D view');
    expect(html).toContain('180.0 cm');
    expect(html).toContain('(estimated)');
    expect(html).not.toContain('<canvas');
  });
  it('renders invalid measurements as an accessible error rather than crashing the host', () => {
    const html = renderToString(createElement(BodyVisualizer, { measurements: { height: NaN, weight: 82 } }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('height must be a finite number');
  });
  it('can hide controls and display imperial text', () => {
    const html = renderToString(createElement(BodyVisualizer, {
      measurements: { height: 70, weight: 180 }, units: 'imperial', showControls: false,
    }));
    expect(html).toContain('70.0 in');
    expect(html).not.toContain('Camera views');
  });
  it('does not generate duplicate IDs across editor instances', () => {
    const props = { value: { height: 180, weight: 82 }, onChange() {} };
    const html = renderToString(createElement('div', null,
      createElement(MeasurementEditor, props), createElement(MeasurementEditor, props)));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('type="number"');
    expect(html).toContain('aria-describedby');
  });
});
