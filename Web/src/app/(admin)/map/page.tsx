"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { FarmFieldRecord } from "@krishecarbon/shared";
import { listFarms } from "../network/farms/actions";
import { listFarmFields } from "../network/fields/actions";
import type { FarmDetail } from "@/types";
import type { MapFarmPoint } from "./points";

const IndiaMap = dynamic(() => import("./IndiaMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

type LayerId = "farmers" | "pyrolysis" | "mixing";

const LAYERS: Array<{
  id: LayerId;
  label: string;
  description: string;
  ready: boolean;
}> = [
  {
    id: "farmers",
    label: "Farmers",
    description: "Farm locations from GPS",
    ready: true,
  },
  {
    id: "pyrolysis",
    label: "Pyrolysis sites",
    description: "Where biochar is produced",
    ready: false,
  },
  {
    id: "mixing",
    label: "Mixing farms",
    description: "Where mixing is done",
    ready: false,
  },
];

function finiteCoord(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function indiaGps(latitude: unknown, longitude: unknown) {
  const lat = finiteCoord(latitude);
  const lng = finiteCoord(longitude);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null;
  if (lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) return null;
  return { latitude: lat, longitude: lng };
}

function placeLabel(farm?: FarmDetail) {
  return [farm?.village, farm?.district, farm?.state]
    .map((part) => (part ? String(part).trim() : ""))
    .filter(Boolean)
    .join(", ");
}

function farmPoints(fields: FarmFieldRecord[], farms: FarmDetail[]): MapFarmPoint[] {
  const farmsById = new Map(farms.map((farm) => [farm.id, farm]));
  const points: MapFarmPoint[] = [];

  for (const field of fields) {
    if (field.status === "inactive") continue;
    const gps = indiaGps(field.latitude, field.longitude);
    if (!gps) continue;
    const farm = farmsById.get(field.farm_id);
    const area = finiteCoord(field.calculated_area);
    points.push({
      id: field.id,
      farmId: field.farm_id,
      farmerName:
        field.farm?.farmer_name?.trim() ||
        farm?.farmer_name?.trim() ||
        "Unnamed farmer",
      fieldCode: field.field_code,
      latitude: gps.latitude,
      longitude: gps.longitude,
      areaAcres: area,
      cropName: field.crop_name?.trim() || null,
      place: placeLabel(farm),
    });
  }

  points.sort(
    (a, b) =>
      a.farmerName.localeCompare(b.farmerName) ||
      a.fieldCode.localeCompare(b.fieldCode),
  );
  return points;
}

export default function MapPage() {
  const [layer, setLayer] = useState<LayerId>("farmers");
  const [points, setPoints] = useState<MapFarmPoint[]>([]);
  const [fieldCount, setFieldCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [farmResult, fieldResult] = await Promise.all([
        listFarms(),
        listFarmFields(),
      ]);
      if (farmResult.error || farmResult.data == null) {
        throw new Error(farmResult.error || "Failed to load farms");
      }
      if (fieldResult.error || fieldResult.data == null) {
        throw new Error(fieldResult.error || "Failed to load farms");
      }
      const activeFields = fieldResult.data.filter(
        (field) => field.status !== "inactive",
      );
      setFieldCount(activeFields.length);
      setPoints(farmPoints(activeFields, farmResult.data));
      setFitRequest((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load farms");
      setPoints([]);
      setFieldCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePoints = useMemo(() => {
    if (layer !== "farmers") return [];
    const query = search.trim().toLowerCase();
    if (!query) return points;
    return points.filter((point) =>
      [point.farmerName, point.fieldCode, point.place, point.cropName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [layer, points, search]);

  const selected = visiblePoints.find((point) => point.id === selectedId) ?? null;
  const missingGps = Math.max(fieldCount - points.length, 0);

  return (
    <div className="flex h-[calc(100svh-7rem)] min-h-[36rem] flex-col gap-4 lg:flex-row">
      <aside className="flex max-h-[46%] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white lg:max-h-none lg:w-80">
        <div className="border-b border-gray-100 px-4 py-4">
          <h1 className="text-xl Sbold tracking-tight text-gray-900">Map</h1>
          <p className="mt-1 text-sm text-gray-500">
            India map of where work happens. Farm GPS points are live.
          </p>
        </div>

        <div className="space-y-2 border-b border-gray-100 px-4 py-4" role="radiogroup" aria-label="Map layers">
          {LAYERS.map((item) => {
            const active = layer === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setLayer(item.id);
                  setSelectedId(null);
                  setFitRequest((value) => value + 1);
                }}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-brand-dark bg-brand-dark/5"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-brand-dark" : "border-gray-300"
                  }`}
                >
                  {active ? (
                    <span className="h-2 w-2 rounded-full bg-brand-dark" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm Smedium text-gray-900">{item.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        item.ready
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.ready ? (loading ? "…" : points.length) : "Soon"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {layer === "farmers" ? (
          <>
            <div className="px-4 py-3">
              <label className="sr-only" htmlFor="map-farm-search">
                Search farms
              </label>
              <input
                id="map-farm-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search farmer, farm, or place"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-dark focus:ring-2 focus:ring-brand-dark/20"
              />
              <p className="mt-2 text-xs text-gray-500">
                {loading
                  ? "Loading farm GPS…"
                  : `${visiblePoints.length} GPS point${visiblePoints.length === 1 ? "" : "s"}`}
                {!loading && missingGps > 0
                  ? ` · ${missingGps} farm${missingGps === 1 ? "" : "s"} without a GPS point in India`
                  : ""}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {error ? (
                <p className="px-2 text-sm text-red-700">{error}</p>
              ) : null}
              {!loading && !error && visiblePoints.length === 0 ? (
                <p className="px-2 text-sm text-gray-500">
                  No farm GPS points match this view.
                </p>
              ) : null}
              <ul className="space-y-1">
                {visiblePoints.map((point) => {
                  const active = point.id === selectedId;
                  return (
                    <li key={point.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(point.id)}
                        className={`w-full rounded-lg px-2 py-2 text-left transition ${
                          active ? "bg-brand-dark/8" : "hover:bg-gray-50"
                        }`}
                      >
                        <span className="block truncate text-sm Smedium text-gray-900">
                          {point.farmerName}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {point.fieldCode}
                          {point.place ? ` · ${point.place}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : (
          <div className="px-4 py-4 text-sm text-gray-500">
            {layer === "pyrolysis"
              ? "Pyrolysis sites will show on this map once that layer is connected."
              : "Farms where mixing is done will show on this map once that layer is connected."}
          </div>
        )}
      </aside>

      <section className="relative min-h-[24rem] flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <IndiaMap
          points={visiblePoints}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          fitRequest={fitRequest}
        />

        <div className="absolute left-3 top-3 z-10 flex gap-2">
          <button
            type="button"
            onClick={() => setFitRequest((value) => value + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs Smedium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            {layer === "farmers" && visiblePoints.length > 0
              ? "Fit farms"
              : "Show India"}
          </button>
        </div>

        {layer !== "farmers" ? (
          <div className="pointer-events-none absolute left-1/2 top-14 z-10 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
            {layer === "pyrolysis"
              ? "Pyrolysis sites are not plotted yet."
              : "Mixing farms are not plotted yet."}
          </div>
        ) : null}

        {selected ? (
          <div className="absolute bottom-4 left-4 z-10 w-[min(22rem,calc(100%-2rem))] rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm Sbold text-gray-900">{selected.farmerName}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selected.fieldCode}
                  {selected.place ? ` · ${selected.place}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-xs text-gray-400 hover:text-gray-700"
                aria-label="Close farm details"
              >
                Close
              </button>
            </div>
            <dl className="mt-3 space-y-1 text-sm text-gray-700">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">GPS</dt>
                <dd>
                  {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </dd>
              </div>
              {selected.areaAcres != null ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Area</dt>
                  <dd>{selected.areaAcres} acres</dd>
                </div>
              ) : null}
              {selected.cropName ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Crop</dt>
                  <dd>{selected.cropName}</dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-3 flex gap-3 text-sm">
              <Link
                href={`/network/farmers/${selected.farmId}`}
                className="font-medium text-brand-dark hover:underline"
              >
                Open farmer
              </Link>
              <a
                href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-dark hover:underline"
              >
                Google Maps
              </a>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs text-gray-600 shadow-sm">
              Loading farms…
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
