"use client";

import { useMemo, useState } from "react";
import {
  villagePlaceLine,
  villageSearchText,
  type ClusterVillageRecord,
} from "@krishecarbon/shared";

interface ClusterVillagePickerProps {
  villages: ClusterVillageRecord[];
  valueId: string;
  loading?: boolean;
  emptyText?: string;
  onChange: (village: ClusterVillageRecord | null) => void;
}

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";

function groupedVillages(villages: ClusterVillageRecord[]) {
  const map = new Map<string, ClusterVillageRecord[]>();
  for (const village of villages) {
    const key = village.cluster_name || "Unassigned cluster";
    const list = map.get(key) ?? [];
    list.push(village);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function ClusterVillagePicker({
  villages,
  valueId,
  loading = false,
  emptyText = "No cluster villages available.",
  onChange,
}: ClusterVillagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = villages.find((village) => village.id === valueId) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return villages;
    return villages.filter((village) =>
      villageSearchText(village).includes(needle),
    );
  }, [query, villages]);
  const groups = useMemo(() => groupedVillages(filtered), [filtered]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen((current) => !current)}
        className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:opacity-60`}
      >
        <span className={selected ? "text-neutral-900" : "text-neutral-400"}>
          {loading
            ? "Loading villages..."
            : selected
              ? selected.village_name
              : "Select village"}
        </span>
        <span className="text-neutral-400">▾</span>
      </button>

      {selected ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-neutral-900">
              {selected.village_name}
            </p>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200">
              {selected.cluster_name}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {villagePlaceLine(selected) || "Location not recorded"}
          </p>
        </div>
      ) : null}

      {open ? (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-2">
            <input
              autoFocus
              className="w-full rounded-lg bg-neutral-50 px-3 py-2 text-sm outline-none placeholder:text-neutral-400"
              placeholder="Search village, block, district, state, or cluster"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {villages.length === 0 ? (
              <p className="px-3 py-4 text-sm text-neutral-500">{emptyText}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-neutral-500">
                No villages match that search.
              </p>
            ) : (
              groups.map(([clusterName, items]) => (
                <div key={clusterName} className="py-1">
                  <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                    {clusterName}
                  </p>
                  {items.map((village) => {
                    const active = village.id === valueId;
                    const place = villagePlaceLine(village);
                    return (
                      <button
                        key={village.id}
                        type="button"
                        onClick={() => {
                          onChange(village);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 ${
                          active ? "bg-neutral-50" : ""
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-medium text-neutral-900">
                            {village.village_name}
                          </span>
                          {place ? (
                            <span className="mt-0.5 block text-xs text-neutral-500">
                              {place}
                            </span>
                          ) : null}
                        </span>
                        {active ? (
                          <span className="text-sm text-brand-dark">✓</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
