import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatValue, TrackerFieldInput } from '../components/TrackerFields';
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

describe('přístupnost vygenerovaných vstupů', () => {
  // This node-only test runner uses the classic JSX transform for app components.
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());

  const render = (properties: Partial<TrackerField>) => renderToStaticMarkup(createElement(TrackerFieldInput, {
    field: field({ label: 'Sledovaný údaj', description: 'Zapiš údaj za dnešní den.', ...properties }),
    value: undefined, onChange: () => undefined,
  }));

  it.each(['number', 'duration', 'sleep', 'short_text', 'long_text', 'date', 'time', 'meal', 'custom_observation'] as const)('typ %s má vlastní přístupný název a připojenou nápovědu', (type) => {
    const html = render({ type });
    const input = html.match(/<(?:input|textarea)\b[^>]*>/)?.[0];
    expect(input).toContain('aria-label="Sledovaný údaj"');
    const descriptionId = input?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeTruthy();
    expect(html).toContain(`id="${descriptionId}"`);
    expect(html).toContain('Zapiš údaj za dnešní den.');
  });

  it.each(['boolean', 'single_select', 'multi_select', 'scale', 'stool_bristol'] as const)('volby typu %s mají pojmenovanou skupinu', (type) => {
    const html = render({ type, min: 0, max: 3, options: [{ value: 'rano', label: 'Ráno' }] });
    expect(html).toMatch(/<div role="group" aria-label="Sledovaný údaj" aria-describedby="[^"]+">/);
    expect(html).toContain('aria-pressed=');
  });

  it('přístupný název číselného vstupu zahrnuje jednotku a povinnost', () => {
    const html = render({ type: 'duration', label: 'Délka', unit: 'min', required: true });
    expect(html).toContain('aria-label="Délka * (min)"');
  });

  it('bez nápovědy neodkazuje na neexistující element', () => {
    expect(render({ type: 'number', description: undefined })).not.toContain('aria-describedby');
    expect(render({ type: 'boolean', description: undefined })).not.toContain('aria-describedby');
  });

  it('opakované vykreslení stejného pole má jedinečné odkazy na nápovědy', () => {
    const shared = field({ description: 'Nápověda.' });
    const html = renderToStaticMarkup(createElement('div', {},
      createElement(TrackerFieldInput, { field: shared, value: undefined, onChange: () => undefined }),
      createElement(TrackerFieldInput, { field: shared, value: undefined, onChange: () => undefined }),
    ));
    const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });
});
