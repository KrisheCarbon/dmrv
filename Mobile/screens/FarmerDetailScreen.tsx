import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import ConsentViewerModal from "../components/ConsentViewerModal";
import { getFarmerByIdLocal } from "../services/farmerService";
import { isFarmerSyncing } from "../services/syncService";
import {
  getConsentDisplayName,
  hasConsent,
  resolveConsentViewUri
} from "../utils/consent";
import { colors, fonts, spacing, radius } from "../constants/theme";

function DetailRow({ label, value }) {
  if (value == null || value === "") return null;

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function SyncBadge({ status }) {
  const meta =
    status === "syncing"
      ? { label: "Syncing", bg: colors.overlay, color: colors.brunswick }
      : status === "pending"
      ? { label: "Pending sync", bg: colors.warningBg, color: colors.warning }
      : status === "error"
      ? { label: "Sync failed", bg: colors.errorBg, color: colors.error }
      : { label: "Synced", bg: colors.successBg, color: colors.success };

  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function boolLabel(value) {
  return value ? "Yes" : "No";
}

export default function FarmerDetailScreen({ route, navigation }) {
  const { farmerId } = route.params;
  const [farmer, setFarmer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentViewUri, setConsentViewUri] = useState(null);
  const [consentOpening, setConsentOpening] = useState(false);

  const loadFarmer = useCallback(async () => {
    try {
      const record = await getFarmerByIdLocal(farmerId);
      setFarmer(record.toFormData());
    } catch (err) {
      Alert.alert("Error", err.message, [
        { text: "OK", onPress: () => navigation.goBack() }
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
        "This farmer is currently syncing. You can edit after sync completes."
      );
      return;
    }

    navigation.navigate("EditFarmer", { farmerId });
  }

  async function openConsent() {
    try {
      setConsentOpening(true);
      const uri = await resolveConsentViewUri(farmer);
      if (!uri) {
        Alert.alert("No consent file", "No consent document is available.");
        return;
      }
      setConsentViewUri(uri);
      setConsentVisible(true);
    } catch (err) {
      Alert.alert("Unable to load consent", err.message);
    } finally {
      setConsentOpening(false);
    }
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

  const consentName = getConsentDisplayName(farmer);
  const consentSource = farmer.consent_local_uri
    ? "On device (not yet synced)"
    : farmer.consent_document_url
    ? "Synced to cloud"
    : null;

  return (
    <ScreenShell>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{farmer.farmer_name}</Text>
        <Text style={styles.pageSubtitle}>Farmer details</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <SyncBadge status={farmer.sync_status} />
          </View>
          {farmer.sync_status === "error" && farmer.sync_error ? (
            <Text style={styles.syncError}>{farmer.sync_error}</Text>
          ) : null}
          <DetailRow
            label="Mobile"
            value={farmer.mobile_number || "Not added yet"}
          />
          <DetailRow
            label="Total land"
            value={`${farmer.total_land_size} acres`}
          />
          <DetailRow
            label="Estimated biomass"
            value={`${farmer.estimated_biomass ?? 0} tons`}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Farm location</Text>
          <DetailRow label="Address" value={farmer.address} />
          <DetailRow
            label="Coordinates"
            value={
              farmer.latitude != null && farmer.longitude != null
                ? `${Number(farmer.latitude).toFixed(6)}, ${Number(farmer.longitude).toFixed(6)}`
                : null
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crops</Text>
          {farmer.crops?.length ? (
            farmer.crops.map((crop, index) => (
              <View key={`${crop.crop_name}-${index}`} style={styles.cropCard}>
                <Text style={styles.cropName}>{crop.crop_name}</Text>
                <DetailRow label="Area" value={`${crop.crop_area} acres`} />
                <DetailRow label="Sowing" value={crop.sowing_date} />
                <DetailRow label="Harvest" value={crop.harvest_date} />
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No crops recorded.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Biochar</Text>
          <DetailRow
            label="Interested in biochar"
            value={boolLabel(farmer.interested_in_biochar)}
          />
          <DetailRow
            label="Prior biochar experience"
            value={boolLabel(farmer.prior_biochar_exp)}
          />
          {farmer.prior_biochar_exp && (
            <DetailRow
              label="Prior biochar acreage"
              value={`${farmer.prior_biochar_acreage} acres`}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consent form</Text>
          {hasConsent(farmer) ? (
            <TouchableOpacity
              style={styles.consentCard}
              onPress={openConsent}
              activeOpacity={0.85}
              disabled={consentOpening}
            >
              <View style={styles.consentBody}>
                <Text style={styles.consentName} numberOfLines={2}>
                  {consentOpening ? "Loading…" : consentName}
                </Text>
                {consentSource ? (
                  <Text style={styles.consentMeta}>{consentSource}</Text>
                ) : null}
              </View>
              <Text style={styles.consentAction}>View ›</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.emptyText}>No consent document uploaded.</Text>
          )}
        </View>

        <PrimaryButton
          title="Edit farmer"
          onPress={handleEdit}
          disabled={farmer.sync_status === "syncing"}
          variant="outline"
        />
      </ScrollView>

      <ConsentViewerModal
        visible={consentVisible}
        uri={consentViewUri}
        fileName={consentName}
        onClose={() => {
          setConsentVisible(false);
          setConsentViewUri(null);
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  pageHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md
  },
  pageTitle: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.5
  },
  pageSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginTop: 6
  },
  scroll: {
    flex: 1
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: 2
  },
  row: {
    gap: 4
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.smoke,
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  rowValue: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    lineHeight: 22
  },
  cropCard: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  cropName: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    marginBottom: 4
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke
  },
  syncError: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.error,
    marginBottom: spacing.sm
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    textTransform: "uppercase"
  },
  consentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  consentBody: {
    flex: 1
  },
  consentName: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.brunswick
  },
  consentMeta: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginTop: 4
  },
  consentAction: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.brunswick
  }
});
