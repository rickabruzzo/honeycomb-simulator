"use client";

import React, { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { InsightsContent } from "@/components/InsightsContent";
import { CopyLinkButton } from "@/components/CopyLinkButton";

export default function SharedInsightsPage() {
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* Header with copy button */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 size={28} className="text-[#64BA00]" />
            <div>
              <h1 className="text-2xl font-bold">Training Insights</h1>
              <p className="text-xs text-gray-400">
                Analytics and performance metrics from completed sessions
              </p>
            </div>
          </div>
          {shareUrl && (
            <CopyLinkButton url={shareUrl} label="Copy link" variant="cobalt" />
          )}
        </div>
      </div>

      <InsightsContent />
    </div>
  );
}
