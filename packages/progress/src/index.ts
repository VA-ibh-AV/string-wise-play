import { useCallback, useEffect, useState } from 'react';

/** Mission progress per project, persisted in localStorage. Works without storage. */
const key = (id: string) => `play.progress.${id}`;

export function loadProgress(id: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(id));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveProgress(id: string, done: Iterable<string>): void {
  try {
    localStorage.setItem(key(id), JSON.stringify([...done]));
    window.dispatchEvent(new CustomEvent('play:progress', { detail: id }));
  } catch {
    /* storage blocked: progress lives for this session only */
  }
}

export function useProgress(id: string) {
  const [done, setDone] = useState(() => loadProgress(id));
  useEffect(() => {
    const sync = () => setDone(loadProgress(id));
    window.addEventListener('play:progress', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('play:progress', sync);
      window.removeEventListener('storage', sync);
    };
  }, [id]);
  const complete = useCallback(
    (mission: string) => {
      const next = new Set(loadProgress(id)).add(mission);
      saveProgress(id, next);
      setDone(next);
    },
    [id],
  );
  const reset = useCallback(() => {
    saveProgress(id, []);
    setDone(new Set());
  }, [id]);
  return { done, complete, reset };
}
