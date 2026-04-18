import { createReducer } from "react-diffuse";
import { getApi } from "../lib/apiRef.js";
import { ASPECT_RATIOS } from "../lib/constants.js";
import { makeSyntheticResult, computeSize, sizeToRatio } from "../lib/utils.js";

const GenerateReducer = createReducer({
  initialState: {
    prompt:          "",
    negPrompt:       "",
    mode:            "wavespeed",
    referenceImages: [],
    result:          null,
    compiled:        null,
    resetCache:      false,
    useRawPrompt:    false,
    tagOverrides:    {},

    // Cloud (WaveSpeed)
    cloudModel:      "seedream",
    cloudModelParams: {
      aspect_ratio: ASPECT_RATIOS[0],
      baseSize:     2048,
      resolution:   "1k",
    },
    wsModels:        {},

    // Cost estimation
    generationCost:  null,
    costLoading:     false,

    // Local (ComfyUI)
    localModel:      "DarkBeast",
    localSteps:      4,
    localCfg:        1.5,
    localDenoise:    0.9,
    localLoras:      [],
    localScheduler:  "sgm_uniform",
    localSampler:    "euler",

    // UI
    starting:        false,
  },

  actions: {
    SET_PROMPT:           ({ payload }) => ({ prompt: payload }),
    SET_NEG_PROMPT:       ({ payload }) => ({ negPrompt: payload }),
    SET_MODE: ({ state, payload }) => {
      const maxRefs = payload === "local" ? 3 : null;
      const referenceImages = (maxRefs !== null && state.referenceImages.length > maxRefs)
        ? state.referenceImages.slice(0, maxRefs)
        : state.referenceImages;
      return { mode: payload, referenceImages };
    },
    SET_REFERENCE_IMAGES: ({ payload }) => ({ referenceImages: payload }),
    SET_RESULT:           ({ payload }) => ({ result: payload }),
    SET_COMPILED:         ({ payload }) => ({ compiled: payload }),
    SET_RESET_CACHE:      ({ payload }) => ({ resetCache: payload }),
    SET_USE_RAW_PROMPT:   ({ payload }) => ({ useRawPrompt: payload }),
    SET_CLOUD_MODEL:      ({ payload }) => ({ cloudModel: payload }),
    SET_CLOUD_MODEL_PARAMS: ({ payload }) => ({ cloudModelParams: payload }),
    SET_TAG_OVERRIDES:    ({ payload }) => ({ tagOverrides: payload }),
    SET_LOCAL_MODEL:      ({ payload }) => ({ localModel: payload }),
    SET_LOCAL_STEPS:      ({ payload }) => ({ localSteps: payload }),
    SET_LOCAL_CFG:        ({ payload }) => ({ localCfg: payload }),
    SET_LOCAL_DENOISE:    ({ payload }) => ({ localDenoise: payload }),
    SET_LOCAL_LORAS:      ({ payload }) => ({ localLoras: payload }),
    SET_LOCAL_SCHEDULER:  ({ payload }) => ({ localScheduler: payload }),
    SET_LOCAL_SAMPLER:    ({ payload }) => ({ localSampler: payload }),
    SET_STARTING:         ({ payload }) => ({ starting: payload }),
    SET_COST_LOADING:     ({ payload }) => ({ costLoading: payload }),
    SET_GENERATION_COST:  ({ payload }) => ({ generationCost: payload }),

    UPDATE_REFERENCE_IMAGES: ({ state, payload }) => ({
      referenceImages: [...(state?.referenceImages ?? []), payload],
    }),

    RESTORE_FROM_ENTRY: ({ payload: entry }) => {
      if (entry.mode === "local") {
        return {
          mode:           "local",
          prompt:         entry.userPrompt || "",
          negPrompt:      entry.userNegPrompt || "",
          localModel:     entry.model || "DarkBeast",
          localSteps:     entry.steps || 4,
          localCfg:       entry.cfg || 1.5,
          localDenoise:   entry.denoise || 0.9,
          localLoras:     entry.loras || [],
          localScheduler: entry.scheduler || "sgm_uniform",
          localSampler:   entry.sampler || "euler",
          referenceImages: entry.referenceImages?.length
            ? entry.referenceImages.map(({ url, purpose }) => ({ url, isUrl: true, purpose: purpose || "" }))
            : [],
          result:        makeSyntheticResult(entry.imageUrl),
          compiled:      (entry.compiledPrompt || entry.compiledImages?.length)
            ? { rawPrompt: entry.compiledPrompt || "", images: entry.compiledImages || [] }
            : null,
          useRawPrompt:  entry.useRawPrompt ?? false,
        };
      }

      // WaveSpeed
      const modelParams = { ...(entry.modelParams || {}) };
      if (modelParams?.size !== undefined) {
        const widthHeight = modelParams.size.split("*").map(Number);
        modelParams.baseSize = Math.max(...widthHeight);
        modelParams.aspect_ratio = sizeToRatio(modelParams.size);
        delete modelParams.size;
      }
      if (typeof modelParams.aspect_ratio === "string") {
        const parts = modelParams.aspect_ratio.split(":").map(Number);
        modelParams.aspect_ratio = ASPECT_RATIOS.find((r) => r.w === parts[0] && r.h === parts[1]) || ASPECT_RATIOS[0];
      }

      return {
        mode:             "wavespeed",
        prompt:           entry.userPrompt || "",
        negPrompt:        entry.userNegPrompt || "",
        cloudModel:       entry.model || "seedream",
        cloudModelParams: modelParams,
        referenceImages:  entry.referenceImages?.length
          ? entry.referenceImages.map(({ url, purpose }) => ({ url, isUrl: true, purpose: purpose || "" }))
          : [],
        result:       makeSyntheticResult(entry.imageUrl || entry.localUrl),
        compiled:     (entry.compiledPrompt || entry.compiledImages?.length)
          ? { rawPrompt: entry.compiledPrompt || "", images: entry.compiledImages || [] }
          : null,
        useRawPrompt: entry.useRawPrompt ?? false,
      };
    },

    LOAD_WS_MODELS: async ({ state }, { SUCCESS, FAIL }) => {
      try {
        const res = await getApi().get("/models/wavespeed/options");
        if (res.ok) SUCCESS({ wsModels: res.models });
      } catch (e) {
        FAIL({ error: e.message });
      }
    },

    FETCH_COST: async ({ state }, { SUCCESS, FAIL }) => {
      const { prompt, cloudModel, cloudModelParams, tagOverrides, wsModels } = state;
      if (!prompt?.trim()) return SUCCESS({ generationCost: null, costLoading: false });

      const modelSchema  = wsModels?.[cloudModel];
      const usesEnumSize = !!modelSchema?.aspectRatios;
      const computedSize = computeSize(cloudModelParams.aspect_ratio, cloudModelParams.baseSize);
      const body = {
        prompt,
        model:    cloudModel,
        tagLocks: tagOverrides,
        modelParams: {
          ...cloudModelParams,
          ...(usesEnumSize
            ? { aspect_ratio: cloudModelParams.aspect_ratio?.label, resolution: cloudModelParams.resolution || "1k" }
            : { size: computedSize, aspect_ratio: cloudModelParams?.aspect_ratio?.label }),
        },
      };
      delete body.modelParams.baseSize;

      try {
        const res = await getApi().post("/generate/image/cost", body);
        if (res.ok) SUCCESS({ generationCost: "$" + res.unitPrice, costLoading: false });
        else         SUCCESS({ generationCost: null, costLoading: false });
      } catch {
        SUCCESS({ generationCost: null, costLoading: false });
      }
    },

    GENERATE: async ({ state }, { SUCCESS, FAIL, LOADING }) => {
      LOADING();
      const {
        prompt, negPrompt, mode, referenceImages,
        cloudModel, cloudModelParams, wsModels,
        localModel, localSteps, localCfg, localDenoise,
        localLoras, localScheduler, localSampler,
        tagOverrides, resetCache, useRawPrompt,
      } = state;

      const modelSchema  = wsModels?.[cloudModel];
      const usesEnumSize = (wsModels[cloudModel]?.baseProperites?.resolution && wsModels[cloudModel]?.baseProperites?.aspectRatios);
      const computedSize = computeSize(cloudModelParams.aspect_ratio, cloudModelParams.baseSize);

      const body = {
        prompt,
        negPrompt: negPrompt ?? "",
        mode,
        ...(mode === "local" ? {
          model:     localModel,
          steps:     localSteps,
          cfg:       localCfg,
          denoise:   localDenoise,
          loras:     localLoras,
          scheduler: localScheduler,
          sampler:   localSampler,
        } : {
          model:       cloudModel,
          modelParams: {
            ...cloudModelParams,
            ...(usesEnumSize
              ? { aspect_ratio: cloudModelParams.aspect_ratio?.label, resolution: cloudModelParams.resolution || "1k" }
              : { size: computedSize }),
          },
        }),
        referenceAssetIds:  referenceImages.filter((i) => i.assetId).map((i) => ({ id: i.assetId, purpose: i.purpose })),
        referenceImages:    referenceImages.filter((i) => !i.assetId && !i.isUrl).map((i) => ({ data: i.src, purpose: i.purpose })),
        referenceImageUrls: referenceImages.filter((i) => i.isUrl).map((i) => ({ url: i.url || i.src, purpose: i.purpose })),
        tagLocks:     tagOverrides,
        resetCache,
        useRawPrompt: useRawPrompt || false,
      };
      delete body.modelParams?.baseSize;

      try {
        const res = await getApi().post("/generate/image", body);
        if (res.ok) {
          SUCCESS({ starting: false, resetCache: false, result: null, compiled: null });
        } else {
          FAIL({ error: res.error || "Generation failed", starting: false });
        }
      } catch (e) {
        FAIL({ error: e.message, starting: false });
      }
    },
  },
});

export const GenerateStore = GenerateReducer.createFuseBox("GenerateStore");
