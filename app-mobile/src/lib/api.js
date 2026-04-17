/**
 * lib/api.js
 *
 * Thin fetch wrapper. Base URL is read from the AppStore so the user can
 * configure their server address in Settings.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { setApi } from "../../../shared/lib/apiRef.js";

const TIMEOUT_MS = 5 * 60 * 1000;

let _baseUrl = null;

export async function getBaseUrl() {
  if (_baseUrl) return _baseUrl;
  _baseUrl = (await AsyncStorage.getItem("serverUrl")) || "http://192.168.1.166:4989";
  return _baseUrl;
}

export function setBaseUrl(url) {
  _baseUrl = url;
  AsyncStorage.setItem("serverUrl", url);
}

async function request(method, path, body) {
  const base = await getBaseUrl();
  const url = base + "/api" + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return r.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out after 5 minutes");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get:    (path)        => request("GET",    path),
  post:   (path, body)  => request("POST",   path, body),
  put:    (path, body)  => request("PUT",    path, body),
  patch:  (path, body)  => request("PATCH",  path, body),
  delete: (path, body)  => request("DELETE", path, body),
};

setApi(api);
