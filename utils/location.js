import * as Location from "expo-location";
import { getMapboxToken, mapboxReverseGeocode } from "./mapbox";

export async function reverseGeocodeAddress(latitude, longitude) {
  if (getMapboxToken()) {
    try {
      return await mapboxReverseGeocode(latitude, longitude);
    } catch {
      // fall back to device geocoder
    }
  }

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude,
      longitude
    });

    if (!results?.length) {
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }

    const place = results[0];
    const parts = [
      place.name,
      place.street,
      place.district || place.subregion,
      place.city || place.region,
      place.postalCode,
      place.country
    ].filter(Boolean);

    return parts.join(", ") || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  } catch {
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }
}

export async function getCurrentFarmLocation() {
  const { status } =
    await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission is required to onboard farmers.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High
  });

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
    if (status === "granted") {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    }
  } catch {
    // fall through to default
  }

  return { latitude: 20.5937, longitude: 78.9629 };
}
