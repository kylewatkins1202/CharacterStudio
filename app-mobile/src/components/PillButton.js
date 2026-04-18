/**
 * PillButton — a reusable pill/chip button used throughout the app.
 */
import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { getTheme } from "../lib/theme";
import { AppStore } from "../stores/AppStore";
import { radius } from "../lib/theme";

export default function PillButton({ label, active, onPress, style, textStyle }) {
  const {theme} = AppStore.useState()
  const colors = getTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? colors.primary : "transparent",
          borderColor:     active ? colors.primary : "#1e1e1e",
        },
        style,
      ]}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, { color: active ? colors.primaryText : colors.textMuted }, textStyle]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical:   6,
    borderRadius:      radius.md,
    borderWidth:       1,
  },
  label: {
    fontFamily: "Courier New",
    fontSize:   12,
  },
});
