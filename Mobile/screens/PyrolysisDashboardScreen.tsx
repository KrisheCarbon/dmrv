import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import ReviewStatusBadge from "../components/ReviewStatusBadge";
import { getStoredAuthUser } from "../services/auth";
import {
  getSessionKontikkis,
  listPyrolysisSessions,
  refreshPyrolysisReviewStatuses,
} from "../services/pyrolysisService";
import {
  isPyrolysisSessionSyncing,
  processSyncQueue,
  retryFailedPyrolysisSyncs,
  subscribeSyncEvents,
} from "../services/syncService";
import type { PyrolysisSession } from "../database/types";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { summarizeReviewStatuses } from "../utils/reviewStatus";

type SyncTone = "neutral" | "warning" | "success" | "danger";

const syncTonePalette: Record<SyncTone, { background: string; text: string }> = {
  neutral: { background: colors.chalk, text: colors.smoke },
  warning: { background: colors.warningBg, text: colors.warning },
  success: { background: colors.successBg, text: colors.success },
  danger: { background: colors.errorBg, text: colors.error },
};

function SessionCard({
  session,
  syncing,
  batchIds,
  reviewStatus,
  reviewerNotes,
  onPress,
}: {
  session: PyrolysisSession;
  syncing: boolean;
  batchIds: string[];
  reviewStatus: string | null;
  reviewerNotes: string | null;
  onPress: () => void;
}) {
  const isSyncing = syncing || session.uploadStatus === "syncing";
  const syncTone: SyncTone =
    session.status === "active"
      ? "neutral"
      : isSyncing
        ? "warning"
        : session.uploadStatus === "error"
          ? "danger"
          : session.uploadStatus === "synced"
            ? "success"
            : "warning";
  const syncLabel =
    session.status === "active"
      ? "On device"
      : isSyncing
        ? "Syncing…"
        : session.uploadStatus === "error"
          ? "Sync failed — pull to retry"
          : session.uploadStatus === "synced"
            ? "Synced"
            : "Sync pending";
  const syncPalette = syncTonePalette[syncTone];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>
          {batchIds.length > 0 ? `Batch ID: ${batchIds.join(", ")}` : "Batch"}
        </Text>
        {session.uploadStatus === "synced" || reviewStatus ? (
          <ReviewStatusBadge status={reviewStatus || "pending"} />
        ) : null}
      </View>
      <Text style={styles.cardMeta}>
        {new Date(session.createdAt).toLocaleDateString()}{" "}
        {new Date(session.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
      {reviewerNotes ? (
        <Text style={styles.reviewNotes} numberOfLines={2}>
          {reviewerNotes}
        </Text>
      ) : null}
      <View style={styles.syncRow}>
        {isSyncing ? <ActivityIndicator size="small" color={colors.warning} /> : null}
        <View style={[styles.syncBadge, { backgroundColor: syncPalette.background }]}>
          <Text style={[styles.syncBadgeText, { color: syncPalette.text }]}>
            {syncLabel}
          </Text>
        </View>
      </View>
      {session.uploadStatus === "error" && session.syncError ? (
        <Text style={styles.syncError} numberOfLines={3}>
          {session.syncError}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function PyrolysisDashboardScreen({ navigation }) {
  const [sessions, setSessions] = useState<PyrolysisSession[]>([]);
  const [sessionSamples, setSessionSamples] = useState<
    Record<
      string,
      {
        batchIds: string[];
        reviewStatus: string | null;
        reviewerNotes: string | null;
      }
    >
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingSessionIds, setSyncingSessionIds] = useState<Set<string>>(new Set());

  // Reads everything from local SQLite only — no network calls — so the
  // dashboard renders immediately from whatever is already on the device.
  const loadLocal = useCallback(async () => {
    try {
      const user = await getStoredAuthUser();
      if (!user) return;
      const rows = await listPyrolysisSessions(user.id);
      setSessions(rows);

      const entries = await Promise.all(
        rows.map(async (session) => {
          const kontikkis = await getSessionKontikkis(session.id);
          const batchIds = kontikkis
            .map((row) => row.payload?.batch_number?.trim())
            .filter((value): value is string => Boolean(value));
          const notes =
            kontikkis.map((row) => row.reviewerNotes).find((value) => Boolean(value)) ??
            null;
          return [
            session.id,
            {
              batchIds,
              reviewStatus:
                session.uploadStatus === "synced"
                  ? summarizeReviewStatuses(kontikkis.map((row) => row.reviewStatus))
                  : null,
              reviewerNotes: notes,
            },
          ] as const;
        }),
      );
      setSessionSamples(Object.fromEntries(entries));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Review status/notes are cosmetic (admin feedback) — refresh them from
  // the backend in the background, after the local list is already
  // rendered, instead of gating the dashboard behind a network call.
  const refreshReviewStatusInBackground = useCallback(async () => {
    try {
      await refreshPyrolysisReviewStatuses();
      await loadLocal();
    } catch {
      // Offline or backend unreachable — keep last known review status.
    }
  }, [loadLocal]);

  const syncPendingBatches = useCallback(async () => {
    await retryFailedPyrolysisSyncs();
    await processSyncQueue();
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setLoading(true);
      loadLocal()
        .then(() => syncPendingBatches())
        .then(() => refreshReviewStatusInBackground());
    });

    const unsubscribeSync = subscribeSyncEvents((event) => {
      if (event.type === "pyrolysisSyncStart" && event.sessionId) {
        setSyncingSessionIds((prev) => new Set(prev).add(String(event.sessionId)));
      }

      if (event.type === "pyrolysisSyncComplete" && event.sessionId) {
        setSyncingSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(String(event.sessionId));
          return next;
        });
        loadLocal();
      }

      if (event.type === "syncEnd" || event.type === "syncStart") {
        loadLocal();
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSync();
    };
  }, [navigation, loadLocal, syncPendingBatches, refreshReviewStatusInBackground]);

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pyrolysis</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate("PyrolysisSelectKontikkis")}
          accessibilityLabel="Start new batch"
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {loading && sessions.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadLocal();
                await syncPendingBatches();
                await refreshReviewStatusInBackground();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No batches yet</Text>
              <Text style={styles.emptyText}>
                Tap + to select kontikkis and start a new pyrolysis batch.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SessionCard
              session={item}
              syncing={syncingSessionIds.has(item.id) || isPyrolysisSessionSyncing(item.id)}
              batchIds={sessionSamples[item.id]?.batchIds ?? []}
              reviewStatus={sessionSamples[item.id]?.reviewStatus ?? null}
              reviewerNotes={sessionSamples[item.id]?.reviewerNotes ?? null}
              onPress={() =>
                navigation.navigate("PyrolysisSession", { sessionId: item.id })
              }
            />
          )}
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.4,
    paddingLeft: 10,
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    flex: 1,
    marginRight: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.brunswick,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  syncBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  syncBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  syncError: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    lineHeight: 15,
  },
  reviewNotes: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    lineHeight: 16,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    textAlign: "center",
    lineHeight: 20,
  },
});
