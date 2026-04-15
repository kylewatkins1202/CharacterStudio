import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppStore } from "../stores/AppStore";
import { getTheme, spacing, radius, THEMES } from "../lib/theme";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";

export default function SettingsScreen({ navigation }) {
  const insets    = useSafeAreaInsets();
  const colors    = getTheme(AppStore.useState().theme);
  const theme     = AppStore.useState().theme;
  const serverUrl = AppStore.useState().serverUrl;
  const toast     = useToast();

  const [apiKey,     setApiKey]     = useState("");
  const [urlDraft,   setUrlDraft]   = useState(serverUrl);
  const [showKey,    setShowKey]    = useState(false);

  useEffect(() => {
    api.get("/settings").then((res) => {
      if (res.ok && res.settings?.wavespeedApiKey) setApiKey(res.settings.wavespeedApiKey);
    }).catch(() => {});
  }, []);

  const saveApiKey = async () => {
    try {
      const res = await api.put("/settings", { wavespeedApiKey: apiKey });
      if (res.ok) toast.add("API key saved", "success");
      else        toast.add("Failed to save", "error");
    } catch (e) {
      toast.add(e.message, "error");
    }
  };

  const saveServerUrl = () => {
    AppStore.actions.SET_SERVER_URL(urlDraft.trim());
    toast.add("Server URL saved", "success");
  };

  const clearCache = () => {
    Alert.alert("Clear Cache", "Clear the prompt compilation cache?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        await api.post("/settings/clear-cache");
        toast.add("Cache cleared", "success");
      }},
    ]);
  };

  const clearGallery = () => {
    Alert.alert("Clear Gallery", "This will delete ALL gallery entries. Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete All", style: "destructive", onPress: async () => {
        try {
          await api.post("/settings/clear-gallery");
          toast.add("Gallery cleared", "success");
        } catch (e) {
          toast.add("Failed to clear gallery", "error");
        }
      }},
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ padding: spacing.page, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}
    >

      {/* Server URL */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textHigh }]}>Server</Text>
        <Text style={[styles.label, { color: colors.textGhost }]}>Server URL</Text>
        <TextInput
          value={urlDraft}
          onChangeText={setUrlDraft}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.1.166:4989"
          placeholderTextColor={colors.textGhost}
          style={[styles.input, { color: colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
        />
        <TouchableOpacity
          onPress={saveServerUrl}
          style={[styles.btn, { backgroundColor: colors.primary, marginTop: 8 }]}
        >
          <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 13 }}>Save URL</Text>
        </TouchableOpacity>
      </View>

      {/* WaveSpeed API Key */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textHigh }]}>WaveSpeed</Text>
        <Text style={[styles.label, { color: colors.textGhost }]}>API Key</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="sk-…"
            placeholderTextColor={colors.textGhost}
            style={[styles.input, { flex: 1, color: colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
          />
          <TouchableOpacity
            onPress={() => setShowKey(!showKey)}
            style={[styles.iconBtn, { borderColor: colors.borderStrong }]}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>{showKey ? "🙈" : "👁"}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={saveApiKey}
          style={[styles.btn, { backgroundColor: colors.primary, marginTop: 8 }]}
        >
          <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 13 }}>Save Key</Text>
        </TouchableOpacity>
      </View>

      {/* Theme */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textHigh }]}>Theme</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {Object.keys(THEMES).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => AppStore.actions.SET_THEME(t)}
              style={[
                styles.themePill,
                {
                  backgroundColor: theme === t ? colors.primary : "transparent",
                  borderColor:     theme === t ? colors.primary : "#1e1e1e",
                },
              ]}
            >
              <Text style={{ color: theme === t ? colors.primaryText : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Danger zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textHigh }]}>Data</Text>
        <TouchableOpacity
          onPress={clearCache}
          style={[styles.btn, { borderColor: colors.error, borderWidth: 1 }]}
        >
          <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 13 }}>Clear Cache</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={clearGallery}
          style={[styles.btn, { borderColor: colors.error, borderWidth: 1, marginTop: 10 }]}
        >
          <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 13 }}>Clear Gallery</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  section:      { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10, fontFamily: "Courier New" },
  label:        { fontFamily: "Courier New", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  input:        { borderWidth: 1, borderRadius: radius.md, padding: 10, fontFamily: "Courier New", fontSize: 12 },
  btn:          { padding: 12, borderRadius: radius.md, alignItems: "center" },
  iconBtn:      { width: 40, height: 40, borderWidth: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  themePill:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
});
