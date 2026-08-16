// Vykreslení polí vygenerované definice.
//
// Renderer nic nevyhodnocuje ani nespouští – jen podle `type` vybere z pevné sady vstupů.
// Neznámý typ se nevykreslí. Primitiva (Scale, ChipGroup, Field) jsou stejná jako ve zbytku appky.

import { BRISTOL_OPTIONS, FieldValue, fieldRange, isVisible, valueKind } from '../lib/tracker/entry';
import type { TrackerField, TrackerSection } from '../lib/tracker/schema';
import { ChipGroup, Field, Scale } from './ui';

export function TrackerFieldInput({
  field,
  value,
  onChange,
}: {
  field: TrackerField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue | undefined) => void;
}) {
  const kind = valueKind(field.type);
  const label = `${field.label}${field.required ? ' *' : ''}${field.unit ? ` (${field.unit})` : ''}`;

  if (kind === 'boolean') {
    return (
      <div>
        <label className="label">{label}</label>
        {field.description && <p className="hint" style={{ marginTop: -2, marginBottom: 6 }}>{field.description}</p>}
        <ChipGroup
          options={[
            { key: 'ano', label: 'Ano' },
            { key: 'ne', label: 'Ne' },
          ]}
          selected={value === true ? ['ano'] : value === false ? ['ne'] : []}
          onToggle={(key) => {
            const next = key === 'ano';
            onChange(value === next ? undefined : next);
          }}
        />
      </div>
    );
  }

  if (field.type === 'scale' || field.type === 'stool_bristol') {
    const { min, max } = fieldRange(field);
    return (
      <div>
        {field.description && <p className="hint" style={{ marginBottom: 2 }}>{field.description}</p>}
        <Scale
          label={label}
          min={field.type === 'stool_bristol' ? 1 : min}
          max={field.type === 'stool_bristol' ? 7 : max}
          direction={field.higherIsBetter === undefined ? undefined : field.higherIsBetter ? 'higherBetter' : 'higherWorse'}
          value={typeof value === 'number' ? value : undefined}
          onChange={(v) => onChange(v)}
        />
        {field.type === 'stool_bristol' && typeof value === 'number' && (
          <p className="hint" style={{ marginTop: -4 }}>{BRISTOL_OPTIONS.find((o) => o.value === value)?.label}</p>
        )}
      </div>
    );
  }

  if (kind === 'choice' || kind === 'choices') {
    const selected = Array.isArray(value) ? value : value === undefined ? [] : [String(value)];
    return (
      <div>
        <label className="label">{label}</label>
        {field.description && <p className="hint" style={{ marginTop: -2, marginBottom: 6 }}>{field.description}</p>}
        <ChipGroup
          options={(field.options ?? []).map((o) => ({ key: o.value, label: o.label }))}
          selected={selected}
          onToggle={(key) => {
            if (kind === 'choice') {
              onChange(selected.includes(key) ? undefined : key);
              return;
            }
            const next = selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key];
            onChange(next.length ? next : undefined);
          }}
        />
      </div>
    );
  }

  const common = {
    className: 'input',
    value: value === undefined ? '' : String(value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value || undefined),
  };

  return (
    <Field label={label}>
      {field.description && <p className="hint" style={{ marginTop: -2, marginBottom: 6 }}>{field.description}</p>}
      {kind === 'longtext' ? (
        <textarea {...(common as any)} rows={3} />
      ) : kind === 'number' ? (
        <input
          {...(common as any)}
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={fieldRange(field).step}
        />
      ) : kind === 'date' ? (
        <input {...(common as any)} type="date" />
      ) : kind === 'time' ? (
        <input {...(common as any)} type="time" />
      ) : (
        <input {...(common as any)} type="text" maxLength={300} />
      )}
    </Field>
  );
}

/** Denní sekce: pole se vykreslí v pořadí a respektují podmíněné zobrazení. */
export function TrackerSectionForm({
  section,
  values,
  onChange,
}: {
  section: TrackerSection;
  values: Record<string, FieldValue>;
  onChange: (fieldId: string, value: FieldValue | undefined) => void;
}) {
  const visible = [...section.fields].sort((a, b) => a.order - b.order).filter((f) => isVisible(f, values));

  return (
    <div className="stack">
      {visible.map((field) => (
        <TrackerFieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(v) => onChange(field.id, v)}
        />
      ))}
      {visible.length === 0 && <p className="muted">V této sekci se teď nic nevyplňuje.</p>}
    </div>
  );
}

/** Čitelný zápis hodnoty – používá se v přehledu záznamů i v exportu. */
export function formatValue(field: TrackerField, value: FieldValue | undefined): string {
  if (value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'ano' : 'ne';
  if (Array.isArray(value)) {
    return value.map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(', ');
  }
  if (field.type === 'stool_bristol' && typeof value === 'number') {
    return BRISTOL_OPTIONS.find((o) => o.value === value)?.label ?? String(value);
  }
  if (typeof value === 'number') {
    return field.unit ? `${value} ${field.unit}` : String(value);
  }
  const option = field.options?.find((o) => o.value === value);
  return option ? option.label : String(value);
}
