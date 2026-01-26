"use client";

import React, { useState, useEffect } from "react";
import { Trophy, Share2 } from "lucide-react";
import { LeaderboardContent } from "@/components/LeaderboardContent";
import { CopyLinkButton } from "@/components/CopyLinkButton";

export default function LeaderboardPage() {
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/leaderboard/share`);
    }
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy size={32} className="text-yellow-400" />
          <h1 className="text-3xl font-bold">Leaderboard</h1>
        </div>
        <p className="text-white/70 text-sm">
          Top scores from practice sessions. Default: Last 7 days, Top 20.
        </p>
      </div>

      {/* Shared Link Section */}
      {shareUrl && (
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 size={18} className="text-gray-400" />
              <div>
                <p className="text-sm font-semibold text-white">Share Leaderboard</p>
                <p className="text-xs text-gray-400">
                  Share a clean leaderboard view without navigation tabs
                </p>
              </div>
            </div>
            <CopyLinkButton url={shareUrl} label="Copy share link" variant="cobalt" />
          </div>
        </div>
      )}

      <LeaderboardContent />
    </div>
  );
}
