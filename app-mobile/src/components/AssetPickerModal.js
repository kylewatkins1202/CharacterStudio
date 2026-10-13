/**
 * AssetPickerModal
 *
 * Full-screen modal asset browser with multi-select. Reused by:
 *   - GenerateScreen (pick reference images from asset library)
 *   - TagsScreen (pick existing assets to assign to a tag group)
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onSelect   {(assets: Asset[]) => void}  called when user presses Done
 *   multiple   {boolean}  default true — allow multi-select
 *   title      {string}   modal header title
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, Modal, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppStore } from "../stores/AppStore";
import { getTheme, spacing, radius } from "../lib/theme";
import { api } from "../lib/api";
import CSModal from "./Modal";
import Image from "./Image";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS  = 4;
const PAD   = spacing.page;
const GAP   = 4;
const THUMB = (SCREEN_WIDTH - PAD * 2 - (COLS - 1) * GAP) / COLS;

export default function AssetPickerModal({ visible, onClose, onSelect, multiple = true, title = "Pick Asset" }) {
  if (!visible) return null
  const insets = useSafeAreaInsets();
  const {theme} = AppStore.useState()
  const colors = getTheme();

  const [folders,        setFolders]        = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [assets,         setAssets]         = useState([]);
  const [page,           setPage]           = useState(1);
  const [total,          setTotal]          = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [selected,       setSelected]       = useState({}); // { [assetId]: asset }

  
  const loadFolders = useCallback(async () => {
    try {
      const res = await api.get("/assets/folders");
      if (res.ok) setFolders(res.folders || []);
    } catch {}
  }, []);

  const load = useCallback(async (folderName = selectedFolder, p = 1) => {
    if (p === 1) { setLoading(true); setAssets([]); }
    else         setLoadingMore(true);
    try {
      const folderParam = folderName ? `&folder=${encodeURIComponent(folderName)}` : "";
      const res = await api.get(`/assets?page=${p}&pageSize=40&hidden=false${folderParam}`);
      if (res.ok) {
        setAssets((prev) => p === 1 ? res.assets : [...prev, ...res.assets]);
        setTotal(res.total ?? 0);
        setPage(p);
      }
    } catch {}
    setLoading(false);
    setLoadingMore(false);
  }, [selectedFolder]);

  // Load when modal opens
  useEffect(() => {
    if (visible) {
      setSelected({});
      setSelectedFolder(null);
      loadFolders();
      load(null, 1);
    }
  }, [visible]);

  const selectFolder = (folderName) => {
    setSelectedFolder(folderName);
    load(folderName, 1);
  };

  const loadMore = () => {
    if (loadingMore || loading) return;
    if (page * 40 < total) load(selectedFolder, page + 1);
  };

  const toggleSelect = (asset) => {
    if (!multiple) {
      // Single-select: immediately confirm
      onSelect([asset]);
      return;
    }
    setSelected((prev) => {
      if (prev[asset.id]) {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      }
      return { ...prev, [asset.id]: asset };
    });
  };

  const selectedList = Object.values(selected);
  const selectedCount = selectedList.length;

  const handleDone = () => {
    if (selectedCount > 0) onSelect(selectedList);
    else onClose();
  };

  return (
    <CSModal visible={visible} animationType="slide" onRequestClose={onClose} colors={colors}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textHigh, fontFamily: "Courier New", fontSize: 14, fontWeight: "700", flex: 1, textAlign: "center" }}>
            {title}
          </Text>
          <TouchableOpacity onPress={handleDone} style={[styles.headerBtn, { alignItems: "flex-end" }]}>
            <Text style={{ color: colors.primary, fontFamily: "Courier New", fontSize: 13, fontWeight: "700" }}>
              {multiple ? `Done${selectedCount > 0 ? ` (${selectedCount})` : ""}` : "Cancel"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Folder tabs */}
        {folders.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: 8, gap: 6, flexDirection: "row" }}
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
                      backgroundColor: active ? colors.primary : "transparent",
                      borderColor:     active ? colors.primary : colors.borderStrong,
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
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
            renderItem={({ item }) => {
              const url        = item.localUrl || item.url;
              const isSelected = !!selected[item.id];
              return (
                <TouchableOpacity onPress={() => toggleSelect(item)} activeOpacity={0.75}>
                  <View style={[styles.card, { borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }]}>
                    {url
                      ? <Image src={url} style={styles.thumb} resizeMode="cover" />
                      : <View style={[styles.thumb, { backgroundColor: colors.surfaceSink }]} />
                    }
                    {isSelected && (
                      <View style={[styles.checkOverlay, { backgroundColor: colors.primary + "cc" }]}>
                        <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: "700" }}>✓</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </CSModal>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  headerBtn:    { minWidth: 70 },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  folderPill:   { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  card:         { borderRadius: radius.sm, overflow: "hidden", position: "relative" },
  thumb:        { width: THUMB, height: THUMB },
  checkOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
});
