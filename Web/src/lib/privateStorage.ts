import { supabase } from "@/lib/supabase";

export const BIOCHAR_PRODUCER_DOCS_BUCKET = "biochar-producers";
export const PARTNER_DOCS_BUCKET = "partners";
export const FEEDSTOCK_DOCS_BUCKET = "feedstocks";

export const ORGANIZATION_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export const ORGANIZATION_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/";

export function storagePathFromValue(
  value: string,
  defaultBucket?: string,
): { bucket: string; path: string } | null {
  if (!value.trim()) return null;

  if (value.includes(PUBLIC_OBJECT_MARKER)) {
    const idx = value.indexOf(PUBLIC_OBJECT_MARKER);
    const rest = value.slice(idx + PUBLIC_OBJECT_MARKER.length);
    const slash = rest.indexOf("/");
    if (slash === -1) return null;

    return {
      bucket: rest.slice(0, slash),
      path: decodeURIComponent(rest.slice(slash + 1)),
    };
  }

  if (defaultBucket) {
    return { bucket: defaultBucket, path: value };
  }

  return null;
}

export async function createSignedStorageUrl(
  bucket: string,
  pathOrValue: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const ref = storagePathFromValue(pathOrValue, bucket);
  if (!ref) return null;

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, expiresInSeconds);

  if (error) {
    console.error("Failed to create signed URL:", error);
    return null;
  }

  return data.signedUrl;
}

export async function deleteStorageObject(
  bucket: string,
  pathOrValue: string,
): Promise<void> {
  const ref = storagePathFromValue(pathOrValue, bucket);
  if (!ref) return;

  const { error } = await supabase.storage.from(ref.bucket).remove([ref.path]);
  if (error) {
    throw error;
  }
}

export function fileNameFromStoragePath(path: string) {
  const segment = path.split("/").pop() ?? "document";
  return decodeURIComponent(segment.split("?")[0] ?? segment);
}

export function extensionFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 10) return fromName;

  switch (file.type) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}
