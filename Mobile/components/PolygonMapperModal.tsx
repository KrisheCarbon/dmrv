import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import type { GeoPoint } from "@krishecarbon/shared";
import PrimaryButton from "./PrimaryButton";
import MapMyLocationButton from "./MapMyLocationButton";
import {
  getInitialMapCoordinate,
  readDeviceCoordinate,
  type MapOpenCoordinate,
} from "../utils/location";
import {
  buildMapboxPolygonHtml,
  getMapboxToken,
  userLocationUpdateScript,
} from "../utils/mapbox";
import { useLiveUserDot } from "../utils/useLiveUserDot";
import { colors, fonts, spacing, radius } from "../constants/theme";

type Props = {
  visible: boolean;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialPoints: GeoPoint[];
  onClose: () => void;
  onConfirm: (points: GeoPoint[]) => void;
};

export default function PolygonMapperModal({
  visible,
  initialLatitude,
  initialLongitude,
  initialPoints,
  onClose,
  onConfirm,
}: Props) {
  const mapboxToken = getMapboxToken();
  const webViewRef = useRef<WebView>(null);
  const openSnapshot = useRef({
    latitude: initialLatitude,
    longitude: initialLongitude,
    points: initialPoints,
  });
  openSnapshot.current = {
    latitude: initialLatitude,
    longitude: initialLongitude,
    points: initialPoints,
  };
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [locatingUser, setLocatingUser] = useState(false);
  const [center, setCenter] = useState<MapOpenCoordinate | null>(null);
  const [seedPoints, setSeedPoints] = useState<GeoPoint[]>([]);
  const [points, setPoints] = useState<GeoPoint[]>([]);

  useEffect(() => {
    if (!visible) {
      setLoading(true);
      setMapReady(false);
      setMapError("");
      setLocationNote("");
      setCenter(null);
      return;
    }

    let cancelled = false;
    const snapshot = openSnapshot.current;

    async function init() {
      setLoading(true);
      setMapReady(false);
      setMapError("");
      setLocationNote("");

      const seed = (snapshot.points || []).filter(
        (point) =>
          Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
      );
      const fromPolygon = seed[0];
      const coord = await getInitialMapCoordinate(
        fromPolygon?.latitude ?? snapshot.latitude,
        fromPolygon?.longitude ?? snapshot.longitude,
      );

      if (cancelled) return;

      setSeedPoints(seed);
      setPoints(seed);
      setCenter(coord);
      if (!coord.hasUserFix) {
        setLocationNote(
          "Location is off, so the map may not be centered on you. Allow location, then tap the blue target.",
        );
      }
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const mapHtml = useMemo(() => {
    if (!center || !mapboxToken) return null;
    return buildMapboxPolygonHtml({
      token: mapboxToken,
      latitude: center.latitude,
      longitude: center.longitude,
      points: seedPoints,
      userLatitude: center.userLatitude,
      userLongitude: center.userLongitude,
      accuracy: center.accuracy,
    });
  }, [center, mapboxToken, seedPoints]);

  useLiveUserDot(visible && mapReady, webViewRef);

  async function recenterOnUser() {
    try {
      setLocatingUser(true);
      const user = await readDeviceCoordinate();
      if (!user) {
        setLocationNote(
          "Allow location access, then tap the target to see where you are.",
        );
        return;
      }
      setLocationNote("");
      webViewRef.current?.injectJavaScript(
        userLocationUpdateScript(
          user.latitude,
          user.longitude,
          user.accuracy,
          true,
        ),
      );
    } finally {
      setLocatingUser(false);
    }
  }

  function inject(script: string) {
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }

  function handleWebViewMessage(event: { nativeEvent: { data: string } }) {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "polygon" && Array.isArray(data.points)) {
        setPoints(
          data.points.filter(
            (point: GeoPoint) =>
              Number.isFinite(point?.latitude) &&
              Number.isFinite(point?.longitude),
          ),
        );
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

  function handleConfirm() {
    if (points.length < 3) {
      setMapError("Clip at least 3 corners on the map.");
      return;
    }
    const next = points;
    onClose();
    onConfirm(next);
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
          <Text style={styles.headerTitle}>Clip farm on map</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.hint}>
          The map opens on you. The blue dot is where you are standing. Tap the
          satellite image to draw the farm boundary. Pan and pinch to move.
        </Text>
        {locationNote ? (
          <Text style={styles.locationNote}>{locationNote}</Text>
        ) : null}

        {!mapboxToken ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Mapbox token missing. Add EXPO_PUBLIC_MAPBOX_TOKEN to Mobile/.env.
            </Text>
          </View>
        ) : loading || !center || !mapHtml ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.brunswick} />
          </View>
        ) : (
          <View style={styles.mapWrap}>
            <WebView
              ref={webViewRef}
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
            ) : (
              <MapMyLocationButton
                onPress={recenterOnUser}
                loading={locatingUser}
              />
            )}
          </View>
        )}

        {mapError ? <Text style={styles.inlineError}>{mapError}</Text> : null}

        <Text style={styles.coordsText}>
          {points.length === 0
            ? "No corners clipped yet"
            : `${points.length} corner${points.length === 1 ? "" : "s"} clipped`}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => inject("undoLast()")}
            disabled={points.length === 0}
          >
            <Text style={styles.actionText}>Undo last</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => inject("clearAll()")}
            disabled={points.length === 0}
          >
            <Text style={styles.actionText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            title="Use this polygon"
            onPress={handleConfirm}
            disabled={points.length < 3}
            variant="accent"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
    paddingTop: Platform.OS === "android" ? spacing.lg : spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  closeText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brunswick,
    minWidth: 48,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.brunswick,
  },
  headerSpacer: {
    minWidth: 48,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.smoke,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  locationNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.warning,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chalk,
  },
  map: {
    flex: 1,
    backgroundColor: colors.chalk,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.errorBg,
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.error,
    lineHeight: 18,
  },
  inlineError: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.error,
  },
  coordsText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brunswick,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brunswick,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
