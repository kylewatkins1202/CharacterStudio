import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Image,
  StyleSheet, Dimensions, ActivityIndicator, Modal, ScrollView, Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppStore } from "../stores/AppStore";
import { getTheme, spacing, radius, TYPE_COLOR, TYPE_ICON } from "../lib/theme";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";
import AssetPickerModal from "../components/AssetPickerModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAD      = spacing.page;
const CARD_GAP = 8;
const CARD_W   = (SCREEN_WIDTH - PAD * 2 - CARD_GAP) / 2;
const IMG_H    = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTagGroups(type) {
  if (type === "character") return ["face", "body"];
  if (type === "prop")      return ["prop"];
  if (type === "outfit")    return ["outfit"];
  return ["location"];
}

function getTagPreview(tag, {baseUrl}) {
  if (!tag?.assets) return null;
  
  for (const [_, group] of Object.entries(tag.assets)) {
    if (group?.length > 0)  {
      let preview = ((group?.[0]?.url || group?.[0]?.localUrl))
      if (preview.startsWith('/api') && baseUrl) {
        preview = baseUrl + preview
      } 

      return preview
    }
  }
  return null;
}

function getAllTagAssets(tag) {
  if (!tag?.assets) return [];
  return Object.values(tag.assets).flat();
}

// ─── Tag Form Modal (Create / Edit) ──────────────────────────────────────────

function TagFormModal({ existingTag, colors, insets, onClose, onSaved, toast }) {
  const isEdit = !!existingTag;
  const baseUrl = AppStore.useState().serverUrl

  const [type,       setType]       = useState(existingTag?.type || null);
  const [key,        setKey]        = useState(existingTag?.key || "");
  const [basicDesc,  setBasicDesc]  = useState(existingTag?.lock?.basicDescription || "");
  const [appearDesc, setAppearDesc] = useState(existingTag?.lock?.appearanceDescription || "");
  const [bodyDesc,   setBodyDesc]   = useState(existingTag?.lock?.bodyDescription || "");
  const [saving,      setSaving]      = useState(false);
  const [pickerGroup, setPickerGroup] = useState(null); // which group the asset picker is open for
  // Staged base64 images per group
  const [staged,      setStaged]      = useState({ face: [], body: [], prop: [], outfit: [], location: [] });
  // Staged asset IDs picked from library (assigned after creation)
  const [pickedAssets, setPickedAssets] = useState({ face: [], body: [], prop: [], outfit: [], location: [] });

  const pickImages = useCallback(async (group) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets?.length) {
      const data = result.assets.map((a) => `data:image/jpeg;base64,${a.base64}`);
      setStaged((prev) => ({ ...prev, [group]: [...prev[group], ...data] }));
    }
  }, []);

  const removeStaged = (group, idx) => {
    setStaged((prev) => ({ ...prev, [group]: prev[group].filter((_, i) => i !== idx) }));
  };

  const removePicked = (group, id) => {
    setPickedAssets((prev) => ({ ...prev, [group]: prev[group].filter((a) => a.id !== id) }));
  };

  const handlePickedAssets = (assets) => {
    if (!pickerGroup) return;
    setPickedAssets((prev) => ({ ...prev, [pickerGroup]: [...prev[pickerGroup], ...assets] }));
    setPickerGroup(null);
  };

  const handleSave = async () => {
    if (!key.trim()) return toast.add("Key is required", "error");
    if (!type)       return toast.add("Select a type", "error");
    setSaving(true);
    try {
      const res = await api.post("/tag", {
        key: key.trim(),
        type,
        basicDescription:      basicDesc,
        appearanceDescription: appearDesc,
        bodyDescription:       bodyDesc,
        ...staged,
      });
      if (!res.ok) {
        toast.add(res.error || "Save failed", "error");
        setSaving(false);
        return;
      }
      const tagKey = res.tag.key;
      // Assign any picked existing assets to the tag
      for (const [group, assets] of Object.entries(pickedAssets)) {
        for (const asset of assets) {
          await api.post(`/tags/${tagKey}/assets/${asset.id}`, { group });
        }
      }
      toast.add(isEdit ? "Tag updated!" : "Tag created!", "success");
      onSaved(res.tag);
    } catch (e) {
      toast.add(e.message, "error");
    }
    setSaving(false);
  };

  const groups = type ? getTagGroups(type) : [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalBackBtn}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 13 }}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textHigh, fontFamily: "Courier New", fontSize: 14, fontWeight: "700", flex: 1, textAlign: "center" }}>
            {isEdit ? `Edit @${existingTag.key}` : "New Tag"}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !type}
            style={[styles.modalBackBtn, { alignItems: "flex-end" }]}
          >
            <Text style={{ color: (saving || !type) ? colors.textGhost : colors.primary, fontFamily: "Courier New", fontSize: 13, fontWeight: "600" }}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: PAD, gap: 20, paddingBottom: insets.bottom + 20 }}>

          {/* Type picker (create only) */}
          {!isEdit && (
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {["character", "prop", "outfit", "location"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setType(t)}
                    style={[
                      styles.typePill,
                      {
                        backgroundColor: type === t ? TYPE_COLOR[t] + "22" : "transparent",
                        borderColor:     type === t ? TYPE_COLOR[t] : colors.borderStrong,
                      },
                    ]}
                  >
                    <Text style={{ color: type === t ? TYPE_COLOR[t] : colors.textMuted, fontFamily: "Courier New", fontSize: 13, textAlign: "center" }}>
                      {TYPE_ICON[t]}{"\n"}{t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Key */}
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Key</Text>
            <TextInput
              value={key}
              onChangeText={(v) => setKey(v.replace(/\s/g, "_").toLowerCase())}
              editable={!isEdit}
              placeholder="e.g. aria_chen"
              placeholderTextColor={colors.textGhost}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: isEdit ? colors.textDim : colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
            />
            {key ? (
              <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 10, marginTop: 4 }}>
                Referenced as @{key}
              </Text>
            ) : null}
          </View>

          {/* Descriptions */}
          {type === "character" && (<>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Appearance Description</Text>
              <TextInput
                value={appearDesc}
                onChangeText={setAppearDesc}
                multiline
                placeholder="Face, hair, skin… (auto-generated by vision if blank)"
                placeholderTextColor={colors.textGhost}
                style={[styles.textarea, { color: colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Body Description</Text>
              <TextInput
                value={bodyDesc}
                onChangeText={setBodyDesc}
                multiline
                placeholder="Physique, proportions…"
                placeholderTextColor={colors.textGhost}
                style={[styles.textarea, { color: colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
              />
            </View>
          </>)}

          {(type === "prop" || type === "outfit" || type === "location") && (
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Description</Text>
              <TextInput
                value={basicDesc}
                onChangeText={setBasicDesc}
                multiline
                placeholder={`Describe the ${type}…`}
                placeholderTextColor={colors.textGhost}
                style={[styles.textarea, { color: colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
              />
            </View>
          )}

          {/* Image upload per group */}
          {groups.map((group) => (
            <View key={group}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>{group} images</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setPickerGroup(group)}
                    style={[styles.smallBtn, { borderColor: colors.borderStrong }]}
                  >
                    <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>From assets</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => pickImages(group)}
                    style={[styles.smallBtn, { borderColor: colors.borderStrong }]}
                  >
                    <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>+ Upload</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Picked from library */}
              {pickedAssets[group].length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {pickedAssets[group].map((asset) => {
                      const url =asset.url || asset.localUrl;
                      return (
                        <View key={asset.id} style={{ position: "relative" }}>
                          <Image source={{ uri: url.startsWith('/api') ? baseUrl + url : url }} style={{ width: 80, height: 80, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary }} resizeMode="cover" />
                          <View style={{ position: "absolute", top: 2, left: 4, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                            <Text style={{ color: colors.primary, fontFamily: "Courier New", fontSize: 8 }}>asset</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => removePicked(group, asset.id)}
                            style={[styles.removeBtn, { backgroundColor: colors.error }]}
                          >
                            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>×</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* Uploaded photos staged */}
              {staged[group].length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {staged[group].map((uri, idx) => (
                      <View key={idx} style={{ position: "relative" }}>
                        <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: radius.md }} resizeMode="cover" />
                        <TouchableOpacity
                          onPress={() => removeStaged(group, idx)}
                          style={[styles.removeBtn, { backgroundColor: colors.error }]}
                        >
                          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : pickedAssets[group].length === 0 ? (
                <TouchableOpacity
                  onPress={() => pickImages(group)}
                  style={[styles.uploadZone, { borderColor: colors.borderStrong }]}
                >
                  <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>
                    Tap to add {group} images
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {!type && (
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12, textAlign: "center", paddingVertical: 8 }}>
              Select a type above to continue
            </Text>
          )}
        </ScrollView>
      </View>

      {/* Asset picker for picking from library */}
      <AssetPickerModal
        visible={!!pickerGroup}
        onClose={() => setPickerGroup(null)}
        onSelect={handlePickedAssets}
        title={`Pick ${pickerGroup || ""} images`}
        multiple
      />
    </Modal>
  );
}

// ─── Tag Detail Modal ─────────────────────────────────────────────────────────

function TagDetailModal({ tag: initialTag, colors, insets, onClose, onUpdated, onDeleted, toast }) {
  const [tag,         setTag]         = useState(initialTag);
  const [editing,     setEditing]     = useState(false);
  const [addingGroup, setAddingGroup] = useState(null); // group currently being picked via asset picker
  const [saving,      setSaving]      = useState(false);
  const baseUrl = AppStore.useState().serverUrl

  // Reload full tag data (with populated assets) on open
  useEffect(() => {
    api.get(`/tags/${initialTag.key}`).then((res) => {
      if (res.ok && res.tag) setTag(res.tag);
    }).catch(() => {});
  }, [initialTag.key]);

  const groups = getTagGroups(tag.type);

  const handleToggleHidden = async () => {
    const next = !tag.hidden;
    const res = await api.patch(`/tags/${tag.key}`, { hidden: next });
    if (res.ok) {
      setTag((t) => ({ ...t, hidden: next }));
      onUpdated({ ...tag, hidden: next });
      toast.add(next ? "Tag hidden" : "Tag visible", "success");
    }
  };

  const handleDeleteTag = () => {
    Alert.alert(
      `Delete @${tag.key}?`,
      "This permanently removes the tag. Its images will be unassigned (not deleted).",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          const res = await api.delete(`/tags/${tag.key}`);
          if (res.ok) {
            toast.add(`@${tag.key} deleted`, "success");
            onDeleted(tag.key);
          } else {
            toast.add(res.error || "Delete failed", "error");
          }
        }},
      ]
    );
  };

  const reloadTag = async () => {
    const full = await api.get(`/tags/${tag.key}`);
    if (full.ok) { setTag(full.tag); onUpdated(full.tag); }
  };

  const pickAndUpload = async (group) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (result.canceled || !result.assets?.length) return;
    setSaving(true);
    const data = result.assets.map((a) => `data:image/jpeg;base64,${a.base64}`);
    try {
      const res = await api.post(`/tags/${tag.key}/images`, { [group]: data });
      if (res.ok) {
        toast.add("Images added!", "success");
        await reloadTag();
      } else {
        toast.add(res.error || "Upload failed", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
    setSaving(false);
  };

  const assignPickedAssets = async (assets) => {
    if (!addingGroup || !assets.length) { setAddingGroup(null); return; }
    setSaving(true);
    try {
      await Promise.all(
        assets.map((a) => api.post(`/tags/${tag.key}/assets/${a.id}`, { group: addingGroup }))
      );
      toast.add("Assets assigned!", "success");
      await reloadTag();
    } catch (e) {
      toast.add(e.message, "error");
    }
    setSaving(false);
    setAddingGroup(null);
  };

  const handleRemoveImage = async (group, assetId) => {
    try {
      const res = await api.delete(`/tags/${tag.key}/images`, { [group]: [assetId] });
      if (res.ok) {
        toast.add("Image removed", "success");
        const full = await api.get(`/tags/${tag.key}`);
        if (full.ok) { setTag(full.tag); onUpdated(full.tag); }
      } else {
        toast.add(res.error || "Failed", "error");
      }
    } catch (e) {
      toast.add(e.message, "error");
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalBackBtn}>
            <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 13 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textHigh, fontFamily: "Courier New", fontSize: 14, fontWeight: "700" }}>
            @{tag.key}
            <Text style={{ color: TYPE_COLOR[tag.type], fontSize: 12 }}> {TYPE_ICON[tag.type]}</Text>
          </Text>
          <View style={{ minWidth: 60 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: PAD, gap: 16, paddingBottom: insets.bottom + 20 }}>

          {/* Action buttons row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => setEditing(true)}
              style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1 }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleHidden}
              style={[styles.actionBtn, {
                backgroundColor: tag.hidden ? colors.borderStrong : "transparent",
                borderColor: colors.borderStrong, borderWidth: 1,
              }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: "Courier New", fontSize: 12 }}>
                {tag.hidden ? "○ Unhide" : "● Hide"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDeleteTag}
              style={[styles.actionBtn, { borderColor: colors.error, borderWidth: 1 }]}
            >
              <Text style={{ color: colors.error, fontFamily: "Courier New", fontSize: 12 }}>Delete</Text>
            </TouchableOpacity>
          </View>

          {/* Descriptions */}
          {tag.lock?.basicDescription ? (
            <View style={[styles.descBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Description</Text>
              <Text style={{ color: colors.textMid, fontFamily: "Courier New", fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                {tag.lock.basicDescription}
              </Text>
            </View>
          ) : null}
          {tag.lock?.appearanceDescription ? (
            <View style={[styles.descBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Appearance</Text>
              <Text style={{ color: colors.textMid, fontFamily: "Courier New", fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                {tag.lock.appearanceDescription}
              </Text>
            </View>
          ) : null}
          {tag.lock?.bodyDescription ? (
            <View style={[styles.descBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>Body</Text>
              <Text style={{ color: colors.textMid, fontFamily: "Courier New", fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                {tag.lock.bodyDescription}
              </Text>
            </View>
          ) : null}

          {/* Asset groups */}
          {groups.map((group) => {
            const groupAssets = tag.assets?.[group] || [];
            return (
              <View key={group}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textGhost }]}>
                    {group} ({groupAssets.length})
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => setAddingGroup(group)}
                      disabled={saving}
                      style={[styles.smallBtn, { borderColor: colors.borderStrong }]}
                    >
                      <Text style={{ color: saving ? colors.textGhost : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                        From assets
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => pickAndUpload(group)}
                      disabled={saving}
                      style={[styles.smallBtn, { borderColor: colors.borderStrong }]}
                    >
                      <Text style={{ color: saving ? colors.textGhost : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                        {saving ? "Uploading…" : "+ Upload"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {groupAssets.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {groupAssets.map((asset) => {
                        const url = asset.url || asset.localUrl;
                        return (
                          <View key={asset.id} style={{ position: "relative" }}>
                            <Image
                              source={{ uri: url.startsWith('/api') ? (baseUrl + url) : url }}
                              style={{ width: 88, height: 88, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderMid }}
                              resizeMode="cover"
                            />
                            <TouchableOpacity
                              onPress={() => handleRemoveImage(group, asset.id)}
                              style={[styles.removeBtn, { backgroundColor: "rgba(0,0,0,0.8)" }]}
                            >
                              <Text style={{ color: "#ff3b3b", fontSize: 12, fontWeight: "700" }}>×</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : (
                  <TouchableOpacity
                    onPress={() => pickAndUpload(group)}
                    style={[styles.uploadZone, { borderColor: colors.borderStrong }]}
                  >
                    <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 12 }}>
                      No {group} images — tap to add
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Meta */}
          {tag.meta?.createdAt ? (
            <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 10 }}>
              Created {new Date(tag.meta.createdAt).toLocaleDateString()}
              {tag.meta.updatedAt ? `  ·  Updated ${new Date(tag.meta.updatedAt).toLocaleDateString()}` : ""}
            </Text>
          ) : null}
        </ScrollView>
      </View>

      {/* Edit form opens on top */}
      {editing && (
        <TagFormModal
          existingTag={tag}
          colors={colors}
          insets={insets}
          toast={toast}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setTag((t) => ({ ...t, ...updated }));
            onUpdated(updated);
            setEditing(false);
            toast.add("Tag updated!", "success");
          }}
        />
      )}

      {/* Asset picker for adding existing assets to a group */}
      <AssetPickerModal
        visible={!!addingGroup}
        onClose={() => setAddingGroup(null)}
        onSelect={assignPickedAssets}
        title={`Pick ${addingGroup || ""} images`}
        multiple
      />
    </Modal>
  );
}

// ─── Tags Screen ──────────────────────────────────────────────────────────────

export default function TagsScreen() {
  const insets = useSafeAreaInsets();
  const colors = getTheme(AppStore.useState().theme);
  const toast  = useToast();
  const tags   = AppStore.useState().tags;

  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState(null);
  const [showHidden,  setShowHidden]  = useState(false);
  const [showAll,     setShowAll]     = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [creating,    setCreating]    = useState(false);
  const baseUrl = AppStore.useState().serverUrl
  useEffect(() => {
    AppStore.actions.LOAD_TAGS({});
  }, []);

  const visible = tags.filter((t) => {
    if (!showHidden && t.hidden) return false;
    if (typeFilter && t.type !== typeFilter) return false;
    if (search && !t.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const hiddenCount = tags.filter((t) => t.hidden).length;
  const types = ["character", "prop", "outfit", "location"];

  const handleTagUpdated = useCallback((updated) => {
    AppStore.actions.LOAD_TAGS({});
    // Update selectedTag if it's the same tag
    if (selectedTag?.key === updated?.key) {
      setSelectedTag((t) => t ? { ...t, ...updated } : t);
    }
  }, [selectedTag]);

  const handleTagDeleted = useCallback(() => {
    AppStore.actions.LOAD_TAGS({});
    setSelectedTag(null);
  }, []);

  const handleTagCreated = useCallback(() => {
    AppStore.actions.LOAD_TAGS({});
    setCreating(false);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.textHigh }]}>Tags</Text>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 11, marginTop: 2 }}>
            {tags.length} tags
          </Text>
        </View>
        <View style={{ gap: 6, alignItems: "flex-end" }}>
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
          {hiddenCount > 0 && (
            <TouchableOpacity
              onPress={() => { const next = !showHidden; setShowHidden(next); if (!next) setShowAll(false); }}
              style={[styles.filterBtn, {
                backgroundColor: showHidden ? colors.borderStrong : "transparent",
                borderColor:     showHidden ? colors.borderFocus  : colors.borderStrong,
              }]}
            >
              <Text style={{ color: showHidden ? colors.textMid : colors.textMuted, fontFamily: "Courier New", fontSize: 10 }}>
                {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setCreating(true)}
            style={[styles.filterBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryText, fontFamily: "Courier New", fontSize: 10, fontWeight: "700" }}>
              + New Tag
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search + type filters */}
      <View style={{ paddingHorizontal: PAD, paddingVertical: 10, gap: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search tags…"
          placeholderTextColor={colors.textGhost}
          style={[styles.input, { color: colors.textMid, backgroundColor: colors.surface, borderColor: colors.borderMid }]}
        />
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[null, ...types].map((t) => (
            <TouchableOpacity
              key={t ?? "all"}
              onPress={() => setTypeFilter(typeFilter === t ? null : t)}
              style={[
                styles.typePillSmall,
                {
                  backgroundColor: typeFilter === t ? (t ? TYPE_COLOR[t] + "22" : colors.primary + "22") : "transparent",
                  borderColor:     typeFilter === t ? (t ? TYPE_COLOR[t] : colors.primary) : colors.borderStrong,
                },
              ]}
            >
              <Text style={{ color: typeFilter === t ? (t ? TYPE_COLOR[t] : colors.primary) : colors.textMuted, fontFamily: "Courier New", fontSize: 11 }}>
                {t ? `${TYPE_ICON[t]} ${t}` : "All"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 13 }}>
            {search || typeFilter ? "No tags match your filters" : "No tags yet — create one to get started"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.key}
          numColumns={2}
          contentContainerStyle={{ padding: PAD, gap: CARD_GAP, paddingBottom: insets.bottom + 20 }}
          columnWrapperStyle={{ gap: CARD_GAP }}
          renderItem={({ item: tag }) => {
            let preview    = getTagPreview(tag, {baseUrl: baseUrl});
          
            const allAssets  = getAllTagAssets(tag);
            const dimmed     = tag.hidden && !showAll;
            return (
              <TouchableOpacity
                onPress={() => setSelectedTag(tag)}
                activeOpacity={0.85}
                style={{ width: CARD_W, opacity: dimmed ? 0.45 : 1 }}
              >
                <View style={[styles.tagCard, { backgroundColor: colors.surface, borderColor: tag.hidden ? colors.borderMid : colors.border }]}>
                  {/* Preview image — column-first */}
                  <View style={[styles.tagPreview, { backgroundColor: colors.surfaceSink }]}>
                    {preview ? (
                      <Image
                        source={{ uri: preview }}
                        style={[StyleSheet.absoluteFill, { opacity: dimmed ? 0.2 : 1 }]}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ color: TYPE_COLOR[tag.type] + "55", fontSize: 32 }}>
                        {TYPE_ICON[tag.type]}
                      </Text>
                    )}
                  </View>

                  {/* Text below */}
                  <View style={{ padding: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.textMid, fontFamily: "Courier New", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                        @{tag.key}
                      </Text>
                      <Text style={{ color: TYPE_COLOR[tag.type], fontSize: 12 }}>
                        {TYPE_ICON[tag.type]}
                      </Text>
                    </View>
                    {(tag.lock?.basicDescription || tag.lock?.appearanceDescription) ? (
                      <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 10, marginTop: 3, lineHeight: 14 }} numberOfLines={2}>
                        {tag.lock.basicDescription || tag.lock.appearanceDescription}
                      </Text>
                    ) : null}
                    <Text style={{ color: colors.textGhost, fontFamily: "Courier New", fontSize: 10, marginTop: 4 }}>
                      {allAssets.length} image{allAssets.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Tag detail modal */}
      {selectedTag && (
        <TagDetailModal
          tag={selectedTag}
          colors={colors}
          insets={insets}
          toast={toast}
          onClose={() => setSelectedTag(null)}
          onUpdated={handleTagUpdated}
          onDeleted={handleTagDeleted}
        />
      )}

      {/* Create tag modal */}
      {creating && (
        <TagFormModal
          colors={colors}
          insets={insets}
          toast={toast}
          onClose={() => setCreating(false)}
          onSaved={handleTagCreated}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  heading:      { fontSize: 22, fontWeight: "700", fontFamily: "Courier New" },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  input:        { borderWidth: 1, borderRadius: radius.md, padding: 10, fontFamily: "Courier New", fontSize: 12 },
  textarea:     { borderWidth: 1, borderRadius: radius.md, padding: 10, fontFamily: "Courier New", fontSize: 12, minHeight: 70, textAlignVertical: "top" },
  filterBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  typePillSmall:{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  typePill:     { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, alignItems: "center" },
  fieldLabel:   { fontFamily: "Courier New", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  smallBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.md, borderWidth: 1 },
  uploadZone:   { borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, padding: 14, alignItems: "center" },
  removeBtn:    { position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  descBlock:    { padding: 12, borderRadius: radius.md, borderWidth: 1 },

  // Tag card (2-column)
  tagCard:      { borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  tagPreview:   { width: "100%", height: IMG_H, alignItems: "center", justifyContent: "center", overflow: "hidden" },

  // Modal
  modal:        { flex: 1 },
  modalHeader:  {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: PAD, paddingBottom: 10, borderBottomWidth: 1,
  },
  modalBackBtn: { minWidth: 60 },
  actionRow:    { flexDirection: "row", gap: 8 },
  actionBtn:    { flex: 1, padding: 10, borderRadius: radius.md, alignItems: "center" },
});
