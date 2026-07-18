"use client";

import {
  CartesianGrid,
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
}

function buildChartPoints(readings: KilnTemperatureReading[]): ChartPoint[] {
  return readings.map((reading) => ({
    label: formatOffsetLabel(reading.time_offset_seconds),
    minutes: Number((reading.time_offset_seconds / 60).toFixed(1)),
    temperature: Number(reading.temperature.toFixed(2)),
  }));
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
        <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="minutes"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            label={{
              value: "Elapsed time (minutes)",
              position: "insideBottom",
              offset: -2,
              style: { fill: "#6b7280", fontSize: 12 },
            }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6b7280" }}
            label={{
              value: "Temperature (°C)",
              angle: -90,
              position: "insideLeft",
              style: { fill: "#6b7280", fontSize: 12 },
            }}
          />
          <Tooltip
            formatter={(value) => [`${value ?? 0} °C`, "Temperature"]}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              return point ? `Time ${point.label}` : "Reading";
            }}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#1b4332"
            strokeWidth={2}
            dot={points.length <= 60}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
