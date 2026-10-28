"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useSearchParams } from "next/navigation";
import { BrandButton } from "../components/ui/BrandButton";
import type { Persona } from "../lib/scenarioTypes";
import type { Trainee } from "../lib/traineeStore";
import { formatTraineeFull } from "../lib/traineeStore";
import type { ImportPlan } from "../lib/traineeCsv";
import { siteUrl } from "../lib/siteUrl";

function HoneycombSimulator() {
  const searchParams = useSearchParams();

  // Selection state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [selectedTraineeId, setSelectedTraineeId] = useState<string>("");
  const [trainingWheels, setTrainingWheels] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataRefreshing, setDataRefreshing] = useState(false);

  // Invite state
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Inline new-trainee creation, so a link can be made without leaving the builder
  const [newTraineeFirst, setNewTraineeFirst] = useState<string>("");
  const [newTraineeLast, setNewTraineeLast] = useState<string>("");
  const [newTraineeEmail, setNewTraineeEmail] = useState<string>("");
  const [isCreatingTrainee, setIsCreatingTrainee] = useState(false);
  const [traineeCreateError, setTraineeCreateError] = useState<string>("");
  // CSV import: preview the plan first, then commit it.
  const [csvText, setCsvText] = useState<string>("");
  const [csvName, setCsvName] = useState<string>("");
  const [csvPlan, setCsvPlan] = useState<ImportPlan | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string>("");
  const [csvDone, setCsvDone] = useState<{ created: number; updated: number } | null>(null);
  const [csvShowSkipped, setCsvShowSkipped] = useState(false);

  // Enrichment status
  const [enrichmentProvider, setEnrichmentProvider] = useState<"openai" | "anthropic" | "mock" | null>(null);
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
          trainingWheels,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create invite");
      }

      const data = await response.json();
      const fullUrl = siteUrl(`/s/${data.token}`);
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

  const handleCreateTrainee = async () => {
    const firstName = newTraineeFirst.trim();
    const lastName = newTraineeLast.trim();
    if (!firstName || !lastName) {
      setTraineeCreateError("First and last name are required");
      return;
    }

    setIsCreatingTrainee(true);
    setTraineeCreateError("");

    try {
      const email = newTraineeEmail.trim();
      const response = await fetch("/api/trainees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, ...(email ? { email } : {}) }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create trainee");
      }

      const data = await response.json();
      const created: Trainee | undefined = data.trainee;
      if (created) {
        // Add to the list and select the new trainee for this link
        setTrainees((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
        setSelectedTraineeId(created.id);
      }
      setNewTraineeFirst("");
      setNewTraineeLast("");
      setNewTraineeEmail("");
    } catch (error: any) {
      console.error("Failed to create trainee:", error);
      setTraineeCreateError(error.message || "Failed to create trainee");
    } finally {
      setIsCreatingTrainee(false);
    }
  };

  // CSV import, step 1: read the file and ask the server what it would do (nothing is saved).
  const handleCsvFile = async (file: File | undefined) => {
    setCsvPlan(null);
    setCsvDone(null);
    setCsvError("");
    setCsvShowSkipped(false);
    if (!file) return;
    setCsvBusy(true);
    try {
      const text = await file.text();
      setCsvText(text);
      setCsvName(file.name);
      const response = await fetch("/api/trainees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't read that CSV");
      setCsvPlan(data.plan);
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "Couldn't read that CSV");
    } finally {
      setCsvBusy(false);
    }
  };

  // CSV import, step 2: apply the previewed plan.
  const handleCsvCommit = async () => {
    if (!csvText || !csvPlan) return;
    setCsvBusy(true);
    setCsvError("");
    try {
      const response = await fetch("/api/trainees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, commit: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Import failed");
      setCsvDone(data.applied);
      setCsvPlan(null);
      setCsvText("");
      // Reload the list so new and updated trainees show up (bypassing the bootstrap cache).
      const refreshed = await fetch("/api/trainees?include=email").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (refreshed?.trainees) setTrainees(refreshed.trainees);
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "Import failed");
    } finally {
      setCsvBusy(false);
    }
  };

  const handleDeleteTrainee = async () => {
    if (!selectedTraineeId) return;
    const trainee = trainees.find((t) => t.id === selectedTraineeId);
    const name = trainee ? formatTraineeFull(trainee) : "this trainee";
    if (!window.confirm(`Remove ${name}? They'll be archived and hidden from the list.`)) {
      return;
    }

    const idToRemove = selectedTraineeId;
    try {
      const response = await fetch(`/api/trainees/${idToRemove}`, { method: "DELETE" });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to remove trainee");
      }
      setTrainees((prev) => prev.filter((t) => t.id !== idToRemove));
      setSelectedTraineeId("");
    } catch (error: any) {
      console.error("Failed to remove trainee:", error);
      setTraineeCreateError(error.message || "Failed to remove trainee");
    }
  };


  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="order-1 flex items-start justify-between gap-4">
        <PageHeader
          title="Scenario Builder"
          subtitle="Create invite links for trainees to practice discovery conversations"
        />

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

      {/* Create link — the final step, after a persona and trainee are chosen */}
      <div className="order-3 rounded-lg border border-white/15 bg-white/7 p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-200">Create the practice link</div>
            <div className="mt-0.5 text-sm">
              {personas.find((p) => p.id === selectedPersonaId)?.name ?? (
                <span className="text-gray-500">Pick a persona</span>
              )}
              <span className="text-gray-500"> · </span>
              {(() => {
                const t = trainees.find((t) => t.id === selectedTraineeId);
                return t ? (
                  <span className="text-gray-200">{formatTraineeFull(t)}</span>
                ) : (
                  <span className="text-gray-500">pick a trainee</span>
                );
              })()}
            </div>
          </div>
          <BrandButton
            onClick={handleCreateInvite}
            disabled={isCreatingInvite}
            variant="cobalt"
            className="text-sm shrink-0"
          >
            {isCreatingInvite ? "Creating..." : "Create Link"}
          </BrandButton>
        </div>

        {/* Training wheels toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
          <button
            type="button"
            role="switch"
            aria-checked={trainingWheels}
            onClick={() => setTrainingWheels((v) => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              trainingWheels ? "bg-[#0278cd]" : "bg-white/15"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                trainingWheels ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-gray-200">
            Training wheels
            <span className="text-gray-500">
              {" "}— reveal the attendee&apos;s details to the trainee as they earn them
            </span>
          </span>
        </label>

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
      <div className="order-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Persona Selection */}
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
          <label className="block text-sm text-gray-300 mb-3 font-medium">
            Persona *
            {dataRefreshing && <span className="ml-2 text-xs text-gray-500">(Refreshing...)</span>}
          </label>
          {dataLoading ? (
            <div className="text-sm text-gray-500">Loading personas...</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {personas.map((p) => {
                const active = selectedPersonaId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPersonaId(p.id)}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition border ${
                      active
                        ? "bg-[#0278cd] border-[#0298ec] text-white"
                        : "bg-white/5 border-white/15 text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}

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
              <div className="flex items-center justify-between">
                <span>The trainee will practice a discovery conversation with this persona.</span>
                <button
                  type="button"
                  onClick={handleDeleteTrainee}
                  className="ml-3 shrink-0 rounded border border-[#e65b53]/40 text-[#e65b53] px-2 py-1 text-xs hover:bg-[#e65b53]/10 transition"
                >
                  Remove
                </button>
              </div>
              <div className="mt-2 text-gray-500">They will not see the persona details above.</div>
              {(() => {
                const email = trainees.find((t) => t.id === selectedTraineeId)?.email;
                return email ? <div className="mt-1 text-gray-500">Email: <span className="text-gray-300">{email}</span></div> : null;
              })()}
            </div>
          )}

          {/* Inline: create a new trainee without leaving the builder */}
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-xs text-gray-400 mb-2 font-medium">Add a new trainee</div>
            {/* Names on one row, email + Add on the next: three inputs and a button don't fit the card. */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={newTraineeFirst}
                  onChange={(e) => setNewTraineeFirst(e.target.value)}
                  placeholder="First name"
                  className="min-w-0 bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
                />
                <input
                  value={newTraineeLast}
                  onChange={(e) => setNewTraineeLast(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTrainee();
                  }}
                  placeholder="Last name"
                  className="min-w-0 bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newTraineeEmail}
                  onChange={(e) => setNewTraineeEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTrainee();
                  }}
                  placeholder="Email (optional)"
                  className="min-w-0 flex-1 bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
                />
                <BrandButton
                  onClick={handleCreateTrainee}
                  disabled={isCreatingTrainee}
                  variant="lime"
                  className="shrink-0 text-sm justify-center"
                >
                  {isCreatingTrainee ? "Adding..." : "Add"}
                </BrandButton>
              </div>
            </div>
            {traineeCreateError ? (
              <div className="mt-2 text-sm text-red-300">{traineeCreateError}</div>
            ) : (
              <div className="mt-2 text-xs text-gray-500">
                Creates the trainee and selects them for this link. Email is only shown to admins.
              </div>
            )}
          </div>

          {/* CSV import: preview what would change, then import */}
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-xs text-gray-400 mb-2 font-medium">Import trainees from a CSV</div>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={csvBusy}
              onChange={(e) => {
                handleCsvFile(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-white/15 disabled:opacity-50"
            />
            <div className="mt-2 text-xs text-gray-500">
              Columns: first, last, email. A header row is fine. Matching names get their email filled in.
            </div>
            {csvError && <div className="mt-2 text-sm text-red-300">{csvError}</div>}
            {csvPlan && (
              <div className="mt-3 rounded-md border border-white/15 bg-black/20 p-3 text-sm">
                <div className="text-gray-200">
                  <span className="text-gray-400">{csvName}:</span>{" "}
                  <strong className="text-[#9ede5a]">{csvPlan.create.length} new</strong>
                  <span className="text-gray-500"> · </span>
                  <strong className="text-[#7cc6f2]">{csvPlan.update.length} updated</strong>
                  <span className="text-gray-500"> · </span>
                  <strong className="text-gray-300">{csvPlan.skip.length} skipped</strong>
                </div>
                {csvPlan.skip.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCsvShowSkipped((v) => !v)}
                    className="mt-1.5 text-xs text-gray-400 underline underline-offset-2 hover:text-white"
                  >
                    {csvShowSkipped ? "Hide" : "Show"} skipped rows
                  </button>
                )}
                {csvShowSkipped && (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-gray-400">
                    {csvPlan.skip.map((s) => (
                      <li key={s.line}>
                        <span className="text-gray-500">line {s.line}</span> · <code className="text-gray-300">{s.raw}</code> · {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <BrandButton
                    onClick={handleCsvCommit}
                    disabled={csvBusy || csvPlan.create.length + csvPlan.update.length === 0}
                    variant="lime"
                    className="text-sm justify-center"
                  >
                    {csvBusy ? "Importing..." : `Import ${csvPlan.create.length + csvPlan.update.length}`}
                  </BrandButton>
                  <button
                    type="button"
                    onClick={() => { setCsvPlan(null); setCsvText(""); }}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {csvDone && (
              <div className="mt-2 text-sm text-[#9ede5a]">
                Imported: {csvDone.created} new, {csvDone.updated} updated.
              </div>
            )}
          </div>
        </div>
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
