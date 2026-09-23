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

/** Geographic center of India. Only used when the phone cannot provide a fix. */
const FALLBACK_LATITUDE = 20.5937;
const FALLBACK_LONGITUDE = 78.9629;

export type DeviceCoordinate = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type MapOpenCoordinate = DeviceCoordinate & {
  userLatitude: number | null;
  userLongitude: number | null;
  hasUserFix: boolean;
};

function toDeviceCoordinate(position: Location.LocationObject): DeviceCoordinate {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy:
      typeof position.coords.accuracy === "number"
        ? position.coords.accuracy
        : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function apartMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const dLat = (lat1 - lat2) * 111320;
  const dLng =
    (lng1 - lng2) *
    111320 *
    Math.max(Math.cos((lat1 * Math.PI) / 180), 0.2);
  return Math.hypot(dLat, dLng);
}

/** True when a saved point is a real place, not 0,0 or the old India fallback. */
export function isUsableMapCoordinate(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (
    Math.abs(lat - FALLBACK_LATITUDE) < 0.0002 &&
    Math.abs(lng - FALLBACK_LONGITUDE) < 0.0002
  ) {
    return false;
  }
  return true;
}

/** Ask for location permission and return the phone's current GPS fix. */
export async function readDeviceCoordinate(): Promise<DeviceCoordinate | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) return null;

    const last = await Location.getLastKnownPositionAsync();
    const lastFresh =
      last &&
      Date.now() - last.timestamp < 2 * 60 * 1000 &&
      (last.coords.accuracy == null || last.coords.accuracy <= 150)
        ? last
        : null;

    const current = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      }),
      lastFresh ? 5000 : 12000,
    );

    if (current) return toDeviceCoordinate(current);
    if (lastFresh) return toDeviceCoordinate(lastFresh);
    if (last && Date.now() - last.timestamp < 10 * 60 * 1000) {
      return toDeviceCoordinate(last);
    }
    return null;
  } catch {
    return null;
  }
}

export async function watchDeviceCoordinate(
  onUpdate: (coord: DeviceCoordinate) => void,
): Promise<{ remove: () => void } | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return null;

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 3,
      timeInterval: 2000,
    },
    (position) => onUpdate(toDeviceCoordinate(position)),
  );
}

export async function getInitialMapCoordinate(
  existingLat?: number | null,
  existingLng?: number | null,
): Promise<MapOpenCoordinate> {
  const user = await readDeviceCoordinate();
  let hasExisting = isUsableMapCoordinate(existingLat, existingLng);
  // A saved point in another region is the old default map, not this farm.
  // Start the pin on the person instead of leaving it off-screen.
  if (
    hasExisting &&
    user &&
    apartMeters(
      user.latitude,
      user.longitude,
      Number(existingLat),
      Number(existingLng),
    ) > 20000
  ) {
    hasExisting = false;
  }

  return {
    latitude: hasExisting ? Number(existingLat) : user?.latitude ?? FALLBACK_LATITUDE,
    longitude: hasExisting
      ? Number(existingLng)
      : user?.longitude ?? FALLBACK_LONGITUDE,
    accuracy: user?.accuracy ?? null,
    userLatitude: user?.latitude ?? null,
    userLongitude: user?.longitude ?? null,
    hasUserFix: Boolean(user),
  };
}
