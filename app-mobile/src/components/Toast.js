import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { AppStore } from "../stores/AppStore";
import { getTheme } from "../lib/theme";

function ToastItem({ toast, colors }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        AppStore.actions.REMOVE_TOAST(toast.id);
      });
    }, 3200);
    return () => clearTimeout(timer);
  }, []);

  const bg =
    toast.type === "error"   ? colors.error   :
    toast.type === "success" ? colors.success  :
    colors.borderStrong || "#2a2a2a";

  const textColor =
    toast.type === "success" ? colors.successText : "#fff";

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bg, opacity }]}>
      <Text style={[styles.text, { color: textColor }]}>{toast.message}</Text>
    </Animated.View>
  );
}

export default function Toasts() {
  const toasts = AppStore.useState().toasts;
  const colors = getTheme(AppStore.useState().theme);

  if (!toasts.length) return null;

  return (
    <View style={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} colors={colors} />
      ))}
    </View>
  );
}

export function useToast() {
  return {
    add: (message, type = "info") => {
      AppStore.actions.ADD_TOAST({ message, type });
    },
  };
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom:   80,
    left:     16,
    right:    16,
    zIndex:   1000,
    gap:      8,
  },
  toast: {
    borderRadius: 8,
    padding:      12,
  },
  text: {
    fontFamily: "Courier New",
    fontSize:   13,
  },
});
