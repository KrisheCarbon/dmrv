"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/maps/Locationpicker";
import { createFarm, updateFarm } from "./actions";
import type { FarmerCrop, FarmDetail, LocationValue } from "@/types";
import type { FarmUpsertPayload } from "@krishecarbon/shared";

interface FarmFormProps {
  mode: "create" | "edit";
  data?: FarmDetail | null;
  onCancel: () => void;
  onSuccess?: (id: string) => void;
}

interface FarmerFormState {
  farmer_name: string;
  mobile_number: string;
  total_land_size: string;
  interested_in_biochar: boolean;
  prior_biochar_exp: boolean;
  prior_biochar_acreage: string;
  gps_location: LocationValue | null;
  crops: FarmerCrop[];
}

const sectionClass =
  "space-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0";
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";
const sectionEyebrowClass =
  "text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400";

function farmToFormState(farm: FarmDetail): FarmerFormState {
  return {
    farmer_name: farm.farmer_name,
    mobile_number: farm.mobile_number ?? "",
    total_land_size: String(farm.total_land_size),
    interested_in_biochar: farm.interested_in_biochar,
    prior_biochar_exp: farm.prior_biochar_exp,
    prior_biochar_acreage: farm.prior_biochar_acreage
      ? String(farm.prior_biochar_acreage)
      : "",
    gps_location: {
      lat: farm.latitude,
      lng: farm.longitude,
      place_name: farm.address,
    },
    crops: Array.isArray(farm.crops) ? farm.crops : [],
  };
}

function estimateBiomass(crops: FarmerCrop[]) {
  return crops.reduce((sum, crop) => sum + Number(crop.acreage) * 2, 0);
}

export default function FarmForm({
  mode,
  data = null,
  onCancel,
  onSuccess,
}: FarmFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropName, setCropName] = useState("");
  const [cropArea, setCropArea] = useState("");
  const [sowingDate, setSowingDate] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [form, setForm] = useState<FarmerFormState>(() =>
    data
      ? farmToFormState(data)
      : {
          farmer_name: "",
          mobile_number: "",
          total_land_size: "",
          interested_in_biochar: true,
          prior_biochar_exp: false,
          prior_biochar_acreage: "",
          gps_location: null,
          crops: [],
        },
  );

  function addCrop() {
    if (!cropName || !cropArea || !sowingDate || !harvestDate) return;

    setForm({
      ...form,
      crops: [
        ...form.crops,
        {
          crop: cropName,
          acreage: Number(cropArea),
          sowing_date: sowingDate,
          estimated_harvest_date: harvestDate,
        },
      ],
    });

    setCropName("");
    setCropArea("");
    setSowingDate("");
    setHarvestDate("");
  }

  function removeCrop(index: number) {
    setForm({
      ...form,
      crops: form.crops.filter((_, i) => i !== index),
    });
  }

  async function handleSubmit() {
    setError(null);

    if (
      !form.farmer_name ||
      !form.mobile_number ||
      !form.gps_location ||
      !form.total_land_size
    ) {
      setError("Please fill all mandatory fields");
      return;
    }

    if (form.crops.length === 0) {
      setError("Please add at least one crop");
      return;
    }

    setLoading(true);

    const payload: FarmUpsertPayload = {
      farmer_name: form.farmer_name,
      mobile_number: form.mobile_number,
      latitude: form.gps_location.lat,
      longitude: form.gps_location.lng,
      address: form.gps_location.place_name ?? "",
      total_land_size: Number(form.total_land_size),
      crops: form.crops,
      interested_in_biochar: form.interested_in_biochar,
      prior_biochar_exp: form.prior_biochar_exp,
      prior_biochar_acreage: form.prior_biochar_acreage
        ? Number(form.prior_biochar_acreage)
        : null,
      estimated_biomass: estimateBiomass(form.crops),
    };

    try {
      if (isEdit && data) {
        const updated = await updateFarm(data.id, payload);
        if (onSuccess) {
          onSuccess(updated.id);
        } else {
          router.push(`/network/farms/${updated.id}`);
        }
      } else {
        const created = await createFarm(payload);
        if (onSuccess) {
          onSuccess(created.id);
        } else {
          router.push(`/network/farms/${created.id}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save farm");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Farmer</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Farmer information
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Basic contact and location details for this farm.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Farmer name *</label>
            <input
              placeholder="Farmer name"
              className={inputClass}
              value={form.farmer_name}
              onChange={(e) =>
                setForm({ ...form, farmer_name: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Phone number *</label>
            <input
              placeholder="Phone number"
              className={inputClass}
              value={form.mobile_number}
              onChange={(e) =>
                setForm({ ...form, mobile_number: e.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Farm location *</label>
          <LocationPicker
            value={form.gps_location}
            onChange={(loc) => setForm({ ...form, gps_location: loc })}
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Total land size (acres) *</label>
          <input
            type="number"
            placeholder="Total land size in acres"
            className={inputClass}
            value={form.total_land_size}
            onChange={(e) =>
              setForm({ ...form, total_land_size: e.target.value })
            }
          />
        </div>
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Crops</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Crop details
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Add all active crops cultivated by the farmer.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              placeholder="Crop name"
              className={inputClass}
              value={cropName}
              onChange={(e) => setCropName(e.target.value)}
            />
            <input
              type="number"
              placeholder="Crop area (acres)"
              className={inputClass}
              value={cropArea}
              onChange={(e) => setCropArea(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>Estimated sowing date</label>
              <input
                type="date"
                className={inputClass}
                value={sowingDate}
                onChange={(e) => setSowingDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Estimated harvest date</label>
              <input
                type="date"
                className={inputClass}
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={addCrop}
            className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
          >
            + Add crop
          </button>
        </div>

        {form.crops.length > 0 ? (
          <div className="space-y-3">
            {form.crops.map((crop, index) => (
              <div
                key={`${crop.crop}-${index}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium text-neutral-900">{crop.crop}</p>
                  <p className="text-sm text-neutral-500">
                    {crop.acreage} acres · Sowing: {crop.sowing_date} · Harvest:{" "}
                    {crop.estimated_harvest_date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeCrop(index)}
                  className="rounded-full px-2 text-sm text-red-600 transition hover:bg-red-50"
                  aria-label={`Remove ${crop.crop}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No crops added yet.</p>
        )}
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Biochar</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Biochar information
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Track farmer adoption readiness.
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <input
              type="checkbox"
              checked={form.interested_in_biochar}
              onChange={(e) =>
                setForm({
                  ...form,
                  interested_in_biochar: e.target.checked,
                })
              }
            />
            <span className="text-sm text-neutral-800">
              Farmer is interested in biochar
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <input
              type="checkbox"
              checked={form.prior_biochar_exp}
              onChange={(e) =>
                setForm({
                  ...form,
                  prior_biochar_exp: e.target.checked,
                })
              }
            />
            <span className="text-sm text-neutral-800">
              Farmer has prior biochar experience
            </span>
          </label>
        </div>

        {form.prior_biochar_exp ? (
          <div className="space-y-1.5">
            <label className={labelClass}>Prior biochar acreage</label>
            <input
              type="number"
              placeholder="Prior biochar acreage"
              className={inputClass}
              value={form.prior_biochar_acreage}
              onChange={(e) =>
                setForm({
                  ...form,
                  prior_biochar_acreage: e.target.value,
                })
              }
            />
          </div>
        ) : null}

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4">
          <p className="text-sm text-neutral-500">Estimated biomass</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-950">
            {estimateBiomass(form.crops)} tons
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover disabled:opacity-50"
        >
          {loading ? "Saving..." : isEdit ? "Save changes" : "Create farm"}
        </button>
      </div>
    </div>
  );
}
