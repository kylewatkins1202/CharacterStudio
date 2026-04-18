import { createReducer } from "react-diffuse";
import { getApi } from "../lib/apiRef.js";

const AssetReducer = createReducer({
  initialState: {
    folders:        [],
    selectedFolder: null,
    assets:         [],
    page:           1,
    pageSize:       40,
    total:          0,
    loading:        true,
    loadingMore:    false,
    uploading:      false,
    showHidden:     false,
    error:          null,
  },

  actions: {
    LOAD_FOLDERS: async ({ state }, { SUCCESS, FAIL }) => {
      try {
        const res = await getApi().get("/assets/folders");
        if (res.ok) {
          return SUCCESS({ folders: res.folders ?? [] });
        } else {
          return FAIL({ error: res.error || "Failed to load folders" });
        }
      } catch (e) {
        return FAIL({ error: e.message });
      }
    },

    LOAD_ASSETS: async ({ state, payload }, { SUCCESS, LOADING, FAIL }) => {
      const folder     = payload?.folder !== undefined ? payload?.folder : state.selectedFolder;
      const showHidden = payload?.showHidden  ?? state.showHidden;
      const page = payload?.page ?? state?.page
      const { pageSize, } = state;
      LOADING({ loading: true });

      try {
        const folderParam  = folder     ? `&folder=${encodeURIComponent(folder)}` : "";
        const hiddenParam  = showHidden ? "" : "&hidden=false";
        
        const res = await getApi().get(`/assets?page=${page ?? 1}&pageSize=${pageSize}${folderParam}${hiddenParam}`);
        if (res.ok) {
          return SUCCESS({
            ok: true,
            assets:  res.assets ?? [],
            total:   res.total  ?? 0,
            page:     page ?? 1,
            loading: false,
            showHidden,
            ...(folder !== undefined ? { selectedFolder: folder } : {}),
          });
        } else {
          return FAIL({ error: res.error || "Failed to load assets", loading: false });
        }
      } catch (e) {
        return FAIL({ error: e.message, loading: false });
      }
    },

    LOAD_MORE: async ({ state }, { SUCCESS, FAIL, LOADING, LOAD_ASSETS }) => {
      if (state.loadingMore) return;
      const nextPage = state.page + 1;
      const { pageSize, selectedFolder, showHidden } = state;

      LOADING({ loadingMore: true });

      try {
        const folderParam = selectedFolder ? `&folder=${encodeURIComponent(selectedFolder)}` : "";
        const hiddenParam = showHidden ? "" : "&hidden=false";
        const res = await getApi().get(`/assets?page=${nextPage}&pageSize=${pageSize}${folderParam}${hiddenParam}`);
        if (res.ok) {
          return SUCCESS({
            assets:      [...state.assets, ...(res.assets ?? [])],
            total:       res.total ?? state.total,
            page:        nextPage,
            loadingMore: false,
          });
        } else {
          return SUCCESS({ ok: true, loadingMore: false });
        }
      } catch (e) {
        return SUCCESS({ loadingMore: false, error: e.message });
      }
    },

    SET_FOLDER: ({ payload }) => ({
      selectedFolder: payload,
      assets:         [],
      page:           1,
      loading:        true,
    }),

    SET_SHOW_HIDDEN: ({ payload }) => ({ showHidden: payload }),
    SET_LOADING:     ({ payload }) => ({ loading: payload }),
    SET_FOLDERS:     ({ payload }) => ({ folders: payload }),
    SET_UPLOADING:   ({ payload }) => ({ uploading: payload }),

    REMOVE_ASSET: ({ state, payload: id }) => ({
      assets: state.assets.filter((a) => a.id !== id),
      total:  Math.max(0, state.total - 1),
    }),

    UPDATE_ASSET: ({ state, payload }) => ({
      assets: state.assets.map((a) => (a.id === payload.id ? { ...a, ...payload } : a)),
    }),

    PREPEND_ASSETS: ({ state, payload }) => ({
      assets: Array.isArray(payload) ? [...payload, ...state.assets] : [payload, ...state.assets],
      total:  state.total + (Array.isArray(payload) ? payload.length : 1),
    }),

    UPLOAD_ASSETS: async ({ state, payload }, { SUCCESS, FAIL, LOADING, LOAD_ASSETS, LOAD_FOLDERS }) => {
      const { images, folder } = payload;
      LOADING({ uploading: true });
      
      try {
        console.log("attempt upload")
        const res = await getApi().post("/assets", { images, folder: folder ?? state.selectedFolder });
        if (res.ok) {
          const newAssets = res.assets ?? [];
          let assets = [...newAssets, ...state.assets]
          let total = state.total + newAssets.length
          LOADING({
            assets,
            total,
          });

          // Reload assets
          // await LOAD_ASSETS({folder, showHidden: false})
          
          // Reload folders
          let folderRes = await LOAD_FOLDERS()

          return SUCCESS({ ok: true, folders: folderRes.folders ?? [], uploading: false });
        } else {
          return FAIL({ error: res.error || "Upload failed", uploading: false });
        }
      } catch (e) {
        return FAIL({ error: e.message, uploading: false });
      }
    },

    CREATE_FOLDER: async ({ state, payload }, { SUCCESS, FAIL, LOAD_FOLDERS, LOADING }) => {
      const { name } = payload;

      try {
        const res = await getApi().post("/assets/folders", { name });
        if (res.ok) {
          LOADING({ folders: [...state.folders, { name, count: 0, builtin: false }] })
          await LOAD_FOLDERS()
          return SUCCESS({ok: true});
        } else {
          return FAIL({ error: res.error || "Failed to create folder" });
        }
      } catch (e) {
        return FAIL({ error: e.message });
      }
    },

    DELETE_FOLDER: async ({ state, payload: name }, { SUCCESS, FAIL, LOAD_FOLDERS }) => {
      try {
        const res = await getApi().delete(`/assets/folders/${encodeURIComponent(name)}`);
        if (res.ok) {
          await LOAD_FOLDERS()
          return SUCCESS({ ok: true, folders: state.folders.filter((f) => f.name !== name) });
        } else {
          return FAIL({ error: res.error || "Failed to delete folder" });
        }
      } catch (e) {
        return FAIL({ error: e.message });
      }
    },

    MOVE_ASSETS: async ({ state, payload }, { SUCCESS, FAIL, LOADING, LOAD_ASSETS, LOAD_FOLDERS }) => {
      const { ids, folder } = payload;
      try {
        LOADING({})
        const res = await getApi().post("/assets/move", { ids, folder });
        if (res.ok) {
          // Remove moved assets from current view if in a specific folder
          const nextAssets = state.selectedFolder
            ? state.assets.filter((a) => !ids.includes(a.id))
            : state.assets;
          
          // Add data
          LOADING({assets: nextAssets})
          
          // Reload assets
          await LOAD_ASSETS({folder: state.currentFolder, showHidden: false, page: 1})
            
            // Reload folders
          let folderRes = await LOAD_FOLDERS()

          return SUCCESS({ok: true, folders: folderRes.folders});
        } 
        else {
          return FAIL({ error: res.error || "Failed to move assets" });
        }
      } catch (e) {
        return FAIL({ error: e.message });
      }
    },

    DELETE_ASSET: async ({ state, payload: id }, { SUCCESS, FAIL, LOADING, LOAD_ASSETS }) => {
      try {
        const res = await getApi().delete(`/assets/${id}`);
        if (res.ok) {
            let newAssets = state.assets.filter((a) => a.id !== id)
            LOADING({
              assets: newAssets,
              total:  Math.max(0, state.total - 1),
            })

          if (newAssets.length === 1 && state.page > 1) {
            await LOAD_ASSETS({folder: state.currentFolder, page: state.page - 1, showHidden: false})
          }

          await AssetStore.actions.LOAD_FOLDERS();

          return SUCCESS({ok: true})
        } else {
          return FAIL({ error: res.error || "Delete failed" })
        }
      } catch (e) {
        return FAIL({ error: e.message })
      }
    },

    TOGGLE_HIDDEN: async ({ state, payload: asset }, { SUCCESS, FAIL }) => {
      const next = !asset.hidden;
      try {
        const res = await getApi().patch(`/assets/${asset.id}`, { hidden: next });
        if (res.ok) {
          return SUCCESS({
            ok: true,
            assets: state.assets.map((a) => (a.id === asset.id ? { ...a, hidden: next } : a)),
          });
        } else {
          return FAIL({ error: res.error || "Failed to update asset" });
        }
      } catch (e) {
        return FAIL({ error: e.message });
      }
    },
  },
});

export const AssetStore = AssetReducer.createFuseBox("AssetStore");
