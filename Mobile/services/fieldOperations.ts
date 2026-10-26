import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { backendFetch } from "./backendApi";
import { uploadStorageObject } from "./objectStorage";
import { supabase } from "./supabase";

export const TRAINING_SESSION_BUCKET = "training-sessions";
export const INSPECTION_BUCKET = "inspections";

const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export interface OpsProducer {
  id: string;
  name: string;
}

export interface OpsFile {
  id: string;
  kind: string;
  file_name: string;
  signed_url: string | null;
}

export interface TrainingSession {
  id: string;
  held_at: string;
  trainer_name: string;
  latitude: number;
  longitude: number;
  location_label: string | null;
  producers: OpsProducer[];
  files: OpsFile[];
}

export interface InspectionRecord {
  id: string;
  held_at: string;
  inspector_name: string;
  producer: OpsProducer;
  files: OpsFile[];
}

export interface PickedFile {
  uri: string;
  name: string;
  contentType: string;
}

export function listTrainingSessions() {
  return backendFetch<TrainingSession[]>("/training-sessions");
}

export function trainingOptions() {
  return backendFetch<{ producers: OpsProducer[] }>("/training-sessions/options");
}

export function listInspections() {
  return backendFetch<InspectionRecord[]>("/inspections");
}

export function inspectionOptions() {
  return backendFetch<{ producers: OpsProducer[] }>("/inspections/options");
}

export async function pickDocuments(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name || "file",
    contentType: asset.mimeType || guessType(asset.name || asset.uri),
  }));
}

export async function pickPhotos(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Allow photo access to attach pictures.");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.8,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.fileName || "photo.jpg",
    contentType: asset.mimeType || "image/jpeg",
  }));
}

export async function pickVideos(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Allow photo access to attach videos.");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsMultipleSelection: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.fileName || "video.mp4",
    contentType: asset.mimeType || guessType(asset.fileName || asset.uri),
  }));
}

export async function uploadPicked(
  bucket: string,
  kind: string,
  files: PickedFile[],
  allowed: readonly string[],
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  const uploaded = [];
  for (const file of files) {
    if (!allowed.includes(file.contentType)) {
      throw new Error(`${file.name} is not an allowed file type.`);
    }
    const response = await fetch(file.uri);
    const body = await response.arrayBuffer();
    const limit = VIDEO_TYPES.includes(file.contentType) ? 80 * 1024 * 1024 : 20 * 1024 * 1024;
    if (body.byteLength > limit) {
      throw new Error(`${file.name} is too large.`);
    }
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
    const path = `${user.id}/${randomId()}/${kind}/${clean}`;
    await uploadStorageObject(bucket, path, body, file.contentType);
    uploaded.push({
      kind,
      path,
      file_name: file.name,
      content_type: file.contentType,
    });
  }
  return uploaded;
}

export function createTrainingSession(payload: {
  held_at: string;
  trainer_name: string;
  producer_ids: string[];
  latitude: number;
  longitude: number;
  location_label: string | null;
  files: { kind: string; path: string; file_name: string; content_type: string }[];
}) {
  return backendFetch<TrainingSession>("/training-sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createInspection(payload: {
  held_at: string;
  inspector_name: string;
  producer_id: string;
  files: { kind: string; path: string; file_name: string; content_type: string }[];
}) {
  return backendFetch<InspectionRecord>("/inspections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export { DOC_TYPES, PHOTO_TYPES, VIDEO_TYPES };

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
