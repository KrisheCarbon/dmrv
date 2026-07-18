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
import { applicationMediaTypeLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import { getStoredAuthUser } from "../services/auth";
import {
  listApplicationEntries,
  toApplicationEntryView,
  type ApplicationEntryView,
} from "../services/applicationService";
import {
  isApplicationEntrySyncing,
  processSyncQueue,
  retryFailedApplicationSyncs,
  subscribeSyncEvents,
} from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

function EntryCard({
  entry,
  syncing,
  onPress,
}: {
  entry: ApplicationEntryView;
  syncing: boolean;
  onPress: () => void;
}) {
  const batchLabel =
    entry.pyrolysisLinks.length === 0
      ? "No batches linked"
      : `${entry.pyrolysisLinks.length} pyrolysis batch(es)`;

  const reviewLabel =
    entry.status === "draft"
      ? "Draft"
      : entry.uploadStatus === "synced"
        ? "Pending review"
        : entry.status === "submitted"
          ? "Submitted"
          : entry.status;

  const syncLabel =
    entry.status === "draft"
      ? "Draft on device"
      : syncing || entry.uploadStatus === "syncing"
        ? "Syncing…"
        : entry.uploadStatus === "error"
          ? "Sync failed — pull to retry"
          : entry.uploadStatus === "synced"
            ? "Uploaded — pending review"
            : "Waiting to sync";

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>
          Application · {new Date(entry.appliedAt).toLocaleString()}
        </Text>
        <Text style={styles.cardBadge}>{reviewLabel}</Text>
      </View>
      <Text style={styles.cardMeta}>{entry.farmName || "Farm not set"}</Text>
      <Text style={styles.cardMeta}>
        {batchLabel}
        {entry.mediaType ? ` · ${applicationMediaTypeLabel(entry.mediaType)}` : ""}
      </Text>
      <View style={styles.syncRow}>
        {syncing || entry.uploadStatus === "syncing" ? (
          <ActivityIndicator size="small" color={colors.brunswick} />
        ) : null}
        <Text
          style={[
            styles.cardSync,
            (syncing || entry.uploadStatus === "syncing") && styles.cardSyncActive,
            entry.uploadStatus === "error" && styles.cardSyncError,
            entry.uploadStatus === "synced" && styles.cardSyncDone,
          ]}
        >
          {syncLabel}
        </Text>
      </View>
      {entry.uploadStatus === "error" && entry.syncError ? (
        <Text style={styles.syncError} numberOfLines={3}>
          {entry.syncError}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ApplicationDashboardScreen({ navigation }) {
  const [entries, setEntries] = useState<ApplicationEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingEntryIds, setSyncingEntryIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const user = await getStoredAuthUser();
      if (!user) return;
      const rows = await listApplicationEntries(user.id);
      const views = await Promise.all(rows.map((row) => toApplicationEntryView(row)));
      setEntries(views);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const syncPendingEntries = useCallback(async () => {
    await retryFailedApplicationSyncs();
    await processSyncQueue();
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setLoading(true);
      loadData().then(() => syncPendingEntries());
    });

    const unsubscribeSync = subscribeSyncEvents((event) => {
      if (event.type === "applicationSyncStart" && event.entryId) {
        setSyncingEntryIds((prev) => new Set(prev).add(String(event.entryId)));
      }

      if (event.type === "applicationSyncComplete" && event.entryId) {
        setSyncingEntryIds((prev) => {
          const next = new Set(prev);
          next.delete(String(event.entryId));
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
  }, [navigation, loadData, syncPendingEntries]);

  async function startNewEntry() {
    const user = await getStoredAuthUser();
    if (!user) return;

    const { createApplicationEntryLocal } = await import("../services/applicationService");
    const entryId = await createApplicationEntryLocal(user.id);
    navigation.navigate("ApplicationEntry", { entryId });
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Application</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={startNewEntry}
          accessibilityLabel="Start new application entry"
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {loading && entries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadData();
                await syncPendingEntries();
                await loadData();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No application entries yet</Text>
              <Text style={styles.emptyText}>
                Tap + to record biochar application on a farm.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              syncing={syncingEntryIds.has(item.id) || isApplicationEntrySyncing(item.id)}
              onPress={() => navigation.navigate("ApplicationEntry", { entryId: item.id })}
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
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brunswick,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: fonts.medium,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
  },
  cardBadge: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: "capitalize",
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  cardSync: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardSyncActive: {
    color: colors.brunswick,
  },
  cardSyncError: {
    color: colors.error,
  },
  cardSyncDone: {
    color: colors.success,
  },
  syncError: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.error,
  },
  empty: {
    paddingTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.brunswick,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
