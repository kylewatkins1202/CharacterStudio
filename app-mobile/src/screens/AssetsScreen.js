import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, Dimensions, ActivityIndicator, ScrollView,
  RefreshControl, Modal, Alert, TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { AppStore } from "../stores/AppStore";
import { GenerateStore } from "../stores/GenerateStore";
import { AssetStore } from "../stores/AssetStore";
import { getTheme, spacing, radius } from "../lib/theme";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";
import CSModal from "../components/Modal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS  = 4;
const PAD   = spacing.page;
const GAP   = 4;
const THUMB = (SCREEN_WIDTH - PAD * 2 - (COLS - 1) * GAP) / COLS;

// ─── Asset Modal ──────────────────────────────────────────────────────────────

function AssetModal({ asset, colors, insets, onClose, navigation }) {
  const toast  = useToast();
  
  const imgUrl = asset?.localUrl || asset?.url;
  
  if (!asset) return null;

  const handleAddAsRef = () => {
    GenerateStore.actions.UPDATE_REFERENCE_IMAGES({ url: imgUrl, isUrl: true, purpose: "", assetId: asset.id });
    toast.add("Added as reference", "success");
    onClose();
    navigation.navigate("Generate");
  };

  const handleShare = async () => {
    if (!imgUrl) return;
    try {
      const response = await fetch(imgUrl);
      const contentType = response.headers.get("content-type");
      const extension = contentType?.includes("png") ? "png" : "jpg";
      const buffer = await response.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), ""));
      const fileUri = FileSystem.documentDirectory + `share_${Date.now()}.${extension}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" });
      await Sharing.shareAsync(fileUri);
    } catch (e) {
      toast.add("Share failed: " + e.message, "error");
    }
  };

  const handleToggleHidden = async () => {
    const next = !asset.hidden;
    try {
      const res = await AssetStore.actions.TOGGLE_HIDDEN(asset)
      if (res.ok) {
        toast.add(next ? "Asset hidden" : "Asset visible", "success");
        AssetStore.actions.UPDATE_ASSET({ id: asset.id, hidden: next });
        onClose();
      } else {
        toast.add(res.error || "Update failed", "error")
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Asset", "Permanently delete this asset?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const res = await api.delete(`/assets/${asset.id}`);
            if (res.ok) {
              AssetStore.actions.REMOVE_ASSET(asset.id);
              AssetStore.actions.LOAD_FOLDERS();
              toast.add("Deleted", "success");
              onClose();
            } else {
              toast.add(res.error || "Delete failed", "error");
            }
          } catch (e) {
            toast.add(e.message, "error");
          }
        },
      },
    ]);
  };

  return (
    <CSModal onClose={onClose} colors={colors}>
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
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={styles.modalImage} resizeMode="contain" />
        ) : (
          <View style={[styles.modalImage, { backgroundColor: colors.surfaceSink, alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>No image</Text>
          </View>
        )}

        <View style={[styles.actionRow, { paddingHorizontal: PAD }]}>
          <TouchableOpacity onPress={handleAddAsRef} style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2 }]}>
            <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 13, fontWeight: "600" }}>+ Add as Ref</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, flex: 1 }]}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>↑ Share</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToggleHidden} style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, flex: 1 }]}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>
              {asset.hidden ? "○ Unhide" : "● Hide"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: PAD, marginTop: 8 }}>
          <TouchableOpacity onPress={handleDelete} style={[styles.actionBtn, { borderColor: colors.error, borderWidth: 1 }]}>
            <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 12 }}>✕ Delete</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: PAD, marginTop: 8 }}>
          {asset.folder ? (
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11 }}>Folder: {asset.folder}</Text>
          ) : null}
          {asset.hidden ? (
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginTop: 4 }}>Hidden</Text>
          ) : null}
        </View>
      </ScrollView>
    </CSModal>
  );
}

// ─── Assets Screen ────────────────────────────────────────────────────────────

export default function AssetsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const colors = getTheme(AppStore.useState().theme);
  const toast  = useToast();
  const baseUrl = AppStore.useState().serverUrl
  
  const { folders, selectedFolder, assets, page, total, loading, loadingMore, uploading, showHidden } =
    AssetStore.useState();

  // Local UI state only
  const [refreshing,          setRefreshing]          = useState(false);
  const [selected,            setSelected]            = useState(null);
  const [multiSelectMode,     setMultiSelectMode]     = useState(false);
  const [selectedIds,         setSelectedIds]         = useState(new Set());
  const [moveModalVisible,    setMoveModalVisible]    = useState(false);
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [newFolderName,       setNewFolderName]       = useState("");
  const [creatingFolder,      setCreatingFolder]      = useState(false);


  useEffect(() => {
    AssetStore.actions.LOAD_FOLDERS();
    AssetStore.actions.LOAD_ASSETS({});
  }, []);


  const refresh = useCallback(async (p = 1) => {
    setRefreshing(true);
    await AssetStore.actions.LOAD_ASSETS({ folder: selectedFolder, page: p, showHidden });
    setRefreshing(false);
  }, []);

  const selectFolder = (folderName) => {
    AssetStore.actions.SET_FOLDER(folderName);
    AssetStore.actions.LOAD_ASSETS({ folder: folderName, page: 1, showHidden });
  };

  const toggleHidden = () => {
    const next = !showHidden;
    // AssetStore.actions.SET_FOLDER(selectFolder);
    // AssetStore.actions.SET_SHOW_HIDDEN(next);
    AssetStore.actions.LOAD_ASSETS({ folder: selectedFolder, page: 1, showHidden: next });
  };

  const loadMore = () => {
    if (loadingMore || loading) return;
    if (page * 40 < total) AssetStore.actions.LOAD_MORE();
  };

  // ── Multi-select ──────────────────────────────────────────────────────────────

  const clearSelection = () => {
    setSelectedIds(new Set());
    setMultiSelectMode(false);
  };

  const handleLongPress = (asset) => {
    if (multiSelectMode) return;
    setMultiSelectMode(true);
    setSelectedIds(new Set([String(asset.id)]));
  };

  const toggleSelectAsset = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(String(id))) next.delete(String(id));
      else next.add(String(id));
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(assets.map((a) => String(a.id))));

  const handleBatchDelete = () => {
    const count = selectedIds.size;
    Alert.alert(
      "Delete Assets",
      `Permanently delete ${count} asset${count !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await Promise.all([...selectedIds].map((id) => api.delete(`/assets/${id}`)));
              const removed = new Set(selectedIds);
              [...removed].forEach((id) => AssetStore.actions.REMOVE_ASSET(id));
              AssetStore.actions.LOAD_FOLDERS();
              toast.add(`${count} asset${count !== 1 ? "s" : ""} deleted`, "success");
              clearSelection();
            } catch (e) {
              toast.add(e.message, "error");
            }
          },
        },
      ]
    );
  };

  const handleMove = async (targetFolder) => {
    setMoveModalVisible(false);
    try {
      const array = Array.from(selectedIds);

      const res = await AssetStore.actions.MOVE_ASSETS({ ids: array, folder: targetFolder });
      if (res?.ok) {
        toast.add(`Moved asset to "${targetFolder}"`, "success");
      } else {
        toast.add(res.error || "Move failed", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
  };

  // ── Create folder ─────────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return toast.add("Name required", "error");
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return toast.add("Letters, numbers, _ and - only", "error");
    setCreatingFolder(true);
    try {
      const res = await api.post("/assets/folders", { name });
      if (res.ok) {
        AssetStore.actions.LOAD_FOLDERS();
        toast.add(`Folder "${name}" created`, "success");
        setCreateFolderVisible(false);
        setNewFolderName("");
      } else {
        toast.add(res.error || "Failed to create folder", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
    setCreatingFolder(false);
  };

  // ── Upload ────────────────────────────────────────────────────────────────────

  const uploadImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.85,
      allowsMultipleSelection: true,
    });
    if (result.canceled || !result.assets?.length) return;
    AssetStore.actions.SET_UPLOADING(true);
    try {
      const images = result.assets.map((a) => `data:image/jpeg;base64,${a.base64}`);
      const folder = selectedFolder || "assets";
      const res = await AssetStore.actions.UPLOAD_ASSETS({ images, folder });
      
      if (res?.ok) {
        toast.add(`Assets uploaded`, "success");
        AssetStore.actions.PREPEND_ASSETS(res.assets);
        AssetStore.actions.LOAD_FOLDERS();
      } else {
        toast.add(res.error || "Upload failed", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
    AssetStore.actions.SET_UPLOADING(false);
  }, [selectedFolder, toast]);

  const moveFolderOptions = folders.filter((f) => f.name !== selectedFolder);

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
        {multiSelectMode ? (
          <TouchableOpacity onPress={clearSelection} style={[styles.toggleBtn, { borderColor: colors.borderStrong }]}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>✕ Cancel</Text>
          </TouchableOpacity>
        ) : (
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
              style={[styles.toggleBtn, {
                backgroundColor: showHidden ? colors.borderStrong : "transparent",
                borderColor:     showHidden ? colors.borderFocus : colors.borderStrong,
              }]}
            >
              <Text style={{ color: showHidden ? colors.textMid : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                {showHidden ? "Hide hidden" : "Show hidden"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Folder tabs + Create folder button */}
      {folders.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
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
                  style={[styles.folderPill, {
                    minHeight: 24, marginBottom: 16,
                    backgroundColor: active ? colors.primary : "transparent",
                    borderColor:     active ? colors.primary : colors.borderStrong,
                  }]}
                >
                  <Text style={{ color: active ? colors.primaryText : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                    {label}{f?.count != null ? ` (${f.count})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!multiSelectMode && (
            <TouchableOpacity onPress={() => setCreateFolderVisible(true)} style={{ paddingRight: PAD, paddingBottom: 16 }}>
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 22, lineHeight: 24 }}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Multi-select toolbar */}
      {multiSelectMode && (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.borderMid }]}>
          <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity onPress={selectAll}>
            <Text style={{ color: colors.primary, fontFamily: "Courier New", fontSize: 11 }}>All</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setMoveModalVisible(true)}
            disabled={selectedIds.size === 0}
            style={[styles.barBtn, { borderColor: colors.borderStrong, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
          >
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>Move →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBatchDelete}
            disabled={selectedIds.size === 0}
            style={[styles.barBtn, { borderColor: colors.error, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
          >
            <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 11 }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Asset grid */}
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
          onEndReachedThreshold={0.9}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
          renderItem={({ item }) => {
            const url        = item.url || localUrl;
            const isSelected = selectedIds.has(String(item.id));
            return (
              <TouchableOpacity
                onPress={() => multiSelectMode ? toggleSelectAsset(item.id) : setSelected(item)}
                onLongPress={() => handleLongPress(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.card, {
                  borderColor: isSelected ? colors.primary : item.hidden ? colors.borderMid : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                }]}>
                  {url
                    ? <Image source={{ uri: baseUrl + url }} style={[styles.thumb, { opacity: item.hidden ? 0.35 : 1 }]} resizeMode="cover" />
                    : <View style={[styles.thumb, { backgroundColor: colors.surfaceSink }]} />
                  }
                  {isSelected && (
                    <View style={[styles.checkOverlay, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: colors.primaryText, fontSize: 10, fontWeight: "700" }}>✓</Text>
                    </View>
                  )}
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
      />

      {/* Move-to-folder Modal */}
      <Modal
        visible={moveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMoveModalVisible(false)}
      >
        <View style={styles.overlayBg}>
          <View style={[styles.overlaySheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.overlayTitle, { color: colors.textHigh, borderBottomColor: colors.borderMid }]}>
              Move to folder
            </Text>
            {moveFolderOptions.length === 0 ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12, padding: 16 }}>
                No other folders available
              </Text>
            ) : (
              moveFolderOptions.map((f) => (
                <TouchableOpacity
                  key={f.name}
                  onPress={() => handleMove(f.name)}
                  style={[styles.overlayRow, { borderBottomColor: colors.border }]}
                >
                  <Text style={{ color: colors.textMid, fontFamily: "Courier New", fontSize: 13 }}>{f.name}</Text>
                  <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11 }}>({f.count})</Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity onPress={() => setMoveModalVisible(false)} style={{ padding: 16, alignItems: "center" }}>
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Folder Modal */}
      <Modal
        visible={createFolderVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateFolderVisible(false)}
      >
        <View style={styles.overlayBgCenter}>
          <View style={[styles.overlayCentered, { backgroundColor: colors.surface }]}>
            <Text style={[styles.overlayTitle, { color: colors.textHigh, borderBottomColor: colors.borderMid }]}>
              New Folder
            </Text>
            <View style={{ padding: 16 }}>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="folder-name"
                placeholderTextColor={colors.textGhost}
                autoFocus
                autoCapitalize="none"
                style={[styles.folderInput, {
                  color: colors.textMid,
                  backgroundColor: colors.bg,
                  borderColor: colors.borderStrong,
                }]}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => { setCreateFolderVisible(false); setNewFolderName(""); }}
                  style={[styles.barBtn, { flex: 1, justifyContent: "center", borderColor: colors.borderStrong }]}
                >
                  <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateFolder}
                  disabled={creatingFolder}
                  style={[styles.barBtn, { flex: 1, justifyContent: "center", backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 12, fontWeight: "600" }}>
                    {creatingFolder ? "Creating…" : "Create"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  card:        { borderRadius: radius.sm, overflow: "hidden" },
  thumb:       { width: THUMB, height: THUMB },
  folderPill:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  toggleBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  checkOverlay: {
    position: "absolute", top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  selectionBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: PAD, paddingVertical: 8, borderBottomWidth: 1,
  },
  barBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.md, borderWidth: 1, alignItems: "center",
  },

  // Asset modal
  modalHeader:  {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  modalBackBtn: { minWidth: 60 },
  modalImage:   { width: "100%", height: 360 },
  actionRow:    { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn:    { flex: 1, padding: 12, borderRadius: radius.md, alignItems: "center" },

  // Overlay modals
  overlayBg: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end",
  },
  overlayBgCenter: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", paddingHorizontal: 32,
  },
  overlaySheet: {
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: 24,
  },
  overlayCentered: {
    borderRadius: radius.xl,
  },
  overlayTitle: {
    fontFamily: "Courier New", fontSize: 13, fontWeight: "600",
    padding: 16, borderBottomWidth: 1, textAlign: "center",
  },
  overlayRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  folderInput: {
    borderWidth: 1, borderRadius: radius.md,
    padding: 10, fontFamily: "Courier New", fontSize: 13,
  },
});
