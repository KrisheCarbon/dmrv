import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import FarmerCard from "../components/FarmerCard";
import SearchField from "../components/SearchField";
import { ScreenShell } from "../components/ScreenHeader";
import { useKeyboardOverlap } from "../hooks/useKeyboardOverlap";
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
import {
  fetchFieldActivity,
  type FieldActivityPerson,
  type FieldActivityStats,
} from "../services/fieldActivity";

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

function peopleFromActivity(stats: FieldActivityStats): FieldActivityPerson[] {
  const rows: FieldActivityPerson[] = [];
  if (stats.self) rows.push(stats.self);
  rows.push(...(stats.admins ?? []), ...(stats.managers ?? []));
  rows.push(...stats.climapreneurs);
  for (const team of stats.teams) {
    rows.push(team.supervisor, ...team.climapreneurs);
  }
  rows.push(...stats.unassignedClimapreneurs);

  const seen = new Set<string>();
  return rows
    .filter((person) => {
      if (seen.has(person.id)) return false;
      seen.add(person.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const keyboardOverlap = useKeyboardOverlap();
  const [syncProgress, setSyncProgress] = useState({});
  const [checklist, setChecklist] = useState({});
  const [enteredById, setEnteredById] = useState(route.params?.enteredById || "");
  const [enteredByName, setEnteredByName] = useState(route.params?.enteredByName || "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [people, setPeople] = useState<FieldActivityPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);

  useEffect(() => {
    setEnteredById(route.params?.enteredById || "");
    setEnteredByName(route.params?.enteredByName || "");
  }, [route.params?.enteredById, route.params?.enteredByName]);

  const loadData = useCallback(async () => {
    const profile = await getUserProfile();
    if (!profile) {
      setFarmers([]);
      return;
    }

    const localFarmers = await getAllFarmersLocal(profile.id, profile.role);
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

  const scopedFarmers = useMemo(() => {
    if (!enteredById) return farmers;
    return farmers.filter((farmer) => farmer.created_by === enteredById);
  }, [farmers, enteredById]);

  const stats = useMemo(() => buildStats(scopedFarmers), [scopedFarmers]);

  const filteredFarmers = useMemo(
    () =>
      filterFarmers(scopedFarmers, activeFilter).filter((farmer) =>
        matchesFarmerSearch(farmer, searchQuery),
      ),
    [scopedFarmers, activeFilter, searchQuery]
  );

  async function openEnteredByPicker() {
    setPickerOpen(true);
    if (people.length > 0 || peopleLoading) return;
    setPeopleLoading(true);
    try {
      const activity = await fetchFieldActivity();
      setPeople(peopleFromActivity(activity));
    } catch {
      setPeople([]);
    } finally {
      setPeopleLoading(false);
    }
  }

  function selectEnteredBy(person: { id: string; name: string } | null) {
    const id = person?.id || "";
    const name = person?.name || "";
    setEnteredById(id);
    setEnteredByName(name);
    navigation.setParams({
      enteredById: id || undefined,
      enteredByName: name || undefined,
      title: name || "All Farmers",
    });
    setPickerOpen(false);
  }

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

      {searchFocused ? null : (
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
      )}

      <SearchField
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, mobile, or farmer ID"
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        style={styles.search}
      />

      <View style={styles.enteredBy}>
        <Pressable style={styles.enteredByMain} onPress={openEnteredByPicker}>
          <Text style={styles.enteredByLabel}>Entered by</Text>
          <Text style={styles.enteredByValue} numberOfLines={1}>
            {enteredByName || "Anyone"}
          </Text>
        </Pressable>
        {enteredById ? (
          <Pressable hitSlop={8} onPress={() => selectEnteredBy(null)}>
            <Text style={styles.enteredByClear}>Clear</Text>
          </Pressable>
        ) : (
          <Text style={styles.enteredByChevron}>›</Text>
        )}
      </View>

      <FlatList
        style={[styles.list, keyboardOverlap > 0 && { marginBottom: keyboardOverlap }]}
        data={filteredFarmers}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
              {enteredByName
                ? `Entered by ${enteredByName}`
                : FILTERS[activeFilter].heading}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {enteredByName
                ? `No farmers from ${enteredByName}`
                : searchQuery.trim()
                ? "No matching farmers"
                : activeFilter === "all"
                  ? "No farmers yet"
                  : `No ${FILTERS[activeFilter].heading.toLowerCase()}`}
            </Text>
            <Text style={styles.emptyText}>
              {enteredByName
                ? "No farmers on this phone were entered by this person."
                : searchQuery.trim()
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

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Entered by</Text>
            <Pressable style={styles.pickerRow} onPress={() => selectEnteredBy(null)}>
              <Text style={styles.pickerName}>Anyone</Text>
            </Pressable>
            {peopleLoading ? (
              <ActivityIndicator color={colors.brunswick} style={styles.pickerLoading} />
            ) : (
              <FlatList
                data={people}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.pickerRow}
                    onPress={() => selectEnteredBy(item)}
                  >
                    <Text style={styles.pickerName}>{item.name}</Text>
                    <Text style={styles.pickerRole}>{item.role}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={styles.pickerEmpty}>No climapreneurs or supervisors found.</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
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
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  enteredBy: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  enteredByMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  enteredByLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.smoke,
  },
  enteredByValue: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  enteredByClear: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.error,
  },
  enteredByChevron: {
    fontSize: 20,
    color: colors.smoke,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 60, 42, 0.35)",
  },
  pickerSheet: {
    maxHeight: "70%",
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  pickerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.brunswick,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  pickerRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickerName: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
  pickerRole: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    textTransform: "capitalize",
  },
  pickerLoading: {
    marginVertical: spacing.lg,
  },
  pickerEmpty: {
    padding: spacing.lg,
    fontFamily: fonts.regular,
    color: colors.smoke,
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
