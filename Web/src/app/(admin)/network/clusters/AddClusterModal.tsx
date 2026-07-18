"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import VillageMapPicker from "@/components/maps/Villagepicker";
import type { ModalCallbacks, VillageLocationValue } from "@/types";

interface ClusterCropForm {
  crop_type: string;
  feedstock_type: string;
  acres: string;
  biomass_use_case: string;
  sowing_date: string;
  estimated_harvest_date: string;
  estimated_biochar_m3_per_year: string;
}

interface ClusterVillageForm {
  village_name: string;
  number_of_farmers: string;
  biomass_use_case: string;
  location: VillageLocationValue | null;
  crops: ClusterCropForm[];
}

interface ClusterFormState {
  clusterName: string;
  villages: ClusterVillageForm[];
}

const emptyCrop = (): ClusterCropForm => ({
  crop_type: "",
  feedstock_type: "",
  acres: "",
  biomass_use_case: "",
  sowing_date: "",
  estimated_harvest_date: "",
  estimated_biochar_m3_per_year: "",
});

const emptyVillage = (): ClusterVillageForm => ({
  village_name: "",
  number_of_farmers: "",
  biomass_use_case: "",
  location: null,
  crops: [emptyCrop()],
});

export default function AddClusterModal({ onClose, onSuccess }: ModalCallbacks) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ClusterFormState>({
    clusterName: "",
    villages: [emptyVillage()],
  });

  /* ------------------ helpers ------------------ */

  const updateVillage = (i: number, key: keyof ClusterVillageForm, value: ClusterVillageForm[keyof ClusterVillageForm]) => {
    const villages = [...form.villages];
    villages[i] = { ...villages[i], [key]: value };
    setForm({ ...form, villages });
  };

  const updateCrop = (vi: number, ci: number, key: keyof ClusterCropForm, value: string) => {
    const villages = [...form.villages];
    villages[vi].crops[ci] = { ...villages[vi].crops[ci], [key]: value };
    setForm({ ...form, villages });
  };

  const addVillage = () => {
    setForm({
      ...form,
      villages: [...form.villages, emptyVillage()],
    });
  };

  const removeVillage = (index: number) => {
  if (form.villages.length === 1) return;
  setForm({
    ...form,
    villages: form.villages.filter((_, i) => i !== index),
  });
};


  const addCrop = (vi: number) => {
    const villages = [...form.villages];
    villages[vi].crops.push(emptyCrop());
    setForm({ ...form, villages });
  };

  const removeCrop = (vi: number, ci: number) => {
  if (form.villages[vi].crops.length === 1) return;
  const villages = [...form.villages];
  villages[vi].crops = villages[vi].crops.filter((_, i) => i !== ci);
  setForm({ ...form, villages });
};


  /* ------------------ submit ------------------ */

  async function handleSubmit() {
    if (!form.clusterName.trim()) {
      setError("Cluster name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("users")
        .select("name, role")
        .eq("id", user.id)
        .single();

      const payload = {
        clusterName: form.clusterName,
        villages: form.villages.map((v) => ({
              village_name: v.village_name,
              number_of_farmers: Number(v.number_of_farmers),
              location: v.location,
              crops: v.crops.map((c) => ({
                crop_type: c.crop_type,
                feedstock_type: c.feedstock_type,
                biomass_use_case: c.biomass_use_case,
                acres: Number(c.acres),
                sowing_date: c.sowing_date,
                estimated_harvest_date: c.estimated_harvest_date,
                estimated_biochar_m3_per_year:
                  c.estimated_biochar_m3_per_year
                    ? Number(c.estimated_biochar_m3_per_year)
                    : null,
              })),
            }))

      };

      const { data, error } = await supabase.rpc(
        "create_cluster_with_villages_and_crops",
        { payload }
      );

      if (error) throw error;

      onSuccess();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ------------------ UI ------------------ */

  return (
  <div className="fixed inset-0 bg-black/40 z-50">
   <div className="absolute inset-0 overflow-y-auto">
    <div className="min-h-full flex items-start justify-center py-10">
      <div className="bg-white p-6 w-full max-w-4xl rounded space-y-6">

        <h2 className="text-lg font-semibold">Create Cluster</h2>

        {/* Cluster */}
        <input
          value={form.clusterName}
          onChange={(e) =>
            setForm({ ...form, clusterName: e.target.value })
          }
          placeholder="Cluster name"
          className="w-full border px-3 py-2 rounded"
        />

        {/* Villages */}
        {form.villages.map((village, vi) => (
          <div key={vi} className="border rounded p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">
                Village {vi + 1}
              </h3>

              {form.villages.length > 1 && (
                <button
                  onClick={() => removeVillage(vi)}
                  className="text-xs text-red-600"
                >
                  Remove
                </button>
              )}
            </div>


            <input
              placeholder="Village name"
              value={village.village_name}
              onChange={(e) =>
                updateVillage(vi, "village_name", e.target.value)
              }
              className="w-full border px-3 py-2 rounded"
            />

            <input
              type="number"
              placeholder="Number of farmers"
              value={village.number_of_farmers}
              onChange={(e) =>
                updateVillage(vi, "number_of_farmers", e.target.value)
              }
              className="w-full border px-3 py-2 rounded"
            />

            <VillageMapPicker
              value={village.location}
              onChange={(loc) => {
                updateVillage(vi, "location", loc);
                updateVillage(vi, "village_name", loc.village || village.village_name);
              }}
            />

            {village.location && (
              <p className="text-xs text-gray-600">
                {village.location.place_name}
              </p>
            )}


            {/* Crops */}
            {village.crops.map((crop, ci) => (
              <div key={ci} className="border rounded p-3 space-y-2">
              {/* Header with Add / Remove */}
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium">
                  Crop {ci + 1}
                </h4>

                {village.crops.length > 1 && (
                  <button
                    onClick={() => removeCrop(vi, ci)}
                    className="text-xs text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>

                <input
                  placeholder="Crop type"
                  value={crop.crop_type}
                  onChange={(e) =>
                    updateCrop(vi, ci, "crop_type", e.target.value)
                  }
                  className="w-full border px-3 py-2 rounded"
                />

                <input
                  placeholder="Feedstock type"
                  value={crop.feedstock_type}
                  onChange={(e) =>
                    updateCrop(
                      vi,
                      ci,
                      "feedstock_type",
                      e.target.value
                    )
                  }
                  className="w-full border px-3 py-2 rounded"
                />

                <input
                  type="number"
                  placeholder="Acres"
                  value={crop.acres}
                  onChange={(e) =>
                    updateCrop(vi, ci, "acres", e.target.value)
                  }
                  className="w-full border px-3 py-2 rounded"
                />
                <input
                  type="number"
                  placeholder="Estimated biochar (m³ / year)"
                  value={crop.estimated_biochar_m3_per_year}
                  onChange={(e) =>
                    updateCrop(
                      vi,
                      ci,
                      "estimated_biochar_m3_per_year",
                      e.target.value
                    )
                  }
                  className="w-full border px-3 py-2 rounded"
                />

                <input
                  placeholder="Biomass use case (e.g. Biochar, Compost, Fodder)"
                  value={crop.biomass_use_case}
                  onChange={(e) =>
                    updateCrop(vi, ci, "biomass_use_case", e.target.value)
                  }
                  className="w-full border px-3 py-2 rounded"
                />



                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={crop.sowing_date}
                    onChange={(e) =>
                      updateCrop(
                        vi,
                        ci,
                        "sowing_date",
                        e.target.value
                      )
                    }
                    className="border px-3 py-2 rounded"
                  />
                  <input
                    type="date"
                    value={crop.estimated_harvest_date}
                    onChange={(e) =>
                      updateCrop(
                        vi,
                        ci,
                        "estimated_harvest_date",
                        e.target.value
                      )
                    }
                    className="border px-3 py-2 rounded"
                  />
                </div>
              </div>
            ))}

            <button
              onClick={() => addCrop(vi)}
              className="text-sm text-blue-600"
            >
              + Add Crop
            </button>
            
          </div>
        ))}

        <button
          onClick={addVillage}
          className="text-sm text-blue-600"
        >
          + Add Village
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-black text-white px-4 py-2 text-sm rounded"
          >
            {loading ? "Saving..." : "Create Cluster"}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>  
  );
}
