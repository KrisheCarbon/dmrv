import React, { useCallback, useEffect, useState } from "react";
import { Text, View, StyleSheet, ActivityIndicator } from "react-native";
import FormPicker, { type FormPickerOption } from "./FormPicker";
import { farmerToFormData, getAllFarmersLocal } from "../services/farmerService";
import { listFarmerIdsWithActiveFields } from "../services/farmersNetworkService";
import { getUserProfile } from "../services/userProfile";
import { colors, fonts, spacing } from "../constants/theme";

type FarmerPickerProps = {
  label?: string;
  value: string;
  onChange: (farmerId: string) => void;
  required?: boolean;
  /** When true, only farmers with at least one active field are listed. */
  requireFields?: boolean;
};

/**
 * Dropdown of locally onboarded farmers (scoped to the signed-in user).
 */
export default function FarmerPicker({
  label = "Farmer *",
  value,
  onChange,
  required = true,
  requireFields = false,
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
      const withFields = requireFields
        ? await listFarmerIdsWithActiveFields()
        : null;
      const mapped = farmers
        .filter((f) => (withFields ? withFields.has(f.id) : true))
        .map((f) => {
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
  }, [requireFields]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || error) return;
    if (value && !options.some((option) => option.value === value)) {
      onChange("");
      return;
    }
    if (!value && options.length === 1) {
      onChange(options[0].value);
    }
  }, [loading, error, options, value, onChange]);

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
        <Text style={styles.emptyTitle}>
          {requireFields
            ? "No farmers with farms yet"
            : "No farmers onboarded yet"}
        </Text>
        <Text style={styles.hint}>
          {error ||
            (requireFields
              ? "Add farm info under Farms onboarding first. A soil sample needs a farm."
              : "Add a farmer under New Farmer first, then come back to link farms, soil, or consent.")}
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
