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
import { Picker } from "@react-native-picker/picker";

import FormInput from "./FormInput";
import PrimaryButton from "./PrimaryButton";
import LocationPickerModal, {
  openMapPickerIfOnline
} from "./LocationPickerModal";
import { CROP_OPTIONS } from "../constants/crops";
import { colors, fonts, spacing, radius } from "../constants/theme";
import { calculateEstimatedBiomass } from "../utils/biomass";
import { getCurrentFarmLocation } from "../utils/location";
import { validateFarmerForm } from "../utils/validation";
import {
  pickConsentDocument,
  pickConsentImageFromCamera,
  pickConsentImageFromGallery
} from "../services/permissions";

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
  prior_biochar_acreage: "",
  consent_document_url: "",
  consent_local_uri: "",
  consent_file_name: ""
};

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

function getConsentDisplayName(form) {
  if (form.consent_file_name?.trim()) {
    return form.consent_file_name.trim();
  }

  const source = form.consent_local_uri || form.consent_document_url;
  if (!source) return "Consent file";

  const fileName = source.split("/").pop()?.split("?")[0];
  return fileName ? decodeURIComponent(fileName) : "Consent file";
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
  initialData,
  onSubmit,
  submitLabel = "Save Farmer",
  loading = false,
  useChalkHighlight = true
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initialData });
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);

  const [cropPicker, setCropPicker] = useState(CROP_OPTIONS[0]);
  const [cropOtherName, setCropOtherName] = useState("");
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

  function addCrop() {
    const cropName =
      cropPicker === "Other"
        ? cropOtherName.trim()
        : cropPicker;

    if (!cropName || !cropArea) {
      Alert.alert("Crop", "Enter crop name and area.");
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
          harvest_date: formatDate(harvestDate)
        }
      ]
    }));

    setCropOtherName("");
    setCropArea("");
    setCropPicker(CROP_OPTIONS[0]);
  }

  function removeCrop(index) {
    setForm((prev) => ({
      ...prev,
      crops: prev.crops.filter((_, i) => i !== index)
    }));
  }

  function showConsentOptions() {
    Alert.alert("Consent Document", "Choose upload method (optional)", [
      {
        text: "Take Photo",
        onPress: async () => {
          const asset = await pickConsentImageFromCamera();
          if (asset) {
            setForm((prev) => ({
              ...prev,
              consent_local_uri: asset.uri,
              consent_document_url: "",
              consent_file_name: asset.fileName || "Camera photo.jpg"
            }));
          }
        }
      },
      {
        text: "Choose Image",
        onPress: async () => {
          const asset = await pickConsentImageFromGallery();
          if (asset) {
            setForm((prev) => ({
              ...prev,
              consent_local_uri: asset.uri,
              consent_document_url: "",
              consent_file_name: asset.fileName || "Gallery image.jpg"
            }));
          }
        }
      },
      {
        text: "Choose File (PDF/Image)",
        onPress: async () => {
          const result = await pickConsentDocument();
          if (!result.canceled && result.assets?.[0]) {
            const file = result.assets[0];
            setForm((prev) => ({
              ...prev,
              consent_local_uri: file.uri,
              consent_document_url: "",
              consent_file_name: file.name || "Document"
            }));
          }
        }
      },
      { text: "Cancel", style: "cancel" }
    ]);
  }

  function removeConsent() {
    setForm((prev) => ({
      ...prev,
      consent_local_uri: "",
      consent_document_url: "",
      consent_file_name: ""
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
  const hasConsent = !!(form.consent_local_uri || form.consent_document_url);

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
        label="Mobile Number *"
        placeholder="10-digit mobile number"
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

      <Text style={styles.section}>Crop Details *</Text>

      <Text style={styles.label}>Crop Name</Text>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={cropPicker}
          onValueChange={setCropPicker}
          style={styles.picker}
        >
          {CROP_OPTIONS.map((crop) => (
            <Picker.Item key={crop} label={crop} value={crop} />
          ))}
        </Picker>
      </View>

      {cropPicker === "Other" ? (
        <FormInput
          placeholder="Enter crop name"
          value={cropOtherName}
          onChangeText={setCropOtherName}
        />
      ) : null}

      <FormInput
        placeholder="Crop Area (Acres)"
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

      <View style={styles.addCropWrap}>
        <PrimaryButton title="+ Add Crop" onPress={addCrop} variant="outline" />
      </View>

      {form.crops.map((crop, index) => (
        <View key={index} style={styles.cropCard}>
          <View style={styles.cropHeader}>
            <Text style={styles.cropName}>{crop.crop_name}</Text>
            <TouchableOpacity onPress={() => removeCrop(index)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cropMeta}>{crop.crop_area} Acres</Text>
          <Text style={styles.cropMeta}>
            Sowing: {crop.sowing_date} · Harvest: {crop.harvest_date}
          </Text>
        </View>
      ))}

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

      <Text style={styles.section}>Consent Form (Optional)</Text>
      {hasConsent ? (
        <View style={styles.consentAttached}>
          <View style={styles.consentFileRow}>
            <Text style={styles.consentFileName} numberOfLines={1}>
              {getConsentDisplayName(form)}
            </Text>
            <TouchableOpacity
              style={styles.consentRemoveBtn}
              onPress={removeConsent}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Remove consent file"
            >
              <Text style={styles.consentRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.consentReplaceBtn}
            onPress={showConsentOptions}
            activeOpacity={0.85}
          >
            <Text style={styles.consentReplaceText}>Upload again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.uploadCard,
            pressed && pressedStyle
          ]}
          onPress={showConsentOptions}
        >
          <Text style={styles.uploadText}>Upload image, photo, or PDF</Text>
        </Pressable>
      )}

      <View style={styles.biomassCard}>
        <Text style={styles.biomassLabel}>Estimated Biomass</Text>
        <Text style={styles.biomassValue}>{estimatedBiomass} Tons</Text>
        <Text style={styles.biomassHint}>
          Auto-calculated from crop areas (×2 tons/acre)
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
  pickerWrap: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden"
  },
  picker: {
    height: Platform.OS === "ios" ? 180 : 50
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
  addCropWrap: {
    marginBottom: spacing.md
  },
  cropCard: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
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
  uploadCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center"
  },
  uploadText: {
    color: colors.brunswick,
    fontFamily: fonts.medium,
    textAlign: "center"
  },
  consentAttached: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  consentFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  consentFileName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick
  },
  consentRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: "center",
    justifyContent: "center"
  },
  consentRemoveText: {
    fontSize: 20,
    lineHeight: 22,
    color: colors.error,
    fontFamily: fonts.medium,
    marginTop: -1
  },
  consentReplaceBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.sm
  },
  consentReplaceText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick
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
    color: colors.white,
    fontSize: 28,
    fontFamily: fonts.bold
  },
  biomassHint: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 8,
    fontFamily: fonts.regular
  }
});
