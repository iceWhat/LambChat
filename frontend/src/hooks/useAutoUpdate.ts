import { useState, useEffect, useCallback, useRef } from "react";
import i18n from "i18next";
import { versionApi } from "../services/api";
import type { UpdateState, ReleaseAsset } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Detect current runtime platform */
function detectPlatform(): "tauri" | "android" | "ios" | "web" {
  if (typeof window === "undefined") return "web";
  const win = window as any;
  if (win.__TAURI__ || win.__TAURI_INTERNALS__) return "tauri";
  if (typeof win.Capacitor !== "undefined") {
    const p = win.Capacitor.getPlatform();
    if (p === "android") return "android";
    if (p === "ios") return "ios";
  }
  return "web";
}

/** Find the best APK asset from the release assets list */
function findApkAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  // Prefer signed APK, fall back to any APK
  const signed = assets.find(
    (a) => a.name.endsWith(".apk") && a.name.includes("signed"),
  );
  if (signed) return signed;
  const anyApk = assets.find((a) => a.name.endsWith(".apk"));
  return anyApk ?? null;
}

export interface UseAutoUpdateReturn {
  state: UpdateState;
  showDialog: boolean;
  setShowDialog: (v: boolean) => void;
  startUpdate: () => Promise<void>;
  skipUpdate: () => void;
}

const INITIAL_STATE: UpdateState = {
  available: false,
  version: null,
  releaseNotes: null,
  releaseUrl: null,
  releaseAssets: [],
  publishedAt: null,
  downloading: false,
  progress: 0,
  contentLength: 0,
  downloaded: 0,
  error: null,
};

/** Debounce delay (ms) before checking for updates on startup */
const CHECK_DELAY_MS = 5000;

export function useAutoUpdate(): UseAutoUpdateReturn {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE);
  const [showDialog, setShowDialog] = useState(false);
  const platformRef = useRef(detectPlatform());
  const checkedRef = useRef(false);

  const platform = platformRef.current;

  /** Check for updates */
  const checkForUpdate = useCallback(async () => {
    if (platform === "tauri") {
      await checkTauriUpdate();
    } else if (platform === "android" || platform === "ios") {
      await checkBackendUpdate();
    }
    // web: no-op
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  /** Check via Tauri updater plugin */
  const checkTauriUpdate = useCallback(async () => {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setState({
          ...INITIAL_STATE,
          available: true,
          version: update.version,
          releaseNotes: update.body ?? null,
          releaseUrl: null,
          releaseAssets: [],
        });
        setShowDialog(true);
      }
    } catch {
      // Silently fail — updater may not be available in dev
    }
  }, []);

  /** Check via backend /api/version endpoint */
  const checkBackendUpdate = useCallback(async () => {
    try {
      const info = await versionApi.checkForUpdates();
      if (info.has_update) {
        setState({
          ...INITIAL_STATE,
          available: true,
          version: info.latest_version ?? null,
          releaseNotes: info.release_notes ?? null,
          releaseUrl: info.release_url ?? null,
          releaseAssets: info.release_assets ?? [],
        });
        setShowDialog(true);
      }
    } catch {
      // Silently fail
    }
  }, []);

  /** Start the update process */
  const startUpdate = useCallback(async () => {
    if (platform === "tauri") {
      await installTauriUpdate();
    } else if (platform === "android") {
      await installAndroidUpdate();
    } else if (platform === "ios") {
      openReleasePage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, state]);

  /** Install via Tauri updater (download + install + relaunch) */
  const installTauriUpdate = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      downloading: true,
      error: null,
      progress: 0,
    }));
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (!update) throw new Error("No update found");

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            setState((prev) => ({ ...prev, contentLength }));
            break;
          case "Progress": {
            downloaded += event.data.chunkLength;
            const pct =
              contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
            setState((prev) => ({
              ...prev,
              downloaded,
              progress: pct,
            }));
            break;
          }
          case "Finished":
            setState((prev) => ({ ...prev, progress: 100 }));
            break;
        }
      });

      // Download and install complete, relaunch
      await relaunch();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error:
          err instanceof Error
            ? err.message
            : i18n.t("updateError", "更新失败"),
      }));
    }
  }, []);

  /** Download APK and trigger Android install intent */
  const installAndroidUpdate = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      downloading: true,
      error: null,
      progress: 0,
    }));
    try {
      const apkAsset = findApkAsset(state.releaseAssets);
      if (!apkAsset) throw new Error("No APK found in release assets");

      const response = await fetch(apkAsset.url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      // Stream download into a Blob — avoids loading entire APK in memory as an array
      const chunks: BlobPart[] = [];
      let downloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new Uint8Array(value));
        downloaded += value.byteLength;
        const pct = contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
        setState((prev) => ({
          ...prev,
          downloaded,
          progress: pct,
          contentLength,
        }));
      }

      const blob = new Blob(chunks, {
        type: apkAsset.content_type,
      });

      // Use Capacitor Filesystem to write the APK, then open it
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const base64 = await blobToBase64(blob);
      const fileName = apkAsset.name || "LambChat-update.apk";
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      // Use Capacitor Share to open the APK file (triggers install)
      const { Share } = await import("@capacitor/share");
      await Share.share({
        path: result.uri,
      });

      setState((prev) => ({
        ...prev,
        downloading: false,
        progress: 100,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error:
          err instanceof Error
            ? err.message
            : i18n.t("updateError", "更新失败"),
      }));
    }
  }, [state.releaseAssets]);

  /** Open release page in browser (iOS) */
  const openReleasePage = useCallback(() => {
    if (state.releaseUrl) {
      window.open(state.releaseUrl, "_blank", "noopener");
    }
  }, [state.releaseUrl]);

  /** Skip this update */
  const skipUpdate = useCallback(() => {
    setShowDialog(false);
  }, []);

  // Auto-check on mount with delay
  useEffect(() => {
    if (platform === "web") return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    const timer = setTimeout(() => {
      checkForUpdate();
    }, CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, [platform, checkForUpdate]);

  return {
    state,
    showDialog,
    setShowDialog,
    startUpdate,
    skipUpdate,
  };
}

/** Convert a Blob to base64 string */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix: "data:...;base64,"
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
