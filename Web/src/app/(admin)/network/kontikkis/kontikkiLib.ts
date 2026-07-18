/** Frustum volume in liters from top/bottom diameter (cm) and depth (cm). */
export function calcKontikkiCapacityLiters(
  topCm: number,
  bottomCm: number,
  depthCm: number,
): number | null {
  if (!topCm || !bottomCm || !depthCm) return null;

  const topRadiusM = topCm / 200;
  const bottomRadiusM = bottomCm / 200;
  const depthM = depthCm / 100;
  const volumeM3 =
    ((Math.PI * depthM) / 3) *
    (topRadiusM ** 2 + topRadiusM * bottomRadiusM + bottomRadiusM ** 2);

  return volumeM3 * 1000;
}

export function formatKontikkiCapacity(capacity: number | null | undefined): string {
  if (capacity == null || Number.isNaN(capacity)) return "—";
  return `${capacity.toLocaleString(undefined, { maximumFractionDigits: 2 })} l`;
}

export function resolveKontikkiCapacity(row: {
  capacity?: number | string | null;
  top_diameter_cm?: number | string | null;
  bottom_diameter_cm?: number | string | null;
  depth_cm?: number | string | null;
}): number | null {
  if (row.capacity != null && row.capacity !== "") {
    const stored = Number(row.capacity);
    if (!Number.isNaN(stored)) return stored;
  }

  return calcKontikkiCapacityLiters(
    Number(row.top_diameter_cm),
    Number(row.bottom_diameter_cm),
    Number(row.depth_cm),
  );
}
