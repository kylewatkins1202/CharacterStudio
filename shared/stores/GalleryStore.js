import { createReducer } from "react-diffuse";
import { getApi } from "../lib/apiRef.js";

const GalleryReducer = createReducer({
  initialState: {
    entries:    [],
    loading:    true,
    page:       1,
    pageSize:   20,
    total:      0,
    totalPages: 1,
    showHidden: false,
    error:      null,
  },

  actions: {
    LOAD_PAGE: async ({ state, payload }, { SUCCESS, FAIL, LOADING }) => {
      const page       = payload?.page       ?? state.page;
      const showHidden = payload?.showHidden  ?? state.showHidden;
      const replace = payload?.replace ?? false
      const pageSize   = state.pageSize;

      LOADING({ loading: true });

      try {
        const hiddenParam = showHidden ? "" : "&hidden=false";
        const res = await getApi().get(`/gallery?page=${page}&pageSize=${pageSize}${hiddenParam}`);
        if (res.ok) {
          let entries = []

          if (replace) {
            entries = res.entries
          } 
          else {
            entries = page === 1 ? res.entries : [...state.entries, ...res.entries]
          }

          SUCCESS({
            entries:    entries,
            page:       res.page,
            total:      res.total ?? 0,
            totalPages: res.totalPages ?? 1,
            loading:    false,
            showHidden,
          });
        } else {
          FAIL({ error: "Failed to load gallery", loading: false });
        }
      } catch (e) {
        FAIL({ error: e.message, loading: false });
      }
    },

    SET_LOADING:     ({ payload }) => ({ loading: payload }),
    SET_SHOW_HIDDEN: ({ payload }) => ({ showHidden: payload }),

    UPDATE_HIDDEN: async ({state, payload}, {SUCCESS, FAIL}) => {
      const {entry, hidden} = payload || {}

      const url = entry.imageAssetId
        ? `/assets/${entry.imageAssetId}`
        : `/gallery/${entry.id}`
      
      const res = await getApi().patch(url, { hidden: hidden });

      return ({
        entries: state.entries.map((e) => (e.id === payload.id ? { ...e, ...payload } : e)),
      })
    },

    UPDATE_ENTRY: ({ state, payload }) => {
      return ({
        entries: state.entries.map((e) => (e.id === payload.id ? { ...e, ...payload } : e)),
      })
    },

    PREPEND_ENTRY: ({ state, payload }) => ({
      entries: [payload, ...state.entries],
      total:   state.total + 1,
    }),

    REMOVE_ENTRY: ({ state, payload: id }) => ({
      entries: state.entries.filter((e) => e.id !== id),
      total:   Math.max(0, state.total - 1),
    }),

    DELETE_ENTRY: async ({ state, payload: id }, { SUCCESS, FAIL }) => {
      try {
        const res = await getApi().delete(`/gallery/${id}`);
        if (res.ok) {
          return SUCCESS({
            entries: state.entries.filter((e) => e.id !== id),
            total:   Math.max(0, state.total - 1),
          })
        } else {
          return FAIL({ error: res.error || "Delete failed" });
        }
      } catch (e) {
        return FAIL({ error: e.message });
      }
    },

    TOGGLE_HIDDEN: async ({ state, payload: entry }, { SUCCESS, FAIL }) => {
      const next = !entry.hidden;
      try {
        const endpoint = entry.imageAssetId ? `/assets/${entry.imageAssetId}` : `/gallery/${entry.id}`;
        const res = await getApi().patch(endpoint, { hidden: next });
        if (res.ok) {
          SUCCESS({
            entries: state.entries.map((e) => e.id === entry.id ? { ...e, hidden: next } : e),
          });
        }
      } catch (e) {
        FAIL({ error: e.message });
      }
    },
  },
});

export const GalleryStore = GalleryReducer.createFuseBox("GalleryStore");
