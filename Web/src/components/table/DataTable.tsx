"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { DataTableColumn } from "@/types";
import type { DbRow } from "@/types/entities";

interface DataTableProps<T extends DbRow = DbRow> {
  columns: DataTableColumn<T>[];
  rows: T[];
  actions?: (row: T) => ReactNode;
  emptyText?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  getRowId?: (row: T) => string;
}

type SortDir = "asc" | "desc";

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
}: DataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) =>
      columns.every((col) => {
        if (!col.filterable) return true;
        const query = (filters[col.key] ?? "").trim().toLowerCase();
        if (!query) return true;
        const text = cellText(col, row).toLowerCase();
        if (col.filterOptions) return text === query;
        return text.includes(query);
      }),
    );

    if (!sortKey) return filtered;
    const col = columns.find((item) => item.key === sortKey);
    if (!col) return filtered;

    return [...filtered].sort((a, b) => {
      const left = sortKeyValue(col, a);
      const right = sortKeyValue(col, b);
      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [columns, filters, rows, sortDir, sortKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {columns.map((col) => {
                const sortable = col.sortable ?? Boolean(col.filterable);
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className="px-4 pt-2 pb-3 text-left text-[11px] uppercase tracking-wide text-gray-600 font-medium align-bottom"
                  >
                    <div className="flex min-w-[9rem] flex-col gap-1.5">
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1 text-left uppercase tracking-wide hover:text-neutral-950"
                        >
                          {col.label}
                          <span className="text-[10px] text-neutral-400">
                            {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        <span>{col.label}</span>
                      )}
                      {col.filterable ? (
                        col.filterOptions ? (
                          <select
                            value={filters[col.key] ?? ""}
                            onChange={(event) =>
                              setFilters((prev) => ({
                                ...prev,
                                [col.key]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px] font-normal normal-case tracking-normal text-neutral-700"
                          >
                            <option value="">All</option>
                            {col.filterOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={filters[col.key] ?? ""}
                            onChange={(event) =>
                              setFilters((prev) => ({
                                ...prev,
                                [col.key]: event.target.value,
                              }))
                            }
                            placeholder={col.filterPlaceholder || "Search"}
                            className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px] font-normal normal-case tracking-normal text-neutral-700"
                          />
                        )
                      ) : null}
                    </div>
                  </th>
                );
              })}

              {actions && (
                <th className="px-4 pt-2 pb-3 text-right text-[11px] uppercase tracking-wide text-gray-600 font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  {emptyText}
                </td>
              </tr>
            )}

            {visibleRows.map((row, idx) => {
              const rowId = getRowId(row);
              const isSelected = selectedRowId != null && rowId === selectedRowId;

              return (
                <tr
                  key={rowId || idx}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={[
                    onRowClick ? "cursor-pointer" : "",
                    isSelected ? "bg-brand-dark/5" : "hover:bg-slate-50",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-sm text-gray-700"
                      onClick={(event) => {
                        if (col.key === "producer") event.stopPropagation();
                      }}
                    >
                      {col.render
                        ? col.render(row[col.key], row)
                        : String(row[col.key] ?? "-")}
                    </td>
                  ))}

                  {actions && (
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {actions(row)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
