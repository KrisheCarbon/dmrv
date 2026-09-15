import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Pressable,
} from "react-native";
import { soilTestStatusLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import {
  listIncomingSoilSamples,
  markSoilSampleReceivedLocal,
} from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { getUserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import { pullSoilNetworkFromServer } from "../services/farmerNetworkSync";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function SoilSamplesInboxScreen({ navigation }) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      farmerName: string;
      sampleDate: string;
      status: string;
      supervisor: string;
    }>
  >([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await pullSoilNetworkFromServer().catch(() => {});
    const tests = await listIncomingSoilSamples();
    const mapped = await Promise.all(
      tests.map(async (test) => {
        const farmer = await getFarmerByIdLocal(test.farmerId).catch(() => null);
        return {
          id: test.id,
          farmerName: farmer?.farmerName || "Farmer",
          sampleDate: test.sampleDate,
          status: test.status || "submitted",
          supervisor: test.submittedToSupervisorName || "Supervisor",
        };
      }),
    );
    setRows(mapped);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      load().catch(() => {});
    });
    load().catch(() => {});
    return unsubscribe;
  }, [navigation, load]);

  async function markReceived(id: string) {
    try {
      const profile = await getUserProfile();
      if (!profile) {
        Alert.alert("Error", "You must be signed in.");
        return;
      }
      await markSoilSampleReceivedLocal(id, {
        id: profile.id,
        name: profile.full_name,
      });
      processSyncQueue();
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await processSyncQueue();
    await load();
    setRefreshing(false);
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>Incoming samples</Text>
        <Text style={styles.subtitle}>
          Climapreneur samples waiting to be marked received.
        </Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brunswick}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No samples waiting.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.farmerName}</Text>
            <Text style={styles.meta}>
              {item.sampleDate} · {soilTestStatusLabel(item.status)}
            </Text>
            <Pressable onPress={() => markReceived(item.id)}>
              <Text style={styles.link}>Mark received</Text>
            </Pressable>
          </View>
        )}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  name: {
    fontFamily: fonts.bold,
    color: colors.brunswick,
    fontSize: 16,
  },
  meta: {
    fontFamily: fonts.regular,
    color: colors.smoke,
    fontSize: 13,
  },
  link: {
    marginTop: 8,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 14,
  },
  empty: {
    paddingTop: 48,
    textAlign: "center",
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
});
