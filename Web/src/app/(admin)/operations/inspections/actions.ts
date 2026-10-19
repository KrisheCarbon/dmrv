"use server";

import { backendFetch } from "@/lib/backendApi";
import type { UploadedOpsFile } from "@/lib/uploadOpsFiles";
import type { OpsFile, OpsProducer } from "../trainings/actions";

export interface InspectionRecord {
  id: string;
  held_at: string;
  inspector_name: string;
  producer: OpsProducer;
  files: OpsFile[];
}

export async function listInspections() {
  return backendFetch<InspectionRecord[]>("/inspections");
}

export async function getInspectionOptions() {
  return backendFetch<{ producers: OpsProducer[] }>("/inspections/options");
}

export async function createInspection(payload: {
  held_at: string;
  inspector_name: string;
  producer_id: string;
  files: UploadedOpsFile[];
}) {
  return backendFetch<InspectionRecord>("/inspections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
