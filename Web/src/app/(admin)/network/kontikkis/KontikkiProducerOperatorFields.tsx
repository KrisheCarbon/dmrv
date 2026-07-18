"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface ProducerOption {
  id: string;
  name: string;
  producer_code?: string | null;
}

export interface ClimapreneurOption {
  id: string;
  full_name: string;
}

interface KontikkiProducerOperatorFieldsProps {
  producerId: string;
  operatorIds: string[];
  kontikkiName: string;
  onKontikkiNameChange: (name: string) => void;
  onProducerChange: (producerId: string) => void;
  onOperatorIdsChange: (operatorIds: string[]) => void;
}

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";

export default function KontikkiProducerOperatorFields({
  producerId,
  operatorIds,
  kontikkiName,
  onKontikkiNameChange,
  onProducerChange,
  onOperatorIdsChange,
}: KontikkiProducerOperatorFieldsProps) {
  const [producers, setProducers] = useState<ProducerOption[]>([]);
  const [climapreneurs, setClimapreneurs] = useState<ClimapreneurOption[]>([]);
  const [loadingClimapreneurs, setLoadingClimapreneurs] = useState(true);

  useEffect(() => {
    async function fetchProducers() {
      const { data } = await supabase
        .from("biochar_producers")
        .select("id, name, producer_code")
        .order("name");

      setProducers(data ?? []);
    }

    fetchProducers();
  }, []);

  useEffect(() => {
    async function fetchClimapreneurs() {
      setLoadingClimapreneurs(true);

      const { data } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "climapreneur")
        .order("full_name");

      setClimapreneurs(
        (data ?? []).map((user) => ({
          id: user.id,
          full_name: user.full_name?.trim() || "Unnamed climapreneur",
        })),
      );

      setLoadingClimapreneurs(false);
    }

    fetchClimapreneurs();
  }, []);

  const selectedOperators = climapreneurs.filter((c) =>
    operatorIds.includes(c.id),
  );
  const availableOperators = climapreneurs.filter(
    (c) => !operatorIds.includes(c.id),
  );

  function addOperator(operatorId: string) {
    if (!operatorId || operatorIds.includes(operatorId)) return;
    onOperatorIdsChange([...operatorIds, operatorId]);
  }

  function removeOperator(operatorId: string) {
    onOperatorIdsChange(operatorIds.filter((id) => id !== operatorId));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700">Name *</label>
        <input
          className={inputClass}
          placeholder="e.g. AE001"
          value={kontikkiName}
          onChange={(e) => onKontikkiNameChange(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700">Producer *</label>
        <select
          className={inputClass}
          value={producerId}
          onChange={(e) => onProducerChange(e.target.value)}
        >
          <option value="">Select producer</option>
          {producers.map((producer) => (
            <option key={producer.id} value={producer.id}>
              {producer.producer_code
                ? `${producer.name} (${producer.producer_code})`
                : producer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-sm font-medium text-neutral-700">
            Operators *
          </label>
          <p className="mt-0.5 text-xs text-neutral-500">
            Select one or more climapreneurs to operate this kontikki.
          </p>
        </div>

        <select
          className={inputClass}
          value=""
          disabled={loadingClimapreneurs || availableOperators.length === 0}
          onChange={(e) => {
            addOperator(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">
            {loadingClimapreneurs
              ? "Loading climapreneurs..."
              : availableOperators.length === 0
                ? selectedOperators.length > 0
                  ? "All climapreneurs selected"
                  : "No climapreneurs available"
                : "Add operator..."}
          </option>
          {availableOperators.map((climapreneur) => (
            <option key={climapreneur.id} value={climapreneur.id}>
              {climapreneur.full_name}
            </option>
          ))}
        </select>

        {selectedOperators.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedOperators.map((operator) => (
              <span
                key={operator.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
              >
                <span className="text-neutral-500" aria-hidden>
                  &#9679;
                </span>
                {operator.full_name}
                <button
                  type="button"
                  onClick={() => removeOperator(operator.id)}
                  className="ml-0.5 rounded-full px-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700"
                  aria-label={`Remove ${operator.full_name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No operators selected yet.</p>
        )}

        {!loadingClimapreneurs && climapreneurs.length === 0 ? (
          <p className="text-xs text-amber-700">
            No climapreneur accounts found. Add climapreneurs under Users first.
          </p>
        ) : null}
      </div>
    </div>
  );
}
