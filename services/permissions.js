import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PERMISSIONS_KEY = "dmrv_permissions_granted";

export async function arePermissionsGranted() {
  const value = await AsyncStorage.getItem(PERMISSIONS_KEY);
  return value === "true";
}

export async function markPermissionsGranted() {
  await AsyncStorage.setItem(PERMISSIONS_KEY, "true");
}

export async function requestAllPermissions() {
  const results = {
    location: false,
    camera: false,
    media: false
  };

  const { status: locationStatus } =
    await Location.requestForegroundPermissionsAsync();
  results.location = locationStatus === "granted";

  const camera = await ImagePicker.requestCameraPermissionsAsync();
  results.camera = camera.status === "granted";

  const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
  results.media = media.status === "granted";

  return results;
}

export async function pickConsentDocument() {
  return DocumentPicker.getDocumentAsync({
    type: ["image/*", "application/pdf"],
    copyToCacheDirectory: true
  });
}

export async function pickConsentImageFromCamera() {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.8
  });

  if (result.canceled) return null;

  return result.assets[0];
}

export async function pickConsentImageFromGallery() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8
  });

  if (result.canceled) return null;

  return result.assets[0];
}
