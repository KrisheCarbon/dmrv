import fs from "fs";
import path from "path";
import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

// eas update can snapshot this config before Expo loads .env.
// Fill any missing keys so the published app still has Supabase and Mapbox.
function loadDotEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

export default (): ExpoConfig => {
  const isDevClient = process.env.EAS_BUILD_PROFILE === "development";

  const plugins = (appJson.expo.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return isDevClient || name !== "expo-dev-client";
  });

  return {
    ...appJson.expo,
    plugins: plugins as ExpoConfig["plugins"],
    extra: {
      ...appJson.expo.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "",
      backendUrl: (() => {
        const configured = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
        const local =
          !configured ||
          /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.\d+\.\d+/.test(configured);
        if (local && process.env.EAS_BUILD_PROFILE !== "development") {
          return "https://krishecarbon-backend.onrender.com";
        }
        return (
          configured ||
          "http://192.168.1.17:3001,http://127.0.0.1:3001,http://localhost:3001"
        );
      })(),
    },
  } as ExpoConfig;
};
