import { getModuleBucket } from "./consentStorage";

export const PYROLYSIS_BUCKET = getModuleBucket("pyrolysis");

export type PyrolysisPhotoKind =
  | "feedstock"
  | "feedstock_size"
  | "moisture"
  | "stage"
  | "sample";

export function buildPyrolysisPhotoPath(
  batchId: string,
  kind: PyrolysisPhotoKind,
  options?: { index?: number; stage?: string; ext?: string },
): string {
  const ext = options?.ext ?? "jpg";
  const base = `batches/${batchId}`;

  if (kind === "feedstock") return `${base}/feedstock.${ext}`;
  if (kind === "feedstock_size") return `${base}/feedstock_size.${ext}`;
  if (kind === "moisture") {
    const index = options?.index ?? 1;
    return `${base}/moisture/${index}.${ext}`;
  }
  if (kind === "stage") {
    const stage = options?.stage ?? "initial";
    return `${base}/stages/${stage}.${ext}`;
  }
  if (kind === "sample") return `${base}/sample.${ext}`;

  return `${base}/photo_${Date.now()}.${ext}`;
}
