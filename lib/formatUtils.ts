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
