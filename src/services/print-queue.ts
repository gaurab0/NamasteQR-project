export interface QueueResult<T> {
  skippedDuplicate: boolean;
  value?: T;
}

/** Serializes one printer while allowing different printer IDs to run independently. */
export class PrintQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly recentJobs = new Map<string, number>();

  public enqueue<T>(
    printerId: string,
    identity: string,
    task: () => Promise<T>,
    options: { timeoutMs?: number; bypassDuplicateGuard?: boolean; onTimeout?: () => void } = {},
  ): Promise<QueueResult<T>> {
    const now = Date.now();
    this.prune(now);
    const duplicateKey = `${printerId}:${identity}`;
    if (!options.bypassDuplicateGuard && now - (this.recentJobs.get(duplicateKey) || 0) < 2500) {
      return Promise.resolve({ skippedDuplicate: true });
    }
    this.recentJobs.set(duplicateKey, now);

    const previous = this.tails.get(printerId) || Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const timeoutMs = options.timeoutMs ?? 20000;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([
          task(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              options.onTimeout?.();
              reject(new Error(`Print timed out after ${timeoutMs}ms.`));
            }, timeoutMs);
          }),
        ]);
        return { skippedDuplicate: false, value };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });
    const tail = current.then(() => undefined, () => undefined);
    this.tails.set(printerId, tail);
    void tail.then(() => {
      if (this.tails.get(printerId) === tail) this.tails.delete(printerId);
    });
    return current;
  }

  private prune(now: number): void {
    for (const [key, timestamp] of this.recentJobs) {
      if (now - timestamp > 30000) this.recentJobs.delete(key);
    }
  }
}

export const printQueue = new PrintQueue();
