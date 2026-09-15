import { StyleSheet, Text, View } from "react-native";
import { fonts, radius, spacing } from "../constants/theme";
import {
  reviewStatusColors,
  reviewStatusLabel,
  reviewStatusTone,
} from "../utils/reviewStatus";

export default function ReviewStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const tone = reviewStatusTone(status);
  const palette = reviewStatusColors[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.label, { color: palette.text }]}>
        {reviewStatusLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
