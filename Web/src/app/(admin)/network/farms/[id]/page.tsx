"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { deleteFarm, getFarm } from "../actions";
import { listFarmFields } from "../../fields/actions";
import { listSoilTests } from "../../soil-tests/actions";
import type { FarmerCrop, FarmDetail } from "@/types";
import type { FarmFieldRecord, SoilTestRecord } from "@krishecarbon/shared";
import { soilTestStatusLabel } from "@krishecarbon/shared";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

export default function FarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<FarmDetail | null>(null);
  const [fields, setFields] = useState<FarmFieldRecord[]>([]);
  const [soilTests, setSoilTests] = useState<SoilTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchFarm() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const farm = await getFarm(id);
      setData(farm);
      const [fieldRows, soilRows] = await Promise.all([
        listFarmFields(id).catch(() => []),
        listSoilTests(id).catch(() => []),
      ]);
      setFields(fieldRows);
      setSoilTests(soilRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load farm");
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchFarm();
  }, [id]);

  async function handleDelete() {
    if (!data?.id) return;

    const confirmed = window.confirm(
      "This will permanently delete this farm record.\n\nThis action cannot be undone.\n\nContinue?",
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteFarm(data.id);
      router.push("/network/farms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete farm");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load farm: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/farms")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to farms
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Farm not found.</p>;
  }

  const crops = Array.isArray(data.crops) ? data.crops : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/farms")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to farms
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          {data.farmer_name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {data.address || "No address recorded"}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Details</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/network/farms/${data.id}/edit`}
              className="inline-flex min-h-[38px] min-w-[70px] items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="Farmer name">{data.farmer_name}</DetailRow>
          <DetailRow label="Mobile">{data.mobile_number ?? "—"}</DetailRow>
          <DetailRow label="Address">{data.address || "—"}</DetailRow>
          <DetailRow label="Coordinates">
            {data.latitude}, {data.longitude}
          </DetailRow>
          <DetailRow label="Total land (acres)">{data.total_land_size}</DetailRow>
          <DetailRow label="Estimated biomass (tons)">
            {data.estimated_biomass}
          </DetailRow>
          <DetailRow label="Interested in biochar">
            {formatYesNo(data.interested_in_biochar)}
          </DetailRow>
          <DetailRow label="Prior biochar experience">
            {formatYesNo(data.prior_biochar_exp)}
          </DetailRow>
          <DetailRow label="Prior biochar acreage">
            {data.prior_biochar_acreage ?? "—"}
          </DetailRow>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Fields</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Physical plots onboarded for this farmer. Area is in acres.
          </p>
        </div>
        <div className="px-6 py-4">
          {fields.length === 0 ? (
            <p className="text-sm text-neutral-500">No fields recorded.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {fields.map((field) => (
                <dl key={field.id} className="py-2 first:pt-0 last:pb-0">
                  <DetailRow label="Field ID">{field.field_code}</DetailRow>
                  <DetailRow label="Ownership">{field.ownership_type}</DetailRow>
                  <DetailRow label="Area">
                    {field.calculated_area != null ? `${field.calculated_area} acres` : "—"}
                  </DetailRow>
                  <DetailRow label="Water">{field.water_source || "—"}</DetailRow>
                  <DetailRow label="Crop">{field.crop_name || "—"}</DetailRow>
                  <DetailRow label="Season">{field.season || "—"}</DetailRow>
                  <DetailRow label="Sowing">{field.sowing_date || "—"}</DetailRow>
                  <DetailRow label="Harvest">{field.harvest_date || "—"}</DetailRow>
                </dl>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Soil tests</h2>
        </div>
        <div className="px-6 py-4">
          {soilTests.length === 0 ? (
            <p className="text-sm text-neutral-500">No soil samples recorded.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {soilTests.map((test) => (
                <dl key={test.id} className="py-2 first:pt-0 last:pb-0">
                  <DetailRow label="Sample date">{test.sample_date}</DetailRow>
                  <DetailRow label="Status">{soilTestStatusLabel(test.status)}</DetailRow>
                  <DetailRow label="Fields">
                    {test.fields?.map((field) => field.field_code).filter(Boolean).join(", ") || "—"}
                  </DetailRow>
                  <DetailRow label="Reports">
                    {test.reports?.length ? `${test.reports.length} uploaded` : "None yet"}
                  </DetailRow>
                </dl>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Crops</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Active crops cultivated on this farm.
          </p>
        </div>

        <div className="px-6 py-4">
          {crops.length === 0 ? (
            <p className="text-sm text-neutral-500">No crops recorded.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {crops.map((crop: FarmerCrop, index: number) => (
                <dl key={`${crop.crop}-${index}`} className="py-2 first:pt-0 last:pb-0">
                  <DetailRow label="Crop">{crop.crop}</DetailRow>
                  <DetailRow label="Acreage">{crop.acreage} acres</DetailRow>
                  {crop.biomass_rate ? (
                    <DetailRow label="Biomass rate">
                      {crop.biomass_rate} tonnes/acre
                    </DetailRow>
                  ) : null}
                  <DetailRow label="Sowing date">{crop.sowing_date}</DetailRow>
                  <DetailRow label="Estimated harvest">
                    {crop.estimated_harvest_date}
                  </DetailRow>
                </dl>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
