import React, { useCallback, useState } from "react";
import {
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  View
} from "react-native";
import FarmerCard from "../components/FarmerCard";
import { ScreenShell } from "../components/ScreenHeader";
import { getAllFarmersLocal } from "../services/farmerService";
import { processSyncQueue } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";

function getTodayStartMs() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function buildStats(farmers) {
  const todayStart = getTodayStartMs();

  return {
    total: farmers.length,
    today: farmers.filter((f) => f.createdAt >= todayStart).length,
    pendingSync: farmers.filter((f) => f.syncStatus === "pending").length
  };
}

function StatTile({ label, value }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function FarmerDashboardScreen({ navigation }) {
  const [farmers, setFarmers] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, pendingSync: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const localFarmers = await getAllFarmersLocal();
    setStats(buildStats(localFarmers));
    setFarmers(localFarmers.map((f) => f.toFormData()));
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadData();
      processSyncQueue().then(() => loadData());
    });
    return unsubscribe;
  }, [navigation, loadData]);

  async function onRefresh() {
    setRefreshing(true);
    await processSyncQueue();
    await loadData();
    setRefreshing(false);
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Farms</Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate("AddFarmer")}
          activeOpacity={0.85}
          accessibilityLabel="Onboard farmer"
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <StatTile label="Total uploaded" value={stats.total} />
        <StatTile label="Entered today" value={stats.today} />
        <StatTile label="Pending sync" value={stats.pendingSync} />
      </View>

      <FlatList
        style={styles.list}
        data={farmers}
        keyExtractor={(item) => item.id}
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
          farmers.length > 0 ? (
            <Text style={styles.listHeading}>All farmers</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No farmers yet</Text>
            <Text style={styles.emptyText}>
              Tap + to onboard your first farmer.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <FarmerCard
            farmer={item}
            onPress={() =>
              navigation.navigate("EditFarmer", { farmerId: item.id })
            }
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
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  backText: {
    fontSize: 22,
    color: colors.brunswick,
    fontFamily: fonts.medium,
    marginTop: -2
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
    marginBottom: spacing.md
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
  statValue: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: 2
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: colors.smoke,
    textAlign: "center",
    lineHeight: 13
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
