import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform
} from "react-native";
import { WebView } from "react-native-webview";
import NetInfo from "@react-native-community/netinfo";
import PrimaryButton from "./PrimaryButton";
import { getInitialMapCoordinate } from "../utils/location";
import {
  buildMapboxPickerHtml,
  getMapboxToken,
  mapboxReverseGeocode
} from "../utils/mapbox";
import { colors, fonts, spacing, radius } from "../constants/theme";

export default function LocationPickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  onClose,
  onConfirm
}) {
  const mapboxToken = getMapboxToken();
  const [pin, setPin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setMapReady(false);
      setMapError("");

      const coord = await getInitialMapCoordinate(
        initialLatitude,
        initialLongitude
      );

      if (cancelled) return;

      setPin(coord);
      setManualLat(String(coord.latitude));
      setManualLng(String(coord.longitude));
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [visible, initialLatitude, initialLongitude]);

  const mapHtml = useMemo(() => {
    if (!pin || !mapboxToken) return null;

    return buildMapboxPickerHtml({
      token: mapboxToken,
      latitude: pin.latitude,
      longitude: pin.longitude
    });
  }, [pin?.latitude, pin?.longitude, mapboxToken]);

  function handleWebViewMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "pin") {
        setPin({
          latitude: data.latitude,
          longitude: data.longitude
        });
        setManualLat(String(data.latitude));
        setManualLng(String(data.longitude));
      }

      if (data.type === "ready") {
        setMapReady(true);
        setMapError("");
      }

      if (data.type === "error") {
        setMapError(data.message || "Map failed to load.");
      }
    } catch {
      // ignore malformed messages
    }
  }

  function applyManualCoordinates() {
    const latitude = Number(manualLat);
    const longitude = Number(manualLng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMapError("Enter valid latitude and longitude values.");
      return;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setMapError("Latitude must be -90 to 90 and longitude -180 to 180.");
      return;
    }

    setMapError("");
    setPin({ latitude, longitude });
  }

  async function handleConfirm() {
    if (!pin) return;

    try {
      setConfirming(true);
      const address = await mapboxReverseGeocode(pin.latitude, pin.longitude);
      onConfirm({
        latitude: pin.latitude,
        longitude: pin.longitude,
        address
      });
      onClose();
    } catch (err) {
      onConfirm({
        latitude: pin.latitude,
        longitude: pin.longitude,
        address: `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}`
      });
      onClose();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick farm location</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.hint}>
          Tap the map or drag the pin. Requires internet and your Mapbox token.
        </Text>

        {!mapboxToken ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Mapbox token missing. Add mapboxToken under extra in app.json.
            </Text>
          </View>
        ) : loading || !pin || !mapHtml ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.brunswick} />
          </View>
        ) : (
          <View style={styles.mapWrap}>
            <WebView
              key={`${pin.latitude.toFixed(5)}-${pin.longitude.toFixed(5)}`}
              source={{ html: mapHtml }}
              style={styles.map}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              onMessage={handleWebViewMessage}
              onError={() => setMapError("Could not load the map.")}
            />
            {!mapReady ? (
              <View style={styles.mapOverlay}>
                <ActivityIndicator size="large" color={colors.brunswick} />
              </View>
            ) : null}
          </View>
        )}

        {mapError ? (
          <Text style={styles.inlineError}>{mapError}</Text>
        ) : null}

        {pin ? (
          <View style={styles.coordsBar}>
            <Text style={styles.coordsText}>
              {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.manualToggle}
          onPress={() => setShowManual((prev) => !prev)}
        >
          <Text style={styles.manualToggleText}>
            {showManual ? "Hide manual entry" : "Enter lat / long manually"}
          </Text>
        </TouchableOpacity>

        {showManual ? (
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={manualLat}
              onChangeText={setManualLat}
              placeholder="Latitude"
              placeholderTextColor={colors.smokeLight}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.manualInput}
              value={manualLng}
              onChangeText={setManualLng}
              placeholder="Longitude"
              placeholderTextColor={colors.smokeLight}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.manualApply} onPress={applyManualCoordinates}>
              <Text style={styles.manualApplyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.footer}>
          <PrimaryButton
            title={confirming ? "Saving location..." : "Use this location"}
            onPress={handleConfirm}
            loading={confirming}
            disabled={!pin}
            variant="accent"
          />
        </View>
      </View>
    </Modal>
  );
}

export async function openMapPickerIfOnline(onOffline) {
  const net = await NetInfo.fetch();
  const online =
    net.isConnected && net.isInternetReachable !== false;

  if (!online) {
    onOffline?.();
    return false;
  }

  if (!getMapboxToken()) {
    onOffline?.();
    return false;
  }

  return true;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
    paddingTop: Platform.OS === "android" ? spacing.lg : spacing.sm
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm
  },
  closeText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
    minWidth: 48
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.brunswick
  },
  headerSpacer: {
    minWidth: 48
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    lineHeight: 18
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chalk
  },
  map: {
    flex: 1,
    backgroundColor: colors.chalk
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.65)"
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.errorBg
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.error,
    lineHeight: 18
  },
  inlineError: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.error
  },
  coordsBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.chalk,
    borderRadius: radius.sm
  },
  coordsText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
    textAlign: "center"
  },
  manualToggle: {
    alignSelf: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs
  },
  manualToggleText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs
  },
  manualInput: {
    flex: 1,
    backgroundColor: colors.chalk,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text
  },
  manualApply: {
    backgroundColor: colors.brunswick,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.sm
  },
  manualApplyText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.white
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl
  }
});
