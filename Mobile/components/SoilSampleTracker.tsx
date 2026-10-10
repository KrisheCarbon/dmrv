import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  SOIL_SAMPLE_TRACK_STEPS,
  soilSampleStage,
  soilSampleStepsDone,
  soilTestStatusLabel,
} from "@krishecarbon/shared";
import { colors, fonts, radius, spacing, typeScale } from "../constants/theme";

/**
 * Collected → Ready to test → Tested, each with a check mark once done.
 * The current status is also written out, so colour is never the only signal.
 */
export default function SoilSampleTracker({
  status,
  compact = false,
}: {
  status: string | null | undefined;
  compact?: boolean;
}) {
  const stage = soilSampleStage(status);
  const done = soilSampleStepsDone(status);
  const rejected = stage === "rejected";

  return (
    <View style={styles.wrap} accessibilityLabel={`Sample status: ${soilTestStatusLabel(status)}`}>
      <View style={styles.row}>
        {SOIL_SAMPLE_TRACK_STEPS.map((step, index) => {
          const isDone = index < done;
          const isRejectedStep = rejected && index === 1;
          return (
            <React.Fragment key={step.key}>
              {index > 0 ? (
                <View style={[styles.line, isDone && styles.lineDone]} />
              ) : null}
              <View style={styles.step}>
                <View
                  style={[
                    styles.dot,
                    isDone && styles.dotDone,
                    isRejectedStep && styles.dotRejected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dotGlyph,
                      (isDone || isRejectedStep) && styles.dotGlyphOn,
                    ]}
                  >
                    {isDone ? "✓" : isRejectedStep ? "✕" : String(index + 1)}
                  </Text>
                </View>
                {!compact ? (
                  <Text style={[styles.stepLabel, isDone && styles.stepLabelDone]}>
                    {isRejectedStep ? "Rejected" : step.label}
                  </Text>
                ) : null}
              </View>
            </React.Fragment>
          );
        })}
      </View>
      <Text
        style={[
          styles.status,
          stage === "waiting_pickup" && styles.statusWaiting,
          rejected && styles.statusRejected,
          stage === "tested" && styles.statusDone,
        ]}
      >
        {soilTestStatusLabel(status)}
      </Text>
    </View>
  );
}

const DOT = 28;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  step: {
    alignItems: "center",
    gap: 4,
    minWidth: DOT,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.smoke,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: {
    borderColor: colors.brunswick,
    backgroundColor: colors.brunswick,
  },
  dotRejected: {
    borderColor: colors.error,
    backgroundColor: colors.error,
  },
  dotGlyph: {
    fontFamily: fonts.bold,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  dotGlyphOn: {
    color: colors.white,
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: DOT / 2 - 1,
    backgroundColor: colors.borderDark,
  },
  lineDone: {
    backgroundColor: colors.brunswick,
  },
  stepLabel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  stepLabelDone: {
    color: colors.brunswick,
  },
  status: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.brunswick,
  },
  statusWaiting: {
    color: colors.warning,
  },
  statusDone: {
    color: colors.success,
  },
  statusRejected: {
    color: colors.error,
  },
});
