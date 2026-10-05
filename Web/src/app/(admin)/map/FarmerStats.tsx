"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { getFarmerMapStats } from "./actions";
import type {
  FarmerMapMetricSet,
  FarmerMapStats,
} from "./stats-types";

const OVERALL_CARDS: Array<{
  key: keyof FarmerMapMetricSet;
  label: string;
  hint: string;
}> = [
  {
    key: "climapreneurs",
    label: "Climapreneurs",
    hint: "Active accounts",
  },
  {
    key: "climapreneurLeads",
    label: "Climapreneur leads",
    hint: "Invited, not signed in yet",
  },
  {
    key: "farmersOnboarded",
    label: "Farmers onboarded",
    hint: "Profile plus at least one farm polygon",
  },
  {
    key: "farmerLeads",
    label: "Farmer leads",
    hint: "Profile saved, farm polygon still missing",
  },
  {
    key: "declaredAcres",
    label: "Farmer land",
    hint: "Max acres entered at farmer onboarding",
  },
  {
    key: "mappedAcres",
    label: "Mapped acres",
    hint: "Acres drawn on farm polygons",
  },
  {
    key: "farmPolygons",
    label: "Farm polygons",
    hint: "Farm plots with a drawn area",
  },
  {
    key: "soilTests",
    label: "Soil tests",
    hint: "Samples recorded",
  },
  {
    key: "biomassTons",
    label: "Biomass",
    hint: "Estimated tonnes from farmer crops",
  },
  {
    key: "biocharProducedTons",
    label: "Biochar produced",
    hint: "Dry tonnes from submitted pyrolysis",
  },
  {
    key: "biocharMixedTons",
    label: "Biochar mixed",
    hint: "Dry tonnes of batches linked to mixing",
  },
];

const WORK_KEYS = [
  "farmersOnboarded",
  "farmerLeads",
  "declaredAcres",
  "mappedAcres",
  "farmPolygons",
  "soilTests",
  "biomassTons",
  "biocharProducedTons",
  "biocharMixedTons",
] as const satisfies ReadonlyArray<keyof FarmerMapMetricSet>;

const WORK_LABELS: Record<(typeof WORK_KEYS)[number], string> = {
  farmersOnboarded: "Farmers",
  farmerLeads: "Farmer leads",
  declaredAcres: "Farmer land (ac)",
  mappedAcres: "Mapped acres",
  farmPolygons: "Polygons",
  soilTests: "Soil tests",
  biomassTons: "Biomass (t)",
  biocharProducedTons: "Produced (t)",
  biocharMixedTons: "Mixed (t)",
};

const AMOUNT_KEYS = new Set<keyof FarmerMapMetricSet>([
  "declaredAcres",
  "mappedAcres",
  "biomassTons",
  "biocharProducedTons",
  "biocharMixedTons",
]);

function formatCount(value: number) {
  return value.toLocaleString("en-IN");
}

function formatAmount(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function formatMetric(key: keyof FarmerMapMetricSet, value: number) {
  return AMOUNT_KEYS.has(key) ? formatAmount(value) : formatCount(value);
}

function cardValue(key: keyof FarmerMapMetricSet, value: number) {
  if (!AMOUNT_KEYS.has(key)) return formatCount(value);
  const unit = key === "declaredAcres" || key === "mappedAcres" ? "ac" : "t";
  return `${formatAmount(value)} ${unit}`;
}

function matchesQuery(query: string, parts: Array<string | null | undefined>) {
  if (!query) return true;
  return parts.some((part) => part?.toLowerCase().includes(query));
}

function StatusBadge({ status }: { status: string }) {
  if (status !== "pending_auth") return null;
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      Lead
    </span>
  );
}

function MetricCells({ metrics }: { metrics: FarmerMapMetricSet }) {
  return (
    <>
      {WORK_KEYS.map((key) => (
        <td key={key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-800">
          {formatMetric(key, metrics[key])}
        </td>
      ))}
    </>
  );
}

export default function FarmerStats({ onShowMap }: { onShowMap: () => void }) {
  const [stats, setStats] = useState<FarmerMapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getFarmerMapStats();
    if (result.error || result.data == null) {
      setStats(null);
      setError(result.error || "Failed to load farmer stats");
    } else {
      setStats(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const clusters = useMemo(
    () =>
      (stats?.clusters ?? []).filter((row) =>
        matchesQuery(needle, [row.name]),
      ),
    [needle, stats],
  );
  const climapreneurs = useMemo(
    () =>
      (stats?.climapreneurs ?? []).filter((row) =>
        matchesQuery(needle, [row.name, ...row.clusters]),
      ),
    [needle, stats],
  );
  const supervisors = useMemo(
    () =>
      (stats?.supervisors ?? []).filter((row) =>
        matchesQuery(needle, [
          row.name,
          ...row.clusters,
          ...row.climapreneurNames,
        ]),
      ),
    [needle, stats],
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl Sbold tracking-tight text-gray-900">Stats</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Farmer land is the max area entered when the farmer was onboarded.
            Mapped acres and polygons are the farm plots drawn after that.
            Climapreneur leads are invited accounts that have not signed in.
            Farmer leads are profiles saved without a farm polygon yet.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs Smedium text-gray-800 hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onShowMap}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs Smedium text-gray-800 hover:bg-gray-50"
          >
            Map
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading farmer stats…</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {stats ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {OVERALL_CARDS.map((card) => (
              <div
                key={card.key}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm"
              >
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="mt-1 text-2xl Sbold tabular-nums text-gray-900">
                  {cardValue(card.key, stats.overall[card.key])}
                </p>
                <p className="mt-1 text-xs text-gray-400">{card.hint}</p>
              </div>
            ))}
          </section>

          <label className="block max-w-md">
            <span className="sr-only">Search stats</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cluster, climapreneur, or supervisor"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-dark focus:ring-2 focus:ring-brand-dark/20"
            />
          </label>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg Sbold text-gray-900">Clusters</h2>
              <p className="mt-1 text-sm text-gray-500">
                Farmer land is the sum of each farmer&apos;s max area in the cluster.
                Polygons are the farm plots onboarded there. Biochar produced is
                pyrolysis recorded by people assigned to the cluster, so someone
                on two clusters is counted in both.
              </p>
            </div>
            <StatsTable
              empty="No clusters match this search."
              head={
                <tr>
                  <th className="px-3 py-2 text-left">Cluster</th>
                  <th className="px-3 py-2 text-right">Climapreneurs</th>
                  <th className="px-3 py-2 text-right">Climapreneur leads</th>
                  {WORK_KEYS.map((key) => (
                    <th key={key} className="px-3 py-2 text-right">
                      {WORK_LABELS[key]}
                    </th>
                  ))}
                </tr>
              }
            >
              {clusters.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 Smedium text-gray-900">
                    {row.id === "__unassigned__" ? (
                      row.name
                    ) : (
                      <Link
                        href={`/network/clusters/${row.id}`}
                        className="text-brand-dark hover:underline"
                      >
                        {row.name}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(row.climapreneurs)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(row.climapreneurLeads)}
                  </td>
                  <MetricCells metrics={row} />
                </tr>
              ))}
            </StatsTable>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg Sbold text-gray-900">Climapreneurs</h2>
              <p className="mt-1 text-sm text-gray-500">
                Each row is the farmers, land, samples, biomass, and biochar
                recorded by that climapreneur.
              </p>
            </div>
            <StatsTable
              empty="No climapreneurs match this search."
              head={
                <tr>
                  <th className="px-3 py-2 text-left">Climapreneur</th>
                  <th className="px-3 py-2 text-left">Clusters</th>
                  {WORK_KEYS.map((key) => (
                    <th key={key} className="px-3 py-2 text-right">
                      {WORK_LABELS[key]}
                    </th>
                  ))}
                </tr>
              }
            >
              {climapreneurs.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/network/climapreneurs/${row.id}`}
                        className="Smedium text-brand-dark hover:underline"
                      >
                        {row.name}
                      </Link>
                      <StatusBadge status={row.status} />
                    </span>
                  </td>
                  <td className="max-w-56 px-3 py-2 text-gray-600">
                    {row.clusters.length > 0 ? row.clusters.join(", ") : "—"}
                  </td>
                  <MetricCells metrics={row} />
                </tr>
              ))}
            </StatsTable>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg Sbold text-gray-900">Supervisors</h2>
              <p className="mt-1 text-sm text-gray-500">
                Own work is what the supervisor recorded. Own + climapreneurs
                adds climapreneurs assigned to the same clusters. A climapreneur
                on more than one supervisor&apos;s clusters is included in each
                of those team totals.
              </p>
            </div>
            <StatsTable
              empty="No supervisors match this search."
              head={
                <tr>
                  <th className="px-3 py-2 text-left">Supervisor</th>
                  <th className="px-3 py-2 text-left">Scope</th>
                  <th className="px-3 py-2 text-right">Climapreneurs</th>
                  <th className="px-3 py-2 text-right">Climapreneur leads</th>
                  {WORK_KEYS.map((key) => (
                    <th key={key} className="px-3 py-2 text-right">
                      {WORK_LABELS[key]}
                    </th>
                  ))}
                </tr>
              }
            >
              {supervisors.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-2 align-top" rowSpan={2}>
                      <span className="inline-flex items-center gap-2">
                        <span className="Smedium text-gray-900">{row.name}</span>
                        <StatusBadge status={row.status} />
                      </span>
                      <p className="mt-1 max-w-56 text-xs text-gray-500">
                        {row.clusters.length > 0 ? row.clusters.join(", ") : "No cluster"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">Own</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">—</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">—</td>
                    <MetricCells metrics={row.own} />
                  </tr>
                  <tr className="border-t border-gray-50 bg-gray-50/70">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      Own + climapreneurs
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCount(row.withClimapreneurs.climapreneurs)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCount(row.withClimapreneurs.climapreneurLeads)}
                    </td>
                    <MetricCells metrics={row.withClimapreneurs} />
                  </tr>
                </Fragment>
              ))}
            </StatsTable>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatsTable({
  head,
  children,
  empty,
}: {
  head: ReactNode;
  children: ReactNode;
  empty: string;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
          {head}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-sm text-gray-500" colSpan={16}>
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
