import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { hasMappedBoundary, isFarmerProfileComplete } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import AddEntryButton from "../components/AddEntryButton";
import EntryStatusPill, { syncPill, type EntryTone } from "../components/EntryStatusPill";
import { getDb } from "../database/db";
import {
  rowToFarmField,
  rowToFarmerConsent,
  rowToSoilReport,
  type Farmer,
} from "../database/types";
import { getAllFarmersLocal } from "../services/farmerService";
import { getUserProfile } from "../services/userProfile";
import { processSyncQueue } from "../services/syncService";
import {
  NETWORK_FORM_DRAFTS,
  clearFormDraft,
  draftIdsWithPrefix,
  readFormDraft,
} from "../utils/formDrafts";
import { colors, fonts, radius, spacing, typeScale } from "../constants/theme";

export type NetworkEntryKind = "farmer" | "farm" | "consent" | "soil_report";

type Pill = { label: string; tone: EntryTone };

type EntryRow = {
  id: string;
  title: string;
  subtitle: string;
  pills: Pill[];
  isDraft?: boolean;
  onPress: () => void;
};

const KIND_COPY: Record<
  NetworkEntryKind,
  { title: string; subtitle: string; addLabel: string; empty: string; draft: string }
> = {
  farmer: {
    title: "New farmer",
    subtitle: "Farmers you have registered, and any unfinished registration.",
    addLabel: "Register a new farmer",
    empty: "No farmers registered yet. Tap + to register one.",
    draft: NETWORK_FORM_DRAFTS.farmer,
  },
  farm: {
    title: "Farms onboarding",
    subtitle: "Farms entered with their boundary, and any unfinished farm.",
    addLabel: "Add a new farm",
    empty: "No farms entered yet. Tap + to add one.",
    draft: NETWORK_FORM_DRAFTS.farm,
  },
  consent: {
    title: "Farmer consent",
    subtitle: "Signed consents and their validity, and any unfinished consent.",
    addLabel: "Add a farmer consent",
    empty: "No consents recorded yet. Tap + to add one.",
    draft: NETWORK_FORM_DRAFTS.consent,
  },
  soil_report: {
    title: "Soil reports",
    subtitle: "Lab reports attached to soil samples, and any unfinished upload.",
    addLabel: "Upload a soil report",
    empty: "No soil reports yet. Tap + to attach one.",
    draft: NETWORK_FORM_DRAFTS.soilReport,
  },
};

const FORM_ROUTE: Record<NetworkEntryKind, string> = {
  farmer: "NewFarmerOnboarding",
  farm: "FieldForm",
  consent: "ConsentForm",
  soil_report: "SoilReportUpload",
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A draft only counts once something identifying has been entered. */
function draftSummary(
  kind: NetworkEntryKind,
  draft: Record<string, any> | null,
  farmers: Map<string, Farmer>,
): string | null {
  if (!draft) return null;
  const farmerName = (id: unknown) => farmers.get(str(id))?.farmerName || "";
  if (kind === "farmer") {
    const name = str(draft.farmer_name);
    const mobile = str(draft.mobile_number);
    return name || mobile ? [name || "Unnamed farmer", mobile].filter(Boolean).join(" · ") : null;
  }
  if (kind === "farm") {
    const points = Array.isArray(draft.boundaryPoints) ? draft.boundaryPoints.length : 0;
    const name = farmerName(draft.selectedFarmerId);
    if (!name && points === 0) return null;
    return [name || "Farmer not chosen", points ? `${points} boundary points` : "No boundary yet"].join(" · ");
  }
  if (kind === "consent") {
    const photos = Array.isArray(draft.photos) ? draft.photos.length : 0;
    const name = farmerName(draft.selectedFarmerId);
    if (!name && photos === 0) return null;
    return [name || "Farmer not chosen", `${photos} photo${photos === 1 ? "" : "s"}`].join(" · ");
  }
  const hasFile = Boolean(str(draft.documentUri));
  if (!str(draft.sampleId) && !hasFile) return null;
  return hasFile ? "Report file attached, not submitted" : "Sample chosen, no file yet";
}

export default function NetworkEntriesScreen({ route, navigation }) {
  const kind: NetworkEntryKind = route.params?.kind ?? "farmer";
  const copy = KIND_COPY[kind];
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openForm = useCallback(
    (params: Record<string, unknown> = {}) => navigation.navigate(FORM_ROUTE[kind], params),
    [navigation, kind],
  );

  const deleteDraft = useCallback(
    (onDone: () => void) => {
      Alert.alert(
        "Delete this draft?",
        "Everything entered in this unfinished entry will be removed. This cannot be undone.",
        [
          { text: "Keep draft", style: "cancel" },
          {
            text: "Delete draft",
            style: "destructive",
            onPress: async () => {
              await clearFormDraft(copy.draft);
              onDone();
            },
          },
        ],
      );
    },
    [copy.draft],
  );

  const load = useCallback(async () => {
    const profile = await getUserProfile();
    if (!profile) {
      setRows([]);
      setLoaded(true);
      return;
    }
    const farmerList = await getAllFarmersLocal(profile.id, profile.role);
    const farmers = new Map(farmerList.map((farmer) => [farmer.id, farmer]));
    const ids = farmerList.map((farmer) => farmer.id);
    const placeholders = ids.map(() => "?").join(",");
    const db = await getDb();
    const result: EntryRow[] = [];

    const summary = draftSummary(kind, await readFormDraft(copy.draft), farmers);
    if (summary) {
      result.push({
        id: "draft",
        title: "Unfinished entry",
        subtitle: summary,
        pills: [{ label: "Draft · not submitted", tone: "draft" }],
        isDraft: true,
        onPress: () => openForm(),
      });
    }

    if (kind === "farmer") {
      const editing = await draftIdsWithPrefix("edit-farmer:");
      for (const farmer of [...farmerList].sort((a, b) => b.updatedAt - a.updatedAt)) {
        const pills: Pill[] = [syncPill(farmer.uploadStatus)];
        if (!isFarmerProfileComplete(farmer)) pills.push({ label: "Profile incomplete", tone: "error" });
        if (editing.has(farmer.id)) pills.push({ label: "Unsaved edits", tone: "draft" });
        result.push({
          id: farmer.id,
          title: farmer.farmerName || "Unnamed farmer",
          subtitle: [farmer.farmerCode, farmer.village, farmer.mobileNumber].filter(Boolean).join(" · "),
          pills,
          onPress: () => navigation.navigate("FarmerDetail", { farmerId: farmer.id }),
        });
      }
    } else if (ids.length > 0 && kind === "farm") {
      const editing = await draftIdsWithPrefix("field-form:");
      const fieldRows = await db.getAllAsync<any>(
        `SELECT * FROM farm_fields WHERE farmer_id IN (${placeholders}) ORDER BY updated_at DESC`,
        ids,
      );
      for (const field of fieldRows.map(rowToFarmField)) {
        const mapped = hasMappedBoundary(field.boundaryGeojson);
        const pills: Pill[] = [
          syncPill(field.uploadStatus),
          mapped
            ? { label: "Boundary mapped", tone: "done" }
            : { label: "No boundary", tone: "error" },
        ];
        if (field.status !== "active") pills.push({ label: "Inactive", tone: "neutral" });
        if (editing.has(field.id)) pills.push({ label: "Unsaved edits", tone: "draft" });
        result.push({
          id: field.id,
          title: field.fieldCode,
          subtitle: [
            farmers.get(field.farmerId)?.farmerName,
            field.calculatedArea != null ? `${field.calculatedArea} ac` : null,
            field.ownershipType,
          ]
            .filter(Boolean)
            .join(" · "),
          pills,
          onPress: () => openForm({ farmerId: field.farmerId, fieldId: field.id }),
        });
      }
    } else if (ids.length > 0 && kind === "consent") {
      const today = new Date().toISOString().slice(0, 10);
      const consentRows = await db.getAllAsync<any>(
        `SELECT * FROM farmer_consents WHERE farmer_id IN (${placeholders}) ORDER BY updated_at DESC`,
        ids,
      );
      for (const consent of consentRows.map(rowToFarmerConsent)) {
        const expired = Boolean(consent.validTo && consent.validTo < today);
        result.push({
          id: consent.id,
          title: farmers.get(consent.farmerId)?.farmerName || "Farmer",
          subtitle: [
            consent.agreementType,
            consent.validTo ? `Valid to ${consent.validTo}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          pills: [
            syncPill(consent.uploadStatus),
            expired ? { label: "Expired", tone: "error" } : { label: "Valid", tone: "done" },
          ],
          onPress: () => navigation.navigate("FarmerDetail", { farmerId: consent.farmerId }),
        });
      }
    } else if (kind === "soil_report") {
      const reportRows = await db.getAllAsync<any>(
        `SELECT r.*, t.sample_code AS joined_sample_code, t.farmer_name AS joined_farmer_name
         FROM soil_reports r LEFT JOIN soil_tests t ON t.id = r.soil_test_id
         ORDER BY r.report_date DESC, r.created_at DESC`,
      );
      for (const row of reportRows) {
        const report = rowToSoilReport(row);
        const uploaded = Boolean(report.serverId || report.documentUrl);
        result.push({
          id: report.id,
          title: row.joined_sample_code || "Soil report",
          subtitle: [
            row.joined_farmer_name || farmers.get(report.farmerId)?.farmerName,
            report.reportDate,
            report.source,
          ]
            .filter(Boolean)
            .join(" · "),
          pills: [
            uploaded
              ? { label: "Uploaded", tone: "done" }
              : { label: "Waiting to upload", tone: "pending" },
          ],
          onPress: () =>
            report.soilTestId
              ? navigation.navigate("SoilSampleReceive", { sampleId: report.soilTestId })
              : undefined,
        });
      }
    }

    setRows(result);
    setLoaded(true);
  }, [kind, copy.draft, navigation, openForm]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      load().catch(() => setLoaded(true));
    });
    load().catch(() => setLoaded(true));
    return unsubscribe;
  }, [navigation, load]);

  async function onRefresh() {
    setRefreshing(true);
    await processSyncQueue();
    await load().catch(() => {});
    setRefreshing(false);
  }

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>
        <AddEntryButton label={copy.addLabel} onPress={() => openForm()} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brunswick} />
        }
        ListEmptyComponent={
          loaded ? <Text style={styles.empty}>{copy.empty}</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.card,
              item.isDraft && styles.draftCard,
              pressed && styles.cardPressed,
            ]}
            onPress={item.onPress}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.subtitle ? <Text style={styles.cardSubtitle}>{item.subtitle}</Text> : null}
            <View style={styles.pills}>
              {item.pills.map((pill) => (
                <EntryStatusPill key={pill.label} label={pill.label} tone={pill.tone} />
              ))}
            </View>
            {item.isDraft ? (
              <View style={styles.draftActions}>
                <Pressable style={styles.draftButton} onPress={item.onPress} accessibilityRole="button">
                  <Text style={styles.draftContinue}>Continue</Text>
                </Pressable>
                <Pressable
                  style={[styles.draftButton, styles.draftDelete]}
                  onPress={() => deleteDraft(() => load().catch(() => {}))}
                  accessibilityRole="button"
                >
                  <Text style={styles.draftDeleteText}>Delete draft</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 4,
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
  draftCard: {
    borderColor: colors.warning,
    borderStyle: "dashed",
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.body,
    color: colors.brunswick,
  },
  cardSubtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.label,
    color: colors.textSecondary,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 2,
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
  empty: {
    paddingTop: spacing.xxl,
    textAlign: "center",
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.textSecondary,
  },
});
