import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts, spacing, radius } from "../constants/theme";

export interface LiveChartPoint {
  top: number | null;
  mid: number | null;
  bot: number | null;
}

const CHART_HEIGHT = 140;

export default function KilnLiveChart({ points }: { points: LiveChartPoint[] }) {
  const windowPoints = points.slice(-40);
  const values = windowPoints.flatMap((point) =>
    [point.top, point.mid, point.bot].filter((value): value is number => value != null),
  );
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values, min + 1) : 1;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Live temperature · 1 second</Text>
      <View style={styles.legend}>
        <LegendDot color={colors.brunswick} label="Top" />
        <LegendDot color={colors.success} label="Middle" />
        <LegendDot color={colors.warning} label="Bottom" />
      </View>
      {windowPoints.length < 2 ? (
        <Text style={styles.empty}>The chart fills as readings arrive.</Text>
      ) : (
        <View style={styles.plot}>
          {windowPoints.map((point, index) => (
            <View key={index} style={styles.column}>
              <Bar value={point.top} min={min} max={max} color={colors.brunswick} />
              <Bar value={point.mid} min={min} max={max} color={colors.success} />
              <Bar value={point.bot} min={min} max={max} color={colors.warning} />
            </View>
          ))}
        </View>
      )}
      <Text style={styles.scale}>
        {values.length ? `${min.toFixed(0)}–${max.toFixed(0)} °C` : "Waiting"}
      </Text>
    </View>
  );
}

function Bar({
  value,
  min,
  max,
  color,
}: {
  value: number | null;
  min: number;
  max: number;
  color: string;
}) {
  const height = value == null ? 0 : Math.max(4, ((value - min) / (max - min)) * CHART_HEIGHT);
  return (
    <View style={styles.barTrack}>
      <View style={[styles.bar, { height, backgroundColor: color }]} />
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  legend: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  plot: { flexDirection: "row", alignItems: "flex-end", height: CHART_HEIGHT, gap: 2 },
  column: { flex: 1, flexDirection: "row", alignItems: "flex-end", height: CHART_HEIGHT, gap: 1 },
  barTrack: { flex: 1, height: CHART_HEIGHT, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 2 },
  empty: { fontFamily: fonts.regular, fontSize: 15, color: colors.textSecondary, paddingVertical: spacing.md },
  scale: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
});
