import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaInstall from './components/pwa-install';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Portfolio | 자산관리",
  description: "PC와 모바일에서 함께 관리하는 나의 자산 포트폴리오",
  applicationName: 'My Portfolio',
  appleWebApp: { capable: true, title: '내 자산', statusBarStyle: 'default' },
  icons: { icon: '/icons/portfolio-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2563eb', viewportFit: 'cover' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><PwaInstall />{children}</body>
    </html>
  );
}
