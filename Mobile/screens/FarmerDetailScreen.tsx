import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  Image,
} from "react-native";
import { fieldSeasonLabel, isFarmerProfileComplete, soilTestStatusLabel, soilSampleToneFromStatuses } from "@krishecarbon/shared";
import { ScreenShell } from "../components/ScreenHeader";
import { farmerToFormData, getFarmerByIdLocal } from "../services/farmerService";
import {
  consentExpiryLabel,
  getLatestConsent,
  listConsentsForFarmer,
  listFieldsForFarmer,
  listSoilReportsForFarmer,
  listSoilTestsForFarmer,
  setFieldStatus,
} from "../services/farmersNetworkService";
import { isFarmerSyncing } from "../services/syncService";
import { colors, fonts, spacing, radius } from "../constants/theme";
import ChecklistItem from "../components/ChecklistItem";

const TABS = [
  { key: "fields", label: "Farms" },
  { key: "samples", label: "Soil samples" },
  { key: "reports", label: "Soil reports" },
  { key: "consent", label: "Farmer consent" },
] as const;

function DetailRow({ label, value, highlight = false }) {
  if (value == null || value === "") return null;

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

export default function FarmerDetailScreen({ route, navigation }) {
  const farmerId = route.params?.farmerId;
  const [farmer, setFarmer] = useState(null);
  const [fields, setFields] = useState([]);
  const [consents, setConsents] = useState([]);
  const [soilTests, setSoilTests] = useState([]);
  const [soilReports, setSoilReports] = useState([]);
  const [latestConsentLabel, setLatestConsentLabel] = useState("—");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("fields");
  const [loading, setLoading] = useState(true);

  const loadFarmer = useCallback(async () => {
    if (!farmerId) {
      setLoading(false);
      Alert.alert("Farmer not found", "This farmer record is missing.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
      return;
    }
    try {
      const record = await getFarmerByIdLocal(farmerId);
      setFarmer(farmerToFormData(record));
      const [fieldList, consentList, tests, reports, latest] = await Promise.all([
        listFieldsForFarmer(farmerId),
        listConsentsForFarmer(farmerId),
        listSoilTestsForFarmer(farmerId),
        listSoilReportsForFarmer(farmerId),
        getLatestConsent(farmerId),
      ]);
      setFields(fieldList);
      setConsents(consentList);
      setSoilTests(tests);
      setSoilReports(reports);
      setLatestConsentLabel(consentExpiryLabel(latest));
    } catch (err) {
      Alert.alert("Error", err.message, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [farmerId, navigation]);

  useEffect(() => {
    loadFarmer();
    const unsubscribe = navigation.addListener("focus", loadFarmer);
    return unsubscribe;
  }, [navigation, loadFarmer]);

  async function handleEdit() {
    if (await isFarmerSyncing(farmerId)) {
      Alert.alert(
        "Sync in progress",
        "This farmer is currently syncing. You can edit after sync completes.",
      );
      return;
    }
    navigation.navigate("EditFarmer", { farmerId });
  }

  async function markInactive(id: string) {
    Alert.alert(
      "Mark farm inactive?",
      "Use when a lease ends or the plot changes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark inactive",
          style: "destructive",
          onPress: async () => {
            await setFieldStatus(id, "inactive");
            loadFarmer();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      </ScreenShell>
    );
  }

  if (!farmer) return null;

  const sampleTone = soilSampleToneFromStatuses(soilTests.map((test) => test.status));

  return (
    <ScreenShell>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{farmer.farmer_name}</Text>
        <Text style={styles.pageSubtitle}>
          {farmer.farmer_code ? `Farmer ID ${farmer.farmer_code}` : "Farmer"}
          {" · "}
          {latestConsentLabel}
        </Text>
        <View style={styles.checkRow}>
          <ChecklistItem
            tone={isFarmerProfileComplete(farmer) ? "ok" : "warn"}
            label="Farmer"
          />
          <ChecklistItem done={fields.length > 0} label="Farms" />
          <ChecklistItem
            tone={
              sampleTone === "accepted"
                ? "ok"
                : sampleTone === "rejected"
                  ? "error"
                  : sampleTone === "collected"
                    ? "warn"
                    : "none"
            }
            label="Sample"
          />
          <ChecklistItem done={soilReports.length > 0} label="Report" />
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.tab, tab === item.key && styles.tabActive]}
            onPress={() => setTab(item.key)}
          >
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Farmer info</Text>
            <Pressable onPress={handleEdit}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
          {farmer.farmer_photo_uri || farmer.farmer_photo_url ? (
            <Image
              source={{ uri: farmer.farmer_photo_uri || farmer.farmer_photo_url }}
              style={styles.farmerPhoto}
            />
          ) : null}
          <DetailRow label="Mobile" value={farmer.mobile_number || "Not added"} />
          <DetailRow label="Father / spouse" value={farmer.father_spouse_name} />
          <DetailRow label="Agri ID / Kisan Pehchan" value={farmer.agri_id} />
          <DetailRow
            label="Address"
            value={[
              farmer.address,
              farmer.village,
              farmer.mandal,
              farmer.district,
              farmer.state,
            ]
              .filter(Boolean)
              .join(", ")}
          />
          <DetailRow label="Cluster" value={farmer.cluster_name} />
          <DetailRow
            label="Cultivated land"
            value={`${farmer.total_land_size} acres`}
          />
          <DetailRow
            label="Owned / leased"
            value={
              farmer.owned_land_size || farmer.leased_land_size
                ? `${farmer.owned_land_size || 0} / ${farmer.leased_land_size || 0} acres`
                : null
            }
          />
          <DetailRow
            label="Interested in biochar"
            value={farmer.interested_in_biochar ? "Yes" : "No"}
          />
          <DetailRow
            label="Prior biochar experience"
            value={
              farmer.prior_biochar_exp
                ? `Yes${farmer.prior_biochar_acreage ? ` · ${farmer.prior_biochar_acreage} acres` : ""}`
                : "No"
            }
          />
          {farmer.crops?.length
            ? farmer.crops.map((crop, index) => (
                <DetailRow
                  key={`${crop.crop_name}-${index}`}
                  label={`Major crop ${index + 1}`}
                  value={`${crop.crop_name} · ${crop.crop_area} ac · sow ${crop.sowing_date || "—"} · harvest ${crop.harvest_date || "—"}`}
                />
              ))
            : null}
        </View>

        {tab === "fields" ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Farms</Text>
              <Pressable
                onPress={() =>
                  navigation.navigate("FieldForm", { farmerId, mode: "create" })
                }
              >
                <Text style={styles.link}>Add farm</Text>
              </Pressable>
            </View>
            {fields.length ? (
              fields.map((field) => (
                <View key={field.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>
                    {field.fieldCode} · {field.ownershipType}
                    {field.status === "inactive" ? " (inactive)" : ""}
                  </Text>
                  <DetailRow
                    label="Area"
                    value={
                      field.calculatedArea != null
                        ? `${field.calculatedArea} acres`
                        : null
                    }
                  />
                  <DetailRow label="Water" value={field.waterSource} />
                  <DetailRow label="Crop" value={field.cropName} />
                  <DetailRow
                    label="Season"
                    value={field.season ? fieldSeasonLabel(field.season) : null}
                  />
                  <DetailRow
                    label="Sowing / harvest"
                    value={
                      field.sowingDate || field.harvestDate
                        ? `${field.sowingDate || "—"} → ${field.harvestDate || "—"}`
                        : null
                    }
                  />
                  <DetailRow
                    label="Location"
                    value={
                      field.latitude != null
                        ? `${Number(field.latitude).toFixed(5)}, ${Number(field.longitude).toFixed(5)}`
                        : null
                    }
                  />
                  <View style={styles.inlineActions}>
                    <Pressable
                      onPress={() =>
                        navigation.navigate("FieldForm", {
                          farmerId,
                          fieldId: field.id,
                        })
                      }
                    >
                      <Text style={styles.link}>Edit</Text>
                    </Pressable>
                    {field.status === "active" ? (
                      <Pressable onPress={() => markInactive(field.id)}>
                        <Text style={styles.linkMuted}>Mark inactive</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No farms yet.</Text>
            )}
          </View>
        ) : null}

        {tab === "samples" ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Soil samples</Text>
              <Pressable
                onPress={() => {
                  if (!fields.length) {
                    Alert.alert(
                      "Farm needed",
                      "Add a farm for this farmer before collecting a soil sample.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Add farm",
                          onPress: () =>
                            navigation.navigate("FieldForm", {
                              farmerId,
                              mode: "create",
                            }),
                        },
                      ],
                    );
                    return;
                  }
                  navigation.navigate("SoilTestForm", { farmerId });
                }}
              >
                <Text style={styles.link}>Add sample</Text>
              </Pressable>
            </View>
            {soilTests.length ? (
              soilTests.map((t) => (
                <View key={t.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{t.sampleDate}</Text>
                  <DetailRow
                    label="Status"
                    value={soilTestStatusLabel(t.status)}
                  />
                  <DetailRow
                    label="Supervisor"
                    value={t.submittedToSupervisorName}
                  />
                  <DetailRow
                    label="Sampling points"
                    value={
                      t.sampleSites?.length
                        ? `${t.sampleSites.filter((site) => site.photo_uri || site.photo_url).length} photographed`
                        : null
                    }
                  />
                  {t.samplePhotoUri ? (
                    <Image source={{ uri: t.samplePhotoUri }} style={styles.thumb} />
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No soil samples yet.</Text>
            )}
          </View>
        ) : null}

        {tab === "reports" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Soil reports</Text>
            {soilReports.length ? (
              soilReports.map((r) => (
                <View key={r.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{r.reportDate}</Text>
                  <DetailRow label="Source" value={r.source} />
                  <DetailRow label="Summary" value={r.resultsSummary} />
                  <DetailRow
                    label="PDF"
                    value={r.documentUrl || r.documentUri ? "Uploaded" : "Pending"}
                  />
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>
                Reports appear here after a supervisor uploads the lab PDF or a photo of the results.
              </Text>
            )}
          </View>
        ) : null}

        {tab === "consent" ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Farmer consent</Text>
              <Pressable
                onPress={() => navigation.navigate("ConsentForm", { farmerId })}
              >
                <Text style={styles.link}>Add consent</Text>
              </Pressable>
            </View>
            {consents.length ? (
              consents.map((c) => (
                <View key={c.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{c.agreementType}</Text>
                  <DetailRow label="Status" value={consentExpiryLabel(c)} />
                  <DetailRow label="Signed date" value={c.consentDate} />
                  <DetailRow label="Expiry date" value={c.validTo} />
                  {c.photos?.length ? (
                    <View style={styles.photoRow}>
                      {c.photos.map((uri) => (
                        <Image key={uri} source={{ uri }} style={styles.thumbSmall} />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No farmer consent on file.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginTop: 6,
  },
  checkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    alignItems: "center",
  },
  tabActive: {
    borderBottomColor: colors.chartreuse,
  },
  tabText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.smoke,
    textAlign: "center",
  },
  tabTextActive: {
    color: colors.brunswick,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: 2,
  },
  row: { gap: 4 },
  rowLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.smoke,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    lineHeight: 22,
  },
  rowValueHighlight: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.brunswick,
  },
  itemCard: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.chartreuse,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    marginBottom: 4,
  },
  inlineActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 6,
  },
  link: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 13,
  },
  linkMuted: {
    fontFamily: fonts.medium,
    color: colors.smoke,
    fontSize: 13,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  thumb: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    marginTop: 6,
    backgroundColor: colors.chalk,
  },
  farmerPhoto: {
    width: "100%",
    height: 220,
    borderRadius: 8,
    marginBottom: spacing.sm,
    backgroundColor: colors.chalk,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  thumbSmall: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.chalk,
  },
});
