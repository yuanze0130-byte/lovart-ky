export type AdmissionResult = 'acquired' | 'duplicate' | 'user_busy' | 'global_busy';

export class AdmissionError extends Error {
  constructor(readonly reason: 'duplicate' | 'timeout' | 'unavailable' | 'cancelled') {
    super(reason); this.name = 'AdmissionError';
  }
}

// Only admission is retried. The caller must invoke its upstream operation once,
// after acquisition; ambiguous storage failures never start paid work.
export async function waitForAiAdmission(options: {
  acquire: () => Promise<string>;
  signal?: AbortSignal;
  now?: () => number;
  wait?: () => Promise<void>;
  timeoutMs?: number;
}) {
  const now = options.now || Date.now;
  const deadline = now() + (options.timeoutMs ?? 90_000);
  const wait = options.wait || (() => new Promise<void>(resolve => setTimeout(resolve, 1000)));
  while (true) {
    if (options.signal?.aborted) throw new AdmissionError('cancelled');
    let result: string;
    try { result = await options.acquire(); } catch { throw new AdmissionError('unavailable'); }
    if (result === 'acquired') return;
    if (result === 'duplicate') throw new AdmissionError('duplicate');
    if (result !== 'user_busy' && result !== 'global_busy') throw new AdmissionError('unavailable');
    if (now() >= deadline) throw new AdmissionError('timeout');
    await wait();
  }
}
