"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PAGE_SIZE_OPTIONS } from "@krishecarbon/shared";
import type { DataTableColumn } from "@/types";
import type { DbRow } from "@/types/entities";
import RowsPerPageMenu, { Chevron } from "./RowsPerPageMenu";
import ColumnHeader from "./ColumnHeader";

type SortDir = "asc" | "desc";

/** What the table is showing: page, rows per page, sort and column searches. */
export interface DataTableQuery {
  page: number;
  pageSize: number;
  sortKey: string | null;
  sortDir: SortDir;
  filters: Record<string, string>;
}

/**
 * Server-paged mode: `rows` is already the current page; the table reports
 * page, sort and search changes through `onQueryChange` and the parent fetches.
 */
export interface DataTableServer {
  total: number;
  query: DataTableQuery;
  onQueryChange: (next: DataTableQuery) => void;
}

interface DataTableProps<T extends DbRow = DbRow> {
  columns: DataTableColumn<T>[];
  rows: T[];
  actions?: (row: T) => ReactNode;
  emptyText?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  getRowId?: (row: T) => string;
  server?: DataTableServer;
  /** Rows per page to start with (default 10). */
  initialPageSize?: number;
}

export const DEFAULT_TABLE_QUERY: DataTableQuery = {
  page: 1,
  pageSize: 10,
  sortKey: null,
  sortDir: "asc",
  filters: {},
};

function cellText<T extends DbRow>(col: DataTableColumn<T>, row: T): string {
  if (col.filterValue) return col.filterValue(row);
  const value = row[col.key];
  if (value == null) return "";
  return String(value);
}

function sortKeyValue<T extends DbRow>(col: DataTableColumn<T>, row: T): string | number {
  if (col.sortValue) return col.sortValue(row);
  const text = cellText(col, row);
  const numeric = Number(text);
  return Number.isFinite(numeric) && text.trim() !== "" && text !== "—" && text !== "None"
    ? numeric
    : text.toLowerCase();
}

export default function DataTable<T extends DbRow = DbRow>({
  columns,
  rows,
  actions,
  emptyText = "No data found",
  loading = false,
  onRowClick,
  selectedRowId = null,
  getRowId = (row) => String(row.id ?? ""),
  server,
  initialPageSize = 10,
}: DataTableProps<T>) {
  const [localQuery, setLocalQuery] = useState<DataTableQuery>({
    ...DEFAULT_TABLE_QUERY,
    pageSize: initialPageSize,
  });
  const query = server?.query ?? localQuery;
  // Search boxes update instantly; in server mode the request waits for typing to pause.
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>(query.filters);

  function update(patch: Partial<DataTableQuery>) {
    // Any change other than moving between pages starts again at page 1.
    const next = { ...query, page: 1, ...patch };
    if (server) server.onQueryChange(next);
    else setLocalQuery(next);
  }

  useEffect(() => {
    if (!server) return;
    const same = JSON.stringify(draftFilters) === JSON.stringify(server.query.filters);
    if (same) return;
    const timer = window.setTimeout(() => {
      server.onQueryChange({ ...server.query, page: 1, filters: draftFilters });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftFilters, server]);

  function setFilter(key: string, value: string) {
    const next = { ...draftFilters, [key]: value };
    setDraftFilters(next);
    if (!server) update({ filters: next });
  }

  function toggleSort(key: string) {
    if (query.sortKey === key) {
      update({ sortDir: query.sortDir === "asc" ? "desc" : "asc" });
      return;
    }
    update({ sortKey: key, sortDir: "asc" });
  }

  const processedRows = useMemo(() => {
    if (server) return rows;
    const filtered = rows.filter((row) =>
      columns.every((col) => {
        if (!col.filterable) return true;
        const term = (query.filters[col.key] ?? "").trim().toLowerCase();
        if (!term) return true;
        const text = cellText(col, row).toLowerCase();
        if (col.filterOptions) return text === term;
        return text.includes(term);
      }),
    );
    const col = query.sortKey ? columns.find((item) => item.key === query.sortKey) : null;
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const left = sortKeyValue(col, a);
      const right = sortKeyValue(col, b);
      if (left < right) return query.sortDir === "asc" ? -1 : 1;
      if (left > right) return query.sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [server, rows, columns, query.filters, query.sortKey, query.sortDir]);

  const total = server ? server.total : processedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const visibleRows = server
    ? processedRows
    : processedRows.slice((page - 1) * query.pageSize, page * query.pageSize);

  function goToPage(next: number) {
    const target = Math.min(Math.max(1, next), pageCount);
    if (server) server.onQueryChange({ ...query, page: target });
    else setLocalQuery({ ...query, page: target });
  }

  const colSpan = columns.length + (actions ? 1 : 0);
  const activeFilters = columns.flatMap((col) => {
    const value = (draftFilters[col.key] ?? "").trim();
    if (!col.filterable || !value) return [];
    const shown = col.filterOptions?.find((option) => option.value === value)?.label ?? value;
    return [{ key: col.key, label: col.label, value: shown }];
  });

  return (
    <div className="space-y-3">
      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {activeFilters.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-1 pl-3 pr-1.5"
            >
              <span className="text-text-secondary">{item.label}:</span>
              <span className="font-medium text-neutral-900">{item.value}</span>
              <button
                type="button"
                onClick={() => setFilter(item.key, "")}
                aria-label={`Remove ${item.label} search`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                ✕
              </button>
            </span>
          ))}
          {activeFilters.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                const cleared: Record<string, string> = {};
                setDraftFilters(cleared);
                if (!server) update({ filters: cleared });
              }}
              className="font-medium text-brand-dark hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-neutral-200 bg-white">
              <tr>
                {columns.map((col) => {
                  const sortable = col.sortable ?? Boolean(col.filterable);
                  const active = query.sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={
                        sortable
                          ? active
                            ? query.sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                      className="px-4 py-3 text-left align-middle text-sm font-medium text-text-secondary"
                    >
                      <ColumnHeader
                        label={col.label}
                        sort={
                          sortable
                            ? {
                                state: active ? query.sortDir : null,
                                onToggle: () => toggleSort(col.key),
                              }
                            : undefined
                        }
                        filter={
                          col.filterable
                            ? {
                                value: draftFilters[col.key] ?? "",
                                onChange: (value) => setFilter(col.key, value),
                                placeholder: col.filterPlaceholder,
                                options: col.filterOptions,
                              }
                            : undefined
                        }
                      />
                    </th>
                  );
                })}
                {actions && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-right align-middle text-sm font-medium text-text-secondary"
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-text-secondary">
                    Loading…
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-text-secondary">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, idx) => {
                  const rowId = getRowId(row);
                  const isSelected = selectedRowId != null && rowId === selectedRowId;
                  return (
                    <tr
                      key={rowId || idx}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={[
                        onRowClick ? "cursor-pointer" : "",
                        isSelected ? "bg-brand-dark/5" : "hover:bg-neutral-50",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="px-4 py-4 text-sm text-neutral-800"
                          onClick={(event) => {
                            if (col.key === "producer") event.stopPropagation();
                          }}
                        >
                          {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "-")}
                        </td>
                      ))}
                      {actions && (
                        <td
                          className="px-4 py-4 text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {actions(row)}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-sm text-neutral-700">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary">Rows per page</span>
          <RowsPerPageMenu
            value={query.pageSize}
            options={PAGE_SIZE_OPTIONS}
            onChange={(pageSize) => update({ pageSize })}
          />
        </div>
        <span className="tabular-nums text-text-secondary">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
            aria-label="Previous page"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-800 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30"
          >
            <Chevron direction="left" className="h-5 w-5" />
          </button>
          <span className="min-w-[6.5rem] text-center tabular-nums">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount || loading}
            aria-label="Next page"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-800 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30"
          >
            <Chevron direction="right" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
