"use client";

import { useState, type ChangeEvent } from "react";
import VillageMapPicker from "@/components/maps/Villagepicker";
import Modal from "@/components/Modal";
import type { ClusterOnboardingRecord, SectionProps } from "./section-types";

const STORAGE_KEY = "csink:cluster-onboarding";

interface VillageFormState {
  name: string;
  farmersCount: string;
  cottonAcres: string;
  chilliAcres: string;
  sowingDate: string;
  harvestDate: string;
  biomassUsage: string;
  lat: string;
  lng: string;
}

interface ClusterFormState {
  clusterName: string;
  villages: VillageFormState[];
  retainedSamples: string;
  testingStatus: string;
  auditRemarks: string;
}

const initialVillage = (): VillageFormState => ({
  name: "",
  farmersCount: "",
  cottonAcres: "",
  chilliAcres: "",
  sowingDate: "",
  harvestDate: "",
  biomassUsage: "",
  lat: "",
  lng: "",
});

const initialForm = (): ClusterFormState => ({
  clusterName: "",
  villages: [],
  retainedSamples: "",
  testingStatus: "",
  auditRemarks: "",
});

function loadClustersFromStorage(): ClusterOnboardingRecord[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ClusterOnboardingRecord[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function ClusterOnboardingSection() {
  const [clusters, setClusters] = useState<ClusterOnboardingRecord[]>(loadClustersFromStorage);
  const [form, setForm] = useState<ClusterFormState>(initialForm());
  const [open, setOpen] = useState(false);

  function addVillage() {
    setForm((f) => ({
      ...f,
      villages: [...f.villages, initialVillage()],
    }));
  }

  function updateVillage(index: number, field: keyof VillageFormState, value: string) {
    const updated = [...form.villages];
    updated[index] = { ...updated[index], [field]: value };
    setForm((f) => ({ ...f, villages: updated }));
  }

  function removeVillage(index: number) {
    setForm((f) => ({
      ...f,
      villages: f.villages.filter((_, i) => i !== index),
    }));
  }

  function submitForm() {
    if (!form.clusterName || form.villages.length === 0) return;

    const id = crypto.randomUUID();

    const payload: ClusterOnboardingRecord = {
      id,
      name: form.clusterName,
      villages: form.villages.map((v) => ({
        name: v.name,
        farmersCount: Number(v.farmersCount),
        feedstock: {
          cottonAcres: Number(v.cottonAcres),
          chilliAcres: Number(v.chilliAcres),
        },
        sowingDate: v.sowingDate,
        harvestDate: v.harvestDate,
        biomassUsage: v.biomassUsage,
        gps: {
          lat: Number(v.lat),
          lng: Number(v.lng),
        },
      })),
    };

    const next = [...clusters, payload];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setClusters(next);
    setOpen(false);
    setForm(initialForm());
  }

  return (
    <>
      <details className="rounded-xl border bg-white shadow-sm" open>
        <summary className="flex justify-between px-5 py-4 cursor-pointer">
          <span className="text-lg font-semibold">Cluster Onboarding</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="rounded-full bg-black px-4 py-2 text-xs text-white"
          >
            + Add Cluster
          </button>
        </summary>

        <div className="border-t px-5 pb-4">
          <ul className="divide-y">
            {clusters.map((c) => (
              <li key={c.id} className="py-3">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {c.villages?.length || 0} villages
                </div>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cluster Onboarding"
        footer={
          <>
            <button
              onClick={() => setOpen(false)}
              className="border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={submitForm}
              className="bg-black text-white px-4 py-2 text-sm"
            >
              Save Cluster
            </button>
          </>
        }
      >
        <form className="grid gap-6">
          <Section title="Cluster">
            <Input
              label="Cluster Name"
              value={form.clusterName}
              onChange={(e) =>
                setForm((f) => ({ ...f, clusterName: e.target.value }))
              }
            />
          </Section>

          <Section title="Villages">
            {form.villages.map((v, i) => (
              <div key={i} className="border rounded p-3 space-y-3">
                <Input
                  label="Village Name"
                  value={v.name}
                  onChange={(e) => updateVillage(i, "name", e.target.value)}
                />

                <VillageMapPicker
                  value={{ lat: Number(v.lat) || 0, lng: Number(v.lng) || 0 }}
                  onChange={({ lat, lng, place_name }) => {
                    updateVillage(i, "lat", String(lat));
                    updateVillage(i, "lng", String(lng));
                    if (!v.name && place_name) {
                      updateVillage(i, "name", place_name);
                    }
                  }}
                />

                <Input
                  label="Number of Farmers"
                  value={v.farmersCount}
                  onChange={(e) =>
                    updateVillage(i, "farmersCount", e.target.value)
                  }
                />

                <Input
                  label="Cotton Acres"
                  value={v.cottonAcres}
                  onChange={(e) =>
                    updateVillage(i, "cottonAcres", e.target.value)
                  }
                />

                <Input
                  label="Chilli Acres"
                  value={v.chilliAcres}
                  onChange={(e) =>
                    updateVillage(i, "chilliAcres", e.target.value)
                  }
                />

                <Input
                  label="Sowing Date"
                  type="date"
                  value={v.sowingDate}
                  onChange={(e) =>
                    updateVillage(i, "sowingDate", e.target.value)
                  }
                />

                <Input
                  label="Harvest Date"
                  type="date"
                  value={v.harvestDate}
                  onChange={(e) =>
                    updateVillage(i, "harvestDate", e.target.value)
                  }
                />

                <Input
                  label="Biomass Usage"
                  value={v.biomassUsage}
                  onChange={(e) =>
                    updateVillage(i, "biomassUsage", e.target.value)
                  }
                />

                <button
                  type="button"
                  onClick={() => removeVillage(i)}
                  className="text-xs text-red-600"
                >
                  Remove Village
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addVillage}
              className="border px-3 py-1 text-xs rounded"
            >
              + Add Village
            </button>
          </Section>

          <Section title="Sampling & Audit">
            <Input
              label="Sampling Retention"
              value={form.retainedSamples}
              onChange={(e) =>
                setForm((f) => ({ ...f, retainedSamples: e.target.value }))
              }
            />
            <Input
              label="Testing Status"
              value={form.testingStatus}
              onChange={(e) =>
                setForm((f) => ({ ...f, testingStatus: e.target.value }))
              }
            />
            <Input
              label="Audit Remarks"
              value={form.auditRemarks}
              onChange={(e) =>
                setForm((f) => ({ ...f, auditRemarks: e.target.value }))
              }
            />
          </Section>
        </form>
      </Modal>
    </>
  );
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="border rounded-xl p-4 space-y-4">
      <h4 className="font-semibold text-sm">{title}</h4>
      {children}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={onChange}
        className="w-full border rounded px-3 py-2 text-sm"
      />
    </div>
  );
}
