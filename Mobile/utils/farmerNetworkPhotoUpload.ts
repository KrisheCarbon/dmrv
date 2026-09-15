import NetInfo from "@react-native-community/netinfo";
import {
  FARMER_NETWORK_PHOTOS_BUCKET,
} from "@krishecarbon/shared";
import { supabase } from "../services/supabase";

function photoExt(uri: string): string {
  return uri.split(".").pop()?.split("?")[0] || "jpg";
}

export async function uploadFarmerNetworkPhoto(
  localUri: string,
  storagePath: string,
): Promise<string> {
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }

  const net = await NetInfo.fetch();
  if (net.isConnected !== true) {
    throw new Error(
      "Internet required to upload photos. Connect to Wi‑Fi or mobile data.",
    );
  }

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = photoExt(localUri);
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const { error } = await supabase.storage
    .from(FARMER_NETWORK_PHOTOS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    throw new Error(error.message || "Photo upload failed.");
  }

  const { data } = supabase.storage
    .from(FARMER_NETWORK_PHOTOS_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadFarmerNetworkPhotos(
  uris: string[],
  folder: string,
  id: string,
  prefix: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < uris.length; i += 1) {
    const uri = uris[i];
    if (!uri) continue;
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      urls.push(uri);
      continue;
    }
    const ext = photoExt(uri);
    urls.push(
      await uploadFarmerNetworkPhoto(
        uri,
        `${folder}/${id}/${prefix}-${i + 1}.${ext}`,
      ),
    );
  }
  return urls;
}
