import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
} from "react-native";
import { ScreenShell } from "../components/ScreenHeader";
import FormInput from "../components/FormInput";
import FormPicker from "../components/FormPicker";
import FormDateField from "../components/FormDateField";
import PrimaryButton from "../components/PrimaryButton";
import LocationPickerModal, {
  openMapPickerIfOnline,
} from "../components/LocationPickerModal";
import VillagePicker from "../components/VillagePicker";
import { getStoredAuthUser } from "../services/auth";
import {
  farmerToFormData,
  getFarmerByIdLocal,
  saveFarmerLocal,
} from "../services/farmerService";
import { loadClusterVillages } from "../services/clusterVillageService";
import { isFarmerSyncing, processSyncQueue } from "../services/syncService";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import { CROP_OPTIONS } from "../constants/crops";
import { colors, fonts, spacing, radius } from "../constants/theme";
import FarmerPhotoField from "../components/FarmerPhotoField";
import { usePersistedForm } from "../hooks/usePersistedForm";
import {
  isHarvestAfterSowing,
  type ClusterVillageRecord,
  type FarmerCrop,
} from "@krishecarbon/shared";

const EMPTY_FORM = {
  farmer_name: "",
  father_spouse_name: "",
  agri_id: "",
  mobile_number: "",
  address: "",
  village: "",
  mandal: "",
  district: "",
  state: "",
  cluster_id: "",
  cluster_village_id: "",
  cluster_name: "",
  latitude: null as number | null,
  longitude: null as number | null,
  farmer_photo_uri: null as string | null,
  farmer_photo_url: null as string | null,
  total_land_size: "",
  owned_land_size: "",
  leased_land_size: "",
  crop_name: (CROP_OPTIONS[0] || "Cotton") as string,
  crop_area: "",
  sowing_date: "",
  harvest_date: "",
  interested_in_biochar: false,
  prior_biochar_exp: false,
  prior_biochar_acreage: "",
};

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleSection}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, value && styles.toggleOn]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.toggleText, value && styles.toggleTextOn]}>
            Yes
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, !value && styles.toggleOn]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.toggleText, !value && styles.toggleTextOn]}>
            No
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function NewFarmerOnboardingScreen({ navigation, route }) {
  const farmerId = route?.params?.farmerId as string | undefined;
  const isEdit = Boolean(farmerId);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [locating, setLocating] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [villages, setVillages] = useState<ClusterVillageRecord[]>([]);
  const [villagesLoading, setVillagesLoading] = useState(true);
  const [existingCrops, setExistingCrops] = useState<FarmerCrop[]>([]);
  const {
    value: form,
    setValue: setForm,
    hydrated,
    restoredFromDraft,
    clearDraft,
  } = usePersistedForm(farmerId ? `edit-farmer:${farmerId}` : "new-farmer", EMPTY_FORM);

  function setField(key: string, value: string | number | boolean | null) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    let cancelled = false;
    loadClusterVillages()
      .then((options) => {
        if (!cancelled) setVillages(options);
      })
      .catch(() => {
        if (!cancelled) setVillages([]);
      })
      .finally(() => {
        if (!cancelled) setVillagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!farmerId || !hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        if (await isFarmerSyncing(farmerId)) {
          Alert.alert(
            "Sync in progress",
            "This farmer is currently syncing. You can edit after sync completes.",
            [{ text: "OK", onPress: () => navigation.goBack() }],
          );
          return;
        }
        const farmer = farmerToFormData(await getFarmerByIdLocal(farmerId));
        if (cancelled) return;
        const crops = Array.isArray(farmer.crops) ? farmer.crops : [];
        setExistingCrops(crops);
        if (restoredFromDraft) return;
        const first = crops[0];
        setForm((prev) => ({
          ...prev,
          farmer_name: farmer.farmer_name ?? "",
          father_spouse_name: farmer.father_spouse_name ?? "",
          agri_id: farmer.agri_id ?? "",
          mobile_number: farmer.mobile_number ?? "",
          address: farmer.address ?? "",
          village: farmer.village ?? "",
          mandal: farmer.mandal ?? "",
          district: farmer.district ?? "",
          state: farmer.state ?? "",
          cluster_id: farmer.cluster_id ?? "",
          cluster_village_id: farmer.cluster_village_id ?? "",
          cluster_name: farmer.cluster_name ?? "",
          latitude: farmer.latitude != null ? Number(farmer.latitude) : null,
          longitude: farmer.longitude != null ? Number(farmer.longitude) : null,
          farmer_photo_uri: farmer.farmer_photo_uri ?? null,
          farmer_photo_url: farmer.farmer_photo_url ?? null,
          total_land_size: farmer.total_land_size
            ? String(farmer.total_land_size)
            : "",
          owned_land_size: farmer.owned_land_size
            ? String(farmer.owned_land_size)
            : "",
          leased_land_size: farmer.leased_land_size
            ? String(farmer.leased_land_size)
            : "",
          crop_name: first?.crop_name || prev.crop_name,
          crop_area: first?.crop_area ? String(first.crop_area) : "",
          sowing_date: first?.sowing_date || "",
          harvest_date: first?.harvest_date || "",
          interested_in_biochar: Boolean(farmer.interested_in_biochar),
          prior_biochar_exp: Boolean(farmer.prior_biochar_exp),
          prior_biochar_acreage: farmer.prior_biochar_acreage
            ? String(farmer.prior_biochar_acreage)
            : "",
        }));
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : String(err), [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmerId, navigation, hydrated, restoredFromDraft, setForm]);

  async function captureGps() {
    try {
      setLocating(true);
      await startLocationCache();
      const loc = await getCurrentFarmLocation();
      if (!loc) {
        Alert.alert("Location", "Could not get GPS. Try again or pick on map.");
        return;
      }
      setForm((prev) => ({
        ...prev,
        latitude: loc.latitude,
        longitude: loc.longitude,
        address: loc.address || prev.address,
      }));
    } catch (err) {
      Alert.alert("Location", err instanceof Error ? err.message : String(err));
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!form.farmer_name.trim()) {
      Alert.alert("Required", "Full name is required.");
      return;
    }
    if (!form.mobile_number.trim()) {
      Alert.alert("Required", "Mobile number is required.");
      return;
    }
    if (!form.address.trim()) {
      Alert.alert("Required", "Postal address is required.");
      return;
    }
    if (!form.cluster_village_id.trim() || !form.village.trim()) {
      Alert.alert("Required", "Select a village from your cluster.");
      return;
    }
    if (!isEdit && !form.farmer_photo_uri && !form.farmer_photo_url) {
      Alert.alert("Required", "Take a farmer photo.");
      return;
    }
    if (
      form.latitude == null ||
      form.longitude == null ||
      !Number.isFinite(Number(form.latitude)) ||
      !Number.isFinite(Number(form.longitude))
    ) {
      Alert.alert(
        "Required",
        "Capture the meeting location with GPS or pick it on the map.",
      );
      return;
    }
    if (form.prior_biochar_exp) {
      const acres = Number(form.prior_biochar_acreage);
      if (!form.prior_biochar_acreage.trim() || !Number.isFinite(acres) || acres <= 0) {
        Alert.alert(
          "Required",
          "Enter prior biochar area in acres when experience is Yes.",
        );
        return;
      }
    }
    if (!isHarvestAfterSowing(form.sowing_date, form.harvest_date)) {
      Alert.alert(
        "Crop dates",
        "Harvest date must be after the sowing date.",
      );
      return;
    }

    try {
      setLoading(true);
      const user = await getStoredAuthUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in.");
        return;
      }

      const owned = Number(form.owned_land_size) || 0;
      const leased = Number(form.leased_land_size) || 0;
      const total = Number(form.total_land_size) || owned + leased || 0;
      const cropArea = Number(form.crop_area) || 0;
      if (cropArea > 0 && total > 0 && cropArea > total + 0.0001) {
        Alert.alert(
          "Crop area",
          "Major crop area cannot exceed total cultivated land.",
        );
        return;
      }

      const majorCrop: FarmerCrop | null =
        form.crop_name && cropArea > 0
          ? {
              crop_name: form.crop_name,
              crop_area: cropArea,
              sowing_date: form.sowing_date,
              harvest_date: form.harvest_date,
            }
          : null;
      const extraCrops = existingCrops.slice(1);
      const crops = majorCrop ? [majorCrop, ...extraCrops] : extraCrops;

      const savedId = await saveFarmerLocal(
        {
          farmer_name: form.farmer_name,
          father_spouse_name: form.father_spouse_name,
          agri_id: form.agri_id,
          mobile_number: form.mobile_number,
          address: form.address,
          village: form.village,
          mandal: form.mandal,
          district: form.district,
          state: form.state,
          cluster_id: form.cluster_id,
          cluster_village_id: form.cluster_village_id,
          cluster_name: form.cluster_name,
          latitude: form.latitude ?? 0,
          longitude: form.longitude ?? 0,
          farmer_photo_uri: form.farmer_photo_uri,
          farmer_photo_url: form.farmer_photo_url,
          total_land_size: total,
          owned_land_size: form.owned_land_size,
          leased_land_size: form.leased_land_size,
          crops,
          interested_in_biochar: form.interested_in_biochar,
          prior_biochar_exp: form.prior_biochar_exp,
          prior_biochar_acreage: form.prior_biochar_acreage,
        },
        user.id,
        farmerId ?? null,
      );

      processSyncQueue();
      await clearDraft();

      Alert.alert(
        isEdit ? "Farmer updated" : "Farmer saved",
        isEdit
          ? "Changes saved. Will sync when online."
          : "Use Farms onboarding, Soil testing, or Consent next — pick this farmer from the dropdown.",
        isEdit
          ? [{ text: "OK", onPress: () => navigation.goBack() }]
          : [
              {
                text: "All Farmers",
                onPress: () =>
                  navigation.navigate("FarmerDashboard", {
                    listMode: "all",
                    title: "All Farmers",
                  }),
              },
              {
                text: "Done",
                onPress: () => navigation.navigate("FarmersNetwork"),
              },
              {
                text: "View",
                onPress: () =>
                  navigation.navigate("FarmerDetail", { farmerId: savedId }),
              },
            ],
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (fetching || !hydrated) {
    return <ScreenShell />;
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{isEdit ? "Edit Farmer" : "New Farmer"}</Text>
        <Text style={styles.subtitle}>
          Profile, land, and major crop. Farms and soil are separate.
        </Text>

        <Text style={styles.section}>Farmer profile</Text>
        <FormInput
          label="Full name *"
          value={form.farmer_name}
          onChangeText={(t) => setField("farmer_name", t)}
        />
        <FarmerPhotoField
          required={!isEdit}
          uri={form.farmer_photo_uri || form.farmer_photo_url}
          onChange={(uri) =>
            setForm((prev) => ({
              ...prev,
              farmer_photo_uri: uri,
              farmer_photo_url: uri ? prev.farmer_photo_url : null,
            }))
          }
        />
        <FormInput
          label="Father's / spouse's name"
          value={form.father_spouse_name}
          onChangeText={(t) => setField("father_spouse_name", t)}
        />
        <FormInput
          label="Kisan Pehchan / Government Farmer ID (Agri ID)"
          value={form.agri_id}
          onChangeText={(t) => setField("agri_id", t)}
          placeholder="Optional"
        />
        <FormInput
          label="Mobile number *"
          value={form.mobile_number}
          onChangeText={(t) => setField("mobile_number", t)}
          keyboardType="phone-pad"
        />
        <FormInput
          label="Postal address *"
          value={form.address}
          onChangeText={(t) => setField("address", t)}
          multiline
        />
        <VillagePicker
          villages={villages}
          valueId={form.cluster_village_id}
          loading={villagesLoading}
          emptyText="No cluster villages assigned yet. Ask an admin to add you to a cluster."
          onChange={(village) => {
            setForm((prev) => ({
              ...prev,
              cluster_village_id: village.id,
              cluster_id: village.cluster_id,
              cluster_name: village.cluster_name,
              village: village.village_name,
              mandal: village.mandal ?? "",
              district: village.district ?? "",
              state: village.state ?? "",
            }));
          }}
        />

        <Text style={styles.section}>Land summary</Text>
        <FormInput
          label="Total cultivated land (acres)"
          value={form.total_land_size}
          onChangeText={(t) => setField("total_land_size", t)}
          keyboardType="decimal-pad"
        />
        <FormInput
          label="Owned (acres)"
          value={form.owned_land_size}
          onChangeText={(t) => setField("owned_land_size", t)}
          keyboardType="decimal-pad"
        />
        <FormInput
          label="Leased (acres)"
          value={form.leased_land_size}
          onChangeText={(t) => setField("leased_land_size", t)}
          keyboardType="decimal-pad"
        />

        <Text style={styles.section}>Major crop</Text>
        <FormPicker
          label="Major crop"
          value={form.crop_name}
          options={CROP_OPTIONS.map((crop) => ({ value: crop, label: crop }))}
          onValueChange={(v) => setField("crop_name", v)}
        />
        <FormInput
          label="Crop area (acres)"
          value={form.crop_area}
          onChangeText={(t) => setField("crop_area", t)}
          keyboardType="decimal-pad"
        />
        <FormDateField
          label="Estimated sowing date"
          value={form.sowing_date}
          onChange={(t) =>
            setForm((prev) => ({
              ...prev,
              sowing_date: t,
              harvest_date:
                prev.harvest_date && prev.harvest_date <= t
                  ? ""
                  : prev.harvest_date,
            }))
          }
          maximumDate={form.harvest_date || undefined}
        />
        <FormDateField
          label="Estimated harvest date"
          value={form.harvest_date}
          onChange={(t) => setField("harvest_date", t)}
          afterDate={form.sowing_date || undefined}
          error={
            form.sowing_date &&
            form.harvest_date &&
            !isHarvestAfterSowing(form.sowing_date, form.harvest_date)
              ? "Harvest date must be after sowing date."
              : undefined
          }
        />

        <Text style={styles.section}>Biochar</Text>
        <ToggleRow
          label="Farmer interested in biochar *"
          value={form.interested_in_biochar}
          onChange={(value) => setField("interested_in_biochar", value)}
        />
        <ToggleRow
          label="Prior biochar experience *"
          value={form.prior_biochar_exp}
          onChange={(value) => {
            setForm((prev) => ({
              ...prev,
              prior_biochar_exp: value,
              prior_biochar_acreage: value ? prev.prior_biochar_acreage : "",
            }));
          }}
        />
        {form.prior_biochar_exp ? (
          <FormInput
            label="Prior biochar area (acres) *"
            value={form.prior_biochar_acreage}
            onChangeText={(t) => setField("prior_biochar_acreage", t)}
            keyboardType="decimal-pad"
            placeholder="How many acres"
          />
        ) : null}

        <Text style={styles.section}>Location *</Text>
        <View style={styles.locRow}>
          <Pressable style={styles.locBtn} onPress={captureGps}>
            <Text style={styles.locBtnText}>
              {locating ? "Getting GPS…" : "Use current GPS"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.locBtn}
            onPress={async () => {
              const canOpen = await openMapPickerIfOnline(() => {
                Alert.alert(
                  "Map unavailable",
                  "Map picker needs internet. Use GPS instead.",
                );
              });
              if (canOpen) setMapOpen(true);
            }}
          >
            <Text style={styles.locBtnText}>Pick on map</Text>
          </Pressable>
        </View>
        {form.latitude != null && form.longitude != null ? (
          <Text style={styles.coords}>
            {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)}
          </Text>
        ) : (
          <Text style={styles.hint}>
            Location is required. Use current GPS or pick a point on the map.
          </Text>
        )}

        <PrimaryButton
          title={isEdit ? "Save changes" : "Save farmer"}
          onPress={handleSave}
          loading={loading}
        />
      </ScrollView>

      <LocationPickerModal
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        initialLatitude={form.latitude}
        initialLongitude={form.longitude}
        onConfirm={(loc) => {
          setForm((prev) => ({
            ...prev,
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address || prev.address,
          }));
          setMapOpen(false);
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.brunswick,
  },
  locRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  locBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.chalk,
  },
  locBtnText: {
    fontFamily: fonts.medium,
    color: colors.brunswick,
    fontSize: 13,
  },
  coords: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    fontSize: 13,
  },
  hint: {
    fontFamily: fonts.regular,
    color: colors.smoke,
    fontSize: 12,
  },
  toggleSection: {
    marginBottom: spacing.sm,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOn: {
    backgroundColor: colors.brunswick,
  },
  toggleText: {
    color: colors.brunswick,
    fontFamily: fonts.medium,
  },
  toggleTextOn: {
    color: colors.white,
  },
});
