/** Spinning indicator for a request that is still in flight. */
export default function CircularLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10" role="status">
      <span
        aria-hidden
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-dark/20 border-t-brand-dark"
      />
      <span className="text-sm text-text-secondary">{label}</span>
    </div>
  );
}
