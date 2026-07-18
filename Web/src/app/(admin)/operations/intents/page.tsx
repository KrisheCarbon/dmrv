"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import {
  fetchIntents,
  updateIntentStatus,
} from "@/lib/intents";
import type { IntentConfirmState, RoiIntent } from "@/types";

export default function RegisterIntentAdminPage() {
  const [loading, setLoading] = useState(true);
  const [intents, setIntents] = useState<RoiIntent[]>([]);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("pending");
  const [queryFilter, setQueryFilter] = useState("all");

  const [confirm, setConfirm] = useState<IntentConfirmState | null>(null);

  async function loadIntents() {
    setLoading(true);
    setError("");

    const res = await fetchIntents({
      status: statusFilter,
      queryType: queryFilter,
    });

    if (!res.ok) {
      setError(res.error || "Failed to load intents");
      setIntents([]);
    } else {
      setIntents(res.intents ?? []);
    }

    setLoading(false);
  }

  /* =========================
     LOAD INTENTS (WITH FILTERS)
  ========================== */
  useEffect(() => {
    async function loadIntentsFromEffect() {
      setLoading(true);
      setError("");

      const res = await fetchIntents({
        status: statusFilter,
        queryType: queryFilter,
      });

      if (!res.ok) {
        setError(res.error || "Failed to load intents");
        setIntents([]);
      } else {
        setIntents(res.intents ?? []);
      }

      setLoading(false);
    }

    loadIntentsFromEffect();
  }, [statusFilter, queryFilter]);

  /* =========================
     CONFIRM HANDLERS
  ========================== */
  function openConfirm(type: IntentConfirmState["type"], intent: RoiIntent) {
    setConfirm({ type, intent });
  }

  async function performDecision() {
    if (!confirm) return;

    try {
      await updateIntentStatus(
        confirm.intent.id,
        confirm.type === "accept" ? "accepted" : "rejected"
      );

      setConfirm(null);
      loadIntents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  /* =========================
     TABLE COLUMNS
  ========================== */
  const columns = useMemo(() => {
    if (!intents.length) return [];
    return Object.keys(intents[0]).filter(
      (key) =>
        ![
          "id",
          "status",
          "created_at",
          "decision_at",
        ].includes(key)
    );
  }, [intents]);

  /* =========================
     RENDER
  ========================== */
  return (
    <div className="space-y-10">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <header className="space-y-1">
          <h1 className="text-2xl Sbold text-gray-900">
            Intents Management
          </h1>
          <p className="text-sm Snormal text-gray-500">
            Review, approve, or reject submitted intents
          </p>
        </header>


        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm Snormal focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={queryFilter}
              onChange={(e) => setQueryFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm Snormal focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="all">All Queries</option>
              <option>Partner for biochar production</option>
              <option>Info on carbon credits</option>
              <option>Sell credits</option>
              <option>Others</option>
            </select>
          </div>

          <div className="text-sm Snormal text-gray-500">
            {loading ? "Loading…" : `${intents.length} intents`}
          </div>
        </div>


        {/* TABLE CARD */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">

            {error && (
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-xs text-red-600">{error}</div>
            </div>
            )}


          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 pt-2 pb-3 text-left text-[11px] Smedium uppercase tracking-wide text-gray-600"
                  >
                    {col.replaceAll("_", " ")}
                  </th>
                ))}
                <th className="px-4 pt-2 pb-3 text-right text-[11px] Smedium uppercase tracking-wide text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>


              <tbody className="divide-y divide-gray-100">
                {intents.map((intent) => (
                  <tr key={intent.id} className="hover:bg-slate-50">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3 text-sm Snormal text-gray-700">
                        {String(intent[col] ?? "-")}
                      </td>
                    ))}

                    <td className="px-4 py-3 text-sm Snormal text-gray-700">
                      {intent.status === "pending" && (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => openConfirm("accept", intent)}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs Smedium text-white
                                      hover:bg-black hover:shadow-sm hover:-translate-y-[1px]
                                      active:scale-[0.98] transition-all"
                          >
                            Accept
                          </button>

                          <button
                            onClick={() => openConfirm("reject", intent)}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs Smedium text-gray-700
                                      hover:bg-gray-50 hover:border-gray-400 hover:-translate-y-[1px]
                                      active:scale-[0.98] transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {!loading && intents.length === 0 && (
                  <tr>
                    <td
                        colSpan={columns.length + 1}
                        className="px-4 py-10 text-center text-sm Snormal text-gray-500"
                      >
                      No intents found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CONFIRM MODAL */}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm?.type === "accept"
            ? "Confirm Accept"
            : "Confirm Reject"
        }
        footer={
          <>
            <button
              onClick={() => setConfirm(null)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={performDecision}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                confirm?.type === "accept"
                  ? "bg-black"
                  : "bg-red-600"
              }`}
            >
              {confirm?.type === "accept" ? "Accept" : "Reject"}
            </button>
          </>
        }
      >
        <p className="text-sm">
          Are you sure you want to{" "}
          <strong>{confirm?.type}</strong>{" "}
          this intent from{" "}
          <strong>{String(confirm?.intent?.organization_name ?? "")}</strong>?
        </p>
      </Modal>
    </div>
  );
}
