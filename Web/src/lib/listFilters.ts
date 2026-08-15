export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesSearch(
  query: string,
  ...parts: (string | null | undefined)[]
): boolean {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;
  return parts.some((part) => (part ?? "").toLowerCase().includes(normalized));
}

export function matchesAllSearchTerms(
  terms: string[],
  ...parts: (string | null | undefined)[]
): boolean {
  if (terms.length === 0) return true;
  return terms.every((term) => matchesSearch(term, ...parts));
}

export function hasActiveListFilters(
  searchTerms: string[] | string,
  ...filterValues: string[]
): boolean {
  const terms = Array.isArray(searchTerms) ? searchTerms : [searchTerms];
  return (
    terms.some((term) => normalizeSearchQuery(term).length > 0) ||
    filterValues.some((value) => value.length > 0)
  );
}
