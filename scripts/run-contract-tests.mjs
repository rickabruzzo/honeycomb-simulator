/**
 * Runs the standalone contract-test scripts under lib/**\/__tests__/.
 *
 * These predate any test framework: each is a tsx script with hand-rolled
 * assertions that prints its own summary and exits 1 on failure. This runner
 * executes them all and reports which failed, so they can gate `npm run validate`.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findTests(full));
    else if (full.includes("__tests__") && full.endsWith(".test.ts")) {
      // Skip framework-style suites (describe/it) - vitest owns those.
      const src = readFileSync(full, "utf8");
      if (!/^\s*(import .*from "vitest"|describe\()/m.test(src)) out.push(full);
    }
  }
  return out;
}

const files = findTests("lib").sort();
const failed = [];

for (const file of files) {
  const res = spawnSync("npx", ["tsx", file], { encoding: "utf8" });
  const ok = res.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${file}`);
  if (!ok) {
    failed.push(file);
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    console.log(
      output
        .split("\n")
        .filter((l) => /✗|fail|Error|error/i.test(l))
        .slice(0, 8)
        .map((l) => `        ${l.trim()}`)
        .join("\n")
    );
  }
}

console.log(`\n${files.length - failed.length}/${files.length} contract test files passed`);
if (failed.length) {
  console.log(`\nFailing files:\n${failed.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
