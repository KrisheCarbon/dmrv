import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearFormDraft, formDraftKey } from "../hooks/usePersistedForm";

/** Draft names used by the Farmers Network entry forms (see usePersistedForm). */
export const NETWORK_FORM_DRAFTS = {
  farmer: "new-farmer",
  farm: "field-form:new",
  soilSample: "soil-test",
  soilReport: "soil-report",
  consent: "consent-form",
} as const;

export async function readFormDraft<T = Record<string, unknown>>(
  name: string,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(formDraftKey(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Ids of existing records that have unsaved edits, e.g. "field-form:<id>". */
export async function draftIdsWithPrefix(prefix: string): Promise<Set<string>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const full = formDraftKey(prefix);
    return new Set(
      keys
        .filter((key) => key.startsWith(full) && key !== formDraftKey(`${prefix}new`))
        .map((key) => key.slice(full.length)),
    );
  } catch {
    return new Set();
  }
}

export { clearFormDraft };
