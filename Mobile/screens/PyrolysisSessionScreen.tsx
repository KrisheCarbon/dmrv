import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import {
  completePyrolysisBatchLocal,
  getPyrolysisSession,
  getSessionKontikkis,
  kontikkiSectionProgress,
} from "../services/pyrolysisService";
import {
  PYROLYSIS_STAGE_KEYS,
  normalizeStageSavedAt,
} from "@krishecarbon/shared";
import type PyrolysisSession from "../database/models/PyrolysisSession";
import type { SessionKontikkiView } from "../services/pyrolysisService";
import { colors, fonts, spacing, radius } from "../constants/theme";

function KontikkiCard({
  row,
  onPress,
}: {
  row: SessionKontikkiView;
  onPress: () => void;
}) {
  const progress = kontikkiSectionProgress(row);
  const allDone =
    row.infoCompleted && row.moistureCompleted && row.pyrolysisCompleted;
  const savedStages = normalizeStageSavedAt(row.payload?.stage_saved_at);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{row.kontikkiCode}</Text>
        <Text style={[styles.badge, allDone && styles.badgeDone]}>
          {allDone ? "Done" : `${progress}%`}
        </Text>
      </View>
      {row.producerName ? (
        <Text style={styles.cardMeta}>{row.producerName}</Text>
      ) : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.stepRow}>
        <Text style={styles.stepChip}>Info {row.infoCompleted ? "✓" : "·"}</Text>
        <Text style={styles.stepChip}>
          Moisture {row.moistureCompleted ? "✓" : "·"}
        </Text>
        {PYROLYSIS_STAGE_KEYS.map((stage) => (
          <Text key={stage} style={styles.stepChip}>
            {stage === "initial"
              ? "Init"
              : stage === "middle"
                ? "Mid"
                : stage === "final"
                  ? "Fin"
                  : "Qnch"}{" "}
            {savedStages[stage] ? "✓" : "·"}
          </Text>
        ))}
        <Text style={styles.stepChip}>Yield {row.pyrolysisCompleted ? "✓" : "·"}</Text>
        <Text style={styles.stepChip}>Sample {row.sampleCompleted ? "✓" : "·"}</Text>
      </View>
      {row.payload?.sample_id?.trim() ? (
        <Text style={styles.sampleMeta}>Sample ID: {row.payload.sample_id.trim()}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function PyrolysisSessionScreen({ route, navigation }) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<PyrolysisSession | null>(null);
  const [kontikkis, setKontikkis] = useState<SessionKontikkiView[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sessionRow, kontikkiRows] = await Promise.all([
        getPyrolysisSession(sessionId),
        getSessionKontikkis(sessionId),
      ]);
      setSession(sessionRow);
      setKontikkis(kontikkiRows);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setLoading(true);
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const batchProgress = useMemo(() => {
    if (kontikkis.length === 0) return 0;
    const total = kontikkis.reduce((sum, row) => sum + kontikkiSectionProgress(row), 0);
    return Math.round(total / kontikkis.length);
  }, [kontikkis]);

  const allKontikkisComplete = kontikkis.every(
    (row) =>
      row.infoCompleted &&
      row.moistureCompleted &&
      row.pyrolysisCompleted &&
      row.sampleCompleted,
  );

  function openKontikki(row: SessionKontikkiView) {
    navigation.navigate("PyrolysisKontikkiWorkflow", {
      sessionId,
      kontikkiRowId: row.id,
      kontikkiCode: row.kontikkiCode,
    });
  }

  async function handleSubmitBatch() {
    try {
      setSubmitting(true);
      await completePyrolysisBatchLocal(sessionId);
      Alert.alert(
        "Batch submitted",
        "This batch is saved on your device and will sync to the cloud when online.",
        [{ text: "OK", onPress: () => navigation.navigate("PyrolysisDashboard") }],
      );
    } catch (err) {
      Alert.alert(
        "Cannot submit",
        err instanceof Error ? err.message : "Complete all sections first.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !session) {
    return (
      <ScreenShell>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScreenHeader
        title="Pyrolysis batch"
        subtitle={`${batchProgress}% complete · ${kontikkis.length} kontikki(s)`}
        onBack={() => navigation.goBack()}
        rightElement={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate("PyrolysisSelectKontikkis")}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Tap a kontikki to complete batch info, moisture, pyrolysis stages, yield,
            and sample. Changes save automatically on this device. Submit the batch when
            all kontikkis are done — photos and data sync to the cloud with a
            progress indicator on the dashboard.
          </Text>
        </View>

        {kontikkis.map((row) => (
          <KontikkiCard key={row.id} row={row} onPress={() => openKontikki(row)} />
        ))}
      </ScrollView>

      {session.status === "active" ? (
        <View style={styles.footer}>
          <PrimaryButton
            title="Submit batch"
            onPress={handleSubmitBatch}
            loading={submitting}
            disabled={!allKontikkisComplete}
          />
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noteCard: {
    backgroundColor: colors.chalk,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.brunswick,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  badge: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.warning,
    textTransform: "uppercase",
  },
  badgeDone: {
    color: colors.success,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.chalk,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brunswick,
    borderRadius: 3,
  },
  stepRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  stepChip: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  sampleMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.brunswick,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1A3C2A",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontSize: 26,
    lineHeight: 28,
    color: "#8CC63E",
    fontFamily: fonts.medium,
    marginTop: -1,
  },
});
