(function () {
  if (typeof window === "undefined") return;
  if (window.__nullNativeBridge) return;

  var pending = new Map();
  var seq = 0;

  function now() {
    return Date.now();
  }

  function makeId() {
    seq += 1;
    return "nb_" + now() + "_" + seq;
  }

  function hasNativeBridge() {
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") return true;
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nullBridge) return true;
      if (window.NullNativeHost && typeof window.NullNativeHost.postMessage === "function") return true;
    } catch {
      return false;
    }
    return false;
  }

  function listCapabilities() {
    var plugins = window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins : null;
    var caps = [];
    function cap(name, available, source) {
      caps.push({ name: name, available: Boolean(available), source: source || "web" });
    }
    cap("device.info", (plugins && plugins.Device && typeof plugins.Device.getInfo === "function") || true, (plugins && plugins.Device) ? "capacitor" : "web");
    cap("network.status", (plugins && plugins.Network && typeof plugins.Network.getStatus === "function") || true, (plugins && plugins.Network) ? "capacitor" : "web");
    cap("geolocation.current", (plugins && plugins.Geolocation && typeof plugins.Geolocation.getCurrentPosition === "function") || !!navigator.geolocation, (plugins && plugins.Geolocation) ? "capacitor" : "web");
    cap("clipboard.readText", (plugins && plugins.Clipboard && typeof plugins.Clipboard.read === "function") || !!(navigator.clipboard && navigator.clipboard.readText), (plugins && plugins.Clipboard) ? "capacitor" : "web");
    cap("clipboard.writeText", (plugins && plugins.Clipboard && typeof plugins.Clipboard.write === "function") || !!(navigator.clipboard && navigator.clipboard.writeText), (plugins && plugins.Clipboard) ? "capacitor" : "web");
    cap("share", (plugins && plugins.Share && typeof plugins.Share.share === "function") || !!navigator.share, (plugins && plugins.Share) ? "capacitor" : "web");
    cap("camera.capture", (plugins && plugins.Camera && typeof plugins.Camera.getPhoto === "function") || true, (plugins && plugins.Camera) ? "capacitor" : "web");
    cap("camera.pick", (plugins && plugins.Camera && typeof plugins.Camera.pickImages === "function") || true, (plugins && plugins.Camera) ? "capacitor" : "web");
    cap("filesystem.readFile", (plugins && plugins.Filesystem && typeof plugins.Filesystem.readFile === "function") || true, (plugins && plugins.Filesystem) ? "capacitor" : "web");
    cap("filesystem.writeFile", (plugins && plugins.Filesystem && typeof plugins.Filesystem.writeFile === "function") || true, (plugins && plugins.Filesystem) ? "capacitor" : "web");
    cap("filesystem.deleteFile", (plugins && plugins.Filesystem && typeof plugins.Filesystem.deleteFile === "function") || true, (plugins && plugins.Filesystem) ? "capacitor" : "web");
    cap("preferences.get", (plugins && plugins.Preferences && typeof plugins.Preferences.get === "function") || true, (plugins && plugins.Preferences) ? "capacitor" : "web");
    cap("preferences.set", (plugins && plugins.Preferences && typeof plugins.Preferences.set === "function") || true, (plugins && plugins.Preferences) ? "capacitor" : "web");
    cap("preferences.remove", (plugins && plugins.Preferences && typeof plugins.Preferences.remove === "function") || true, (plugins && plugins.Preferences) ? "capacitor" : "web");
    cap("push.register", (plugins && plugins.PushNotifications && typeof plugins.PushNotifications.requestPermissions === "function") || !!(window.Notification && Notification.requestPermission), (plugins && plugins.PushNotifications) ? "capacitor" : "web");
    cap("push.getDelivered", plugins && plugins.PushNotifications && typeof plugins.PushNotifications.getDeliveredNotifications === "function", (plugins && plugins.PushNotifications) ? "capacitor" : "web");
    cap("push.removeAllDelivered", plugins && plugins.PushNotifications && typeof plugins.PushNotifications.removeAllDeliveredNotifications === "function", (plugins && plugins.PushNotifications) ? "capacitor" : "web");
    cap("localNotifications.schedule", (plugins && plugins.LocalNotifications && typeof plugins.LocalNotifications.schedule === "function") || !!window.Notification, (plugins && plugins.LocalNotifications) ? "capacitor" : "web");
    cap("app.openSettings", plugins && plugins.App && typeof plugins.App.openSettings === "function", (plugins && plugins.App) ? "capacitor" : "web");
    cap("app.openUrl", (plugins && plugins.App && typeof plugins.App.openUrl === "function") || true, (plugins && plugins.App) ? "capacitor" : "web");
    cap("browser.open", (plugins && plugins.Browser && typeof plugins.Browser.open === "function") || true, (plugins && plugins.Browser) ? "capacitor" : "web");
    cap("statusBar.setStyle", plugins && plugins.StatusBar && typeof plugins.StatusBar.setStyle === "function", (plugins && plugins.StatusBar) ? "capacitor" : "web");
    cap("statusBar.setBackgroundColor", plugins && plugins.StatusBar && typeof plugins.StatusBar.setBackgroundColor === "function", (plugins && plugins.StatusBar) ? "capacitor" : "web");
    cap("keyboard.hide", plugins && plugins.Keyboard && typeof plugins.Keyboard.hide === "function", (plugins && plugins.Keyboard) ? "capacitor" : "web");
    cap("keyboard.show", plugins && plugins.Keyboard && typeof plugins.Keyboard.show === "function", (plugins && plugins.Keyboard) ? "capacitor" : "web");
    cap("ble.scan", (plugins && plugins.BluetoothLe && (typeof plugins.BluetoothLe.requestDevice === "function" || typeof plugins.BluetoothLe.requestLEScan === "function" || typeof plugins.BluetoothLe.scan === "function")) || !!(navigator.bluetooth && navigator.bluetooth.requestDevice), (plugins && plugins.BluetoothLe) ? "capacitor" : "web");
    cap("ble.connect", plugins && plugins.BluetoothLe && typeof plugins.BluetoothLe.connect === "function", (plugins && plugins.BluetoothLe) ? "capacitor" : "web");
    cap("ble.disconnect", plugins && plugins.BluetoothLe && typeof plugins.BluetoothLe.disconnect === "function", (plugins && plugins.BluetoothLe) ? "capacitor" : "web");
    cap("ble.read", plugins && plugins.BluetoothLe && typeof plugins.BluetoothLe.read === "function", (plugins && plugins.BluetoothLe) ? "capacitor" : "web");
    cap("ble.write", plugins && plugins.BluetoothLe && typeof plugins.BluetoothLe.write === "function", (plugins && plugins.BluetoothLe) ? "capacitor" : "web");
    cap("nfc.read", (plugins && plugins.NFC && (typeof plugins.NFC.scan === "function" || typeof plugins.NFC.read === "function")) || !!window.NDEFReader, (plugins && plugins.NFC) ? "capacitor" : "web");
    cap("nfc.write", (plugins && plugins.NFC && typeof plugins.NFC.write === "function") || !!window.NDEFReader, (plugins && plugins.NFC) ? "capacitor" : "web");
    cap("sensor.motion", (plugins && plugins.Motion && typeof plugins.Motion.getCurrent === "function") || !!window.DeviceMotionEvent || !!window.Accelerometer, (plugins && plugins.Motion) ? "capacitor" : "web");
    cap("sensor.orientation", (plugins && plugins.Motion && typeof plugins.Motion.getOrientation === "function") || !!window.DeviceOrientationEvent || !!window.AbsoluteOrientationSensor, (plugins && plugins.Motion) ? "capacitor" : "web");
    cap("vibrate", (plugins && plugins.Haptics) || !!navigator.vibrate, (plugins && plugins.Haptics) ? "capacitor" : "web");
    return { ok: true, data: { capabilities: caps, bridgeAvailable: hasNativeBridge() } };
  }

  function sendToNative(payload) {
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        return true;
      }
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nullBridge) {
        window.webkit.messageHandlers.nullBridge.postMessage(payload);
        return true;
      }
      if (window.NullNativeHost && typeof window.NullNativeHost.postMessage === "function") {
        window.NullNativeHost.postMessage(JSON.stringify(payload));
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function normalizeResponse(res) {
    if (res && typeof res === "object" && ("ok" in res || "error" in res || "data" in res)) {
      return res;
    }
    return { ok: true, data: res };
  }

  function tryCapacitor(name, args) {
    if (!window.Capacitor || !window.Capacitor.Plugins) return null;
    var plugins = window.Capacitor.Plugins;
    var obj = args && typeof args === "object" ? args : {};
    try {
      if (name === "device.info" && plugins.Device && typeof plugins.Device.getInfo === "function") {
        return plugins.Device.getInfo().then(function (info) {
          return { ok: true, data: info };
        });
      }
      if (name === "network.status" && plugins.Network && typeof plugins.Network.getStatus === "function") {
        return plugins.Network.getStatus().then(function (status) {
          var online = status && typeof status.connected === "boolean" ? status.connected : navigator.onLine;
          return { ok: true, data: { online: online, connectionType: status && status.connectionType } };
        });
      }
      if (name === "geolocation.current" && plugins.Geolocation && typeof plugins.Geolocation.getCurrentPosition === "function") {
        var options = {};
        if (typeof obj.enableHighAccuracy === "boolean") options.enableHighAccuracy = obj.enableHighAccuracy;
        if (typeof obj.timeout === "number") options.timeout = obj.timeout;
        if (typeof obj.maximumAge === "number") options.maximumAge = obj.maximumAge;
        return plugins.Geolocation.getCurrentPosition(options).then(function (pos) {
          var coords = pos && pos.coords ? pos.coords : {};
          return {
            ok: true,
            data: {
              lat: coords.latitude,
              lng: coords.longitude,
              accuracy: coords.accuracy,
              altitude: coords.altitude,
              altitudeAccuracy: coords.altitudeAccuracy,
              heading: coords.heading,
              speed: coords.speed,
              timestamp: pos && pos.timestamp,
            },
          };
        });
      }
      if (name === "clipboard.readText" && plugins.Clipboard && typeof plugins.Clipboard.read === "function") {
        return plugins.Clipboard.read().then(function (res) {
          var text = res && (res.value || res.text || res.string);
          return { ok: true, data: { text: text || "" } };
        });
      }
      if (name === "clipboard.writeText" && plugins.Clipboard && typeof plugins.Clipboard.write === "function") {
        var textValue = typeof args === "string" ? args : (typeof obj.text === "string" ? obj.text : "");
        if (!textValue) return Promise.resolve({ ok: false, error: "text_required" });
        return plugins.Clipboard.write({ string: textValue }).then(function () {
          return { ok: true, data: { text: textValue } };
        });
      }
      if (name === "share" && plugins.Share && typeof plugins.Share.share === "function") {
        var payload = {};
        if (typeof obj.title === "string") payload.title = obj.title;
        if (typeof obj.text === "string") payload.text = obj.text;
        if (typeof obj.url === "string") payload.url = obj.url;
        if (!payload.title && !payload.text && !payload.url) return Promise.resolve({ ok: false, error: "share_data_required" });
        return plugins.Share.share(payload).then(function () {
          return { ok: true, data: { shared: true } };
        });
      }
      if (name === "camera.capture" && plugins.Camera && typeof plugins.Camera.getPhoto === "function") {
        var captureOpts = {
          resultType: typeof obj.resultType === "string" ? obj.resultType : "uri",
          source: typeof obj.source === "string" ? obj.source : "camera",
        };
        if (typeof obj.quality === "number") captureOpts.quality = obj.quality;
        if (typeof obj.allowEditing === "boolean") captureOpts.allowEditing = obj.allowEditing;
        if (typeof obj.saveToGallery === "boolean") captureOpts.saveToGallery = obj.saveToGallery;
        return plugins.Camera.getPhoto(captureOpts).then(function (photo) {
          return { ok: true, data: photo };
        });
      }
      if (name === "camera.pick" && plugins.Camera && typeof plugins.Camera.pickImages === "function") {
        var pickOpts = {};
        if (typeof obj.quality === "number") pickOpts.quality = obj.quality;
        if (typeof obj.limit === "number") pickOpts.limit = obj.limit;
        if (typeof obj.presentationStyle === "string") pickOpts.presentationStyle = obj.presentationStyle;
        return plugins.Camera.pickImages(pickOpts).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "filesystem.readFile" && plugins.Filesystem && typeof plugins.Filesystem.readFile === "function") {
        if (typeof obj.path !== "string") return Promise.resolve({ ok: false, error: "path_required" });
        var readOpts = { path: obj.path };
        if (typeof obj.directory === "string") readOpts.directory = obj.directory;
        if (typeof obj.encoding === "string") readOpts.encoding = obj.encoding;
        return plugins.Filesystem.readFile(readOpts).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "filesystem.writeFile" && plugins.Filesystem && typeof plugins.Filesystem.writeFile === "function") {
        if (typeof obj.path !== "string") return Promise.resolve({ ok: false, error: "path_required" });
        var data = typeof obj.data === "string" ? obj.data : (typeof obj.text === "string" ? obj.text : "");
        if (!data) return Promise.resolve({ ok: false, error: "data_required" });
        var writeOpts = { path: obj.path, data: data };
        if (typeof obj.directory === "string") writeOpts.directory = obj.directory;
        if (typeof obj.encoding === "string") writeOpts.encoding = obj.encoding;
        return plugins.Filesystem.writeFile(writeOpts).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "filesystem.deleteFile" && plugins.Filesystem && typeof plugins.Filesystem.deleteFile === "function") {
        if (typeof obj.path !== "string") return Promise.resolve({ ok: false, error: "path_required" });
        var deleteOpts = { path: obj.path };
        if (typeof obj.directory === "string") deleteOpts.directory = obj.directory;
        return plugins.Filesystem.deleteFile(deleteOpts).then(function () {
          return { ok: true, data: { deleted: true } };
        });
      }
      if (name === "preferences.get" && plugins.Preferences && typeof plugins.Preferences.get === "function") {
        if (typeof obj.key !== "string") return Promise.resolve({ ok: false, error: "key_required" });
        return plugins.Preferences.get({ key: obj.key }).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "preferences.set" && plugins.Preferences && typeof plugins.Preferences.set === "function") {
        if (typeof obj.key !== "string") return Promise.resolve({ ok: false, error: "key_required" });
        var value = typeof obj.value === "string" ? obj.value : (typeof obj.data === "string" ? obj.data : "");
        return plugins.Preferences.set({ key: obj.key, value: value }).then(function () {
          return { ok: true, data: { saved: true } };
        });
      }
      if (name === "preferences.remove" && plugins.Preferences && typeof plugins.Preferences.remove === "function") {
        if (typeof obj.key !== "string") return Promise.resolve({ ok: false, error: "key_required" });
        return plugins.Preferences.remove({ key: obj.key }).then(function () {
          return { ok: true, data: { removed: true } };
        });
      }
      if (name === "push.register" && plugins.PushNotifications && typeof plugins.PushNotifications.requestPermissions === "function") {
        return plugins.PushNotifications.requestPermissions().then(function (perm) {
          var granted = false;
          if (perm && typeof perm.receive === "string") granted = perm.receive === "granted";
          if (perm && typeof perm.granted === "boolean") granted = perm.granted;
          if (!granted) return { ok: false, error: "permission_denied", data: perm };
          if (typeof plugins.PushNotifications.register !== "function") return { ok: false, error: "register_unavailable" };
          return plugins.PushNotifications.register().then(function () {
            return { ok: true, data: perm };
          });
        });
      }
      if (name === "push.getDelivered" && plugins.PushNotifications && typeof plugins.PushNotifications.getDeliveredNotifications === "function") {
        return plugins.PushNotifications.getDeliveredNotifications().then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "push.removeAllDelivered" && plugins.PushNotifications && typeof plugins.PushNotifications.removeAllDeliveredNotifications === "function") {
        return plugins.PushNotifications.removeAllDeliveredNotifications().then(function () {
          return { ok: true, data: { cleared: true } };
        });
      }
      if (name === "localNotifications.schedule" && plugins.LocalNotifications && typeof plugins.LocalNotifications.schedule === "function") {
        var notifications = Array.isArray(obj.notifications) ? obj.notifications : [];
        return plugins.LocalNotifications.schedule({ notifications: notifications }).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "app.openSettings" && plugins.App && typeof plugins.App.openSettings === "function") {
        return plugins.App.openSettings().then(function () {
          return { ok: true, data: { opened: true } };
        });
      }
      if (name === "app.openUrl" && plugins.App && typeof plugins.App.openUrl === "function") {
        if (typeof obj.url !== "string") return Promise.resolve({ ok: false, error: "url_required" });
        return plugins.App.openUrl({ url: obj.url }).then(function () {
          return { ok: true, data: { opened: true } };
        });
      }
      if (name === "browser.open" && plugins.Browser && typeof plugins.Browser.open === "function") {
        if (typeof obj.url !== "string") return Promise.resolve({ ok: false, error: "url_required" });
        return plugins.Browser.open({ url: obj.url }).then(function () {
          return { ok: true, data: { opened: true } };
        });
      }
      if (name === "statusBar.setStyle" && plugins.StatusBar && typeof plugins.StatusBar.setStyle === "function") {
        var style = typeof obj.style === "string" ? obj.style : "default";
        return plugins.StatusBar.setStyle({ style: style }).then(function () {
          return { ok: true, data: { style: style } };
        });
      }
      if (name === "statusBar.setBackgroundColor" && plugins.StatusBar && typeof plugins.StatusBar.setBackgroundColor === "function") {
        if (typeof obj.color !== "string") return Promise.resolve({ ok: false, error: "color_required" });
        return plugins.StatusBar.setBackgroundColor({ color: obj.color }).then(function () {
          return { ok: true, data: { color: obj.color } };
        });
      }
      if (name === "keyboard.hide" && plugins.Keyboard && typeof plugins.Keyboard.hide === "function") {
        return plugins.Keyboard.hide().then(function () {
          return { ok: true, data: { hidden: true } };
        });
      }
      if (name === "keyboard.show" && plugins.Keyboard && typeof plugins.Keyboard.show === "function") {
        return plugins.Keyboard.show().then(function () {
          return { ok: true, data: { shown: true } };
        });
      }
      if (name === "ble.scan" && plugins.BluetoothLe) {
        var ble = plugins.BluetoothLe;
        var scanOpts = {};
        if (Array.isArray(obj.filters)) scanOpts.filters = obj.filters;
        if (Array.isArray(obj.optionalServices)) scanOpts.optionalServices = obj.optionalServices;
        if (obj.acceptAllDevices === true) scanOpts.acceptAllDevices = true;
        if (typeof ble.requestDevice === "function") {
          return ble.requestDevice(scanOpts).then(function (device) {
            return { ok: true, data: { device: device } };
          });
        }
        if (typeof ble.requestLEScan === "function") {
          return ble.requestLEScan(scanOpts).then(function (res) {
            return { ok: true, data: res };
          });
        }
        if (typeof ble.scan === "function") {
          return ble.scan(scanOpts).then(function (res) {
            return { ok: true, data: res };
          });
        }
      }
      if (name === "ble.connect" && plugins.BluetoothLe && typeof plugins.BluetoothLe.connect === "function") {
        if (typeof obj.deviceId !== "string") return Promise.resolve({ ok: false, error: "device_id_required" });
        return plugins.BluetoothLe.connect({ deviceId: obj.deviceId }).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "ble.disconnect" && plugins.BluetoothLe && typeof plugins.BluetoothLe.disconnect === "function") {
        if (typeof obj.deviceId !== "string") return Promise.resolve({ ok: false, error: "device_id_required" });
        return plugins.BluetoothLe.disconnect({ deviceId: obj.deviceId }).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "ble.read" && plugins.BluetoothLe && typeof plugins.BluetoothLe.read === "function") {
        if (typeof obj.deviceId !== "string") return Promise.resolve({ ok: false, error: "device_id_required" });
        if (typeof obj.service !== "string") return Promise.resolve({ ok: false, error: "service_required" });
        if (typeof obj.characteristic !== "string") return Promise.resolve({ ok: false, error: "characteristic_required" });
        return plugins.BluetoothLe.read({ deviceId: obj.deviceId, service: obj.service, characteristic: obj.characteristic }).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "ble.write" && plugins.BluetoothLe && typeof plugins.BluetoothLe.write === "function") {
        if (typeof obj.deviceId !== "string") return Promise.resolve({ ok: false, error: "device_id_required" });
        if (typeof obj.service !== "string") return Promise.resolve({ ok: false, error: "service_required" });
        if (typeof obj.characteristic !== "string") return Promise.resolve({ ok: false, error: "characteristic_required" });
        if (typeof obj.value !== "string") return Promise.resolve({ ok: false, error: "value_required" });
        return plugins.BluetoothLe.write({
          deviceId: obj.deviceId,
          service: obj.service,
          characteristic: obj.characteristic,
          value: obj.value,
        }).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "nfc.read" && plugins.NFC) {
        if (typeof plugins.NFC.scan === "function") {
          return plugins.NFC.scan(obj || {}).then(function (res) {
            return { ok: true, data: res };
          });
        }
        if (typeof plugins.NFC.read === "function") {
          return plugins.NFC.read(obj || {}).then(function (res) {
            return { ok: true, data: res };
          });
        }
      }
      if (name === "nfc.write" && plugins.NFC && typeof plugins.NFC.write === "function") {
        return plugins.NFC.write(obj || {}).then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "sensor.motion" && plugins.Motion && typeof plugins.Motion.getCurrent === "function") {
        return plugins.Motion.getCurrent().then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "sensor.orientation" && plugins.Motion && typeof plugins.Motion.getOrientation === "function") {
        return plugins.Motion.getOrientation().then(function (res) {
          return { ok: true, data: res };
        });
      }
      if (name === "vibrate" && plugins.Haptics) {
        if (typeof plugins.Haptics.vibrate === "function") {
          var duration = typeof args === "number" ? args : (typeof obj.duration === "number" ? obj.duration : 200);
          return plugins.Haptics.vibrate({ duration: duration }).then(function () {
            return { ok: true, data: { ok: true } };
          });
        }
        if (typeof plugins.Haptics.impact === "function") {
          return plugins.Haptics.impact({ style: "medium" }).then(function () {
            return { ok: true, data: { ok: true } };
          });
        }
      }
    } catch (err) {
      return Promise.reject(err);
    }
    return null;
  }

  function resolvePending(id, result) {
    var entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    entry.resolve(result);
    return true;
  }

  function parseMessage(data) {
    if (!data) return null;
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    if (typeof data === "object") return data;
    return null;
  }

  function handleMessage(event) {
    var msg = parseMessage(event && event.data ? event.data : event);
    if (!msg || !msg.id) return;
    resolvePending(msg.id, msg);
  }

  window.addEventListener("message", handleMessage);
  document.addEventListener("message", handleMessage);

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { resolve(""); };
        reader.readAsDataURL(file);
      } catch {
        resolve("");
      }
    });
  }

  function pickImages(options) {
    if (typeof document === "undefined") return Promise.resolve({ ok: false, error: "document_unavailable" });
    var accept = "image/*";
    var resultType = options && typeof options.resultType === "string" ? options.resultType : "uri";
    var multiple = options && options.multiple === true;
    var capture = options && options.capture === true;
    var limit = options && typeof options.limit === "number" ? Math.max(1, options.limit) : null;
    var captureMode = options && typeof options.captureMode === "string" ? options.captureMode : "environment";
    return new Promise(function (resolve) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      if (capture) input.setAttribute("capture", captureMode);
      input.onchange = function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (limit != null) files = files.slice(0, limit);
        if (!files.length) {
          resolve({ ok: false, error: "no_file_selected" });
          return;
        }
        if (resultType === "base64" || resultType === "dataUrl") {
          Promise.all(files.map(function (file) {
            return readFileAsDataUrl(file).then(function (dataUrl) {
              var base64 = "";
              if (dataUrl && typeof dataUrl === "string" && dataUrl.indexOf(",") >= 0) {
                base64 = dataUrl.split(",")[1] || "";
              }
              return {
                name: file.name,
                type: file.type,
                size: file.size,
                lastModified: file.lastModified,
                webPath: URL.createObjectURL(file),
                dataUrl: resultType === "dataUrl" ? dataUrl : undefined,
                base64: resultType === "base64" ? base64 : undefined,
              };
            });
          })).then(function (payload) {
            resolve({ ok: true, data: { file: payload[0], files: payload } });
          });
          return;
        }
        var payload = files.map(function (file) {
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            webPath: URL.createObjectURL(file),
          };
        });
        resolve({ ok: true, data: { file: payload[0], files: payload } });
      };
      input.click();
    });
  }

  function webFallback(name, args) {
    var obj = args && typeof args === "object" ? args : {};
    function hasStorage() {
      try {
        return typeof localStorage !== "undefined";
      } catch {
        return false;
      }
    }
    function getStorageKey(path) {
      return "null.fs." + path;
    }
    if (name === "device.info") {
      return Promise.resolve({
        ok: true,
        data: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          languages: navigator.languages,
          online: navigator.onLine,
        },
      });
    }
    if (name === "network.status") {
      return Promise.resolve({ ok: true, data: { online: navigator.onLine } });
    }
    if (name === "geolocation.current") {
      if (!navigator.geolocation) return Promise.resolve({ ok: false, error: "geolocation_unavailable" });
      var options = {};
      if (typeof obj.enableHighAccuracy === "boolean") options.enableHighAccuracy = obj.enableHighAccuracy;
      if (typeof obj.timeout === "number") options.timeout = obj.timeout;
      if (typeof obj.maximumAge === "number") options.maximumAge = obj.maximumAge;
      return new Promise(function (resolve) {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            resolve({
              ok: true,
              data: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
                altitudeAccuracy: pos.coords.altitudeAccuracy,
                heading: pos.coords.heading,
                speed: pos.coords.speed,
                timestamp: pos.timestamp,
              },
            });
          },
          function (err) {
            resolve({ ok: false, error: (err && err.message) || "geolocation_failed" });
          },
          options,
        );
      });
    }
    if (name === "clipboard.readText") {
      if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.resolve({ ok: false, error: "clipboard_unavailable" });
      return navigator.clipboard.readText()
        .then(function (text) { return { ok: true, data: { text: text } }; })
        .catch(function (err) { return { ok: false, error: (err && err.message) || "clipboard_failed" }; });
    }
    if (name === "clipboard.writeText") {
      var text = typeof args === "string" ? args : (typeof obj.text === "string" ? obj.text : "");
      if (!text) return Promise.resolve({ ok: false, error: "text_required" });
      if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.resolve({ ok: false, error: "clipboard_unavailable" });
      return navigator.clipboard.writeText(text)
        .then(function () { return { ok: true, data: { text: text } }; })
        .catch(function (err) { return { ok: false, error: (err && err.message) || "clipboard_failed" }; });
    }
    if (name === "share") {
      if (!navigator.share) return Promise.resolve({ ok: false, error: "share_unavailable" });
      var payload = {};
      if (typeof obj.title === "string") payload.title = obj.title;
      if (typeof obj.text === "string") payload.text = obj.text;
      if (typeof obj.url === "string") payload.url = obj.url;
      if (!payload.title && !payload.text && !payload.url) return Promise.resolve({ ok: false, error: "share_data_required" });
      return navigator.share(payload)
        .then(function () { return { ok: true, data: { shared: true } }; })
        .catch(function (err) { return { ok: false, error: (err && err.message) || "share_failed" }; });
    }
    if (name === "app.openUrl" || name === "browser.open") {
      var url = typeof obj.url === "string" ? obj.url : "";
      if (!url) return Promise.resolve({ ok: false, error: "url_required" });
      window.open(url, "_blank", "noopener,noreferrer");
      return Promise.resolve({ ok: true, data: { opened: true } });
    }
    if (name === "preferences.get") {
      var key = typeof obj.key === "string" ? obj.key : "";
      if (!key) return Promise.resolve({ ok: false, error: "key_required" });
      if (!hasStorage()) return Promise.resolve({ ok: false, error: "storage_unavailable" });
      var value = localStorage.getItem("null.pref." + key);
      return Promise.resolve({ ok: true, data: { key: key, value: value } });
    }
    if (name === "preferences.set") {
      var setKey = typeof obj.key === "string" ? obj.key : "";
      if (!setKey) return Promise.resolve({ ok: false, error: "key_required" });
      if (!hasStorage()) return Promise.resolve({ ok: false, error: "storage_unavailable" });
      var setValue = typeof obj.value === "string" ? obj.value : "";
      localStorage.setItem("null.pref." + setKey, setValue);
      return Promise.resolve({ ok: true, data: { key: setKey, value: setValue } });
    }
    if (name === "preferences.remove") {
      var removeKey = typeof obj.key === "string" ? obj.key : "";
      if (!removeKey) return Promise.resolve({ ok: false, error: "key_required" });
      if (!hasStorage()) return Promise.resolve({ ok: false, error: "storage_unavailable" });
      localStorage.removeItem("null.pref." + removeKey);
      return Promise.resolve({ ok: true, data: { key: removeKey, removed: true } });
    }
    if (name === "filesystem.readFile") {
      var readPath = typeof obj.path === "string" ? obj.path : "";
      if (!readPath) return Promise.resolve({ ok: false, error: "path_required" });
      if (!hasStorage()) return Promise.resolve({ ok: false, error: "storage_unavailable" });
      var raw = localStorage.getItem(getStorageKey(readPath));
      if (raw == null) return Promise.resolve({ ok: false, error: "file_not_found" });
      return Promise.resolve({ ok: true, data: { path: readPath, data: raw } });
    }
    if (name === "filesystem.writeFile") {
      var writePath = typeof obj.path === "string" ? obj.path : "";
      if (!writePath) return Promise.resolve({ ok: false, error: "path_required" });
      if (!hasStorage()) return Promise.resolve({ ok: false, error: "storage_unavailable" });
      var writeData = typeof obj.data === "string" ? obj.data : (typeof obj.text === "string" ? obj.text : "");
      if (!writeData) return Promise.resolve({ ok: false, error: "data_required" });
      localStorage.setItem(getStorageKey(writePath), writeData);
      return Promise.resolve({ ok: true, data: { path: writePath, bytes: writeData.length } });
    }
    if (name === "filesystem.deleteFile") {
      var deletePath = typeof obj.path === "string" ? obj.path : "";
      if (!deletePath) return Promise.resolve({ ok: false, error: "path_required" });
      if (!hasStorage()) return Promise.resolve({ ok: false, error: "storage_unavailable" });
      localStorage.removeItem(getStorageKey(deletePath));
      return Promise.resolve({ ok: true, data: { path: deletePath, deleted: true } });
    }
    if (name === "push.register") {
      if (typeof Notification === "undefined" || !Notification.requestPermission) {
        return Promise.resolve({ ok: false, error: "notification_unavailable" });
      }
      return Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") return { ok: false, error: "permission_denied" };
        return { ok: true, data: { granted: true } };
      });
    }
    if (name === "push.getDelivered") {
      return Promise.resolve({ ok: false, error: "not_supported" });
    }
    if (name === "push.removeAllDelivered") {
      return Promise.resolve({ ok: false, error: "not_supported" });
    }
    if (name === "localNotifications.schedule") {
      if (typeof Notification === "undefined") return Promise.resolve({ ok: false, error: "notification_unavailable" });
      var notifications = Array.isArray(obj.notifications) ? obj.notifications : [];
      if (!notifications.length) return Promise.resolve({ ok: false, error: "notifications_required" });
      var ensurePermission = function () {
        if (Notification.permission === "granted") return Promise.resolve("granted");
        if (Notification.permission === "denied") return Promise.resolve("denied");
        if (Notification.requestPermission) return Notification.requestPermission();
        return Promise.resolve("default");
      };
      return ensurePermission().then(function (perm) {
        if (perm !== "granted") return { ok: false, error: "permission_denied" };
        notifications.forEach(function (n) {
          var schedule = n && typeof n === "object" ? n.schedule : null;
          var delay = 0;
          if (schedule && schedule.at) {
            var at = new Date(schedule.at).getTime();
            if (!Number.isNaN(at)) delay = Math.max(0, at - Date.now());
          } else if (schedule && typeof schedule.in === "number") {
            delay = Math.max(0, schedule.in);
          }
          setTimeout(function () {
            try {
              new Notification(n.title || "Notification", { body: n.body || "", data: n.data || null });
            } catch {
              // ignore
            }
          }, delay);
        });
        return { ok: true, data: { scheduled: notifications.length } };
      });
    }
    if (name === "camera.capture") {
      return pickImages({
        capture: true,
        multiple: false,
        resultType: typeof obj.resultType === "string" ? obj.resultType : "uri",
        captureMode: typeof obj.captureMode === "string" ? obj.captureMode : "environment",
      });
    }
    if (name === "camera.pick") {
      return pickImages({
        capture: false,
        multiple: true,
        resultType: typeof obj.resultType === "string" ? obj.resultType : "uri",
        limit: typeof obj.limit === "number" ? obj.limit : undefined,
      });
    }
    if (name === "ble.scan") {
      if (obj.mock === true) {
        return Promise.resolve({ ok: true, data: { devices: [{ id: "ble_mock_1", name: "Mock BLE" }] } });
      }
      if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== "function") {
        return Promise.resolve({ ok: false, error: "ble_unavailable" });
      }
      var bleOpts = {};
      if (Array.isArray(obj.filters)) bleOpts.filters = obj.filters;
      if (Array.isArray(obj.optionalServices)) bleOpts.optionalServices = obj.optionalServices;
      if (obj.acceptAllDevices === true) bleOpts.acceptAllDevices = true;
      return navigator.bluetooth.requestDevice(bleOpts).then(function (device) {
        return { ok: true, data: { device: { id: device.id, name: device.name || "" } } };
      }).catch(function (err) {
        return { ok: false, error: (err && err.message) || "ble_failed" };
      });
    }
    if (name === "ble.connect" || name === "ble.disconnect" || name === "ble.read" || name === "ble.write") {
      if (obj.mock === true) return Promise.resolve({ ok: true, data: { mock: true } });
      return Promise.resolve({ ok: false, error: "ble_unavailable" });
    }
    if (name === "nfc.read") {
      if (obj.mock === true) return Promise.resolve({ ok: true, data: { listening: true, records: [] } });
      if (typeof window.NDEFReader === "undefined") return Promise.resolve({ ok: false, error: "nfc_unavailable" });
      try {
        var reader = new window.NDEFReader();
        return reader.scan().then(function () {
          return { ok: true, data: { listening: true } };
        }).catch(function (err) {
          return { ok: false, error: (err && err.message) || "nfc_failed" };
        });
      } catch (err) {
        return Promise.resolve({ ok: false, error: (err && err.message) || "nfc_failed" });
      }
    }
    if (name === "nfc.write") {
      if (obj.mock === true) return Promise.resolve({ ok: true, data: { written: true } });
      if (typeof window.NDEFReader === "undefined") return Promise.resolve({ ok: false, error: "nfc_unavailable" });
      try {
        var writer = new window.NDEFReader();
        if (typeof writer.write !== "function") return Promise.resolve({ ok: false, error: "nfc_write_unavailable" });
        return writer.write(obj && obj.records ? obj.records : obj).then(function () {
          return { ok: true, data: { written: true } };
        }).catch(function (err) {
          return { ok: false, error: (err && err.message) || "nfc_failed" };
        });
      } catch (err) {
        return Promise.resolve({ ok: false, error: (err && err.message) || "nfc_failed" });
      }
    }
    if (name === "sensor.motion") {
      if (obj.mock === true) {
        return Promise.resolve({ ok: true, data: { acceleration: { x: 0.01, y: 0.02, z: 9.8 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 } } });
      }
      if (!window.DeviceMotionEvent && !window.Accelerometer) return Promise.resolve({ ok: false, error: "sensor_unavailable" });
      return new Promise(function (resolve) {
        var timeoutMs = typeof obj.timeoutMs === "number" ? obj.timeoutMs : 1200;
        var done = false;
        function finish(payload) {
          if (done) return;
          done = true;
          resolve(payload);
        }
        function handler(ev) {
          var acc = ev && ev.accelerationIncludingGravity ? ev.accelerationIncludingGravity : ev.acceleration;
          var rot = ev && ev.rotationRate ? ev.rotationRate : null;
          finish({ ok: true, data: { acceleration: acc || null, rotationRate: rot || null } });
        }
        if (window.DeviceMotionEvent) {
          window.addEventListener("devicemotion", handler, { once: true });
          setTimeout(function () { finish({ ok: false, error: "sensor_timeout" }); }, timeoutMs);
          return;
        }
        finish({ ok: false, error: "sensor_unavailable" });
      });
    }
    if (name === "sensor.orientation") {
      if (obj.mock === true) {
        return Promise.resolve({ ok: true, data: { alpha: 0, beta: 0, gamma: 0, absolute: false } });
      }
      if (!window.DeviceOrientationEvent && !window.AbsoluteOrientationSensor) return Promise.resolve({ ok: false, error: "sensor_unavailable" });
      return new Promise(function (resolve) {
        var timeoutMs = typeof obj.timeoutMs === "number" ? obj.timeoutMs : 1200;
        var done = false;
        function finish(payload) {
          if (done) return;
          done = true;
          resolve(payload);
        }
        function handler(ev) {
          finish({ ok: true, data: { alpha: ev.alpha, beta: ev.beta, gamma: ev.gamma, absolute: ev.absolute === true } });
        }
        if (window.DeviceOrientationEvent) {
          window.addEventListener("deviceorientation", handler, { once: true });
          setTimeout(function () { finish({ ok: false, error: "sensor_timeout" }); }, timeoutMs);
          return;
        }
        finish({ ok: false, error: "sensor_unavailable" });
      });
    }
    if (name === "vibrate") {
      if (!navigator.vibrate) return Promise.resolve({ ok: false, error: "vibrate_unavailable" });
      var pattern = typeof args === "number" ? args : (Array.isArray(args) ? args : (obj.pattern || 200));
      var ok = navigator.vibrate(pattern);
      return Promise.resolve({ ok: true, data: { ok: ok } });
    }
    return Promise.resolve({ ok: false, error: "not_supported" });
  }

  window.__nullNativeBridge = {
    invoke: function (payload) {
      var id = makeId();
      var message = {
        id: id,
        name: payload && payload.name ? payload.name : "",
        args: payload ? payload.args : undefined,
      };
      if (message.name === "capabilities.list") {
        return Promise.resolve(listCapabilities());
      }
      if (message.name === "capabilities.version") {
        return Promise.resolve({ ok: true, data: { version: 1 } });
      }
      var capPromise = tryCapacitor(message.name, message.args);
      if (capPromise && typeof capPromise.then === "function") {
        return capPromise
          .then(normalizeResponse)
          .catch(function (err) {
            return { ok: false, error: (err && err.message) || "native_failed" };
          });
      }
      return new Promise(function (resolve) {
        var sent = sendToNative(message);
        if (sent) {
          pending.set(id, { resolve: resolve });
          setTimeout(function () {
            if (pending.has(id)) {
              pending.delete(id);
              resolve({ ok: false, error: "native_timeout" });
            }
          }, 8000);
          return;
        }
        webFallback(message.name, message.args).then(resolve);
      });
    },
    receive: function (message) {
      var msg = parseMessage(message);
      if (!msg || !msg.id) return false;
      return resolvePending(msg.id, msg);
    },
  };
})();
