"use client";

import Link from "next/link";
import type {
  MixingEntryReviewStatus,
  PyrolysisBatchMixingEntrySummary,
} from "@krishecarbon/shared";
import {
  formatDateTime,
  formatMaterial,
  formatRatio,
  formatReviewStatus,
  reviewStatusTone,
} from "../mixing/mixingLib";
import StatusBadge from "./StatusBadge";

export default function PyrolysisBatchMixingSection({
  entries,
}: {
  entries: PyrolysisBatchMixingEntrySummary[];
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
        Mixing
      </h3>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          This batch has not been used in any mixing entries yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-medium text-neutral-500">
                <th className="pb-2 pr-4 font-medium">Time</th>
                <th className="pb-2 pr-4 font-medium">Farm</th>
                <th className="pb-2 pr-4 font-medium">Material</th>
                <th className="pb-2 pr-4 font-medium">Ratio</th>
                <th className="pb-2 pr-4 font-medium">Operator</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="text-neutral-900">
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    {formatDateTime(entry.started_at)}
                  </td>
                  <td className="py-2.5 pr-4">
                    {entry.farm_id && entry.farm_name ? (
                      <Link
                        href={`/network/farms/${entry.farm_id}`}
                        className="font-medium text-brand-dark hover:underline"
                      >
                        {entry.farm_name}
                      </Link>
                    ) : (
                      entry.farm_name ?? "—"
                    )}
                  </td>
                  <td className="py-2.5 pr-4">{formatMaterial(entry)}</td>
                  <td className="py-2.5 pr-4">
                    {formatRatio(entry.material_to_biochar_ratio)}
                  </td>
                  <td className="py-2.5 pr-4">{entry.operator_name}</td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge
                      label={formatReviewStatus(entry.review_status)}
                      tone={reviewStatusTone(
                        entry.review_status as MixingEntryReviewStatus,
                      )}
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <Link
                      href={`/biochar/mixing/${entry.id}`}
                      className="font-medium text-brand-dark hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
