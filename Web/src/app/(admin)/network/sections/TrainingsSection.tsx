export default function TrainingsSection() {
  const columns = ["Name"];
  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md" open>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4">
        <span className="text-lg font-semibold text-slate-900">Trainings</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-slate-500 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-slate-200 px-4 pb-4 pt-3 md:px-5 md:pb-5">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="hidden grid-cols-12 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:grid">
            <div className="col-span-12">{columns[0]}</div>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            <li className="px-4 py-4 bg-white/60">
              <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center text-slate-700">
                <div className="sm:col-span-12">Coming soon</div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}


