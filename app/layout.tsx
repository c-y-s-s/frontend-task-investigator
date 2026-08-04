import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Task Investigator｜具備來源依據的工程規劃",
  description: "將 GitHub Issue 轉換為具備來源引用、可審核的前端實作計畫。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Task Investigator",
    description: "將 GitHub Issue 轉換為具備來源依據的工程實作計畫。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Task Investigator Agent 工作流程" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-TW"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
