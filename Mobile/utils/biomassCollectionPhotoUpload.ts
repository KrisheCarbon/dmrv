import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../services/supabase";
import { canUploadToCloud } from "../services/syncService";
import { getModuleBucket } from "./moduleStorage";

export const BIOMASS_COLLECTION_BUCKET = getModuleBucket("biomassCollection");

export type BiomassCollectionPhotoKind = "loaded" | "unloaded";

/** Uploads one watermarked photo and returns its public URL. Already-uploaded photos pass through. */
export async function uploadBiomassCollectionPhoto(
  collectionId: string,
  kind: BiomassCollectionPhotoKind,
  localUri: string | null | undefined,
  existingUrl: string | null | undefined,
): Promise<string> {
  if (existingUrl) return existingUrl;
  if (!localUri) {
    throw new Error(`The ${kind} photo is missing.`);
  }
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }

  const net = await NetInfo.fetch();
  if (!canUploadToCloud(net)) {
    throw new Error(
      "Internet required to upload biomass collection photos. Connect to Wi‑Fi or mobile data.",
    );
  }

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = localUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const storagePath = `collections/${collectionId}/${kind}.${ext}`;

  const { error } = await supabase.storage
    .from(BIOMASS_COLLECTION_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    const hint = error.message?.includes("not found")
      ? " Biomass collection storage is not configured on the server."
      : "";
    throw new Error(`${error.message}${hint}`);
  }

  const { data } = supabase.storage.from(BIOMASS_COLLECTION_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
