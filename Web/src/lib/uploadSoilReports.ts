import {
  deleteStorageObject,
  extensionFromFile,
  fileNameFromStoragePath,
  uploadStorageObject,
} from "@/lib/privateStorage";
import { SOIL_REPORTS_BUCKET } from "@krishecarbon/shared";

export const SOIL_REPORT_ACCEPT = "application/pdf";

export function buildSoilReportPath(soilTestId: string, ext: string): string {
  return `${soilTestId}/report.${ext}`;
}

export { fileNameFromStoragePath as fileNameFromSoilReportPath };

export async function uploadSoilReportPdf({
  file,
  soilTestId,
}: {
  file: File;
  soilTestId: string;
}): Promise<string> {
  const ext = extensionFromFile(file);
  const path = buildSoilReportPath(soilTestId, ext);
  await uploadStorageObject(SOIL_REPORTS_BUCKET, path, file, file.type || "application/pdf");
  return path;
}

export async function deleteSoilReportPdf({ path }: { path: string }): Promise<void> {
  await deleteStorageObject(SOIL_REPORTS_BUCKET, path);
}
