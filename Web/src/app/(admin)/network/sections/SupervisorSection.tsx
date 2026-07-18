"use client";

import { useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import type { PartnerOption, SectionProps, SupervisorRecord } from "./section-types";

const STORAGE_KEY = "csink:supervisors";
const PARTNERS_KEY = "csink:partner-options";

interface SupervisorFormState {
  id: string;
  name: string;
  mobile: string;
  education: string;
  currentIncome: string;
  bikeAccess: boolean;
  partnerId: string;
  partnerName: string;
  cluster: string;
  trainingDate: string;
  demoImages: string[];
  agreementSigned: boolean;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  panUrl: string;
  panName: string;
}

const initialForm: SupervisorFormState = {
  id: "",
  name: "",
  mobile: "",
  education: "",
  currentIncome: "",
  bikeAccess: false,
  partnerId: "",
  partnerName: "",
  cluster: "",
  trainingDate: "",
  demoImages: [],
  agreementSigned: false,
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
  panUrl: "",
  panName: "",
};

function loadSupervisorsFromStorage(): SupervisorRecord[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as SupervisorRecord[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function loadPartnersFromStorage(): PartnerOption[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PARTNERS_KEY) || "[]") as PartnerOption[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function SupervisorSection() {
  const [supervisors, setSupervisors] = useState<SupervisorRecord[]>(loadSupervisorsFromStorage);
  const [partners, setPartners] = useState<PartnerOption[]>(loadPartnersFromStorage);
  const [form, setForm] = useState<SupervisorFormState>(initialForm);

  const [openAdd, setOpenAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  function resetForm() {
    setForm(initialForm);
  }

  function v(field: keyof SupervisorFormState) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function uploadPan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = form.id || crypto.randomUUID();
    setForm((f) => ({
      ...f,
      id,
      panUrl: URL.createObjectURL(file),
      panName: file.name,
    }));
  }

  async function uploadDemoImages(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const id = form.id || crypto.randomUUID();
    const urls = files.map((file) => URL.createObjectURL(file));
    setForm((f) => ({ ...f, id, demoImages: urls }));
  }

  function submitForm() {
    if (!form.name || !form.mobile) return;

    const id = form.id || crypto.randomUUID();

    const payload: SupervisorRecord = {
      id,
      name: form.name,
      mobile: form.mobile,
      education: form.education,
      currentIncome: Number(form.currentIncome || 0),
      bikeAccess: form.bikeAccess,
      partner: {
        id: form.partnerId,
        name: form.partnerName,
      },
      cluster: form.cluster,
      training: {
        biocharDate: form.trainingDate,
        demoImages: form.demoImages,
        agreementSigned: form.agreementSigned,
      },
      kyc: {
        bank: {
          accountName: form.bankAccountName,
          accountNumber: form.bankAccountNumber,
          ifsc: form.bankIfsc,
          bankName: form.bankName,
        },
        pan: {
          url: form.panUrl,
          name: form.panName,
        },
      },
    };

    const next = editingId
      ? supervisors.map((s) => (s.id === id ? payload : s))
      : [...supervisors, payload];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSupervisors(next);
    setOpenAdd(false);
    setEditingId(null);
    resetForm();
  }

  function editSupervisor(id: string) {
    const s = supervisors.find((x) => x.id === id);
    if (!s) return;

    setForm({
      id,
      name: s.name,
      mobile: s.mobile,
      education: s.education,
      currentIncome: String(s.currentIncome),
      bikeAccess: s.bikeAccess,
      partnerId: s.partner?.id ?? "",
      partnerName: s.partner?.name ?? "",
      cluster: s.cluster,
      trainingDate: s.training?.biocharDate ?? "",
      demoImages: s.training?.demoImages ?? [],
      agreementSigned: s.training?.agreementSigned ?? false,
      bankAccountName: s.kyc?.bank?.accountName ?? "",
      bankAccountNumber: s.kyc?.bank?.accountNumber ?? "",
      bankIfsc: s.kyc?.bank?.ifsc ?? "",
      bankName: s.kyc?.bank?.bankName ?? "",
      panUrl: s.kyc?.pan?.url ?? "",
      panName: s.kyc?.pan?.name ?? "",
    });

    setEditingId(id);
    setOpenAdd(true);
  }

  function deleteSupervisor(id: string) {
    const next = supervisors.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSupervisors(next);
  }

  return (
    <>
      <details className="rounded-xl border bg-white shadow-sm" open>
        <summary className="flex justify-between px-5 py-4 cursor-pointer">
          <span className="text-lg font-semibold">Supervisors</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              resetForm();
              setOpenAdd(true);
            }}
            className="rounded-full bg-black px-4 py-2 text-xs text-white"
          >
            + Add Supervisor
          </button>
        </summary>

        <div className="border-t px-5 pb-4">
          <ul className="divide-y">
            {supervisors.map((s) => (
              <li key={s.id} className="py-3 flex justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.mobile} • {s.partner?.name || "-"}
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setViewId(s.id)}>View</button>
                  <button onClick={() => editSupervisor(s.id)}>Edit</button>
                  <button onClick={() => deleteSupervisor(s.id)} className="text-red-600">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title={editingId ? "Edit Supervisor" : "Add Supervisor"}
        footer={
          <>
            <button onClick={() => setOpenAdd(false)} className="border px-4 py-2 text-sm">
              Cancel
            </button>
            <button onClick={submitForm} className="bg-black text-white px-4 py-2 text-sm">
              {editingId ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <form className="grid gap-6">
          <Section title="Basic Details">
            <Input label="Name" value={form.name} onChange={v("name")} />
            <Input label="Mobile Number" value={form.mobile} onChange={v("mobile")} />
            <Input label="Education" value={form.education} onChange={v("education")} />
            <Input label="Current Income" value={form.currentIncome} onChange={v("currentIncome")} />
            <Checkbox label="Bike Access" checked={form.bikeAccess}
              onChange={() => setForm((f) => ({ ...f, bikeAccess: !f.bikeAccess }))} />
          </Section>

          <Section title="Assignment">
            <Select
              label="Partner"
              options={partners}
              value={form.partnerId}
              onChange={(e) => {
                const p = partners.find((x) => x.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  partnerId: p?.id ?? "",
                  partnerName: p?.orgName ?? "",
                }));
              }}
            />
            <Input label="Cluster Assigned" value={form.cluster} onChange={v("cluster")} />
          </Section>

          <Section title="Training">
            <Input label="Biochar Training Date" type="date" value={form.trainingDate} onChange={v("trainingDate")} />
            <Upload label="Demo Pictures" multiple onChange={uploadDemoImages} />
            <Checkbox label="Agreement Signed" checked={form.agreementSigned}
              onChange={() => setForm((f) => ({ ...f, agreementSigned: !f.agreementSigned }))} />
          </Section>

          <Section title="KYC">
            <Input label="Account Holder Name" value={form.bankAccountName} onChange={v("bankAccountName")} />
            <Input label="Account Number" value={form.bankAccountNumber} onChange={v("bankAccountNumber")} />
            <Input label="IFSC" value={form.bankIfsc} onChange={v("bankIfsc")} />
            <Input label="Bank Name" value={form.bankName} onChange={v("bankName")} />
            <Upload label="PAN Card" onChange={uploadPan} />
          </Section>
        </form>
      </Modal>

      <Modal
        open={!!viewId}
        onClose={() => setViewId(null)}
        title="Supervisor Details"
      >
        {(() => {
          const s = supervisors.find((x) => x.id === viewId);
          if (!s) return <p className="text-sm text-gray-600">Record not found.</p>;
          return (
            <div className="space-y-2 text-sm">
              <p><strong>Name:</strong> {s.name}</p>
              <p><strong>Mobile:</strong> {s.mobile}</p>
              <p><strong>Partner:</strong> {s.partner?.name || "-"}</p>
              <p><strong>Cluster:</strong> {s.cluster || "-"}</p>
            </div>
          );
        })()}
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
      <input type={type} value={value || ""} onChange={onChange}
        className="w-full border rounded px-3 py-2 text-sm" />
    </div>
  );
}

function Upload({
  label,
  ...props
}: {
  label: string;
  multiple?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold">{label}</label>
      <input type="file" {...props} />
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PartnerOption[];
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold">{label}</label>
      <select value={value} onChange={onChange}
        className="w-full border rounded px-3 py-2 text-sm">
        <option value="">Select</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.orgName}</option>
        ))}
      </select>
    </div>
  );
}
