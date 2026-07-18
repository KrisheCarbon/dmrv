"use client";

import type { ReactNode } from "react";
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
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 pt-2 pb-3 text-left text-[11px] uppercase tracking-wide text-gray-600 font-medium"
                >
                  {col.label}
                </th>
              ))}

              {actions && (
                <th className="px-4 pt-2 pb-3 text-right text-[11px] uppercase tracking-wide text-gray-600 font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  {emptyText}
                </td>
              </tr>
            )}

            {rows.map((row, idx) => {
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
