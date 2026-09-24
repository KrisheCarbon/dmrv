import * as Updates from "expo-updates";

const UPDATE_WAIT_MS = 12000;

/** Download a published Expo update and restart onto it before the old screens stay on screen. */
export async function applyExpoUpdateIfAvailable(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;

  let gaveUp = false;
  const wait = new Promise<void>((resolve) => {
    setTimeout(() => {
      gaveUp = true;
      resolve();
    }, UPDATE_WAIT_MS);
  });

  const apply = (async () => {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable || gaveUp) return;
    await Updates.fetchUpdateAsync();
    if (gaveUp) return;
    await Updates.reloadAsync();
  })();

  await Promise.race([
    apply.catch(() => undefined),
    wait,
  ]);
}
