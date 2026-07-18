"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import type { ArtisanProRecord } from "./section-types";

const ARTISAN_PRO_SEED: ArtisanProRecord[] = [
  { id: "AP-001", name: "Ravi Kumar", klins: ["K1", "K2"], gps: "17.3850, 78.4867", productionPerYear: "10 tons", block: "Madhapur", district: "Hyderabad", state: "Telangana" },
  { id: "AP-002", name: "Sita Devi", klins: ["K3"], gps: "", productionPerYear: "", block: "", district: "Warangal", state: "Telangana" },
];

function loadArtisanProsFromStorage(): ArtisanProRecord[] {
  try {
    const saved = JSON.parse(localStorage.getItem("csink:artisan-pros") || "[]") as ArtisanProRecord[];
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    localStorage.setItem("csink:artisan-pros", JSON.stringify(ARTISAN_PRO_SEED));
    return ARTISAN_PRO_SEED;
  } catch {
    return ARTISAN_PRO_SEED;
  }
}

export default function ArtisanProSection() {
  const columns = ["ID", "Name", "Klins", "GPS", ""];
  const headerSpanClasses = ["col-span-2", "col-span-3", "col-span-4", "col-span-2", "col-span-1"]; // must sum to 12

  const [artisanPros, setArtisanPros] = useState<ArtisanProRecord[]>(loadArtisanProsFromStorage);
  const [openAdd, setOpenAdd] = useState(false);
  const [openView, setOpenView] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<Omit<ArtisanProRecord, "id"> & { id: string }>({
    id: "",
    name: "",
    klins: [],
    gps: "",
    productionPerYear: "",
    block: "",
    district: "",
    state: "",
  });
  const [klinInput, setKlinInput] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("csink:artisan-pros", JSON.stringify(artisanPros));
    } catch {}
  }, [artisanPros]);

  function resetForm() {
    setForm({
      id: "",
      name: "",
      klins: [],
      gps: "",
      productionPerYear: "",
      block: "",
      district: "",
      state: "",
    });
    setKlinInput("");
  }

  function openAddModal() {
    resetForm();
    setEditing(null);
    setOpenAdd(true);
  }

  function submitForm() {
    if (!form.id || !form.name) return;
    if (editing) {
      setArtisanPros((prev) => prev.map((p) => (p.id === editing ? { ...form } : p)));
    } else {
      if (artisanPros.some((p) => p.id === form.id)) return;
      setArtisanPros((prev) => [...prev, { ...form }]);
    }
    setOpenAdd(false);
    setEditing(null);
  }

  function onEdit(id: string) {
    const found = artisanPros.find((p) => p.id === id);
    if (!found) return;
    setForm({ ...found });
    setEditing(id);
    setOpenAdd(true);
  }

  function onDelete(id: string) {
    setArtisanPros((prev) => prev.filter((p) => p.id !== id));
    if (menuOpenId === id) setMenuOpenId(null);
  }

  function onView(id: string) {
    setOpenView(id);
    if (menuOpenId === id) setMenuOpenId(null);
  }

  // Close any open menus when clicking outside
  useEffect(() => {
    function onDocClick(e: Event) {
      if (!menuOpenId) return;
      const el = dropdownRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpenId(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpenId]);

  function addKlin() {
    const value = (klinInput || "").trim();
    if (!value) return;
    setForm((f) => ({ ...f, klins: [...(f.klins || []), value] }));
    setKlinInput("");
  }

  function removeKlin(idx: number) {
    setForm((f) => ({ ...f, klins: f.klins.filter((_, i) => i !== idx) }));
  }

  return (
    <>
      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md" open>
        <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-slate-900">Artisan Pro</span>
            </div>
          </div>

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
              {artisanPros.map((row) => (
                <li key={row.id} className="px-4 py-3 bg-white/60 hover:bg-slate-50 transition-colors">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center text-slate-700">
                    <div className="sm:col-span-2">{row.id}</div>
                    <div className="sm:col-span-3">{row.name}</div>
                    <div className="sm:col-span-4">{(row.klins || []).join(", ") || "-"}</div>
                    <div className="sm:col-span-2">{row.gps || "-"}</div>
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
              {artisanPros.length === 0 ? (
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
        title={editing ? "Edit Artisan Pro" : "Add Artisan Pro"}
        footer={
          <>
            <button onClick={() => { setOpenAdd(false); setEditing(null); }} className="rounded-md border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={submitForm} disabled={!form.id || !form.name} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
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
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Artisan Pro ID</label>
                <input value={form.id} onChange={(e)=>setForm((f)=>({...f, id:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Unique ID" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Artisan Pro Name</label>
                <input value={form.name} onChange={(e)=>setForm((f)=>({...f, name:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Full name / Firm name" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Production & Location</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">GPS Coordinates</label>
                <input value={form.gps} onChange={(e)=>setForm((f)=>({...f, gps:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="e.g., 17.3850, 78.4867" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Estimated Production per year</label>
                <input value={form.productionPerYear} onChange={(e)=>setForm((f)=>({...f, productionPerYear:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="e.g., 10 tons" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Block</label>
                <input value={form.block} onChange={(e)=>setForm((f)=>({...f, block:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Block" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">District</label>
                <input value={form.district} onChange={(e)=>setForm((f)=>({...f, district:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="District" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">State</label>
                <input value={form.state} onChange={(e)=>setForm((f)=>({...f, state:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="State" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Klins under Artisan Pro</h4>
            <div className="flex items-center gap-2">
              <input
                value={klinInput}
                onChange={(e)=>setKlinInput(e.target.value)}
                onKeyDown={(e)=>{ if(e.key === "Enter"){ e.preventDefault(); addKlin(); }}}
                className="flex-1 rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition"
                placeholder="Enter klin name/id and press Add"
              />
              <button type="button" onClick={addKlin} className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-900 transition">Add</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(form.klins || []).map((k, i) => (
                <span key={i} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-sm">
                  {k}
                  <button type="button" onClick={()=>removeKlin(i)} aria-label="Remove" className="text-gray-500 hover:text-black">✕</button>
                </span>
              ))}
            </div>
          </section>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!openView} onClose={() => setOpenView(null)} title="Artisan Pro Details">
        {(() => {
          const data = artisanPros.find((p) => p.id === openView);
          if (!data) return <p className="text-sm text-gray-600">Record not found.</p>;
          return (
            <div className="grid gap-4">
              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Overview</h5>
                <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">ID</div>
                    <div className="font-medium">{data.id}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Name</div>
                    <div className="font-medium">{data.name}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">GPS</div>
                    <div className="font-medium">{data.gps || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Production / year</div>
                    <div className="font-medium">{data.productionPerYear || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Block</div>
                    <div className="font-medium">{data.block || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">District</div>
                    <div className="font-medium">{data.district || "-"}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">State</div>
                    <div className="font-medium">{data.state || "-"}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Klins</h5>
                <div className="flex flex-wrap gap-2">
                  {(data.klins && data.klins.length > 0) ? (
                    data.klins.map((k, i) => (
                      <span key={i} className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-sm">
                        {k}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No klins</span>
                  )}
                </div>
              </section>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}


