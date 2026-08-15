"use client";

import { useCallback, useState } from "react";
import { normalizeSearchQuery } from "@/lib/listFilters";

export function useSearchFilterChips() {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchFilters, setSearchFilters] = useState<string[]>([]);

  const addSearchFilter = useCallback((raw: string) => {
    const term = raw.trim();
    if (!term) return;

    setSearchFilters((current) => {
      const normalized = normalizeSearchQuery(term);
      if (current.some((filter) => normalizeSearchQuery(filter) === normalized)) {
        return current;
      }
      return [...current, term];
    });
    setSearchDraft("");
  }, []);

  const removeSearchFilter = useCallback((term: string) => {
    setSearchFilters((current) => current.filter((filter) => filter !== term));
  }, []);

  const clearSearchFilters = useCallback(() => {
    setSearchFilters([]);
    setSearchDraft("");
  }, []);

  return {
    searchDraft,
    setSearchDraft,
    searchFilters,
    addSearchFilter,
    removeSearchFilter,
    clearSearchFilters,
  };
}
