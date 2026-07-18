import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { database } from "../database";
import { clearBackendUrlCache } from "../services/backendApi";
import { stopSyncListener, startSyncListener } from "../services/syncService";

const PYRO_PHOTO_DIR = `${FileSystem.documentDirectory}pyrolysis-photos/`;

export async function clearPyrolysisPhotos(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PYRO_PHOTO_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(PYRO_PHOTO_DIR, { idempotent: true });
  }
}

export async function resetWatermelonDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

/** Clears offline DB, pyrolysis photos, and sync queue keys. Keeps auth session. */
export async function resetOfflineAppData(): Promise<void> {
  stopSyncListener();
  clearBackendUrlCache();

  try {
    await clearPyrolysisPhotos();
    await resetWatermelonDatabase();

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
