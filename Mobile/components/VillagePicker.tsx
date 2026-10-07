import React, { useMemo, useState } from "react";
import {
  Dimensions,
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  villagePlaceLine,
  villageSearchText,
  type ClusterVillageRecord,
} from "@krishecarbon/shared";
import { colors, fonts, spacing, radius } from "../constants/theme";
import SearchField from "./SearchField";
import { useKeyboardOverlap } from "../hooks/useKeyboardOverlap";

type VillagePickerProps = {
  villages: ClusterVillageRecord[];
  valueId: string;
  loading?: boolean;
  emptyText?: string;
  onChange: (village: ClusterVillageRecord) => void;
};

function groupedVillages(villages: ClusterVillageRecord[]) {
  const map = new Map<string, ClusterVillageRecord[]>();
  for (const village of villages) {
    const key = village.cluster_name || "Cluster";
    const list = map.get(key) ?? [];
    list.push(village);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function VillagePicker({
  villages,
  valueId,
  loading = false,
  emptyText = "No cluster villages assigned yet.",
  onChange,
}: VillagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const keyboardOverlap = useKeyboardOverlap();
  const insets = useSafeAreaInsets();
  const sheetHeight = Math.max(
    280,
    Dimensions.get("window").height - keyboardOverlap - insets.top - 8,
  );

  const selected = villages.find((village) => village.id === valueId) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return villages;
    return villages.filter((village) =>
      villageSearchText(village).includes(needle),
    );
  }, [query, villages]);

  const sections = useMemo(() => {
    return groupedVillages(filtered).flatMap(([clusterName, items]) => [
      { type: "header" as const, key: `h-${clusterName}`, title: clusterName },
      ...items.map((village) => ({
        type: "village" as const,
        key: village.id,
        village,
      })),
    ]);
  }, [filtered]);

  const selectedPlace = selected ? villagePlaceLine(selected) : "";

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Village *</Text>
      <Pressable
        style={({ pressed }) => [
          styles.field,
          pressed && !loading && styles.fieldPressed,
        ]}
        onPress={() => !loading && setOpen(true)}
        disabled={loading}
      >
        <View style={styles.fieldCopy}>
          <Text
            style={[styles.fieldTitle, !selected && styles.placeholder]}
            numberOfLines={1}
          >
            {loading
              ? "Loading villages…"
              : selected
                ? selected.village_name
                : "Select village"}
          </Text>
          {selected ? (
            <Text style={styles.fieldMeta} numberOfLines={1}>
              {selected.cluster_name}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      {selected ? (
        <View style={styles.summary}>
          {selectedPlace ? (
            <Text style={styles.summaryPlace}>{selectedPlace}</Text>
          ) : null}
          <Text style={styles.summaryCluster}>{selected.cluster_name}</Text>
        </View>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.overlay, { paddingBottom: keyboardOverlap }]}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { height: sheetHeight }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select village</Text>
              {keyboardOverlap > 0 ? (
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Text style={styles.sheetClose}>Close</Text>
                </Pressable>
              ) : null}
            </View>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search village, block, or cluster"
              style={styles.search}
            />
            {villages.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : sections.length === 0 ? (
              <Text style={styles.empty}>No villages match that search.</Text>
            ) : (
              <FlatList
                data={sections}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                style={[styles.list, styles.listFill]}
                renderItem={({ item }) => {
                  if (item.type === "header") {
                    return <Text style={styles.groupTitle}>{item.title}</Text>;
                  }
                  const village = item.village;
                  const active = village.id === valueId;
                  const place = villagePlaceLine(village);
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.option,
                        active && styles.optionSelected,
                        pressed && styles.optionPressed,
                      ]}
                      onPress={() => {
                        onChange(village);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <View style={styles.optionCopy}>
                        <Text
                          style={[
                            styles.optionTitle,
                            active && styles.optionTitleSelected,
                          ]}
                        >
                          {village.village_name}
                        </Text>
                        {place ? (
                          <Text style={styles.optionPlace}>{place}</Text>
                        ) : null}
                      </View>
                      {active ? <Text style={styles.check}>✓</Text> : null}
                    </Pressable>
                  );
                }}
              />
            )}
            {keyboardOverlap === 0 ? (
              <Pressable style={styles.cancelBtn} onPress={() => setOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldPressed: {
    backgroundColor: colors.overlay,
  },
  fieldCopy: {
    flex: 1,
  },
  fieldTitle: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  fieldMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  placeholder: {
    color: colors.smokeLight,
  },
  chevron: {
    fontSize: 16,
    color: colors.smoke,
  },
  summary: {
    marginTop: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  summaryPlace: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  summaryCluster: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.brunswick,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 60, 42, 0.35)",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sheetTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
  },
  sheetClose: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
  },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.sm,
  },
  listFill: {
    flex: 1,
    minHeight: 0,
  },
  groupTitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.smoke,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  option: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: {
    backgroundColor: colors.overlay,
  },
  optionPressed: {
    backgroundColor: colors.overlay,
  },
  optionCopy: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  optionTitle: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  optionTitleSelected: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  optionPlace: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  check: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smoke,
  },
  cancelBtn: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.smoke,
  },
});
