"use client";

import Script from "next/script";

export default function NativeBridgeHost() {
  return <Script src="/native-bridge-host.js" strategy="afterInteractive" />;
}
