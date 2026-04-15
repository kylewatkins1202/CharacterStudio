import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { AppStore } from "../stores/AppStore";
import { getTheme, spacing, radius } from "../lib/theme";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";

const RESOLUTIONS = ["2k", "4k", "8k"];

export default function UpscaleScreen() {
  const insets = useSafeAreaInsets();
  const colors = getTheme(AppStore.useState().theme);
  const toast  = useToast();
  const [image,      setImage]      = useState(null);   // { uri, base64? }
  const [resolution, setResolution] = useState("4k");
  const [result,     setResult]     = useState(null);
  const [loading,    setLoading]    = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 1,
    });
    if (!res.canceled && res.assets?.[0]) {
      setImage(res.assets[0]);
      setResult(null);
    }
  };

  const upscale = async () => {
    if (!image) return toast.add("Pick an image first", "error");
    setLoading(true);
    try {
      const body = {
        image: { src: `data:image/jpeg;base64,${image.base64}` },
        targetResolution: resolution,
      };
      const res = await api.post("/generate/upscale", body);
      if (res.ok && res.url) {
        setResult(res.url);
        toast.add("Upscale complete!", "success");
      } else {
        toast.add(res.error || "Upscale failed", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
    setLoading(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ padding: spacing.page, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}
    >
      <Text style={[styles.heading, { color: colors.textHigh }]}>Upscale</Text>

      <TouchableOpacity
        onPress={pickImage}
        style={[styles.pickBtn, { borderColor: colors.borderStrong }]}
      >
        {image
          ? <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
          : <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>
              + Pick an image
            </Text>
        }
      </TouchableOpacity>

      <View style={{ marginTop: 16 }}>
        <Text style={[styles.label, { color: colors.textGhost }]}>Target Resolution</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          {RESOLUTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setResolution(r)}
              style={[
                styles.resPill,
                {
                  backgroundColor: resolution === r ? colors.primary : "transparent",
                  borderColor:     resolution === r ? colors.primary : "#1e1e1e",
                },
              ]}
            >
              <Text style={{ color: resolution === r ? colors.primaryText : colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        onPress={upscale}
        disabled={loading || !image}
        style={[styles.upscaleBtn, { backgroundColor: loading || !image ? "#111" : colors.primary, marginTop: 20 }]}
      >
        {loading
          ? <ActivityIndicator color={colors.textGhost} />
          : <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 14, fontWeight: "600" }}>
              Upscale →
            </Text>
        }
      </TouchableOpacity>

      {result && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.label, { color: colors.textGhost, marginBottom: 8 }]}>Result</Text>
          <Image source={{ uri: result }} style={styles.result} resizeMode="contain" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  heading:    { fontSize: 22, fontWeight: "700", marginBottom: 20 },
  label:      { fontFamily: "Courier New", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  pickBtn:    { borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, height: 200, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  preview:    { width: "100%", height: "100%" },
  resPill:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  upscaleBtn: { padding: 14, borderRadius: radius.md, alignItems: "center" },
  result:     { width: "100%", height: 300, borderRadius: radius.md },
});
