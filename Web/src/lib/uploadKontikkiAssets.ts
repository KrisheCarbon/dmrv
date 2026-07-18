import { supabaseUrl } from "@/lib/env";
import {
  deleteStorageObject,
  extensionFromFile,
  fileNameFromStoragePath,
} from "@/lib/privateStorage";
import { isStorageBucketMissingError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export const KONTIKKI_ASSETS_BUCKET = "kontikkis";
const LEGACY_PHOTO_BUCKET = "kontikki-assets-photos";
const LEGACY_PLAN_BUCKET = "kontikki-assets-plan";

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

async function uploadLegacyPublicFile(
  bucket: string,
  file: File,
  folder: string,
): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);

  if (error) throw error;

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
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

  try {
    const { error } = await supabase.storage
      .from(KONTIKKI_ASSETS_BUCKET)
      .upload(path, file, { upsert: false });

    if (error) throw error;
    return path;
  } catch (err) {
    if (!isStorageBucketMissingError(err)) throw err;
    return uploadLegacyPublicFile(LEGACY_PHOTO_BUCKET, file, type);
  }
}

export async function uploadKontikkiDesignDoc({
  kontikkiId,
  file,
}: {
  kontikkiId: string;
  file: File;
}): Promise<string> {
  const path = buildKontikkiDesignDocPath(kontikkiId, file);

  try {
    const { error } = await supabase.storage
      .from(KONTIKKI_ASSETS_BUCKET)
      .upload(path, file, { upsert: false });

    if (error) throw error;
    return path;
  } catch (err) {
    if (!isStorageBucketMissingError(err)) throw err;
    return uploadLegacyPublicFile(LEGACY_PLAN_BUCKET, file, "plan");
  }
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

  const { error } = await supabase
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
    const { error: legacyError } = await supabase
      .from("kontikkis")
      .update(legacyPayload)
      .eq("id", kontikkiId);

    if (legacyError) throw legacyError;
    return;
  }

  throw error;
}
