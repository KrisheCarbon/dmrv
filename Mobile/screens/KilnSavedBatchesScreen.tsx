import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import {
  deleteEncryptedBatch,
  deleteBatchesByFilenames,
  fetchAllEncryptedBatches,
} from "../services/kiln/batchService";
import {
  syncEncryptedKilnBatches,
  syncSingleEncryptedBatch,
} from "../services/kiln/kilnSyncService";
import { processSyncQueue } from "../services/syncService";
import type EncryptedBatch from "../database/models/EncryptedBatch";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<Record<string, object | undefined>>;
};

export default function KilnSavedBatchesScreen({ navigation }: Props) {
  const [batches, setBatches] = useState<EncryptedBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncAllRunning, setSyncAllRunning] = useState(false);

  const loadBatches = useCallback(async () => {
    const rows = await fetchAllEncryptedBatches();
    setBatches(rows);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBatches();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadBatches]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSyncAll = useCallback(async () => {
    setSyncAllRunning(true);
    try {
      const result = await syncEncryptedKilnBatches();
      await loadBatches();

      if (result.error) {
        Alert.alert(result.pushed > 0 ? "Partial Sync" : "Sync Failed", result.error);
      } else if (result.pushed > 0) {
        Alert.alert("Sync Complete", `${result.pushed} batch(es) uploaded to cloud.`);
      } else {
        Alert.alert("Nothing to Sync", "All saved batches are already synced.");
      }
    } catch (err) {
      Alert.alert("Sync Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSyncAllRunning(false);
    }
  }, [loadBatches]);

  const handleSyncOne = useCallback(
    async (batch: EncryptedBatch) => {
      setSyncingId(batch.id);
      try {
        await syncSingleEncryptedBatch(batch);
        await loadBatches();
        Alert.alert("Synced", `"${batch.sourceFilename}" uploaded successfully.`);
      } catch (err) {
        Alert.alert("Sync Failed", err instanceof Error ? err.message : String(err));
      } finally {
        setSyncingId(null);
      }
    },
    [loadBatches],
  );

  const handleDelete = useCallback(
    (batch: EncryptedBatch) => {
      Alert.alert(
        "Delete Batch",
        `Remove "${batch.sourceFilename}" from this device?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              await deleteEncryptedBatch(batch.id);
              await loadBatches();
            },
          },
        ],
      );
    },
    [loadBatches],
  );

  const handleCleanupCorrupt = useCallback(async () => {
    const unsynced = batches.filter((b) => !b.isSynced);
    if (unsynced.length === 0) return;

    setSyncAllRunning(true);
    try {
      const result = await syncEncryptedKilnBatches();
      if (result.corruptFilenames?.length) {
        const removed = await deleteBatchesByFilenames(result.corruptFilenames);
        await loadBatches();
        Alert.alert(
          "Corrupt Batches Removed",
          `Removed ${removed} invalid batch(es): ${result.corruptFilenames.join(", ")}`,
        );
      } else {
        Alert.alert("No Corrupt Batches", "All unsynced batches look valid.");
      }
    } finally {
      setSyncAllRunning(false);
    }
  }, [batches, loadBatches]);

  const unsyncedCount = batches.filter((b) => !b.isSynced).length;

  return (
    <ScreenShell>
      <ScreenHeader
        title="Saved Kiln Batches"
        subtitle={`${batches.length} total · ${unsyncedCount} pending sync`}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolbarBtn, (syncAllRunning || unsyncedCount === 0) && styles.toolbarBtnDisabled]}
          onPress={handleSyncAll}
          disabled={syncAllRunning || unsyncedCount === 0}
        >
          {syncAllRunning ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.toolbarBtnText}>Sync All to Cloud</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void processSyncQueue()}>
          <Text style={styles.secondaryBtnText}>Run App Sync</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brunswick} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>#{index + 1} {item.sourceFilename}</Text>
                <View style={[styles.badge, item.isSynced ? styles.badgeSynced : styles.badgePending]}>
                  <Text style={styles.badgeText}>{item.isSynced ? "Synced" : "Pending"}</Text>
                </View>
              </View>
              <Text style={styles.meta}>Kiln: {item.kilnId}</Text>
              <Text style={styles.meta}>Received: {item.createdAt.toLocaleString()}</Text>
              <Text style={styles.meta}>Payload: JSON batch recording</Text>
              <View style={styles.actions}>
                {!item.isSynced ? (
                  <TouchableOpacity
                    style={styles.syncBtn}
                    onPress={() => handleSyncOne(item)}
                    disabled={syncingId === item.id || syncAllRunning}
                  >
                    {syncingId === item.id ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.syncBtnText}>Sync</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No Saved Batches</Text>
              <Text style={styles.emptySubtitle}>
                Connect to a kiln sensor and download batch recordings to see them here.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.navigate("KilnScanner")}
              >
                <Text style={styles.primaryBtnText}>Open Kiln Scanner</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {unsyncedCount > 0 ? (
        <TouchableOpacity style={styles.cleanupLink} onPress={handleCleanupCorrupt}>
          <Text style={styles.cleanupText}>Check & remove corrupt batches</Text>
        </TouchableOpacity>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  toolbarBtn: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  toolbarBtnDisabled: { opacity: 0.5 },
  toolbarBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  secondaryBtnText: { color: colors.brunswick, fontFamily: fonts.medium, fontSize: 13 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeSynced: { backgroundColor: colors.successBg },
  badgePending: { backgroundColor: colors.warningBg },
  badgeText: { fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  syncBtn: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
  },
  syncBtnText: { color: colors.white, fontFamily: fonts.medium, fontSize: 13 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deleteBtnText: { color: colors.error, fontFamily: fonts.medium, fontSize: 13 },
  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: spacing.lg },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 8 },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  cleanupLink: { alignItems: "center", paddingBottom: spacing.md },
  cleanupText: { color: colors.error, fontFamily: fonts.medium, fontSize: 13 },
});
