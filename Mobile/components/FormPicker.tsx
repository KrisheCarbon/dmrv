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
import { colors, fonts, spacing, radius } from "../constants/theme";
import SearchField from "./SearchField";
import {
  sheetListMaxHeight,
  useKeyboardOverlap,
} from "../hooks/useKeyboardOverlap";

export type FormPickerOption = {
  value: string;
  label: string;
  /** Small helper text shown next to the option, e.g. a biomass rate hint. */
  hint?: string;
};

type FormPickerProps = {
  label: string;
  placeholder?: string;
  value: string;
  options: FormPickerOption[];
  onValueChange: (value: string) => void;
  enabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
};

export default function FormPicker({
  label,
  placeholder = "Select…",
  value,
  options,
  onValueChange,
  enabled = true,
  searchable = false,
  searchPlaceholder = "Search…",
}: FormPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const keyboardOverlap = useKeyboardOverlap();
  const insets = useSafeAreaInsets();

  const selectedLabel = useMemo(() => {
    const match = options.find((option) => option.value === value);
    return match?.label ?? "";
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  function openPicker() {
    if (!enabled) return;
    setQuery("");
    setOpen(true);
  }

  function closePicker() {
    setQuery("");
    setOpen(false);
  }

  function select(next: string) {
    onValueChange(next);
    closePicker();
  }

  const listMaxHeight = sheetListMaxHeight(
    keyboardOverlap,
    84 + (keyboardOverlap > 0 ? 0 : 48),
  );
  const windowHeight = Dimensions.get("window").height;
  const searchableSheetHeight = Math.max(
    280,
    windowHeight - keyboardOverlap - insets.top - 8,
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [
          styles.field,
          !enabled && styles.fieldDisabled,
          pressed && enabled && styles.fieldPressed,
        ]}
        onPress={openPicker}
        disabled={!enabled}
      >
        <Text
          style={[styles.fieldText, !selectedLabel && styles.placeholder]}
          numberOfLines={1}
        >
          {selectedLabel || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closePicker}
      >
        <View style={[styles.overlay, { paddingBottom: keyboardOverlap }]}>
          <Pressable style={styles.backdrop} onPress={closePicker} />
          <View
            style={[
              styles.sheet,
              searchable && { height: searchableSheetHeight },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              {keyboardOverlap > 0 ? (
                <Pressable onPress={closePicker} hitSlop={8}>
                  <Text style={styles.sheetClose}>Close</Text>
                </Pressable>
              ) : null}
            </View>
            {searchable ? (
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                style={styles.search}
              />
            ) : null}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={[
                styles.list,
                searchable ? styles.listFill : { maxHeight: listMaxHeight },
              ]}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {query.trim()
                    ? "No options match that search."
                    : "No options available."}
                </Text>
              }
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                    onPress={() => select(item.value)}
                  >
                    <View style={styles.optionTextWrap}>
                      <Text
                        style={[
                          styles.optionLabel,
                          selected && styles.optionLabelSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.hint ? (
                        <Text style={styles.optionHint}>{item.hint}</Text>
                      ) : null}
                    </View>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
            {keyboardOverlap === 0 ? (
              <Pressable style={styles.cancelBtn} onPress={closePicker}>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldPressed: {
    backgroundColor: colors.overlay,
  },
  fieldDisabled: {
    opacity: 0.65,
    backgroundColor: colors.overlay,
  },
  fieldText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  placeholder: {
    color: colors.smokeLight,
  },
  chevron: {
    fontSize: 16,
    color: colors.smoke,
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
  empty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.smoke,
    textAlign: "center",
  },
  list: {
    paddingHorizontal: spacing.sm,
  },
  listFill: {
    flex: 1,
    minHeight: 0,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
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
  optionTextWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  optionLabel: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  optionLabelSelected: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
  },
  optionHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
  },
  check: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brunswick,
    marginLeft: spacing.sm,
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
