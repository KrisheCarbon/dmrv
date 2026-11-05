import { requireNativeModule } from "expo";
import { Platform } from "react-native";

type DeveloperOptionsNative = {
  isDeveloperOptionsEnabled(): boolean;
};

/**
 * True when Android Developer options are switched on.
 * iPhones do not have this switch. An older installed app that does not
 * include this check yet reports false instead of crashing.
 */
export function isDeveloperOptionsEnabled(): boolean {
  if (Platform.OS !== "android") return false;

  try {
    const native = requireNativeModule<DeveloperOptionsNative>("DeveloperOptions");
    return native.isDeveloperOptionsEnabled() === true;
  } catch {
    return false;
  }
}
