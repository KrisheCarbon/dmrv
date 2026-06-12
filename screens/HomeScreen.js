import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Modal
} from "react-native";
import { supabase } from "../services/supabase";
import { ScreenShell } from "../components/ScreenHeader";
import { getSyncStatusSummary } from "../services/syncService";
import { colors, fonts, spacing, radius, logos } from "../constants/theme";

const STATIC_PREVIEW_CARD = {
  id: "preview_in_progress",
  title: "10 batches pending",
  message: "Pick up where you left off in Pyrolysis.",
  actionLabel: "Continue work"
};

const MODULES = [
  {
    id: "dashboard",
    title: "Dashboard",
    desc: "Overview of your activity & metrics",
    active: false,
    demoStatus: { tone: "warning", label: "Sync pending" }
  },
  {
    id: "farms",
    title: "Farms",
    desc: "Onboard farmers & capture farm data",
    active: true,
    screen: "FarmerDashboard",
    showSyncStatus: true
  },
  {
    id: "pyrolysis",
    title: "Pyrolysis",
    desc: "Log batch runs & production data",
    active: false,
    demoStatus: { tone: "error", label: "2 sync issue(s)" }
  },
  {
    id: "mixing",
    title: "Mixing",
    desc: "Record mixing & application details",
    active: false
  },
  {
    id: "trainings",
    title: "Trainings",
    desc: "Guides, courses & field resources",
    active: false,
  },
  {
    id: "earnings",
    title: "Earnings",
    desc: "View payouts & upload history",
    active: false
  }
];

const TONE = {
  success: {
    dot: colors.success,
    bg: colors.successBg,
    text: colors.success
  },
  warning: {
    dot: colors.warning,
    bg: colors.warningBg,
    text: "#9A7200"
  },
  error: {
    dot: colors.error,
    bg: colors.errorBg,
    text: colors.error
  },
  neutral: {
    dot: colors.smoke,
    bg: colors.chalk,
    text: colors.smoke
  }
};

function StatusPill({ tone, label }) {
  const palette = TONE[tone] || TONE.neutral;
  return (
    <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: palette.dot }]} />
      <Text style={[styles.statusText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

function getFarmsSyncStatus(sync) {
  if (sync.errors > 0) {
    return { tone: "error", label: `${sync.errors} sync issue(s)` };
  }
  if (!sync.online && sync.pending > 0) {
    return { tone: "warning", label: "Offline · sync pending" };
  }
  if (sync.pending > 0) {
    return { tone: "warning", label: "Sync pending" };
  }
  if (!sync.online) {
    return { tone: "neutral", label: "Offline" };
  }
  return { tone: "success", label: "All synced" };
}

function getModuleStatus(module, sync) {
  if (module.demoStatus) {
    return module.demoStatus;
  }
  if (module.showSyncStatus) {
    return getFarmsSyncStatus(sync);
  }
  return null;
}

function buildActionCards(sync, dismissedCardIds) {
  const cards = [];

  if (sync.errors > 0 && !dismissedCardIds.includes("sync_error")) {
    cards.push({
      id: "sync_error",
      tone: "error",
      title: `${sync.errors} sync issue(s)`,
      message: "Some farm entries could not upload. Review them in Farms.",
      actionLabel: "View farms",
      screen: "FarmerDashboard"
    });
  } else if (
    !sync.online &&
    sync.pending > 0 &&
    !dismissedCardIds.includes("offline_pending")
  ) {
    cards.push({
      id: "offline_pending",
      tone: "warning",
      title: `${sync.pending} item(s) saved offline`,
      message: "Your data is safe on this device and will sync when you're online.",
      actionLabel: "View farms",
      screen: "FarmerDashboard"
    });
  } else if (sync.pending > 0 && !dismissedCardIds.includes("sync_pending")) {
    cards.push({
      id: "sync_pending",
      tone: "warning",
      title: `Syncing ${sync.pending} item(s)…`,
      message: "Your latest entries are being uploaded.",
      actionLabel: "View farms",
      screen: "FarmerDashboard"
    });
  }

  return cards;
}

export default function HomeScreen({ navigation }) {
  const [userName, setUserName] = useState("");
  const [sync, setSync] = useState({
    pending: 0,
    errors: 0,
    online: true
  });
  const [dismissedCardIds, setDismissedCardIds] = useState([]);
  const [showHeroCard, setShowHeroCard] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    loadSummary();
    const unsubscribe = navigation.addListener("focus", loadSummary);
    return unsubscribe;
  }, [navigation]);

  async function loadSummary() {
    const summary = await getSyncStatusSummary();
    setSync(summary);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const fullName =
        profile?.full_name?.trim() ||
        user.user_metadata?.full_name?.trim() ||
        user.user_metadata?.name?.trim() ||
        "";

      setUserName(fullName);
    }
  }

  const actionCards = useMemo(
    () => buildActionCards(sync, dismissedCardIds),
    [sync, dismissedCardIds]
  );

  function openModule(module) {
    if (!module.active) {
      Alert.alert(
        "Coming soon",
        `${module.title} will be available in a future update.`
      );
      return;
    }
    navigation.navigate(module.screen);
  }

  function dismissCard(cardId) {
    setDismissedCardIds((prev) =>
      prev.includes(cardId) ? prev : [...prev, cardId]
    );
  }

  async function handleLogout() {
    setMenuVisible(false);
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
        }
      }
    ]);
  }

  const profileInitial = userName.trim()
    ? userName.trim().charAt(0).toUpperCase()
    : "";

  return (
    <ScreenShell>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Image
              source={logos.symbolWhiteBg}
              style={styles.logoMark}
              resizeMode="contain"
            />
            <Text style={styles.greeting} numberOfLines={2}>
              Hello{userName ? `, ${userName}` : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.profileInitial}>{profileInitial}</Text>
          </TouchableOpacity>
        </View>

        {showHeroCard ? (
          <View style={styles.heroCard}>
            <TouchableOpacity
              style={styles.heroDismissBtn}
              onPress={() => setShowHeroCard(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Dismiss"
            >
              <Text style={styles.heroDismissText}>×</Text>
            </TouchableOpacity>

            <Text style={styles.heroEyebrow}>In progress</Text>
            <Text style={styles.heroTitle}>{STATIC_PREVIEW_CARD.title}</Text>
            <Text style={styles.heroMessage}>{STATIC_PREVIEW_CARD.message}</Text>

            <TouchableOpacity
              style={styles.heroBtn}
              onPress={() =>
                Alert.alert(
                  "Coming soon",
                  "Pyrolysis will be available in a future update."
                )
              }
              activeOpacity={0.85}
            >
              <Text style={styles.heroBtnText}>
                {STATIC_PREVIEW_CARD.actionLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {actionCards.map((card) => (
          <View key={card.id} style={styles.syncNoticeCard}>
            <TouchableOpacity
              style={styles.syncDismissBtn}
              onPress={() => dismissCard(card.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.syncDismissText}>×</Text>
            </TouchableOpacity>

            <Text style={styles.syncNoticeTitle}>{card.title}</Text>
            <Text style={styles.syncNoticeMessage}>{card.message}</Text>

            {card.actionLabel ? (
              <TouchableOpacity
                style={styles.heroBtn}
                onPress={() => navigation.navigate(card.screen)}
                activeOpacity={0.85}
              >
                <Text style={styles.heroBtnText}>{card.actionLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <View style={styles.moduleList}>
          {MODULES.map((module) => {
            const syncStatus = getModuleStatus(module, sync);

            return (
              <Pressable
                key={module.id}
                style={({ pressed }) => [
                  styles.moduleCard,
                  pressed && module.active && styles.moduleCardPressed,
                  !module.active && styles.moduleDisabled
                ]}
                onPress={() => openModule(module)}
              >
                <View style={styles.moduleBody}>
                  <View style={styles.moduleTitleRow}>
                    <Text
                      style={[
                        styles.moduleTitle,
                        !module.active && styles.moduleTitleDisabled
                      ]}
                    >
                      {module.title}
                    </Text>
                    {!module.active ? (
                      <View style={styles.soonBadge}>
                        <Text style={styles.soonText}>Soon</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.moduleDesc}>{module.desc}</Text>
                  {syncStatus ? (
                    <View style={styles.moduleStatusRow}>
                      <StatusPill tone={syncStatus.tone} label={syncStatus.label} />
                    </View>
                  ) : null}
                </View>
                {module.active ? (
                  <Text style={styles.chevron}>›</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuVisible(false)}
          />
          <View style={styles.menuSheet}>
            {userName ? (
              <View style={styles.menuHeader}>
                <Text style={styles.menuName}>{userName}</Text>
                <Text style={styles.menuHint}>Your account</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                Alert.alert(
                  "Profile",
                  "Profile settings will be available in a future update."
                );
              }}
            >
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={handleLogout}
            >
              <Text style={styles.menuItemDanger}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    gap: spacing.sm
  },
  topBarLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  logoMark: {
    width: 40,
    height: 40,
    backgroundColor: colors.white
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.chartreuse,
    alignItems: "center",
    justifyContent: "center"
  },
  profileInitial: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick
  },
  greeting: {
    flex: 1,
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    letterSpacing: -0.5,
    lineHeight: 26
  },
  heroCard: {
    backgroundColor: "#1A3C2A",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    marginBottom: spacing.md
  },
  heroDismissBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  heroDismissText: {
    fontSize: 24,
    lineHeight: 26,
    color: "#FFFFFF",
    opacity: 0.85,
    fontWeight: "300"
  },
  heroEyebrow: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: "#8CC63E",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  heroTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
    paddingRight: spacing.lg,
    letterSpacing: -0.3
  },
  heroMessage: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: "#FFFFFF",
    opacity: 0.82,
    lineHeight: 18,
    marginBottom: spacing.md
  },
  heroBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#8CC63E",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm
  },
  heroBtnText: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 14,
    color: "#1A3C2A"
  },
  syncNoticeCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingTop: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  syncDismissBtn: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1
  },
  syncDismissText: {
    fontSize: 24,
    lineHeight: 26,
    color: colors.smoke,
    fontFamily: fonts.regular
  },
  syncNoticeTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.brunswick,
    marginBottom: 4,
    paddingRight: spacing.lg
  },
  syncNoticeMessage: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18,
    marginBottom: spacing.sm
  },
  moduleList: {
    gap: spacing.sm
  },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  moduleCardPressed: {
    backgroundColor: colors.chalk
  },
  moduleDisabled: {
    opacity: 0.72
  },
  moduleBody: {
    flex: 1
  },
  moduleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4
  },
  moduleTitle: {
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.brunswick
  },
  moduleTitleDisabled: {
    color: colors.smoke
  },
  soonBadge: {
    backgroundColor: colors.chalk,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill
  },
  soonText: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: colors.smoke,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  moduleDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.smoke,
    lineHeight: 18
  },
  moduleStatusRow: {
    marginTop: spacing.sm
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    gap: 6
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  statusText: {
    fontSize: 11,
    fontFamily: fonts.medium
  },
  chevron: {
    fontSize: 24,
    color: colors.smokeLight,
    marginLeft: spacing.sm
  },
  menuOverlay: {
    flex: 1
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 60, 42, 0.25)"
  },
  menuSheet: {
    position: "absolute",
    top: 56,
    right: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    minWidth: 200,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden"
  },
  menuHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  menuName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brunswick
  },
  menuHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    marginTop: 2
  },
  menuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14
  },
  menuItemLast: {
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  menuItemText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick
  },
  menuItemDanger: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.error
  }
});
