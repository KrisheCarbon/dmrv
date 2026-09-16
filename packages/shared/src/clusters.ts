/** Cluster coverage and the villages field staff may onboard farmers from. */

export interface ClusterVillageInput {
  id?: string;
  village_name: string;
  mandal: string;
  district: string;
  state: string;
}

export interface ClusterVillageRecord {
  id: string;
  cluster_id: string;
  cluster_name: string;
  village_name: string;
  mandal?: string | null;
  district?: string | null;
  state?: string | null;
}

export function villagePlaceLine(village: {
  mandal?: string | null;
  district?: string | null;
  state?: string | null;
}): string {
  return [village.mandal, village.district, village.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
}

export function villageSearchText(village: ClusterVillageRecord): string {
  return [
    village.village_name,
    village.mandal,
    village.district,
    village.state,
    village.cluster_name,
  ]
    .map((part) => part?.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function matchClusterVillage(
  villages: ClusterVillageRecord[],
  farmer: {
    cluster_village_id?: string | null;
    village?: string | null;
    mandal?: string | null;
    district?: string | null;
    state?: string | null;
  },
): ClusterVillageRecord | null {
  if (villages.length === 0) return null;
  const byId = farmer.cluster_village_id?.trim();
  if (byId) {
    const match = villages.find((village) => village.id === byId);
    if (match) return match;
  }

  const name = farmer.village?.trim().toLowerCase();
  if (!name) return null;

  const named = villages.filter(
    (village) => village.village_name.trim().toLowerCase() === name,
  );
  if (named.length === 1) return named[0];

  const mandal = farmer.mandal?.trim().toLowerCase();
  const district = farmer.district?.trim().toLowerCase();
  const state = farmer.state?.trim().toLowerCase();
  const tighter = named.find((village) => {
    const sameMandal =
      !mandal || village.mandal?.trim().toLowerCase() === mandal;
    const sameDistrict =
      !district || village.district?.trim().toLowerCase() === district;
    const sameState = !state || village.state?.trim().toLowerCase() === state;
    return sameMandal && sameDistrict && sameState;
  });
  return tighter ?? null;
}
