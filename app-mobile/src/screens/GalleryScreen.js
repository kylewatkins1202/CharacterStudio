import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, Modal, ActivityIndicator, Dimensions,
  ScrollView, Alert, Share, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GalleryStore } from "../stores/GalleryStore";
import { GenerateStore } from "../stores/GenerateStore";
import { AppStore } from "../stores/AppStore";
import { getTheme, spacing, radius } from "../lib/theme";
import { useToast } from "../components/Toast";
import CSModal from "../components/Modal";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAD   = spacing.page;
const THUMB = 400; // fixed square thumbnail size for list layout

// ─── Entry Card (single-column list row) ─────────────────────────────────────

function EntryCard({ entry, colors, showAll, onPress }) {
  const imgUrl   = entry.imageUrl || entry.localUrl;
  const isHidden = entry.hidden;
  const blurred  = isHidden && !showAll;

  return (
    <TouchableOpacity onPress={() => onPress(entry)} activeOpacity={0.85}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isHidden ? colors.borderMid : colors.border }]}>

        {/* Thumbnail */}
        <View style={[styles.thumb, { backgroundColor: colors.surfaceSink }]}>
          {entry.loading ? (
            <View style={styles.thumbCenter}>
              <ActivityIndicator color={colors.textGhost} size="small" />
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 8, marginTop: 3 }}>gen…</Text>
            </View>
          ) : entry.error ? (
            <View style={styles.thumbCenter}>
              <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 9 }}>Failed</Text>
            </View>
          ) : imgUrl ? (
            <>
              <Image
                source={{ uri: imgUrl }}
                style={[StyleSheet.absoluteFill, { opacity: blurred ? 0.08 : 1 }]}
                resizeMode="cover"
              />
              {blurred && (
                <View style={styles.thumbCenter}>
                  <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 8, textAlign: "center" }}>
                    Hidden
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.thumbCenter}>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9 }}>—</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          {entry.userPrompt ? (
            <Text numberOfLines={3} style={{ color: colors.textMid, fontFamily: "Courier New", fontSize: 11, lineHeight: 16 }}>
              {entry.userPrompt}
            </Text>
          ) : entry.loading ? (
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11 }}>Generating…</Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: "auto", paddingTop: 6 }}>
            {entry.model ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9 }}>{entry.model}</Text>
            ) : null}
            {entry.cost ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9 }}>${Number(entry.cost).toFixed(4)}</Text>
            ) : null}
            {entry.timestamp ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9 }}>
                {new Date(entry.timestamp).toLocaleDateString()}
              </Text>
            ) : null}
            {isHidden ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9 }}>hidden</Text>
            ) : null}
          </View>
        </View>

      </View>
    </TouchableOpacity>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────

function EntryModal({ entry, colors, insets, onClose, navigation }) {
  const toast  = useToast();
  const imgUrl = entry?.imageUrl || entry?.localUrl;

  if (!entry) return null;

  const handleUsePrompt = () => {
    GenerateStore.actions.RESTORE_FROM_ENTRY(entry);
    onClose();
    navigation.navigate("Generate");
  };

  const handleAddAsRef = () => {
    const ref = {
      url:     imgUrl,
      isUrl:   true,
      purpose: "",
      assetId: entry.imageAssetId,
    };
    const current = GenerateStore.getState().referenceImages;
    GenerateStore.actions.SET_REFERENCE_IMAGES([...current, ref]);
    toast.add("Added as reference", "success");
    onClose();
    navigation.navigate("Generate");
  };

  const handleSave = async () => {
      if (!imgUrl) return;
  
      try {
        // Fetch image as binary
        const response = await fetch(imgUrl);
        const contentType = response.headers.get("content-type");
        const extension = contentType?.includes("png") ? "png" : "jpg";
        const buffer = await response.arrayBuffer();
  
        // Convert to base64 safely
        const base64 = btoa(
          new Uint8Array(buffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
  
        const fileUri =
          FileSystem.documentDirectory + `share_${Date.now()}.${extension}`;
  
        // Write file
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: 'base64',
        });
  
        // Share actual file
        await Sharing.shareAsync(fileUri);
  
      } catch (e) {
        toast.add("Share failed: " + e.message, "error");
      }
    };

  const handleDelete = () => {
    Alert.alert("Delete", "Delete this image?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await GalleryStore.actions.DELETE_ENTRY(entry.id);
        toast.add("Deleted", "success");
        onClose();
      }},
    ]);
  };

  const handleToggleHidden = async () => {
    await GalleryStore.actions.TOGGLE_HIDDEN(entry);
    toast.add(entry.hidden ? "Image visible" : "Image hidden", "success");
    onClose();
  };

  return (
    <CSModal onClose={onClose} colors={colors}>
        {/* Modal header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalBackBtn}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 13 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textHigh, fontFamily: "Courier New", fontSize: 12, flex: 1, textAlign: "center" }}>
            {entry.model || "Generated"}
          </Text>
          <TouchableOpacity onPress={handleDelete} style={styles.modalBackBtn}>
            <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 13 }}>Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
          {/* Image */}
          {imgUrl && (
            <Image
              source={{ uri: imgUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}

          {/* Action buttons */}
          <View style={[styles.actionRow, { paddingHorizontal: PAD }]}>
            <TouchableOpacity
              onPress={handleUsePrompt}
              style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2 }]}
            >
              <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 13, fontWeight: "600" }}>
                ↑ Use Prompt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddAsRef}
              style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, flex: 1 }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>+ Ref</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.actionRow, { paddingHorizontal: PAD }]}>
            <TouchableOpacity
              onPress={handleToggleHidden}
              style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, flex: 1 }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>
                {entry.hidden ? "○ Unhide" : "● Hide"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, flex: 1 }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>↑ Share</Text>
            </TouchableOpacity>
          </View>

          {/* Meta */}
          <View style={{ paddingHorizontal: PAD, marginTop: 4 }}>
            {entry.cost != null && (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginBottom: 4 }}>
                Cost: ${Number(entry.cost).toFixed(4)}
                {entry.size ? `  ·  ${entry.size.replace("*", " × ")}` : ""}
                {entry.timestamp ? `  ·  ${new Date(entry.timestamp).toLocaleDateString()}` : ""}
              </Text>
            )}
          </View>

          {/* Prompt */}
          {entry.userPrompt ? (
            <View style={[styles.promptBlock, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: PAD }]}>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Prompt
              </Text>
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11, lineHeight: 17 }}>
                {entry.userPrompt}
              </Text>
            </View>
          ) : null}

          {/* Compiled prompt */}
          {entry.compiledPrompt ? (
            <View style={[styles.promptBlock, { backgroundColor: colors.surfaceSink, borderColor: colors.border, marginHorizontal: PAD }]}>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 9, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Compiled
              </Text>
              <Text style={{ color: colors.textDim, fontFamily: "Courier New", fontSize: 10, lineHeight: 15 }}>
                {entry.compiledPrompt}
              </Text>
            </View>
          ) : null}
        </ScrollView>
    </CSModal>
  );
}

// ─── Gallery Screen ───────────────────────────────────────────────────────────

export default function GalleryScreen({ navigation }) {
  const insets     = useSafeAreaInsets();
  const colors     = getTheme(AppStore.useState().theme);
  const gallState  = GalleryStore.useState();
  const toast      = useToast();

  const [selected,   setSelected]   = useState(null);
  const [showAll,    setShowAll]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { entries, loading, page, totalPages, total, showHidden } = gallState;

  // Initial load
  useEffect(() => {
    GalleryStore.actions.LOAD_PAGE({ page: 1 });
  }, []);

  // When showAll changes, update the selected entry if open so its blur state refreshes
  // (no fetch needed — showAll is purely local display)

  const toggleShowHidden = useCallback(() => {
    const next = !showHidden;
    setShowAll(false);
    // page: 1 + new showHidden value → LOAD_PAGE will replace entries
    GalleryStore.actions.LOAD_PAGE({ page: 1, showHidden: next });
  }, [showHidden]);

  const loadMore = useCallback(() => {
    if (loading || page >= totalPages) return;
    GalleryStore.actions.LOAD_PAGE({ page: page + 1 });
  }, [loading, page, totalPages]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setShowAll(false);
    await GalleryStore.actions.LOAD_PAGE({ page: 1, showHidden });
    setRefreshing(false);
  }, [showHidden]);

  const hiddenCount = entries.filter((e) => e.hidden).length;
  const totalCost   = entries.reduce((s, e) => s + parseFloat(e.cost || 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.textHigh }]}>Gallery</Text>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginTop: 2 }}>
            {loading ? "Loading…" : `${total} image${total !== 1 ? "s" : ""}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}`}
          </Text>
        </View>

        <View style={{ gap: 6, alignItems: "flex-end" }}>
          {/* Show all hidden — only visible when showHidden is on */}
          {showHidden && (
            <TouchableOpacity
              onPress={() => setShowAll((v) => !v)}
              style={[styles.filterBtn, {
                backgroundColor: showAll ? colors.borderStrong : "transparent",
                borderColor:     showAll ? colors.borderFocus  : colors.borderStrong,
              }]}
            >
              <Text style={{ color: showAll ? colors.textMid : colors.textMuted, fontFamily: "Courier New", fontSize: 10 }}>
                {showAll ? "Hide all" : "Show all"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Show hidden toggle */}
          <TouchableOpacity
            onPress={toggleShowHidden}
            style={[styles.filterBtn, {
              backgroundColor: showHidden ? colors.borderStrong : "transparent",
              borderColor:     showHidden ? colors.borderFocus  : colors.borderStrong,
            }]}
          >
            <Text style={{ color: showHidden ? colors.textMid : colors.textMuted, fontFamily: "Courier New", fontSize: 10 }}>
              {showHidden ? "Hide hidden" : "Show hidden"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Cost strip */}
      {totalCost > 0 && (
        <View style={[styles.costStrip, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 10 }}>
            Page cost: ${totalCost.toFixed(4)}
          </Text>
        </View>
      )}

      {loading && !entries.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>
            {total === 0 ? "No images yet — generate one to get started" : "No entries on this page"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: PAD, gap: 8, paddingBottom: insets.bottom + 20 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListFooterComponent={
            loading && entries.length > 0
              ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} />
              : null
          }
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              colors={colors}
              showAll={showAll}
              onPress={setSelected}
            />
          )}
        />
      )}

      <EntryModal
        entry={selected}
        colors={colors}
        insets={insets}
        navigation={navigation}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  header:      {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  heading:     { fontSize: 22, fontWeight: "700", fontFamily: "Courier New" },
  center:      { flex: 1, alignItems: "center", justifyContent: "center" },
  costStrip:   { paddingHorizontal: PAD, paddingVertical: 5, borderBottomWidth: 1 },
  filterBtn:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },

  // List card
  card:        {
    flexDirection: "column", borderRadius: radius.md, borderWidth: 1,
    overflow: "hidden", minHeight: THUMB,
  },
  thumb:       { width: THUMB, height: THUMB, flexShrink: 0 },
  thumbCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardInfo:    { flex: 1, padding: 10, flexDirection: "column" },

  // Modal
  modal:       { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  modalBackBtn: { minWidth: 60 },
  modalImage:  { width: "100%", height: 360 },
  actionRow:   { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn:   { flex: 1, padding: 12, borderRadius: radius.md, alignItems: "center" },
  promptBlock: { marginTop: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
});
