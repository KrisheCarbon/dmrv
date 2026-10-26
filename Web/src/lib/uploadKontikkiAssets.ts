import {
  deleteStorageObject,
  extensionFromFile,
  fileNameFromStoragePath,
  uploadStorageObject,
} from "@/lib/privateStorage";
import { browserData } from "@/lib/awsDataBrowser";

export const KONTIKKI_ASSETS_BUCKET = "kontikkis";

export type KontikkiPhotoType = "top" | "bottom";

export function buildKontikkiPhotoPath(
  kontikkiId: string,
  type: KontikkiPhotoType,
  file: File,
): string {
  return `${kontikkiId}/photos/${type}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
}

export function buildKontikkiDesignDocPath(kontikkiId: string, file: File): string {
  return `${kontikkiId}/documents/design-${crypto.randomUUID()}.${extensionFromFile(file)}`;
}

export { fileNameFromStoragePath as fileNameFromKontikkiAssetPath };

export function normalizeKontikkiPhotoPaths(
  paths?: string[] | null,
  legacyPath?: string | null,
): string[] {
  if (paths?.length) return paths.filter(Boolean);
  if (legacyPath) return [legacyPath];
  return [];
}

export async function uploadKontikkiPhoto({
  kontikkiId,
  type,
  file,
}: {
  kontikkiId: string;
  type: KontikkiPhotoType;
  file: File;
}): Promise<string> {
  const path = buildKontikkiPhotoPath(kontikkiId, type, file);

  await uploadStorageObject(
    KONTIKKI_ASSETS_BUCKET,
    path,
    file,
    file.type || "image/jpeg",
  );
  return path;
}

export async function uploadKontikkiDesignDoc({
  kontikkiId,
  file,
}: {
  kontikkiId: string;
  file: File;
}): Promise<string> {
  const path = buildKontikkiDesignDocPath(kontikkiId, file);

  await uploadStorageObject(
    KONTIKKI_ASSETS_BUCKET,
    path,
    file,
    file.type || "application/octet-stream",
  );
  return path;
}

export async function deleteKontikkiAsset({ path }: { path: string }): Promise<void> {
  await deleteStorageObject(KONTIKKI_ASSETS_BUCKET, path);
}

export async function updateKontikkiPhotoFields(
  kontikkiId: string,
  topPhotoUrls: string[],
  bottomPhotoUrls: string[],
): Promise<void> {
  const legacyPayload = {
    top_photo_url: topPhotoUrls[0] ?? null,
    side_photo_url: bottomPhotoUrls[0] ?? null,
  };

  const fullPayload = {
    ...legacyPayload,
    top_photo_urls: topPhotoUrls,
    bottom_photo_urls: bottomPhotoUrls,
  };

  const dataClient = await browserData();
  const { error } = await dataClient
    .from("kontikkis")
    .update(fullPayload)
    .eq("id", kontikkiId);

  if (!error) return;

  const message = error.message ?? "";
  if (
    message.includes("top_photo_urls") ||
    message.includes("bottom_photo_urls") ||
    message.includes("schema cache")
  ) {
    const { error: legacyError } = await dataClient
      .from("kontikkis")
      .update(legacyPayload)
      .eq("id", kontikkiId);

    if (legacyError) throw legacyError;
    return;
  }

  throw error;
}
