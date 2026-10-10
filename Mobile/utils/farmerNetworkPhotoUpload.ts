import NetInfo from "@react-native-community/netinfo";
import { Linking } from "react-native";
import {
  FARMER_NETWORK_PHOTOS_BUCKET,
  SOIL_REPORTS_BUCKET,
} from "@krishecarbon/shared";
import { supabase } from "../services/supabase";

function photoExt(uri: string): string {
  return uri.split(".").pop()?.split("?")[0] || "jpg";
}

function contentTypeForExt(ext: string): string {
  const kind = ext.toLowerCase();
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  if (kind === "gif") return "image/gif";
  if (kind === "pdf") return "application/pdf";
  if (kind === "heic" || kind === "heif") return "image/heic";
  return "image/jpeg";
}

export function isLocalMediaUri(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  return (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("/") ||
    uri.startsWith("ph://")
  );
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
  const contentType = contentTypeForExt(ext);

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

export async function uploadSoilReportFile(
  localUri: string,
  storagePath: string,
  contentType: string,
): Promise<string> {
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }

  const net = await NetInfo.fetch();
  if (net.isConnected !== true) {
    throw new Error(
      "Internet required to upload the soil report. Connect to Wi‑Fi or mobile data.",
    );
  }

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from(SOIL_REPORTS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true });

  if (error) {
    throw new Error(error.message || "Soil report upload failed.");
  }

  // The bucket is private: store the path, as the admin portal does, and
  // sign it when someone opens the report.
  return storagePath;
}

/** Storage path of a soil report, from either a stored path or an older public URL. */
function soilReportStoragePath(value: string): string | null {
  const marker = `/${SOIL_REPORTS_BUCKET}/`;
  if (!/^https?:\/\//.test(value)) return value.replace(/^\/+/, "");
  if (!value.includes("/storage/v1/object/")) return null;
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(value.slice(index + marker.length).split("?")[0]);
}

/** Open a soil report (PDF or photo) in the phone's viewer via a short-lived link. */
export async function openSoilReport(documentUrlOrPath: string): Promise<void> {
  const path = soilReportStoragePath(documentUrlOrPath);
  if (!path) {
    await Linking.openURL(documentUrlOrPath);
    return;
  }
  const { data, error } = await supabase.storage
    .from(SOIL_REPORTS_BUCKET)
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not open the report. Check your internet.");
  }
  await Linking.openURL(data.signedUrl);
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
