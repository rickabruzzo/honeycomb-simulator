import type { Metadata } from "next";
import { Poppins, Roboto, Geist_Mono } from "next/font/google";
import { TopNav } from "@/components/TopNav";
import { TabsNavGate } from "@/components/TabsNavGate";
import "./globals.css";

// Brand type: Poppins for headings/display, Roboto for body (Honeycomb brand standards).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
      <body className={`${poppins.variable} ${roboto.variable} ${geistMono.variable} antialiased`}>
        <TopNav />
        <TabsNavGate />
        <main className="mx-auto max-w-6xl px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}