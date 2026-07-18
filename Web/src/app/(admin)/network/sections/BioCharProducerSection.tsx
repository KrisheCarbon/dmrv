"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import type { BioCharProducerRecord, UploadFieldProps } from "./section-types";

const BIOCHAR_PRODUCER_SEED: BioCharProducerRecord[] = [
  { id: "bp-1", name: "Arun Sharma", designation: "Supervisor", email: "arun@example.com", phone: "9876543210", projectSiteMode: "Input Coordinate", lat: "17.385", lng: "78.486", searchQuery: "", mapsUrl: "", contractName: "", contractType: "", trainingCertName: "", trainingCertType: "", addressProofName: "", addressProofType: "" },
  { id: "bp-2", name: "Deepa Rao", designation: "Climapreneur", email: "deepa@example.com", phone: "9123456780", projectSiteMode: "Search location", lat: "", lng: "", searchQuery: "Hyderabad", mapsUrl: "", contractName: "", contractType: "", trainingCertName: "", trainingCertType: "", addressProofName: "", addressProofType: "" },
];

function loadBioCharProducersFromStorage(): BioCharProducerRecord[] {
  try {
    const saved = JSON.parse(localStorage.getItem("csink:biochar-producers") || "[]") as BioCharProducerRecord[];
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    localStorage.setItem("csink:biochar-producers", JSON.stringify(BIOCHAR_PRODUCER_SEED));
    return BIOCHAR_PRODUCER_SEED;
  } catch {
    return BIOCHAR_PRODUCER_SEED;
  }
}

function UploadField({ label, accept, onChange, selectedName }: UploadFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">{label}</label>
      <label className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white px-4 py-6 text-center cursor-pointer transition hover:border-black hover:shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M17 8l-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
        <span className="text-xs Smedium text-slate-900">{selectedName ? "Change file" : "Click to upload"}</span>
        <span className="text-[11px] text-slate-500">{selectedName ? selectedName : "or drag & drop"}</span>
        <input type="file" accept={accept} onChange={onChange} className="hidden" />
      </label>
    </div>
  );
}

export default function BioCharProducerSection() {
  const columns = ["Name", "Designation", "Phone", ""];
  const headerSpanClasses = ["col-span-4", "col-span-3", "col-span-4", "col-span-1"];

  const [producers, setProducers] = useState<BioCharProducerRecord[]>(loadBioCharProducersFromStorage);
  const [openAdd, setOpenAdd] = useState(false);
  const [openView, setOpenView] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<BioCharProducerRecord>({
    id: "", // internal id
    name: "",
    designation: "Supervisor",
    email: "",
    phone: "",
    projectSiteMode: "",
    lat: "",
    lng: "",
    searchQuery: "",
    mapsUrl: "",
    contractName: "",
    contractType: "",
    trainingCertName: "",
    trainingCertType: "",
    addressProofName: "",
    addressProofType: "",
  });

  useEffect(() => {
    try {
      localStorage.setItem("csink:biochar-producers", JSON.stringify(producers));
    } catch {}
  }, [producers]);

  useEffect(() => {
    function onDoc(e: Event) {
      if (!menuOpenId) return;
      const el = dropdownRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpenId(null);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpenId]);

  function resetForm() {
    setForm({
      id: "",
      name: "",
      designation: "Supervisor",
      email: "",
      phone: "",
      projectSiteMode: "",
      lat: "",
      lng: "",
      searchQuery: "",
      mapsUrl: "",
      contractName: "",
      contractType: "",
      trainingCertName: "",
      trainingCertType: "",
      addressProofName: "",
      addressProofType: "",
    });
  }

  function openAddModal() {
    resetForm();
    setEditing(null);
    setOpenAdd(true);
  }

  function submitForm() {
    if (!form.name || !form.designation || !form.phone) return;
    if (editing) {
      setProducers((prev) => prev.map((p) => (p.id === editing ? { ...form, id: editing } : p)));
    } else {
      const id = crypto?.randomUUID?.() || String(Date.now());
      setProducers((prev) => [...prev, { ...form, id }]);
    }
    setOpenAdd(false);
    setEditing(null);
  }

  function onEdit(id: string) {
    const found = producers.find((p) => p.id === id);
    if (!found) return;
    setForm({ ...found });
    setEditing(id);
    setOpenAdd(true);
    setMenuOpenId(null);
  }

  function onDelete(id: string) {
    setProducers((prev) => prev.filter((p) => p.id !== id));
    setMenuOpenId(null);
  }

  function onView(id: string) {
    setOpenView(id);
    setMenuOpenId(null);
  }

  function onUseCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm((f) => ({ ...f, lat: String(latitude), lng: String(longitude) }));
      },
      () => {}
    );
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>, which: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    const map: Record<string, [keyof BioCharProducerRecord, keyof BioCharProducerRecord]> = {
      contract: ["contractName", "contractType"],
      training: ["trainingCertName", "trainingCertType"],
      address: ["addressProofName", "addressProofType"],
    };
    const keys = map[which];
    if (!keys) return;
    setForm((f) => ({ ...f, [keys[0]]: file.name, [keys[1]]: file.type || "application/octet-stream" }));
  }

  return (
    <>
      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md" open>
        <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4">
          <span className="text-lg font-semibold text-slate-900">BioChar Producer</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                openAddModal();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 text-xs font-semibold shadow-sm ring-1 ring-black/10 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add record
            </button>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 flex-shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </summary>

        <div className="border-t border-slate-200 px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <div className="overflow-visible rounded-lg border border-slate-200">
            <div className="hidden grid-cols-12 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:grid">
              {columns.map((c, i) => (
                <div key={i} className={`${headerSpanClasses[i]} ${i === columns.length - 1 ? "text-right" : ""}`}>{c}</div>
              ))}
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {producers.map((row) => (
                <li key={row.id} className="px-4 py-3 bg-white/60 hover:bg-slate-50 transition-colors">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center text-slate-700">
                    <div className="sm:col-span-4">{row.name}</div>
                    <div className="sm:col-span-3">{row.designation}</div>
                    <div className="sm:col-span-4">{row.phone}</div>
                    <div className="sm:col-span-1 sm:text-right">
                      <div className="relative inline-block text-left z-10" ref={menuOpenId === row.id ? dropdownRef : null}>
                        <button
                          aria-label="Actions"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === row.id ? null : row.id); }}
                          className="rounded p-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-black/20"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <circle cx="5" cy="12" r="1.6"></circle>
                            <circle cx="12" cy="12" r="1.6"></circle>
                            <circle cx="19" cy="12" r="1.6"></circle>
                          </svg>
                        </button>
                        {menuOpenId === row.id ? (
                          <div onClick={(e)=>e.stopPropagation()} className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-200 bg-white shadow-lg shadow-black/5 overflow-hidden">
                            <button onClick={() => onView(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                              View
                            </button>
                            <button onClick={() => onEdit(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                              Edit
                            </button>
                            <button onClick={() => onDelete(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-slate-50">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {producers.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-slate-500">No records yet. Click “Add record” to create one.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </details>

      {/* Add / Edit Modal */}
      <Modal
        open={openAdd}
        onClose={() => {
          setOpenAdd(false);
          setEditing(null);
        }}
        title={editing ? "Edit BioChar Producer" : "Add BioChar Producer"}
        footer={
          <>
            <button onClick={() => { setOpenAdd(false); setEditing(null); }} className="rounded-md border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={submitForm} disabled={!form.name || !form.designation || !form.phone} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
              {editing ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <form className="grid gap-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Identity</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Name</label>
                <input value={form.name} onChange={(e)=>setForm((f)=>({...f, name:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Full name" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Designation</label>
                <select value={form.designation} onChange={(e)=>setForm((f)=>({...f, designation:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition">
                  <option>Supervisor</option>
                  <option>Climapreneur</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Email</label>
                <input type="email" value={form.email} onChange={(e)=>setForm((f)=>({...f, email:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="name@email.com" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Phone</label>
                <input value={form.phone} onChange={(e)=>setForm((f)=>({...f, phone:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="+91 9xxxxxxxxx" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Project Site</h4>
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Mode</label>
                <select value={form.projectSiteMode} onChange={(e)=>setForm((f)=>({...f, projectSiteMode:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition">
                  <option value="">Select</option>
                  <option>Use my current location</option>
                  <option>Input Coordinate</option>
                  <option>Search location</option>
                  <option>Set location</option>
                  <option>Google maps URL</option>
                </select>
              </div>

              {form.projectSiteMode === "Use my current location" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={onUseCurrentLocation} className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-900 w-max transition">Fill current location</button>
                  <input value={form.lat} onChange={(e)=>setForm((f)=>({...f, lat:e.target.value}))} className="rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Latitude" />
                  <input value={form.lng} onChange={(e)=>setForm((f)=>({...f, lng:e.target.value}))} className="rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Longitude" />
                </div>
              ) : null}

              {form.projectSiteMode === "Input Coordinate" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={form.lat} onChange={(e)=>setForm((f)=>({...f, lat:e.target.value}))} className="rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Latitude" />
                  <input value={form.lng} onChange={(e)=>setForm((f)=>({...f, lng:e.target.value}))} className="rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Longitude" />
                </div>
              ) : null}

              {form.projectSiteMode === "Search location" ? (
                <input value={form.searchQuery} onChange={(e)=>setForm((f)=>({...f, searchQuery:e.target.value}))} className="rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Search query" />
              ) : null}

              {form.projectSiteMode === "Set location" ? (
                <p className="text-xs text-slate-600">Map picker coming soon.</p>
              ) : null}

              {form.projectSiteMode === "Google maps URL" ? (
                <div className="grid gap-3">
                  <input value={form.mapsUrl} onChange={(e)=>setForm((f)=>({...f, mapsUrl:e.target.value}))} className="rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="https://maps.google.com/..." />
                  {form.mapsUrl ? (
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                      <iframe title="Map Preview" src={form.mapsUrl} className="h-56 w-full" />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Documents</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <UploadField label="Contract (PDF/Image)" accept="application/pdf,image/*" onChange={(e)=>onFileChange(e, "contract")} selectedName={form.contractName} />
              </div>
              <div>
                <UploadField label="Training Certificate (PDF/Image)" accept="application/pdf,image/*" onChange={(e)=>onFileChange(e, "training")} selectedName={form.trainingCertName} />
              </div>
              <div className="sm:col-span-2">
                <UploadField label="Address Proof (Aadhaar) (PDF/Image)" accept="application/pdf,image/*" onChange={(e)=>onFileChange(e, "address")} selectedName={form.addressProofName} />
              </div>
            </div>
          </section>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!openView} onClose={() => setOpenView(null)} title="BioChar Producer Details">
        {(() => {
          const data = producers.find((p) => p.id === openView);
          if (!data) return <p className="text-sm text-gray-600">Record not found.</p>;
          return (
            <div className="grid gap-4">
              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Identity</h5>
                <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Name</div>
                    <div className="font-medium">{data.name}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Designation</div>
                    <div className="font-medium">{data.designation}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Email</div>
                    <div className="font-medium">{data.email || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Phone</div>
                    <div className="font-medium">{data.phone}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Project Site</h5>
                <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Mode</div>
                    <div className="font-medium">{data.projectSiteMode || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Latitude</div>
                    <div className="font-medium">{data.lat || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Longitude</div>
                    <div className="font-medium">{data.lng || "-"}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Google Maps URL</div>
                    <div className="font-medium break-all">{data.mapsUrl || "-"}</div>
                  </div>
                  {data.mapsUrl ? (
                    <div className="sm:col-span-2 rounded-md border border-slate-200 overflow-hidden">
                      <iframe title="Map" src={data.mapsUrl} className="h-56 w-full" />
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Documents</h5>
                <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Contract</div>
                    <div className="font-medium">{data.contractName || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Training Cert</div>
                    <div className="font-medium">{data.trainingCertName || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Address Proof</div>
                    <div className="font-medium">{data.addressProofName || "-"}</div>
                  </div>
                </div>
              </section>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}

