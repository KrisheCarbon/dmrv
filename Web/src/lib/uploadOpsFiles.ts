import { uploadStorageObject } from "@/lib/privateStorage";
import { supabase } from "@/lib/supabase";

export const TRAINING_SESSION_BUCKET = "training-sessions";
export const INSPECTION_BUCKET = "inspections";

const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export interface UploadedOpsFile {
  kind: string;
  path: string;
  file_name: string;
  content_type: string;
}

export function acceptFor(kind: "doc" | "photo" | "video"): string {
  if (kind === "photo") return PHOTO_TYPES.join(",");
  if (kind === "video") return VIDEO_TYPES.join(",");
  return DOC_TYPES.join(",");
}

export async function uploadOpsFiles(
  bucket: string,
  kind: string,
  files: File[],
  allowed: readonly string[],
): Promise<UploadedOpsFile[]> {
  if (files.length === 0) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const uploaded: UploadedOpsFile[] = [];
  for (const file of files) {
    const contentType = file.type || guessType(file.name);
    if (!allowed.includes(contentType)) {
      throw new Error(`${file.name} is not an allowed file type.`);
    }
    const limit = VIDEO_TYPES.includes(contentType) ? 80 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > limit) {
      throw new Error(
        `${file.name} is too large. Photos and documents must be 20 MB or smaller, videos 80 MB.`,
      );
    }
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
    const path = `${user.id}/${crypto.randomUUID()}/${kind}/${clean}`;
    await uploadStorageObject(bucket, path, file, contentType);
    uploaded.push({
      kind,
      path,
      file_name: file.name,
      content_type: contentType,
    });
  }
  return uploaded;
}

function guessType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "";
}

export { DOC_TYPES, PHOTO_TYPES, VIDEO_TYPES };
