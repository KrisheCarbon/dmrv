"use server";

import { backendFetch } from "@/lib/backendApi";
import type { UploadedOpsFile } from "@/lib/uploadOpsFiles";

export interface OpsProducer {
  id: string;
  name: string;
}

export interface OpsFile {
  id: string;
  kind: string;
  file_name: string;
  content_type: string;
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

export async function listTrainingSessions() {
  return backendFetch<TrainingSession[]>("/training-sessions");
}

export async function getTrainingSessionOptions() {
  return backendFetch<{ producers: OpsProducer[] }>("/training-sessions/options");
}

export async function createTrainingSession(payload: {
  held_at: string;
  trainer_name: string;
  producer_ids: string[];
  latitude: number;
  longitude: number;
  location_label: string | null;
  files: UploadedOpsFile[];
}) {
  return backendFetch<TrainingSession>("/training-sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
