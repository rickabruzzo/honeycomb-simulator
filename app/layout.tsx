import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Honeycomb Conference Simulator",
  description: "Practice discovery conversations with AI-powered attendees",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}>
        {/* Global App Header */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-900/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Image
                src="/brand/2021-HC-Logomark-White-RGB.svg"
                alt="Honeycomb"
                width={28}
                height={28}
                priority
              />
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight text-white">Honeycomb</div>
                <div className="text-xs text-white/70">Conference Simulator</div>
              </div>
            </div>

           <div className="text-xs text-white/50">Internal training</div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto max-w-6xl px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}