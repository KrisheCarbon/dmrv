import {
  deleteStorageObject,
  extensionFromFile,
  fileNameFromStoragePath,
} from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";
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
  const { error } = await supabase.storage
    .from(SOIL_REPORTS_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw error;
  return path;
}

export async function deleteSoilReportPdf({ path }: { path: string }): Promise<void> {
  await deleteStorageObject(SOIL_REPORTS_BUCKET, path);
}
