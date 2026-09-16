"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getUserRoleChangeImpact,
  updateUser,
  type RoleChangeImpact,
} from "./actions";
import RoleSelect from "@/components/RoleSelect";
import {
  formatRoleLabel,
  getAssignableRoles,
  isClimapreneurSupervisorSwap,
  type UserRole,
} from "@/lib/roles";
import type { ModalCallbacks, UserFormData, UserProfile } from "@/types";

interface EditUserModalProps extends ModalCallbacks {
  data: UserProfile;
  actorRole: UserRole;
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}

export default function EditUserModal({
  data,
  actorRole,
  onClose,
  onSuccess,
}: EditUserModalProps) {
  const assignableRoles = getAssignableRoles(actorRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<RoleChangeImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [keepOperators, setKeepOperators] = useState(true);
  const [producerIds, setProducerIds] = useState<string[]>([]);
  const [reassignTo, setReassignTo] = useState("");

  const [form, setForm] = useState<UserFormData>({
    first_name: data.first_name ?? "",
    middle_name: data.middle_name ?? "",
    last_name: data.last_name ?? "",
    phone: data.phone ?? "",
    role: data.role ?? "climapreneur",
    status: data.status ?? "active",
    email: data.email,
    newPassword: "",
  });

  const roleSwap = isClimapreneurSupervisorSwap(data.role, form.role);
  const promoting = data.role === "climapreneur" && form.role === "supervisor";
  const demoting = data.role === "supervisor" && form.role === "climapreneur";

  useEffect(() => {
    if (!roleSwap) {
      setImpact(null);
      setImpactLoading(false);
      return;
    }

    let cancelled = false;
    setImpactLoading(true);
    setError(null);

    getUserRoleChangeImpact(data.id)
      .then((result) => {
        if (cancelled) return;
        setImpact(result);
        setKeepOperators(true);
        setReassignTo("");
        const inferred = [
          ...new Set([
            ...result.supervisedProducers.map((row) => row.id),
            ...result.operatorKontikkis
              .map((row) => row.producerId)
              .filter((id): id is string => Boolean(id)),
          ]),
        ];
        setProducerIds(inferred);
      })
      .catch((err) => {
        if (cancelled) return;
        setImpact(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load related assignments for this role change.",
        );
      })
      .finally(() => {
        if (!cancelled) setImpactLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data.id, data.role, form.role, roleSwap]);

  const operatorSummary = useMemo(() => {
    if (!impact?.operatorKontikkis.length) return "None";
    return impact.operatorKontikkis
      .map((row) =>
        row.producerName ? `${row.code} (${row.producerName})` : row.code,
      )
      .join(", ");
  }, [impact]);

  function toggleProducer(producerId: string) {
    setProducerIds((current) =>
      current.includes(producerId)
        ? current.filter((id) => id !== producerId)
        : [...current, producerId],
    );
  }

  async function handleSubmit() {
    setError(null);

    if (form.newPassword?.trim() && form.newPassword.trim().length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (roleSwap && impactLoading) {
      setError("Wait for related assignments to load before saving.");
      return;
    }

    if (promoting && producerIds.length === 0) {
      setError("Assign at least one producer. Supervisors belong to a producer site.");
      return;
    }

    if (
      demoting &&
      impact &&
      impact.pendingSoilSamples > 0 &&
      !reassignTo
    ) {
      setError("Choose a supervisor to take the waiting soil samples.");
      return;
    }

    setLoading(true);

    try {
      await updateUser(
        data.id,
        form,
        roleSwap
          ? {
              keepOperatorAssignments: keepOperators,
              producerIds,
              reassignSoilSamplesTo: reassignTo || null,
            }
          : undefined,
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex justify-center py-10">
          <div className="bg-white w-full max-w-xl p-6 rounded space-y-4">
            <h2 className="text-lg font-semibold">Edit User</h2>

            <p className="text-sm text-gray-500">{data.email}</p>

            <input
              placeholder="First name"
              className="w-full border px-3 py-2 rounded"
              value={form.first_name}
              onChange={(e) =>
                setForm({ ...form, first_name: e.target.value })
              }
            />

            <input
              placeholder="Middle name"
              className="w-full border px-3 py-2 rounded"
              value={form.middle_name}
              onChange={(e) =>
                setForm({ ...form, middle_name: e.target.value })
              }
            />

            <input
              placeholder="Last name"
              className="w-full border px-3 py-2 rounded"
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
            />

            <input
              placeholder="Phone"
              className="w-full border px-3 py-2 rounded"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <RoleSelect
              value={form.role}
              roles={assignableRoles}
              onChange={(role) => setForm({ ...form, role })}
            />

            <select
              className="w-full border px-3 py-2 rounded"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="pending_auth">Invited</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <p className="text-xs text-gray-500 -mt-2">
              Active users can sign in to the app. Invited users cannot until you
              activate them here.
            </p>

            <div className="space-y-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Set a new password (optional)"
                  className="w-full border px-3 py-2 rounded font-mono text-sm"
                  value={form.newPassword ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, newPassword: e.target.value })
                  }
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="shrink-0 border px-3 py-2 rounded text-sm"
                  onClick={() =>
                    setForm({ ...form, newPassword: generatePassword() })
                  }
                >
                  Generate
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Use this if the setup email never arrived. Share the password,
                then mark them Active.
              </p>
            </div>

            {roleSwap ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-amber-950">
                    This role change has related assignments
                  </p>
                  <p className="mt-1 text-sm text-amber-900">
                    {promoting
                      ? "Supervisors belong to a producer site, can use the web portal, and can operate any kontikki at that site. A label-only change is not enough."
                      : "Climapreneurs use the mobile app and operate the kontikkis they are assigned to. They cannot stay as a site supervisor."}
                  </p>
                </div>

                {impactLoading ? (
                  <p className="text-sm text-amber-900">
                    Loading related assignments…
                  </p>
                ) : impact ? (
                  <>
                    <p className="text-sm text-neutral-800">
                      Currently operates: {operatorSummary}
                    </p>

                    {impact.supervisedProducers.length > 0 ? (
                      <p className="text-sm text-neutral-800">
                        Currently supervises:{" "}
                        {impact.supervisedProducers
                          .map((row) => row.name)
                          .join(", ")}
                      </p>
                    ) : null}

                    <label className="flex items-start gap-2 text-sm text-neutral-800">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={keepOperators}
                        onChange={(e) => setKeepOperators(e.target.checked)}
                      />
                      <span>
                        Keep them as operator of the assigned kontikkis
                        {promoting
                          ? ". Supervisors at a producer site can also operate any kontikki there."
                          : "."}
                      </span>
                    </label>

                    {promoting ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-neutral-900">
                          Assign as supervisor of *
                        </p>
                        {impact.producers.length === 0 ? (
                          <p className="text-sm text-red-700">
                            No producers found. Create a producer before promoting
                            this person.
                          </p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto rounded border border-amber-200 bg-white p-2 space-y-1">
                            {impact.producers.map((producer) => (
                              <label
                                key={producer.id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={producerIds.includes(producer.id)}
                                  onChange={() => toggleProducer(producer.id)}
                                />
                                {producer.name}
                              </label>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-neutral-600">
                          They will get web portal access and can receive soil
                          samples from climapreneurs at these sites.
                        </p>
                      </div>
                    ) : null}

                    {demoting ? (
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-800">
                          They will be removed as supervisor of their current
                          producer site{impact.supervisedProducers.length === 1 ? "" : "s"}{" "}
                          and lose web portal access.
                        </p>
                        {impact.pendingSoilSamples > 0 ? (
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-neutral-900">
                              {impact.pendingSoilSamples} soil sample
                              {impact.pendingSoilSamples === 1 ? "" : "s"} waiting
                              for this supervisor. Reassign to *
                            </p>
                            {impact.otherSupervisors.length === 0 ? (
                              <p className="text-sm text-red-700">
                                There is no other supervisor to take these samples.
                                Create one first.
                              </p>
                            ) : (
                              <select
                                className="w-full border px-3 py-2 rounded bg-white"
                                value={reassignTo}
                                onChange={(e) => setReassignTo(e.target.value)}
                              >
                                <option value="">Select supervisor</option>
                                {impact.otherSupervisors.map((supervisor) => (
                                  <option key={supervisor.id} value={supervisor.id}>
                                    {supervisor.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {impact.hasBankAccount ? (
                      <p className="text-xs text-neutral-600">
                        Bank details stay on the account.
                      </p>
                    ) : null}

                    <p className="text-xs text-neutral-500">
                      Changing {formatRoleLabel(data.role)} to{" "}
                      {formatRoleLabel(form.role)}.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-700">
                    Related assignments could not be loaded.
                  </p>
                )}
              </div>
            ) : null}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-4">
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={loading || (roleSwap && impactLoading)}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
