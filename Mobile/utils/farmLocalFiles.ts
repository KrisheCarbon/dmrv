import * as FileSystem from "expo-file-system/legacy";

const FARM_FILE_DIR = `${FileSystem.documentDirectory}farm-files/`;

function normalizeFileUri(uri: string | null | undefined): string | null {
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

export function farmFileExt(uri: string, fallback = "bin"): string {
  const raw = uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
  if (raw && raw.length <= 8 && /^[a-z0-9]+$/.test(raw)) return raw;
  return fallback;
}

export async function persistFarmFile(
  localUri: string,
  fallbackExt = "bin",
): Promise<string> {
  const normalized = normalizeFileUri(localUri);
  if (!normalized) {
    throw new Error("Invalid file path.");
  }
  if (normalized.startsWith(FARM_FILE_DIR)) {
    return normalized;
  }

  await FileSystem.makeDirectoryAsync(FARM_FILE_DIR, { intermediates: true });
  const ext = farmFileExt(normalized, fallbackExt);
  const destination = `${FARM_FILE_DIR}file_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: normalized, to: destination });
  return destination;
}
