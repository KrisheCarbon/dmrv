import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { soilSampleStage, type SoilSampleStage } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import SoilSampleTracker from "../components/SoilSampleTracker";
import FormPicker from "../components/FormPicker";
import AddEntryButton from "../components/AddEntryButton";
import EntryStatusPill from "../components/EntryStatusPill";
import { NETWORK_FORM_DRAFTS, clearFormDraft, readFormDraft } from "../utils/formDrafts";
import { listAllSoilTests } from "../services/farmersNetworkService";
import { getFarmerByIdLocal } from "../services/farmerService";
import { processSyncQueue } from "../services/syncService";
import { pullSoilNetworkFromServer } from "../services/farmerNetworkSync";
import { getUserProfile } from "../services/userProfile";
import { colors, fonts, spacing, radius, typeScale } from "../constants/theme";

type Row = {
  id: string;
  sampleCode: string | null;
  farmerName: string;
  village: string | null;
  sampleDate: string;
  status: string | null;
  stage: SoilSampleStage;
  collector: string | null;
  pendingUpload: boolean;
};

type Filter = "all" | "waiting_pickup" | "ready_to_test" | "tested";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "waiting_pickup", label: "Waiting pickup" },
  { key: "ready_to_test", label: "Ready to test" },
  { key: "tested", label: "Tested" },
];

/** Soil sample tracking for every role; supervisors open a sample to pick it up. */
export default function SoilSamplesInboxScreen({ navigation }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [draftSummary, setDraftSummary] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    const draft = await readFormDraft<Record<string, any>>(NETWORK_FORM_DRAFTS.soilSample);
    const sites = Array.isArray(draft?.sampleSites) ? draft.sampleSites : [];
    const photos = sites.filter((site) => site?.photo_uri || site?.photo_url).length;
    const farmerId = typeof draft?.selectedFarmerId === "string" ? draft.selectedFarmerId : "";
    if (!farmerId && photos === 0 && !draft?.samplePhotoUri) {
      setDraftSummary(null);
      return;
    }
    const farmer = farmerId ? await getFarmerByIdLocal(farmerId).catch(() => null) : null;
    setDraftSummary(
      `${farmer?.farmerName || "Farmer not chosen"} · ${photos} point photo${photos === 1 ? "" : "s"}`,
    );
  }, []);

  function deleteDraft() {
    Alert.alert(
      "Delete this draft?",
      "The farmer, farm and photos in this unfinished sample will be removed. This cannot be undone.",
      [
        { text: "Keep draft", style: "cancel" },
        {
          text: "Delete draft",
          style: "destructive",
          onPress: async () => {
            await clearFormDraft(NETWORK_FORM_DRAFTS.soilSample);
            setDraftSummary(null);
          },
        },
      ],
    );
  }

  const load = useCallback(async () => {
    loadDraft().catch(() => {});
    await pullSoilNetworkFromServer().catch(() => {});
    const tests = await listAllSoilTests();
    const mapped = await Promise.all(
      tests.map(async (test) => {
        const farmer = test.farmerName
          ? null
          : await getFarmerByIdLocal(test.farmerId).catch(() => null);
        return {
          id: test.id,
          sampleCode: test.sampleCode,
          farmerName: test.farmerName || farmer?.farmerName || "Farmer",
          village: test.farmerVillage || farmer?.village?.trim() || null,
          sampleDate: test.sampleDate,
          status: test.status,
          stage: soilSampleStage(test.status),
          collector: test.collectedByName,
          pendingUpload: test.uploadStatus !== "synced",
        };
      }),
    );
    setRows(mapped);
  }, []);

  useEffect(() => {
    getUserProfile()
      .then((profile) => {
        const role = profile?.role || "";
        setIsSupervisor(role === "supervisor" || role === "admin" || role === "manager");
      })
      .catch(() => {});
    const unsubscribe = navigation.addListener("focus", () => {
      load().catch(() => {});
    });
    load().catch(() => {});
    return unsubscribe;
  }, [navigation, load]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: rows.length,
      waiting_pickup: 0,
      ready_to_test: 0,
      tested: 0,
    };
    for (const row of rows) {
      if (row.stage in result) result[row.stage as Filter] += 1;
    }
    return result;
  }, [rows]);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.stage === filter)),
    [rows, filter],
  );

  async function onRefresh() {
    setRefreshing(true);
    await processSyncQueue();
    await load();
    setRefreshing(false);
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.title}>Soil samples</Text>
            <Text style={styles.subtitle}>
              {isSupervisor
                ? "Open a sample waiting for pickup to mark it collected."
                : "Track each sample from collection to lab result."}
            </Text>
          </View>
          <AddEntryButton
            label="Collect a new soil sample"
            onPress={() => navigation.navigate("SoilTestForm", {})}
          />
        </View>
        <FormPicker
          label="Show"
          value={filter}
          options={FILTERS.map((item) => ({
            value: item.key,
            label: `${item.label} (${counts[item.key]})`,
          }))}
          onValueChange={(next) => setFilter((next as Filter) || "all")}
        />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brunswick}
          />
        }
        ListHeaderComponent={
          draftSummary ? (
            <Pressable
              style={[styles.card, styles.draftCard]}
              onPress={() => navigation.navigate("SoilTestForm", {})}
              onLongPress={deleteDraft}
              delayLongPress={400}
              accessibilityHint="Long press to delete this draft"
            >
              <Text style={styles.code}>Unfinished sample</Text>
              <Text style={styles.meta}>{draftSummary}</Text>
              <EntryStatusPill label="Draft · not submitted" tone="draft" />
              <View style={styles.draftActions}>
                <Pressable
                  style={styles.draftButton}
                  onPress={() => navigation.navigate("SoilTestForm", {})}
                  accessibilityRole="button"
                >
                  <Text style={styles.draftContinue}>Continue</Text>
                </Pressable>
                <Pressable
                  style={[styles.draftButton, styles.draftDelete]}
                  onPress={deleteDraft}
                  accessibilityRole="button"
                >
                  <Text style={styles.draftDeleteText}>Delete draft</Text>
                </Pressable>
              </View>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {draftSummary ? "" : "No soil samples here. Tap + to collect one."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate("SoilSampleReceive", { sampleId: item.id })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.code}>{item.sampleCode || "Number pending"}</Text>
              {item.pendingUpload ? <Text style={styles.pending}>Not uploaded</Text> : null}
            </View>
            <Text style={styles.name}>
              {item.farmerName}
              {item.village ? ` · ${item.village}` : ""}
            </Text>
            <Text style={styles.meta}>
              {item.sampleDate}
              {item.collector ? ` · Collected by ${item.collector}` : ""}
            </Text>
            <SoilSampleTracker status={item.status} />
            {item.stage === "tested" ? (
              <Text style={styles.reportLink}>Lab report available · tap to view</Text>
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
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  titleText: {
    flex: 1,
    gap: 4,
  },
  draftCard: {
    borderColor: colors.warning,
    borderStyle: "dashed",
  },
  draftActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  draftButton: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brunswick,
    backgroundColor: colors.white,
  },
  draftContinue: {
    fontFamily: fonts.bold,
    fontSize: typeScale.label,
    color: colors.brunswick,
  },
  draftDelete: {
    borderColor: colors.error,
  },
  draftDeleteText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.label,
    color: colors.error,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  subtitle: {
    fontSize: typeScale.label,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  code: {
    fontFamily: fonts.bold,
    color: colors.brunswick,
    fontSize: typeScale.body,
    letterSpacing: 0.5,
  },
  pending: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.warning,
  },
  name: {
    fontFamily: fonts.medium,
    color: colors.text,
    fontSize: typeScale.bodySmall,
  },
  meta: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    fontSize: typeScale.label,
  },
  reportLink: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label,
    color: colors.brunswick,
    textDecorationLine: "underline",
  },
  empty: {
    paddingTop: spacing.xxl,
    textAlign: "center",
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.textSecondary,
  },
});
