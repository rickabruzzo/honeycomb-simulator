"use client";

import React, { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useRouter } from "next/navigation";
import { Plus, Save, Archive, ExternalLink, Copy } from "lucide-react";
import { BrandButton } from "@/components/ui/BrandButton";
import { ChipInput } from "@/components/ui/ChipInput";
import type { Persona } from "@/lib/scenarioTypes";
import type { Trainee } from "@/lib/traineeStore";
import { formatTraineeFull } from "@/lib/traineeStore";
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

  // Trainees state
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedTrainee, setSelectedTrainee] = useState<Trainee | null>(null);
  const [traineeForm, setTraineeForm] = useState<{
    id?: string;
    firstName: string;
    lastName: string;
  }>({
    firstName: "",
    lastName: "",
  });

  // UI state
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  // Load data using bootstrap endpoint
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/bootstrap");
        if (res.ok) {
          const data = await res.json();
          setPersonas(data.personas || []);
          setTrainees(data.trainees || []);
          console.log(`[Editor] Loaded bootstrap data (${data._meta?.loadTimeMs}ms)`);
        }
      } catch (e) {
        console.error("Failed to load data:", e);
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
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

  const loadPersonas = async () => {
    try {
      const res = await fetch("/api/personas");
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch (e) {
      console.error("Failed to load personas:", e);
    }
  };

  const loadTrainees = async () => {
    try {
      const res = await fetch("/api/trainees");
      const data = await res.json();
      setTrainees(data.trainees || []);
    } catch (e) {
      console.error("Failed to load trainees:", e);
    }
  };

  // Individual reload functions for after save/archive operations
  const reloadBootstrap = async () => {
    try {
      const res = await fetch("/api/bootstrap");
      if (res.ok) {
        const data = await res.json();
        setPersonas(data.personas || []);
        setTrainees(data.trainees || []);
      }
    } catch (e) {
      console.error("Failed to reload data:", e);
    }
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
      await reloadBootstrap();
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

  // Archive a persona from its row. Personas are reusable assets, so this archives (reversible)
  // rather than deletes.
  const handleArchivePersona = async (persona: Persona) => {
    if (!confirm(`Archive persona "${persona.name}"? It will be hidden from lists.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/personas/${persona.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to archive persona");

      await reloadBootstrap();
      if (selectedPersona?.id === persona.id) handleNewPersona();
      setSuccessMessage("Persona archived");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to archive persona:", error);
      alert("Failed to archive persona");
    }
  };

  // Duplicate a persona into the form (as a new, unsaved persona) so the user can tweak it into a
  // variant and Save. Clearing the id means Save creates a new persona rather than overwriting.
  const handleDuplicatePersona = (persona: Persona) => {
    setSelectedPersona(null);
    setPersonaForm({
      name: "",
      personaType: persona.personaType,
      modifiers: [...persona.modifiers],
      emotionalPosture: persona.emotionalPosture,
      toolingBias: persona.toolingBias,
      otelFamiliarity: persona.otelFamiliarity,
      urls: persona.sources?.urls ? [...persona.sources.urls] : [],
      notes: persona.sources?.notes || "",
      behaviorBrief: persona.behaviorBrief || "",
    });
    setSuccessMessage(`Duplicated "${persona.name}" — tweak the fields and Save to create a variant.`);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const handleSelectTrainee = (trainee: Trainee) => {
    setSelectedTrainee(trainee);
    setTraineeForm({
      id: trainee.id,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
    });
  };

  const handleNewTrainee = () => {
    setSelectedTrainee(null);
    setTraineeForm({
      firstName: "",
      lastName: "",
    });
  };

  const handleSaveTrainee = async () => {
    if (!traineeForm.firstName.trim() || !traineeForm.lastName.trim()) {
      alert("First name and last name are required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/trainees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: traineeForm.id,
          firstName: traineeForm.firstName,
          lastName: traineeForm.lastName,
        }),
      });

      if (!response.ok) throw new Error("Failed to save trainee");

      const data = await response.json();
      await reloadBootstrap();
      setSelectedTrainee(data.trainee);
      setSuccessMessage(`Trainee "${formatTraineeFull(data.trainee)}" saved successfully!`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to save trainee:", error);
      alert("Failed to save trainee");
    } finally {
      setSaving(false);
    }
  };

  // Delete a trainee directly from its row in the list. Removes them from the list (soft-delete
  // under the hood, so their past scores keep resolving); the per-row control replaces the old
  // form-level "Archive" button, which sat confusingly next to Save.
  const handleDeleteTrainee = async (trainee: Trainee) => {
    if (!confirm(`Delete ${formatTraineeFull(trainee)}? They'll be removed from the list.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/trainees/${trainee.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete trainee");

      await reloadBootstrap();
      if (selectedTrainee?.id === trainee.id) handleNewTrainee();
      setSuccessMessage("Trainee deleted");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Failed to delete trainee:", error);
      alert("Failed to delete trainee");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Scenario Editor"
        subtitle="Create and manage personas and trainees for training scenarios"
      />

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/15 p-4 text-emerald-200">
          {successMessage}
          {selectedPersona && (
            <button
              onClick={() => {
                router.push(`/?personaId=${selectedPersona.id}`);
              }}
              className="ml-4 inline-flex items-center gap-1 text-sm underline hover:no-underline"
            >
              <ExternalLink size={14} />
              Use in Scenario Builder
            </button>
          )}
        </div>
      )}

      <div className="max-w-2xl">
        {/* Personas Section — trainees are created/managed in the Scenario Builder */}
        <div className="space-y-4">
          <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Personas</h2>
              <BrandButton onClick={handleNewPersona} variant="lime" className="text-sm">
                <Plus size={16} /> Create New
              </BrandButton>
            </div>

            {/* Persona List — Duplicate + Archive on each row (personas are reusable; no delete) */}
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {personas.map((persona) => {
                const displayTitle = buildPersonaTitle(
                  persona.personaType,
                  persona.modifiers,
                  persona.toolingBias
                );
                const isSelected = selectedPersona?.id === persona.id;
                return (
                  <div
                    key={persona.id}
                    className={`group flex items-center gap-1 rounded transition ${
                      isSelected
                        ? "bg-[#51368D] text-white"
                        : "bg-white/5 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    <button
                      onClick={() => handleSelectPersona(persona)}
                      className="flex-1 min-w-0 text-left px-3 py-2"
                    >
                      <div className="font-medium text-sm truncate">{displayTitle}</div>
                      <div className="text-xs opacity-70 truncate">
                        {persona.displaySubtitle || persona.personaType}
                      </div>
                    </button>
                    <div
                      className={`flex items-center gap-0.5 pr-1.5 shrink-0 ${
                        isSelected ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                      }`}
                    >
                      <button
                        onClick={() => handleDuplicatePersona(persona)}
                        title={`Duplicate ${persona.name}`}
                        aria-label={`Duplicate ${persona.name}`}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded transition ${
                          isSelected ? "text-white/85 hover:bg-white/20" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        onClick={() => handleArchivePersona(persona)}
                        title={`Archive ${persona.name}`}
                        aria-label={`Archive ${persona.name}`}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded transition ${
                          isSelected ? "text-white/85 hover:bg-white/20" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Archive size={15} />
                      </button>
                    </div>
                  </div>
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

              <div className="pt-2">
                <BrandButton
                  onClick={handleSavePersona}
                  disabled={saving}
                  variant="lime"
                  className="w-full justify-center"
                >
                  <Save size={16} /> {saving ? "Saving..." : "Save"}
                </BrandButton>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
