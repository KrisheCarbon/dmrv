import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import { farmerToFormData, getFarmerByIdLocal } from "../services/farmerService";
import {
  consentExpiryLabel,
  getLatestConsent,
  listFieldsForFarmer,
  listSoilTestsForFarmer,
} from "../services/farmersNetworkService";
import { colors, fonts, spacing, radius } from "../constants/theme";

function SectionCard({
  title,
  status,
  statusTone = "neutral",
  actionLabel,
  onPress,
  done,
}: {
  title: string;
  status: string;
  statusTone?: "ok" | "warn" | "neutral";
  actionLabel: string;
  onPress: () => void;
  done?: boolean;
}) {
  const tone =
    statusTone === "ok"
      ? { bg: colors.successBg, color: colors.success }
      : statusTone === "warn"
        ? { bg: colors.warningBg, color: colors.warning }
        : { bg: colors.chalk, color: colors.smoke };

  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.color }]}>{status}</Text>
        </View>
      </View>
      <Pressable style={styles.actionBtn} onPress={onPress}>
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

export default function NewFarmerProgressScreen({ route, navigation }) {
  const farmerId = route.params?.farmerId;
  const [loading, setLoading] = useState(true);
  const [farmer, setFarmer] = useState(null);
  const [fieldCount, setFieldCount] = useState(0);
  const [soilCount, setSoilCount] = useState(0);
  const [consentLabel, setConsentLabel] = useState("—");

  const load = useCallback(async () => {
    if (!farmerId) return;
    try {
      const record = await getFarmerByIdLocal(farmerId);
      setFarmer(farmerToFormData(record));
      const [fields, soils, consent] = await Promise.all([
        listFieldsForFarmer(farmerId),
        listSoilTestsForFarmer(farmerId),
        getLatestConsent(farmerId),
      ]);
      setFieldCount(fields.length);
      setSoilCount(soils.length);
      setConsentLabel(consentExpiryLabel(consent));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useEffect(() => {
    load();
    return navigation.addListener("focus", load);
  }, [navigation, load]);

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

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Continue onboarding</Text>
        <Text style={styles.name}>{farmer.farmer_name}</Text>
        {farmer.farmer_code ? (
          <Text style={styles.code}>Farmer ID: {farmer.farmer_code}</Text>
        ) : null}
        <Text style={styles.subtitle}>
          Complete farms next. Soil testing is optional, but needs a farm first.
        </Text>

        <SectionCard
          title="1. Farmer onboarding & consent"
          status={consentLabel}
          statusTone="ok"
          actionLabel="View farmer"
          done
          onPress={() => navigation.navigate("FarmerDetail", { farmerId })}
        />
        <SectionCard
          title="2. Farms"
          status={fieldCount > 0 ? `${fieldCount} farm(s)` : "Not started"}
          statusTone={fieldCount > 0 ? "ok" : "warn"}
          actionLabel={fieldCount > 0 ? "Add another farm" : "Add first farm"}
          done={fieldCount > 0}
          onPress={() =>
            navigation.navigate("FieldForm", { farmerId, mode: "create" })
          }
        />
        <SectionCard
          title="3. Soil testing"
          status={
            fieldCount === 0
              ? "Needs a farm first"
              : soilCount > 0
                ? `${soilCount} test(s)`
                : "Optional"
          }
          statusTone={soilCount > 0 ? "ok" : fieldCount === 0 ? "warn" : "neutral"}
          actionLabel={fieldCount === 0 ? "Add a farm first" : "Add soil test"}
          done={soilCount > 0}
          onPress={() =>
            fieldCount === 0
              ? navigation.navigate("FieldForm", { farmerId, mode: "create" })
              : navigation.navigate("SoilTestForm", { farmerId })
          }
        />

        <PrimaryButton
          title={fieldCount > 0 ? "Finish" : "Finish later"}
          onPress={() =>
            navigation.navigate("FarmerDetail", { farmerId })
          }
          variant={fieldCount > 0 ? "primary" : "outline"}
        />
        <PrimaryButton
          title="Back to Farmers Network"
          onPress={() => navigation.navigate("FarmersNetwork")}
          variant="outline"
        />
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  name: {
    fontSize: 18,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  code: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  cardDone: {
    borderColor: colors.brunswick,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  actionBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.chalk,
  },
  actionText: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 13,
  },
});
