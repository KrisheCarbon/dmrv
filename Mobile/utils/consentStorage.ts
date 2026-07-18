/**
 * Each app module has its own Supabase storage bucket.
 * Consent files for that module live under consent-documents/ inside it.
 *
 *   farms/consent-documents/consent_123.jpg
 *   pyrolysis/consent-documents/...        (separate bucket, future)
 *   mixing/consent-documents/...           (separate bucket, future)
 */
export const MODULE_STORAGE_BUCKETS = {
  farms: "farms",
  pyrolysis: "pyrolysis",
  mixing: "mixing",
  application: "application",
  trainings: "trainings",
} as const;

export type ModuleStorageBucket = keyof typeof MODULE_STORAGE_BUCKETS;

/** Folder inside a module bucket where consent forms are stored. */
export const CONSENT_DOCUMENTS_FOLDER = "consent-documents";

export function getModuleBucket(module: ModuleStorageBucket): string {
  return MODULE_STORAGE_BUCKETS[module];
}

export function buildConsentStoragePath(fileName: string): string {
  return `${CONSENT_DOCUMENTS_FOLDER}/${fileName}`;
}

export function buildConsentFileName(ext: string) {
  return `consent_${Date.now()}.${ext}`;
}

function bucketPathMarkers(bucket: string): string[] {
  return [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
    `/${bucket}/`,
  ];
}

export function extractConsentStoragePath(
  url: string | null | undefined,
  bucket: string,
): string | null {
  if (!url) return null;

  for (const marker of bucketPathMarkers(bucket)) {
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    }
  }

  return url.split("/").pop()?.split("?")[0] || null;
}
