import { describe, expect, it } from 'vitest';
import { formatValue } from '../components/TrackerFields';
import { valueKind } from '../lib/tracker/entry';
import { FIELD_TYPES, TrackerField } from '../lib/tracker/schema';

const field = (o: Partial<TrackerField>): TrackerField =>
  ({ id: 'x', type: 'short_text', label: 'X', required: false, order: 0, ...o } as TrackerField);

describe('zobrazení hodnot', () => {
  it('prázdná hodnota je pomlčka, ne nula', () => {
    expect(formatValue(field({ type: 'number' }), undefined)).toBe('—');
    expect(formatValue(field({ type: 'number' }), 0)).toBe('0');
  });

  it('ano/ne se vypisuje česky', () => {
    expect(formatValue(field({ type: 'boolean' }), true)).toBe('ano');
    expect(formatValue(field({ type: 'boolean' }), false)).toBe('ne');
  });

  it('číslo dostane jednotku', () => {
    expect(formatValue(field({ type: 'number', unit: 'l' }), 2.5)).toBe('2.5 l');
    expect(formatValue(field({ type: 'number' }), 2.5)).toBe('2.5');
  });

  it('volby se zobrazují popiskem, ne strojovým klíčem', () => {
    const f = field({
      type: 'multi_select',
      options: [
        { value: 'rano', label: 'Ráno' },
        { value: 'vecer', label: 'Večer' },
      ],
    });
    expect(formatValue(f, ['rano', 'vecer'])).toBe('Ráno, Večer');
    expect(formatValue(field({ type: 'single_select', options: [{ value: 'a', label: 'Áčko' }] }), 'a')).toBe('Áčko');
  });

  it('bristolova škála se popíše slovy', () => {
    expect(formatValue(field({ type: 'stool_bristol' }), 4)).toContain('hladká');
  });
});

describe('mapování typů na vstupy', () => {
  it('každý povolený typ má přiřazený způsob zadání', () => {
    for (const type of FIELD_TYPES) {
      expect(valueKind(type), type).toBeTruthy();
    }
  });

  it('typy se mapují na očekávané vstupy', () => {
    expect(valueKind('scale')).toBe('number');
    expect(valueKind('duration')).toBe('number');
    expect(valueKind('sleep')).toBe('number');
    expect(valueKind('meal')).toBe('text');
    expect(valueKind('custom_observation')).toBe('longtext');
    expect(valueKind('multi_select')).toBe('choices');
    expect(valueKind('date')).toBe('date');
  });
});
