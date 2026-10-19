"use client";

import { useState, type FormEvent } from "react";
import { saveRateCard } from "./actions";
import {
  type FarmBasis,
  type PaymentOptions,
  type PaymentScope,
  type RateCard,
  type RateInput,
} from "./paymentsLib";

const inputClass =
  "min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-950";

interface RateCardFormProps {
  options: PaymentOptions;
  card?: RateCard | null;
  onCancel: () => void;
  onSaved: () => void;
}

export default function RateCardForm({ options, card, onCancel, onSaved }: RateCardFormProps) {
  const [name, setName] = useState(card?.name ?? "");
  const [allSites, setAllSites] = useState(card?.scope === "all_producers");
  const [producerIds, setProducerIds] = useState<string[]>(
    card && card.scope !== "all_producers" ? card.producer_ids : [],
  );
  const [villageIds, setVillageIds] = useState<string[]>(
    card?.scope === "villages" ? card.village_ids : [],
  );
  const [effectiveFrom, setEffectiveFrom] = useState(card?.effective_from ?? "");
  const [effectiveTo, setEffectiveTo] = useState(card?.effective_to ?? "");
  const [notes, setNotes] = useState(card?.notes ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const rate of card?.rates ?? []) initial[rate.activity] = String(rate.amount_inr);
    return initial;
  });
  const [farmBasis, setFarmBasis] = useState<FarmBasis>(
    card?.rates.find((rate) => rate.activity === "farm_registration")?.farm_basis ?? "any_farm",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const rates: RateInput[] = [];
    for (const activity of options.activities) {
      const raw = amounts[activity.activity]?.trim() ?? "";
      if (!raw) continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(`Enter a valid amount for ${activity.label}.`);
        return;
      }
      rates.push({
        activity: activity.activity,
        amount_inr: amount,
        farm_basis: activity.activity === "farm_registration" ? farmBasis : null,
      });
    }
    if (rates.length === 0) {
      setError("Enter an amount for at least one activity.");
      return;
    }
    if (!allSites && producerIds.length === 0 && villageIds.length === 0) {
      setError("Choose all sites, or tick at least one producer or village.");
      return;
    }

    const scope: PaymentScope = allSites
      ? "all_producers"
      : villageIds.length > 0
        ? "villages"
        : "producers";

    setSaving(true);
    try {
      await saveRateCard(
        {
          name: name.trim(),
          scope,
          producer_ids: allSites ? [] : producerIds,
          village_ids: scope === "villages" ? villageIds : [],
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
          notes: notes.trim() || null,
          rates,
        },
        card?.id,
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the rate card.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-medium text-neutral-950">
          {card ? "Edit rate card" : "New rate card"}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Tick all sites, or open a producer and tick that site or only some of its villages. A
          later card for the same place replaces the earlier one from its start date. Checking a
          producer pays every village there, including pyrolysis at that site. Checking only
          villages pays those villages, and does not pay pyrolysis.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error">
          {error}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-700">Name</span>
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Sagar — all villages"
          required
        />
      </label>

      <PlacePicker
        producers={options.producers}
        allSites={allSites}
        producerIds={producerIds}
        villageIds={villageIds}
        onAllSites={setAllSites}
        onProducerIds={setProducerIds}
        onVillageIds={setVillageIds}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-700">Starts on</span>
          <input
            type="date"
            className={inputClass}
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-700">Ends on</span>
          <input
            type="date"
            className={inputClass}
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
          <span className="text-xs text-neutral-500">Leave empty if this rate is still in force.</span>
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-neutral-700">Amounts per entry (INR)</p>
        <p className="text-sm text-neutral-500">
          Leave an activity blank if it is not paid under this card. A village rate overrides a
          site rate, and a site rate overrides the all-sites rate, for work done inside the dates.
          Farmer, farm, soil, mixing, biomass, and application entries use the farmer’s village.
          A pyrolysis batch uses the producer site, so a village-only card does not pay it.
        </p>
        {options.activities.map((activity) => (
          <div key={activity.activity} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <div>
              <label className="block text-sm text-neutral-800" htmlFor={`amount-${activity.activity}`}>
                {activity.label}
              </label>
              {activity.activity === "farm_registration" ? (
                <select
                  className="mt-1 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                  value={farmBasis}
                  onChange={(event) => setFarmBasis(event.target.value as FarmBasis)}
                  aria-label="When a farm is paid"
                >
                  {options.farm_bases.map((basis) => (
                    <option key={basis.basis} value={basis.basis}>
                      {basis.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <input
              id={`amount-${activity.activity}`}
              inputMode="decimal"
              className={inputClass}
              value={amounts[activity.activity] ?? ""}
              onChange={(event) =>
                setAmounts((current) => ({
                  ...current,
                  [activity.activity]: event.target.value,
                }))
              }
              placeholder="0"
              aria-label={`${activity.label} amount`}
            />
          </div>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-700">Note</span>
        <textarea
          className="min-h-24 w-full rounded-xl border border-neutral-300 px-3 py-2 text-base"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional. For example, agreed with the Sagar team in April."
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save rate card"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PlacePicker({
  producers,
  allSites,
  producerIds,
  villageIds,
  onAllSites,
  onProducerIds,
  onVillageIds,
}: {
  producers: PaymentOptions["producers"];
  allSites: boolean;
  producerIds: string[];
  villageIds: string[];
  onAllSites: (value: boolean) => void;
  onProducerIds: (value: string[]) => void;
  onVillageIds: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>(() =>
    producers
      .filter((producer) => producer.villages.some((village) => villageIds.includes(village.id)))
      .map((producer) => producer.id),
  );
  const needle = query.trim().toLowerCase();
  const visible = producers.filter((producer) => {
    if (!needle) return true;
    if (producer.name.toLowerCase().includes(needle)) return true;
    return producer.villages.some((village) => village.name.toLowerCase().includes(needle));
  });

  function toggleProducer(producerId: string) {
    if (allSites) onAllSites(false);
    const producer = producers.find((item) => item.id === producerId);
    const ownVillageIds = new Set(producer?.villages.map((village) => village.id) ?? []);
    if (producerIds.includes(producerId)) {
      onProducerIds(producerIds.filter((id) => id !== producerId));
      return;
    }
    onProducerIds([...producerIds, producerId]);
    onVillageIds(
      villageIds.filter((id) => {
        if (!ownVillageIds.has(id)) return true;
        return producers.some(
          (other) =>
            other.id !== producerId &&
            !producerIds.includes(other.id) &&
            other.id !== producerId &&
            other.villages.some((village) => village.id === id),
        );
      }),
    );
  }

  function toggleVillage(producerId: string, villageId: string) {
    if (allSites) onAllSites(false);
    const producer = producers.find((item) => item.id === producerId);
    const siblingIds = producer?.villages.map((village) => village.id) ?? [];
    if (producerIds.includes(producerId)) {
      onProducerIds(producerIds.filter((id) => id !== producerId));
      onVillageIds([
        ...villageIds.filter((id) => !siblingIds.includes(id)),
        ...siblingIds.filter((id) => id !== villageId),
      ]);
      return;
    }
    if (villageIds.includes(villageId)) {
      onVillageIds(villageIds.filter((id) => id !== villageId));
      return;
    }
    const next = [...villageIds, villageId];
    const allSiblings = siblingIds.length > 0 && siblingIds.every((id) => next.includes(id));
    if (allSiblings) {
      onProducerIds([...producerIds, producerId]);
      onVillageIds(next.filter((id) => !siblingIds.includes(id)));
      return;
    }
    onVillageIds(next);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-neutral-700">Where this applies</legend>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-300 px-3 text-sm text-neutral-950">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={allSites}
          onChange={(event) => {
            onAllSites(event.target.checked);
            if (event.target.checked) {
              onProducerIds([]);
              onVillageIds([]);
            }
          }}
        />
        All producer sites
      </label>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a producer or village"
        disabled={allSites}
        className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 text-base disabled:opacity-50"
      />
      <div
        className={`max-h-80 space-y-1 overflow-y-auto rounded-xl border border-neutral-300 p-2 ${
          allSites ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-sm text-neutral-500">No producers match.</p>
        ) : (
          visible.map((producer) => {
            const expanded = open.includes(producer.id) || needle.length > 0;
            const producerOn = producerIds.includes(producer.id);
            return (
              <div key={producer.id}>
                <div className="flex min-h-12 items-center gap-2 rounded-xl px-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={producerOn}
                    onChange={() => toggleProducer(producer.id)}
                    aria-label={producer.name}
                  />
                  <span className="flex-1 text-sm text-neutral-950">{producer.name}</span>
                  {producer.villages.length > 0 ? (
                    <button
                      type="button"
                      className="min-h-12 px-2 text-sm font-medium text-brand-dark"
                      onClick={() =>
                        setOpen((current) =>
                          current.includes(producer.id)
                            ? current.filter((id) => id !== producer.id)
                            : [...current, producer.id],
                        )
                      }
                    >
                      {expanded ? "Hide villages" : `Villages (${producer.villages.length})`}
                    </button>
                  ) : (
                    <span className="text-sm text-neutral-500">No villages linked</span>
                  )}
                </div>
                {expanded
                  ? producer.villages
                      .filter((village) => !needle || village.name.toLowerCase().includes(needle) || producer.name.toLowerCase().includes(needle))
                      .map((village) => (
                        <label
                          key={`${producer.id}-${village.id}`}
                          className="ml-8 flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm text-neutral-800"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={producerOn || villageIds.includes(village.id)}
                            onChange={() => toggleVillage(producer.id, village.id)}
                          />
                          {village.name}
                        </label>
                      ))
                  : null}
              </div>
            );
          })
        )}
      </div>
    </fieldset>
  );
}

