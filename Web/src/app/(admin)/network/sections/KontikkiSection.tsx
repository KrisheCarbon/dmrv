"use client";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import type { KontikkiRecord, OwnerOption, UploadFieldProps } from "./section-types";

export default function KontikkiSection() {
  const columns = ["Name", "Owner", "Diameters (Top/Bottom/Depth)", ""];
  const headerSpanClasses = ["col-span-4", "col-span-4", "col-span-3", "col-span-1"]; // sum 12

  const [kontikkis, setKontikkis] = useState<KontikkiRecord[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openView, setOpenView] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<KontikkiRecord>({
    id: "",
    name: "",
    ownerType: "",
    ownerId: "",
    ownerName: "",
    topDiameter: "",
    bottomDiameter: "",
    depth: "",
    topViewName: "",
    topViewType: "",
    sideViewName: "",
    sideViewType: "",
    designDocName: "",
    designDocType: "",
  });

  // Load owner options from localStorage (artisan pros and biochar producers)
  const ownerOptions = useMemo((): OwnerOption[] => {
    let aps: { id: string; name?: string }[] = [];
    let producers: { id: string; name?: string; designation?: string }[] = [];
    try { aps = JSON.parse(localStorage.getItem("csink:artisan-pros") || "[]"); } catch { /* empty */ }
    try { producers = JSON.parse(localStorage.getItem("csink:biochar-producers") || "[]"); } catch { /* empty */ }
    const apOptions = (Array.isArray(aps) ? aps : []).map((a) => ({ value: `ap:${a.id}`, label: `AP: ${a.name || a.id}`, type: "AP", id: a.id, name: a.name || a.id }));
    const climOptions = (Array.isArray(producers) ? producers : []).map((p) => ({ value: `prod:${p.id}`, label: `${p.designation || "Producer"}: ${p.name || p.id}` , type: p.designation || "Producer", id: p.id, name: p.name || p.id }));
    return [...apOptions, ...climOptions];
  }, [openAdd]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("csink:kontikkis") || "[]") as KontikkiRecord[];
      if (Array.isArray(saved) && saved.length > 0) {
        setKontikkis(saved);
      } else {
        const seed = [
          { id: "k-1", name: "Kontikki-100", ownerType: "AP", ownerId: "", ownerName: "AP: Ravi Kumar", topDiameter: "100 cm", bottomDiameter: "60 cm", depth: "80 cm" },
          { id: "k-2", name: "Kontikki-80", ownerType: "Climapreneur", ownerId: "", ownerName: "Climapreneur: Deepa Rao", topDiameter: "80 cm", bottomDiameter: "50 cm", depth: "70 cm" },
        ];
        setKontikkis(seed as KontikkiRecord[]);
        localStorage.setItem("csink:kontikkis", JSON.stringify(seed));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("csink:kontikkis", JSON.stringify(kontikkis));
    } catch {}
  }, [kontikkis]);

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
      ownerType: "",
      ownerId: "",
      ownerName: "",
      topDiameter: "",
      bottomDiameter: "",
      depth: "",
      topViewName: "",
      topViewType: "",
      sideViewName: "",
      sideViewType: "",
      designDocName: "",
      designDocType: "",
    });
  }

  function openAddModal() { resetForm(); setEditing(null); setOpenAdd(true); }

  function submitForm() {
    if (!form.name || !form.ownerName) return;
    if (editing) {
      setKontikkis((prev) => prev.map((k) => (k.id === editing ? { ...form, id: editing } : k)));
    } else {
      const id = crypto?.randomUUID?.() || String(Date.now());
      setKontikkis((prev) => [...prev, { ...form, id }]);
    }
    setOpenAdd(false); setEditing(null);
  }

  function onEdit(id: string) {
    const found = kontikkis.find((k) => k.id === id);
    if (!found) return;
    setForm({ ...found }); setEditing(id); setOpenAdd(true); setMenuOpenId(null);
  }

  function onDelete(id: string) { setKontikkis((prev) => prev.filter((k) => k.id !== id)); setMenuOpenId(null); }
  function onView(id: string) { setOpenView(id); setMenuOpenId(null); }

  function onFileChange(e: ChangeEvent<HTMLInputElement>, which: string) {
    const file = e.target.files?.[0]; if (!file) return;
    const map: Record<string, [keyof KontikkiRecord, keyof KontikkiRecord]> = {
      top: ["topViewName", "topViewType"],
      side: ["sideViewName", "sideViewType"],
      design: ["designDocName", "designDocType"],
    };
    const keys = map[which];
    if (!keys) return;
    setForm((f) => ({ ...f, [keys[0]]: file.name, [keys[1]]: file.type || "application/octet-stream" }));
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

  function diametersLabel(row: KontikkiRecord) {
    const t = row.topDiameter || "-";
    const b = row.bottomDiameter || "-";
    const d = row.depth || "-";
    return `${t}/${b}/${d}`;
  }

  return (
    <>
      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md" open>
        <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4">
          <span className="text-lg font-semibold text-slate-900">Kontikki</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={(e)=>{ e.preventDefault(); openAddModal(); }} className="inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 text-xs font-semibold shadow-sm ring-1 ring-black/10 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              Add record
            </button>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-slate-500 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
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
              {kontikkis.map((row) => (
                <li key={row.id} className="px-4 py-3 bg-white/60 hover:bg-slate-50 transition-colors">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center text-slate-700">
                    <div className="sm:col-span-4">{row.name}</div>
                    <div className="sm:col-span-4">{row.ownerName}</div>
                    <div className="sm:col-span-3">{diametersLabel(row)}</div>
                    <div className="sm:col-span-1 sm:text-right">
                      <div className="relative inline-block text-left z-10" ref={menuOpenId === row.id ? dropdownRef : null}>
                        <button aria-label="Actions" onClick={(e)=>{ e.stopPropagation(); setMenuOpenId(menuOpenId === row.id ? null : row.id); }} className="rounded p-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-black/20">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle></svg>
                        </button>
                        {menuOpenId === row.id ? (
                          <div onClick={(e)=>e.stopPropagation()} className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-200 bg-white shadow-lg shadow-black/5 overflow-hidden">
                            <button onClick={() => onView(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>View</button>
                            <button onClick={() => onEdit(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>Edit</button>
                            <button onClick={() => onDelete(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-slate-50"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {kontikkis.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-slate-500">No records yet. Click “Add record” to create one.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </details>

      {/* Add / Edit Modal */}
      <Modal
        open={openAdd}
        onClose={() => { setOpenAdd(false); setEditing(null); }}
        title={editing ? "Edit Kontikki" : "Add Kontikki"}
        footer={<><button onClick={() => { setOpenAdd(false); setEditing(null); }} className="rounded-md border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button><button onClick={submitForm} disabled={!form.name || !form.ownerName} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">{editing ? "Save" : "Create"}</button></>}
      >
        <form className="grid gap-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Basic Info</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Name</label>
                <input value={form.name} onChange={(e)=>setForm((f)=>({...f, name:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="Kontikki name" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Owner</label>
                <select value={form.ownerId} onChange={(e)=>{ const opt = ownerOptions.find(o=>o.value===e.target.value); setForm((f)=>({...f, ownerId: e.target.value, ownerType: opt?.type || "", ownerName: opt?.name || ""})); }} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition">
                  <option value="">Select owner</option>
                  {ownerOptions.map((o)=> (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Dimensions</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Top diameter</label>
                <input value={form.topDiameter} onChange={(e)=>setForm((f)=>({...f, topDiameter:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="e.g., 100 cm" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Bottom diameter</label>
                <input value={form.bottomDiameter} onChange={(e)=>setForm((f)=>({...f, bottomDiameter:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="e.g., 60 cm" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-600 Smedium">Depth</label>
                <input value={form.depth} onChange={(e)=>setForm((f)=>({...f, depth:e.target.value}))} className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:ring-2 focus:ring-black focus:border-black outline-none transition" placeholder="e.g., 80 cm" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-slate-900 Sbold">Images & Documents</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <UploadField label="Top View (image)" accept="image/*" onChange={(e)=>onFileChange(e, "top")} selectedName={form.topViewName} />
              </div>
              <div>
                <UploadField label="Side View (image)" accept="image/*" onChange={(e)=>onFileChange(e, "side")} selectedName={form.sideViewName} />
              </div>
              <div className="sm:col-span-2">
                <UploadField label="Design Document (optional)" accept="*/*" onChange={(e)=>onFileChange(e, "design")} selectedName={form.designDocName} />
              </div>
            </div>
          </section>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!openView} onClose={() => setOpenView(null)} title="Kontikki Details">
        {(() => {
          const data = kontikkis.find((k) => k.id === openView);
          if (!data) return <p className="text-sm text-gray-600">Record not found.</p>;
          return (
            <div className="grid gap-4">
              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Overview</h5>
                <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Name</div>
                    <div className="font-medium">{data.name}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Owner</div>
                    <div className="font-medium">{data.ownerName}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Diameters (T/B/D)</div>
                    <div className="font-medium">{diametersLabel(data)}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-900">Uploads</h5>
                <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Top view</div>
                    <div className="font-medium">{data.topViewName || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Side view</div>
                    <div className="font-medium">{data.sideViewName || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Design doc</div>
                    <div className="font-medium">{data.designDocName || "-"}</div>
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


