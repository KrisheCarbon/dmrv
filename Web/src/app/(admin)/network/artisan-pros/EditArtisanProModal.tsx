"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import LocationPicker from "@/components/maps/Locationpicker";
import type { ArtisanProDetail, LocationValue, ModalCallbacks } from "@/types";
import type { ArtisanProVillage } from "@/types/entities";

interface EditArtisanProModalProps extends ModalCallbacks {
  data: ArtisanProDetail;
}

interface VillageFormRow {
  name: string;
  location: LocationValue | null;
}

interface ArtisanProEditFormState {
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
}

export default function EditArtisanProModal({ data, onClose, onSuccess }: EditArtisanProModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------
     MAIN ARTISAN PRO FORM
  ----------------------------*/
  const [form, setForm] = useState<ArtisanProEditFormState>({
    artisan_pro_code: data.artisan_pro_code || "",
    name: data.name || "",
    dmrv_id: data.dmrv_id || "",
    gps_location: data.gps_location || null,

    estimated_production_m3_year:
      String(data.estimated_production_m3_year ?? ""),

    real_production_last_year_m3:
      String(data.real_production_last_year_m3 ?? ""),

    proper_end_use_confirmed:
      data.proper_end_use_confirmed ?? false,

    first_internal_inspection:
      data.first_internal_inspection || "",

    last_internal_inspection:
      data.last_internal_inspection || "",

    last_supervisor_name:
      data.last_supervisor_name || "",

    last_unannounced_inspection:
      data.last_unannounced_inspection || "",

    feedstocks: (data.artisan_pro_feedstocks ?? []).map(
      (f) => f.feedstock_name
    ),
  });

  const [villages, setVillages] = useState<VillageFormRow[]>(
    (data.artisan_pro_villages ?? []).map((v: ArtisanProVillage) => ({
      name: v.village_name,
      location: v.location || null,
    }))
  );

  function updateVillage(index: number, key: keyof VillageFormRow, value: string | LocationValue | null) {
    const arr = [...villages];
    arr[index] = { ...arr[index], [key]: value };
    setVillages(arr);
  }

  function addVillage() {
    setVillages([...villages, { name: "", location: null }]);
  }

  function removeVillage(index: number) {
    const arr = [...villages];
    arr.splice(index, 1);
    setVillages(arr);
  }

  function updateArray(key: "feedstocks", index: number, value: string) {
    const arr = [...form[key]];
    arr[index] = value;
    setForm({ ...form, [key]: arr });
  }

  /* ---------------------------
     SUBMIT (ATOMIC RPC)
  ----------------------------*/
  async function handleSubmit() {
    setError(null);

    if (
      !form.artisan_pro_code ||
      !form.name ||
      !form.gps_location ||
      !form.estimated_production_m3_year
    ) {
      setError("Mandatory fields missing");
      return;
    }

    setLoading(true);

    const payload = {
      artisan_pro_id: data.id,
      artisan_pro: {
        ...form,
        gps_location: form.gps_location ?? null,
      },
      feedstocks: form.feedstocks.filter(
    (f) => typeof f === "string" && f.trim()
  ),
      villages: villages
    .filter((v) => v.name && v.name.trim())
    .map((v) => ({
      name: v.name,
      location: v.location ?? null,
    })),
    };

    const { error } = await supabase.rpc(
      "update_artisan_pro_full",
      { payload }
    );

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onSuccess();
  }

  /* ---------------------------
     UI
  ----------------------------*/
  return (
    <div className="fixed inset-0 bg-black/40 z-50">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex justify-center py-10">
          <div className="bg-white p-6 w-full max-w-3xl rounded space-y-4">

            <h2 className="text-lg font-semibold">
              Edit Artisan Pro
            </h2>

            <h3 className="font-medium">Artisan Pro ID *</h3>
            <input
              className="w-full border px-3 py-2 rounded"
              value={form.artisan_pro_code}
              onChange={(e) =>
                setForm({ ...form, artisan_pro_code: e.target.value })
              }
            />

            <h3 className="font-medium">Artisan Pro Name *</h3>
            <input
              className="w-full border px-3 py-2 rounded"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
            />

            <h3 className="font-medium">DMRV ID</h3>
            <input
              className="w-full border px-3 py-2 rounded"
              value={form.dmrv_id}
              onChange={(e) =>
                setForm({ ...form, dmrv_id: e.target.value })
              }
            />

            <h3 className="font-medium">Location *</h3>
            <LocationPicker
              value={form.gps_location}
              onChange={(loc) =>
                setForm({ ...form, gps_location: loc })
              }
            />

            <h3 className="font-medium">
              Estimated production (m³/year) *
            </h3>
            <input
              type="number"
              className="w-full border px-3 py-2 rounded"
              value={form.estimated_production_m3_year}
              onChange={(e) =>
                setForm({
                  ...form,
                  estimated_production_m3_year: e.target.value
                })
              }
            />

            <h3 className="font-medium">
              Real production last year (m³)
            </h3>
            <input
              type="number"
              className="w-full border px-3 py-2 rounded"
              value={form.real_production_last_year_m3}
              onChange={(e) =>
                setForm({
                  ...form,
                  real_production_last_year_m3: e.target.value
                })
              }
            />

            {/* ---------------- Feedstocks ---------------- */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium">Feedstocks</h3>

              {form.feedstocks.length === 0 && (
                <p className="text-sm text-gray-500">
                  No feedstocks added
                </p>
              )}

              {form.feedstocks.map((f, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="w-full border px-3 py-2 rounded"
                    placeholder={`Feedstock ${i + 1}`}
                    value={f}
                    onChange={(e) =>
                      updateArray("feedstocks", i, e.target.value)
                    }
                  />

                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        feedstocks: form.feedstocks.filter(
                          (_, idx) => idx !== i
                        ),
                      })
                    }
                    className="text-xs text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                onClick={() =>
                  setForm({
                    ...form,
                    feedstocks: [...form.feedstocks, ""],
                  })
                }
                className="text-blue-600 text-sm"
              >
                + Add Feedstock
              </button>
            </div>


            {/* ---------------- Villages ---------------- */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium">Villages</h3>

              {villages.length === 0 && (
                <p className="text-sm text-gray-500">
                  No villages added
                </p>
              )}

              {villages.map((v, i) => (
                <div key={i} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">
                      Village {i + 1}
                    </h4>
                    <button
                      onClick={() => removeVillage(i)}
                      className="text-xs text-red-600"
                    >
                      Remove
                    </button>
                  </div>

                  <input
                    className="w-full border px-3 py-2 rounded"
                    placeholder="Village name"
                    value={v.name}
                    onChange={(e) =>
                      updateVillage(i, "name", e.target.value)
                    }
                  />

                  <LocationPicker
                    value={v.location}
                    onChange={(loc) =>
                      updateVillage(i, "location", loc)
                    }
                  />
                </div>
              ))}

              <button
                onClick={addVillage}
                className="text-blue-600 text-sm"
              >
                + Add Village
              </button>
            </div>

            {/* ---------------- Inspections ---------------- */}
            <h3 className="font-medium">Proper Usage Confirmed</h3>
            <label className="flex items-center gap-2 text-sm">
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
              Proper end use of biochar confirmed
            </label>

            <h3 className="font-medium">First internal inspection</h3>
            <input
              type="date"
              className="w-full border px-3 py-2 rounded"
              value={form.first_internal_inspection}
              onChange={(e) =>
                setForm({
                  ...form,
                  first_internal_inspection: e.target.value
                })
              }
            />

            <h3 className="font-medium">Last internal inspection</h3>
            <input
              type="date"
              className="w-full border px-3 py-2 rounded"
              value={form.last_internal_inspection}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_internal_inspection: e.target.value
                })
              }
            />

            <h3 className="font-medium">Last supervisor name</h3>
            <input
              className="w-full border px-3 py-2 rounded"
              value={form.last_supervisor_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_supervisor_name: e.target.value
                })
              }
            />

            <h3 className="font-medium">
              Last unannounced inspection
            </h3>
            <input
              type="date"
              className="w-full border px-3 py-2 rounded"
              value={form.last_unannounced_inspection}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_unannounced_inspection: e.target.value
                })
              }
            />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
