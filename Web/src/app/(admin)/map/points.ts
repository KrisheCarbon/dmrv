export interface MapFarmPoint {
  id: string;
  farmId: string;
  farmerName: string;
  fieldCode: string;
  latitude: number;
  longitude: number;
  areaAcres: number | null;
  cropName: string | null;
  place: string;
}
