import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOODSTORATOR TD — вредная еда против здоровой кухни",
  description:
    "Классический tower defense: сахар, чипсы и фри едут по дороге к огромному открытому рту, а башни из здоровой еды стреляют по ним. Ставь брокколи-пушки, морковных снайперов и чили-огнемёты, защищай зубы! Устанавливается на телефон, планшет и ПК.",
  applicationName: "FOODSTORATOR TD",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FOODSTORATOR TD",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1c1917",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-stone-950 text-foreground">{children}</body>
    </html>
  );
}
