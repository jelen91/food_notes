import { ReactNode } from 'react';
import { ScaleDirection } from '../lib/tenant/types';

export function Scale({
  label,
  hint,
  value,
  onChange,
  min = 1,
  max = 10,
  direction,
}: {
  label: string;
  hint?: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  /** Zachováno kvůli konfiguraci škál; na vzhled se nepromítá, aby byl deník klidný. */
  direction?: ScaleDirection;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="scale">
      <div className="scale-head">
        <span className="name">{label}</span>
        <span className="val">{value !== undefined ? `${value}/${max}` : hint || 'nevyplněno'}</span>
      </div>
      <div className="scale-btns">
        {steps.map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              className={active ? 'active' : undefined}
              aria-pressed={active}
              aria-label={`${label} ${n}`}
              onClick={() => onChange(active ? undefined : n)}
            >
              {n}
            </button>
          );
        })}
        <button type="button" className="clear" title="Smazat hodnocení" onClick={() => onChange(undefined)}>
          ×
        </button>
      </div>
    </div>
  );
}

/** Výběr z pevné sady možností – jednonásobný i vícenásobný. */
export function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ key: string; label: string; color?: string }>;
  selected: string[];
  onToggle: (key: string) => void;
  /** Barvy z konfigurace se ignorují – vzhled je v celé aplikaci stejný. */
  color?: string;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const active = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            className={`chip plain${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => onToggle(o.key)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function Msg({ text, error }: { text: string; error?: boolean }) {
  if (!text) return <div className="msg" />;
  return <div className={`msg ${error ? 'err' : 'ok'}`}>{text}</div>;
}
