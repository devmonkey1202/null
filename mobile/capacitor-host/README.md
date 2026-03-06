# NULL Capacitor Host

This is a thin Capacitor shell that loads your deployed NULL app via `server.url`.
The runtime already ships `public/native-bridge-host.js`, which now detects Capacitor plugins
and routes `nativeCall` commands to them automatically.

## Quick Start

1. From the repo root, run:

```bash
npm run mobile:cap:prepare -- --server-url https://your-null-host.example --platform all --open
```

2. (Optional) You can still edit `mobile/capacitor-host/host.config.json` directly if you prefer.

## Built-in Command Mapping

`public/native-bridge-host.js` maps these `nativeCall` commands to Capacitor plugins:

- `device.info` -> `Device.getInfo()`
- `network.status` -> `Network.getStatus()`
- `geolocation.current` -> `Geolocation.getCurrentPosition()`
- `clipboard.readText` -> `Clipboard.read()`
- `clipboard.writeText` -> `Clipboard.write({ string })`
- `share` -> `Share.share()`
- `vibrate` -> `Haptics.vibrate()` or `Haptics.impact()`
- `camera.capture` -> `Camera.getPhoto()`
- `camera.pick` -> `Camera.pickImages()`
- `filesystem.readFile` -> `Filesystem.readFile()`
- `filesystem.writeFile` -> `Filesystem.writeFile()`
- `filesystem.deleteFile` -> `Filesystem.deleteFile()`
- `preferences.get` -> `Preferences.get()`
- `preferences.set` -> `Preferences.set()`
- `preferences.remove` -> `Preferences.remove()`
- `push.register` -> `PushNotifications.requestPermissions()` + `register()`
- `push.getDelivered` -> `PushNotifications.getDeliveredNotifications()`
- `push.removeAllDelivered` -> `PushNotifications.removeAllDeliveredNotifications()`
- `localNotifications.schedule` -> `LocalNotifications.schedule()`
- `app.openSettings` -> `App.openSettings()`
- `app.openUrl` -> `App.openUrl()`
- `browser.open` -> `Browser.open()`
- `statusBar.setStyle` -> `StatusBar.setStyle()`
- `statusBar.setBackgroundColor` -> `StatusBar.setBackgroundColor()`
- `keyboard.show` -> `Keyboard.show()`
- `keyboard.hide` -> `Keyboard.hide()`

Install the matching Capacitor plugins in this host app to enable each command.

## Notes

- This host is a shell only. It does not bundle the web app. Use `server.url`.
- For additional hardware features (camera, BLE, NFC, background tasks),
  add the relevant Capacitor plugins and extend `native-bridge-host.js`.
