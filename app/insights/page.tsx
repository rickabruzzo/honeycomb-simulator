"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, Share2 } from "lucide-react";
import { InsightsContent } from "@/components/InsightsContent";
import { CopyLinkButton } from "@/components/CopyLinkButton";

export default function InsightsPage() {
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/insights/share`);
    }
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <BarChart3 size={32} className="text-[#64BA00]" />
          <h1 className="text-3xl font-bold">Training Insights</h1>
        </div>
        <p className="text-white/70 text-sm">
          Analytics and performance metrics from completed sessions. Default:
          Last 7 days.
        </p>
      </div>

      {/* Shared Link Section */}
      {shareUrl && (
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 size={18} className="text-gray-400" />
              <div>
                <p className="text-sm font-semibold text-white">
                  Share Insights
                </p>
                <p className="text-xs text-gray-400">
                  Share a clean insights view without navigation tabs
                </p>
              </div>
            </div>
            <CopyLinkButton
              url={shareUrl}
              label="Copy share link"
              variant="cobalt"
            />
          </div>
        </div>
      )}

      <InsightsContent />
    </div>
  );
}
