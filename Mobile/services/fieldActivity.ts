import { backendFetch } from "./backendApi";

export interface FieldActivityCounts {
  farmers: number;
  farmersInfoOnly: number;
  farmersWithFarm: number;
  farms: number;
  consents: number;
  soilTests: number;
  soilReports: number;
}

export interface FieldActivityEntry {
  kind: "farmer" | "farm" | "consent" | "soil" | "soilReport";
  id: string;
  farmerName: string;
  detail: string | null;
  enteredAt: string;
  enteredByName: string;
}

export interface FieldActivityPerson {
  id: string;
  name: string;
  role: string;
  counts: FieldActivityCounts;
  lastEnteredAt: string | null;
  recent: FieldActivityEntry[];
}

export interface FieldActivityTeam {
  supervisor: FieldActivityPerson;
  climapreneurs: FieldActivityPerson[];
  totals: FieldActivityCounts;
}

export interface FieldActivityCluster {
  id: string;
  name: string;
}

export type FieldActivityScope =
  | "company"
  | "team"
  | "me"
  | "climapreneurs"
  | "supervisors"
  | "cluster";

export interface FieldActivityStats {
  role: string;
  from: string | null;
  to: string | null;
  clusters: FieldActivityCluster[];
  clusterId: string | null;
  userId: string | null;
  scope: FieldActivityScope;
  totals: FieldActivityCounts;
  self: FieldActivityPerson | null;
  climapreneurs: FieldActivityPerson[];
  admins: FieldActivityPerson[];
  managers: FieldActivityPerson[];
  teams: FieldActivityTeam[];
  unassignedClimapreneurs: FieldActivityPerson[];
  latest: FieldActivityEntry[];
}

export function fetchFieldActivity(
  from?: string,
  to?: string,
  filter?: { clusterId?: string; scope?: string; userId?: string },
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (filter?.clusterId) params.set("clusterId", filter.clusterId);
  if (filter?.scope) params.set("scope", filter.scope);
  if (filter?.userId) params.set("userId", filter.userId);
  const query = params.toString();
  return backendFetch<FieldActivityStats>(
    `/mobile-stats/field-activity${query ? `?${query}` : ""}`,
  );
}
