import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  Image, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { GenerateStore } from "../stores/GenerateStore";
import { AppStore } from "../stores/AppStore";
import { getTheme, spacing, radius } from "../lib/theme";
import { ASPECT_RATIOS, REFERENCE_PURPOSES } from "../lib/constants";
import { extractImageUrl } from "../lib/utils";
import PillButton from "../components/PillButton";
import { useToast } from "../components/Toast";
import AssetPickerModal from "../components/AssetPickerModal";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children, colors }) {
  return (
    <Text style={[styles.label, { color: colors.textGhost }]}>{children}</Text>
  );
}

function ModeToggle({ mode, colors }) {
  const {localGenerationEnabled} = AppStore.useState()
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => GenerateStore.actions.SET_MODE("wavespeed")}
        style={[styles.modeBtn, { backgroundColor: mode === "wavespeed" ? colors.primary : "#111", borderRadius: radius.md }]}
      >
        <Text style={{ color: mode === "wavespeed" ? colors.primaryText : colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>
          WaveSpeed
        </Text>
      </TouchableOpacity>
      { localGenerationEnabled && (
        <TouchableOpacity
          onPress={() => GenerateStore.actions.SET_MODE("local")}
          style={[styles.modeBtn, { backgroundColor: mode === "local" ? colors.primary : "#111", borderRadius: radius.md }]}
        >
          <Text style={{ color: mode === "local" ? colors.primaryText : colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>
            Local
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function AspectRatioPicker({ cloudModelParams, colors }) {
  const current = cloudModelParams.aspect_ratio || ASPECT_RATIOS[0];
  return (
    <View>
      <SectionLabel colors={colors}>Aspect Ratio</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
        <View style={styles.row}>
          {ASPECT_RATIOS.map((r) => (
            <PillButton
              key={r.label}
              label={r.label}
              active={current.label === r.label}
              onPress={() => GenerateStore.actions.SET_CLOUD_MODEL_PARAMS({ ...cloudModelParams, aspect_ratio: r })}
              style={{ marginRight: 6 }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ModelPicker({ wsModels, cloudModel, colors }) {
  if (!wsModels || !Object.keys(wsModels).length) return null;
  return (
    <View>
      <SectionLabel colors={colors}>Model</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
        <View style={styles.row}>
          {Object.entries(wsModels).map(([key, info]) => (
            <PillButton
              key={key}
              label={info.name}
              active={cloudModel === key}
              onPress={() => GenerateStore.actions.SET_CLOUD_MODEL(key)}
              style={{ marginRight: 6 }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ResolutionPicker({ modelSchema, cloudModelParams, colors }) {
  const resolutions = modelSchema?.resolutions;
  if (!resolutions) return null;
  return (
    <View>
      <SectionLabel colors={colors}>Resolution</SectionLabel>
      <View style={[styles.row, { marginTop: 6 }]}>
        {resolutions.map((r) => (
          <PillButton
            key={r}
            label={r}
            active={(cloudModelParams.resolution ?? resolutions[0]) === r}
            onPress={() => GenerateStore.actions.SET_CLOUD_MODEL_PARAMS({ ...cloudModelParams, resolution: r })}
            style={{ marginRight: 6 }}
          />
        ))}
      </View>
    </View>
  );
}

function SizeSlider({ wsModels, cloudModel, cloudModelParams, colors }) {
  const modelSchema  = wsModels?.[cloudModel];
  const usesEnumSize = !!(modelSchema?.aspectRatios);
  if (usesEnumSize) return null;

  const min     = modelSchema?.min ?? 512;
  const max     = modelSchema?.max ?? 8192;
  const current = cloudModelParams.baseSize ?? 2048;

  // Simple step buttons since RN Slider needs an extra package
  const step = (dir) => {
    const next = Math.max(min, Math.min(max, current + dir * 256));
    GenerateStore.actions.SET_CLOUD_MODEL_PARAMS({ ...cloudModelParams, baseSize: next });
  };

  return (
    <View>
      <SectionLabel colors={colors}>
        Resolution — {current}px
      </SectionLabel>
      <View style={[styles.row, { marginTop: 6 }]}>
        <TouchableOpacity
          onPress={() => step(-1)}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
        >
          <Text style={{ color: colors.textMuted, fontSize: 18 }}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.stepValue, { color: colors.textMid }]}>{current}</Text>
        <TouchableOpacity
          onPress={() => step(1)}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
        >
          <Text style={{ color: colors.textMuted, fontSize: 18 }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReferenceImages({ referenceImages, colors }) {
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const src   = `data:image/jpeg;base64,${asset.base64}`;
      GenerateStore.actions.SET_REFERENCE_IMAGES([
        ...referenceImages,
        { src, isUrl: false, purpose: "" },
      ]);
    }
  }, [referenceImages]);

  const handlePickAssets = useCallback((assets) => {
    const newRefs = assets.map((a) => ({
      url:     a.localUrl || a.url,
      isUrl:   true,
      purpose: "",
      assetId: a.id,
    }));
    GenerateStore.actions.SET_REFERENCE_IMAGES([...referenceImages, ...newRefs]);
    setAssetPickerOpen(false);
  }, [referenceImages]);

  return (
    <View>
      <SectionLabel colors={colors}>Reference Images</SectionLabel>
      <View style={[styles.row, { marginTop: 6, gap: 8 }]}>
        <TouchableOpacity
          onPress={() => setAssetPickerOpen(true)}
          style={[styles.addRefBtn, { borderColor: colors.borderStrong, flex: 1 }]}
        >
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>
            From assets
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={pickImage}
          style={[styles.addRefBtn, { borderColor: colors.borderStrong, flex: 1 }]}
        >
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>
            + Upload photo
          </Text>
        </TouchableOpacity>
      </View>

      {referenceImages.length > 0 && (
        <View style={{ marginTop: 8, gap: 8 }}>
          {referenceImages.map((img, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ position: "relative" }}>
                <Image
                  source={{ uri: img.url || img.src }}
                  style={{ width: 64, height: 64, borderRadius: radius.md }}
                />
                <TouchableOpacity
                  onPress={() => GenerateStore.actions.SET_REFERENCE_IMAGES(
                    referenceImages.filter((_, j) => j !== i)
                  )}
                  style={[styles.removeBtn, { backgroundColor: colors.error }]}
                >
                  <Text style={{ color: "#fff", fontSize: 10 }}>×</Text>
                </TouchableOpacity>
              </View>
              {/* Purpose picker */}
              <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingTop: 2 }}>
                {REFERENCE_PURPOSES.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => {
                      const updated = [...referenceImages];
                      updated[i] = { ...updated[i], purpose: p.value };
                      GenerateStore.actions.SET_REFERENCE_IMAGES(updated);
                    }}
                    style={[
                      styles.purposePill,
                      {
                        backgroundColor: img.purpose === p.value ? colors.primary : "transparent",
                        borderColor:     img.purpose === p.value ? colors.primary : "#1e1e1e",
                      },
                    ]}
                  >
                    <Text style={{ color: img.purpose === p.value ? colors.primaryText : colors.textDim, fontSize: 9, fontFamily: "Courier New" }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <AssetPickerModal
        visible={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onSelect={handlePickAssets}
        title="Pick Reference Images"
        multiple
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GenerateScreen({ navigation }) {
  const toast  = useToast();
  const insets = useSafeAreaInsets();

  // Subscribe to store values
  const state          = GenerateStore.useState();
  const appState       = AppStore.useState();
  const colors         = getTheme(appState.theme);

  const {
    prompt, negPrompt, mode, referenceImages, result, compiled,
    cloudModel, cloudModelParams, wsModels,
    generationCost, costLoading, starting, resetCache, useRawPrompt,
  } = state;

  const modelSchema  = wsModels?.[cloudModel];
  const usesEnumSize = !!(modelSchema?.aspectRatios);
  const imageUrl     = result ? extractImageUrl(result) : null;

  // Load WaveSpeed models once
  useEffect(() => {
    GenerateStore.actions.LOAD_WS_MODELS({});
  }, []);

  // Debounced cost fetch
  useEffect(() => {
    if (mode !== "wavespeed" || !prompt.trim()) return;
    GenerateStore.actions.SET_COST_LOADING(true);
    const timer = setTimeout(() => {
      GenerateStore.actions.FETCH_COST({});
    }, 600);
    return () => clearTimeout(timer);
  }, [prompt, cloudModel, cloudModelParams, mode]);

  const generate = async () => {
    if (!prompt.trim()) return toast.add("Please enter a prompt", "error");
    GenerateStore.actions.SET_STARTING(true);
    await GenerateStore.actions.GENERATE({});
    toast.add("Generation started!", "success");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.textHigh }]}>Generate</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <ModeToggle mode={mode} colors={colors} />

        {/* Prompt */}
        <View style={{ marginTop: 20 }}>
          <SectionLabel colors={colors}>Prompt</SectionLabel>
          <TextInput
            value={prompt}
            onChangeText={(t) => GenerateStore.actions.SET_PROMPT(t)}
            multiline
            placeholder="Describe your scene… use @tag to reference characters"
            placeholderTextColor={colors.textGhost}
            style={[styles.promptInput, {
              color:           colors.textMid,
              backgroundColor: colors.surface,
              borderColor:     colors.borderMid,
            }]}
          />
        </View>

        {/* Neg prompt (local mode) */}
        {mode === "local" && (
          <View style={{ marginTop: 12 }}>
            <SectionLabel colors={colors}>Negative Prompt</SectionLabel>
            <TextInput
              value={negPrompt}
              onChangeText={(t) => GenerateStore.actions.SET_NEG_PROMPT(t)}
              multiline
              placeholder="Negative prompt…"
              placeholderTextColor={colors.textGhost}
              style={[styles.promptInput, {
                color:           colors.textMid,
                backgroundColor: colors.surface,
                borderColor:     colors.borderMid,
              }]}
            />
          </View>
        )}

        {/* Cloud options */}
        {mode === "wavespeed" && (
          <View style={{ gap: 16, marginTop: 16 }}>
            <ModelPicker wsModels={wsModels} cloudModel={cloudModel} colors={colors} />
            <AspectRatioPicker cloudModelParams={cloudModelParams} colors={colors} />
            {usesEnumSize
              ? <ResolutionPicker modelSchema={modelSchema} cloudModelParams={cloudModelParams} colors={colors} />
              : <SizeSlider wsModels={wsModels} cloudModel={cloudModel} cloudModelParams={cloudModelParams} colors={colors} />
            }
          </View>
        )}

        {/* Reference images */}
        <View style={{ marginTop: 16 }}>
          <ReferenceImages referenceImages={referenceImages} colors={colors} />
        </View>

        {/* Actions row */}
        <View style={[styles.row, { marginTop: 24, justifyContent: "space-between", alignItems: "center" }]}>
          {mode === "wavespeed" && (
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>
              {costLoading ? "fetching cost…" : generationCost ? `est. ${generationCost}` : ""}
            </Text>
          )}
          <View style={[styles.row, { gap: 12 }]}>
            <TouchableOpacity
              onPress={() => GenerateStore.actions.SET_RESET_CACHE(!resetCache)}
              style={styles.row}
            >
              <View style={[styles.checkbox, {
                borderColor:     colors.borderStrong,
                backgroundColor: resetCache ? colors.primary : "transparent",
              }]}>
                {resetCache && <Text style={{ color: colors.primaryText, fontSize: 8 }}>✓</Text>}
              </View>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginLeft: 4 }}>
                Reset cache
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => GenerateStore.actions.SET_USE_RAW_PROMPT(!useRawPrompt)}
              style={styles.row}
            >
              <View style={[styles.checkbox, {
                borderColor:     colors.borderStrong,
                backgroundColor: useRawPrompt ? colors.primary : "transparent",
              }]}>
                {useRawPrompt && <Text style={{ color: colors.primaryText, fontSize: 8 }}>✓</Text>}
              </View>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginLeft: 4 }}>
                Raw prompt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={generate}
              disabled={starting}
              style={[styles.generateBtn, { backgroundColor: starting ? "#111" : colors.primary }]}
            >
              {starting
                ? <ActivityIndicator color={colors.textGhost} size="small" />
                : <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 14, fontWeight: "600" }}>Generate →</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Result image */}
        {imageUrl && (
          <View style={{ marginTop: 24 }}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.resultImage, { borderColor: colors.borderMid }]}
              resizeMode="contain"
            />
            {compiled && (
              <View style={[styles.compiledBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textGhost, marginBottom: 6 }]}>Compiled Prompt</Text>
                <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11, lineHeight: 18 }}>
                  {compiled.rawPrompt}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  scrollContent: { padding: spacing.page, paddingBottom: 40 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  heading:      { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  label:        { fontFamily: "Courier New", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  row:          { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  modeBtn:      { paddingHorizontal: 20, paddingVertical: 10, marginRight: 0 },
  promptInput:  { borderWidth: 1, borderRadius: radius.md, padding: 12, fontFamily: "Courier New", fontSize: 13, minHeight: 80, textAlignVertical: "top", marginTop: 6 },
  generateBtn:  { paddingHorizontal: 24, paddingVertical: 10, borderRadius: radius.md, flexDirection: "row", alignItems: "center" },
  resultImage:  { width: "100%", height: 400, borderRadius: radius.xl, borderWidth: 1 },
  compiledBlock: { marginTop: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  addRefBtn:    { borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 6 },
  removeBtn:    { position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  purposePill:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, marginRight: 4 },
  stepBtn:      { width: 36, height: 36, borderWidth: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  stepValue:    { fontFamily: "Courier New", fontSize: 13, marginHorizontal: 12, minWidth: 50, textAlign: "center" },
  checkbox:     { width: 14, height: 14, borderWidth: 1, borderRadius: 3, alignItems: "center", justifyContent: "center" },
});
