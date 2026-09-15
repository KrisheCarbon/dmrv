import React, { useCallback, useEffect, useState } from "react";
import { Text, View, StyleSheet, ActivityIndicator } from "react-native";
import FormPicker, { type FormPickerOption } from "./FormPicker";
import { farmerToFormData, getAllFarmersLocal } from "../services/farmerService";
import { getUserProfile } from "../services/userProfile";
import { colors, fonts, spacing } from "../constants/theme";

type FarmerPickerProps = {
  label?: string;
  value: string;
  onChange: (farmerId: string) => void;
  required?: boolean;
};

/**
 * Dropdown of all locally onboarded farmers (scoped to the signed-in user).
 */
export default function FarmerPicker({
  label = "Farmer *",
  value,
  onChange,
  required = true,
}: FarmerPickerProps) {
  const [options, setOptions] = useState<FormPickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const profile = await getUserProfile();
      if (!profile) {
        setOptions([]);
        setError("Sign in to load farmers.");
        return;
      }
      const farmers = await getAllFarmersLocal(profile.id, profile.role);
      const mapped = farmers.map((f) => {
        const form = farmerToFormData(f);
        const code = form.farmer_code ? ` · ${form.farmer_code}` : "";
        const village = form.village ? ` · ${form.village}` : "";
        const mobile = form.mobile_number ? ` · ${form.mobile_number}` : "";
        return {
          value: form.id!,
          label: `${form.farmer_name}${code}${village}${mobile}`,
        };
      });
      setOptions(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!value && options.length === 1) {
      onChange(options[0].value);
    }
  }, [options, value, onChange]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brunswick} />
        <Text style={styles.hint}>Loading farmers…</Text>
      </View>
    );
  }

  if (options.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No farmers onboarded yet</Text>
        <Text style={styles.hint}>
          {error ||
            "Add a farmer under New Farmer first, then come back to link fields, soil, or consent."}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <FormPicker
        label={required ? label : label.replace(" *", "")}
        value={value}
        options={options}
        onValueChange={onChange}
        placeholder="Select farmer…"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.sm,
    gap: 4,
  },
  emptyTitle: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 14,
  },
  hint: {
    fontFamily: fonts.regular,
    color: colors.smoke,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    fontFamily: fonts.regular,
    color: colors.error,
    fontSize: 12,
    marginTop: 4,
  },
});
