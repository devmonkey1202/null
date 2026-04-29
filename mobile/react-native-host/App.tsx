import React, { useCallback, useRef } from "react";
import { Keyboard, Linking, Platform, SafeAreaView, Share, StatusBar, Vibration } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

const hostConfig = (() => {
  try {
    return require("./host.config.json") as { serverUrl?: string; appName?: string; appId?: string };
  } catch {
    return {};
  }
})();

const APP_URL =
  typeof hostConfig.serverUrl === "string" && hostConfig.serverUrl.trim()
    ? hostConfig.serverUrl.trim()
    : "https://your-null-host.example";

const AsyncStorage = (() => {
  try {
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
})();

const Clipboard = (() => {
  try {
    return require("@react-native-clipboard/clipboard").default;
  } catch {
    return null;
  }
})();

const NetInfo = (() => {
  try {
    return require("@react-native-community/netinfo").default;
  } catch {
    return null;
  }
})();

const ImagePicker = (() => {
  try {
    return require("react-native-image-picker");
  } catch {
    return null;
  }
})();

const Geolocation = (() => {
  try {
    return require("react-native-geolocation-service");
  } catch {
    return null;
  }
})();

const RNFS = (() => {
  try {
    return require("react-native-fs");
  } catch {
    return null;
  }
})();

type BridgeRequest = {
  id: string;
  name: string;
  args?: unknown;
};

type BridgeResponse = {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

type PickerAsset = {
  uri?: string;
  fileName?: string;
  type?: string;
  fileSize?: number;
  base64?: string;
};

function normalizePickerAssets(assets: PickerAsset[] | undefined, withBase64: boolean, withDataUrl: boolean) {
  const files = Array.isArray(assets)
    ? assets.map((asset) => {
        const base64 = withBase64 ? asset.base64 ?? null : undefined;
        const type = asset.type ?? "image/jpeg";
        return {
          uri: asset.uri ?? null,
          name: asset.fileName ?? null,
          type,
          size: asset.fileSize ?? null,
          base64,
          dataUrl:
            withDataUrl && typeof asset.base64 === "string" ? `data:${type};base64,${asset.base64}` : undefined,
        };
      })
    : [];
  return { file: files[0] ?? null, files };
}

async function handleCommand(msg: BridgeRequest): Promise<Omit<BridgeResponse, "id">> {
  const obj = msg.args && typeof msg.args === "object" ? (msg.args as Record<string, unknown>) : {};
  switch (msg.name) {
    case "device.info":
      return {
        ok: true,
        data: {
          platform: Platform.OS,
          version: Platform.Version,
          appName: hostConfig.appName ?? null,
          appId: hostConfig.appId ?? null,
        },
      };
    case "network.status": {
      if (!NetInfo || typeof NetInfo.fetch !== "function") return { ok: false, error: "not_supported" };
      const state = await NetInfo.fetch();
      return {
        ok: true,
        data: {
          online: Boolean(state?.isConnected),
          connectionType: state?.type ?? null,
        },
      };
    }
    case "geolocation.current": {
      if (!Geolocation || typeof Geolocation.getCurrentPosition !== "function") {
        return { ok: false, error: "not_supported" };
      }
      const options: Record<string, unknown> = {};
      if (typeof obj.enableHighAccuracy === "boolean") options.enableHighAccuracy = obj.enableHighAccuracy;
      if (typeof obj.timeout === "number") options.timeout = obj.timeout;
      if (typeof obj.maximumAge === "number") options.maximumAge = obj.maximumAge;
      return new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos: { coords: Record<string, unknown>; timestamp?: number }) => {
            const coords = pos?.coords ?? {};
            resolve({
              ok: true,
              data: {
                lat: typeof coords.latitude === "number" ? coords.latitude : null,
                lng: typeof coords.longitude === "number" ? coords.longitude : null,
                accuracy: typeof coords.accuracy === "number" ? coords.accuracy : null,
                altitude: typeof coords.altitude === "number" ? coords.altitude : null,
                altitudeAccuracy: typeof coords.altitudeAccuracy === "number" ? coords.altitudeAccuracy : null,
                heading: typeof coords.heading === "number" ? coords.heading : null,
                speed: typeof coords.speed === "number" ? coords.speed : null,
                timestamp: typeof pos?.timestamp === "number" ? pos.timestamp : null,
              },
            });
          },
          (err: { message?: string; code?: number }) => {
            resolve({ ok: false, error: err?.message ?? "geolocation_failed" });
          },
          options
        );
      });
    }
    case "camera.capture": {
      if (!ImagePicker || typeof ImagePicker.launchCamera !== "function") {
        return { ok: false, error: "not_supported" };
      }
      const resultType = typeof obj.resultType === "string" ? obj.resultType : "uri";
      const includeBase64 = resultType === "base64" || resultType === "dataUrl";
      const options = {
        mediaType: "photo" as const,
        quality: typeof obj.quality === "number" ? obj.quality : 1,
        includeBase64,
        saveToPhotos: Boolean(obj.saveToGallery),
      };
      const res = await ImagePicker.launchCamera(options);
      if (res?.didCancel) return { ok: false, error: "cancelled" };
      if (res?.errorCode) return { ok: false, error: res.errorCode };
      return { ok: true, data: normalizePickerAssets(res?.assets, includeBase64, resultType === "dataUrl") };
    }
    case "camera.pick": {
      if (!ImagePicker || typeof ImagePicker.launchImageLibrary !== "function") {
        return { ok: false, error: "not_supported" };
      }
      const resultType = typeof obj.resultType === "string" ? obj.resultType : "uri";
      const includeBase64 = resultType === "base64" || resultType === "dataUrl";
      const limitRaw = typeof obj.limit === "number" ? Math.max(1, obj.limit) : null;
      const selectionLimit = obj.multiple === true ? (limitRaw ?? 0) : (limitRaw ?? 1);
      const options = {
        mediaType: "photo" as const,
        quality: typeof obj.quality === "number" ? obj.quality : 1,
        includeBase64,
        selectionLimit,
      };
      const res = await ImagePicker.launchImageLibrary(options);
      if (res?.didCancel) return { ok: false, error: "cancelled" };
      if (res?.errorCode) return { ok: false, error: res.errorCode };
      return { ok: true, data: normalizePickerAssets(res?.assets, includeBase64, resultType === "dataUrl") };
    }
    case "clipboard.readText": {
      if (!Clipboard || typeof Clipboard.getString !== "function") return { ok: false, error: "not_supported" };
      const text = await Clipboard.getString();
      return { ok: true, data: { text } };
    }
    case "clipboard.writeText": {
      const textValue = typeof msg.args === "string" ? msg.args : String(obj.text ?? "");
      if (!textValue) return { ok: false, error: "text_required" };
      if (!Clipboard || typeof Clipboard.setString !== "function") return { ok: false, error: "not_supported" };
      Clipboard.setString(textValue);
      return { ok: true, data: { text: textValue } };
    }
    case "filesystem.readFile": {
      if (!RNFS || typeof RNFS.readFile !== "function") return { ok: false, error: "not_supported" };
      const path = String(obj.path ?? "");
      if (!path) return { ok: false, error: "path_required" };
      const encoding = typeof obj.encoding === "string" ? obj.encoding : "utf8";
      const data = await RNFS.readFile(path, encoding);
      return { ok: true, data: { path, data } };
    }
    case "filesystem.writeFile": {
      if (!RNFS || typeof RNFS.writeFile !== "function") return { ok: false, error: "not_supported" };
      const path = String(obj.path ?? "");
      if (!path) return { ok: false, error: "path_required" };
      const data = typeof obj.data === "string" ? obj.data : (typeof obj.text === "string" ? obj.text : "");
      if (!data) return { ok: false, error: "data_required" };
      const encoding = typeof obj.encoding === "string" ? obj.encoding : "utf8";
      await RNFS.writeFile(path, data, encoding);
      return { ok: true, data: { path, bytes: data.length } };
    }
    case "filesystem.deleteFile": {
      if (!RNFS || typeof RNFS.unlink !== "function") return { ok: false, error: "not_supported" };
      const path = String(obj.path ?? "");
      if (!path) return { ok: false, error: "path_required" };
      await RNFS.unlink(path);
      return { ok: true, data: { path, deleted: true } };
    }
    case "preferences.get": {
      if (!AsyncStorage || typeof AsyncStorage.getItem !== "function") return { ok: false, error: "not_supported" };
      const key = String(obj.key ?? "");
      if (!key) return { ok: false, error: "key_required" };
      const value = await AsyncStorage.getItem(key);
      return { ok: true, data: { key, value } };
    }
    case "preferences.set": {
      if (!AsyncStorage || typeof AsyncStorage.setItem !== "function") return { ok: false, error: "not_supported" };
      const key = String(obj.key ?? "");
      if (!key) return { ok: false, error: "key_required" };
      const value = typeof obj.value === "string" ? obj.value : String(obj.data ?? "");
      await AsyncStorage.setItem(key, value);
      return { ok: true, data: { key, value } };
    }
    case "preferences.remove": {
      if (!AsyncStorage || typeof AsyncStorage.removeItem !== "function") return { ok: false, error: "not_supported" };
      const key = String(obj.key ?? "");
      if (!key) return { ok: false, error: "key_required" };
      await AsyncStorage.removeItem(key);
      return { ok: true, data: { key, removed: true } };
    }
    case "statusBar.setStyle": {
      const style = typeof obj.style === "string" ? obj.style : "default";
      const barStyle =
        style === "dark" ? "dark-content" : style === "light" ? "light-content" : "default";
      StatusBar.setBarStyle(barStyle, true);
      return { ok: true, data: { style } };
    }
    case "statusBar.setBackgroundColor": {
      const color = typeof obj.color === "string" ? obj.color : "";
      if (!color) return { ok: false, error: "color_required" };
      if (Platform.OS === "android") StatusBar.setBackgroundColor(color, true);
      return { ok: true, data: { color } };
    }
    case "keyboard.hide": {
      Keyboard.dismiss();
      return { ok: true, data: { hidden: true } };
    }
    case "keyboard.show": {
      return { ok: false, error: "not_supported" };
    }
    case "vibrate": {
      const duration = typeof msg.args === "number" ? msg.args : 200;
      Vibration.vibrate(duration);
      return { ok: true, data: { duration } };
    }
    case "share": {
      if (typeof msg.args !== "object" || msg.args == null) {
        return { ok: false, error: "share_data_required" };
      }
      const payload = msg.args as { title?: string; text?: string; url?: string };
      await Share.share({
        title: payload.title,
        message: payload.text ?? "",
        url: payload.url,
      });
      return { ok: true, data: { shared: true } };
    }
    case "app.openSettings": {
      if (typeof Linking.openSettings !== "function") return { ok: false, error: "not_supported" };
      await Linking.openSettings();
      return { ok: true, data: { opened: true } };
    }
    case "app.openUrl":
    case "browser.open": {
      const url = String(obj.url ?? "");
      if (!url) return { ok: false, error: "url_required" };
      await Linking.openURL(url);
      return { ok: true, data: { opened: true } };
    }
    default:
      return { ok: false, error: "not_supported" };
  }
}

export default function App() {
  const webviewRef = useRef<WebView>(null);

  const sendToWeb = useCallback((response: BridgeResponse) => {
    const payload = JSON.stringify(response);
    const script = `window.__nullNativeBridge && window.__nullNativeBridge.receive(${payload}); true;`;
    webviewRef.current?.injectJavaScript(script);
  }, []);

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let msg: BridgeRequest | null = null;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        msg = null;
      }
      if (!msg || !msg.id || !msg.name) return;

      try {
        const result = await handleCommand(msg);
        sendToWeb({ id: msg.id, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "native_error";
        sendToWeb({ id: msg.id, ok: false, error: message });
      }
    },
    [sendToWeb]
  );

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <WebView
        ref={webviewRef}
        source={{ uri: APP_URL }}
        originWhitelist={["*"]}
        javaScriptEnabled
        onMessage={onMessage}
      />
    </SafeAreaView>
  );
}
