import { createReducer } from "react-diffuse";
import { getApi } from "../../../shared/lib/apiRef.js";

const AppReducer = createReducer({
  initialState: {
    theme:                  localStorage.getItem("cs-theme") || "dark",
    tags:                   [],
    galleryCount:           0,
    localGenerationEnabled: false,
  },

  actions: {
    SET_THEME: ({ payload }) => {
      localStorage.setItem("cs-theme", payload);
      return { theme: payload };
    },

    SET_TAGS:           ({ payload }) => ({ tags: payload }),
    INCR_GALLERY_COUNT: ({ state }) => ({ galleryCount: state.galleryCount + 1 }),

    LOAD_TAGS: async ({ state }, { SUCCESS, FAIL }) => {
      try {
        const res = await getApi().get("/tags");
        if (res.ok) SUCCESS({ tags: res.tags });
      } catch (e) {
        FAIL({ error: e.message });
      }
    },

    LOAD_CONFIG: async ({ state }, { SUCCESS }) => {
      try {
        const res = await getApi().get("/config");
        if (res.ok) SUCCESS({ localGenerationEnabled: !!res.localGenerationEnabled });
      } catch {}
    },
  },
});

export const AppStore = AppReducer.createFuseBox("AppStore");
