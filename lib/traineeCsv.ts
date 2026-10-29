import { normalizeEmail, normalizedName, type Trainee } from "./traineeStore";

/**
 * CSV trainee import: parse `first,last,email` rows (header optional, email optional), then plan
 * what an import would do against the trainees already in the system. Pure functions, so the
 * admin can preview the plan before anything is saved. The route (app/api/trainees/import)
 * applies it.
 */

export interface CsvRow {
  line: number; // 1-based line in the file, for the skipped-rows list
  firstName: string;
  lastName: string;
  email: string | null; // as typed; validated when planning
  raw: string;
}

export interface ImportPlan {
  create: Array<{ firstName: string; lastName: string; email: string | null }>;
  update: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  skip: Array<{ line: number; raw: string; reason: string }>;
}

const HEADER_RE = /^(first|last|full|given|sur|e-?mail|name)/i;

/** One CSV line → trimmed cells, honoring double-quoted fields with "" escapes. */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function splitName(full: string): { firstName: string; lastName: string } {
  const at = full.lastIndexOf(" ");
  if (at < 0) return { firstName: full, lastName: "" };
  return { firstName: full.slice(0, at).trim(), lastName: full.slice(at + 1).trim() };
}

export function parseTraineeCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let sawFirstRow = false;
  // \r\n (Windows), \n, or \r alone (Excel for Mac's "CSV (Macintosh)").
  text.replace(/^﻿/, "").split(/\r\n|\r|\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const cells = splitCells(raw);
    if (!sawFirstRow) {
      sawFirstRow = true;
      // A header names its columns and holds no email; a data row with an @ is never a header.
      const isHeader = !cells.some((c) => c.includes("@")) && cells.some((c) => HEADER_RE.test(c));
      if (isHeader) return;
    }
    let row: Omit<CsvRow, "line" | "raw">;
    if (cells.length >= 3) {
      row = { firstName: cells[0], lastName: cells[1], email: cells[2] || null };
    } else if (cells.length === 2) {
      // "Name,Email" sheets: an @ in the second cell is always the email, never a last name.
      row = cells[1].includes("@")
        ? { ...splitName(cells[0]), email: cells[1] }
        : { firstName: cells[0], lastName: cells[1], email: null };
    } else {
      row = { ...splitName(cells[0] ?? ""), email: null };
    }
    rows.push({ line: i + 1, raw, ...row });
  });
  return rows;
}

export function planTraineeImport(
  rows: CsvRow[],
  existing: Array<Pick<Trainee, "id" | "firstName" | "lastName" | "email">>
): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], skip: [] };
  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();
  const byName = new Map(existing.map((t) => [normalizedName(t.firstName, t.lastName), t]));
  const byEmail = new Map(existing.filter((t) => t.email).map((t) => [t.email!, t]));

  for (const row of rows) {
    const skip = (reason: string) => plan.skip.push({ line: row.line, raw: row.raw, reason });
    if (row.firstName.includes("@") || row.lastName.includes("@")) { skip("name looks like an email"); continue; }
    if (!row.lastName) { skip("missing last name"); continue; }
    const email = row.email ? normalizeEmail(row.email) : null;
    if (row.email && !email) { skip("invalid email"); continue; }
    const nameKey = normalizedName(row.firstName, row.lastName);
    if (seenNames.has(nameKey) || (email && seenEmails.has(email))) { skip("duplicate row"); continue; }
    seenNames.add(nameKey);
    if (email) seenEmails.add(email);

    const match = byName.get(nameKey);
    const emailOwner = email ? byEmail.get(email) : undefined;
    if (emailOwner && emailOwner !== match) {
      skip(`email already belongs to ${emailOwner.firstName} ${emailOwner.lastName}`.trim());
      continue;
    }
    if (match) {
      if (email && email !== match.email) {
        plan.update.push({ id: match.id, firstName: match.firstName, lastName: match.lastName, email });
      } else skip("already in the system, no changes");
      continue;
    }
    plan.create.push({ firstName: row.firstName, lastName: row.lastName, email });
  }
  return plan;
}
