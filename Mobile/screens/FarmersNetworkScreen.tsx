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
  badge,
  onPress,
}: {
  title: string;
  subtitle: string;
  badge: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      </View>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
      <Text style={styles.cardChevron}>›</Text>
    </Pressable>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionHint}>{hint}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
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
          View farmers, or add farmer, farm, soil, and consent details.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Section
          title="Farmers"
          hint="Farmers already onboarded."
        >
          <PathCard
            title="Farmers"
            badge="List"
            subtitle="Profiles, farms, soil, and consent"
            onPress={() =>
              navigation.navigate("FarmerDashboard", {
                listMode: "all",
                title: "Farmers",
              })
            }
          />
        </Section>

        <Section
          title="Enter details"
          hint="Record information in the field."
        >
          <PathCard
            title="New farmer"
            badge="Enter info"
            subtitle="Name, land, and major crop"
            onPress={() => navigation.navigate("NewFarmerOnboarding")}
          />
          <PathCard
            title="Farms onboarding"
            badge="Enter info"
            subtitle="Area, map boundary, season, photos"
            onPress={() => navigation.navigate("FieldForm", {})}
          />
          <PathCard
            title="Soil testing"
            badge="Enter info"
            subtitle="4+ points, mix, then photograph"
            onPress={() => navigation.navigate("SoilTestForm", {})}
          />
          {role === "climapreneur" ? (
            <PathCard
              title="Submit samples"
              badge="Enter info"
              subtitle="Send samples to a supervisor"
              onPress={() => navigation.navigate("SoilSampleSubmit")}
            />
          ) : null}
          <PathCard
            title="Farmer consent"
            badge="Enter info"
            subtitle="Signed photos and expiry date"
            onPress={() => navigation.navigate("ConsentForm", {})}
          />
          {isSupervisor ? (
            <>
              <PathCard
                title="Sample receiving"
                badge="Review"
                subtitle="Accept, reject, or store samples"
                onPress={() => navigation.navigate("SoilSamplesInbox")}
              />
              <PathCard
                title="Soil reports"
                badge="Enter info"
                subtitle="Upload lab PDF or photo"
                onPress={() => navigation.navigate("SoilReportUpload")}
              />
            </>
          ) : null}
        </Section>
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
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 16,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionHint: {
    marginTop: 4,
    marginBottom: spacing.sm,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 16,
  },
  sectionBody: {
    gap: spacing.sm,
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
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 28,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    flexShrink: 1,
  },
  badge: {
    backgroundColor: colors.chalk,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: colors.brunswick,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 16,
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
