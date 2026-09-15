import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { getUserProfile } from "../services/userProfile";

function PathCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
      <Text style={styles.cardChevron}>›</Text>
    </Pressable>
  );
}

export default function FarmersNetworkScreen({ navigation }) {
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    getUserProfile().then((profile) => setRole(profile?.role || "")).catch(() => {});
  }, []);

  const isSupervisor =
    role === "supervisor" || role === "admin" || role === "manager";

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>Farmers Network</Text>
        <Text style={styles.subtitle}>
          Five modules: farmers, new farmer, field onboarding, soil testing, and consent documents.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PathCard
          title="Farmers"
          subtitle="All onboarded farmers, with field, soil sample, report, and consent status"
          onPress={() =>
            navigation.navigate("FarmerDashboard", {
              listMode: "all",
              title: "Farmers",
            })
          }
        />
        <PathCard
          title="New farmer"
          subtitle="Create a farmer profile with cultivated land and major crop"
          onPress={() => navigation.navigate("NewFarmerOnboarding")}
        />
        <PathCard
          title="Farms onboarding"
          subtitle="Select a farmer, then add one or more fields (GPS, area, season, dates)"
          onPress={() => navigation.navigate("FieldForm", {})}
        />
        <PathCard
          title="Soil testing"
          subtitle="Select a farmer and one or more of their fields, then submit a GPS-tagged sample"
          onPress={() => navigation.navigate("SoilTestForm", {})}
        />
        <PathCard
          title="Consent / documents"
          subtitle="Upload document photos for a farmer and set a deadline"
          onPress={() => navigation.navigate("ConsentForm", {})}
        />

        {isSupervisor ? (
          <PathCard
            title="Incoming samples"
            subtitle="Mark soil samples received from climapreneurs"
            onPress={() => navigation.navigate("SoilSamplesInbox")}
          />
        ) : null}
      </ScrollView>
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
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 20,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    position: "relative",
  },
  cardPressed: {
    backgroundColor: colors.chalk,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: spacing.xs,
    paddingRight: 24,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingRight: 20,
  },
  cardChevron: {
    position: "absolute",
    right: spacing.lg,
    top: "50%",
    marginTop: -12,
    fontSize: 28,
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
});
