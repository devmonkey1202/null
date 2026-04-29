import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AnonInit from "@/components/anon-init";
import { Providers } from "@/components/providers";
import ConditionalFooter from "@/components/conditional-footer";
import GlobalNavigation from "@/components/global-navigation";
import SwRegister from "@/components/sw-register";
import NativeBridgeHost from "@/components/native-bridge-host";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-custom",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono-custom",
  display: "swap",
});

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export const metadata: Metadata = {
  title: "NULL",
  description: "행동 기반 퍼블릭 캔버스 인프라.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased flex min-h-screen flex-col">
        <Providers>
          <AnonInit />
          <NativeBridgeHost />
          <SwRegister />
          <GlobalNavigation />
          <main className="flex-1">{children}</main>
          <ConditionalFooter />
        </Providers>
      </body>
    </html>
  );
}
