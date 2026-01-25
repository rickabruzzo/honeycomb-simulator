/**
 * Convert text to sentence case (first letter uppercase, rest lowercase)
 * Preserves known acronyms: SLOs, OTel, API, CI/CD, etc.
 */
export function toSentenceCase(text: string): string {
  if (!text || text.length === 0) return "";

  // Trim whitespace
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";

  // Known acronyms to preserve
  const acronyms = ["SLOs", "SLO", "OTel", "API", "APIs", "CI/CD", "K8s", "AWS"];

  // Check if entire string is a known acronym
  for (const acronym of acronyms) {
    if (trimmed.toLowerCase() === acronym.toLowerCase()) {
      return acronym;
    }
  }

  // Special case: preserve "OTel" prefix
  if (trimmed.toLowerCase().startsWith("otel ")) {
    const rest = trimmed.slice(5);
    return `OTel ${rest.toLowerCase()}`;
  }

  // Convert first character to uppercase, rest to lowercase
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Apply sentence case to an array of strings (for themes, modifiers, etc.)
 */
export function toSentenceCaseArray(items: string[]): string[] {
  return items.map(toSentenceCase);
}

/**
 * Truncate text to max length and add ellipsis if needed
 */
export function truncateWithEllipsis(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "…";
}

/**
 * Abbreviate job title to short form
 * Maps common titles to abbreviations, otherwise uses first 2 words
 */
export function abbreviateJobTitle(jobTitle: string): string {
  if (!jobTitle) return "";

  const trimmed = jobTitle.trim();
  const lower = trimmed.toLowerCase();

  // Common abbreviations
  const abbrevMap: Record<string, string> = {
    "site reliability engineer": "SRE",
    "sre": "SRE",
    "director of engineering": "Dir Eng",
    "director engineering": "Dir Eng",
    "platform engineer": "Platform Eng",
    "platform engineering": "Platform Eng",
    "software engineer": "Software Eng",
    "devops engineer": "DevOps Eng",
    "cloud engineer": "Cloud Eng",
    "engineering manager": "Eng Manager",
  };

  if (abbrevMap[lower]) {
    return abbrevMap[lower];
  }

  // Default: use first 2 words
  const words = trimmed.split(/\s+/);
  return words.slice(0, 2).join(" ");
}

/**
 * Build persona list title for display in editor
 * Format: "[Abbrev Job Title]: [First modifier…] | [Tooling bias…]"
 */
export function buildPersonaTitle(
  jobTitle: string,
  modifiers: string[],
  toolingBias: string
): string {
  if (!jobTitle.trim()) return "";

  const abbrevTitle = abbreviateJobTitle(jobTitle);
  const parts: string[] = [abbrevTitle];

  // Add first modifier (truncated to 24 chars)
  if (modifiers.length > 0 && modifiers[0].trim()) {
    const modifier = truncateWithEllipsis(modifiers[0], 24);
    parts.push(modifier);
  }

  // Add tooling bias (truncated to 24 chars)
  if (toolingBias.trim()) {
    const tooling = truncateWithEllipsis(toolingBias, 24);

    if (parts.length > 1) {
      return `${parts[0]}: ${parts[1]} | ${tooling}`;
    } else {
      return `${parts[0]} | ${tooling}`;
    }
  }

  if (parts.length > 1) {
    return `${parts[0]}: ${parts[1]}`;
  }

  return parts[0];
}

/**
 * Build persona subtitle (full caption) in sentence case
 * Format: "[Full job title] | [Full modifiers] | [Full tooling] | [Posture] | OTel [familiarity]"
 */
export function buildPersonaSubtitle(
  jobTitle: string,
  modifiers: string[],
  toolingBias: string,
  emotionalPosture: string,
  otelFamiliarity: string
): string {
  const parts: string[] = [];

  if (jobTitle.trim()) {
    parts.push(toSentenceCase(jobTitle));
  }

  if (modifiers.length > 0) {
    const modText = modifiers.map(toSentenceCase).join(", ");
    if (modText) parts.push(modText);
  }

  if (toolingBias.trim()) {
    parts.push(toSentenceCase(toolingBias));
  }

  if (emotionalPosture.trim()) {
    parts.push(toSentenceCase(emotionalPosture));
  }

  if (otelFamiliarity.trim()) {
    parts.push(`OTel ${toSentenceCase(otelFamiliarity)}`);
  }

  return parts.join(" | ");
}
