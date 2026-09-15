import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "../database/db";
import { clearBackendUrlCache } from "../services/backendApi";
import { stopSyncListener, startSyncListener } from "../services/syncService";

const PYRO_PHOTO_DIR = `${FileSystem.documentDirectory}pyrolysis-photos/`;

const ALL_TABLES = [
  "farmers",
  "farm_fields",
  "farm_crops",
  "farmer_consents",
  "soil_tests",
  "soil_reports",
  "sync_queue",
  "pyrolysis_sessions",
  "pyrolysis_batches",
  "mixing_entries",
  "mixing_pyrolysis_links",
  "application_entries",
  "application_pyrolysis_links",
  "encrypted_batches",
];

export async function clearPyrolysisPhotos(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PYRO_PHOTO_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(PYRO_PHOTO_DIR, { idempotent: true });
  }
}

export async function resetLocalDatabase(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const table of ALL_TABLES) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });
}

/** Clears offline DB, pyrolysis photos, and sync queue keys. Keeps auth session. */
export async function resetOfflineAppData(): Promise<void> {
  stopSyncListener();
  clearBackendUrlCache();

  try {
    await clearPyrolysisPhotos();
    await resetLocalDatabase();

    const keys = await AsyncStorage.getAllKeys();
    const offlineKeys = keys.filter(
      (key) =>
        key.startsWith("dmrv_") &&
        !key.includes("auth") &&
        !key.includes("supabase"),
    );
    if (offlineKeys.length > 0) {
      await AsyncStorage.multiRemove(offlineKeys);
    }
  } finally {
    startSyncListener();
  }
}
