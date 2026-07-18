"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MixingEntryReviewStatus, MixingPyrolysisLinkRecord } from "@krishecarbon/shared";
import DataTable from "@/components/table/DataTable";
import StatusBadge from "../production/StatusBadge";
import MixingEntryReviewPanel from "./MixingEntryReviewPanel";
import BiocharRightDrawer, { BIOCHAR_DRAWER_OFFSET_CLASS } from "../BiocharRightDrawer";
import { listMixingEntries } from "./actions";
import {
  formatDateTime,
  formatLinkedBatchLabel,
  formatMaterial,
  formatRatio,
  formatReviewStatus,
  resolveReviewStatus,
  reviewStatusTone,
  type MixingEntryDetail,
  type MixingEntryTableRow,
} from "./mixingLib";

type MixingTableRow = MixingEntryTableRow;

export default function MixingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MixingTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listMixingEntries();
      setRows(
        data.map((entry) => ({
          id: entry.id,
          time: formatDateTime(entry.started_at),
          farm_name: entry.farm_name ?? "—",
          farm_id: entry.farm_id,
          material: formatMaterial(entry),
          ratio: formatRatio(entry.material_to_biochar_ratio),
          operator_name: entry.operator_name,
          pyrolysis_links: entry.pyrolysis_links,
          status: formatReviewStatus(resolveReviewStatus(entry)),
          status_raw: resolveReviewStatus(entry),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mixing entries");
      setRows([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleEntrySubmitted(entry: MixingEntryDetail) {
    const reviewStatus = resolveReviewStatus(entry);
    setRows((current) =>
      current.map((row) =>
        row.id === entry.id
          ? {
              ...row,
              status: formatReviewStatus(reviewStatus),
              status_raw: reviewStatus,
            }
          : row,
      ),
    );
  }

  function renderBatchLinks(links: MixingPyrolysisLinkRecord[]) {
    if (!links.length) return "—";

    return (
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {links.map((link, index) => (
          <span key={link.pyrolysis_batch_id} className="inline-flex items-center">
            <Link
              href={`/biochar/production/${link.pyrolysis_batch_id}`}
              className="font-medium text-brand-dark hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {formatLinkedBatchLabel(link)}
            </Link>
            {index < links.length - 1 ? (
              <span className="ml-2 text-neutral-300">·</span>
            ) : null}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`space-y-4 transition-[margin] duration-300 ease-out ${
        selectedId ? BIOCHAR_DRAWER_OFFSET_CLASS : ""
      }`}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Mixing
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Select a row to review inline, or open an entry on its own page.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load mixing entries: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        selectedRowId={selectedId}
        onRowClick={(row) => setSelectedId(String(row.id))}
        columns={[
          { key: "time", label: "Time" },
          {
            key: "farm_name",
            label: "Farm",
            render: (_value, row) =>
              row.farm_id && row.farm_name !== "—" ? (
                <Link
                  href={`/network/farms/${row.farm_id}`}
                  className="font-medium text-brand-dark hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {row.farm_name}
                </Link>
              ) : (
                row.farm_name
              ),
          },
          { key: "material", label: "Material" },
          { key: "ratio", label: "Ratio" },
          { key: "operator_name", label: "Operator" },
          {
            key: "pyrolysis_links",
            label: "Pyrolysis batches",
            render: (_value, row) => renderBatchLinks(row.pyrolysis_links),
          },
          {
            key: "status",
            label: "Status",
            render: (_value, row) => (
              <StatusBadge
                label={row.status}
                tone={reviewStatusTone(row.status_raw as MixingEntryReviewStatus)}
              />
            ),
          },
        ]}
        rows={rows}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/biochar/mixing/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />

      <BiocharRightDrawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        {selectedId ? (
          <MixingEntryReviewPanel
            key={selectedId}
            entryId={selectedId}
            embedded
            onClose={() => setSelectedId(null)}
            onSubmitted={handleEntrySubmitted}
          />
        ) : null}
      </BiocharRightDrawer>
    </div>
  );
}
