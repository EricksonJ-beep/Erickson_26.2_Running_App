import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Self-hosted so the service worker caches them — typography survives offline.
const grotesk = Space_Grotesk({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});
const inter = Inter({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Erickson 26.2",
  description: "Jon Erickson's road to Chippewa Falls 13.1 and Ashland 26.2",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Erickson 26.2"
  },
  icons: { apple: "/apple-touch-icon.png" }
};

export const viewport: Viewport = {
  themeColor: "#0A0B09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${inter.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('hr_theme_v1')==='light')document.documentElement.classList.add('light')}catch(e){}
if('serviceWorker'in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})`
          }}
        />
      </head>
      <body className="font-body antialiased min-h-screen">{children}</body>
    </html>
  );
}
