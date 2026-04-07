type TimingEntry = {
  duration?: number;
  description?: string;
  startedAt?: number;
};

export class ServerTiming {
  private entries: Map<string, TimingEntry> = new Map();

  time = async <T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> => {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.add(name, performance.now() - start, description);
    }
  };

  start = (name: string, description?: string): void => {
    this.entries.set(name, {
      startedAt: performance.now(),
      description,
    });
  };

  stop = (name: string): void => {
    const entry = this.entries.get(name);
    if (entry?.startedAt !== undefined) {
      entry.duration = performance.now() - entry.startedAt;
      delete entry.startedAt;
    }
  };

  add = (name: string, duration: number, description?: string): void => {
    this.entries.set(name, { duration, description });
  };

  toString = (): string => {
    return [...this.entries.entries()]
      .filter(([, v]) => v.duration !== undefined)
      .map(([name, { duration, description }]) => {
        let entry = name;
        if (description) entry += `;desc="${description}"`;
        if (duration !== undefined) entry += `;dur=${duration.toFixed(1)}`;
        return entry;
      })
      .join(", ");
  };
}
