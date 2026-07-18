import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import type { PyrolysisKontikkiOption } from "@krishecarbon/shared";
import ScreenHeader, { ScreenShell } from "../components/ScreenHeader";
import PrimaryButton from "../components/PrimaryButton";
import { getStoredAuthUser } from "../services/auth";
import {
  createPyrolysisSessionLocal,
  fetchAvailableKontikkis,
} from "../services/pyrolysisService";
import { colors, fonts, spacing, radius } from "../constants/theme";

function KontikkiRow({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: PyrolysisKontikkiOption;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.row,
        selected && styles.rowSelected,
        disabled && styles.rowDisabled,
      ]}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle}>{item.kontikki_code}</Text>
        {item.producer_name ? (
          <Text style={styles.rowMeta}>{item.producer_name}</Text>
        ) : null}
        {item.capacity != null ? (
          <Text style={styles.rowMeta}>Capacity: {item.capacity}</Text>
        ) : null}
      </View>
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      {disabled ? <Text style={styles.busyLabel}>In use</Text> : null}
    </TouchableOpacity>
  );
}

export default function PyrolysisSelectKontikkisScreen({ navigation }) {
  const [kontikkis, setKontikkis] = useState<PyrolysisKontikkiOption[]>([]);
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const { kontikkis: rows, occupiedIds: busy } =
        await fetchAvailableKontikkis();
      setKontikkis(rows);
      setOccupiedIds(busy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kontikkis");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedItems = useMemo(
    () => kontikkis.filter((row) => selectedIds.includes(row.id)),
    [kontikkis, selectedIds],
  );

  function toggleSelection(id: string) {
    if (occupiedIds.has(id)) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  function handleNext() {
    if (selectedItems.length === 0) {
      Alert.alert("Select kontikkis", "Choose at least one kontikki to continue.");
      return;
    }

    Alert.alert(
      "Start batch?",
      "Once this batch is started you cannot add more kontikkis until it is completed. Selected kontikkis will be locked for this batch.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start batch",
          onPress: () => startBatch(),
        },
      ],
    );
  }

  async function startBatch() {
    try {
      setSubmitting(true);
      const user = await getStoredAuthUser();
      if (!user) {
        Alert.alert("Error", "You must be signed in.");
        return;
      }

      const sessionId = await createPyrolysisSessionLocal(
        user.id,
        selectedItems,
      );

      navigation.replace("PyrolysisSession", { sessionId });
    } catch (err) {
      Alert.alert(
        "Could not start batch",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell>
      <ScreenHeader
        title="Select kontikkis"
        subtitle="Choose all units for this batch"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brunswick} />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {kontikkis.length === 0 ? (
              <Text style={styles.emptyText}>No kontikkis available for you.</Text>
            ) : (
              kontikkis.map((item) => (
                <KontikkiRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  disabled={occupiedIds.has(item.id)}
                  onToggle={() => toggleSelection(item.id)}
                />
              ))
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerMeta}>
              {selectedIds.length} kontikki(s) selected
            </Text>
            <PrimaryButton
              title="Next"
              onPress={handleNext}
              loading={submitting}
              disabled={selectedIds.length === 0}
            />
          </View>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowSelected: {
    borderColor: colors.brunswick,
    backgroundColor: colors.overlay,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowLeft: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.brunswick,
  },
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkSelected: {
    backgroundColor: colors.brunswick,
    borderColor: colors.brunswick,
  },
  checkMark: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  busyLabel: {
    position: "absolute",
    right: spacing.md,
    bottom: 8,
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.warning,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    textAlign: "center",
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.error,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smoke,
    fontStyle: "italic",
  },
});
