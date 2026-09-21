import type { TrackerDay } from './entry';

export interface DaySave {
  date: string;
  day: TrackerDay;
  message: string;
}

/** Jen jeden zápis běží najednou; čekající změny téhož dne nahradí jeho nejnovější snapshot. */
export function createDaySaveQueue(callbacks: {
  save: (change: DaySave) => Promise<TrackerDay>;
  saved: (change: DaySave, day: TrackerDay) => void;
  failed: (change: DaySave, error: unknown) => void;
  status: (saving: boolean) => void;
}) {
  type Revision = DaySave & { revision: number };
  const pending = new Map<string, Revision>();
  const unsaved = new Map<string, Revision>();
  let revision = 0;
  let running: Promise<void> | null = null;

  async function drain() {
    while (pending.size) {
      const change = pending.values().next().value as Revision;
      pending.delete(change.date);
      try {
        const day = await callbacks.save(change);
        // Odpověď staršího zápisu nesmí přepsat novější lokální změnu.
        if (unsaved.get(change.date)?.revision === change.revision) {
          unsaved.delete(change.date);
          callbacks.saved(change, day);
        }
      } catch (error) {
        // Nezahazujeme rozepsaná data ani kvůli chybě sítě. Další editace nebo retry
        // odešle celý poslední snapshot, včetně změn z neúspěšného požadavku.
        if (unsaved.get(change.date)?.revision === change.revision) callbacks.failed(change, error);
      }
    }
  }

  function start() {
    if (running || !pending.size) return;
    running = drain().finally(() => {
      running = null;
      callbacks.status(false);
    });
    callbacks.status(true);
  }

  return {
    enqueue(change: DaySave) {
      const next = { ...change, day: structuredClone(change.day), revision: ++revision };
      unsaved.set(next.date, next);
      pending.set(next.date, next);
      start();
    },
    retry() {
      unsaved.forEach((change, date) => pending.set(date, change));
      start();
    },
    hasUnsaved: () => unsaved.size > 0,
    async flush(): Promise<boolean> {
      // Během čekání mohou přibýt další editace. Přepnutí dne počká i na ně.
      while (running) await running;
      return unsaved.size === 0;
    },
  };
}
