import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  Pressable,
  Image,
} from "react-native";
import { soilTestStatusLabel } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import { listIncomingSoilSamples } from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { processSyncQueue } from "../services/syncService";
import { pullSoilNetworkFromServer } from "../services/farmerNetworkSync";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Row = {
  id: string;
  farmerName: string;
  village: string;
  sampleDate: string;
  status: string;
  collector: string;
  photoUri: string | null;
};

export default function SoilSamplesInboxScreen({ navigation }) {
  const [rows, setRows] = useState<Row[]>([]);
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
          village: farmer?.village?.trim() || "Unspecified site",
          sampleDate: test.sampleDate,
          status: test.status || "submitted",
          collector: test.collectedByRole || "climapreneur",
          photoUri: test.samplePhotoUri || test.samplePhotoUrl,
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

  const sections = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    for (const row of rows) {
      const list = grouped.get(row.village) ?? [];
      list.push(row);
      grouped.set(row.village, list);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [rows]);

  async function onRefresh() {
    setRefreshing(true);
    await processSyncQueue();
    await load();
    setRefreshing(false);
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>Sample receiving</Text>
        <Text style={styles.subtitle}>
          Climapreneur samples, grouped by site. Open a sample to photograph it
          and accept, reject, or store it.
        </Text>
      </View>
      <SectionList
        sections={sections}
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
        renderSectionHeader={({ section }) => (
          <Text style={styles.section}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() =>
              navigation.navigate("SoilSampleReceive", { sampleId: item.id })
            }
          >
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.farmerName}</Text>
              <Text style={styles.meta}>
                {item.sampleDate} · {soilTestStatusLabel(item.status)}
              </Text>
            </View>
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.thumb} />
            ) : null}
          </Pressable>
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
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  cardBody: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.bold,
    color: colors.brunswick,
    fontSize: 16,
  },
  meta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    color: colors.smoke,
    fontSize: 13,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.chalk,
  },
  empty: {
    paddingTop: 48,
    textAlign: "center",
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
});
