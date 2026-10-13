/**
 * AppStore — global app state.
 *
 * Owns: theme, tags, gallery count, SSE entries, server URL.
 */

import { createReducer } from "react-diffuse";
import { api, setBaseUrl, getBaseUrl } from "../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AppReducer = createReducer({
  initialState: {
    theme:         "dark",
    tags:          [],
    galleryCount:  0,
    sseEntries:    null,   // null = not yet loaded; array = live SSE list
    galleryVersion: null,
    serverUrl:     "http://192.168.1.166:4989",
    localGenerationEnabled: false,
    toasts:        [],
  },

  actions: {
    SET_THEME: ({ state, payload }) => ({
      theme: payload,
    }),

    SET_SERVER_URL: ({ state, payload }) => {
      setBaseUrl(payload);
      return { serverUrl: payload };
    },

    LOAD_SERVER_URL: async ({ state }, { SUCCESS }) => {
      const url = await getBaseUrl();
      SUCCESS({ serverUrl: url });
    },

    LOAD_TAGS: async ({ state }, { SUCCESS, FAIL }) => {
      try {
        const res = await api.get("/tags");
        if (res.ok) SUCCESS({ tags: res.tags });
      } catch (e) {
        FAIL({ error: e.message });
      }
    },

    LOAD_GALLERY_COUNT: async ({ state }, { SUCCESS }) => {
      try {
        const res = await api.get("/gallery?pageSize=1");
        if (res.ok) SUCCESS({ galleryCount: res.total ?? res.count ?? 0 });
      } catch {}
    },

    LOAD_CONFIG: async ({ state }, { SUCCESS }) => {
      try {
        const res = await api.get("/config");
        if (res.localGenerationEnabled) SUCCESS({ localGenerationEnabled: true });
      } catch {}
    },

    SSE_NEW_ENTRY: ({ state, payload }) => ({
      sseEntries:   state.sseEntries ? [payload, ...state.sseEntries] : [payload],
      galleryCount: state.galleryCount + 1,
    }),

    SSE_UPDATE_ENTRY: ({ state, payload }) => ({
      sseEntries: state.sseEntries
        ? state.sseEntries.map((e) => (e.id === payload.id ? payload : e))
        : null,
    }),

    SET_SSE_ENTRIES: ({ state, payload }) => ({
      sseEntries: payload,
    }),

    SET_GALLERY_VERSION: ({ state, payload }) => ({
      galleryVersion: payload,
    }),

    // Toast system
    ADD_TOAST: ({ state, payload }) => {
      const id = Date.now() + Math.random();
      return { toasts: [...state.toasts, { id, ...payload }] };
    },

    REMOVE_TOAST: ({ state, payload }) => ({
      toasts: state.toasts.filter((t) => t.id !== payload),
    }),
  },
});

const AppStore = AppReducer.createFuseBox("AppStore");

export {AppStore}