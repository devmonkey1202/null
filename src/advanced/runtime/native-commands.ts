export type NativeCommandSpec = {
  name: string;
  title: string;
  description?: string;
  argsExample?: Record<string, unknown> | string;
};

export const NATIVE_COMMANDS: NativeCommandSpec[] = [
  {
    name: "device.info",
    title: "Device Info",
    description: "Basic device metadata.",
    argsExample: {},
  },
  {
    name: "network.status",
    title: "Network Status",
    description: "Online/offline status.",
    argsExample: {},
  },
  {
    name: "geolocation.current",
    title: "Current Location",
    description: "Current geolocation coordinates.",
    argsExample: { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  },
  {
    name: "clipboard.readText",
    title: "Clipboard Read",
    description: "Read text from clipboard.",
    argsExample: {},
  },
  {
    name: "clipboard.writeText",
    title: "Clipboard Write",
    description: "Write text to clipboard.",
    argsExample: { text: "Hello" },
  },
  {
    name: "share",
    title: "Share",
    description: "Open system share sheet.",
    argsExample: { title: "Title", text: "Message", url: "https://example.com" },
  },
  {
    name: "vibrate",
    title: "Vibrate",
    description: "Vibrate or haptic feedback.",
    argsExample: { duration: 200 },
  },
  {
    name: "camera.capture",
    title: "Camera Capture",
    description: "Capture photo using camera.",
    argsExample: { resultType: "uri", source: "camera", quality: 90 },
  },
  {
    name: "camera.pick",
    title: "Camera Pick",
    description: "Pick images from gallery.",
    argsExample: { limit: 3, quality: 80 },
  },
  {
    name: "filesystem.readFile",
    title: "Filesystem Read",
    description: "Read file contents.",
    argsExample: { path: "notes.txt", directory: "DOCUMENTS", encoding: "utf8" },
  },
  {
    name: "filesystem.writeFile",
    title: "Filesystem Write",
    description: "Write file contents.",
    argsExample: { path: "notes.txt", data: "Hello", directory: "DOCUMENTS", encoding: "utf8" },
  },
  {
    name: "filesystem.deleteFile",
    title: "Filesystem Delete",
    description: "Delete file.",
    argsExample: { path: "notes.txt", directory: "DOCUMENTS" },
  },
  {
    name: "preferences.get",
    title: "Preferences Get",
    description: "Read stored preference value.",
    argsExample: { key: "theme" },
  },
  {
    name: "preferences.set",
    title: "Preferences Set",
    description: "Store preference value.",
    argsExample: { key: "theme", value: "dark" },
  },
  {
    name: "preferences.remove",
    title: "Preferences Remove",
    description: "Remove stored preference.",
    argsExample: { key: "theme" },
  },
  {
    name: "push.register",
    title: "Push Register",
    description: "Request push permission and register.",
    argsExample: {},
  },
  {
    name: "push.getDelivered",
    title: "Push Delivered",
    description: "Get delivered push notifications.",
    argsExample: {},
  },
  {
    name: "push.removeAllDelivered",
    title: "Push Clear",
    description: "Remove all delivered notifications.",
    argsExample: {},
  },
  {
    name: "localNotifications.schedule",
    title: "Local Notifications",
    description: "Schedule local notifications.",
    argsExample: {
      notifications: [
        { id: 1, title: "Hello", body: "World", schedule: { at: "2026-02-22T12:00:00.000Z" } },
      ],
    },
  },
  {
    name: "app.openSettings",
    title: "Open Settings",
    description: "Open app settings.",
    argsExample: {},
  },
  {
    name: "app.openUrl",
    title: "Open URL",
    description: "Open external URL.",
    argsExample: { url: "https://example.com" },
  },
  {
    name: "browser.open",
    title: "Browser Open",
    description: "Open browser view.",
    argsExample: { url: "https://example.com" },
  },
  {
    name: "statusBar.setStyle",
    title: "Status Bar Style",
    description: "Set status bar style.",
    argsExample: { style: "default" },
  },
  {
    name: "statusBar.setBackgroundColor",
    title: "Status Bar Color",
    description: "Set status bar background color.",
    argsExample: { color: "#ffffff" },
  },
  {
    name: "keyboard.show",
    title: "Keyboard Show",
    description: "Show keyboard.",
    argsExample: {},
  },
  {
    name: "keyboard.hide",
    title: "Keyboard Hide",
    description: "Hide keyboard.",
    argsExample: {},
  },
  {
    name: "ble.scan",
    title: "BLE Scan",
    description: "Scan Bluetooth Low Energy devices.",
    argsExample: { acceptAllDevices: true, filters: [{ services: ["battery_service"] }] },
  },
  {
    name: "ble.connect",
    title: "BLE Connect",
    description: "Connect to a BLE device.",
    argsExample: { deviceId: "device-id" },
  },
  {
    name: "ble.disconnect",
    title: "BLE Disconnect",
    description: "Disconnect BLE device.",
    argsExample: { deviceId: "device-id" },
  },
  {
    name: "ble.read",
    title: "BLE Read",
    description: "Read BLE characteristic value.",
    argsExample: { deviceId: "device-id", service: "battery_service", characteristic: "battery_level" },
  },
  {
    name: "ble.write",
    title: "BLE Write",
    description: "Write BLE characteristic value.",
    argsExample: { deviceId: "device-id", service: "custom_service", characteristic: "custom_char", value: "01ff" },
  },
  {
    name: "nfc.read",
    title: "NFC Read",
    description: "Start NFC scan and read tags.",
    argsExample: { mode: "ndef" },
  },
  {
    name: "nfc.write",
    title: "NFC Write",
    description: "Write NFC tag payload.",
    argsExample: { records: [{ type: "text", data: "Hello" }] },
  },
  {
    name: "sensor.motion",
    title: "Motion Sensor",
    description: "Sample motion sensor values.",
    argsExample: { timeoutMs: 1200 },
  },
  {
    name: "sensor.orientation",
    title: "Orientation Sensor",
    description: "Sample orientation sensor values.",
    argsExample: { timeoutMs: 1200 },
  },
];

export function findNativeCommand(name?: string | null) {
  if (!name) return undefined;
  return NATIVE_COMMANDS.find((cmd) => cmd.name === name);
}

export function formatNativeArgsExample(spec?: NativeCommandSpec | null) {
  if (!spec || spec.argsExample == null) return "";
  if (typeof spec.argsExample === "string") return spec.argsExample;
  try {
    return JSON.stringify(spec.argsExample, null, 2);
  } catch {
    return "";
  }
}
