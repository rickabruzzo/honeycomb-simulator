import React from "react";

export type BrandButtonVariant = "lime" | "cobalt" | "indigo" | "red" | "neutral";

interface BrandButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrandButtonVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BrandButtonVariant, string> = {
  lime: "bg-[#64BA00] hover:bg-[#4CA600] text-gray-950 focus:ring-[#64BA00]/40",
  cobalt: "bg-[#0278CD] hover:bg-[#0066BA] text-white focus:ring-[#0278CD]/40",
  indigo: "bg-[#51368D] hover:bg-[#431E80] text-white focus:ring-[#51368D]/45",
  red: "bg-[#E65B53] hover:bg-[#D75450] text-white focus:ring-[#E65B53]/40",
  neutral: "bg-white/8 hover:bg-white/12 text-white border border-white/15 focus:ring-white/10",
};

export function BrandButton({
  variant = "neutral",
  className = "",
  children,
  ...props
}: BrandButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium shadow-sm disabled:opacity-50 focus:outline-none focus:ring-2 transition-colors ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
