import React, { useState } from "react";
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
import { getStoredAuthUser } from "../services/auth";
import { saveFarmerLocal } from "../services/farmerService";
import { processSyncQueue } from "../services/syncService";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import { CROP_OPTIONS } from "../constants/crops";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function NewFarmerOnboardingScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [form, setForm] = useState({
    farmer_name: "",
    father_spouse_name: "",
    agri_id: "",
    mobile_number: "",
    address: "",
    village: "",
    mandal: "",
    district: "",
    state: "",
    latitude: null as number | null,
    longitude: null as number | null,
    total_land_size: "",
    owned_land_size: "",
    leased_land_size: "",
    crop_name: (CROP_OPTIONS[0] || "Cotton") as string,
    crop_area: "",
    sowing_date: "",
    harvest_date: "",
  });

  function setField(key: string, value: string | number | null) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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
    if (!form.village.trim() || !form.district.trim() || !form.state.trim()) {
      Alert.alert("Required", "Village, district and state are required.");
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

      const crops =
        form.crop_name && cropArea > 0
          ? [
              {
                crop_name: form.crop_name,
                crop_area: cropArea,
                sowing_date: form.sowing_date,
                harvest_date: form.harvest_date,
              },
            ]
          : [];

      const farmerId = await saveFarmerLocal(
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
          latitude: form.latitude ?? 0,
          longitude: form.longitude ?? 0,
          total_land_size: total,
          owned_land_size: form.owned_land_size,
          leased_land_size: form.leased_land_size,
          crops,
          interested_in_biochar: false,
          prior_biochar_exp: false,
          prior_biochar_acreage: "",
        },
        user.id,
      );

      processSyncQueue();

      Alert.alert(
        "Farmer saved",
        "Use Farms onboarding, Soil testing, or Consent next — pick this farmer from the dropdown.",
        [
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
            onPress: () => navigation.navigate("FarmerDetail", { farmerId }),
          },
        ],
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>New Farmer</Text>
        <Text style={styles.subtitle}>
          Farmer info only (no Aadhaar). Add cultivated land and the major crop here. Fields, soil and consent are separate modules.
        </Text>

        <Text style={styles.section}>Farmer profile</Text>
        <FormInput
          label="Full name *"
          value={form.farmer_name}
          onChangeText={(t) => setField("farmer_name", t)}
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
        <FormInput
          label="Village *"
          value={form.village}
          onChangeText={(t) => setField("village", t)}
        />
        <FormInput
          label="Mandal / block"
          value={form.mandal}
          onChangeText={(t) => setField("mandal", t)}
        />
        <FormInput
          label="District *"
          value={form.district}
          onChangeText={(t) => setField("district", t)}
        />
        <FormInput
          label="State *"
          value={form.state}
          onChangeText={(t) => setField("state", t)}
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
          onChange={(t) => setField("sowing_date", t)}
        />
        <FormDateField
          label="Estimated harvest date"
          value={form.harvest_date}
          onChange={(t) => setField("harvest_date", t)}
        />

        <Text style={styles.section}>Location</Text>
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
          <Text style={styles.hint}>GPS optional for profile; capture it on fields when needed.</Text>
        )}

        <PrimaryButton
          title="Save farmer"
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
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginBottom: spacing.sm,
    lineHeight: 20,
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
});
