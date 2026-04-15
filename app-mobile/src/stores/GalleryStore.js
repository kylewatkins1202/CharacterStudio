/**
 * GalleryStore — paginated gallery list and actions.
 */

import { createReducer } from "react-diffuse";
import { api } from "../lib/api";

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
    /**
     * LOAD_PAGE — loads a page of gallery entries.
     * When page === 1, REPLACES entries (filter reset or initial load).
     * When page > 1, APPENDS entries (infinite scroll).
     */
    LOAD_PAGE: async ({ state, payload }, { SUCCESS, FAIL }) => {
      const page       = payload?.page       ?? state.page;
      const showHidden = payload?.showHidden  ?? state.showHidden;
      const pageSize   = state.pageSize;

      // Signal loading immediately so the UI guard works
      SUCCESS({ loading: true });

      try {
        const hiddenParam = showHidden ? "" : "&hidden=false";
        const res = await api.get(`/gallery?page=${page}&pageSize=${pageSize}${hiddenParam}`);
        if (res.ok) {
          SUCCESS({
            entries:    page === 1 ? res.entries : [...state.entries, ...res.entries],
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

    SET_LOADING: ({ payload }) => ({ loading: payload }),
    SET_SHOW_HIDDEN: ({ payload }) => ({ showHidden: payload }),

    UPDATE_ENTRY: ({ state, payload }) => ({
      entries: state.entries.map((e) => (e.id === payload.id ? { ...e, ...payload } : e)),
    }),

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
        const res = await api.delete(`/gallery/${id}`);
        if (res.ok) {
          SUCCESS({
            entries: state.entries.filter((e) => e.id !== id),
            total:   Math.max(0, state.total - 1),
          });
        } else {
          FAIL({ error: res.error || "Delete failed" });
        }
      } catch (e) {
        FAIL({ error: e.message });
      }
    },

    TOGGLE_HIDDEN: async ({ state, payload: entry }, { SUCCESS, FAIL }) => {
      const next = !entry.hidden;
      try {
        const res = await api.patch(`/gallery/${entry.id}`, { hidden: next });
        if (res.ok) {
          SUCCESS({
            entries: state.entries.map((e) =>
              e.id === entry.id ? { ...e, hidden: next } : e
            ),
          });
        }
      } catch (e) {
        FAIL({ error: e.message });
      }
    },
  },
});

export const GalleryStore = GalleryReducer.createFuseBox("GalleryStore");
