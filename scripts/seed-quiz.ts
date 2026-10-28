/**
 * Push the study-guide quiz bank and leader portraits from the gitignored content/ folder to KV.
 * The content never goes in the repo (it includes pre-launch material), so deployed environments
 * only see it after this runs.
 *
 *   npx tsx scripts/seed-quiz.ts            # validate, then write to KV
 *   npx tsx scripts/seed-quiz.ts --dry-run  # validate only
 *
 * KV credentials come from the environment or .env.local (KV_REST_API_* or confsim_KV_REST_API_*).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@vercel/kv";
import { loadBankFromDisk, loadPortraitFromDisk } from "../lib/quiz/disk";
import { BANK_KEY, portraitKey } from "../lib/quiz/bank";

function loadDotEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function validate(bank: NonNullable<ReturnType<typeof loadBankFromDisk>>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const q of bank.questions) {
    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    if (q.choices?.length !== 4) problems.push(`${q.id}: ${q.choices?.length ?? 0} choices`);
    const correct = q.choices?.filter((c) => c.correct === true).length ?? 0;
    if (correct !== 1) problems.push(`${q.id}: ${correct} correct choices`);
    // Partial credit: at most one "next best" choice, never the correct one, and it needs the
    // why_not that becomes its "okay, but…" explanation.
    const partial = q.choices?.filter((c) => c.partial === true).length ?? 0;
    if (partial > 1) problems.push(`${q.id}: ${partial} partial choices (max 1)`);
    q.choices?.forEach((c, i) => {
      if (!c.correct && !c.why_not) problems.push(`${q.id}: choice ${i} missing why_not`);
      if (c.partial && c.correct) problems.push(`${q.id}: choice ${i} is both correct and partial`);
    });
    if (!q.why_best) problems.push(`${q.id}: missing why_best`);
    if (!q.prompt) problems.push(`${q.id}: missing prompt`);
  }
  if (bank.questions.length < bank.questionsPerAttempt) {
    problems.push(`only ${bank.questions.length} questions; an attempt needs ${bank.questionsPerAttempt}`);
  }
  for (const l of bank.leaders) {
    if (!loadPortraitFromDisk(l.portrait)) problems.push(`leader ${l.id}: portrait ${l.portrait} not found`);
  }
  return problems;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const bank = loadBankFromDisk();
  if (!bank) throw new Error("content/study-guide/modules not found; run from the repo root with the content folder present");

  const problems = validate(bank);
  const modules = new Map<string, number>();
  for (const q of bank.questions) modules.set(q.moduleTitle, (modules.get(q.moduleTitle) ?? 0) + 1);
  console.log(`Bank ${bank.version}: ${bank.questions.length} questions, ${bank.leaders.length} leaders, gate v${bank.gateVersion}`);
  for (const [m, n] of modules) console.log(`  ${n.toString().padStart(3)}  ${m}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  loadDotEnvLocal();
  const url = process.env.KV_REST_API_URL || process.env.confsim_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.confsim_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("KV credentials not found (KV_REST_API_URL/TOKEN or confsim_KV_REST_API_URL/TOKEN)");
  const kv = createClient({ url, token });

  for (const l of bank.leaders) {
    const png = loadPortraitFromDisk(l.portrait)!;
    await kv.set(portraitKey(l.id), png.toString("base64"));
  }
  await kv.set(BANK_KEY, bank);
  console.log(`\nWrote ${BANK_KEY} and ${bank.leaders.length} portraits to ${new URL(url).host}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
