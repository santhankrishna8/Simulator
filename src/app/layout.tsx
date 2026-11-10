import type { Metadata, Viewport } from "next";
import "@fontsource-variable/host-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulator: an electronics bench in your browser",
  description:
    "Build circuits on a real breadboard layout with batteries, LEDs, switches, motors and a multimeter. The physics is solved live, so mistakes behave like they do on a real bench.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f9fa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
