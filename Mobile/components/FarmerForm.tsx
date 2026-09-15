import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import FormInput from "./FormInput";
import FormPicker from "./FormPicker";
import PrimaryButton from "./PrimaryButton";
import LocationPickerModal, {
  openMapPickerIfOnline
} from "./LocationPickerModal";
import { CROP_OPTIONS, CROP_BIOMASS_RATES } from "../constants/crops";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { calculateEstimatedBiomass } from "../utils/biomass";
import { getCurrentFarmLocation } from "../utils/location";
import { startLocationCache } from "../services/locationCache";
import { validateFarmerForm } from "../utils/validation";

const OTHER_CROP = "Other";

const EMPTY_FORM = {
  farmer_name: "",
  mobile_number: "",
  latitude: null,
  longitude: null,
  address: "",
  total_land_size: "",
  crops: [],
  interested_in_biochar: false,
  prior_biochar_exp: false,
  prior_biochar_acreage: ""
};

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

const CROP_PICKER_OPTIONS = CROP_OPTIONS.map((crop) => ({
  value: crop,
  label: crop,
  hint:
    crop === OTHER_CROP
      ? "Custom crop & rate"
      : `~${CROP_BIOMASS_RATES[crop]} tonnes/acre`
}));

function totalCropArea(crops) {
  return crops.reduce((sum, crop) => sum + Number(crop.crop_area || 0), 0);
}

function ToggleRow({
  label,
  value,
  onChange,
  pressedStyle = styles.surfacePressed
}) {
  return (
    <View style={styles.toggleSection}>
      <Text style={styles.section}>{label}</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={({ pressed }) => [
            styles.toggleButton,
            value && styles.activeToggle,
            pressed && !value && pressedStyle
          ]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.toggleText, value && styles.activeToggleText]}>
            Yes
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.toggleButton,
            !value && styles.activeToggle,
            pressed && value && pressedStyle
          ]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.toggleText, !value && styles.activeToggleText]}>
            No
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function FarmerForm({
  title,
  mode = "create",
  initialData = null,
  onSubmit,
  submitLabel = "Save Farmer",
  loading = false,
  useChalkHighlight = true
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initialData });
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);

  const [cropPicker, setCropPicker] = useState<string>(CROP_OPTIONS[0]);
  const [cropOtherName, setCropOtherName] = useState("");
  const [cropOtherRate, setCropOtherRate] = useState("");
  const [cropArea, setCropArea] = useState("");
  const [sowingDate, setSowingDate] = useState(new Date());
  const [harvestDate, setHarvestDate] = useState(new Date());
  const [showSowingPicker, setShowSowingPicker] = useState(false);
  const [showHarvestPicker, setShowHarvestPicker] = useState(false);
  const pressedStyle = useChalkHighlight
    ? styles.surfacePressed
    : styles.surfacePressedNeutral;

  useEffect(() => {
    if (mode === "edit" && initialData) {
      setForm({ ...EMPTY_FORM, ...initialData });
    }
  }, [mode, initialData?.id]);

  async function captureLocation() {
    try {
      setLocationLoading(true);
      const loc = await getCurrentFarmLocation();
      void startLocationCache();
      setForm((prev) => ({
        ...prev,
        latitude: loc.latitude,
        longitude: loc.longitude,
        address: loc.address
      }));
    } catch (err) {
      Alert.alert("Location Error", err.message);
    } finally {
      setLocationLoading(false);
    }
  }

  async function openMapPicker() {
    const canOpen = await openMapPickerIfOnline(() => {
      Alert.alert(
        "Map unavailable",
        "Map picker needs internet and a Mapbox token. Use GPS instead, or enter coordinates manually in the map screen."
      );
    });

    if (canOpen) {
      setMapVisible(true);
    }
  }

  function applyLocation(location) {
    setForm((prev) => ({
      ...prev,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address
    }));
  }

  function currentCropRate() {
    if (cropPicker === OTHER_CROP) {
      return Number(cropOtherRate);
    }
    return CROP_BIOMASS_RATES[cropPicker];
  }

  function resetCropInputs() {
    setCropOtherName("");
    setCropOtherRate("");
    setCropArea("");
    setCropPicker(CROP_OPTIONS[0]);
    setSowingDate(new Date());
    setHarvestDate(new Date());
  }

  function addCrop() {
    const cropName =
      cropPicker === OTHER_CROP ? cropOtherName.trim() : cropPicker;

    if (!cropName || !cropArea) {
      Alert.alert("Crop", "Enter crop name and area.");
      return;
    }

    const areaNum = Number(cropArea);
    if (isNaN(areaNum) || areaNum <= 0) {
      Alert.alert("Crop", "Enter a valid crop area.");
      return;
    }

    const totalLandSize = Number(form.total_land_size);
    if (!form.total_land_size || isNaN(totalLandSize) || totalLandSize <= 0) {
      Alert.alert("Crop", "Enter the total land size before adding crops.");
      return;
    }

    const areaSoFar = totalCropArea(form.crops);
    if (areaSoFar + areaNum > totalLandSize) {
      Alert.alert(
        "Crop area too large",
        `Total crop area (${areaSoFar + areaNum} acres) cannot exceed the total land size (${totalLandSize} acres). You have ${Math.max(totalLandSize - areaSoFar, 0)} acres left to allocate.`
      );
      return;
    }

    const biomassRate = currentCropRate();
    if (!biomassRate || isNaN(biomassRate) || biomassRate <= 0) {
      Alert.alert(
        "Crop",
        "Enter a valid guesstimated biomass (tonnes/acre) for this crop."
      );
      return;
    }

    setForm((prev) => ({
      ...prev,
      crops: [
        ...prev.crops,
        {
          crop_name: cropName,
          crop_area: Number(cropArea),
          sowing_date: formatDate(sowingDate),
          harvest_date: formatDate(harvestDate),
          biomass_rate: biomassRate
        }
      ]
    }));

    resetCropInputs();
  }

  function removeCrop(index) {
    setForm((prev) => ({
      ...prev,
      crops: prev.crops.filter((_, i) => i !== index)
    }));
  }

  function handleSubmit() {
    const errors = validateFarmerForm(form);
    if (errors.length) {
      Alert.alert("Missing fields", errors.join("\n"));
      return;
    }
    onSubmit(form);
  }

  const estimatedBiomass = calculateEstimatedBiomass(form.crops);

  const landAllocation = (() => {
    const total = Number(form.total_land_size) || 0;
    const allocated = totalCropArea(form.crops);
    const remaining = Math.max(total - allocated, 0);
    const percent = total > 0 ? Math.min((allocated / total) * 100, 100) : 0;
    return {
      total,
      allocated,
      remaining,
      percent,
      overAllocated: allocated > total
    };
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {title ? <Text style={styles.pageTitle}>{title}</Text> : null}

      <FormInput
        label="Farmer Name *"
        placeholder="Enter farmer name"
        value={form.farmer_name}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, farmer_name: text }))
        }
      />

      <FormInput
        label="Mobile Number"
        placeholder="Enter your 10-digit mobile number"
        value={form.mobile_number}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, mobile_number: text }))
        }
        keyboardType="phone-pad"
      />

      <Text style={styles.section}>Farm Location *</Text>
      <View style={styles.locationActions}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            styles.locationBtnLeft,
            pressed && pressedStyle
          ]}
          onPress={captureLocation}
          disabled={locationLoading}
        >
          <Text style={styles.secondaryBtnText}>
            {locationLoading ? "Getting GPS…" : "Use GPS"}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && pressedStyle
          ]}
          onPress={openMapPicker}
        >
          <Text style={styles.secondaryBtnText}>Pick on map</Text>
        </Pressable>
      </View>

      {form.latitude ? (
        <View style={styles.locationCard}>
          <Text style={styles.locationLine}>
            Lat: {Number(form.latitude).toFixed(6)}
          </Text>
          <Text style={styles.locationLine}>
            Lng: {Number(form.longitude).toFixed(6)}
          </Text>
          <Text style={styles.address}>{form.address}</Text>
        </View>
      ) : (
        <Text style={styles.locationHint}>
          Use GPS or pick a point on the map to set the farm location.
        </Text>
      )}

      <FormInput
        label="Total Land Size (Acres) *"
        placeholder="Total land in acres"
        value={form.total_land_size}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, total_land_size: text }))
        }
        keyboardType="numeric"
      />

      {landAllocation.total > 0 ? (
        <View style={styles.allocationWrap}>
          <View style={styles.allocationTrack}>
            <View
              style={[
                styles.allocationFill,
                landAllocation.overAllocated && styles.allocationFillOver,
                { width: `${landAllocation.percent}%` }
              ]}
            />
          </View>
          <Text
            style={[
              styles.allocationText,
              landAllocation.overAllocated && styles.allocationTextOver
            ]}
          >
            {landAllocation.allocated} of {landAllocation.total} acres
            allocated
            {landAllocation.overAllocated
              ? " · over the total land size"
              : ` · ${landAllocation.remaining} remaining`}
          </Text>
        </View>
      ) : null}

      <Text style={styles.section}>Crop Details *</Text>

      <View style={styles.cropEntryCard}>
        <Text style={styles.cropEntryTitle}>New crop</Text>

        <FormPicker
          label="Crop Name"
          value={cropPicker}
          options={CROP_PICKER_OPTIONS}
          onValueChange={(value) => {
            setCropPicker(value);
            setCropOtherName("");
            setCropOtherRate("");
          }}
        />

        {cropPicker === OTHER_CROP ? (
          <>
            <FormInput
              label="Crop Type"
              placeholder="Enter crop type"
              value={cropOtherName}
              onChangeText={setCropOtherName}
            />
            <FormInput
              label="Guesstimated Biomass (Tonnes/Acre)"
              placeholder="e.g. 1.2"
              value={cropOtherRate}
              onChangeText={setCropOtherRate}
              keyboardType="numeric"
            />
          </>
        ) : (
          <Text style={styles.fieldHint}>
            Guesstimated biomass: {CROP_BIOMASS_RATES[cropPicker]} tonnes/acre
          </Text>
        )}

        <FormInput
          label="Crop Area (Acres)"
          placeholder="Crop area"
          value={cropArea}
          onChangeText={setCropArea}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Estimated Sowing Date</Text>
        <Pressable
          style={({ pressed }) => [
            styles.dateButton,
            pressed && pressedStyle
          ]}
          onPress={() => setShowSowingPicker(true)}
        >
          <Text style={styles.dateText}>{formatDate(sowingDate)}</Text>
        </Pressable>
        {showSowingPicker && (
          <DateTimePicker
            value={sowingDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowSowingPicker(Platform.OS === "ios");
              if (date) setSowingDate(date);
            }}
          />
        )}

        <Text style={styles.label}>Estimated Harvest Date</Text>
        <Pressable
          style={({ pressed }) => [
            styles.dateButton,
            pressed && pressedStyle
          ]}
          onPress={() => setShowHarvestPicker(true)}
        >
          <Text style={styles.dateText}>{formatDate(harvestDate)}</Text>
        </Pressable>
        {showHarvestPicker && (
          <DateTimePicker
            value={harvestDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowHarvestPicker(Platform.OS === "ios");
              if (date) setHarvestDate(date);
            }}
          />
        )}

        <PrimaryButton
          title="Add This Crop to the List"
          onPress={addCrop}
          variant="accent"
        />
      </View>

      <View style={styles.addedCropsHeader}>
        <Text style={styles.addedCropsTitle}>Added Crops</Text>
        {form.crops.length ? (
          <View style={styles.addedCropsCount}>
            <Text style={styles.addedCropsCountText}>
              {form.crops.length}
            </Text>
          </View>
        ) : null}
      </View>

      {form.crops.length === 0 ? (
        <Text style={styles.emptyCropsHint}>
          No crops added yet. Fill in the details above and tap "Add This
          Crop to the List". You can add more than one crop.
        </Text>
      ) : (
        form.crops.map((crop, index) => (
          <View key={index} style={styles.cropCard}>
            <View style={styles.cropHeader}>
              <Text style={styles.cropName}>{crop.crop_name}</Text>
              <TouchableOpacity onPress={() => removeCrop(index)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cropMeta}>
              {crop.crop_area} Acres · {crop.biomass_rate} tonnes/acre
            </Text>
            <Text style={styles.cropMeta}>
              Sowing: {crop.sowing_date} · Harvest: {crop.harvest_date}
            </Text>
          </View>
        ))
      )}

      <ToggleRow
        label="Farmer Interested in Biochar *"
        value={form.interested_in_biochar}
        pressedStyle={pressedStyle}
        onChange={(val) =>
          setForm((prev) => ({ ...prev, interested_in_biochar: val }))
        }
      />

      <ToggleRow
        label="Prior Biochar Experience *"
        value={form.prior_biochar_exp}
        pressedStyle={pressedStyle}
        onChange={(val) =>
          setForm((prev) => ({
            ...prev,
            prior_biochar_exp: val,
            prior_biochar_acreage: val ? prev.prior_biochar_acreage : ""
          }))
        }
      />

      {form.prior_biochar_exp ? (
        <FormInput
          label="Prior Biochar Creation Area (Acres) *"
          placeholder="Area in acres"
          value={form.prior_biochar_acreage}
          onChangeText={(text) =>
            setForm((prev) => ({
              ...prev,
              prior_biochar_acreage: text
            }))
          }
          keyboardType="numeric"
        />
      ) : null}

      <View style={styles.biomassCard}>
        <Text style={styles.biomassLabel}>Estimated Biomass</Text>
        <Text style={styles.biomassValue}>
          {estimatedBiomass}
          <Text style={styles.biomassUnit}> Tons</Text>
        </Text>
        <Text style={styles.biomassHint}>
          Auto-calculated from each crop's area × its guesstimated biomass
          rate.
        </Text>
      </View>

      <PrimaryButton
        title={loading ? "Saving..." : submitLabel}
        onPress={handleSubmit}
        loading={loading}
      />

      <LocationPickerModal
        visible={mapVisible}
        initialLatitude={form.latitude}
        initialLongitude={form.longitude}
        onClose={() => setMapVisible(false)}
        onConfirm={applyLocation}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl
  },
  pageTitle: {
    fontSize: 24,
    marginBottom: spacing.lg,
    color: colors.brunswick,
    letterSpacing: -0.5,
    fontFamily: fonts.bold
  },
  section: {
    fontSize: 16,
    marginBottom: 10,
    marginTop: 4,
    color: colors.brunswick,
    fontFamily: fonts.bold
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    color: colors.textSecondary,
    fontFamily: fonts.medium
  },
  locationActions: {
    flexDirection: "row",
    marginBottom: spacing.sm
  },
  locationBtnLeft: {
    marginRight: spacing.sm
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  surfacePressed: {
    backgroundColor: colors.chalk
  },
  surfacePressedNeutral: {
    backgroundColor: colors.overlay
  },
  secondaryBtnText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick
  },
  locationHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    lineHeight: 18,
    marginBottom: spacing.md
  },
  locationCard: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  locationLine: {
    fontFamily: fonts.regular,
    color: colors.smoke,
    marginBottom: 4
  },
  address: {
    marginTop: 8,
    color: colors.smoke,
    lineHeight: 20,
    fontFamily: fonts.regular
  },
  dateButton: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  dateText: {
    fontFamily: fonts.regular,
    color: colors.text
  },
  cropCard: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.chartreuse
  },
  cropHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cropName: {
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.brunswick
  },
  removeText: {
    color: colors.error,
    fontFamily: fonts.medium,
    fontSize: 13
  },
  cropMeta: {
    color: colors.smoke,
    fontFamily: fonts.regular,
    marginTop: 4
  },
  toggleSection: {
    marginBottom: 8
  },
  toggleRow: {
    flexDirection: "row",
    marginBottom: spacing.md
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  activeToggle: {
    backgroundColor: colors.brunswick
  },
  toggleText: {
    color: colors.brunswick,
    fontFamily: fonts.medium
  },
  activeToggleText: {
    color: colors.white
  },
  fieldHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke,
    marginTop: -8,
    marginBottom: spacing.md
  },
  cropEntryCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  cropEntryTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.brunswick,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  addedCropsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.sm
  },
  addedCropsTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick
  },
  addedCropsCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.chartreuse,
    alignItems: "center",
    justifyContent: "center"
  },
  addedCropsCountText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brunswick
  },
  allocationWrap: {
    marginTop: -8,
    marginBottom: spacing.md
  },
  allocationTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
    marginBottom: 6
  },
  allocationFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.chartreuse
  },
  allocationFillOver: {
    backgroundColor: colors.error
  },
  allocationText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.smoke
  },
  allocationTextOver: {
    color: colors.error,
    fontFamily: fonts.medium
  },
  emptyCropsHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    lineHeight: 18,
    marginBottom: spacing.md
  },
  biomassCard: {
    backgroundColor: colors.brunswick,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg
  },
  biomassLabel: {
    color: colors.chartreuseMuted,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: fonts.regular
  },
  biomassValue: {
    color: colors.chartreuse,
    fontSize: 28,
    fontFamily: fonts.bold
  },
  biomassUnit: {
    color: colors.white,
    fontSize: 16,
    fontFamily: fonts.medium
  },
  biomassHint: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 8,
    fontFamily: fonts.regular
  }
});
