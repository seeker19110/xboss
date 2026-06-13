import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/app/components/PwaRegister";
import AppDialogs from "@/app/components/dialogs";

export const metadata: Metadata = {
  title: "XBoss — ACMV Tracking",
  description: "Quản lý tiến độ thi công ACMV — TT AVIO Tháp A",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "XBoss" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full antialiased dark" suppressHydrationWarning>
      <head>
        {/* Gắn class theme trước khi render để không nháy màu (mặc định dark) */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{var t=localStorage.getItem('xboss_theme');if(t==='light'){var e=document.documentElement;e.classList.remove('dark');e.classList.add('light');}}catch(_){}`
        }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        <AppDialogs />
        {children}
      </body>
    </html>
  );
}
