/** Compare hardware module IDs ignoring case and separators such as ":" or "-". */
export function moduleIdsMatch(left: string, right: string): boolean {
  const key = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const a = key(left);
  const b = key(right);
  return a.length > 0 && a === b;
}
