import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from "react-native";
import { pyrolysisStepLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import { getStoredAuthUser } from "../services/auth";
import { getSessionKontikkis, listPyrolysisSessions } from "../services/pyrolysisService";
import {
  isPyrolysisSessionSyncing,
  processSyncQueue,
  retryFailedPyrolysisSyncs,
  subscribeSyncEvents,
} from "../services/syncService";
import type PyrolysisSession from "../database/models/PyrolysisSession";
import { colors, fonts, spacing, radius } from "../constants/theme";

function SessionCard({
  session,
  syncing,
  sampleIds,
  samplePhotoUri,
  onPress,
}: {
  session: PyrolysisSession;
  syncing: boolean;
  sampleIds: string[];
  samplePhotoUri: string | null;
  onPress: () => void;
}) {
  const syncLabel =
    session.status === "active"
      ? "On device"
      : syncing || session.uploadStatus === "syncing"
        ? "Syncing…"
        : session.uploadStatus === "error"
          ? "Sync failed — pull to retry"
          : session.uploadStatus === "synced"
            ? "Synced to dashboard"
            : "Waiting to sync";

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>
          Batch · {new Date(session.createdAt).toLocaleDateString()}
        </Text>
        <Text style={styles.cardBadge}>{session.status}</Text>
      </View>
      <Text style={styles.cardMeta}>
        Step: {pyrolysisStepLabel(session.currentStep as never)}
      </Text>
      {sampleIds.length > 0 ? (
        <Text style={styles.cardMeta}>Sample ID: {sampleIds.join(", ")}</Text>
      ) : null}
      {samplePhotoUri ? (
        <Image source={{ uri: samplePhotoUri }} style={styles.sampleThumb} />
      ) : null}
      <View style={styles.syncRow}>
        {syncing || session.uploadStatus === "syncing" ? (
          <ActivityIndicator size="small" color={colors.brunswick} />
        ) : null}
        <Text
          style={[
            styles.cardSync,
            (syncing || session.uploadStatus === "syncing") && styles.cardSyncActive,
            session.uploadStatus === "error" && styles.cardSyncError,
            session.uploadStatus === "synced" && styles.cardSyncDone,
          ]}
        >
          {syncLabel}
        </Text>
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
    Record<string, { ids: string[]; photoUri: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingSessionIds, setSyncingSessionIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const user = await getStoredAuthUser();
      if (!user) return;
      const rows = await listPyrolysisSessions(user.id);
      setSessions(rows);

      const samples: Record<string, { ids: string[]; photoUri: string | null }> = {};
      for (const session of rows) {
        const kontikkis = await getSessionKontikkis(session.id);
        const ids = kontikkis
          .map((row) => row.payload?.sample_id?.trim())
          .filter((value): value is string => Boolean(value));
        const photoUri =
          kontikkis
            .map(
              (row) =>
                row.payload?.sample_photo_local_uri ?? row.payload?.sample_photo_url ?? null,
            )
            .find(Boolean) ?? null;
        samples[session.id] = { ids, photoUri };
      }
      setSessionSamples(samples);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const syncPendingBatches = useCallback(async () => {
    await retryFailedPyrolysisSyncs();
    await processSyncQueue();
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setLoading(true);
      loadData().then(() => syncPendingBatches());
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
        loadData();
      }

      if (event.type === "syncEnd" || event.type === "syncStart") {
        loadData();
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSync();
    };
  }, [navigation, loadData, syncPendingBatches]);

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
                await loadData();
                await syncPendingBatches();
                await loadData();
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
              sampleIds={sessionSamples[item.id]?.ids ?? []}
              samplePhotoUri={sessionSamples[item.id]?.photoUri ?? null}
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
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.brunswick,
  },
  cardBadge: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.smoke,
    textTransform: "uppercase",
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  sampleThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.chalk,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardSync: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  cardSyncActive: {
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
  cardSyncDone: {
    color: colors.success,
    fontFamily: fonts.medium,
  },
  cardSyncError: {
    color: colors.warning,
    fontFamily: fonts.medium,
  },
  syncError: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.smoke,
    lineHeight: 15,
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
