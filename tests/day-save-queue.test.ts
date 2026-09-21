import { describe, expect, it, vi } from 'vitest';
import { createDaySaveQueue, type DaySave } from '../lib/tracker/day-save-queue';
import { emptyDay, type TrackerDay } from '../lib/tracker/entry';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function edit(date: string, text: string): DaySave {
  return { date, day: { ...emptyDay(1), answers: { note: text } }, message: 'Uloženo' };
}

function setup() {
  const requests: Array<{ change: DaySave; response: ReturnType<typeof deferred<TrackerDay>> }> = [];
  const save = vi.fn((change: DaySave) => {
    const response = deferred<TrackerDay>();
    requests.push({ change, response });
    return response.promise;
  });
  const saved = vi.fn();
  const failed = vi.fn();
  const status = vi.fn();
  const queue = createDaySaveQueue({ save, saved, failed, status });
  return { queue, requests, save, saved, failed, status };
}

describe('ukládání deníku při pomalé síti', () => {
  it('serializuje požadavky a uloží poslední úplný snapshot bez návratu ke staršímu textu', async () => {
    const { queue, requests, saved } = setup();
    queue.enqueue(edit('2026-09-12', 'p'));
    queue.enqueue(edit('2026-09-12', 'poznám'));
    queue.enqueue(edit('2026-09-12', 'poznámka'));
    expect(requests).toHaveLength(1);
    expect(queue.hasUnsaved()).toBe(true);

    requests[0].response.resolve(requests[0].change.day);
    await Promise.resolve();
    expect(saved).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect(requests[1].change.day.answers.note).toBe('poznámka');

    requests[1].response.resolve(requests[1].change.day);
    expect(await queue.flush()).toBe(true);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][1].answers.note).toBe('poznámka');
    expect(queue.hasUnsaved()).toBe(false);
  });

  it('uchová kombinaci více odpovědí i nových událostí v posledním požadavku', async () => {
    const { queue, requests } = setup();
    const first = edit('2026-09-12', 'Oběd');
    queue.enqueue(first);
    const second: DaySave = { ...first, day: { ...first.day, answers: { ...first.day.answers, energy: 6 } } };
    queue.enqueue(second);
    const third: DaySave = {
      ...second,
      day: { ...second.day, events: [{ id: 'new-note', sectionId: '', fieldId: '', time: '12:30', value: '', note: 'Procházka' }] },
    };
    queue.enqueue(third);
    requests[0].response.resolve(first.day);
    await Promise.resolve();
    expect(requests[1].change.day).toEqual(third.day);
    requests[1].response.resolve(third.day);
    expect(await queue.flush()).toBe(true);
  });

  it('chyba staršího požadavku nezahodí novější editaci a nehlásí ji jako neuloženou', async () => {
    const { queue, requests, failed, saved } = setup();
    queue.enqueue(edit('2026-09-12', 'starý'));
    queue.enqueue(edit('2026-09-12', 'nový'));
    requests[0].response.reject(new Error('Výpadek'));
    await Promise.resolve();
    expect(failed).not.toHaveBeenCalled();
    expect(requests[1].change.day.answers.note).toBe('nový');
    requests[1].response.resolve(requests[1].change.day);
    expect(await queue.flush()).toBe(true);
    expect(saved.mock.calls[0][1].answers.note).toBe('nový');
  });

  it('neúspěšný poslední zápis blokuje odchod na jiný den a dovolí retry stejných dat', async () => {
    const { queue, requests, failed } = setup();
    const latest = edit('2026-09-12', 'Neztratit tento záznam');
    queue.enqueue(latest);
    requests[0].response.reject(new Error('Offline'));
    expect(await queue.flush()).toBe(false);
    expect(queue.hasUnsaved()).toBe(true);
    expect(failed).toHaveBeenCalledTimes(1);

    queue.retry();
    expect(requests[1].change.date).toBe(latest.date);
    expect(requests[1].change.day).toEqual(latest.day);
    requests[1].response.resolve(latest.day);
    expect(await queue.flush()).toBe(true);
    expect(queue.hasUnsaved()).toBe(false);
  });

  it('zápisy různých dnů zachovají své datum i při sloučení čekajících změn', async () => {
    const { queue, requests, saved } = setup();
    queue.enqueue(edit('2026-09-11', 'první den'));
    queue.enqueue(edit('2026-09-12', 'druhý den'));
    queue.enqueue(edit('2026-09-11', 'novější první den'));
    expect(requests).toHaveLength(1);

    requests[0].response.resolve(requests[0].change.day);
    await Promise.resolve();
    expect(saved).not.toHaveBeenCalled();
    expect(requests[1].change.date).toBe('2026-09-12');
    expect(requests[1].change.day.answers.note).toBe('druhý den');
    requests[1].response.resolve(requests[1].change.day);
    await Promise.resolve();
    expect(requests[2].change.date).toBe('2026-09-11');
    expect(requests[2].change.day.answers.note).toBe('novější první den');
    requests[2].response.resolve(requests[2].change.day);
    expect(await queue.flush()).toBe(true);
    expect(saved.mock.calls.map(([change]) => change.date)).toEqual(['2026-09-12', '2026-09-11']);
  });

  it('čekání na přepnutí dne zahrne také editaci vzniklou během tohoto čekání', async () => {
    const { queue, requests } = setup();
    queue.enqueue(edit('2026-09-12', 'první'));
    const switched = vi.fn();
    const navigation = queue.flush().then(switched);
    queue.enqueue(edit('2026-09-12', 'poslední'));
    requests[0].response.resolve(requests[0].change.day);
    await Promise.resolve();
    expect(switched).not.toHaveBeenCalled();
    requests[1].response.resolve(requests[1].change.day);
    await navigation;
    expect(switched).toHaveBeenCalledWith(true);
  });

  it('fronta vlastní snapshot, který pozdější změna vstupního objektu nepřepíše', async () => {
    const { queue, requests } = setup();
    const change = edit('2026-09-12', 'původní');
    queue.enqueue(change);
    change.date = '2026-09-13';
    change.day.answers.note = 'neodeslaná mutace';
    expect(requests[0].change.date).toBe('2026-09-12');
    expect(requests[0].change.day.answers.note).toBe('původní');
    requests[0].response.resolve(requests[0].change.day);
    expect(await queue.flush()).toBe(true);
  });

  it('odpojení obrazovky nezruší přijaté zápisy ani nevyžaduje následné setState', async () => {
    let mounted = true;
    const ui = vi.fn();
    const first = deferred<TrackerDay>();
    const persisted: DaySave[] = [];
    const queue = createDaySaveQueue({
      async save(change) {
        persisted.push(change);
        if (persisted.length === 1) return first.promise;
        return change.day;
      },
      saved: () => { if (mounted) ui(); },
      failed: () => { if (mounted) ui(); },
      status: () => {},
    });
    queue.enqueue(edit('2026-09-12', 'první'));
    queue.enqueue(edit('2026-09-12', 'poslední'));
    mounted = false;
    first.resolve(persisted[0].day);
    expect(await queue.flush()).toBe(true);
    expect(persisted.map((change) => change.day.answers.note)).toEqual(['první', 'poslední']);
    expect(ui).not.toHaveBeenCalled();
  });
});
