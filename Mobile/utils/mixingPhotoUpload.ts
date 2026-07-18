import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../services/supabase";
import { canUploadToCloud } from "../services/syncService";
import { MIXING_BUCKET, buildMixingPhotoPath, type MixingPhotoKind } from "./mixingStorage";

async function uploadLocalPhoto(
  localUri: string | null | undefined,
  existingUrl: string | null | undefined,
  storagePath: string,
): Promise<string | null> {
  if (!localUri) return existingUrl ?? null;
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }

  const net = await NetInfo.fetch();
  if (!canUploadToCloud(net)) {
    throw new Error(
      "Internet required to upload mixing photos. Connect to Wi‑Fi or mobile data.",
    );
  }

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const { error } = await supabase.storage
    .from(MIXING_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    const hint =
      error.message?.includes("Bucket not found") ||
      error.message?.includes("not found")
        ? " Mixing photo storage is not configured on the server."
        : "";
    throw new Error(`${error.message}${hint}`);
  }

  const { data } = supabase.storage.from(MIXING_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function photoExt(localUri: string | null | undefined): string {
  if (!localUri) return "jpg";
  return localUri.split(".").pop()?.split("?")[0] || "jpg";
}

export type MixingPhotoFields = {
  biochar_photo_local_uri?: string | null;
  biochar_photo_url?: string | null;
  substrate_photo_local_uri?: string | null;
  substrate_photo_url?: string | null;
  mixing_photo_local_uri?: string | null;
  mixing_photo_url?: string | null;
};

export async function uploadMixingEntryPhotos(
  serverEntryId: string,
  photos: MixingPhotoFields,
): Promise<MixingPhotoFields> {
  const next: MixingPhotoFields = { ...photos };
  const kinds: MixingPhotoKind[] = ["biochar", "substrate", "mixing"];

  for (const kind of kinds) {
    const localKey = `${kind}_photo_local_uri` as keyof MixingPhotoFields;
    const urlKey = `${kind}_photo_url` as keyof MixingPhotoFields;
    const localUri = photos[localKey];

    if (localUri) {
      next[urlKey] = await uploadLocalPhoto(
        localUri,
        photos[urlKey],
        buildMixingPhotoPath(serverEntryId, kind, { ext: photoExt(localUri) }),
      );
    }
  }

  return next;
}
