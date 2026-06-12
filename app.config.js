/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require("./app.json");

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      extra: {
        ...appJson.expo.extra,
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
        mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ""
      }
    }
  };
};
