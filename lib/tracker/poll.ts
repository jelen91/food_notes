/** Read-only polling for an already running generation; this never starts a job. */
export function pollTracker<T extends { status: string }>(options: {
  read: () => Promise<T>;
  onUpdate: (value: T) => void;
  onError: () => void;
  intervalMs?: number;
}): () => void {
  let stopped = false;
  let errors = 0;
  let timer: ReturnType<typeof setTimeout>;
  const intervalMs = options.intervalMs ?? 2000;
  const tick = async () => {
    try {
      const value = await options.read();
      if (stopped) return;
      errors = 0;
      options.onUpdate(value);
      if (value.status !== 'queued' && value.status !== 'generating') return;
    } catch {
      if (stopped) return;
      if (++errors >= 3) {
        options.onError();
        return;
      }
    }
    // Schedule after the previous response: slow reads cannot overlap each other.
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return () => { stopped = true; clearTimeout(timer); };
}
