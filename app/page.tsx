"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandButton } from "../components/ui/BrandButton";
import type { Persona } from "../lib/scenarioTypes";
import type { Trainee } from "../lib/traineeStore";
import { formatTraineeFull } from "../lib/traineeStore";

function HoneycombSimulator() {
  const searchParams = useSearchParams();

  // Selection state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [selectedTraineeId, setSelectedTraineeId] = useState<string>("");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataRefreshing, setDataRefreshing] = useState(false);

  // Invite state
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Enrichment status
  const [enrichmentProvider, setEnrichmentProvider] = useState<"openai" | "mock" | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<"fresh" | "cached" | "none">("none");

  const didLoadBootstrap = useRef(false);

  // Load personas and trainees with caching
  useEffect(() => {
    const CACHE_KEY = "hc_bootstrap_v2";
    const CACHE_TIMESTAMP_KEY = "hc_bootstrap_v2_ts";
    const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
    const isProduction = process.env.NODE_ENV === "production";
    const tsParam = searchParams?.get("ts");

    // Prevent double-fetch in StrictMode (ONLY in development)
    // In production, always allow refetch when ts param changes
    if (!isProduction && didLoadBootstrap.current && !tsParam) return;
    if (!isProduction && !tsParam) {
      didLoadBootstrap.current = true;
    }

    const loadData = async (isRefresh = false) => {
      try {
        // Try to load from sessionStorage cache first (ONLY in development)
        if (!isRefresh && !isProduction && typeof window !== "undefined") {
          const cached = sessionStorage.getItem(CACHE_KEY);
          const cachedTs = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);

          if (cached && cachedTs) {
            const age = Date.now() - parseInt(cachedTs, 10);
            const data = JSON.parse(cached);

            // Use cached data immediately
            setPersonas(data.personas || []);
            setTrainees(data.trainees || []);
            setDataLoading(false);

            // If cache is fresh enough, we're done
            if (age < CACHE_MAX_AGE_MS) {
              console.log(`[Bootstrap] Using cached data (${Math.round(age / 1000)}s old)`);
              return;
            }

            // Cache is stale, refresh in background
            console.log(`[Bootstrap] Cache stale, refreshing in background`);
            setDataRefreshing(true);
          }
        }

        // Fetch fresh data with cache-buster and no-store
        const controller = new AbortController();
        const cacheBuster = Date.now();
        const res = await fetch(`/api/bootstrap?ts=${cacheBuster}`, {
          signal: controller.signal,
          cache: "no-store"
        });

        if (res.ok) {
          const data = await res.json();

          setPersonas(data.personas || []);
          setTrainees(data.trainees || []);

          // Update cache (ONLY in development)
          if (!isProduction && typeof window !== "undefined") {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
            sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          }

          console.log(`[Bootstrap] Loaded fresh data (${data._meta?.loadTimeMs}ms)`);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("Failed to load data:", e);
        }
      } finally {
        setDataLoading(false);
        setDataRefreshing(false);
      }
    };

    loadData();

    // Add visibility change handler to refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("[Bootstrap] Tab became visible, refreshing data");
        loadData(true); // Force refresh
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Cleanup on unmount
      if (!isProduction) {
        didLoadBootstrap.current = false;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [searchParams]); // Re-run when searchParams changes (including ts param)

  // Handle query params for auto-selection (only if items exist and are not archived)
  useEffect(() => {
    const personaId = searchParams?.get("personaId");

    if (personaId && personas.some((p) => p.id === personaId)) {
      setSelectedPersonaId(personaId);
    }
  }, [searchParams, personas]);

  const handleCreateInvite = async () => {
    if (!selectedPersonaId) {
      setInviteError("Please select a persona");
      return;
    }

    if (!selectedTraineeId) {
      setInviteError("Please select a trainee");
      return;
    }

    const selectedTrainee = trainees.find((t) => t.id === selectedTraineeId);
    if (!selectedTrainee) {
      setInviteError("Selected trainee not found");
      return;
    }

    setIsCreatingInvite(true);
    setInviteError("");

    try {
      const response = await fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: selectedPersonaId,
          traineeId: selectedTraineeId,
          traineeName: formatTraineeFull(selectedTrainee),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create invite");
      }

      const data = await response.json();
      const fullUrl = `${window.location.origin}/s/${data.token}`;
      setInviteUrl(fullUrl);
      setInviteToken(data.token);

      // Update enrichment status
      if (data.enrichment) {
        setEnrichmentProvider(data.enrichment.provider);
        setEnrichmentStatus(data.enrichment.cached ? "cached" : "fresh");
      } else {
        setEnrichmentProvider(null);
        setEnrichmentStatus("none");
      }
    } catch (error: any) {
      console.error("Failed to create invite:", error);
      setInviteError(error.message || "Failed to create invite");
    } finally {
      setIsCreatingInvite(false);
    }
  };


  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scenario Builder</h1>
          <p className="text-white/70 text-sm">
            Create invite links for trainees to practice discovery conversations
          </p>
        </div>

        {enrichmentProvider && (
          <div className="text-xs text-gray-400 border border-white/10 rounded px-2 py-1">
            <span className="font-mono">
              {enrichmentProvider}
            </span>
            {" | "}
            <span className={enrichmentStatus === "fresh" ? "text-green-400" : enrichmentStatus === "cached" ? "text-blue-400" : "text-gray-500"}>
              {enrichmentStatus}
            </span>
          </div>
        )}
      </div>

      {/* Trainee Share Link */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-200">Trainee Share Link</div>
          <BrandButton
            onClick={handleCreateInvite}
            disabled={isCreatingInvite}
            variant="indigo"
            className="text-sm"
          >
            {isCreatingInvite ? "Creating..." : "Create Link"}
          </BrandButton>
        </div>

        {inviteError ? (
          <div className="mt-2 text-sm text-red-300">{inviteError}</div>
        ) : null}

        {inviteUrl ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              id="invite-link"
              value={inviteUrl}
              readOnly
              className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  const el = document.getElementById("invite-link") as HTMLInputElement | null;
                  el?.focus();
                  el?.select();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition whitespace-nowrap ${copied
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-white/10 hover:bg-white/15 text-gray-100"
                }`}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="mt-2 text-sm text-white/70">
            Create a link to send to a trainee. The trainee will not see the hidden profile.
          </div>
        )}

        {inviteToken ? (
          <div className="mt-2 text-xs text-gray-500">Token: {inviteToken}</div>
        ) : null}
      </div>

      {/* Setup Panel - Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Persona Selection */}
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
          <label className="block text-sm text-gray-300 mb-3 font-medium">
            Persona *
            {dataRefreshing && <span className="ml-2 text-xs text-gray-500">(Refreshing...)</span>}
          </label>
          <select
            value={selectedPersonaId}
            onChange={(e) => setSelectedPersonaId(e.target.value)}
            disabled={dataLoading}
            className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{dataLoading ? "Loading personas..." : "Select a persona..."}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {selectedPersonaId && (
            <div className="text-xs text-gray-400 space-y-1 pl-2 mt-3">
              {(() => {
                const persona = personas.find((p) => p.id === selectedPersonaId);
                if (!persona) return null;
                return (
                  <>
                    <div><strong>Type:</strong> {persona.personaType}</div>
                    <div><strong>Modifiers:</strong> {persona.modifiers.join(", ")}</div>
                    <div><strong>Posture:</strong> {persona.emotionalPosture}</div>
                    <div><strong>Tooling:</strong> {persona.toolingBias}</div>
                    <div><strong>OTel:</strong> {persona.otelFamiliarity}</div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Trainee Selection */}
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
          <label className="block text-sm text-gray-300 mb-3 font-medium">
            Trainee *
          </label>
          <select
            value={selectedTraineeId}
            onChange={(e) => setSelectedTraineeId(e.target.value)}
            disabled={dataLoading}
            className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{dataLoading ? "Loading trainees..." : "Select a trainee..."}</option>
            {trainees.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTraineeFull(t)}
              </option>
            ))}
          </select>

          {selectedTraineeId && (
            <div className="text-xs text-gray-400 space-y-1 pl-2 mt-3">
              <div>The trainee will practice a discovery conversation with this persona.</div>
              <div className="mt-2 text-gray-500">They will not see the persona details above.</div>
            </div>
          )}
        </div>
      </div>

      {/* Info Panel */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm text-center">
        <p className="text-gray-300 text-sm">
          Select a persona and trainee, then create a link.
          <br />
          The trainee will practice the conversation without seeing the persona profile.
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto py-20 text-center text-gray-400">Loading...</div>}>
      <HoneycombSimulator />
    </Suspense>
  );
}
