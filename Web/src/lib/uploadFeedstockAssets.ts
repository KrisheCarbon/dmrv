import {
  deleteStorageObject,
  extensionFromFile,
  FEEDSTOCK_DOCS_BUCKET,
  uploadStorageObject,
} from "@/lib/privateStorage";

export type FeedstockAssetType = "lab_report" | "ghg_avoidance_approval";

export { FEEDSTOCK_DOCS_BUCKET };

const ASSET_FILENAMES: Record<FeedstockAssetType, string> = {
  lab_report: "lab-report",
  ghg_avoidance_approval: "ghg-avoidance-approval",
};

export function buildFeedstockAssetPath(
  feedstockId: string,
  type: FeedstockAssetType,
  ext: string,
): string {
  return `${feedstockId}/documents/${ASSET_FILENAMES[type]}.${ext}`;
}

export async function uploadFeedstockAsset({
  file,
  feedstockId,
  type,
}: {
  file: File;
  feedstockId: string;
  type: FeedstockAssetType;
}): Promise<string> {
  if (!file) {
    throw new Error("File missing");
  }

  const ext = extensionFromFile(file);
  const path = buildFeedstockAssetPath(feedstockId, type, ext);

  await uploadStorageObject(
    FEEDSTOCK_DOCS_BUCKET,
    path,
    file,
    file.type || "application/octet-stream",
  );

  return path;
}

export async function deleteFeedstockAsset({
  path,
}: {
  path: string;
}): Promise<void> {
  await deleteStorageObject(FEEDSTOCK_DOCS_BUCKET, path);
}
