import type { BiomassCollectionRecord } from "@krishecarbon/shared";
import { backendFetch } from "./backendApi";

export type ClusterRecordCard = {
  id: string;
  title: string;
  subtitle: string;
};

function when(value: string | null | undefined): string {
  if (!value) return "";
  const date = value.slice(0, 10);
  return date || "";
}

function person(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || "Someone in this cluster";
}

export async function listClusterPyrolysisCards(userId: string): Promise<ClusterRecordCard[]> {
  const rows = await backendFetch<
    Array<{
      id: string;
      operator_id: string;
      status: string;
      created_at?: string;
      batches?: Array<{ kontikki_code?: string | null }>;
      rainbow_batches?: Array<{ kontikki_code?: string | null }>;
    }>
  >("/pyrolysis-sessions");
  return rows
    .filter((row) => row.operator_id !== userId)
    .map((row) => {
      const codes = [...(row.batches ?? []), ...(row.rainbow_batches ?? [])]
        .map((batch) => batch.kontikki_code?.trim())
        .filter((code): code is string => Boolean(code));
      return {
        id: row.id,
        title: codes.length > 0 ? codes.join(", ") : "Kiln run",
        subtitle: [row.status === "completed" ? "Submitted" : "In progress", when(row.created_at)]
          .filter(Boolean)
          .join(" · "),
      };
    });
}

export async function listClusterMixingCards(userId: string): Promise<ClusterRecordCard[]> {
  const rows = await backendFetch<
    Array<{
      id: string;
      operator_id: string;
      operator_name?: string | null;
      farm_name?: string | null;
      started_at?: string;
      status?: string;
    }>
  >("/mixing-entries");
  return rows
    .filter((row) => row.operator_id !== userId)
    .map((row) => ({
      id: row.id,
      title: row.farm_name?.trim() || "Mixing entry",
      subtitle: [person(row.operator_name), row.status === "submitted" ? "Submitted" : row.status, when(row.started_at)]
        .filter(Boolean)
        .join(" · "),
    }));
}

export async function listClusterApplicationCards(userId: string): Promise<ClusterRecordCard[]> {
  const rows = await backendFetch<
    Array<{
      id: string;
      operator_id: string;
      operator_name?: string | null;
      farm_name?: string | null;
      applied_at?: string;
      status?: string;
    }>
  >("/application-entries");
  return rows
    .filter((row) => row.operator_id !== userId)
    .map((row) => ({
      id: row.id,
      title: row.farm_name?.trim() || "Application entry",
      subtitle: [person(row.operator_name), "Submitted", when(row.applied_at)].filter(Boolean).join(" · "),
    }));
}

export async function listClusterBiomassCards(userId: string): Promise<ClusterRecordCard[]> {
  const rows = await backendFetch<BiomassCollectionRecord[]>("/biomass-collections");
  return rows
    .filter((row) => row.operator_id !== userId)
    .map((row) => ({
      id: row.id,
      title: row.farm_name?.trim() || row.producer_name?.trim() || "Biomass trip",
      subtitle: [person(row.operator_name), "Submitted", when(row.loaded_at)].filter(Boolean).join(" · "),
    }));
}
