"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPartnerDoc } from "@/lib/uploadPartnerDocs";
import { ORGANIZATION_DOCUMENT_ACCEPT } from "@/lib/privateStorage";
import { createPartner, updatePartner, type PartnerUpdatePayload } from "./actions";
import type { PartnerOrg } from "@/types";

interface PartnerFormProps {
  mode: "create" | "edit";
  data?: PartnerOrg | null;
  onCancel: () => void;
  onSuccess?: (id: string) => void;
}

interface PartnerFormState {
  org_name: string;
  cin_number: string;
  base_location: string;
  farmer_base: string;
  states_of_operation: string;
  crop_types: string;
  status: string;
  bank_account_holders_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  bank_address: string;
}

const sectionClass =
  "space-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0";
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";
const sectionEyebrowClass =
  "text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400";

function partnerToFormState(partner: PartnerOrg): PartnerFormState {
  return {
    org_name: partner.org_name,
    cin_number: partner.cin_number ?? "",
    base_location: partner.base_location ?? "",
    farmer_base: String(partner.farmer_base ?? ""),
    states_of_operation: (partner.states_of_operation ?? []).join(", "),
    crop_types: (partner.crop_types ?? []).join(", "),
    status: partner.status ?? "inactive",
    bank_account_holders_name: partner.bank_account_holders_name ?? "",
    bank_account_number: partner.bank_account_number ?? "",
    bank_ifsc: partner.bank_ifsc ?? "",
    bank_name: partner.bank_name ?? "",
    bank_branch: partner.bank_branch ?? "",
    bank_address: partner.bank_address ?? "",
  };
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function PartnerForm({
  mode,
  data = null,
  onCancel,
  onSuccess,
}: PartnerFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [mouFile, setMouFile] = useState<File | null>(null);
  const [form, setForm] = useState<PartnerFormState>(() =>
    data
      ? partnerToFormState(data)
      : {
          org_name: "",
          cin_number: "",
          base_location: "",
          farmer_base: "",
          states_of_operation: "",
          crop_types: "",
          status: "inactive",
          bank_account_holders_name: "",
          bank_account_number: "",
          bank_ifsc: "",
          bank_name: "",
          bank_branch: "",
          bank_address: "",
        },
  );

  function updateField<K extends keyof PartnerFormState>(
    key: K,
    value: PartnerFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);

    if (
      !form.org_name.trim() ||
      !form.base_location.trim() ||
      !form.farmer_base ||
      !form.states_of_operation.trim() ||
      !form.crop_types.trim() ||
      !form.bank_account_holders_name.trim() ||
      !form.bank_account_number.trim() ||
      !form.bank_ifsc.trim() ||
      !form.bank_name.trim() ||
      !form.bank_branch.trim() ||
      !form.bank_address.trim()
    ) {
      setError("Please fill all required fields.");
      return;
    }

    if (!isEdit && (!panFile || !mouFile)) {
      setError("PAN card and MoU documents are required for new partners.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        org_name: form.org_name.trim(),
        cin_number: form.cin_number.trim() || null,
        base_location: form.base_location.trim(),
        farmer_base: Number(form.farmer_base),
        states_of_operation: splitCsv(form.states_of_operation),
        crop_types: splitCsv(form.crop_types),
        status: form.status as "active" | "inactive",
        bank_account_holders_name: form.bank_account_holders_name.trim(),
        bank_account_number: form.bank_account_number.trim(),
        bank_ifsc: form.bank_ifsc.trim(),
        bank_name: form.bank_name.trim(),
        bank_branch: form.bank_branch.trim(),
        bank_address: form.bank_address.trim(),
      };

      if (isEdit && data) {
        const updatePayload: PartnerUpdatePayload = { ...payload };

        if (panFile) {
          updatePayload.pan_card_url = await uploadPartnerDoc({
            file: panFile,
            partnerId: data.id,
            type: "pan",
          });
        }

        if (mouFile) {
          updatePayload.mou_url = await uploadPartnerDoc({
            file: mouFile,
            partnerId: data.id,
            type: "mou",
          });
        }

        await updatePartner(data.id, updatePayload);

        if (onSuccess) {
          onSuccess(data.id);
        } else {
          router.push(`/network/partners/${data.id}`);
        }
        return;
      }

      const partner = await createPartner({
        ...payload,
        status: "inactive",
      });

      const panPath = await uploadPartnerDoc({
        file: panFile!,
        partnerId: partner.id,
        type: "pan",
      });

      const mouPath = await uploadPartnerDoc({
        file: mouFile!,
        partnerId: partner.id,
        type: "mou",
      });

      await updatePartner(partner.id, {
        pan_card_url: panPath,
        mou_url: mouPath,
        status: "inactive",
      });

      if (onSuccess) {
        onSuccess(partner.id);
      } else {
        router.push(`/network/partners/${partner.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save partner");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Organisation</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Organisation details
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Organisation name *</label>
            <input
              className={inputClass}
              value={form.org_name}
              onChange={(e) => updateField("org_name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>CIN number</label>
            <input
              className={inputClass}
              value={form.cin_number}
              onChange={(e) => updateField("cin_number", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Base location *</label>
            <input
              className={inputClass}
              value={form.base_location}
              onChange={(e) => updateField("base_location", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Number of farmers *</label>
            <input
              type="number"
              className={inputClass}
              value={form.farmer_base}
              onChange={(e) => updateField("farmer_base", e.target.value)}
            />
          </div>
          {isEdit ? (
            <div className="space-y-1.5">
              <label className={labelClass}>Status *</label>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          ) : null}
        </div>
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Operations</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Operating footprint
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>States of operation *</label>
            <input
              className={inputClass}
              placeholder="Telangana, Karnataka"
              value={form.states_of_operation}
              onChange={(e) =>
                updateField("states_of_operation", e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Crop types *</label>
            <input
              className={inputClass}
              placeholder="Rice, Wheat"
              value={form.crop_types}
              onChange={(e) => updateField("crop_types", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Banking</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Bank details
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Account holder name *</label>
            <input
              className={inputClass}
              value={form.bank_account_holders_name}
              onChange={(e) =>
                updateField("bank_account_holders_name", e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Account number *</label>
            <input
              className={inputClass}
              value={form.bank_account_number}
              onChange={(e) =>
                updateField("bank_account_number", e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>IFSC code *</label>
            <input
              className={`${inputClass} uppercase`}
              value={form.bank_ifsc}
              onChange={(e) => updateField("bank_ifsc", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Bank name *</label>
            <input
              className={inputClass}
              value={form.bank_name}
              onChange={(e) => updateField("bank_name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Branch *</label>
            <input
              className={inputClass}
              value={form.bank_branch}
              onChange={(e) => updateField("bank_branch", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Bank address *</label>
            <input
              className={inputClass}
              value={form.bank_address}
              onChange={(e) => updateField("bank_address", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div>
          <p className={sectionEyebrowClass}>Documents</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            Compliance documents
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            {isEdit
              ? "Upload new files only if you want to replace existing documents."
              : "PAN card and MoU are required when onboarding a partner."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>
              PAN card{isEdit ? "" : " *"}
            </label>
            <input
              type="file"
              accept={ORGANIZATION_DOCUMENT_ACCEPT}
              onChange={(e) => setPanFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-600"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>
              MoU document{isEdit ? "" : " *"}
            </label>
            <input
              type="file"
              accept={ORGANIZATION_DOCUMENT_ACCEPT}
              onChange={(e) => setMouFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-600"
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover disabled:opacity-50"
        >
          {loading ? "Saving..." : isEdit ? "Save changes" : "Create partner"}
        </button>
      </div>
    </div>
  );
}
