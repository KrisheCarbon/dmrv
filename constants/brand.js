/**
 * KriSHE Carbon — official brand colors
 * Source: designer color palette (June 2026)
 */

export const brandColors = {
  pureWhite: {
    name: "Pure White",
    hex: "#FFFFFF",
    rgb: "255, 255, 255",
    cmyk: "0%, 0%, 0%, 0%",
    hsl: "0, 0%, 100%",
    usage: "Cards, input surfaces, elevated panels"
  },
  chalkWhite: {
    name: "Chalk White",
    hex: "#FAF7F2",
    rgb: "250, 247, 242",
    cmyk: "0%, 1.2%, 3.2%, 1.96%",
    hsl: "37.5, 44.44%, 96.47%",
    usage: "App screen backgrounds — warm, not harsh white"
  },
  chartreuseGreen: {
    name: "Chartreuse Green",
    hex: "#8CC63E",
    rgb: "140, 198, 62",
    cmyk: "29.29%, 0%, 68.69%, 22.35%",
    hsl: "85.59, 54.4%, 50.98%",
    usage: "Accent buttons, highlights, active states"
  },
  smokeGray: {
    name: "Smoke Gray",
    hex: "#808185",
    rgb: "128, 129, 133",
    cmyk: "3.76%, 3.01%, 0%, 47.84%",
    hsl: "228, 2.01%, 51.18%",
    usage: "Secondary text, labels, captions"
  },
  brunswickGreen: {
    name: "Brunswick Green",
    hex: "#1A3C2A",
    rgb: "26, 60, 42",
    cmyk: "56.67%, 0%, 30%, 76.47%",
    hsl: "148.24, 39.53%, 16.86%",
    usage: "Primary buttons, headers, hero panels"
  }
};

/** Flat hex map for StyleSheet use — import from theme.js in components */
export const brandHex = {
  pureWhite: brandColors.pureWhite.hex,
  chalkWhite: brandColors.chalkWhite.hex,
  chartreuseGreen: brandColors.chartreuseGreen.hex,
  smokeGray: brandColors.smokeGray.hex,
  brunswickGreen: brandColors.brunswickGreen.hex
};
