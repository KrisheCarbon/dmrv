import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { getMapboxToken, mapboxReverseGeocode } from "./mapbox";

async function isOffline() {
  const net = await NetInfo.fetch();
  return !net.isConnected || net.isInternetReachable === false;
}

export async function reverseGeocodeAddress(latitude, longitude) {
  const offline = await isOffline();

  if (!offline && getMapboxToken()) {
    try {
      return await mapboxReverseGeocode(latitude, longitude);
    } catch {
      // fall back to device geocoder
    }
  }

  if (!offline) {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude
      });

      if (results?.length) {
        const place = results[0];
        const parts = [
          place.name,
          place.street,
          place.district || place.subregion,
          place.city || place.region,
          place.postalCode,
          place.country
        ].filter(Boolean);

        if (parts.length) {
          return parts.join(", ");
        }
      }
    } catch {
      // fall through to coordinates
    }
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export async function getCurrentFarmLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error(
      "Location permission is required. Open Settings and allow location for KC."
    );
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error(
      "GPS is turned off. Enable Location in your phone settings, then try again."
    );
  }

  let position = null;

  try {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      mayShowUserSettingsDialog: true
    });
  } catch {
    position = await Location.getLastKnownPositionAsync();
  }

  if (!position) {
    throw new Error(
      "Could not get a GPS fix. GPS works offline but needs a clear view of the sky — try stepping outside and waiting a few seconds."
    );
  }

  const { latitude, longitude } = position.coords;
  const address = await reverseGeocodeAddress(latitude, longitude);

  return { latitude, longitude, address };
}

export async function getInitialMapCoordinate(existingLat, existingLng) {
  if (existingLat != null && existingLng != null) {
    return {
      latitude: Number(existingLat),
      longitude: Number(existingLng)
    };
  }

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted" && (await Location.hasServicesEnabledAsync())) {
      let position = null;

      try {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false
        });
      } catch {
        position = await Location.getLastKnownPositionAsync();
      }

      if (position) {
        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
      }
    }
  } catch {
    // fall through to default
  }

  return { latitude: 20.5937, longitude: 78.9629 };
}
