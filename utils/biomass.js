import { BIOMASS_FACTOR } from "../constants/crops";

export function calculateEstimatedBiomass(crops) {
  if (!Array.isArray(crops) || crops.length === 0) return 0;

  return crops.reduce(
    (sum, crop) => sum + Number(crop.crop_area || 0) * BIOMASS_FACTOR,
    0
  );
}
