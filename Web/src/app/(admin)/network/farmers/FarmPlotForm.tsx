"use client";

import { useState, type ChangeEvent } from "react";
import LocationPicker from "@/components/maps/Locationpicker";
import { createFarmField, updateFarmField } from "../fields/actions";
import { uploadFarmerNetworkPhoto } from "@/lib/uploadFarmerNetworkPhotos";
import type { LocationValue } from "@/types";
import {
  CROP_OPTIONS,
  FIELD_SEASONS,
  FIELD_WATER_SOURCES,
  formatHectaresFromAcres,
  isOverOneHectare,
  type FarmFieldRecord,
} from "@krishecarbon/shared";

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";

interface FarmPlotFormProps {
  farmerId: string;
  cultivatedLand: number;
  usedArea: number;
  initial?: FarmFieldRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function FarmPlotForm({
  farmerId,
  cultivatedLand,
  usedArea,
  initial = null,
  onSaved,
  onCancel,
}: FarmPlotFormProps) {
  const [ownership, setOwnership] = useState(initial?.ownership_type || "Owned");
  const [landReference, setLandReference] = useState(initial?.land_reference || "");
  const [leaseStart, setLeaseStart] = useState(initial?.lease_start || "");
  const [leaseEnd, setLeaseEnd] = useState(initial?.lease_end || "");
  const [area, setArea] = useState(
    initial?.calculated_area != null ? String(initial.calculated_area) : "",
  );
  const [water, setWater] = useState(initial?.water_source || "Rainfed");
  const [crop, setCrop] = useState(initial?.crop_name || CROP_OPTIONS[0]);
  const [season, setSeason] = useState(initial?.season || "Kharif");
  const [sowing, setSowing] = useState(initial?.sowing_date || "");
  const [harvest, setHarvest] = useState(initial?.harvest_date || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [gps, setGps] = useState<LocationValue | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { lat: Number(initial.latitude), lng: Number(initial.longitude) }
      : null,
  );
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [cropPhotoFiles, setCropPhotoFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaNum = Number(area) || 0;
  const remaining = Math.max(
    cultivatedLand - usedArea + Number(initial?.calculated_area ?? 0),
    0,
  );

  async function handleSave() {
    setError(null);
    if (!areaNum) {
      setError("Enter plot area in acres.");
      return;
    }
    if (ownership === "Leased" && !leaseEnd) {
      setError("Lease end date is needed for leased farms.");
      return;
    }
    if (areaNum > remaining + 0.0001) {
      setError(`Area cannot exceed remaining cultivated land (${remaining} acres).`);
      return;
    }

    setSaving(true);
    try {
      const id = initial?.id || crypto.randomUUID();
      const photos = [...(initial?.photos ?? [])];
      for (const file of photoFiles.slice(0, 5)) {
        photos.push(await uploadFarmerNetworkPhoto({ file, folder: `fields/${id}` }));
      }
      const cropPhotos = [...(initial?.crop_photos ?? [])];
      for (const file of cropPhotoFiles.slice(0, 5)) {
        cropPhotos.push(
          await uploadFarmerNetworkPhoto({ file, folder: `fields/${id}/crop` }),
        );
      }

      const payload = {
        farm_id: farmerId,
        ownership_type: ownership,
        land_reference: landReference.trim() || null,
        lease_start: ownership === "Leased" ? leaseStart || null : null,
        lease_end: ownership === "Leased" ? leaseEnd || null : null,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        calculated_area: areaNum,
        water_source: water,
        notes: notes.trim() || null,
        crop_name: crop,
        season,
        sowing_date: sowing || null,
        harvest_date: harvest || null,
        photos,
        crop_photos: cropPhotos,
      };

      if (initial?.id) {
        await updateFarmField(initial.id, payload);
      } else {
        await createFarmField({ id, ...payload });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save farm");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        {remaining.toFixed(2)} of {cultivatedLand || 0} acres remaining for new farms.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass}>Ownership *</label>
          <select className={inputClass} value={ownership} onChange={(e) => setOwnership(e.target.value)}>
            <option value="Owned">Owned</option>
            <option value="Leased">Leased</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Land title / lease reference</label>
          <input className={inputClass} value={landReference} onChange={(e) => setLandReference(e.target.value)} />
        </div>
        {ownership === "Leased" ? (
          <>
            <div className="space-y-1.5">
              <label className={labelClass}>Lease start</label>
              <input type="date" className={inputClass} value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Lease end *</label>
              <input type="date" className={inputClass} value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} />
            </div>
          </>
        ) : null}
        <div className="space-y-1.5">
          <label className={labelClass}>Plot area (acres) *</label>
          <input type="number" className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} />
          {areaNum > 0 ? (
            <p className="text-xs text-neutral-500">
              {areaNum} acres ≈ {formatHectaresFromAcres(areaNum)} ha
              {isOverOneHectare(areaNum) ? " · over 1 hectare, map the boundary in the field app" : ""}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Water source</label>
          <select className={inputClass} value={water} onChange={(e) => setWater(e.target.value)}>
            {FIELD_WATER_SOURCES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Crop</label>
          <select className={inputClass} value={crop} onChange={(e) => setCrop(e.target.value)}>
            {CROP_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Season</label>
          <select className={inputClass} value={season} onChange={(e) => setSeason(e.target.value)}>
            {FIELD_SEASONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Sowing date</label>
          <input type="date" className={inputClass} value={sowing} onChange={(e) => setSowing(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Harvest date</label>
          <input type="date" className={inputClass} value={harvest} onChange={(e) => setHarvest(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Farm GPS</label>
        <LocationPicker value={gps} onChange={setGps} allowClear />
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Notes</label>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass}>Farm photos (max 5)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setPhotoFiles(Array.from(e.target.files ?? []).slice(0, 5))
            }
            className="block w-full text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Crop photos (max 5)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setCropPhotoFiles(Array.from(e.target.files ?? []).slice(0, 5))
            }
            className="block w-full text-sm"
          />
        </div>
      </div>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : initial ? "Save farm" : "Add farm"}
        </button>
      </div>
    </div>
  );
}
