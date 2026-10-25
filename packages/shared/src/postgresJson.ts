/**
 * Postgres text and jsonb cannot store a null character (`\u0000`) or a
 * broken surrogate pair. Camera EXIF often contains both, and a sync that
 * includes them fails with "unsupported Unicode escape sequence".
 */
export function toPostgresJson<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return stripUnsafeText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = stripUnsafeText(key);
      if (!safeKey) continue;
      out[safeKey] = walk(child);
    }
    return out;
  }
  return value;
}

function stripUnsafeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) continue;
    const high = code >= 0xd800 && code <= 0xdbff;
    const low = code >= 0xdc00 && code <= 0xdfff;
    if (high) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i] + value[i + 1];
        i++;
      }
      continue;
    }
    if (low) continue;
    out += value[i];
  }
  return out;
}
