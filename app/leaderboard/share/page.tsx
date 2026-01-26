"use client";

import React, { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import { LeaderboardContent } from "@/components/LeaderboardContent";
import { CopyLinkButton } from "@/components/CopyLinkButton";

export default function SharedLeaderboardPage() {
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
            <Trophy size={28} className="text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold">Leaderboard</h1>
              <p className="text-xs text-gray-400">
                Top scores from practice sessions
              </p>
            </div>
          </div>
          {shareUrl && (
            <CopyLinkButton url={shareUrl} label="Copy link" variant="cobalt" />
          )}
        </div>
      </div>

      <LeaderboardContent />
    </div>
  );
}
