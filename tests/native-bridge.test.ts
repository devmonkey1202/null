// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadNativeBridge() {
  const script = readFileSync(resolve(process.cwd(), "public/native-bridge-host.js"), "utf8");
  window.eval(script);
}

describe("native bridge web fallback", () => {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalGeolocation = navigator.geolocation;
  const originalNotification = (window as any).Notification;
  const originalVibrate = navigator.vibrate;

  beforeEach(() => {
    localStorage.clear();

    (window as any).Notification = {
      permission: "default",
      requestPermission: () => Promise.resolve("granted"),
    };

    (navigator as any).geolocation = {
      getCurrentPosition: (success: (pos: any) => void) =>
        success({
          coords: { latitude: 37.5, longitude: 127.0, accuracy: 10 },
          timestamp: Date.now(),
        }),
    };

    (navigator as any).vibrate = () => true;
    URL.createObjectURL = () => "blob:fake";

    document.createElement = ((tagName: string) => {
      if (tagName === "input") {
        const input: any = {
          type: "",
          accept: "",
          multiple: false,
          files: [],
          setAttribute: () => {},
          click: () => {
            const file = { name: "photo.png", type: "image/png", size: 128, lastModified: Date.now() };
            input.files = [file];
            if (typeof input.onchange === "function") input.onchange();
          },
        };
        return input;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement;

    loadNativeBridge();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectUrl;
    (navigator as any).geolocation = originalGeolocation;
    (window as any).Notification = originalNotification;
    (navigator as any).vibrate = originalVibrate;
  });

  it("returns capabilities list", async () => {
    const res = await (window as any).__nullNativeBridge.invoke({ name: "capabilities.list" });
    expect(res.ok).toBe(true);
    const names = (res.data?.capabilities ?? []).map((c: any) => c.name);
    expect(names).toContain("camera.pick");
    expect(names).toContain("filesystem.readFile");
    expect(names).toContain("geolocation.current");
    expect(names).toContain("push.register");
    expect(names).toContain("ble.scan");
    expect(names).toContain("nfc.read");
    expect(names).toContain("sensor.motion");
  });

  it("handles camera pick fallback", async () => {
    const res = await (window as any).__nullNativeBridge.invoke({ name: "camera.pick", args: { limit: 1 } });
    expect(res.ok).toBe(true);
    expect(res.data?.file?.name).toBe("photo.png");
  });

  it("handles filesystem read/write fallback", async () => {
    const write = await (window as any).__nullNativeBridge.invoke({
      name: "filesystem.writeFile",
      args: { path: "note.txt", data: "hello" },
    });
    expect(write.ok).toBe(true);
    const read = await (window as any).__nullNativeBridge.invoke({
      name: "filesystem.readFile",
      args: { path: "note.txt" },
    });
    expect(read.ok).toBe(true);
    expect(read.data?.data).toBe("hello");
  });

  it("handles geolocation fallback", async () => {
    const res = await (window as any).__nullNativeBridge.invoke({ name: "geolocation.current", args: {} });
    expect(res.ok).toBe(true);
    expect(res.data?.lat).toBe(37.5);
  });

  it("handles push register fallback", async () => {
    const res = await (window as any).__nullNativeBridge.invoke({ name: "push.register", args: {} });
    expect(res.ok).toBe(true);
  });

  it("handles ble/nfc/sensor mock fallback", async () => {
    const ble = await (window as any).__nullNativeBridge.invoke({ name: "ble.scan", args: { mock: true } });
    expect(ble.ok).toBe(true);
    expect(ble.data?.devices?.length).toBeGreaterThan(0);

    const nfc = await (window as any).__nullNativeBridge.invoke({ name: "nfc.read", args: { mock: true } });
    expect(nfc.ok).toBe(true);
    expect(nfc.data?.listening).toBe(true);

    const motion = await (window as any).__nullNativeBridge.invoke({ name: "sensor.motion", args: { mock: true } });
    expect(motion.ok).toBe(true);
    expect(motion.data?.acceleration).toBeTruthy();
  });
});
