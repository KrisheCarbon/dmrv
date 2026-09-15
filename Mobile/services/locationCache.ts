import * as Location from "expo-location";
import type { LocationValue } from "@krishecarbon/shared";
import { reverseGeocodeAddress } from "../utils/location";

type CachedLocation = LocationValue & {
  updatedAt: number;
};

let latestLocation: CachedLocation | null = null;
let watchSubscription: Location.LocationSubscription | null = null;
let watchStarted = false;

export function getCachedLocation(): CachedLocation | null {
  return latestLocation;
}

export function getCachedLocationValue(): LocationValue | null {
  if (!latestLocation) return null;
  return {
    lat: latestLocation.lat,
    lng: latestLocation.lng,
    address: latestLocation.address,
  };
}

export async function startLocationCache(): Promise<void> {
  if (watchStarted) return;

  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== "granted") return;

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return;

  watchStarted = true;

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await updateFromCoords(position.coords.latitude, position.coords.longitude);
  } catch {
    // Watch will still try to deliver updates.
  }

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 15,
      timeInterval: 10000,
    },
    async (position) => {
      await updateFromCoords(position.coords.latitude, position.coords.longitude);
    },
  );
}

export async function stopLocationCache(): Promise<void> {
  watchStarted = false;
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
}

async function updateFromCoords(latitude: number, longitude: number) {
  const address = await reverseGeocodeAddress(latitude, longitude);
  latestLocation = {
    lat: latitude,
    lng: longitude,
    address,
    updatedAt: Date.now(),
  };
}

/** Fast read for camera capture — uses cache only, no GPS wait. */
export function getLocationForPhotoCapture(): LocationValue | null {
  return getCachedLocationValue();
}

/**
 * Starts the location watch (if needed) and waits up to `timeoutMs` for a
 * GPS fix, polling the cache. Used for screens that want to auto-fill the
 * current location without requiring a photo capture.
 */
export async function waitForLocation(timeoutMs = 8000): Promise<LocationValue | null> {
  await startLocationCache();

  const cached = getCachedLocationValue();
  if (cached) return cached;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const value = getCachedLocationValue();
    if (value) return value;
  }

  return getCachedLocationValue();
}
