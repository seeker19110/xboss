import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import PwaRegister from "@/app/components/PwaRegister";
import AppDialogs from "@/app/components/dialogs";

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
        <Script id="theme-init" strategy="beforeInteractive">{`try{var t=localStorage.getItem('xboss_theme');if(t==='light'){var e=document.documentElement;e.classList.remove('dark');e.classList.add('light');}}catch(_){}`}</Script>
      </head>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        <AppDialogs />
        {children}
        <footer className="mt-auto py-3 px-4 text-center text-[10px] text-zinc-600 border-t border-zinc-900 print:hidden">
          © {new Date().getFullYear()} XBoss — Phát triển bởi{' '}
          <span className="text-zinc-500 font-medium">Seeker</span>
          {' '}·{' '}
          <a href="mailto:liendv@live.com" className="hover:text-zinc-400 transition">liendv@live.com</a>
          {' '}·{' '}
          <a href="tel:+84977819110" className="hover:text-zinc-400 transition">0849 778 19 110</a>
        </footer>
      </body>
    </html>
  );
}
