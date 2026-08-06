import { ReactNode } from 'react';
import { ScaleDirection } from '../lib/schema';

/** Barva aktivního stupně podle hodnoty a směru škály (zelená = dobře, červená = špatně). */
export function scaleColor(value: number, max: number, direction?: ScaleDirection): string {
  if (!direction) return 'hsl(38 92% 45%)';
  const t = (value - 1) / Math.max(1, max - 1);
  const hue = direction === 'higherBetter' ? t * 120 : 120 - t * 120;
  return `hsl(${Math.round(hue)} 62% 40%)`;
}

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
          const bg = scaleColor(n, max, direction);
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n}`}
              onClick={() => onChange(active ? undefined : n)}
              style={active ? { background: bg, borderColor: bg, color: '#fff' } : undefined}
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
  color,
}: {
  options: Array<{ key: string; label: string; color?: string }>;
  selected: string[];
  onToggle: (key: string) => void;
  color?: string;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const active = selected.includes(o.key);
        const c = o.color ?? color;
        return (
          <button
            key={o.key}
            type="button"
            className={`chip${active ? ' active' : ''}${c ? '' : ' plain'}`}
            onClick={() => onToggle(o.key)}
            style={active && c ? { color: c, background: `${c}14` } : undefined}
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
