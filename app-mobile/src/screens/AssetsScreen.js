import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, Dimensions, ActivityIndicator, ScrollView,
  RefreshControl, Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { AppStore } from "../stores/AppStore";
import { GenerateStore } from "../stores/GenerateStore";
import { getTheme, spacing, radius } from "../lib/theme";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS  = 4;
const PAD   = spacing.page;
const GAP   = 4;
const THUMB = (SCREEN_WIDTH - PAD * 2 - (COLS - 1) * GAP) / COLS;

// ─── Asset Modal ──────────────────────────────────────────────────────────────

function AssetModal({ asset, colors, insets, onClose, onHideToggle, navigation }) {
  const toast   = useToast();
  const imgUrl  = asset?.localUrl || asset?.url;

  if (!asset) return null;

  const handleAddAsRef = () => {
    const ref = {
      url:     imgUrl,
      isUrl:   true,
      purpose: "",
      assetId: asset.id,
    };
    const current = GenerateStore.getState().referenceImages;
    GenerateStore.actions.SET_REFERENCE_IMAGES([...current, ref]);
    toast.add("Added as reference", "success");
    onClose();
    navigation.navigate("Generate");
  };

  const handleToggleHidden = async () => {
    const next = !asset.hidden;
    try {
      const res = await api.patch(`/assets/${asset.id}`, { hidden: next });
      if (res.ok) {
        onHideToggle(asset.id, next);
        toast.add(next ? "Asset hidden" : "Asset visible", "success");
        onClose();
      } else {
        toast.add("Failed to update", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
  };

  return (
    <Modal visible={!!asset} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalBackBtn}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 13 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textHigh, fontFamily: "Courier New", fontSize: 12, flex: 1, textAlign: "center" }}>
            {asset.folder || "Asset"}
          </Text>
          <View style={{ minWidth: 60 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
          {/* Image */}
          {imgUrl ? (
            <Image
              source={{ uri: imgUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.modalImage, { backgroundColor: colors.surfaceSink, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>No image</Text>
            </View>
          )}

          {/* Actions */}
          <View style={[styles.actionRow, { paddingHorizontal: PAD }]}>
            <TouchableOpacity
              onPress={handleAddAsRef}
              style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2 }]}
            >
              <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 13, fontWeight: "600" }}>
                + Add as Ref
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleHidden}
              style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, flex: 1 }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>
                {asset.hidden ? "○ Unhide" : "● Hide"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Meta */}
          <View style={{ paddingHorizontal: PAD, marginTop: 8 }}>
            {asset.folder ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11 }}>
                Folder: {asset.folder}
              </Text>
            ) : null}
            {asset.hidden ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginTop: 4 }}>
                Hidden
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Assets Screen ────────────────────────────────────────────────────────────

export default function AssetsScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const colors  = getTheme(AppStore.useState().theme);
  const toast   = useToast();

  // folders is an array of { name, count, builtin }
  const [folders,        setFolders]        = useState([]);
  // selectedFolder stores the folder NAME string (or null for All)
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [assets,         setAssets]         = useState([]);
  const [page,           setPage]           = useState(1);
  const [total,          setTotal]          = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [showHidden,     setShowHidden]     = useState(false);
  const [selected,       setSelected]       = useState(null);
  const [uploading,      setUploading]      = useState(false);

  const loadFolders = useCallback(async () => {
    try {
      const res = await api.get("/assets/folders");
      if (res.ok) setFolders(res.folders || []);
    } catch {}
  }, []);

  const load = useCallback(async (folderName = selectedFolder, p = 1, hidden = showHidden) => {
    if (p === 1) setLoading(true);
    else         setLoadingMore(true);
    try {
      const folderParam = folderName ? `&folder=${encodeURIComponent(folderName)}` : "";
      const hiddenParam = hidden ? "" : "&hidden=false";
      const res = await api.get(`/assets?page=${p}&pageSize=40${folderParam}${hiddenParam}`);
      if (res.ok) {
        setAssets((prev) => p === 1 ? res.assets : [...prev, ...res.assets]);
        setTotal(res.total ?? 0);
        setPage(p);
      }
    } catch {}
    setLoading(false);
    setLoadingMore(false);
  }, [selectedFolder, showHidden]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadFolders();
    await load(selectedFolder, 1, showHidden);
    setRefreshing(false);
  }, [selectedFolder, showHidden, load, loadFolders]);

  // Initial load
  useEffect(() => {
    loadFolders();
    load(null, 1);
  }, []);

  // Refresh when tab gains focus
  useFocusEffect(
    useCallback(() => {
      load(selectedFolder, 1, showHidden);
    }, [selectedFolder, showHidden])
  );

  const selectFolder = (folderName) => {
    setSelectedFolder(folderName);
    setAssets([]);
    load(folderName, 1);
  };

  const toggleHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    setAssets([]);
    load(selectedFolder, 1, next);
  };

  const loadMore = () => {
    if (loadingMore || loading) return;
    if (page * 40 < total) load(selectedFolder, page + 1);
  };

  // Update an asset's hidden state in the local list
  const handleHideToggle = (id, hidden) => {
    setAssets((prev) => prev.map((a) => a.id === id ? { ...a, hidden } : a));
    // If we're not showing hidden and we just hid an asset, remove it from list
    if (!showHidden && hidden) {
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  };

  const uploadImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.85,
      allowsMultipleSelection: true,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const images = result.assets.map((a) => `data:image/jpeg;base64,${a.base64}`);
      const folder = selectedFolder || "assets";
      const res = await api.post("/assets", { images, folder });
      if (res.ok) {
        toast.add(`${res.assets.length} image${res.assets.length !== 1 ? "s" : ""} uploaded`, "success");
        // Prepend to current view
        setAssets((prev) => [...res.assets, ...prev]);
        setTotal((t) => t + res.assets.length);
        await loadFolders();
      } else {
        toast.add(res.error || "Upload failed", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
    setUploading(false);
  }, [selectedFolder, loadFolders, toast]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.textHigh }]}>Assets</Text>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginTop: 2 }}>
            {total} assets
          </Text>
        </View>
        <View style={{ gap: 6, alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={uploadImages}
            disabled={uploading}
            style={[styles.toggleBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 11, fontWeight: "600" }}>
              {uploading ? "Uploading…" : "↑ Upload"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleHidden}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: showHidden ? colors.borderStrong : "transparent",
                borderColor:     showHidden ? colors.borderFocus : colors.borderStrong,
              },
            ]}
          >
            <Text style={{ color: showHidden ? colors.textMid : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
              {showHidden ? "Hide hidden" : "Show hidden"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Folder tabs */}
      {folders.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: -5, gap: 6, flexDirection: "row" }}
        >
          {[null, ...folders].map((f) => {
            const name   = f?.name ?? null;
            const label  = f?.name ?? "All";
            const active = selectedFolder === name;
            return (
              <TouchableOpacity
                key={name ?? "__all"}
                onPress={() => selectFolder(name)}
                style={[
                  styles.folderPill,
                  {
                    minHeight: 24,
                    backgroundColor: active ? colors.primary : "transparent",
                    borderColor:     active ? colors.primary : colors.borderStrong,
                    marginBottom: 16
                  },
                ]}
              >
                <Text style={{ color: active ? colors.primaryText : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                  {label}{f?.count != null ? ` (${f.count})` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>No assets</Text>
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(a) => String(a.id)}
          numColumns={COLS}
          contentContainerStyle={{ padding: PAD, gap: GAP, paddingBottom: insets.bottom + 20 }}
          columnWrapperStyle={{ gap: GAP }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
          renderItem={({ item }) => {
            const url = item.localUrl || item.url;
            return (
              <TouchableOpacity onPress={() => setSelected(item)} activeOpacity={0.8}>
                <View style={[styles.card, { borderColor: item.hidden ? colors.borderMid : colors.border }]}>
                  {url
                    ? <Image source={{ uri: url }} style={[styles.thumb, { opacity: item.hidden ? 0.35 : 1 }]} resizeMode="cover" />
                    : <View style={[styles.thumb, { backgroundColor: colors.surfaceSink }]} />
                  }
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <AssetModal
        asset={selected}
        colors={colors}
        insets={insets}
        navigation={navigation}
        onClose={() => setSelected(null)}
        onHideToggle={handleHideToggle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  header:      {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: spacing.page, paddingBottom: 12, borderBottomWidth: 1,
  },
  heading:     { fontSize: 22, fontWeight: "700", fontFamily: "Courier New" },
  center:      { flex: 1, alignItems: "center", justifyContent: "center" },
  card:        { borderRadius: radius.sm, overflow: "hidden", borderWidth: 1 },
  thumb:       { width: THUMB, height: THUMB },
  folderPill:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  toggleBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },

  // Modal
  modal:       { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  modalBackBtn: { minWidth: 60 },
  modalImage:  { width: "100%", height: 360 },
  actionRow:   { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn:   { flex: 1, padding: 12, borderRadius: radius.md, alignItems: "center" },
});
