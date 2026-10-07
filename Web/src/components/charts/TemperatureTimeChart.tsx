"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { KilnTemperatureReading } from "@/types";

interface ChartPoint {
  label: string;
  minutes: number;
  temperature: number;
  top: number | null;
  middle: number | null;
  bottom: number | null;
}

const AXIS = { fontSize: 12, fill: "var(--text-secondary)" };

function buildChartPoints(readings: KilnTemperatureReading[]): ChartPoint[] {
  return readings.map((reading) => ({
    label: formatOffsetLabel(reading.time_offset_seconds),
    minutes: Number((reading.time_offset_seconds / 60).toFixed(1)),
    temperature: Number(reading.temperature.toFixed(2)),
    top: zoneValue(reading.top_c),
    middle: zoneValue(reading.middle_c),
    bottom: zoneValue(reading.bottom_c),
  }));
}

function zoneValue(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function formatOffsetLabel(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

interface TemperatureTimeChartProps {
  readings: KilnTemperatureReading[];
  height?: number;
}

export default function TemperatureTimeChart({
  readings,
  height = 320,
}: TemperatureTimeChartProps) {
  const points = buildChartPoints(readings);
  const hasZones = points.some(
    (point) => point.top != null || point.middle != null || point.bottom != null,
  );

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500"
        style={{ height }}
      >
        No temperature readings for this batch yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="minutes"
            tick={AXIS}
            label={{
              value: "Elapsed time (minutes)",
              position: "insideBottom",
              offset: -2,
              style: { fill: "var(--text-secondary)", fontSize: 12 },
            }}
          />
          <YAxis
            tick={AXIS}
            label={{
              value: "Temperature (°C)",
              angle: -90,
              position: "insideLeft",
              style: { fill: "var(--text-secondary)", fontSize: 12 },
            }}
          />
          <Tooltip
            formatter={(value, name) => [`${value ?? "—"} °C`, name]}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              return point ? `Time ${point.label}` : "Reading";
            }}
          />
          {hasZones ? (
            <Legend />
          ) : null}
          {hasZones ? (
            <>
              <Line
                type="monotone"
                dataKey="top"
                name="Top"
                stroke="var(--series-top)"
                strokeWidth={2}
                connectNulls={false}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="middle"
                name="Middle"
                stroke="var(--series-middle)"
                strokeWidth={2}
                connectNulls={false}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="bottom"
                name="Bottom"
                stroke="var(--series-bottom)"
                strokeWidth={2}
                connectNulls={false}
                dot={false}
              />
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="temperature"
              name="Temperature"
              stroke="var(--series-top)"
              strokeWidth={2}
              dot={points.length <= 60}
              activeDot={{ r: 5 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
