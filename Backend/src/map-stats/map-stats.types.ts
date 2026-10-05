export interface FarmerMapMetricSet {
  climapreneurs: number;
  climapreneurLeads: number;
  farmersOnboarded: number;
  farmerLeads: number;
  /** Acres entered as the farmer's max land at onboarding. */
  declaredAcres: number;
  /** Acres from farm polygons drawn after onboarding. */
  mappedAcres: number;
  farmPolygons: number;
  soilTests: number;
  biomassTons: number;
  biocharProducedTons: number;
  biocharMixedTons: number;
}

export interface FarmerMapClusterStats extends FarmerMapMetricSet {
  id: string;
  name: string;
}

export interface FarmerMapPersonStats extends FarmerMapMetricSet {
  id: string;
  name: string;
  status: string;
  clusters: string[];
}

export interface FarmerMapSupervisorStats {
  id: string;
  name: string;
  status: string;
  clusters: string[];
  /** Climapreneurs assigned to the same clusters. */
  climapreneurNames: string[];
  own: FarmerMapMetricSet;
  withClimapreneurs: FarmerMapMetricSet;
}

export interface FarmerMapStats {
  overall: FarmerMapMetricSet;
  clusters: FarmerMapClusterStats[];
  climapreneurs: FarmerMapPersonStats[];
  supervisors: FarmerMapSupervisorStats[];
}
