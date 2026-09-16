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
          Open Farmers to view people already onboarded. Use the modules below
          to enter new farmer, farm, soil, or consent information.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Section
          title="Farmers"
          hint="A list of farmers and their information. This is not a form."
        >
          <PathCard
            title="Farmers"
            badge="List"
            subtitle="Browse onboarded farmers and see their profile, farms, soil, and consent status"
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
          hint="These modules are for recording information in the field."
        >
          <PathCard
            title="New farmer"
            badge="Enter info"
            subtitle="Create a farmer profile with cultivated land and major crop"
            onPress={() => navigation.navigate("NewFarmerOnboarding")}
          />
          <PathCard
            title="Farms onboarding"
            badge="Enter info"
            subtitle="Select a farmer, then add one or more farms (GPS, area, season, dates)"
            onPress={() => navigation.navigate("FieldForm", {})}
          />
          <PathCard
            title="Soil testing"
            badge="Enter info"
            subtitle="Collect a GPS-tagged soil sample from a farmer with farms"
            onPress={() => navigation.navigate("SoilTestForm", {})}
          />
          {role === "climapreneur" ? (
            <PathCard
              title="Submit samples"
              badge="Enter info"
              subtitle="Choose a supervisor and submit collected soil samples"
              onPress={() => navigation.navigate("SoilSampleSubmit")}
            />
          ) : null}
          <PathCard
            title="Farmer consent"
            badge="Enter info"
            subtitle="Record signed farmer consent, photos, and expiry date"
            onPress={() => navigation.navigate("ConsentForm", {})}
          />
          {isSupervisor ? (
            <>
              <PathCard
                title="Sample receiving"
                badge="Review"
                subtitle="Site-wise climapreneur samples. Photograph, then accept, reject, or store"
                onPress={() => navigation.navigate("SoilSamplesInbox")}
              />
              <PathCard
                title="Soil reports"
                badge="Enter info"
                subtitle="Select a sample and upload the lab PDF or a photo of the results"
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
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 20,
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
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18,
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
