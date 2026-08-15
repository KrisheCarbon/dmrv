"use client";

import type { KeyboardEvent } from "react";

export interface ListFilterSelect {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface ListToolbarProps {
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  searchFilters: string[];
  onAddSearchFilter: (term: string) => void;
  onRemoveSearchFilter: (term: string) => void;
  onClearSearchFilters?: () => void;
  searchPlaceholder?: string;
  filters?: ListFilterSelect[];
  filteredCount?: number;
  totalCount?: number;
}

const selectClassName =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark";

export default function ListToolbar({
  searchDraft,
  onSearchDraftChange,
  searchFilters,
  onAddSearchFilter,
  onRemoveSearchFilter,
  onClearSearchFilters,
  searchPlaceholder = "Type and press Enter to add a filter…",
  filters = [],
  filteredCount,
  totalCount,
}: ListToolbarProps) {
  const showCount =
    totalCount != null &&
    filteredCount != null &&
    (filteredCount !== totalCount || searchFilters.length > 0);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onAddSearchFilter(searchDraft);
      return;
    }

    if (
      event.key === "Backspace" &&
      !searchDraft &&
      searchFilters.length > 0
    ) {
      onRemoveSearchFilter(searchFilters[searchFilters.length - 1]!);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-full min-w-[14rem] max-w-xl space-y-1.5">
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 focus-within:border-brand-dark focus-within:ring-1 focus-within:ring-brand-dark">
            {searchFilters.map((term) => (
              <span
                key={term}
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-dark/10 py-0.5 pl-2 pr-1 text-xs font-medium text-brand-dark"
              >
                <span className="truncate">{term}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSearchFilter(term)}
                  className="rounded p-0.5 text-brand-dark/70 hover:bg-brand-dark/10 hover:text-brand-dark"
                  aria-label={`Remove filter "${term}"`}
                >
                  ×
                </button>
              </span>
            ))}

            <input
              type="search"
              placeholder={
                searchFilters.length > 0
                  ? "Add another filter…"
                  : searchPlaceholder
              }
              className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0"
              value={searchDraft}
              onChange={(event) => onSearchDraftChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          {searchFilters.length > 0 && onClearSearchFilters ? (
            <button
              type="button"
              onClick={onClearSearchFilters}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
            >
              Clear search filters
            </button>
          ) : null}
        </div>

        {filters.map((filter) => (
          <label key={filter.id} className="flex items-center gap-2">
            <span className="sr-only">{filter.label}</span>
            <select
              aria-label={filter.label}
              className={selectClassName}
              value={filter.value}
              onChange={(event) => filter.onChange(event.target.value)}
            >
              {filter.options.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {showCount ? (
        <p className="text-xs text-neutral-500">
          Showing {filteredCount} of {totalCount}
        </p>
      ) : null}
    </div>
  );
}
