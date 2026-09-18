import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "dmrv_form_draft:";

export function formDraftKey(name: string): string {
  return `${PREFIX}${name}`;
}

export async function clearFormDraft(name: string): Promise<void> {
  await AsyncStorage.removeItem(formDraftKey(name));
}

function mergeDraft<T>(initial: T, parsed: unknown): T {
  if (parsed == null) return initial;
  if (Array.isArray(initial)) {
    return (Array.isArray(parsed) ? parsed : initial) as T;
  }
  if (typeof initial === "object" && initial !== null) {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return initial;
    }
    return { ...initial, ...(parsed as Record<string, unknown>) } as T;
  }
  return parsed as T;
}

/**
 * Keeps a form's in-progress values on device so Back / leaving the screen
 * does not wipe what the user already entered.
 */
export function usePersistedForm<T>(
  name: string,
  initialValue: T,
  options?: { enabled?: boolean; debounceMs?: number },
): {
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  hydrated: boolean;
  restoredFromDraft: boolean;
  clearDraft: () => Promise<void>;
} {
  const enabled = options?.enabled ?? true;
  const debounceMs = options?.debounceMs ?? 250;
  const key = formDraftKey(name);
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  const valueRef = useRef(value);
  valueRef.current = value;
  const skipSaveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    skipSaveRef.current = true;

    (async () => {
      if (!enabled) {
        if (!cancelled) {
          setValue(initialRef.current);
          setRestoredFromDraft(false);
          setHydrated(true);
        }
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(key);
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setValue(mergeDraft(initialRef.current, parsed));
            setRestoredFromDraft(true);
          } catch {
            setValue(mergeDraft(initialRef.current, {}));
            setRestoredFromDraft(false);
          }
        } else {
          setValue(mergeDraft(initialRef.current, {}));
          setRestoredFromDraft(false);
        }
      } catch {
        if (!cancelled) {
          setValue(initialRef.current);
          setRestoredFromDraft(false);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  const flush = useCallback(
    (next: T) => {
      if (!enabled) return;
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
    },
    [enabled, key],
  );

  useEffect(() => {
    if (!hydrated || !enabled) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(value), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, hydrated, enabled, flush, debounceMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (skipSaveRef.current || !enabled) return;
      AsyncStorage.setItem(key, JSON.stringify(valueRef.current)).catch(() => {});
    };
  }, [key, enabled]);

  const clearDraft = useCallback(async () => {
    skipSaveRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await AsyncStorage.removeItem(key);
  }, [key]);

  return { value, setValue, hydrated, restoredFromDraft, clearDraft };
}
