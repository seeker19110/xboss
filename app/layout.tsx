import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import PwaRegister from "@/app/components/PwaRegister";
import AppDialogs from "@/app/components/dialogs";
import ToastHost from "@/app/components/Toast";
import BottomBarSpacer from "@/app/components/BottomBarSpacer";

export const metadata: Metadata = {
  title: "XBoss — ACMV Tracking",
  description: "Quản lý tiến độ thi công ACMV — TT AVIO Tháp A",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "XBoss" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full antialiased dark" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
        >{`try{var T=['dark','light','kingblue','darkblue','navy'];var t=localStorage.getItem('xboss_theme');if(t&&T.indexOf(t)>=0&&t!=='dark'){var e=document.documentElement;e.classList.remove('dark');e.classList.add(t);}}catch(_){}`}</Script>
        <Script
          id="sidebar-init"
          strategy="beforeInteractive"
        >{`try{if(localStorage.getItem('xboss_sidebar')==='1')document.documentElement.classList.add('sidebar-collapsed');}catch(_){}`}</Script>
      </head>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        <AppDialogs />
        <ToastHost />
        {children}
        <footer className="mt-auto py-3 px-4 text-center text-[10px] text-zinc-400 border-t border-zinc-900 print:hidden">
          © {new Date().getFullYear()} XBoss — Phát triển bởi{" "}
          <span className="text-zinc-200 font-medium">Seeker</span> ·{" "}
          <a href="mailto:liendv@live.com" className="hover:text-zinc-200 transition">
            liendv@live.com
          </a>{" "}
          ·{" "}
          <a href="tel:+849778 19 110" className="hover:text-zinc-200 transition">
            +849 778 19 110
          </a>
        </footer>
        {/* Chừa chỗ cho thanh cố định dưới đáy của AppHeader — chỉ ở trang chủ */}
        <BottomBarSpacer />
      </body>
    </html>
  );
}
