import {
  fetchMobileNetworkOverview,
  type NetworkKontikki,
} from "../backendApi";

export interface KilnKontikkiOption {
  id: string;
  kontikki_code: string;
  module_id: string;
  producer_name?: string | null;
  status: string;
}

function mapKontikki(row: NetworkKontikki): KilnKontikkiOption | null {
  const moduleId = row.module_id?.trim();
  if (!moduleId) return null;

  return {
    id: row.id,
    kontikki_code: row.kontikki_code,
    module_id: moduleId,
    producer_name: row.producer?.name ?? null,
    status: row.status,
  };
}

export async function fetchKontikkisForKilnSensor(): Promise<KilnKontikkiOption[]> {
  const overview = await fetchMobileNetworkOverview();

  return overview.kontikkis
    .filter((row) => row.status === "active")
    .map(mapKontikki)
    .filter((row): row is KilnKontikkiOption => row !== null)
    .sort((a, b) => a.kontikki_code.localeCompare(b.kontikki_code));
}
