import { useState } from 'react';
import {
  CATEGORY_BY_KEY,
  ENTRY_SYMPTOMS,
  EVENT_CATEGORIES,
  Entry,
  EventEntry,
  SCALE_MAX,
  WEAKNESS_OPTIONS,
  WeaknessEntry,
  newId,
} from '../lib/schema';
import { ChipGroup, Field, Scale } from './ui';

export function emptyEvent(time: string, category = 'jidlo'): EventEntry {
  return { id: newId(), type: 'event', time, category, note: '', fields: {} };
}

export function emptyWeakness(time: string): WeaknessEntry {
  return { id: newId(), type: 'weakness', time, bodyParts: [], triggers: [], symptoms: [], relief: [], note: '' };
}

const toOptions = (arr: string[]) => arr.map((x) => ({ key: x, label: x }));

/**
 * Formulář pro obě podoby záznamu (běžná událost / epizoda slabosti).
 * Používá se stejný jak pro přidání, tak pro editaci existujícího záznamu.
 */
export default function EntryEditor({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial: Entry;
  onSave: (entry: Entry) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [draft, setDraft] = useState<Entry>(initial);
  const [error, setError] = useState('');

  const patch = (p: Partial<Entry>) => setDraft((d) => ({ ...d, ...p } as Entry));

  const toggleIn = (key: 'bodyParts' | 'triggers' | 'symptoms' | 'relief', value: string) => {
    const w = draft as WeaknessEntry;
    const list = w[key] ?? [];
    patch({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] } as any);
  };

  const submit = async () => {
    if (!draft.time) {
      setError('Vyplň čas.');
      return;
    }
    if (draft.type === 'event') {
      const e = draft as EventEntry;
      const hasField = Object.values(e.fields ?? {}).some((v) => v !== '' && v !== undefined);
      if (!e.note.trim() && !hasField && !e.gas && !e.pressure) {
        setError('Vyplň popis, hodnotu nebo symptom.');
        return;
      }
    }
    setError('');
    await onSave(draft);
  };

  const isEvent = draft.type === 'event';
  const category = isEvent ? CATEGORY_BY_KEY[(draft as EventEntry).category] : undefined;
  const showGi = isEvent && ((draft as EventEntry).category === 'jidlo' || (draft as EventEntry).gas || (draft as EventEntry).pressure);

  return (
    <div className="stack">
      {isEvent && (
        <div>
          <label className="label">Kategorie</label>
          <ChipGroup
            options={EVENT_CATEGORIES.map((c) => ({ key: c.key, label: `${c.emoji} ${c.label}`, color: c.color }))}
            selected={[(draft as EventEntry).category]}
            onToggle={(key) => patch({ category: key, fields: {} } as any)}
          />
        </div>
      )}

      <div className="row">
        <Field label="Čas">
          <input className="input" type="time" value={draft.time} onChange={(e) => patch({ time: e.target.value })} />
        </Field>
        {!isEvent && (
          <Field label="Trvání (min)">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              value={(draft as WeaknessEntry).durationMin ?? ''}
              onChange={(e) => patch({ durationMin: e.target.value || undefined } as any)}
            />
          </Field>
        )}
      </div>

      {isEvent && category && category.fields.length > 0 && (
        <div className="row">
          {category.fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit.replace('/10', '1–10')})` : ''}`}>
              <input
                className="input"
                type={f.type === 'number' ? 'number' : 'text'}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                min={f.min}
                max={f.max}
                placeholder={f.placeholder}
                value={(draft as EventEntry).fields?.[f.key] ?? ''}
                onChange={(e) =>
                  patch({
                    fields: { ...(draft as EventEntry).fields, [f.key]: e.target.value },
                  } as any)
                }
              />
            </Field>
          ))}
        </div>
      )}

      {!isEvent && (
        <>
          <Scale
            label="Intenzita slabosti"
            direction="higherWorse"
            value={(draft as WeaknessEntry).severity}
            onChange={(v) => patch({ severity: v } as any)}
          />
          {/* Čísla držíme jako text (jde rozepsat „3.5“) – dočistí je až validace na serveru. */}
          <Field label="Hodin od posledního jídla">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              placeholder="např. 4"
              value={(draft as WeaknessEntry).lastMealHoursAgo ?? ''}
              onChange={(e) => patch({ lastMealHoursAgo: e.target.value || undefined } as any)}
            />
          </Field>
          <div>
            <label className="label">Kde se to projevilo</label>
            <ChipGroup options={toOptions(WEAKNESS_OPTIONS.bodyParts)} selected={(draft as WeaknessEntry).bodyParts ?? []} onToggle={(v) => toggleIn('bodyParts', v)} />
          </div>
          <div>
            <label className="label">Co tomu předcházelo</label>
            <ChipGroup options={toOptions(WEAKNESS_OPTIONS.triggers)} selected={(draft as WeaknessEntry).triggers ?? []} onToggle={(v) => toggleIn('triggers', v)} />
          </div>
          <div>
            <label className="label">Doprovodné příznaky</label>
            <ChipGroup options={toOptions(WEAKNESS_OPTIONS.symptoms)} selected={(draft as WeaknessEntry).symptoms ?? []} onToggle={(v) => toggleIn('symptoms', v)} />
          </div>
          <div>
            <label className="label">Co pomohlo</label>
            <ChipGroup options={toOptions(WEAKNESS_OPTIONS.relief)} selected={(draft as WeaknessEntry).relief ?? []} onToggle={(v) => toggleIn('relief', v)} />
          </div>
        </>
      )}

      <Field label={isEvent ? 'Popis' : 'Poznámka'}>
        <textarea
          className="textarea"
          rows={isEvent ? 2 : 3}
          placeholder={isEvent ? category?.placeholder : 'Jak to probíhalo, co jsi dělal těsně předtím…'}
          value={draft.note}
          onChange={(e) => patch({ note: e.target.value })}
        />
      </Field>

      {showGi && (
        <div>
          <label className="label">Trávicí symptomy (1 = minimum, 5 = extrém)</label>
          {ENTRY_SYMPTOMS.map((s) => (
            <Scale
              key={s.key}
              label={s.label}
              max={5}
              direction="higherWorse"
              value={(draft as EventEntry)[s.key]}
              onChange={(v) => patch({ [s.key]: v } as any)}
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
