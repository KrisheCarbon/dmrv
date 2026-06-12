import * as FileSystem from "expo-file-system";
import { supabase } from "../services/supabase";

export function getConsentUri(farmer) {
  return farmer.consent_local_uri || farmer.consent_document_url || null;
}

export function hasConsent(farmer) {
  return !!getConsentUri(farmer);
}

export function getConsentDisplayName(farmer) {
  if (farmer.consent_file_name?.trim()) {
    return farmer.consent_file_name.trim();
  }

  const source = getConsentUri(farmer);
  if (!source) return "Consent form";

  const fileName = source.split("/").pop()?.split("?")[0];
  return fileName ? decodeURIComponent(fileName) : "Consent form";
}

export function isConsentPdf(uri) {
  if (!uri) return false;
  const lower = uri.toLowerCase();
  return lower.includes(".pdf") || lower.includes("application/pdf");
}

export function isConsentImage(uri) {
  if (!uri) return false;
  const lower = uri.toLowerCase();
  return (
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".png") ||
    lower.includes(".webp") ||
    lower.includes(".heic") ||
    lower.includes("image/")
  );
}

function extractConsentStoragePath(url) {
  if (!url) return null;

  const markers = [
    "/storage/v1/object/public/consent-documents/",
    "/storage/v1/object/sign/consent-documents/",
    "/storage/v1/object/authenticated/consent-documents/",
    "/consent-documents/"
  ];

  for (const marker of markers) {
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    }
  }

  return url.split("/").pop()?.split("?")[0] || null;
}

async function ensureLocalFileUri(uri) {
  if (!uri) return null;

  if (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("file://")
  ) {
    return uri;
  }

  if (uri.startsWith("content://")) {
    const ext = uri.toLowerCase().includes(".pdf") ? "pdf" : "jpg";
    const dest = `${FileSystem.cacheDirectory}consent_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  }

  return uri;
}

export async function resolveConsentViewUri(farmer) {
  if (farmer.consent_local_uri) {
    return ensureLocalFileUri(farmer.consent_local_uri);
  }

  if (!farmer.consent_document_url) {
    return null;
  }

  const path = extractConsentStoragePath(farmer.consent_document_url);
  if (!path) {
    throw new Error("Could not resolve the consent file path.");
  }

  const { data, error } = await supabase.storage
    .from("consent-documents")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    throw new Error(
      error.message ||
        "Could not access consent file. Check Supabase storage policies."
    );
  }

  return data.signedUrl;
}
