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
import {
  describeFarmPhotoDistance,
  formatApplicationAcres,
  nearestBoundaryDistanceMeters,
  type ApplicationFarmerOption,
} from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import { getStoredAuthUser } from "../services/auth";
import {
  createBiomassCollectionLocal,
  listBiomassCollections,
  loadBiomassCollectionOptions,
  toBiomassCollectionView,
  type BiomassCollectionView,
} from "../services/biomassCollectionService";
import {
  isBiomassCollectionSyncing,
  processSyncQueue,
  retryFailedBiomassCollectionSyncs,
  subscribeSyncEvents,
} from "../services/syncService";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";

function stageLabel(item: BiomassCollectionView) {
  if (item.status === "draft") return "Loading at farm";
  if (item.status === "loaded") return "In transit · unload at site";
  return "Unloaded";
}

function syncLabel(item: BiomassCollectionView, syncing: boolean) {
  if (item.status === "draft" || item.status === "loaded") return "Saved on this phone";
  if (syncing || item.uploadStatus === "syncing") return "Syncing…";
  if (item.uploadStatus === "error") return "Sync failed";
  if (item.uploadStatus === "synced") return "✓ Synced";
  return "Waiting to sync";
}

function ringsFor(item: BiomassCollectionView, farmers: ApplicationFarmerOption[]) {
  const farmer = farmers.find((entry) => entry.id === item.farmId);
  if (!farmer) return [];
  const plot = farmer.fields.find((field) => field.id === item.farmFieldId);
  if (plot) return [plot.boundary];
  if (item.farmFieldId) return [];
  return farmer.fields.map((field) => field.boundary);
}

function distanceLabel(item: BiomassCollectionView, farmers: ApplicationFarmerOption[]) {
  if (!item.loadedPhotoMetadata || farmers.length === 0) return null;
  const rings = ringsFor(item, farmers);
  const distanceM =
    rings.length > 0
      ? nearestBoundaryDistanceMeters(
          {
            latitude: item.loadedPhotoMetadata.latitude,
            longitude: item.loadedPhotoMetadata.longitude,
          },
          rings,
        )
      : null;
  return describeFarmPhotoDistance(distanceM, {
    hasGps: Number.isFinite(item.loadedPhotoMetadata.latitude),
    hasBoundary: rings.some((ring) => ring.length >= 3),
  });
}

function CollectionCard({
  item,
  syncing,
  distance,
  plotLabel,
  onPress,
  onRetry,
}: {
  item: BiomassCollectionView;
  syncing: boolean;
  distance: ReturnType<typeof distanceLabel>;
  plotLabel: string | null;
  onPress: () => void;
  onRetry: () => void;
}) {
  const startedAt = item.loadedPhotoMetadata?.captured_at ?? new Date(item.createdAt).toISOString();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{item.farmName || "Farm not set"}</Text>
        <Text style={styles.cardStage}>{stageLabel(item)}</Text>
      </View>
      <Text style={styles.cardMeta}>
        To {item.producerName || "production site not set"}
        {item.tractorNumber ? ` · ${item.tractorNumber}` : ""}
      </Text>
      {plotLabel ? <Text style={styles.cardDistanceUnknown}>{plotLabel}</Text> : null}
      <Text style={styles.cardMeta}>{startedAt.slice(0, 16).replace("T", " ")} IST</Text>
      {distance ? (
        <Text
          style={
            distance.outsideLimit
              ? styles.cardDistanceFar
              : distance.distanceM == null
                ? styles.cardDistanceUnknown
                : styles.cardDistance
          }
        >
          {distance.outsideLimit ? "⚠ " : ""}
          From farm: {distance.short}
        </Text>
      ) : null}
      <View style={styles.syncRow}>
        {syncing || item.uploadStatus === "syncing" ? (
          <ActivityIndicator size="small" color={colors.brunswick} />
        ) : null}
        <Text
          style={[
            styles.cardSync,
            item.uploadStatus === "error" && styles.cardSyncError,
            item.uploadStatus === "synced" && styles.cardSyncDone,
          ]}
        >
          {syncLabel(item, syncing)}
        </Text>
      </View>
      {item.uploadStatus === "error" ? (
        <>
          {item.syncError ? (
            <Text style={styles.syncError} numberOfLines={3}>
              {item.syncError}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>Retry sync</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </TouchableOpacity>
  );
}

export default function BiomassCollectionDashboardScreen({ navigation }) {
  const [items, setItems] = useState<BiomassCollectionView[]>([]);
  const [farmers, setFarmers] = useState<ApplicationFarmerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const user = await getStoredAuthUser();
      if (!user) return;
      const rows = await listBiomassCollections(user.id);
      setItems(rows.map(toBiomassCollectionView));
      try {
        const options = await loadBiomassCollectionOptions();
        setFarmers(options.farmers);
      } catch {
        setFarmers([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const retrySync = useCallback(async () => {
    await retryFailedBiomassCollectionSyncs();
    await loadData();
    await processSyncQueue();
  }, [loadData]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setLoading(true);
      void loadData().then(() => processSyncQueue());
    });

    const unsubscribeSync = subscribeSyncEvents((event) => {
      if (event.type === "biomassCollectionSyncStart" && event.entryId) {
        setSyncingIds((prev) => new Set(prev).add(String(event.entryId)));
      }
      if (event.type === "biomassCollectionSyncComplete" && event.entryId) {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(String(event.entryId));
          return next;
        });
        void loadData();
      }
      if (event.type === "syncEnd" || event.type === "syncStart") {
        void loadData();
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSync();
    };
  }, [navigation, loadData]);

  async function startNewTrip() {
    const user = await getStoredAuthUser();
    if (!user) return;
    const collectionId = await createBiomassCollectionLocal(user.id);
    navigation.navigate("BiomassCollectionEntry", { collectionId });
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Biomass collection</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={startNewTrip}
          accessibilityLabel="Start a new biomass collection trip"
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await retrySync();
                await loadData();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No biomass trips yet</Text>
              <Text style={styles.emptyText}>
                Tap + when a tractor is loaded at a farm. Select the farmer and the farm plot,
                photograph the load within 1 km of that plot, then the unloading at the
                production site.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CollectionCard
              item={item}
              syncing={syncingIds.has(item.id) || isBiomassCollectionSyncing(item.id)}
              distance={distanceLabel(item, farmers)}
              plotLabel={(() => {
                const farmer = farmers.find((entry) => entry.id === item.farmId);
                const plot = farmer?.fields.find((field) => field.id === item.farmFieldId) ?? null;
                if (!plot && !item.fieldCode) return null;
                const acres = plot ? formatApplicationAcres(plot.area_acres) : null;
                const code = plot?.field_code ?? item.fieldCode;
                return [acres ? `Farm ${acres}` : null, code].filter(Boolean).join(" · ");
              })()}
              onPress={() =>
                navigation.navigate("BiomassCollectionEntry", { collectionId: item.id })
              }
              onRetry={() => void retrySync()}
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
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brunswick,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    color: colors.white,
    fontSize: typeScale.title,
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
    fontSize: typeScale.body,
    color: colors.brunswick,
  },
  cardStage: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  cardDistanceUnknown: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.text,
  },
  cardDistance: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.success,
  },
  cardDistanceFar: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
    color: colors.error,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  cardSync: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  cardSyncError: {
    color: colors.error,
  },
  cardSyncDone: {
    color: colors.success,
  },
  syncError: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.error,
  },
  retryBtn: {
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.error,
  },
  retryText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.error,
  },
  empty: {
    paddingTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.heading,
    color: colors.brunswick,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
