import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Pressable,
  TextInput,
} from "react-native";
import FarmerCard from "../components/FarmerCard";
import { ScreenShell } from "../components/ScreenHeader";
import { farmerToFormData, getAllFarmersLocal } from "../services/farmerService";
import { getFarmersChecklist } from "../services/farmersNetworkService";
import { getUserProfile } from "../services/userProfile";
import {
  processSyncQueue,
  retryFailedFarmSyncs,
  subscribeSyncEvents,
  getAllSyncProgress
} from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

const FILTERS = {
  all: { key: "all", label: "All entries", heading: "All farmers" },
  synced: { key: "synced", label: "Synced", heading: "Synced farmers" },
  pending: {
    key: "pending",
    label: "Pending sync",
    heading: "Pending sync"
  }
};

function buildStats(farmers) {
  return {
    total: farmers.length,
    synced: farmers.filter((f) => f.uploadStatus === "synced").length,
    pendingSync: farmers.filter((f) =>
      ["pending", "syncing", "error"].includes(f.uploadStatus)
    ).length
  };
}

function filterFarmers(farmers, activeFilter) {
  if (activeFilter === "synced") {
    return farmers.filter((f) => f.uploadStatus === "synced");
  }

  if (activeFilter === "pending") {
    return farmers.filter((f) =>
      ["pending", "syncing", "error"].includes(f.uploadStatus)
    );
  }

  return farmers;
}

function farmerSearchText(farmer): string {
  return [
    farmer.farmer_name,
    farmer.mobile_number,
    farmer.farmer_code,
    farmer.village,
    farmer.cluster_name,
    farmer.mandal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFarmerSearch(farmer, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return farmerSearchText(farmer).includes(q);
}

function StatTile({ label, value, active, onPress }) {
  return (
    <Pressable
      style={[styles.statTile, active && styles.statTileActive]}
      onPress={onPress}
    >
      <Text style={[styles.statValue, active && styles.statValueActive]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, active && styles.statLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function FarmerDashboardScreen({ navigation, route }) {
  const listTitle = route.params?.title || "All Farmers";
  const listMode = route.params?.listMode || "all";
  const [farmers, setFarmers] = useState([]);
  const [stats, setStats] = useState({ total: 0, synced: 0, pendingSync: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncProgress, setSyncProgress] = useState({});
  const [checklist, setChecklist] = useState({});

  const loadData = useCallback(async () => {
    const profile = await getUserProfile();
    if (!profile) {
      setFarmers([]);
      setStats({ total: 0, synced: 0, pendingSync: 0 });
      return;
    }

    const localFarmers = await getAllFarmersLocal(profile.id, profile.role);
    setStats(buildStats(localFarmers));
    setFarmers(localFarmers.map((f) => farmerToFormData(f)));
    setSyncProgress(getAllSyncProgress());
    setChecklist(await getFarmersChecklist(localFarmers.map((f) => f.id)));
  }, []);

  useEffect(() => {
    loadData();

    const unsubscribeNav = navigation.addListener("focus", loadData);

    const unsubscribeSync = subscribeSyncEvents((event) => {
      if (event.type === "progress") {
        setSyncProgress((prev) => ({
          ...prev,
          [String(event.farmerId)]: event.progress as number,
        }));
      }

      if (
        event.type === "farmerSyncComplete" ||
        event.type === "syncEnd" ||
        event.type === "syncStart" ||
        event.type === "reconcileComplete"
      ) {
        loadData();
      }
    });

    return () => {
      unsubscribeNav();
      unsubscribeSync();
    };
  }, [navigation, loadData]);

  const filteredFarmers = useMemo(
    () =>
      filterFarmers(farmers, activeFilter).filter((farmer) =>
        matchesFarmerSearch(farmer, searchQuery),
      ),
    [farmers, activeFilter, searchQuery]
  );

  async function onRefresh() {
    setRefreshing(true);
    const profile = await getUserProfile();
    if (profile) {
      await retryFailedFarmSyncs(profile.id, profile.role);
    }
    await processSyncQueue();
    await loadData();
    setRefreshing(false);
  }

  function handleFarmerPress(farmer) {
    navigation.navigate("FarmerDetail", { farmerId: farmer.id });
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{listTitle}</Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate("NewFarmerOnboarding")}
          activeOpacity={0.85}
          accessibilityLabel="Onboard farmer"
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <StatTile
          label={FILTERS.all.label}
          value={stats.total}
          active={activeFilter === "all"}
          onPress={() => setActiveFilter("all")}
        />
        <StatTile
          label={FILTERS.synced.label}
          value={stats.synced}
          active={activeFilter === "synced"}
          onPress={() => setActiveFilter("synced")}
        />
        <StatTile
          label={FILTERS.pending.label}
          value={stats.pendingSync}
          active={activeFilter === "pending"}
          onPress={() => setActiveFilter("pending")}
        />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search name, mobile, or farmer ID"
          placeholderTextColor={colors.smokeLight}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => setSearchQuery("")}
            style={styles.searchClear}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.searchClearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        style={styles.list}
        data={filteredFarmers}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brunswick}
          />
        }
        ListHeaderComponent={
          filteredFarmers.length > 0 ? (
            <Text style={styles.listHeading}>
              {FILTERS[activeFilter].heading}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {searchQuery.trim()
                ? "No matching farmers"
                : activeFilter === "all"
                  ? "No farmers yet"
                  : `No ${FILTERS[activeFilter].heading.toLowerCase()}`}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? `No farmer matches “${searchQuery.trim()}”.`
                : activeFilter === "all"
                  ? listMode === "repeat"
                    ? "No farmers yet. Onboard under New Farmer, then return here to update them."
                    : "Use New Farmer from Farmers Network, or tap +."
                  : "Try another filter or pull to refresh."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <FarmerCard
            farmer={item}
            syncProgress={syncProgress[item.id] ?? 0}
            checklist={checklist[item.id]}
            onPress={() => handleFarmerPress(item)}
          />
        )}
      />
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.4,
    paddingLeft: 10
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1A3C2A",
    alignItems: "center",
    justifyContent: "center"
  },
  addBtnText: {
    fontSize: 26,
    lineHeight: 28,
    color: "#8CC63E",
    fontFamily: fonts.medium,
    marginTop: -1
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  search: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.white,
  },
  searchClear: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  searchClearText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center"
  },
  statTileActive: {
    backgroundColor: colors.white,
    borderColor: colors.brunswick,
    borderBottomWidth: 3,
    borderBottomColor: colors.chartreuse
  },
  statValue: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: 2
  },
  statValueActive: {
    color: colors.brunswick
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: colors.smoke,
    textAlign: "center",
    lineHeight: 13
  },
  statLabelActive: {
    color: colors.brunswick
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl
  },
  listHeading: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.smoke,
    marginBottom: spacing.sm,
    paddingLeft: 10
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: spacing.lg
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    textAlign: "center",
    lineHeight: 20
  }
});
