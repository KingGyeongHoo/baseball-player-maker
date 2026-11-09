// Keep at most one in-flight snapshot and the latest pending one per career.
// Waiting callers settle only after the snapshot that supersedes theirs is saved.
export class LatestSaveQueue<T> {
  private pending = new Map<string, { value: T; waiters: { resolve: () => void; reject: (error: unknown) => void }[] }>();
  private running = false;

  constructor(private readonly write: (value: T) => Promise<void>) {}

  enqueue(key: string, value: T): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      const previous = this.pending.get(key);
      this.pending.set(key, { value, waiters: [...(previous?.waiters ?? []), { resolve, reject }] });
    });
    void this.drain();
    return promise;
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.size) {
        const [key, job] = this.pending.entries().next().value!;
        this.pending.delete(key);
        try { await this.write(job.value); for (const waiter of job.waiters) waiter.resolve(); }
        catch (error) { for (const waiter of job.waiters) waiter.reject(error); }
      }
    } finally { this.running = false; }
  }
}
