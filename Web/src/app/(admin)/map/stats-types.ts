export interface FarmerMapMetricSet {
  climapreneurs: number;
  climapreneurLeads: number;
  farmersOnboarded: number;
  farmerLeads: number;
  declaredAcres: number;
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
