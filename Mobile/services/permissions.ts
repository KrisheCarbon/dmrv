import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

const GALLERY_TMP_DIR = `${FileSystem.cacheDirectory}gallery-export/`;

/**
 * Best-effort save of a local photo/video to the phone's Gallery app.
 * Never throws — a missing permission or storage error should not block
 * the capture flow the caller is in the middle of.
 *
 * IMPORTANT: on Android, `MediaLibrary.createAssetAsync` does not copy the
 * given file — it *moves* it into gallery-managed storage. If we handed it
 * the app's own persisted photo (the one referenced by the local database
 * and used for cloud sync), the app's copy and the Gallery photo would
 * become the exact same file, so deleting the photo from the Gallery would
 * silently delete it from the app too. To keep the Gallery copy as a pure
 * backup, we always export a disposable duplicate for MediaLibrary to take
 * ownership of, leaving the app's own copy untouched.
 */
export async function savePhotoToGallery(uri: string): Promise<void> {
  let exportedUri: string | null = null;

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== "granted") return;

    await FileSystem.makeDirectoryAsync(GALLERY_TMP_DIR, { intermediates: true });
    const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
    exportedUri = `${GALLERY_TMP_DIR}export_${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: exportedUri });

    await MediaLibrary.createAssetAsync(exportedUri);
  } catch (err) {
    console.warn(
      "Could not save photo to gallery:",
      err instanceof Error ? err.message : err
    );
  } finally {
    if (exportedUri) {
      // If MediaLibrary already moved the file, this is a harmless no-op.
      await FileSystem.deleteAsync(exportedUri, { idempotent: true }).catch(() => {});
    }
  }
}
