import "react-native-gesture-handler";
import React, { useEffect, useRef } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Navigation from "./src/navigation";
import Toasts from "./src/components/Toast";
import { AppStore } from "./src/stores/AppStore";
import { GalleryStore } from "./src/stores/GalleryStore";
import { GenerateStore } from "./src/stores/GenerateStore";
import { getBaseUrl } from "./src/lib/api";
import { makeSyntheticResult } from "./src/lib/utils";
import { PortalProvider } from "@gorhom/portal";

// ─── SSE listener (Server-Sent Events for live gallery updates) ───────────────

function useSseListener() {
  const esRef = useRef(null);

  useEffect(() => {
    let es;

    const connect = async () => {
      const base = await getBaseUrl();
      try {
        // EventSource is available in Expo/RN via the global or react-native-sse
        es = new EventSource(`${base}/api/events`);
        esRef.current = es;

        es.addEventListener("gallery:new", (e) => {
          const entry = JSON.parse(e.data);
          AppStore.actions.SSE_NEW_ENTRY(entry);
          GalleryStore.actions.PREPEND_ENTRY(entry);
        });

        es.addEventListener("gallery:update", (e) => {
          const updated = JSON.parse(e.data);
          AppStore.actions.SSE_UPDATE_ENTRY(updated);
          GalleryStore.actions.UPDATE_ENTRY(updated);

          // Mirror completed image to Generate screen
          if (!updated.loading && !updated.error) {
            const url = updated.imageUrl || updated.localUrl;
            if (url) {
              GenerateStore.actions.SET_RESULT(makeSyntheticResult(url));
              if (updated.compiledPrompt || updated.compiledImages?.length) {
                GenerateStore.actions.SET_COMPILED({
                  rawPrompt: updated.compiledPrompt || "",
                  images:    updated.compiledImages || [],
                });
              }
            }
          }
        });

        es.onerror = () => {
          // Browser/RN will auto-retry
        };
      } catch (err) {
        console.warn("[SSE] EventSource not available:", err?.message);
      }
    };

    connect();

    return () => {
      esRef.current?.close();
    };
  }, []);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  useSseListener();

  // Boot: load persisted server URL, tags, gallery count, config
  useEffect(() => {
    AppStore.actions.LOAD_SERVER_URL({});
    AppStore.actions.LOAD_TAGS({});
    AppStore.actions.LOAD_GALLERY_COUNT({});
    AppStore.actions.LOAD_CONFIG({});
  }, []);

  return (
    <PortalProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" />
          <Navigation />
          <Toasts />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PortalProvider>
  );
}
