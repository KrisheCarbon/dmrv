import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import {
  fetchKontikkisForKilnSensor,
  type KilnKontikkiOption,
} from "../services/kiln/kilnKontikkiService";
import { useKilnStore } from "../store/useKilnStore";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<Record<string, object | undefined>>;
};

export default function KilnSelectKontikkiScreen({ navigation }: Props) {
  const { selectedKontikki, setSelectedKontikki, clearKilnSession } = useKilnStore();
  const [kontikkis, setKontikkis] = useState<KilnKontikkiOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKontikkis = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchKontikkisForKilnSensor();
      setKontikkis(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setKontikkis([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadKontikkis();
  }, [loadKontikkis]);

  const handleSelect = useCallback(
    (kontikki: KilnKontikkiOption) => {
      clearKilnSession();
      setSelectedKontikki(kontikki);
      navigation.navigate("KilnScanner");
    },
    [clearKilnSession, navigation, setSelectedKontikki],
  );

  return (
    <ScreenShell>
      <ScreenHeader
        title="Kiln Sensor"
        subtitle="Select a kontikki to connect its hardware module"
        onBack={() => navigation.goBack()}
        rightElement={
          <TouchableOpacity onPress={() => navigation.navigate("KilnSavedBatches")}>
            <Text style={styles.linkText}>History</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.brunswick} style={{ marginTop: spacing.lg }} />
      ) : error ? (
        <View style={styles.messageBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void loadKontikkis()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={kontikkis}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadKontikkis();
              }}
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selectedKontikki?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.kontikki_code}</Text>
                  <Text style={styles.moduleBadge}>{item.module_id}</Text>
                </View>
                {item.producer_name ? (
                  <Text style={styles.cardMeta}>Producer: {item.producer_name}</Text>
                ) : null}
                <Text style={styles.cardHint}>
                  Tap to scan and connect to module {item.module_id}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.messageBox}>
              <Text style={styles.emptyTitle}>No hardware-linked kontikkis</Text>
              <Text style={styles.emptySubtitle}>
                Ask an admin to set the Hardware module ID on your kontikki in the
                admin portal. Only kontikkis you have access to with a module ID appear
                here.
              </Text>
            </View>
          }
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  linkText: { color: colors.brunswick, fontFamily: fonts.medium, fontSize: 14 },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardSelected: { borderColor: colors.brunswick, backgroundColor: colors.overlay },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 6,
  },
  cardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  moduleBadge: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.brunswick,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  cardMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  cardHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  messageBox: { padding: spacing.lg, alignItems: "center" },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryBtnText: { color: colors.white, fontFamily: fonts.bold },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
