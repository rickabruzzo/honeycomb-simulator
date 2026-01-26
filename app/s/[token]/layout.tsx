import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Practice Session - Honeycomb Simulator",
  description: "Practice discovery conversations with AI-powered attendees",
};

export default function TraineeSessionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      {children}
    </main>
  );
}
