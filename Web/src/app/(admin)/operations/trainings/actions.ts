"use server";

import { backendFetch } from "@/lib/backendApi";
import type {
  TrainingFormOptions,
  TrainingRecord,
} from "@/types/entities";

export interface TrainingSavePayload {
  id?: string;
  supervisor_id: string;
  location_type: "producer" | "site";
  location_id: string;
  certificate_url: string;
}

export async function listTrainings() {
  return backendFetch<TrainingRecord[]>("/trainings");
}

export async function getTrainingFormOptions() {
  return backendFetch<TrainingFormOptions>("/trainings/form-options");
}

export async function createTraining(payload: TrainingSavePayload) {
  return backendFetch<TrainingRecord>("/trainings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTraining(
  id: string,
  payload: Partial<TrainingSavePayload>,
) {
  return backendFetch<TrainingRecord>(`/trainings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTraining(id: string) {
  await backendFetch<void>(`/trainings/${id}`, {
    method: "DELETE",
  });
}
