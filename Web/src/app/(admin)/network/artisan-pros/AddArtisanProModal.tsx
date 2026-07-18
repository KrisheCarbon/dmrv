"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import LocationPicker from "@/components/maps/Locationpicker";
import type { LocationValue, ModalCallbacks, VillageLocationValue } from "@/types";

interface ArtisanProFormState {
  artisan_pro_code: string;
  name: string;
  dmrv_id: string;
  gps_location: LocationValue | null;
  estimated_production_m3_year: string;
  real_production_last_year_m3: string;
  proper_end_use_confirmed: boolean;
  first_internal_inspection: string;
  last_internal_inspection: string;
  last_supervisor_name: string;
  last_unannounced_inspection: string;
  feedstocks: string[];
  villages: VillageLocationValue[];
}

export default function AddArtisanProModal({ onClose, onSuccess }: ModalCallbacks) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ArtisanProFormState>({
    artisan_pro_code: "",
    name: "",
    dmrv_id: "",              // optional
    gps_location: null,

    estimated_production_m3_year: "",
    real_production_last_year_m3: "",

    proper_end_use_confirmed: false, // default = NO

    first_internal_inspection: "",
    last_internal_inspection: "",
    last_supervisor_name: "",
    last_unannounced_inspection: "",

    feedstocks: [""],
    villages: []
  });

  function updateArray(index: number, value: string) {
    const arr = [...form.feedstocks];
    arr[index] = value;
    setForm({ ...form, feedstocks: arr });
  }

  async function handleSubmit() {
    setError(null);

    // ✅ Mandatory checks ONLY
    if (
      !form.artisan_pro_code ||
      !form.name ||
      !form.gps_location ||
      !form.estimated_production_m3_year
    ) {
      setError("Please fill all mandatory fields");
      return;
    }

    const feedstocks = form.feedstocks.filter(Boolean);
    if (feedstocks.length === 0) {
      setError("At least one feedstock is required");
      return;
    }

    setLoading(true);

    const payload = {
      artisan_pro: { ...form },
      feedstocks,
      villages: form.villages.filter(Boolean)
    };

    const { error } = await supabase.rpc(
      "create_artisan_pro_with_details",
      { payload }
    );

    if (error) {
      setError(error.message);
    } else {
      onSuccess();
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50">
      {/* 🔑 SCROLLABLE WRAPPER */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex items-start justify-center py-10">
          <div className="bg-white w-full max-w-3xl p-6 rounded space-y-4">

            <h2 className="text-lg font-semibold">Add Artisan Pro</h2>

            <input
              placeholder="Artisan Pro ID *"
              className="w-full border px-3 py-2 rounded"
              value={form.artisan_pro_code}
              onChange={(e) =>
                setForm({ ...form, artisan_pro_code: e.target.value })
              }
            />

            <input
              placeholder="Name *"
              className="w-full border px-3 py-2 rounded"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
            />

            <LocationPicker
              value={form.gps_location}
              onChange={(loc) =>
                setForm({ ...form, gps_location: loc })
              }
            />

            <input
              type="number"
              placeholder="Estimated production (m³/year) *"
              className="w-full border px-3 py-2 rounded"
              value={form.estimated_production_m3_year}
              onChange={(e) =>
                setForm({
                  ...form,
                  estimated_production_m3_year: e.target.value
                })
              }
            />

            <label className="flex gap-2 items-center text-sm">
              <input
                type="checkbox"
                checked={form.proper_end_use_confirmed}
                onChange={(e) =>
                  setForm({
                    ...form,
                    proper_end_use_confirmed: e.target.checked
                  })
                }
              />
              Proper end use of biochar confirmed (Yes / No)
            </label>

            <h3 className="font-medium">Feedstocks *</h3>

            {form.feedstocks.map((f, i) => (
              <input
                key={i}
                placeholder={`Feedstock ${i + 1}`}
                className="w-full border px-3 py-2 rounded"
                value={f}
                onChange={(e) =>
                  updateArray(i, e.target.value)
                }
              />
            ))}

            <button
              className="text-blue-600 text-sm"
              onClick={() =>
                setForm({
                  ...form,
                  feedstocks: [...form.feedstocks, ""]
                })
              }
            >
              + Add Feedstock
            </button>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {/* 🔑 ACTION BUTTONS ALWAYS VISIBLE */}
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={onClose}
                disabled={loading}
                className="text-sm"
              >
                Cancel
              </button>
              <button
                disabled={loading}
                onClick={handleSubmit}
                className="bg-black text-white px-4 py-2 text-sm rounded"
              >
                {loading ? "Saving..." : "Create"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
