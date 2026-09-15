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
import ReviewStatusBadge from "../components/ReviewStatusBadge";
import {
  deleteSessionKontikkiLocal,
  getPyrolysisSession,
  getSessionKontikkis,
  kontikkiSectionProgress,
  refreshPyrolysisReviewStatuses,
  submitSelectedKontikkisLocal,
} from "../services/pyrolysisService";
import {
  PYROLYSIS_STAGE_KEYS,
  normalizeStageSavedAt,
} from "@krishecarbon/shared";
import type { PyrolysisSession } from "../database/types";
import type { SessionKontikkiView } from "../services/pyrolysisService";
import { colors, fonts, spacing, radius } from "../constants/theme";

function KontikkiCard({
  row,
  selected,
  onPress,
  onToggleSelect,
  onDelete,
}: {
  row: SessionKontikkiView;
  selected: boolean;
  onPress: () => void;
  onToggleSelect?: () => void;
  onDelete?: () => void;
}) {
  const progress = kontikkiSectionProgress(row);
  const allDone =
    row.infoCompleted && row.moistureCompleted && row.pyrolysisCompleted;
  const isComplete = allDone && row.sampleCompleted;
  const savedStages = normalizeStageSavedAt(row.payload?.stage_saved_at);
  const isDraft = row.submissionStatus !== "submitted";
  const canSelect = isDraft && isComplete && Boolean(onToggleSelect);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {canSelect ? (
          <TouchableOpacity
            style={[styles.checkbox, selected && styles.checkboxSelected]}
            onPress={onToggleSelect}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </TouchableOpacity>
        ) : null}
        <Text style={styles.cardTitle}>{row.kontikkiCode}</Text>
        <Text style={[styles.badge, allDone && styles.badgeDone]}>
          {!isDraft ? "Submitted" : allDone ? "Done" : `${progress}%`}
        </Text>
      </View>

      {isDraft && !isComplete ? (
        <Text style={styles.incompleteHint}>
          Complete every section for this kontikki to be able to submit it.
        </Text>
      ) : null}

      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {row.producerName ? (
          <Text style={styles.producerName}>{row.producerName}</Text>
        ) : null}
        {row.reviewStatus || row.uploadStatus === "synced" ? (
          <ReviewStatusBadge status={row.reviewStatus || "pending"} />
        ) : null}
        {row.reviewerNotes ? (
          <Text style={styles.reviewNotes}>{row.reviewerNotes}</Text>
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
        {row.payload?.batch_number?.trim() ? (
          <Text style={styles.sampleMeta}>Batch ID: {row.payload.batch_number.trim()}</Text>
        ) : null}
      </TouchableOpacity>

      {isDraft && onDelete ? (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={onDelete}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteBtnText}>Delete this entry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function PyrolysisSessionScreen({ route, navigation }) {
  const sessionId = route.params?.sessionId;
  const [session, setSession] = useState<PyrolysisSession | null>(null);
  const [kontikkis, setKontikkis] = useState<SessionKontikkiView[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadLocal = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      Alert.alert("Batch not found", "This pyrolysis batch is missing.", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
      return;
    }
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
  }, [sessionId, navigation]);

  // Review status/notes are cosmetic (admin feedback) — fetch them in the
  // background after the local data is already on screen instead of
  // blocking the whole screen behind a spinner on every visit.
  const refreshReviewStatusInBackground = useCallback(async () => {
    try {
      await refreshPyrolysisReviewStatuses();
      await loadLocal();
    } catch {
      // Offline or backend unreachable — keep last known review status.
    }
  }, [loadLocal]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      // Only show the full spinner the first time this session is opened;
      // on subsequent focuses (e.g. returning from a kontikki form) just
      // refresh the already-visible data in place.
      if (!session) setLoading(true);
      loadLocal().then(() => refreshReviewStatusInBackground());
    });
    return unsubscribe;
  }, [navigation, loadLocal, refreshReviewStatusInBackground, session]);

  const batchProgress = useMemo(() => {
    if (kontikkis.length === 0) return 0;
    const total = kontikkis.reduce((sum, row) => sum + kontikkiSectionProgress(row), 0);
    return Math.round(total / kontikkis.length);
  }, [kontikkis]);

  const draftRows = useMemo(
    () => kontikkis.filter((row) => row.submissionStatus !== "submitted"),
    [kontikkis],
  );
  const submittedRows = useMemo(
    () => kontikkis.filter((row) => row.submissionStatus === "submitted"),
    [kontikkis],
  );
  const submittableRows = useMemo(
    () =>
      draftRows.filter(
        (row) =>
          row.infoCompleted &&
          row.moistureCompleted &&
          row.pyrolysisCompleted &&
          row.sampleCompleted,
      ),
    [draftRows],
  );

  React.useEffect(() => {
    const submittableIds = new Set(submittableRows.map((row) => row.id));
    setSelectedIds((prev) => prev.filter((id) => submittableIds.has(id)));
  }, [submittableRows]);

  function openKontikki(row: SessionKontikkiView) {
    navigation.navigate("PyrolysisKontikkiWorkflow", {
      sessionId,
      kontikkiRowId: row.id,
      kontikkiCode: row.kontikkiCode,
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  async function submitSelected() {
    try {
      setSubmitting(true);
      await submitSelectedKontikkisLocal(sessionId, selectedIds);
      setSelectedIds([]);
      const refreshed = await getPyrolysisSession(sessionId);
      await loadLocal();

      if (refreshed.status !== "active") {
        Alert.alert(
          "Batch submitted",
          "This batch is saved on your device and will sync to the cloud when online.",
          [{ text: "OK", onPress: () => navigation.navigate("PyrolysisDashboard") }],
        );
      } else {
        Alert.alert(
          "Submitted",
          "The selected kontikki(s) are saved on your device and will sync to the cloud when online.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Cannot submit",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmitBatch() {
    if (selectedIds.length === 0) {
      Alert.alert("Select kontikkis", "Choose at least one kontikki to submit.");
      return;
    }

    void submitSelected();
  }

  function handleDeleteKontikki(row: SessionKontikkiView) {
    Alert.alert(
      "Delete this entry?",
      `This permanently removes ${row.kontikkiCode} from this batch and frees it up for a new batch. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { sessionDeleted } = await deleteSessionKontikkiLocal(
                sessionId,
                row.id,
              );
              setSelectedIds((prev) => prev.filter((id) => id !== row.id));
              if (sessionDeleted) {
                navigation.navigate("PyrolysisDashboard");
              } else {
                await loadLocal();
              }
            } catch (err) {
              Alert.alert(
                "Cannot delete",
                err instanceof Error ? err.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
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
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Tap a kontikki to complete batch info, moisture, pyrolysis stages, yield,
            and sample. Changes save automatically on this device. Once every
            section for a kontikki is done, you can select it below to submit —
            or delete an entry to free that kontikki up right away.
          </Text>
        </View>

        {draftRows.map((row) => (
          <KontikkiCard
            key={row.id}
            row={row}
            selected={selectedIds.includes(row.id)}
            onPress={() => openKontikki(row)}
            onToggleSelect={() => toggleSelected(row.id)}
            onDelete={() => handleDeleteKontikki(row)}
          />
        ))}

        {submittedRows.map((row) => (
          <KontikkiCard
            key={row.id}
            row={row}
            selected={false}
            onPress={() => openKontikki(row)}
          />
        ))}
      </ScrollView>

      {session.status === "active" && submittableRows.length > 0 ? (
        <View style={styles.footer}>
          <Text style={styles.footerMeta}>
            {selectedIds.length} of {submittableRows.length} ready kontikki(s) selected
          </Text>
          <PrimaryButton
            title="Submit selected"
            onPress={handleSubmitBatch}
            loading={submitting}
            disabled={selectedIds.length === 0}
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
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.brunswick,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: colors.brunswick,
    borderColor: colors.brunswick,
  },
  checkboxMark: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  deleteBtn: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  deleteBtnText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.error,
  },
  incompleteHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.warning,
    fontStyle: "italic",
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  producerName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brunswick,
    marginBottom: 2,
  },
  reviewNotes: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    lineHeight: 16,
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
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    textAlign: "center",
  },
});
