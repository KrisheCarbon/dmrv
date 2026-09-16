"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCluster,
  getClusterFormOptions,
  updateCluster,
} from "./actions";
import type { ClusterDetail, ClusterPerson, ClusterVillage } from "@/types";
import { villagePlaceLine, type ClusterVillageInput } from "@krishecarbon/shared";

interface ClusterFormProps {
  mode: "create" | "edit";
  data?: ClusterDetail | null;
  onCancel: () => void;
  onSuccess?: (id: string) => void;
}

const sectionClass =
  "space-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0";
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";
const sectionEyebrowClass =
  "text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400";

function personLabel(person: ClusterPerson) {
  const name = person.full_name.trim() || "Unnamed";
  return person.phone ? `${name} (${person.phone})` : name;
}

function PersonPicker({
  label,
  hint,
  people,
  ids,
  loading,
  emptyText,
  onChange,
}: {
  label: string;
  hint: string;
  people: ClusterPerson[];
  ids: string[];
  loading: boolean;
  emptyText: string;
  onChange: (ids: string[]) => void;
}) {
  const selected = people.filter((person) => ids.includes(person.id));
  const available = people.filter((person) => !ids.includes(person.id));

  return (
    <div className="space-y-2">
      <div>
        <label className={labelClass}>{label}</label>
        <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      </div>
      <select
        className={inputClass}
        value=""
        disabled={loading || available.length === 0}
        onChange={(event) => {
          const value = event.target.value;
          if (!value || ids.includes(value)) return;
          onChange([...ids, value]);
          event.target.value = "";
        }}
      >
        <option value="">
          {loading
            ? `Loading ${label.toLowerCase()}...`
            : available.length === 0
              ? selected.length > 0
                ? `All ${label.toLowerCase()} selected`
                : emptyText
              : `Add ${label.slice(0, -1).toLowerCase()}...`}
        </option>
        {available.map((person) => (
          <option key={person.id} value={person.id}>
            {personLabel(person)}
          </option>
        ))}
      </select>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {selected.map((person) => (
            <span
              key={person.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              {person.full_name}
              <button
                type="button"
                onClick={() =>
                  onChange(ids.filter((id) => id !== person.id))
                }
                className="ml-0.5 rounded-full px-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700"
                aria-label={`Remove ${person.full_name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">None selected yet.</p>
      )}
    </div>
  );
}

function villageFromRecord(village: ClusterVillage): ClusterVillageInput {
  return {
    id: village.id,
    village_name: village.village_name,
    mandal: village.mandal ?? "",
    district: village.district ?? "",
    state: village.state ?? "",
  };
}

const emptyVillageDraft = (): ClusterVillageInput => ({
  village_name: "",
  mandal: "",
  district: "",
  state: "",
});

export default function ClusterForm({
  mode,
  data = null,
  onCancel,
  onSuccess,
}: ClusterFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(data?.name ?? "");
  const [villageDraft, setVillageDraft] = useState<ClusterVillageInput>(
    emptyVillageDraft,
  );
  const [villages, setVillages] = useState<ClusterVillageInput[]>(
    () => data?.villages.map(villageFromRecord) ?? [],
  );
  const [supervisorIds, setSupervisorIds] = useState<string[]>(
    () => data?.supervisors.map((person) => person.id) ?? [],
  );
  const [climapreneurIds, setClimapreneurIds] = useState<string[]>(
    () => data?.climapreneurs.map((person) => person.id) ?? [],
  );
  const [supervisors, setSupervisors] = useState<ClusterPerson[]>(
    data?.supervisors ?? [],
  );
  const [climapreneurs, setClimapreneurs] = useState<ClusterPerson[]>(
    data?.climapreneurs ?? [],
  );
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    async function loadOptions() {
      setOptionsLoading(true);
      try {
        const options = await getClusterFormOptions();
        setSupervisors(options.supervisors);
        setClimapreneurs(options.climapreneurs);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load supervisors and climapreneurs",
        );
      } finally {
        setOptionsLoading(false);
      }
    }

    loadOptions();
  }, []);

  function addVillage() {
    const village_name = villageDraft.village_name.trim();
    const mandal = villageDraft.mandal.trim();
    const district = villageDraft.district.trim();
    const state = villageDraft.state.trim();
    if (!village_name || !mandal || !district || !state) {
      setError("Village, mandal/block, district, and state are required.");
      return;
    }
    const exists = villages.some(
      (item) => item.village_name.toLowerCase() === village_name.toLowerCase(),
    );
    if (exists) {
      setError("That village is already in this cluster.");
      return;
    }
    setError(null);
    setVillages([
      ...villages,
      { village_name, mandal, district, state },
    ]);
    setVillageDraft({
      village_name: "",
      mandal: "",
      district,
      state,
    });
  }

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError("Cluster name is required.");
      return;
    }
    if (villages.length === 0) {
      setError("Add at least one village.");
      return;
    }

    setLoading(true);
    const payload = {
      name: name.trim(),
      villages,
      supervisor_ids: supervisorIds,
      climapreneur_ids: climapreneurIds,
    };

    try {
      if (isEdit && data) {
        const updated = await updateCluster(data.id, payload);
        if (onSuccess) onSuccess(updated.id);
        else router.push(`/network/clusters/${updated.id}`);
      } else {
        const created = await createCluster(payload);
        if (onSuccess) onSuccess(created.id);
        else router.push(`/network/clusters/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cluster");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Cluster</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Cluster details
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Name the cluster, add the villages it covers with their location,
            and assign the field team on the ground.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Cluster name *</label>
          <input
            className={inputClass}
            placeholder="e.g. Parkal"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Coverage</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Villages
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Add every village that belongs to this cluster, with mandal/block,
            district, and state. Climapreneurs will only see these villages
            when onboarding farmers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>Village *</label>
            <input
              className={inputClass}
              placeholder="Village name"
              value={villageDraft.village_name}
              onChange={(event) =>
                setVillageDraft({
                  ...villageDraft,
                  village_name: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addVillage();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Mandal / block *</label>
            <input
              className={inputClass}
              placeholder="Mandal or block"
              value={villageDraft.mandal}
              onChange={(event) =>
                setVillageDraft({ ...villageDraft, mandal: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>District *</label>
            <input
              className={inputClass}
              placeholder="District"
              value={villageDraft.district}
              onChange={(event) =>
                setVillageDraft({
                  ...villageDraft,
                  district: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>State *</label>
            <input
              className={inputClass}
              placeholder="State"
              value={villageDraft.state}
              onChange={(event) =>
                setVillageDraft({ ...villageDraft, state: event.target.value })
              }
            />
          </div>
        </div>
        <button
          type="button"
          onClick={addVillage}
          className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Add village
        </button>

        {villages.length > 0 ? (
          <div className="space-y-2">
            {villages.map((village) => (
              <div
                key={`${village.id ?? ""}-${village.village_name}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {village.village_name}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {villagePlaceLine(village)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setVillages(
                      villages.filter(
                        (item) =>
                          item.village_name.toLowerCase() !==
                          village.village_name.toLowerCase(),
                      ),
                    )
                  }
                  className="rounded-full px-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700"
                  aria-label={`Remove ${village.village_name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No villages added yet.</p>
        )}
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Team</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Assign field staff
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Choose from every supervisor and climapreneur account.
          </p>
        </div>

        <PersonPicker
          label="Supervisors"
          hint="All supervisor accounts are listed here."
          people={supervisors}
          ids={supervisorIds}
          loading={optionsLoading}
          emptyText="No supervisors available"
          onChange={setSupervisorIds}
        />
        <PersonPicker
          label="Climapreneurs"
          hint="All climapreneur accounts are listed here."
          people={climapreneurs}
          ids={climapreneurIds}
          loading={optionsLoading}
          emptyText="No climapreneurs available"
          onChange={setClimapreneurIds}
        />
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark-hover disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : isEdit
              ? "Save cluster"
              : "Create cluster"}
        </button>
      </div>
    </div>
  );
}
