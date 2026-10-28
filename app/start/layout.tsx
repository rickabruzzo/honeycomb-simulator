import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booth Training - Honeycomb Simulator",
  description: "Pick your name, take the booth quiz, then practice with a simulated attendee",
};

export default function StartLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
