import { randomInt } from "crypto";
import { slugifyName } from "./traineeStore";

/**
 * Readable link tokens: `<name-slug>-<short random suffix>`, e.g. `rick-abruzzo-x7k2`. Used for
 * quiz links (/q/…) and practice links (/s/…) so a URL says who it's for. Lookups are by key, so
 * the older UUID tokens keep resolving unchanged.
 */

// No 0/o, 1/l/i: these get read aloud and retyped.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function suffix(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function readableToken(fullName: string, suffixLen = 4): string {
  const slug = slugifyName(fullName) || "trainee";
  return `${slug}-${suffix(suffixLen)}`;
}

/**
 * A readable token that `exists` says is free: up to 5 draws with a 4-character suffix, then an
 * 8-character one (same-name trainees share a slug, so collisions are expected, just rare).
 */
export async function uniqueToken(
  fullName: string,
  exists: (token: string) => Promise<boolean>
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const t = readableToken(fullName, 4);
    if (!(await exists(t))) return t;
  }
  return readableToken(fullName, 8);
}
