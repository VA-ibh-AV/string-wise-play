import type { ChangeEvent, ReactNode } from 'react';

export function Slider({ label, min, max, step, value, onChange, fmt = v => String(v) }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="g-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(+e.target.value)} />
      <output>{fmt(value)}</output>
    </label>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="g-stat">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="g-seg wide" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Card({ summary, code, children, open = false }: { summary: string; code: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="g-card" open={open}>
      <summary>{summary}</summary>
      <pre>
        <code>{code}</code>
      </pre>
      <p>{children}</p>
    </details>
  );
}
