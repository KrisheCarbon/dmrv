import React, { useCallback, useEffect, useState } from "react";
import { Text, View, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import FormPicker, { type FormPickerOption } from "./FormPicker";
import { farmerToFormData, getAllFarmersLocal } from "../services/farmerService";
import { listFarmerIdsWithMappedFields } from "../services/farmersNetworkService";
import { getUserProfile } from "../services/userProfile";
import { colors, fonts, radius, spacing } from "../constants/theme";

function farmerLoadError(err: unknown): string {
  const raw = err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err);
  if (/database is locked|SQLITE_BUSY|NativeDatabase/i.test(raw)) {
    return "The phone's records are busy. Wait a moment and try again.";
  }
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FarmerPickerProps = {
  label?: string;
  value: string;
  onChange: (farmerId: string) => void;
  required?: boolean;
  /** When true, only farmers with an active farm whose boundary is mapped. */
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
    setLoading(true);
    setError(null);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const profile = await getUserProfile();
        if (!profile) {
          setOptions([]);
          setError("Sign in to load farmers.");
          setLoading(false);
          return;
        }
        const farmers = await getAllFarmersLocal(profile.id, profile.role);
        const withFields = requireFields
          ? await listFarmerIdsWithMappedFields()
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
        setLoading(false);
        return;
      } catch (err) {
        lastError = err;
        const raw = err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err);
        if (!/database is locked|SQLITE_BUSY|NativeDatabase/i.test(raw) || attempt === 3) {
          break;
        }
        await sleep(400 * (attempt + 1));
      }
    }
    setError(farmerLoadError(lastError));
    setOptions([]);
    setLoading(false);
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
          {error
            ? "Could not load farmers"
            : requireFields
              ? "No farmers with mapped farms yet"
              : "No farmers onboarded yet"}
        </Text>
        <Text style={styles.hint}>
          {error ||
            (requireFields
              ? "Register the farmer, then add the farm and draw its boundary under Farms onboarding. A soil sample can only be taken inside a mapped farm."
              : "Add a farmer under New Farmer first, then come back to link farms, soil, or consent.")}
        </Text>
        {error ? (
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
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
        searchable
        searchPlaceholder="Search name, mobile, or farmer ID"
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
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    fontFamily: fonts.regular,
    color: colors.error,
    fontSize: 13,
    marginTop: 4,
  },
  retry: {
    marginTop: spacing.sm,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingHorizontal: spacing.md,
  },
  retryText: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 16,
  },
});
