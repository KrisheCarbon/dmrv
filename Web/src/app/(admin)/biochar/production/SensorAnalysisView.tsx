"use client";

import { formatDateTime } from "./productionLib";
import type { RapidDrop, SensorAnalysis, TemperatureDip } from "./sensorAnalysis";

function formatC(value: number) {
  return `${value.toFixed(1)}°C`;
}

function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes <= 0) return `${rest} sec`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} sec`;
}

function DropRows({ drops }: { drops: RapidDrop[] }) {
  if (drops.length === 0) {
    return <p className="text-sm text-neutral-900">No rapid drop in this curve.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-neutral-900">
        <thead>
          <tr className="text-xs text-text-secondary">
            <th className="py-1 pr-3 font-medium">From</th>
            <th className="py-1 pr-3 font-medium">To</th>
            <th className="py-1 pr-3 font-medium">Started</th>
            <th className="py-1 pr-3 font-medium">Ended</th>
            <th className="py-1 pr-3 font-medium">Time</th>
            <th className="py-1 font-medium">Speed</th>
          </tr>
        </thead>
        <tbody>
          {drops.map((drop) => (
            <tr key={`${drop.start_at}-${drop.end_at}`} className="border-t border-neutral-200">
              <td className="py-1.5 pr-3">{formatC(drop.from_c)}</td>
              <td className="py-1.5 pr-3">{formatC(drop.to_c)}</td>
              <td className="py-1.5 pr-3">{formatDateTime(drop.start_at)}</td>
              <td className="py-1.5 pr-3">{formatDateTime(drop.end_at)}</td>
              <td className="py-1.5 pr-3">{formatDuration(drop.duration_seconds)}</td>
              <td className="py-1.5">{drop.degrees_per_minute.toFixed(1)}°C/min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DipList({ dips }: { dips: TemperatureDip[] }) {
  if (dips.length === 0) return <p className="text-sm text-neutral-900">The curve did not dip.</p>;
  return (
    <ul className="space-y-1 text-sm text-neutral-900">
      {dips.map((dip) => (
        <li key={`${dip.at}-${dip.trough_c}`}>
          Down to {formatC(dip.trough_c)} from {formatC(dip.peak_c)} at {formatDateTime(dip.at)}
        </li>
      ))}
    </ul>
  );
}

export function SensorAnalysisTable({ analysis }: { analysis: SensorAnalysis }) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 px-3 py-3">
      <p className="text-xs text-text-secondary">
        Saved once from {analysis.reading_count} temperature readings
        {analysis.device_id ? ` on ${analysis.device_id}` : ""}. This is not recalculated.
      </p>
      <dl className="grid gap-2 text-sm text-neutral-900 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-text-secondary">Highest</dt>
          <dd>
            {formatC(analysis.highest_c)} at {formatDateTime(analysis.highest_at)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Lowest</dt>
          <dd>
            {formatC(analysis.lowest_c)} at {formatDateTime(analysis.lowest_at)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Dips</dt>
          <dd>{analysis.dip_count}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Crossed 340°C</dt>
          <dd>{analysis.crossed_340_at ? formatDateTime(analysis.crossed_340_at) : "Not crossed"}</dd>
        </div>
      </dl>
      <div>
        <h4 className="text-sm font-medium text-neutral-950">Where the temperature dipped</h4>
        <div className="mt-1">
          <DipList dips={analysis.dips} />
        </div>
      </div>
      <div>
        <h4 className="text-sm font-medium text-neutral-950">
          Dips below 340°C after it was crossed ({analysis.dips_below_340_count})
        </h4>
        {analysis.dips_below_340.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-900">None.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-neutral-900">
            {analysis.dips_below_340.map((dip) => (
              <li key={`${dip.at}-${dip.trough_c}`}>
                Down to {formatC(dip.trough_c)} at {formatDateTime(dip.at)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-sm font-medium text-neutral-950">Fastest dip</h4>
        <p className="mt-1 text-xs text-text-secondary">
          Rapid quenching is the steepest sustained fall, measured in °C per minute. A probe reading that drops to zero is ignored.
        </p>
        <div className="mt-1">
          <DropRows drops={analysis.rapid_drops} />
        </div>
      </div>
    </div>
  );
}

export function QuenchSensorSummary({ analysis }: { analysis: SensorAnalysis | null }) {
  if (!analysis?.quench) {
    return (
      <p className="mt-2 text-sm text-neutral-900">
        Sensor quench detail is saved the first time Analysis is opened on the curve.
      </p>
    );
  }
  const quench = analysis.quench;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-neutral-900">
        Total time from the first quench temperature to the last quench temperature:{" "}
        {formatDuration(quench.duration_seconds)}, {formatDateTime(quench.start_at)} to{" "}
        {formatDateTime(quench.end_at)}.
      </p>
      <p className="text-sm text-neutral-900">
        The sensor fell from {formatC(quench.from_c)} to {formatC(quench.to_c)} at{" "}
        {quench.degrees_per_minute.toFixed(1)}°C per minute.
      </p>
      {analysis.rapid_drops.length > 1 ? (
        <div>
          <p className="text-xs text-text-secondary">Other rapid drops in this curve</p>
          <DropRows drops={analysis.rapid_drops.filter((drop) => drop !== quench)} />
        </div>
      ) : null}
    </div>
  );
}
