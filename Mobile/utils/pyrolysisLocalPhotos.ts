import * as FileSystem from "expo-file-system/legacy";

const PHOTO_DIR = `${FileSystem.documentDirectory}pyrolysis-photos/`;

export function normalizeImageUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  ) {
    return uri;
  }
  return `file://${uri}`;
}

export async function persistPyrolysisPhoto(localUri: string): Promise<string> {
  const normalized = normalizeImageUri(localUri);
  if (!normalized) {
    throw new Error("Invalid photo path.");
  }

  if (normalized.startsWith(PHOTO_DIR)) {
    return normalized;
  }

  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });

  const destination = `${PHOTO_DIR}photo_${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: normalized, to: destination });

  return destination;
}
