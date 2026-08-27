/** Small lifecycle-aware fanout used to bridge one upstream event source to
 * multiple local consumers. It is deliberately independent of Electron. */
export function createFanout<T>(
  onFirst?: () => void,
  onEmpty?: () => void,
): {
  subscribe: (listener: (value: T) => void) => () => void;
  publish: (value: T) => void;
  size: () => number;
} {
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe(listener) {
      const wasEmpty = listeners.size === 0;
      listeners.add(listener);
      if (wasEmpty) onFirst?.();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        if (listeners.size === 0) onEmpty?.();
      };
    },
    publish(value) {
      for (const listener of [...listeners]) listener(value);
    },
    size: () => listeners.size,
  };
}
