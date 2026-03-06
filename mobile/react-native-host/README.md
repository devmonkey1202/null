# NULL React Native Host

Thin React Native WebView shell that loads a deployed NULL app and forwards
`nativeCall` requests from the web runtime to native APIs.

## Quick Start

1. From the repo root, run:

```bash
npm run mobile:rn:prepare -- --server-url https://your-null-host.example
```

2. Run the app on a device or emulator as usual for React Native.

## Supported Commands (Sample)

- `device.info`
- `network.status` (NetInfo)
- `geolocation.current` (Geolocation)
- `camera.capture` / `camera.pick` (Image Picker)
- `clipboard.readText` / `clipboard.writeText` (Clipboard)
- `preferences.get` / `preferences.set` / `preferences.remove` (AsyncStorage)
- `filesystem.readFile` / `filesystem.writeFile` / `filesystem.deleteFile` (RNFS)
- `statusBar.setStyle` / `statusBar.setBackgroundColor`
- `keyboard.hide`
- `share`
- `vibrate`
- `app.openUrl` / `browser.open`
- `app.openSettings`

Other commands return `not_supported` by default.

## Notes

- This host is a shell only. It does not bundle the web app.
- Extra native features require installing and configuring the matching RN modules.
- Geolocation, camera, and filesystem require native permissions and setup per platform.
