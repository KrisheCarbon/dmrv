export interface FieldActivityCounts {
  /** Farmer profiles registered in the period. */
  farmers: number;
  /** Registered farmers who still have no farm plot. */
  farmersInfoOnly: number;
  /** Registered farmers who have at least one farm plot. */
  farmersWithFarm: number;
  /** Farm plots recorded in the period. */
  farms: number;
  consents: number;
  /** Soil samples collected in the period. */
  soilTests: number;
  /** Soil reports received in the period. */
  soilReports: number;
}

export interface FieldActivityEntry {
  kind: 'farmer' | 'farm' | 'consent' | 'soil' | 'soilReport';
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

/** company is every KriSHE entry and is only available to admins and managers. */
export type FieldActivityScope =
  | 'company'
  | 'team'
  | 'me'
  | 'climapreneurs'
  | 'supervisors'
  | 'cluster';

export interface FieldActivityStats {
  role: string;
  from: string | null;
  to: string | null;
  clusters: FieldActivityCluster[];
  /** Null means every cluster this user is allowed to see. */
  clusterId: string | null;
  /** A single person, when the totals are limited to what they entered. */
  userId: string | null;
  scope: FieldActivityScope;
  totals: FieldActivityCounts;
  /** Entries the signed-in supervisor made. Null when the team list already includes them. */
  self: FieldActivityPerson | null;
  /** Climapreneurs on this supervisor's clusters. Empty for admins and managers. */
  climapreneurs: FieldActivityPerson[];
  admins: FieldActivityPerson[];
  managers: FieldActivityPerson[];
  /** Each supervisor and the climapreneurs on the same clusters. */
  teams: FieldActivityTeam[];
  /** Climapreneurs who are not on any supervisor's clusters. */
  unassignedClimapreneurs: FieldActivityPerson[];
  latest: FieldActivityEntry[];
}
