/**
 * When a farmer, farm, or soil row is edited, the previous values stay in
 * `edit_history` and the main row becomes the new values.
 * Each item is `{ at, by, previous }`.
 */

export function changedPrevious(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === 'edit_history' || key === 'updated_at') continue;
    if (patch[key] === undefined) continue;
    const before = existing[key] ?? null;
    const after = patch[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      previous[key] = before;
    }
  }
  return Object.keys(previous).length > 0 ? previous : null;
}

export function historyForPatch(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  userId: string,
  extraPrevious?: Record<string, unknown>,
): unknown[] | undefined {
  if (!existing) return undefined;
  const previous: Record<string, unknown> = {
    ...(changedPrevious(existing, patch) ?? {}),
  };
  for (const [key, value] of Object.entries(extraPrevious ?? {})) {
    if (!(key in previous)) previous[key] = value;
  }
  if (Object.keys(previous).length === 0) return undefined;
  const history = Array.isArray(existing.edit_history)
    ? [...existing.edit_history]
    : [];
  history.push({
    at: new Date().toISOString(),
    by: userId,
    previous,
  });
  return history;
}
