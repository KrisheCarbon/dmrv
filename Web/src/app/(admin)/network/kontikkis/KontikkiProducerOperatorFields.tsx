"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatRoleLabel } from "@/lib/roles";

export interface ProducerOption {
  id: string;
  name: string;
  producer_code?: string | null;
}

export interface OperatorOption {
  id: string;
  full_name: string;
  role: string;
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

function operatorLabel(operator: OperatorOption) {
  const name = operator.full_name.trim() || "Unnamed";
  if (operator.role === "climapreneur") return name;
  return `${name} (${formatRoleLabel(operator.role)})`;
}

export default function KontikkiProducerOperatorFields({
  producerId,
  operatorIds,
  kontikkiName,
  onKontikkiNameChange,
  onProducerChange,
  onOperatorIdsChange,
}: KontikkiProducerOperatorFieldsProps) {
  const [producers, setProducers] = useState<ProducerOption[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(true);

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
    async function fetchOperators() {
      const showLoading = operators.length === 0;
      if (showLoading) setLoadingOperators(true);

      const climapreneursQuery = supabase
        .from("users")
        .select("id, full_name, role")
        .eq("role", "climapreneur")
        .order("full_name");

      const assignedQuery =
        operatorIds.length > 0
          ? supabase
              .from("users")
              .select("id, full_name, role")
              .in("id", operatorIds)
          : Promise.resolve({ data: [] as OperatorOption[] });

      const supervisorLinksQuery = producerId
        ? supabase
            .from("biochar_producer_supervisors")
            .select("supervisor_id")
            .eq("biochar_producer_id", producerId)
        : Promise.resolve({ data: [] as Array<{ supervisor_id: string }> });

      const [climapreneursRes, assignedRes, supervisorLinksRes] =
        await Promise.all([
          climapreneursQuery,
          assignedQuery,
          supervisorLinksQuery,
        ]);

      const supervisorIds = (supervisorLinksRes.data ?? []).map(
        (row) => row.supervisor_id as string,
      );
      const supervisorsRes =
        supervisorIds.length > 0
          ? await supabase
              .from("users")
              .select("id, full_name, role")
              .in("id", supervisorIds)
              .order("full_name")
          : { data: [] as OperatorOption[] };

      const byId = new Map<string, OperatorOption>();
      for (const row of [
        ...(climapreneursRes.data ?? []),
        ...(supervisorsRes.data ?? []),
        ...(assignedRes.data ?? []),
      ]) {
        byId.set(row.id, {
          id: row.id,
          full_name: row.full_name?.trim() || "Unnamed",
          role: row.role ?? "climapreneur",
        });
      }

      setOperators(
        [...byId.values()].sort((a, b) =>
          a.full_name.localeCompare(b.full_name),
        ),
      );
      setLoadingOperators(false);
    }

    fetchOperators();
    // operatorIds joined: refetch when the assigned set changes, not on array identity.
  }, [producerId, operatorIds.join(",")]);

  const selectedOperators = useMemo(
    () => operators.filter((operator) => operatorIds.includes(operator.id)),
    [operators, operatorIds],
  );
  const availableOperators = useMemo(
    () => operators.filter((operator) => !operatorIds.includes(operator.id)),
    [operators, operatorIds],
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
            Climapreneurs, plus supervisors assigned to this producer, can operate
            this kontikki.
          </p>
        </div>

        <select
          className={inputClass}
          value=""
          disabled={loadingOperators || availableOperators.length === 0}
          onChange={(e) => {
            addOperator(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">
            {loadingOperators
              ? "Loading operators..."
              : availableOperators.length === 0
                ? selectedOperators.length > 0
                  ? "All eligible operators selected"
                  : "No operators available"
                : "Add operator..."}
          </option>
          {availableOperators.map((operator) => (
            <option key={operator.id} value={operator.id}>
              {operatorLabel(operator)}
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
                {operatorLabel(operator)}
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

        {!loadingOperators && operators.length === 0 ? (
          <p className="text-xs text-amber-700">
            No eligible operators found. Add climapreneurs under Users, or assign
            a supervisor to this producer.
          </p>
        ) : null}
      </div>
    </div>
  );
}
