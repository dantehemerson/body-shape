'use client';

import {
  Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState,
  type CSSProperties, type ErrorInfo, type ReactNode,
} from 'react';
import { fromMetric, resolveMeasurements, type BodyMeasurements, type BodyTemplate, type MeasurementUnits } from './measurements';
import type { GeometryQuality } from './geometry';

const Scene = lazy(() => import('./Scene'));
export type BodyView = 'front' | 'side' | 'back' | 'perspective';
export interface ViewCommand { view: BodyView; turn: number; zoom: number; sequence: number }

export interface BodyVisualizerProps {
  measurements: BodyMeasurements;
  template?: BodyTemplate;
  units?: MeasurementUnits;
  /** Visual definition only, 0–1. Does not estimate body fat or muscle mass. */
  muscle?: number;
  color?: string;
  background?: string;
  measurementColor?: string;
  showMeasurements?: boolean;
  showControls?: boolean;
  showGrid?: boolean;
  autoRotate?: boolean;
  initialView?: BodyView;
  quality?: GeometryQuality;
  className?: string;
  style?: CSSProperties;
  /** Accessible summary; a textual measurement list is included as well. */
  'aria-label'?: string;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

const defaultFallback = <div className="bs-message" role="status">The 3D view needs a browser with WebGL 2 enabled. Your measurements are still available below.</div>;

class RenderBoundary extends Component<{
  children: ReactNode; fallback: ReactNode; resetKey: string; onError?: (error: Error) => void;
}, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError?.(error); }
  componentDidUpdate(previous: Readonly<typeof this.props>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: false });
  }
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}

export function BodyVisualizer({
  measurements, template = 'male', units = 'metric', muscle = 0.35,
  color = '#c2c5c1', background = '#f0f0e9', measurementColor = '#47765f',
  showMeasurements = false, showControls = true, showGrid = true,
  autoRotate = false, initialView = 'front', quality = 'medium',
  className = '', style, fallback = defaultFallback, onError,
  'aria-label': ariaLabel = 'Interactive 3D body visualization',
}: BodyVisualizerProps) {
  const id = useId();
  const container = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [rendering, setRendering] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [command, setCommand] = useState<ViewCommand>({ view: initialView, turn: 0, zoom: 0, sequence: 0 });
  const signature = JSON.stringify({ measurements, template, units, muscle, quality });
  const result = useMemo(() => {
    try {
      if (!Number.isFinite(muscle) || muscle < 0 || muscle > 1) throw new RangeError('Muscle must be between 0 and 1.');
      if (!['low', 'medium', 'high'].includes(quality)) throw new TypeError('Unknown geometry quality.');
      return { body: resolveMeasurements(measurements, template, units) };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
    // Stable for callers that construct inline measurement objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { if (result.error) onError?.(result.error); }, [result.error, onError]);
  useEffect(() => {
    const element = container.current!;
    const onRenderState = (event: Event) => setRendering(!(event as Event & { skipped: boolean }).skipped);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    let observer: IntersectionObserver | undefined;
    if ('oncontentvisibilityautostatechange' in element) {
      // This event does not reliably bubble; listen on the containment element.
      element.addEventListener('contentvisibilityautostatechange', onRenderState);
    } else if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => setRendering(entry.isIntersecting), { rootMargin: '200px' });
      observer.observe(element);
    }
    return () => {
      element.removeEventListener('contentvisibilityautostatechange', onRenderState);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, []);
  const execute = (view: BodyView, turn = 0, zoom = 0) => setCommand(previous => ({ view, turn, zoom, sequence: previous.sequence + 1 }));
  const format = (value: number, key: 'height' | 'weight' | 'chest' | 'waist' | 'hips') =>
    `${fromMetric(value, key, units).toFixed(1)} ${key === 'weight' ? (units === 'metric' ? 'kg' : 'lb') : (units === 'metric' ? 'cm' : 'in')}`;

  return (
    <section
      ref={container}
      className={`bs-viewer ${className}`}
      style={{ background, ...style }}
      aria-label={ariaLabel}
    >
      <div className="bs-canvas" tabIndex={0} role="group" aria-label="3D model controls"
        aria-describedby={`${id}-instructions`}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (['ArrowLeft', 'ArrowRight', '+', '=', '-', 'Home'].includes(event.key)) {
            event.preventDefault();
            if (event.key === 'Home') execute(initialView);
            else execute(command.view, event.key === 'ArrowLeft' ? -Math.PI / 12 : event.key === 'ArrowRight' ? Math.PI / 12 : 0,
              event.key === '+' || event.key === '=' ? 0.9 : event.key === '-' ? 1.1 : 0);
          }
        }}>
        {result.error ? <div className="bs-message" role="alert">{result.error.message}</div> :
          !mounted ? <div className="bs-message" role="status">Preparing your 3D view…</div> :
          <RenderBoundary fallback={fallback} resetKey={signature} onError={onError}>
            <Suspense fallback={<div className="bs-message" role="status">Building your body…</div>}>
              <Scene body={result.body!} muscle={muscle} color={color}
                measurementColor={measurementColor} showMeasurements={showMeasurements}
                showGrid={showGrid} autoRotate={autoRotate && !reducedMotion && rendering && pageVisible}
                quality={quality} command={command} fallback={fallback} />
            </Suspense>
          </RenderBoundary>}
      </div>
      {showControls && <div className="bs-view-controls" aria-label="Camera views">
        {(['front', 'side', 'back'] as const).map(view =>
          <button type="button" key={view} onClick={() => execute(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}
        <button type="button" onClick={() => execute(initialView)} aria-label="Reset camera view">↺ <span>Reset</span></button>
      </div>}
      {showMeasurements && result.body && <dl className="bs-ring-legend" aria-label="Visible measurement guides">
        {(['chest', 'waist', 'hips'] as const).map(key => <div key={key}>
          <dt><i style={{ background: measurementColor }} />{key === 'chest' ? 'Chest / bust' : key[0].toUpperCase() + key.slice(1)}</dt>
          <dd>{format(result.body!.measurements[key], key)}</dd>
        </div>)}
      </dl>}
      <p id={`${id}-instructions`} className="bs-instructions">Drag to rotate · Scroll to zoom<span className="bs-sr-only">. Focus the model and use left/right arrow keys to rotate, plus/minus to zoom, Home to reset.</span></p>
      {result.body && <details className="bs-accessible-measurements">
        <summary>Body measurements · {format(result.body.measurements.height, 'height')} / {format(result.body.measurements.weight, 'weight')}</summary>
        <dl>{Object.entries(result.body.measurements).map(([key, value]) => <div key={key}>
          <dt>{key.replace(/([A-Z])/g, ' $1')}{result.body!.estimatedKeys.includes(key as keyof BodyMeasurements) ? ' (estimated)' : ''}</dt>
          <dd>{fromMetric(value, key as keyof BodyMeasurements, units).toFixed(1)} {key === 'weight' ? (units === 'metric' ? 'kg' : 'lb') : (units === 'metric' ? 'cm' : 'in')}</dd>
        </div>)}</dl>
      </details>}
    </section>
  );
}
