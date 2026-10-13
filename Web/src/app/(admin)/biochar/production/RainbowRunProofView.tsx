"use client";

import { useEffect, useState } from "react";
import PyrolysisPhotoThumb from "./PyrolysisPhotoThumb";
import { createSignedStorageUrl } from "@/lib/privateStorage";
import { PYROLYSIS_PHOTOS_BUCKET, formatDateTime, type RainbowRunProof } from "./productionLib";

function QuenchVideo({
  path,
  duration,
  capturedAt,
}: {
  path: string;
  duration: string | null;
  capturedAt: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createSignedStorageUrl(PYROLYSIS_PHOTOS_BUCKET, path).then((signed) => {
      if (!cancelled) setSrc(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-2">
      <p className="text-sm font-medium text-neutral-900">Quench video</p>
      <p className="text-xs text-neutral-500">
        {duration ? `${duration} long` : "Short video"}
        {capturedAt ? ` · recorded ${formatDateTime(capturedAt)}` : ""}
      </p>
      {src ? (
        <video className="mt-2 w-full rounded-xl" controls src={src}>
          <a href={src}>Play quench video</a>
        </video>
      ) : (
        <p className="mt-2 text-sm text-neutral-900">Video not available.</p>
      )}
    </div>
  );
}

function durationLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes <= 0) return `${rest} sec`;
  return `${minutes} min ${rest} sec`;
}

function moistureSummary(proof: RainbowRunProof): string {
  const limit =
    proof.moisture_mean_limit != null ? `${proof.moisture_mean_limit}%` : "the feedstock limit";
  const kind =
    proof.feedstock_class === "woody"
      ? "Woody biomass"
      : proof.feedstock_class === "other"
        ? "Other biomass"
        : "This feedstock";
  const mean =
    proof.moisture_mean != null ? `${proof.moisture_mean.toFixed(1)}%` : "not calculated";
  const rule = `${kind} needs all moisture photos before loading: at least ${proof.required_moisture_count} for a 1,000-1,099 L kiln, a mean at or below ${limit}, and no reading above 25%.`;
  if (proof.moisture.length === 0) {
    return `${rule} None are uploaded.`;
  }
  return proof.moisture_within_rules
    ? `${rule} Mean is ${mean}. This run meets that rule.`
    : `${rule} Mean is ${mean}. This run does not meet that rule.`;
}

function ProofPhoto({
  label,
  path,
  capturedAt,
  photoLayout,
}: {
  label: string;
  path: string | null;
  capturedAt: string | null;
  photoLayout: "drawer" | "page";
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-2">
      <p className="text-sm font-medium text-neutral-900">{label}</p>
      <p className="text-xs text-neutral-500">
        {capturedAt ? formatDateTime(capturedAt) : "No timestamp on this photo."}
      </p>
      <div className="mt-2">
        <PyrolysisPhotoThumb size={photoLayout} path={path} label={label} />
      </div>
    </div>
  );
}

export default function RainbowRunProofView({
  proof,
  photoLayout,
}: {
  proof: RainbowRunProof | null;
  photoLayout: "drawer" | "page";
}) {
  if (!proof) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-950">Run proof</h3>
        <p className="mt-1 text-sm text-neutral-900">No moisture or process photos on this run.</p>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-950">Moisture readings</h3>
        <p className="mt-1 text-sm text-neutral-900">{moistureSummary(proof)}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {proof.moisture.map((reading) => (
            <ProofPhoto
              key={reading.slot}
              label={
                reading.reading != null
                  ? `Moisture ${reading.slot}: ${reading.reading}%`
                  : `Moisture ${reading.slot}`
              }
              path={reading.photo_url ?? null}
              capturedAt={reading.captured_at ?? null}
              photoLayout={photoLayout}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-950">Pyrolysis layers</h3>
        <p className="mt-1 text-sm text-neutral-900">
          {proof.last_layer_confirmed
            ? "Every layer is photographed and the last layer is marked."
            : "The last layer is not marked yet."}
        </p>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {proof.layers.map((layer) => (
              <ProofPhoto
                key={layer.sequence}
                label={`Layer ${layer.sequence} in the kiln`}
                path={layer.photo_url ?? null}
                capturedAt={layer.captured_at ?? null}
                photoLayout={photoLayout}
              />
            ))}
          </div>
          <ProofPhoto
            label="Flame curtain after the last layer"
            path={proof.flame_curtain_photo_url}
            capturedAt={proof.flame_curtain_captured_at}
            photoLayout={photoLayout}
          />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-950">Quenching</h3>
        <p className="mt-1 text-sm text-neutral-900">
          {durationLabel(proof.quench_duration_seconds)
            ? `Quench lasted ${durationLabel(proof.quench_duration_seconds)}, from the time printed on the first and last photos.`
            : "Photos from the start of quenching to the end, or one short video."}
        </p>
        <div className="mt-3 grid gap-3">
          {(proof.quench_photos ?? []).map((photo) => (
            <ProofPhoto
              key={photo.slot}
              label={
                photo.slot === 1
                  ? "Quenching start"
                  : photo.slot === (proof.quench_photos?.length ?? 0)
                    ? "Quenching end"
                    : `Quenching photo ${photo.slot}`
              }
              path={photo.photo_url}
              capturedAt={photo.captured_at}
              photoLayout={photoLayout}
            />
          ))}
          {proof.quench_video_url ? (
            <QuenchVideo
              path={proof.quench_video_url}
              duration={durationLabel(proof.quench_video_duration_seconds)}
              capturedAt={proof.quench_video_captured_at ?? null}
            />
          ) : null}
          {!proof.quench_video_url && (proof.quench_photos ?? []).length === 0 ? (
            <>
              <ProofPhoto
                label="Quenching start"
                path={proof.quench_start_photo_url}
                capturedAt={proof.quench_start_captured_at}
                photoLayout={photoLayout}
              />
              <ProofPhoto
                label="Quenching end"
                path={proof.quench_end_photo_url}
                capturedAt={proof.quench_end_captured_at}
                photoLayout={photoLayout}
              />
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
