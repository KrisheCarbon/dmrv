/** Each app module has its own Supabase storage bucket for its media/files. */
export const MODULE_STORAGE_BUCKETS = {
  pyrolysis: "pyrolysis",
  mixing: "mixing",
  application: "application",
  trainings: "trainings",
  farmersNetwork: "farmer-network-photos",
  soilReports: "soil-reports",
} as const;

export type ModuleStorageBucket = keyof typeof MODULE_STORAGE_BUCKETS;

export function getModuleBucket(module: ModuleStorageBucket): string {
  return MODULE_STORAGE_BUCKETS[module];
}
