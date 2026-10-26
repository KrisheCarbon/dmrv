/** Short bucket names. The API maps each one onto its private AWS bucket. */
export const OBJECT_STORAGE_BUCKETS = [
  "pyrolysis",
  "mixing",
  "application",
  "biomass-collection",
  "trainings",
  "farmer-network-photos",
  "soil-reports",
  "training-sessions",
  "inspections",
  "payment-proofs",
  "biochar-producers",
  "partners",
  "feedstocks",
  "kontikkis",
  "farms",
] as const;

export type ObjectStorageBucket = (typeof OBJECT_STORAGE_BUCKETS)[number];

const OBJECT_MARKERS = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
  "/storage/v1/object/authenticated/",
];

export function isObjectStorageBucket(value: string): value is ObjectStorageBucket {
  return (OBJECT_STORAGE_BUCKETS as readonly string[]).includes(value);
}

/** A stable reference for a stored file. It is not a link that can be opened. */
export function storedObjectUrl(bucket: string, path: string): string {
  return `https://storage.krishecarbon.com/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, "")}`;
}

/** Bucket and path from a stored path or an older Supabase file link. */
export function storageRefFromValue(
  value: string,
  defaultBucket?: string,
): { bucket: string; path: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  for (const marker of OBJECT_MARKERS) {
    const index = trimmed.indexOf(marker);
    if (index === -1) continue;
    const rest = trimmed.slice(index + marker.length).split("?")[0] ?? "";
    const slash = rest.indexOf("/");
    if (slash === -1) return null;
    const bucket = rest.slice(0, slash);
    const path = decodeURIComponent(rest.slice(slash + 1));
    if (!bucket || !path) return null;
    return { bucket, path };
  }

  if (defaultBucket && !/^https?:\/\//.test(trimmed)) {
    return { bucket: defaultBucket, path: trimmed.replace(/^\/+/, "") };
  }

  return null;
}
