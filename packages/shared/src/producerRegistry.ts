export const PRODUCER_REGISTRIES = ["csi", "rainbow", "both"] as const;

export type ProducerRegistry = (typeof PRODUCER_REGISTRIES)[number];

/** New producers must pick CSI or Rainbow. "both" is legacy-only. */
export const ASSIGNABLE_PRODUCER_REGISTRIES = ["csi", "rainbow"] as const;

export type AssignableProducerRegistry =
  (typeof ASSIGNABLE_PRODUCER_REGISTRIES)[number];

export const PYROLYSIS_PROTOCOLS = ["csi", "rainbow"] as const;

export type PyrolysisProtocol = (typeof PYROLYSIS_PROTOCOLS)[number];

export function isProducerRegistry(value: unknown): value is ProducerRegistry {
  return (
    typeof value === "string" &&
    (PRODUCER_REGISTRIES as readonly string[]).includes(value)
  );
}

export function isAssignableProducerRegistry(
  value: unknown,
): value is AssignableProducerRegistry {
  return (
    typeof value === "string" &&
    (ASSIGNABLE_PRODUCER_REGISTRIES as readonly string[]).includes(value)
  );
}

export function pyrolysisProtocolForRegistry(
  registry?: string | null,
): PyrolysisProtocol {
  if (registry === "rainbow" || registry === "both") return "rainbow";
  return "csi";
}

export function producerRegistryLabel(registry?: string | null): string {
  if (registry === "csi") return "CSI";
  if (registry === "rainbow") return "Rainbow";
  if (registry === "both") return "CSI + Rainbow";
  return "CSI";
}
