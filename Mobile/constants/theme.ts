/**
 * App theme — maps brand colors to UI tokens.
 * Brand source of truth: constants/brand.js
 */
import { brandHex } from "./brand";

export const colors = {
  chalk: brandHex.chalkWhite,
  white: brandHex.pureWhite,
  brunswick: brandHex.brunswickGreen,
  brunswickLight: "#244D38",
  chartreuse: brandHex.chartreuseGreen,
  chartreuseMuted: "#A8D66A",
  smoke: brandHex.smokeGray,
  smokeLight: "#A5A5A9",
  text: "#1A1A1A",
  textSecondary: "#5C5C5E",
  border: "#E8E4DE",
  borderDark: "#D4CFC6",
  error: "#C74444",
  errorBg: "#FCECEC",
  warning: "#D8A117",
  warningBg: "#FFF6DD",
  success: "#2E7D57",
  successBg: "#EAF7F0",
  overlay: "rgba(26, 60, 42, 0.06)"
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999
};

export const fonts = {
  regular: "SatoshiRegular",
  medium: "SatoshiMedium",
  bold: "SatoshiBold"
};

export const logos = {
  /** Vertical logo — bg matched to Chalk White #FAF7F2 */
  vertical: require("../assets/branding/logo-vertical-chalk.png"),
  /** Vertical logo — bg matched to Pure White #FFFFFF (inverted login) */
  verticalWhite: require("../assets/branding/logo-vertical-white.png"),
  verticalOriginal: require("../assets/branding/logo-vertical.png"),
  horizontal: require("../assets/branding/logo-horizontal.png"),
  symbolLight: require("../assets/branding/logo-symbol-light.png"),
  symbolDark: require("../assets/branding/logo-symbol-dark.png"),
  /** Symbol mark — bg matched to Pure White #FFFFFF */
  symbolWhiteBg: require("../assets/branding/logo-symbol-white-bg.png"),
  symbolGreenBg: require("../assets/branding/logo-symbol-green-bg.png")
};
