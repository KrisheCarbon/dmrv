import * as Updates from "expo-updates";

let applying = false;

/**
 * Download a published update and restart onto it.
 * A slow field network must not abandon the restart: the previous 12 second
 * cutoff downloaded the new screens and then left the old ones open.
 */
export async function applyExpoUpdateIfAvailable(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || applying) return;
  applying = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) return;
    await Updates.reloadAsync();
  } catch {
    // Stay on this bundle. A finished download still opens on the next cold start.
  } finally {
    applying = false;
  }
}
