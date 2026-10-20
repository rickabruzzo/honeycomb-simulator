import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booth Study Guide Quiz - Honeycomb Simulator",
  description: "Prep quiz for Honeycomb booth greeters",
};

export default function QuizLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
