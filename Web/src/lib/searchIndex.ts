import type { FieldPhotoMetadata } from "@krishecarbon/shared";

export function searchPartsFromValue(value: unknown): string[] {
  if (value == null) return [];

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = String(value).trim();
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(searchPartsFromValue);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      searchPartsFromValue,
    );
  }

  return [];
}

export function photoMetadataSearchParts(
  metadata?: FieldPhotoMetadata | null,
): string[] {
  if (!metadata) return [];
  return searchPartsFromValue({
    address: metadata.address,
    latitude: metadata.latitude,
    longitude: metadata.longitude,
    captured_at: metadata.captured_at,
    device_time_iso: metadata.device_time_iso,
  });
}

export function buildSearchIndex(
  ...parts: (string | number | null | undefined | unknown)[]
): string {
  return parts
    .flatMap((part) => searchPartsFromValue(part))
    .join("\n")
    .toLowerCase();
}
