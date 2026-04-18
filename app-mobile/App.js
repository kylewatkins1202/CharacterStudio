import "react-native-gesture-handler";
import React, { useEffect, useRef } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import Navigation from "./src/navigation";
import Toasts from "./src/components/Toast";
import { AppStore } from "./src/stores/AppStore";
import { GalleryStore } from "./src/stores/GalleryStore";
import { GenerateStore } from "./src/stores/GenerateStore";
import { getBaseUrl } from "./src/lib/api";
import { makeSyntheticResult } from "./src/lib/utils";
import { PortalProvider } from "@gorhom/portal";

// Show notifications when they arrive (even in foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge:  false,
  }),
});

async function scheduleCompletionNotification(entry) {
  const prompt = entry.userPrompt?.slice(0, 60) || "Generation complete";
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Generation complete",
      body:  prompt + (entry.userPrompt?.length > 60 ? "…" : ""),
    },
    trigger: null,
  });
}

// ─── WebSocket listener (replaces SSE — native WS works in React Native) ──────

function useWsListener() {
  const wsRef      = useRef(null);
  const retryTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const base  = await getBaseUrl();
        const wsUrl = base.replace(/^http/, "ws") + "/api/ws";

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (e) => {
          const { event, data } = JSON.parse(e.data);

          if (event === "gallery:new") {
            AppStore.actions.SSE_NEW_ENTRY(data);
            GalleryStore.actions.PREPEND_ENTRY(data);
          }

          if (event === "gallery:update") {
            AppStore.actions.SSE_UPDATE_ENTRY(data);
            GalleryStore.actions.UPDATE_ENTRY(data);

            if (!data.loading && !data.error) {
              const url = data.imageUrl || data.localUrl;
              if (url) {
                GenerateStore.actions.SET_RESULT(makeSyntheticResult(url));
                if (data.compiledPrompt || data.compiledImages?.length) {
                  GenerateStore.actions.SET_COMPILED({
                    rawPrompt: data.compiledPrompt || "",
                    images:    data.compiledImages || [],
                  });
                }
              }
              scheduleCompletionNotification(data).catch(() => {});
            }
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            retryTimer.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {};
      } catch (err) {
        if (!cancelled) {
          retryTimer.current = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer.current);
      wsRef.current?.close();
    };
  }, []);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  useWsListener();

  useEffect(() => {
    Notifications.requestPermissionsAsync();
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
