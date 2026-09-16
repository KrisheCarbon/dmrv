"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/maps/Locationpicker";
import FarmerPortrait from "@/components/FarmerPortrait";
import ClusterVillagePicker from "@/components/ClusterVillagePicker";
import { createFarm, updateFarm } from "./actions";
import { listClusterVillages } from "../clusters/actions";
import { uploadFarmerProfilePhoto } from "@/lib/uploadFarmerNetworkPhotos";
import type { FarmerCrop, FarmDetail, LocationValue } from "@/types";
import {
  CROP_BIOMASS_RATES,
  CROP_OPTIONS,
  calculateEstimatedBiomass,
  matchClusterVillage,
  validateMobileNumber,
  type ClusterVillageRecord,
  type FarmUpsertPayload,
} from "@krishecarbon/shared";

const OTHER_CROP = "Other";

interface FarmFormProps {
  mode: "create" | "edit";
  data?: FarmDetail | null;
  onCancel: () => void;
  onSuccess?: (id: string) => void;
}

interface FarmerFormState {
  farmer_name: string;
  father_spouse_name: string;
  agri_id: string;
  mobile_number: string;
  address: string;
  village: string;
  mandal: string;
  district: string;
  state: string;
  cluster_id: string;
  cluster_village_id: string;
  total_land_size: string;
  owned_land_size: string;
  leased_land_size: string;
  interested_in_biochar: boolean;
  prior_biochar_exp: boolean;
  prior_biochar_acreage: string;
  gps_location: LocationValue | null;
  farmer_photo_url: string;
  crops: FarmerCrop[];
}

const sectionClass =
  "space-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0";
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";
const sectionEyebrowClass =
  "text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400";

function normalizeCrops(crops: unknown): FarmerCrop[] {
  if (!Array.isArray(crops)) return [];
  return crops.map((raw) => {
    const crop = raw as Record<string, unknown>;
    const name = String(crop.crop ?? crop.crop_name ?? "");
    const storedRate = crop.biomass_rate != null ? Number(crop.biomass_rate) : NaN;
    return {
      crop: name,
      acreage: Number(crop.acreage ?? crop.crop_area ?? 0),
      sowing_date: String(crop.sowing_date ?? ""),
      estimated_harvest_date: String(
        crop.estimated_harvest_date ?? crop.harvest_date ?? "",
      ),
      biomass_rate: Number.isFinite(storedRate) && storedRate > 0
        ? storedRate
        : CROP_BIOMASS_RATES[name],
    };
  });
}

function farmToFormState(farm: FarmDetail): FarmerFormState {
  return {
    farmer_name: farm.farmer_name,
    father_spouse_name: farm.father_spouse_name ?? "",
    agri_id: farm.agri_id ?? "",
    mobile_number: farm.mobile_number ?? "",
    address: farm.address ?? "",
    village: farm.village ?? "",
    mandal: farm.mandal ?? "",
    district: farm.district ?? "",
    state: farm.state ?? "",
    cluster_id: farm.cluster_id ?? farm.cluster?.id ?? "",
    cluster_village_id: farm.cluster_village_id ?? "",
    total_land_size: String(farm.total_land_size ?? ""),
    owned_land_size: farm.owned_land_size != null ? String(farm.owned_land_size) : "",
    leased_land_size: farm.leased_land_size != null ? String(farm.leased_land_size) : "",
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
    farmer_photo_url: farm.farmer_photo_url ?? "",
    crops: normalizeCrops(farm.crops),
  };
}

function generateFarmerCode() {
  return `FRM-${Date.now().toString(36).toUpperCase()}`;
}

function estimateBiomass(crops: FarmerCrop[]) {
  return calculateEstimatedBiomass(
    crops.map((crop) => ({
      crop_name: crop.crop,
      crop_area: crop.acreage,
      sowing_date: crop.sowing_date,
      harvest_date: crop.estimated_harvest_date,
      biomass_rate: crop.biomass_rate,
    })),
  );
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
  const [cropPicker, setCropPicker] = useState<string>(CROP_OPTIONS[0]);
  const [cropOtherName, setCropOtherName] = useState("");
  const [cropOtherRate, setCropOtherRate] = useState("");
  const [cropArea, setCropArea] = useState("");
  const [sowingDate, setSowingDate] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    data?.farmer_photo_url ?? null,
  );
  const [villages, setVillages] = useState<ClusterVillageRecord[]>([]);
  const [villagesLoading, setVillagesLoading] = useState(true);
  const [form, setForm] = useState<FarmerFormState>(() =>
    data
      ? farmToFormState(data)
      : {
          farmer_name: "",
          father_spouse_name: "",
          agri_id: "",
          mobile_number: "",
          address: "",
          village: "",
          mandal: "",
          district: "",
          state: "",
          cluster_id: "",
          cluster_village_id: "",
          total_land_size: "",
          owned_land_size: "",
          leased_land_size: "",
          interested_in_biochar: true,
          prior_biochar_exp: false,
          prior_biochar_acreage: "",
          gps_location: null,
          farmer_photo_url: "",
          crops: [],
        },
  );

  useEffect(() => {
    let cancelled = false;
    async function loadVillages() {
      setVillagesLoading(true);
      try {
        const options = await listClusterVillages();
        if (cancelled) return;
        setVillages(options);
        if (!form.cluster_village_id) {
          const match = matchClusterVillage(options, form);
          if (match) {
            setForm((current) => ({
              ...current,
              cluster_village_id: match.id,
              cluster_id: match.cluster_id,
              village: match.village_name,
              mandal: match.mandal ?? "",
              district: match.district ?? "",
              state: match.state ?? "",
            }));
          }
        }
      } catch {
        if (!cancelled) setVillages([]);
      } finally {
        if (!cancelled) setVillagesLoading(false);
      }
    }
    loadVillages();
    return () => {
      cancelled = true;
    };
    // Load once on mount; form matching uses the initial farmer values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentCropRate() {
    if (cropPicker === OTHER_CROP) return Number(cropOtherRate);
    return CROP_BIOMASS_RATES[cropPicker];
  }

  function addCrop() {
    const cropName = cropPicker === OTHER_CROP ? cropOtherName.trim() : cropPicker;
    const biomassRate = currentCropRate();
    const areaNum = Number(cropArea);

    if (
      !cropName ||
      !cropArea ||
      Number.isNaN(areaNum) ||
      areaNum <= 0 ||
      !sowingDate ||
      !harvestDate ||
      !biomassRate ||
      Number.isNaN(biomassRate) ||
      biomassRate <= 0
    ) {
      return;
    }

    const totalLandSize = Number(form.total_land_size);
    if (!form.total_land_size || Number.isNaN(totalLandSize) || totalLandSize <= 0) {
      setError("Enter the total land size before adding crops.");
      return;
    }

    const areaSoFar = form.crops.reduce(
      (sum, crop) => sum + Number(crop.acreage || 0),
      0,
    );
    if (areaSoFar + areaNum > totalLandSize) {
      setError(
        `Total crop area (${areaSoFar + areaNum} acres) cannot exceed the total land size (${totalLandSize} acres).`,
      );
      return;
    }

    setError(null);

    setForm({
      ...form,
      crops: [
        ...form.crops,
        {
          crop: cropName,
          acreage: Number(cropArea),
          sowing_date: sowingDate,
          estimated_harvest_date: harvestDate,
          biomass_rate: biomassRate,
        },
      ],
    });

    setCropPicker(CROP_OPTIONS[0]);
    setCropOtherName("");
    setCropOtherRate("");
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

    const owned = Number(form.owned_land_size) || 0;
    const leased = Number(form.leased_land_size) || 0;
    const totalLandSize =
      Number(form.total_land_size) || owned + leased;

    if (
      !form.farmer_name ||
      !form.mobile_number ||
      !form.address.trim() ||
      !form.cluster_village_id.trim() ||
      !form.village.trim()
    ) {
      setError("Name, mobile, address, and cluster village are required.");
      return;
    }

    if (!validateMobileNumber(form.mobile_number)) {
      setError(
        "Enter a valid 10-digit mobile number (optionally with +91 country code).",
      );
      return;
    }

    if (form.prior_biochar_exp) {
      const acres = Number(form.prior_biochar_acreage);
      if (!form.prior_biochar_acreage || Number.isNaN(acres) || acres <= 0) {
        setError("Enter prior biochar area in acres when experience is Yes.");
        return;
      }
    }

    const totalCropArea = form.crops.reduce(
      (sum, crop) => sum + Number(crop.acreage || 0),
      0,
    );
    if (totalLandSize > 0 && totalCropArea > totalLandSize) {
      setError(
        `Total crop area (${totalCropArea} acres) cannot exceed the total land size (${totalLandSize} acres).`,
      );
      return;
    }

    setLoading(true);

    try {
      const gps = form.gps_location;
      let farmerPhotoUrl = form.farmer_photo_url.trim() || null;
      if (photoFile) {
        const farmerId = data?.id || crypto.randomUUID();
        farmerPhotoUrl = await uploadFarmerProfilePhoto({
          file: photoFile,
          farmerId,
        });
      }

      const payload: FarmUpsertPayload = {
        farmer_name: form.farmer_name,
        mobile_number: form.mobile_number,
        latitude: gps?.lat ?? 0,
        longitude: gps?.lng ?? 0,
        address: form.address.trim() || gps?.place_name || "",
        total_land_size: totalLandSize,
        crops: form.crops,
        interested_in_biochar: form.interested_in_biochar,
        prior_biochar_exp: form.prior_biochar_exp,
        prior_biochar_acreage: form.prior_biochar_acreage
          ? Number(form.prior_biochar_acreage)
          : null,
        estimated_biomass: estimateBiomass(form.crops),
        farmer_code: data?.farmer_code || generateFarmerCode(),
        father_spouse_name: form.father_spouse_name.trim() || null,
        agri_id: form.agri_id.trim() || null,
        village: form.village.trim() || null,
        mandal: form.mandal.trim() || null,
        district: form.district.trim() || null,
        state: form.state.trim() || null,
        cluster_id: form.cluster_id.trim() || null,
        cluster_village_id: form.cluster_village_id.trim() || null,
        owned_land_size: form.owned_land_size ? owned : null,
        leased_land_size: form.leased_land_size ? leased : null,
        farmer_photo_url: farmerPhotoUrl,
      };
      if (isEdit && data) {
        const updated = await updateFarm(data.id, payload);
        if (onSuccess) {
          onSuccess(updated.id);
        } else {
          router.push(`/network/farmers/${updated.id}`);
        }
      } else {
        const created = await createFarm(payload);
        if (onSuccess) {
          onSuccess(created.id);
        } else {
          router.push(`/network/farmers/${created.id}`);
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
            Basic contact and location details for this farmer.
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

          <div className="space-y-1.5 md:col-span-2">
            <label className={labelClass}>Farmer photo</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0] ?? null;
                setPhotoFile(file);
                setPhotoPreview(
                  file ? URL.createObjectURL(file) : form.farmer_photo_url || null,
                );
              }}
            />
            <p className="text-xs text-neutral-400">
              Photograph the farmer, or upload an existing portrait.
            </p>
            <FarmerPortrait
              src={photoPreview}
              alt={form.farmer_name || "Farmer photo"}
              className="mt-2 h-40 w-40 rounded-xl object-cover"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Phone number *</label>
            <input
              placeholder="e.g. 9381548046 or +919381548046"
              className={inputClass}
              value={form.mobile_number}
              onChange={(e) =>
                setForm({ ...form, mobile_number: e.target.value })
              }
            />
            <p className="text-xs text-neutral-400">
              Enter your 10-digit mobile number, with or without the +91
              country code.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Father&apos;s / spouse&apos;s name</label>
            <input
              placeholder="Father or spouse name"
              className={inputClass}
              value={form.father_spouse_name}
              onChange={(e) =>
                setForm({ ...form, father_spouse_name: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>
              Kisan Pehchan / Agri ID
            </label>
            <input
              placeholder="Optional government farmer ID"
              className={inputClass}
              value={form.agri_id}
              onChange={(e) => setForm({ ...form, agri_id: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Farmer location *</label>
          <LocationPicker
            value={form.gps_location}
            onChange={(loc) =>
              setForm({
                ...form,
                gps_location: loc,
                address: form.address || loc?.place_name || "",
              })
            }
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Postal address *</label>
          <textarea
            placeholder="House / street / landmark"
            className={inputClass}
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Village *</label>
          <ClusterVillagePicker
            villages={villages}
            valueId={form.cluster_village_id}
            loading={villagesLoading}
            emptyText="No cluster villages yet. Create a cluster and add villages first."
            onChange={(village) => {
              if (!village) {
                setForm({
                  ...form,
                  cluster_village_id: "",
                  cluster_id: "",
                  village: "",
                  mandal: "",
                  district: "",
                  state: "",
                });
                return;
              }
              setForm({
                ...form,
                cluster_village_id: village.id,
                cluster_id: village.cluster_id,
                village: village.village_name,
                mandal: village.mandal ?? "",
                district: village.district ?? "",
                state: village.state ?? "",
              });
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className={labelClass}>Total cultivated land (acres) *</label>
            <input
              type="number"
              placeholder="Total land in acres"
              className={inputClass}
              value={form.total_land_size}
              onChange={(e) =>
                setForm({ ...form, total_land_size: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Owned (acres)</label>
            <input
              type="number"
              className={inputClass}
              value={form.owned_land_size}
              onChange={(e) =>
                setForm({ ...form, owned_land_size: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Leased (acres)</label>
            <input
              type="number"
              className={inputClass}
              value={form.leased_land_size}
              onChange={(e) =>
                setForm({ ...form, leased_land_size: e.target.value })
              }
            />
          </div>
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
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            New crop
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>Crop name</label>
              <select
                className={inputClass}
                value={cropPicker}
                onChange={(e) => {
                  setCropPicker(e.target.value);
                  setCropOtherName("");
                  setCropOtherRate("");
                }}
              >
                {CROP_OPTIONS.map((crop) => (
                  <option key={crop} value={crop}>
                    {crop === OTHER_CROP
                      ? `${crop} (custom rate)`
                      : `${crop} — ~${CROP_BIOMASS_RATES[crop]} tonnes/acre`}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="number"
              placeholder="Crop area (acres)"
              className={inputClass}
              value={cropArea}
              onChange={(e) => setCropArea(e.target.value)}
            />
          </div>

          {cropPicker === OTHER_CROP ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input
                placeholder="Crop type"
                className={inputClass}
                value={cropOtherName}
                onChange={(e) => setCropOtherName(e.target.value)}
              />
              <input
                type="number"
                placeholder="Guesstimated biomass (tonnes/acre)"
                className={inputClass}
                value={cropOtherRate}
                onChange={(e) => setCropOtherRate(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Guesstimated biomass: {CROP_BIOMASS_RATES[cropPicker]} tonnes/acre
            </p>
          )}

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
            Add this crop to the list
          </button>
        </div>

        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Added crops {form.crops.length ? `(${form.crops.length})` : ""}
        </p>

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
                    {crop.acreage} acres · {crop.biomass_rate} tonnes/acre · Sowing:{" "}
                    {crop.sowing_date} · Harvest: {crop.estimated_harvest_date}
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
          <p className="text-xs text-neutral-500">
            Fill in the details above and click &ldquo;Add this crop to the
            list&rdquo;. You can add more than one crop.
          </p>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className={labelClass}>Farmer interested in biochar *</p>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, interested_in_biochar: value })
                  }
                  className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                    form.interested_in_biochar === value
                      ? "border-brand-dark bg-brand-dark text-white"
                      : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                  }`}
                >
                  {value ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className={labelClass}>Prior biochar experience *</p>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      prior_biochar_exp: value,
                      prior_biochar_acreage: value
                        ? form.prior_biochar_acreage
                        : "",
                    })
                  }
                  className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                    form.prior_biochar_exp === value
                      ? "border-brand-dark bg-brand-dark text-white"
                      : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                  }`}
                >
                  {value ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {form.prior_biochar_exp ? (
          <div className="space-y-1.5">
            <label className={labelClass}>Prior biochar area (acres) *</label>
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
          {loading ? "Saving..." : isEdit ? "Save changes" : "Create farmer"}
        </button>
      </div>
    </div>
  );
}
