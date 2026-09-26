/** A tiny typed event bus. Events are a discriminated union on `type`. */
export interface Bus<E extends { type: string }> {
  on<K extends E['type']>(type: K, fn: (e: Extract<E, { type: K }>) => void): () => void;
  onAny(fn: (e: E) => void): () => void;
  emit(e: E): void;
  clear(): void;
}

export function createBus<E extends { type: string }>(): Bus<E> {
  const typed = new Map<string, Set<(e: E) => void>>();
  const any = new Set<(e: E) => void>();
  return {
    on(type, fn) {
      const set = typed.get(type) ?? new Set();
      typed.set(type, set);
      set.add(fn as (e: E) => void);
      return () => set.delete(fn as (e: E) => void);
    },
    onAny(fn) {
      any.add(fn);
      return () => any.delete(fn);
    },
    emit(e) {
      typed.get(e.type)?.forEach(fn => fn(e));
      any.forEach(fn => fn(e));
    },
    clear() {
      typed.clear();
      any.clear();
    },
  };
}
