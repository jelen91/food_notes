import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollTracker } from '../lib/tracker/poll';

afterEach(() => vi.useRealTimers());

describe('reload during tracker generation', () => {
  it.each(['completed', 'failed'])('reads the running job and stops when it becomes %s', async (terminal) => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce({ status: 'generating' }).mockResolvedValueOnce({ status: terminal });
    const onUpdate = vi.fn();
    const onError = vi.fn();
    pollTracker({ read, onUpdate, onError });
    await vi.advanceTimersByTimeAsync(2000);
    expect(onUpdate).toHaveBeenLastCalledWith({ status: 'generating' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(onUpdate).toHaveBeenLastCalledWith({ status: terminal });
    await vi.advanceTimersByTimeAsync(20000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not overlap slow requests and ignores an in-flight result after unmount', async () => {
    vi.useFakeTimers();
    let resolve!: (value: { status: string }) => void;
    const read = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const onUpdate = vi.fn();
    const stop = pollTracker({ read, onUpdate, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(10000);
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    resolve({ status: 'completed' });
    await vi.advanceTimersByTimeAsync(20000);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('retries temporary read errors, then offers recovery without an endless error loop', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValue(new Error('offline'));
    const onError = vi.fn();
    pollTracker({ read, onUpdate: vi.fn(), onError });
    await vi.advanceTimersByTimeAsync(30000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
