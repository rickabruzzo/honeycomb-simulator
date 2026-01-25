"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Archive, ExternalLink } from "lucide-react";
import { BrandButton } from "@/components/ui/BrandButton";
import { ChipInput } from "@/components/ui/ChipInput";
import type { Conference, Persona } from "@/lib/scenarioTypes";
import { toSentenceCase, buildPersonaTitle } from "@/lib/formatUtils";

// Helper function to abbreviate text (first 3 words, ~20 chars max)
function abbreviate(text: string): string {
  if (!text) return "";
  const words = text.split(" ").slice(0, 3);
  const abbreviated = words.join(" ");
  return abbreviated.length > 20 ? abbreviated.substring(0, 20).trim() : abbreviated;
}

// Helper function to generate persona name from fields
// Format: [Abbreviated Job Title]: [abbr modifiers] | [abbr tooling bias]
function generatePersonaName(
  jobTitle: string,
  modifiers: string[],
  toolingBias: string
): string {
  if (!jobTitle.trim()) return "";

  const abbrJobTitle = abbreviate(jobTitle);
  const parts: string[] = [abbrJobTitle];

  // Add abbreviated modifiers (max 2)
  const maxModifiers = 2;
  const displayModifiers = modifiers.slice(0, maxModifiers).map(abbreviate);
  if (displayModifiers.length > 0) {
    parts.push(displayModifiers.join(", "));
  }

  // Add abbreviated tooling bias
  if (toolingBias.trim()) {
    if (parts.length > 1) {
      return `${parts[0]}: ${parts[1]} | ${abbreviate(toolingBias)}`;
    } else {
      return `${parts[0]} | ${abbreviate(toolingBias)}`;
    }
  }

  if (parts.length > 1) {
    return `${parts[0]}: ${parts[1]}`;
  }

  return parts[0];
}

// Helper function to generate persona subtitle
// Format: [full job title] | [full modifiers] | [full tooling bias] | [emotional posture] | OTel [familiarity]
// All in sentence case
function generatePersonaSubtitle(
  jobTitle: string,
  modifiers: string[],
  toolingBias: string,
  emotionalPosture: string,
  otelFamiliarity: string
): string {
  const parts: string[] = [];

  if (jobTitle.trim()) parts.push(toSentenceCase(jobTitle));
  if (modifiers.length > 0) parts.push(modifiers.map(toSentenceCase).join(", "));
  if (toolingBias.trim()) parts.push(toSentenceCase(toolingBias));
  if (emotionalPosture.trim()) parts.push(toSentenceCase(emotionalPosture));
  if (otelFamiliarity.trim()) {
    parts.push(`OTel ${toSentenceCase(otelFamiliarity)}`);
  }

  return parts.join(" | ");
}

export default function ScenarioEditorPage() {
  const router = useRouter();

  // Conferences state
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [selectedConference, setSelectedConference] = useState<Conference | null>(null);
  const [conferenceForm, setConferenceForm] = useState<{
    id?: string;
    name: string;
    themes: string[];
    seniorityMix: string;
    observabilityMaturity: "Low" | "Medium" | "High";
    urls: string[];
  }>({
    name: "",
    themes: [],
    seniorityMix: "",
    observabilityMaturity: "Medium",
    urls: [],
  });

  // Personas state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [personaForm, setPersonaForm] = useState<{
    id?: string;
    name: string;
    personaType: string;
    modifiers: string[];
    emotionalPosture: string;
    toolingBias: string;
    otelFamiliarity: "never" | "aware" | "considering" | "starting" | "active";
    urls: string[];
    notes: string;
    behaviorBrief: string;
  }>({
    name: "",
    personaType: "",
    modifiers: [],
    emotionalPosture: "",
    toolingBias: "",
    otelFamiliarity: "never",
    urls: [],
    notes: "",
    behaviorBrief: "",
  });

  // UI state
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Load data
  useEffect(() => {
    loadConferences();
    loadPersonas();
  }, []);

  // Auto-generate persona name when relevant fields change
  useEffect(() => {
    const generatedName = generatePersonaName(
      personaForm.personaType,
      personaForm.modifiers,
      personaForm.toolingBias
    );
    if (generatedName !== personaForm.name) {
      setPersonaForm((p) => ({ ...p, name: generatedName }));
    }
  }, [personaForm.personaType, personaForm.modifiers, personaForm.toolingBias]);

  const loadConferences = async () => {
    try {
      const res = await fetch("/api/conferences");
      const data = await res.json();
      setConferences(data.conferences || []);
    } catch (e) {
      console.error("Failed to load conferences:", e);
    }
  };

  const loadPersonas = async () => {
    try {
      const res = await fetch("/api/personas");
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch (e) {
      console.error("Failed to load personas:", e);
    }
  };

  const handleSelectConference = (conf: Conference) => {
    setSelectedConference(conf);
    setConferenceForm({
      id: conf.id,
      name: conf.name,
      themes: conf.themes,
      seniorityMix: conf.seniorityMix,
      observabilityMaturity: conf.observabilityMaturity as "Low" | "Medium" | "High",
      urls: conf.sources?.urls || [],
    });
  };

  const handleSelectPersona = (persona: Persona) => {
    setSelectedPersona(persona);
    setPersonaForm({
      id: persona.id,
      name: persona.name,
      personaType: persona.personaType,
      modifiers: persona.modifiers,
      emotionalPosture: persona.emotionalPosture,
      toolingBias: persona.toolingBias,
      otelFamiliarity: persona.otelFamiliarity,
      urls: persona.sources?.urls || [],
      notes: persona.sources?.notes || "",
      behaviorBrief: persona.behaviorBrief || "",
    });
  };

  const handleNewConference = () => {
    setSelectedConference(null);
    setConferenceForm({
      name: "",
      themes: [],
      seniorityMix: "",
      observabilityMaturity: "Medium",
      urls: [],
    });
  };

  const handleNewPersona = () => {
    setSelectedPersona(null);
    setPersonaForm({
      name: "",
      personaType: "",
      modifiers: [],
      emotionalPosture: "",
      toolingBias: "",
      otelFamiliarity: "never",
      urls: [],
      notes: "",
      behaviorBrief: "",
    });
  };

  const saveConferenceWithId = async (archiveExistingId?: string) => {
    if (!conferenceForm.name.trim()) {
      alert("Conference name is required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/conferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: conferenceForm.id,
          name: conferenceForm.name,
          themes: conferenceForm.themes,
          seniorityMix: conferenceForm.seniorityMix,
          observabilityMaturity: conferenceForm.observabilityMaturity,
          sources: conferenceForm.urls.length > 0 ? { urls: conferenceForm.urls } : undefined,
          archiveExistingId: archiveExistingId,
        }),
      });

      // Handle overwrite conflict
      if (response.status === 409) {
        const data = await response.json();
        const shouldOverwrite = confirm(
          `This will overwrite an existing Conference. Continue?`
        );

        if (shouldOverwrite) {
          // Archive existing and create new
          setSaving(false);
          return saveConferenceWithId(data.existingId);
        } else {
          setSaving(false);
          alert("Save cancelled. No changes made.");
          return;
        }
      }

      if (!response.ok) throw new Error("Failed to save conference");

      const data = await response.json();
      await loadConferences();
      setSelectedConference(data.conference);
      setSuccessMessage(`Conference "${data.conference.name}" saved successfully!`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to save conference:", error);
      alert("Failed to save conference");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConference = () => saveConferenceWithId();

  const savePersonaWithArchive = async (archiveExistingId?: string): Promise<void> => {
    if (!personaForm.personaType.trim()) {
      alert("Job title is required");
      return;
    }

    // Always use generated name
    const generatedName = generatePersonaName(
      personaForm.personaType,
      personaForm.modifiers,
      personaForm.toolingBias
    );

    setSaving(true);
    try {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: personaForm.id,
          name: generatedName,
          personaType: personaForm.personaType,
          modifiers: personaForm.modifiers,
          emotionalPosture: personaForm.emotionalPosture,
          toolingBias: personaForm.toolingBias,
          otelFamiliarity: personaForm.otelFamiliarity,
          behaviorBrief: personaForm.behaviorBrief,
          sources: {
            ...(personaForm.urls.length > 0 ? { urls: personaForm.urls } : {}),
            ...(personaForm.notes.trim() ? { notes: personaForm.notes } : {}),
          },
          archiveExistingId: archiveExistingId,
        }),
      });

      // Handle overwrite conflict
      if (response.status === 409) {
        const data = await response.json();
        const shouldOverwrite = confirm(
          `This will overwrite an existing Persona. Continue?`
        );

        if (shouldOverwrite) {
          // Archive existing and create new
          setSaving(false);
          return savePersonaWithArchive(data.existingId);
        } else {
          setSaving(false);
          alert("Save cancelled. No changes made.");
          return;
        }
      }

      if (!response.ok) throw new Error("Failed to save persona");

      const data = await response.json();
      await loadPersonas();
      setSelectedPersona(data.persona);
      setSuccessMessage(`Persona "${data.persona.name}" saved successfully!`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to save persona:", error);
      alert("Failed to save persona");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePersona = () => savePersonaWithArchive();

  const handleArchiveConference = async () => {
    if (!selectedConference) return;

    if (!confirm(`Archive conference "${selectedConference.name}"? It will be hidden from lists.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/conferences/${selectedConference.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to archive conference");

      await loadConferences();
      handleNewConference();
      setSuccessMessage("Conference archived successfully");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to archive conference:", error);
      alert("Failed to archive conference");
    }
  };

  const handleArchivePersona = async () => {
    if (!selectedPersona) return;

    if (!confirm(`Archive persona "${selectedPersona.name}"? It will be hidden from lists.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/personas/${selectedPersona.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to archive persona");

      await loadPersonas();
      handleNewPersona();
      setSuccessMessage("Persona archived successfully");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to archive persona:", error);
      alert("Failed to archive persona");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Scenario Editor</h1>
        <p className="text-white/70 text-sm">
          Create and manage conferences and personas for training scenarios
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/15 p-4 text-emerald-200">
          {successMessage}
          {(selectedConference || selectedPersona) && (
            <button
              onClick={() => {
                if (selectedConference) {
                  router.push(`/?conferenceId=${selectedConference.id}`);
                } else if (selectedPersona) {
                  router.push(`/?personaId=${selectedPersona.id}`);
                }
              }}
              className="ml-4 inline-flex items-center gap-1 text-sm underline hover:no-underline"
            >
              <ExternalLink size={14} />
              Use in Scenario Builder
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conferences Section */}
        <div className="space-y-4">
          <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Conferences</h2>
              <BrandButton onClick={handleNewConference} variant="lime" className="text-sm">
                <Plus size={16} /> Create New
              </BrandButton>
            </div>

            {/* Conference List */}
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {conferences.map((conf) => (
                <button
                  key={conf.id}
                  onClick={() => handleSelectConference(conf)}
                  className={`w-full text-left px-3 py-2 rounded transition ${
                    selectedConference?.id === conf.id
                      ? "bg-[#51368D] text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <div className="font-medium">{conf.name}</div>
                  <div className="text-xs opacity-70">{conf.themes.join(", ")}</div>
                </button>
              ))}
            </div>

            {/* Conference Form */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Conference Name *</label>
                <input
                  value={conferenceForm.name}
                  onChange={(e) => setConferenceForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., KubeCon 2024"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Themes</label>
                <ChipInput
                  value={conferenceForm.themes}
                  onChange={(themes) => setConferenceForm((p) => ({ ...p, themes }))}
                  placeholder="Type themes and press Enter"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Seniority Mix</label>
                <input
                  value={conferenceForm.seniorityMix}
                  onChange={(e) => setConferenceForm((p) => ({ ...p, seniorityMix: e.target.value }))}
                  placeholder="e.g., IC-heavy with platform leads"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Observability Maturity</label>
                <select
                  value={conferenceForm.observabilityMaturity}
                  onChange={(e) =>
                    setConferenceForm((p) => ({
                      ...p,
                      observabilityMaturity: e.target.value as "Low" | "Medium" | "High",
                    }))
                  }
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Context content</label>
                <ChipInput
                  value={conferenceForm.urls}
                  onChange={(urls) => setConferenceForm((p) => ({ ...p, urls }))}
                  placeholder="Add context URLs (website, prospectus, agenda, etc.)"
                />
              </div>

              {/* Display Name Preview */}
              {conferenceForm.name && (
                <div className="border-t border-white/10 pt-3 mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Display name preview</label>
                  <div className="text-sm text-gray-300 font-medium">{conferenceForm.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {conferenceForm.themes.length > 0 && `${conferenceForm.themes.map(toSentenceCase).join(", ")} • `}
                    {toSentenceCase(conferenceForm.observabilityMaturity)} maturity
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <BrandButton
                  onClick={handleSaveConference}
                  disabled={saving}
                  variant="lime"
                  className="flex-1"
                >
                  <Save size={16} /> {saving ? "Saving..." : "Save"}
                </BrandButton>
                {selectedConference && (
                  <BrandButton onClick={handleArchiveConference} variant="neutral">
                    <Archive size={16} /> Archive
                  </BrandButton>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Personas Section */}
        <div className="space-y-4">
          <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Personas</h2>
              <BrandButton onClick={handleNewPersona} variant="lime" className="text-sm">
                <Plus size={16} /> Create New
              </BrandButton>
            </div>

            {/* Persona List */}
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {personas.map((persona) => {
                const displayTitle = buildPersonaTitle(
                  persona.personaType,
                  persona.modifiers,
                  persona.toolingBias
                );
                return (
                  <button
                    key={persona.id}
                    onClick={() => handleSelectPersona(persona)}
                    className={`w-full text-left px-3 py-2 rounded transition ${
                      selectedPersona?.id === persona.id
                        ? "bg-[#51368D] text-white"
                        : "bg-white/5 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    <div className="font-medium text-sm line-clamp-1">{displayTitle}</div>
                    <div className="text-xs opacity-70 line-clamp-1">
                      {persona.displaySubtitle || persona.personaType}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Persona Form */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name (auto-generated)</label>
                <input
                  value={personaForm.name}
                  readOnly
                  placeholder="Fill in type and modifiers below..."
                  className="w-full bg-black/50 border border-white/10 text-gray-400 rounded px-2 py-1.5 text-sm cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Job Title *</label>
                <input
                  value={personaForm.personaType}
                  onChange={(e) => setPersonaForm((p) => ({ ...p, personaType: e.target.value }))}
                  placeholder="e.g., SRE, Director of Engineering"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Modifiers</label>
                <ChipInput
                  value={personaForm.modifiers}
                  onChange={(modifiers) => setPersonaForm((p) => ({ ...p, modifiers }))}
                  placeholder="Type modifiers and press Enter"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Emotional Posture</label>
                <input
                  value={personaForm.emotionalPosture}
                  onChange={(e) => setPersonaForm((p) => ({ ...p, emotionalPosture: e.target.value }))}
                  placeholder="e.g., Guarded, thoughtful"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Tooling Bias</label>
                <input
                  value={personaForm.toolingBias}
                  onChange={(e) => setPersonaForm((p) => ({ ...p, toolingBias: e.target.value }))}
                  placeholder="e.g., Prometheus + Grafana"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">OpenTelemetry Familiarity</label>
                <select
                  value={personaForm.otelFamiliarity}
                  onChange={(e) =>
                    setPersonaForm((p) => ({
                      ...p,
                      otelFamiliarity: e.target.value as "never" | "aware" | "considering" | "starting" | "active",
                    }))
                  }
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                >
                  <option value="never">Never heard</option>
                  <option value="aware">Aware</option>
                  <option value="considering">Considering</option>
                  <option value="starting">Starting</option>
                  <option value="active">Active user</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Context content</label>
                <ChipInput
                  value={personaForm.urls}
                  onChange={(urls) => setPersonaForm((p) => ({ ...p, urls }))}
                  placeholder="Add context URLs (reach out to PMM team for persona summary)"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
                <textarea
                  value={personaForm.notes}
                  onChange={(e) => setPersonaForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional context or notes"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30 min-h-[60px]"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Behavior Brief (optional)</label>
                <textarea
                  value={personaForm.behaviorBrief}
                  onChange={(e) => setPersonaForm((p) => ({ ...p, behaviorBrief: e.target.value }))}
                  placeholder="Brief description of persona behavior"
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30 min-h-[60px]"
                />
              </div>

              {/* Display Name Preview */}
              {personaForm.name && (
                <div className="border-t border-white/10 pt-3 mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Display name preview</label>
                  <div className="text-sm text-gray-300 font-medium">{personaForm.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {generatePersonaSubtitle(
                      personaForm.personaType,
                      personaForm.modifiers,
                      personaForm.toolingBias,
                      personaForm.emotionalPosture,
                      personaForm.otelFamiliarity
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <BrandButton
                  onClick={handleSavePersona}
                  disabled={saving}
                  variant="lime"
                  className="flex-1"
                >
                  <Save size={16} /> {saving ? "Saving..." : "Save"}
                </BrandButton>
                {selectedPersona && (
                  <BrandButton onClick={handleArchivePersona} variant="neutral">
                    <Archive size={16} /> Archive
                  </BrandButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
