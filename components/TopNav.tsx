import React from "react";
import Image from "next/image";

export function TopNav() {
  return (
    <div className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/2021-HC-Logomark-White-RGB.svg"
            alt="Honeycomb"
            width={28}
            height={28}
            className="opacity-90"
          />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-base">Honeycomb</span>
            <span className="text-white/40">·</span>
            <span className="text-white/70 text-sm">Conference Simulator</span>
          </div>
        </div>
        <div className="text-xs text-white/50 tracking-wide">Internal training</div>
      </div>
    </div>
  );
}
