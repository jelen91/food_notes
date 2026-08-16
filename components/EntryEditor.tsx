import { useState } from 'react';
import { Entry, entryDef, newId, symptomsFor } from '../lib/schema';
import { CategoryDef, EpisodeDef, FieldDef, TenantConfig } from '../lib/tenant/types';
import { ChipGroup, Field, Scale } from './ui';

export function emptyEvent(config: TenantConfig, time: string): Entry {
  return { id: newId(), kind: 'event', key: config.categories?.[0]?.key ?? 'poznamka', time, note: '', fields: {} };
}

export function emptyEpisode(config: TenantConfig, time: string, key?: string): Entry {
  return { id: newId(), kind: 'episode', key: key ?? config.episodes?.[0]?.key ?? '', time, note: '', fields: {} };
}

const toOptions = (arr: string[] = []) => arr.map((x) => ({ key: x, label: x }));

/** Vykreslí jedno pole podle jeho typu v konfiguraci. */
function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: number | string | string[] | undefined;
  onChange: (v: number | string | string[] | undefined) => void;
}) {
  if (def.type === 'scale') {
    return (
      <Scale
        label={def.label}
        min={def.min ?? 1}
        max={def.max ?? 10}
        direction={def.direction}
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
      />
    );
  }

  if (def.type === 'multiselect' || def.type === 'select') {
    const selected = Array.isArray(value) ? value : value ? [String(value)] : [];
    return (
      <div>
        <label className="label">{def.label}</label>
        <ChipGroup
          options={toOptions(def.options)}
          selected={selected}
          onToggle={(key) => {
            if (def.type === 'select') {
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

  const unitLabel = def.unit ? ` (${def.unit === '/10' ? '1–10' : def.unit})` : '';
  return (
    <Field label={`${def.label}${unitLabel}`}>
      {/* Čísla držíme jako text, ať jde rozepsat i „3.5“ – dočistí je validace na serveru. */}
      <input
        className="input"
        type={def.type === 'number' ? 'number' : 'text'}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        min={def.min}
        max={def.max}
        placeholder={def.placeholder}
        value={value === undefined || Array.isArray(value) ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </Field>
  );
}

/**
 * Formulář pro událost i epizodu. Podoba se celá odvozuje z konfigurace zákazníka,
 * takže přidání pole je změna v tenants/*.json, ne v kódu.
 */
export default function EntryEditor({
  config,
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  config: TenantConfig;
  initial: Entry;
  onSave: (entry: Entry) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [draft, setDraft] = useState<Entry>(initial);
  const [error, setError] = useState('');

  const def = entryDef(config, draft) as CategoryDef | EpisodeDef | undefined;
  const isEvent = draft.kind === 'event';

  const setField = (key: string, value: number | string | string[] | undefined) => {
    setDraft((d) => {
      const fields = { ...d.fields };
      if (value === undefined) delete fields[key];
      else fields[key] = value;
      return { ...d, fields };
    });
  };

  const setSymptom = (key: string, value: number | undefined) => {
    setDraft((d) => {
      const symptoms = { ...(d.symptoms ?? {}) };
      if (value === undefined) delete symptoms[key];
      else symptoms[key] = value;
      return { ...d, symptoms };
    });
  };

  const submit = async () => {
    if (!draft.time) {
      setError('Vyplň čas.');
      return;
    }
    const hasField = Object.values(draft.fields ?? {}).some((v) => v !== '' && v !== undefined);
    const hasSymptom = Object.values(draft.symptoms ?? {}).some(Boolean);
    if (isEvent && !draft.note.trim() && !hasField && !hasSymptom) {
      setError('Vyplň popis, hodnotu nebo symptom.');
      return;
    }
    setError('');
    await onSave(draft);
  };

  const symptoms = isEvent ? symptomsFor(config, draft.key) : [];

  return (
    <div className="stack">
      {isEvent && (config.categories?.length ?? 0) > 1 && (
        <div>
          <label className="label">Kategorie</label>
          <ChipGroup
            options={(config.categories ?? []).map((c) => ({
              key: c.key,
              label: `${c.emoji ? `${c.emoji} ` : ''}${c.label}`,
              color: c.color,
            }))}
            selected={[draft.key]}
            onToggle={(key) => setDraft((d) => ({ ...d, key, fields: {}, symptoms: undefined }))}
          />
        </div>
      )}

      <Field label="Čas">
        <input className="input" type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} />
      </Field>

      {(def?.fields ?? []).map((f) => (
        <FieldInput key={f.key} def={f} value={draft.fields?.[f.key]} onChange={(v) => setField(f.key, v)} />
      ))}

      <Field label={isEvent ? 'Popis' : 'Poznámka'}>
        <textarea
          className="textarea"
          rows={isEvent ? 2 : 3}
          placeholder={def?.placeholder}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
        />
      </Field>

      {symptoms.length > 0 && (
        <div>
          <label className="label">Symptomy</label>
          {symptoms.map((s) => (
            <Scale
              key={s.key}
              label={s.label}
              max={s.max ?? 5}
              direction="higherWorse"
              value={draft.symptoms?.[s.key]}
              onChange={(v) => setSymptom(s.key, v)}
            />
          ))}
        </div>
      )}

      <div className="btns">
        <button type="button" className="btn btn-primary" onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Zrušit
          </button>
        )}
      </div>
      {error && <div className="msg err">{error}</div>}
    </div>
  );
}
