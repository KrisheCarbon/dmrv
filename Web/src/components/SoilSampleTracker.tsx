import {
  SOIL_SAMPLE_TRACK_STEPS,
  soilSampleStage,
  soilSampleStepsDone,
  soilTestStatusLabel,
} from "@krishecarbon/shared";

/**
 * Collected → Ready to test → Tested with check marks, mirroring the mobile
 * SoilSampleTracker. The status is also written out, so colour is never the
 * only signal.
 */
export default function SoilSampleTracker({ status }: { status: string | null | undefined }) {
  const stage = soilSampleStage(status);
  const done = soilSampleStepsDone(status);
  const rejected = stage === "rejected";
  const statusTone =
    stage === "tested"
      ? "text-status-success"
      : rejected
        ? "text-status-error"
        : stage === "waiting_pickup"
          ? "text-status-warning"
          : "text-brand-dark";

  return (
    <div className="space-y-1.5" aria-label={`Sample status: ${soilTestStatusLabel(status)}`}>
      <ol className="flex items-center gap-2">
        {SOIL_SAMPLE_TRACK_STEPS.map((step, index) => {
          const isDone = index < done;
          const isRejected = rejected && index === 1;
          return (
            <li key={step.key} className="flex items-center gap-2">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={`h-0.5 w-6 ${isDone ? "bg-brand-dark" : "bg-neutral-300"}`}
                />
              ) : null}
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  isDone
                    ? "border-brand-dark bg-brand-dark text-white"
                    : isRejected
                      ? "border-status-error bg-status-error text-white"
                      : "border-neutral-400 bg-white text-text-secondary"
                }`}
              >
                {isDone ? "✓" : isRejected ? "✕" : index + 1}
              </span>
              <span
                className={`text-xs font-medium ${isDone ? "text-brand-dark" : "text-text-secondary"}`}
              >
                {isRejected ? "Rejected" : step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={`text-xs font-semibold ${statusTone}`}>{soilTestStatusLabel(status)}</p>
    </div>
  );
}
