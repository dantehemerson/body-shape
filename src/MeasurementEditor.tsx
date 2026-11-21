'use client';

import { useId, useState } from 'react';
import {
  fromMetric, measurementDefinitions, resolveMeasurements,
  type BodyMeasurements, type BodyTemplate, type MeasurementUnits,
  type MeasurementDefinition,
} from './measurements';

export interface MeasurementEditorProps {
  value: BodyMeasurements;
  onChange: (measurements: BodyMeasurements) => void;
  template?: BodyTemplate;
  units?: MeasurementUnits;
  className?: string;
}

function MeasurementField({ definition, value, estimated, units, onCommit, onReset }: {
  definition: MeasurementDefinition; value: number; estimated: boolean;
  units: MeasurementUnits; onCommit: (value: number) => string | undefined; onReset?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { key, label, min, max, description } = definition;
  const low = fromMetric(min, key, units), high = fromMetric(max, key, units);
  const unit = key === 'weight' ? (units === 'metric' ? 'kg' : 'lb') : (units === 'metric' ? 'cm' : 'in');
  const commit = (text: string) => {
    if (!text.trim() || !Number.isFinite(Number(text))) { setError('Enter a number.'); return; }
    const result = onCommit(Number(text));
    setError(result || '');
    if (!result) setDraft(null);
  };
  return <div className="bs-field">
    <div className="bs-field-top">
      <label htmlFor={id}>{label} <span className="bs-field-origin">{estimated ? 'estimated' : 'entered'}</span></label>
      <div className="bs-number-wrap">
        <input id={id} name={key} type="number" inputMode="decimal" step="any"
          min={low} max={high} required={key === 'height' || key === 'weight'}
          value={draft ?? value.toFixed(1)} aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          onChange={event => { setDraft(event.target.value); setError(''); }}
          onBlur={event => { if (draft !== null) commit(event.target.value); }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commit(event.currentTarget.value); }
          }} />
        <span>{unit}</span>
      </div>
    </div>
    <input type="range" name={`${key}-slider`} min={low} max={high} step={0.1}
      value={value} aria-label={`${label} slider`} aria-valuetext={`${value.toFixed(1)} ${unit}`}
      onChange={event => { setDraft(null); setError(onCommit(Number(event.target.value)) || ''); }} />
    <div className="bs-field-bottom">
      <span id={`${id}-help`} className="bs-sr-only">{description} Range {low.toFixed(1)} to {high.toFixed(1)} {unit}.</span>
      <span>{low.toFixed(0)}</span>
      {onReset && !estimated && <button type="button" onClick={() => { onReset(); setDraft(null); setError(''); }}>Use estimate</button>}
      <span>{high.toFixed(0)}</span>
    </div>
    {error && <p id={`${id}-error`} className="bs-field-error" role="alert">{error}</p>}
  </div>;
}

/** Controlled editor; estimated fields stay omitted until the user edits them. */
export function MeasurementEditor({ value, onChange, template = 'male', units = 'metric', className = '' }: MeasurementEditorProps) {
  const [group, setGroup] = useState<'basic' | 'upper' | 'lower'>('basic');
  const id = useId();
  let resolved;
  try { resolved = resolveMeasurements(value, template, units); }
  catch (error) { return <p className="bs-field-error" role="alert">{String(error)}</p>; }
  return <div className={`bs-editor ${className}`}>
    <fieldset className="bs-segmented">
      <legend className="bs-sr-only">Measurement group</legend>
      {(['basic', 'upper', 'lower'] as const).map(option => <div key={option}>
        <input id={`${id}-${option}`} type="radio" name={`${id}-group`} value={option} checked={group === option} onChange={() => setGroup(option)} />
        <label htmlFor={`${id}-${option}`}>{option[0].toUpperCase() + option.slice(1)}</label>
      </div>)}
    </fieldset>
    <div className="bs-fields">{measurementDefinitions.filter(d => d.group === group).map(definition =>
      <MeasurementField key={`${definition.key}-${units}-${template}`} definition={definition}
        value={fromMetric(resolved.measurements[definition.key], definition.key, units)}
        estimated={resolved.estimatedKeys.includes(definition.key)} units={units}
        onCommit={number => {
          const next = { ...value, [definition.key]: number };
          try { resolveMeasurements(next, template, units); onChange(next); return undefined; }
          catch (error) { return error instanceof Error ? error.message : String(error); }
        }}
        onReset={definition.key !== 'height' && definition.key !== 'weight' ? () => {
          const next = { ...value };
          delete next[definition.key as Exclude<keyof BodyMeasurements, 'height' | 'weight'>];
          onChange(next);
        } : undefined}
      />)}</div>
    <p className="bs-editor-note">Start with height and weight. Add tape measurements to refine your shape. Unspecified values are estimates.</p>
  </div>;
}
