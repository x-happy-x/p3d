import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SnapshotEntry<T> = {
  snapshot: T;
  label: string;
  time: number;
};

type UseHistoryOptions<T> = {
  createSnapshot: () => T;
  applySnapshot: (snapshot: T) => void;
  watch: unknown[];
  maxEntries?: number;
  mergeMs?: number;
  initialLabel?: string;
};

type HistoryViewEntry = {
  key: string;
  label: string;
  time: number;
  index: number;
  disabled: boolean;
};

export function useHistory<T>({
  createSnapshot,
  applySnapshot,
  watch,
  maxEntries = 100,
  mergeMs = 600,
  initialLabel = "Начальное состояние",
}: UseHistoryOptions<T>) {
  const entriesRef = useRef<SnapshotEntry<T>[]>([]);
  const indexRef = useRef(-1);
  const pendingRef = useRef<{ label: string; time: number } | null>(null);
  const busyRef = useRef(false);
  const lastAtRef = useRef(0);
  const lastLabelRef = useRef("");
  const initializedRef = useRef(false);
  const [version, setVersion] = useState(0);

  const recordHistory = useCallback((label = "Изменение") => {
    if (busyRef.current) return;
    pendingRef.current = { label, time: Date.now() };
  }, []);

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    const entry = entriesRef.current[indexRef.current];
    if (!entry) return;
    busyRef.current = true;
    applySnapshot(entry.snapshot);
    busyRef.current = false;
    lastAtRef.current = 0;
    lastLabelRef.current = "";
    setVersion((prev) => prev + 1);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (indexRef.current >= entriesRef.current.length - 1) return;
    indexRef.current += 1;
    const entry = entriesRef.current[indexRef.current];
    if (!entry) return;
    busyRef.current = true;
    applySnapshot(entry.snapshot);
    busyRef.current = false;
    lastAtRef.current = 0;
    lastLabelRef.current = "";
    setVersion((prev) => prev + 1);
  }, [applySnapshot]);

  const jumpTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= entriesRef.current.length) return;
      if (index === indexRef.current) return;
      indexRef.current = index;
      const entry = entriesRef.current[index];
      if (!entry) return;
      busyRef.current = true;
      applySnapshot(entry.snapshot);
      busyRef.current = false;
      lastAtRef.current = 0;
      lastLabelRef.current = "";
      setVersion((prev) => prev + 1);
    },
    [applySnapshot]
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    entriesRef.current = [
      {
        snapshot: createSnapshot(),
        label: initialLabel,
        time: Date.now(),
      },
    ];
    indexRef.current = 0;
    setVersion((prev) => prev + 1);
  }, [createSnapshot, initialLabel]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || busyRef.current) return;
    pendingRef.current = null;

    const now = pending.time;
    if (
      entriesRef.current.length &&
      now - lastAtRef.current < mergeMs &&
      lastLabelRef.current === pending.label
    ) {
      const last = entriesRef.current[entriesRef.current.length - 1];
      if (last) {
        last.snapshot = createSnapshot();
        last.time = now;
      }
    } else {
      if (indexRef.current < entriesRef.current.length - 1) {
        entriesRef.current = entriesRef.current.slice(0, indexRef.current + 1);
      }
      entriesRef.current.push({
        snapshot: createSnapshot(),
        label: pending.label,
        time: now,
      });
      if (entriesRef.current.length > maxEntries) {
        entriesRef.current.shift();
      }
      indexRef.current = entriesRef.current.length - 1;
    }

    lastAtRef.current = now;
    lastLabelRef.current = pending.label;
    setVersion((prev) => prev + 1);
  }, [createSnapshot, mergeMs, maxEntries, ...watch]);

  const entries = useMemo<HistoryViewEntry[]>(() => {
    const currentIndex = indexRef.current;
    return entriesRef.current.map((entry, index) => ({
      key: `entry-${entry.time}-${index}`,
      label: entry.label,
      time: entry.time,
      index,
      disabled: index === currentIndex,
    }));
  }, [version]);

  return {
    recordHistory,
    undo,
    redo,
    jumpTo,
    entries,
    canUndo: version >= 0 && indexRef.current > 0,
    canRedo: version >= 0 && indexRef.current < entriesRef.current.length - 1,
  };
}
